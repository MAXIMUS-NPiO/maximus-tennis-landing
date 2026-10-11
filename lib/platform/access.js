/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/**
 * Roles and access — SERVER ONLY (APP-011, APP-012, APP-013, APP-018, APP-019, APP-024).
 *
 *   • Client roles (player / parent / coach) describe how one account is used. They grant nothing
 *     over anyone else's data. Member / partner rights are never derived from a role.
 *   • A parent manages private junior profiles it created; a GuardianRelationship records the
 *     basis, state and history. "I am the parent" never attaches an existing profile.
 *   • A coach sees a client only through an invitation the client (or the child's guardian)
 *     issued, with an explicit scope, an expiry and a revocation that takes effect on the next
 *     server request. Self-declared coach ≠ verified coach.
 *   • Operational capabilities (support, sales, manufacturing, finance, administrator, owner) are
 *     assignments made by an owner and audited. Nobody is superadmin by default.
 *   • Every check is server-side: subject, object, action and organisation scope. A foreign
 *     object answers 404 so that identifiers cannot be enumerated.
 */
import { newId, randomToken, sha256 } from "./ids";
import { ApiError, notFound, forbidden, badRequest, conflict, validationError } from "./errors";
import { validate, text, email as emailSpec, oneOf, many, bool, int } from "./validate";
import { auditWrites, mergeCommits } from "./audit";
import { normalizeEmail } from "./identity";

export const AGE_BANDS = ["u10", "u14", "u18", "adult"];
export const COACH_SCOPES = ["configurations:read", "configurations:propose", "comments:write"];
export const OPERATIONAL_ROLES = ["support", "sales", "manufacturing", "finance", "administrator", "owner"];
export const ORGANIZATION = "maximus-tennis";

const CAPS = {
  support: ["requests:read", "requests:respond", "requests:transition", "users:read_basic", "notifications:read"],
  sales: ["requests:read", "quotes:read", "quotes:issue", "pricebook:read", "orders:read"],
  manufacturing: ["reviews:decide", "specifications:read", "configurations:read_all", "orders:read_production", "orders:transition_production"],
  finance: ["payments:confirm", "payments:refund", "reconciliation:read", "ledger:read", "orders:read", "orders:transition_finance", "funding:read"],
  administrator: [],
  owner: ["roles:assign", "flags:read", "pricebook:approve", "funding:approve"],
};
CAPS.administrator = [...new Set([...CAPS.support, ...CAPS.sales, ...CAPS.manufacturing, ...CAPS.finance, "roles:read", "orders:transition", "documents:retry", "stock:manage", "users:manage", "audit:read", "requests:decide", "partners:approve"])];
CAPS.owner = [...new Set([...CAPS.administrator, ...CAPS.owner])];

export function capabilitiesFor(opsRoles) {
  const out = new Set();
  for (const r of opsRoles || []) for (const c of CAPS[r] || []) out.add(c);
  return out;
}

export function createAccess({ store, mailer, now = () => Date.now(), publicBaseUrl = "https://maximus.tennis" }) {
  const iso = (ms) => new Date(ms).toISOString();

  /* ------------------------------------------------------------ operational roles */

  async function opsRolesOf(userId) {
    const ids = await store.listIndex(`roles:user:${userId}`, { limit: 50 });
    const rows = await store.getMany("role", ids);
    return rows.filter((r) => !r.doc.revokedAt).map((r) => r.doc.role);
  }

  async function assignRole({ actor, userId, role, reason }, { correlationId } = {}) {
    if (!OPERATIONAL_ROLES.includes(role)) throw validationError({ role: "invalid_choice" });
    if (!reason || String(reason).trim().length < 3) throw validationError({ reason: "required" });
    const at = now();
    const id = newId("rol");
    const doc = { id, userId, role, organizationId: ORGANIZATION, grantedByUserId: actor.userId, reason: String(reason).slice(0, 500), createdAt: iso(at), revokedAt: null };
    await store.commit(mergeCommits(
      { writes: [{ type: "role", id, doc, expectedVersion: -1 }], uniques: [{ name: "role_active", value: `${userId}:${role}`, owner: id }], indexes: [{ name: `roles:user:${userId}`, member: id, score: at }, { name: "roles:all", member: id, score: at }] },
      auditWrites({ now: at, actor, action: "role.assigned", objectType: "user", objectId: userId, reason, correlationId, meta: { role } })
    ));
    return doc;
  }

  async function revokeRole({ actor, userId, role, reason }, { correlationId } = {}) {
    const id = await store.getUnique("role_active", `${userId}:${role}`);
    if (!id) throw notFound();
    const rec = await store.get("role", id);
    const at = now();
    await store.commit(mergeCommits(
      { writes: [{ type: "role", id, doc: { ...rec.doc, revokedAt: iso(at), revokedReason: String(reason || "").slice(0, 500) }, expectedVersion: rec.version }] },
      auditWrites({ now: at, actor, action: "role.revoked", objectType: "user", objectId: userId, reason, correlationId, meta: { role } })
    ));
    await store.releaseUnique("role_active", `${userId}:${role}`);
    return { revoked: true };
  }

  /** Bootstrap: the configured owner addresses receive the owner role when they exist and are verified. */
  async function ensureOwner(user, ownerEmails, { correlationId } = {}) {
    if (!ownerEmails.includes(user.emailNormalized) || user.status !== "active") return false;
    const existing = await store.getUnique("role_active", `${user.id}:owner`);
    if (existing) return false;
    await assignRole({ actor: { kind: "system" }, userId: user.id, role: "owner", reason: "PLATFORM_OWNER_EMAILS bootstrap" }, { correlationId });
    return true;
  }

  /* ------------------------------------------------------------ subject context */

  async function context(user, session) {
    const opsRoles = await opsRolesOf(user.id);
    return {
      userId: user.id,
      roles: user.roles || [],
      opsRoles,
      capabilities: capabilitiesFor(opsRoles),
      emailVerified: user.status !== "pending_verification",
      accountStatus: user.status,
      organizationId: ORGANIZATION,
      session: session ? { id: session.id, platform: session.platform, mfaLevel: session.mfaLevel, reauthAt: session.reauthAt } : null,
      locale: user.locale || "en",
      email: user.emailDisplay,
      emailNormalized: user.emailNormalized,
    };
  }

  const can = (ctx, capability) => !!(ctx && ctx.capabilities && ctx.capabilities.has(capability));
  function requireCap(ctx, capability) {
    if (!can(ctx, capability)) throw forbidden("capability_required", { details: { capability } });
  }

  /* ------------------------------------------------------------ profiles and guardianship */

  async function ensureSelfProfile(user) {
    const existing = await store.getUnique("profile_self", user.id);
    if (existing) return (await store.get("profile", existing)).doc;
    const at = now();
    const id = newId("prf");
    const doc = { id, kind: "adult_self", ownerUserId: user.id, displayName: user.displayName, ageBand: "adult", createdAt: iso(at), updatedAt: iso(at), archivedAt: null };
    try {
      await store.commit({ writes: [{ type: "profile", id, doc, expectedVersion: -1 }], uniques: [{ name: "profile_self", value: user.id, owner: id }], indexes: [{ name: `profiles:user:${user.id}`, member: id, score: at }] });
    } catch (e) {
      if (e && e.code === "unique_conflict") return (await store.get("profile", await store.getUnique("profile_self", user.id))).doc;
      throw e;
    }
    return doc;
  }

  const JUNIOR_FIELDS = { displayName: text(60, { required: true, min: 1 }), ageBand: oneOf(["u10", "u14", "u18"]) };

  async function createJuniorProfile({ ctx, input }, { correlationId } = {}) {
    if (!ctx.roles.includes("parent")) throw forbidden("role_parent_required");
    const r = validate(JUNIOR_FIELDS, input);
    if (!r.ok) throw validationError(r.errors);
    const at = now();
    const id = newId("prf");
    const relId = newId("grd");
    const doc = { id, kind: "junior_managed", ownerUserId: null, displayName: r.value.displayName, ageBand: r.value.ageBand || null, createdAt: iso(at), updatedAt: iso(at), archivedAt: null };
    const rel = { id: relId, guardianUserId: ctx.userId, childProfileId: id, basis: "managed_profile_created_by_guardian", status: "active", history: [{ at: iso(at), action: "created", actorUserId: ctx.userId }], createdAt: iso(at), updatedAt: iso(at) };
    await store.commit(mergeCommits(
      {
        writes: [{ type: "profile", id, doc, expectedVersion: -1 }, { type: "guardian", id: relId, doc: rel, expectedVersion: -1 }],
        uniques: [{ name: "guardian", value: `${ctx.userId}:${id}`, owner: relId }],
        indexes: [{ name: `profiles:user:${ctx.userId}`, member: id, score: at }, { name: `guardians:user:${ctx.userId}`, member: relId, score: at }, { name: `guardians:profile:${id}`, member: relId, score: at }],
      },
      auditWrites({ now: at, actor: { userId: ctx.userId }, action: "profile.junior_created", objectType: "profile", objectId: id, correlationId })
    ));
    return { profile: doc, guardian: rel };
  }

  async function guardianRelationships(userId) {
    const ids = await store.listIndex(`guardians:user:${userId}`, { limit: 100 });
    return (await store.getMany("guardian", ids)).map((r) => r.doc);
  }

  async function guardiansOfProfile(profileId) {
    const ids = await store.listIndex(`guardians:profile:${profileId}`, { limit: 20 });
    return (await store.getMany("guardian", ids)).map((r) => r.doc).filter((g) => g.status === "active");
  }

  async function revokeGuardian({ ctx, relationshipId, reason }, { correlationId } = {}) {
    const rec = await store.get("guardian", relationshipId);
    if (!rec || rec.doc.guardianUserId !== ctx.userId) throw notFound();
    const at = now();
    const doc = { ...rec.doc, status: "revoked", updatedAt: iso(at), history: [...rec.doc.history, { at: iso(at), action: "revoked", actorUserId: ctx.userId, reason: String(reason || "").slice(0, 200) }] };
    await store.commit(mergeCommits({ writes: [{ type: "guardian", id: relationshipId, doc, expectedVersion: rec.version }] }, auditWrites({ now: at, actor: { userId: ctx.userId }, action: "guardian.revoked", objectType: "profile", objectId: rec.doc.childProfileId, reason, correlationId })));
    return doc;
  }

  /** Disputes, transfers and a second guardian are a controlled process: recorded, not auto-resolved. */
  async function flagGuardianDispute({ ctx, relationshipId, note }, { correlationId } = {}) {
    const rec = await store.get("guardian", relationshipId);
    if (!rec || rec.doc.guardianUserId !== ctx.userId) throw notFound();
    const at = now();
    const doc = { ...rec.doc, status: "disputed", updatedAt: iso(at), history: [...rec.doc.history, { at: iso(at), action: "disputed", actorUserId: ctx.userId, note: String(note || "").slice(0, 500) }] };
    await store.commit(mergeCommits({ writes: [{ type: "guardian", id: relationshipId, doc, expectedVersion: rec.version }], indexes: [{ name: "admin:guardian_disputes", member: relationshipId, score: at }] }, auditWrites({ now: at, actor: { userId: ctx.userId }, action: "guardian.disputed", objectType: "profile", objectId: rec.doc.childProfileId, correlationId })));
    return doc;
  }

  /** Profiles the subject controls: its own adult profile and the junior profiles it actively manages. */
  async function controlledProfileIds(ctx) {
    const own = await store.getUnique("profile_self", ctx.userId);
    const rels = await guardianRelationships(ctx.userId);
    return new Set([...(own ? [own] : []), ...rels.filter((g) => g.status === "active").map((g) => g.childProfileId)]);
  }

  async function listProfiles(ctx) {
    const ids = [...(await controlledProfileIds(ctx))];
    const rows = await store.getMany("profile", ids);
    const rels = await guardianRelationships(ctx.userId);
    return rows.map((r) => ({ ...r.doc, control: r.doc.kind === "adult_self" ? "self" : "guardian", guardianRelationship: rels.find((g) => g.childProfileId === r.doc.id) || null }));
  }

  /* ------------------------------------------------------------ coach invitations and grants */

  const INVITE_FIELDS = { profileId: text(40, { required: true }), coachEmail: emailSpec({ required: true }), scope: many(COACH_SCOPES, 3, { required: true }), expiresInDays: int(1, 365) };

  async function inviteCoach({ ctx, input }, { correlationId } = {}) {
    const r = validate(INVITE_FIELDS, input);
    if (!r.ok) throw validationError(r.errors);
    const controlled = await controlledProfileIds(ctx);
    if (!controlled.has(r.value.profileId)) throw notFound();
    const at = now();
    const id = newId("inv");
    const raw = randomToken(24);
    const coachEmail = normalizeEmail(r.value.coachEmail);
    if (coachEmail === ctx.emailNormalized) throw validationError({ coachEmail: "invalid" });
    const expiresAt = iso(at + (r.value.expiresInDays || 14) * 24 * 3600 * 1000);
    const doc = { id, inviterUserId: ctx.userId, profileId: r.value.profileId, coachEmailNormalized: coachEmail, scope: r.value.scope, tokenHash: sha256(raw), status: "pending", createdAt: iso(at), expiresAt, acceptedByUserId: null, grantId: null };
    await store.commit(mergeCommits(
      { writes: [{ type: "invitation", id, doc, expectedVersion: -1 }], indexes: [{ name: `invitations:profile:${r.value.profileId}`, member: id, score: at }, { name: `invitations:inviter:${ctx.userId}`, member: id, score: at }, { name: `invitations:coach:${sha256(coachEmail)}`, member: id, score: at }] },
      auditWrites({ now: at, actor: { userId: ctx.userId }, action: "coach.invited", objectType: "profile", objectId: r.value.profileId, correlationId, meta: { scope: r.value.scope } })
    ));
    const profile = await store.get("profile", r.value.profileId);
    await mailer.send({ to: r.value.coachEmail.trim(), templateKey: "coach_invitation", locale: ctx.locale, params: { link: `${publicBaseUrl}/${ctx.locale}/account/family?invite=${raw}`, scope: r.value.scope, profileName: profile ? profile.doc.displayName : "" }, dedupeKey: `invite:${id}` }).catch(() => {});
    return { invitation: publicInvitation(doc), inviteToken: process.env.NODE_ENV === "production" ? undefined : raw };
  }

  function publicInvitation(d) {
    return { id: d.id, profileId: d.profileId, scope: d.scope, status: d.status, createdAt: d.createdAt, expiresAt: d.expiresAt, acceptedByUserId: d.acceptedByUserId, grantId: d.grantId };
  }

  async function acceptInvitation({ ctx, token }, { correlationId } = {}) {
    if (!ctx.emailVerified) throw forbidden("email_verification_required");
    const at = now();
    if (typeof token !== "string" || token.length < 16) throw badRequest("invitation_invalid");
    const ids = await store.listIndex(`invitations:coach:${sha256(ctx.emailNormalized)}`, { limit: 100 });
    const rows = await store.getMany("invitation", ids);
    const hash = sha256(token);
    const rec = rows.find((r) => r.doc.tokenHash === hash);
    if (!rec || rec.doc.status !== "pending" || Date.parse(rec.doc.expiresAt) <= at) throw badRequest("invitation_invalid");
    if (rec.doc.coachEmailNormalized !== ctx.emailNormalized) throw badRequest("invitation_invalid");
    const grantId = newId("grt");
    const grant = { id: grantId, coachUserId: ctx.userId, profileId: rec.doc.profileId, scope: rec.doc.scope, grantedByUserId: rec.doc.inviterUserId, invitationId: rec.id, status: "active", createdAt: iso(at), expiresAt: null, revokedAt: null };
    const inv = { ...rec.doc, status: "accepted", acceptedByUserId: ctx.userId, acceptedAt: iso(at), grantId };
    try {
      await store.commit(mergeCommits(
        {
          writes: [{ type: "invitation", id: rec.id, doc: inv, expectedVersion: rec.version }, { type: "grant", id: grantId, doc: grant, expectedVersion: -1 }],
          uniques: [{ name: "grant_active", value: `${ctx.userId}:${rec.doc.profileId}`, owner: grantId }],
          indexes: [{ name: `grants:coach:${ctx.userId}`, member: grantId, score: at }, { name: `grants:profile:${rec.doc.profileId}`, member: grantId, score: at }],
        },
        auditWrites({ now: at, actor: { userId: ctx.userId }, action: "coach.grant_accepted", objectType: "profile", objectId: rec.doc.profileId, correlationId, meta: { scope: rec.doc.scope } })
      ));
    } catch (e) {
      if (e && (e.code === "version_conflict" || e.code === "unique_conflict")) throw conflict("invitation_already_used");
      throw e;
    }
    return grant;
  }

  async function declineInvitation({ ctx, invitationId }, { correlationId } = {}) {
    const rec = await store.get("invitation", invitationId);
    if (!rec || rec.doc.coachEmailNormalized !== ctx.emailNormalized) throw notFound();
    if (rec.doc.status !== "pending") throw conflict("invitation_not_pending");
    const at = now();
    await store.commit(mergeCommits({ writes: [{ type: "invitation", id: invitationId, doc: { ...rec.doc, status: "declined", declinedAt: iso(at) }, expectedVersion: rec.version }] }, auditWrites({ now: at, actor: { userId: ctx.userId }, action: "coach.invitation_declined", objectType: "profile", objectId: rec.doc.profileId, correlationId })));
    return { declined: true };
  }

  async function revokeInvitation({ ctx, invitationId, reason }, { correlationId } = {}) {
    const rec = await store.get("invitation", invitationId);
    if (!rec || rec.doc.inviterUserId !== ctx.userId) throw notFound();
    const at = now();
    const writes = [{ type: "invitation", id: invitationId, doc: { ...rec.doc, status: "revoked", revokedAt: iso(at) }, expectedVersion: rec.version }];
    let released = null;
    if (rec.doc.grantId) {
      const g = await store.get("grant", rec.doc.grantId);
      if (g && g.doc.status === "active") {
        writes.push({ type: "grant", id: rec.doc.grantId, doc: { ...g.doc, status: "revoked", revokedAt: iso(at), revokedReason: String(reason || "").slice(0, 200) }, expectedVersion: g.version });
        released = `${g.doc.coachUserId}:${g.doc.profileId}`;
      }
    }
    await store.commit(mergeCommits({ writes }, auditWrites({ now: at, actor: { userId: ctx.userId }, action: "coach.access_revoked", objectType: "profile", objectId: rec.doc.profileId, reason, correlationId })));
    if (released) await store.releaseUnique("grant_active", released);
    return { revoked: true };
  }

  async function revokeGrant({ ctx, grantId, reason }, { correlationId } = {}) {
    const g = await store.get("grant", grantId);
    if (!g) throw notFound();
    const controlled = await controlledProfileIds(ctx);
    const isCoach = g.doc.coachUserId === ctx.userId;
    if (!controlled.has(g.doc.profileId) && !isCoach) throw notFound();
    if (g.doc.status !== "active") return { revoked: false };
    const at = now();
    await store.commit(mergeCommits({ writes: [{ type: "grant", id: grantId, doc: { ...g.doc, status: "revoked", revokedAt: iso(at), revokedByUserId: ctx.userId, revokedReason: String(reason || "").slice(0, 200) }, expectedVersion: g.version }] }, auditWrites({ now: at, actor: { userId: ctx.userId }, action: "coach.access_revoked", objectType: "profile", objectId: g.doc.profileId, reason, correlationId })));
    await store.releaseUnique("grant_active", `${g.doc.coachUserId}:${g.doc.profileId}`);
    return { revoked: true };
  }

  async function grantsForCoach(userId) {
    const ids = await store.listIndex(`grants:coach:${userId}`, { limit: 200 });
    const at = now();
    return (await store.getMany("grant", ids)).map((r) => r.doc).filter((g) => g.status === "active" && (!g.expiresAt || Date.parse(g.expiresAt) > at));
  }

  async function grantsForProfile(profileId) {
    const ids = await store.listIndex(`grants:profile:${profileId}`, { limit: 100 });
    return (await store.getMany("grant", ids)).map((r) => r.doc);
  }

  async function invitationsForInviter(userId) {
    const ids = await store.listIndex(`invitations:inviter:${userId}`, { limit: 100 });
    return (await store.getMany("invitation", ids)).map((r) => publicInvitation(r.doc));
  }

  async function invitationsForCoach(ctx) {
    const ids = await store.listIndex(`invitations:coach:${sha256(ctx.emailNormalized)}`, { limit: 100 });
    const at = now();
    const rows = await store.getMany("invitation", ids);
    const out = [];
    for (const r of rows) {
      if (r.doc.status !== "pending" || Date.parse(r.doc.expiresAt) <= at) continue;
      const p = await store.get("profile", r.doc.profileId);
      out.push({ ...publicInvitation(r.doc), profileName: p ? p.doc.displayName : null });
    }
    return out;
  }

  /* ------------------------------------------------------------ authorisation of resources */

  /**
   * Decides whether `ctx` may perform `action` on a resource. Resources carry `ownerUserId`
   * (the account that owns them) and optionally `profileId` (the player profile they belong to).
   * Actions: read · write · purchase · documents · funding.
   * Returns { allowed, via } — `via` names the basis (owner, guardian, coach:<scope>, capability).
   */
  async function decide(ctx, resource, action) {
    if (!resource) return { allowed: false };
    if (resource.ownerUserId && resource.ownerUserId === ctx.userId) return { allowed: true, via: "owner" };
    if (resource.profileId) {
      const controlled = await controlledProfileIds(ctx);
      if (controlled.has(resource.profileId)) {
        // A junior profile's guardian may do everything the owner may, except that funding is never
        // accepted on a child's behalf (APP-020) — a guardian's own account would hold funding instead.
        if (action === "funding") return { allowed: false, reason: "child_profile_cannot_accept_funding" };
        return { allowed: true, via: "guardian" };
      }
      if (action === "read" || action === "propose") {
        const grants = await grantsForCoach(ctx.userId);
        const g = grants.find((x) => x.profileId === resource.profileId);
        if (g) {
          const needed = action === "read" ? "configurations:read" : "configurations:propose";
          if (g.scope.includes(needed) && resource.kind === "configuration") return { allowed: true, via: `coach:${needed}` };
        }
      }
    }
    const capMap = { read: resource.readCapability, write: resource.writeCapability };
    const cap = capMap[action];
    if (cap && can(ctx, cap)) return { allowed: true, via: `capability:${cap}` };
    return { allowed: false };
  }

  /** Throws 404 for a resource the subject may not see, 403 for one it may see but not act on. */
  async function authorize(ctx, resource, action) {
    const d = await decide(ctx, resource, action);
    if (d.allowed) return d;
    const visible = await decide(ctx, resource, "read");
    if (!visible.allowed) throw notFound();
    throw forbidden(d.reason || "action_not_allowed");
  }

  return {
    opsRolesOf, assignRole, revokeRole, ensureOwner, context, can, requireCap,
    ensureSelfProfile, createJuniorProfile, guardianRelationships, guardiansOfProfile, revokeGuardian, flagGuardianDispute, controlledProfileIds, listProfiles,
    inviteCoach, acceptInvitation, declineInvitation, revokeInvitation, revokeGrant, grantsForCoach, grantsForProfile, invitationsForInviter, invitationsForCoach,
    decide, authorize,
  };
}
