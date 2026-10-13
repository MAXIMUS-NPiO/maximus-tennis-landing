/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/**
 * Racquet configurations, immutable revisions, manufacturing review and specification approval —
 * SERVER ONLY (APP-021 … APP-028).
 *
 *   • A configuration has a name and a stable server ID; every substantive change creates an
 *     immutable revision. A draft can be edited, duplicated and archived.
 *   • targetRA is a deliberate choice between 30 and 90 with NO default and NO clamp. An empty
 *     field stays empty (Feste: not selected). 30 and 90 are accepted as requests. A value outside
 *     the range is kept as the customer typed it and becomes a custom request, never altered.
 *   • Optimistic concurrency: an update names the version it saw; a stale version answers 409 and
 *     returns both the server state and the submitted input so the person can choose.
 *   • A ManufacturingReview is bound to one exact revision; its decision never follows from a
 *     payment or from the precision class. The customer then explicitly accepts the final
 *     specification and the artwork (SpecificationApproval).
 */
import { validateConfig, parseLength } from "../intake/schema";
import { newId, sha256, canonical } from "./ids";
import { ApiError, notFound, forbidden, conflict, validationError } from "./errors";
import { validate, text, oneOf, int, any } from "./validate";
import { auditWrites, mergeCommits } from "./audit";
import { toleranceFor } from "./catalog";

export const RA_MIN = 30;
export const RA_MAX = 90;
export const CONFIG_STATUS = ["draft", "submitted", "manufacturing_review", "approved_specification", "archived"];
export const REVIEW_STATUS = ["pending", "needs_clarification", "approved", "declined"];

/**
 * Reads the stiffness choice. Returns { raStatus, targetRA, targetRAInput, error? }.
 *   not_selected                 — nothing entered (allowed in a draft; blocks standard confirmation)
 *   selected                     — integer 30…90 inclusive
 *   out_of_range_custom_request  — a number outside 30…90, preserved verbatim, routed to a custom request
 */
export function readTargetRA(raw) {
  if (raw === undefined || raw === null || (typeof raw === "string" && raw.trim() === "")) return { raStatus: "not_selected", targetRA: null, targetRAInput: null };
  const s = typeof raw === "number" ? String(raw) : String(raw).trim();
  if (!/^-?\d+$/.test(s)) {
    if (/^-?\d*[.,]\d+$/.test(s)) return { raStatus: "invalid", targetRA: null, targetRAInput: s, error: "decimal_not_supported" };
    return { raStatus: "invalid", targetRA: null, targetRAInput: s, error: "not_number" };
  }
  const n = Number(s);
  if (!Number.isSafeInteger(n)) return { raStatus: "invalid", targetRA: null, targetRAInput: s, error: "out_of_range" };
  if (n < RA_MIN || n > RA_MAX) return { raStatus: "out_of_range_custom_request", targetRA: null, targetRAInput: s };
  return { raStatus: "selected", targetRA: n, targetRAInput: s };
}

/**
 * Validates the fields of a revision. Everything except stiffness is the shared intake schema
 * (series matrix, grips, precision class, personalisation, sets). Returns { ok, value, errors,
 * standardConfirmable } — ok means "storable as a draft", standardConfirmable means "may be
 * submitted for standard manufacturing confirmation".
 */
export function validateRevisionFields(input) {
  const src = input && typeof input === "object" ? input : {};
  const { targetRA, ra, ...rest } = src;
  const base = validateConfig(rest);
  const stiff = readTargetRA(targetRA !== undefined ? targetRA : ra);
  // A draft may be incomplete: a missing answer is recorded as "missing for standard confirmation",
  // while an answer that is present but wrong is an error that blocks saving.
  const errors = {};
  const missing = [];
  for (const [k, code] of Object.entries(base.errors)) {
    if (code === "required") missing.push(k.replace(/^config\./, ""));
    else errors[k] = code;
  }
  if (stiff.error) errors["config.targetRA"] = stiff.error;
  if (stiff.raStatus === "not_selected") missing.push("targetRA");
  if (!base.value.lengthMode && !missing.includes("lengthMode")) missing.push("lengthMode");
  const value = { ...base.value, targetRA: stiff.targetRA, targetRAInput: stiff.targetRAInput, raStatus: stiff.raStatus, units: { weight: "g", balance: "mm", swingweight: "kg·cm²", stiffness: "RA", length: "in" } };
  const ok = Object.keys(errors).length === 0;
  const complete = ok && missing.filter((m) => m !== "targetRA").length === 0;
  const hasStandardLength = value.lengthMode === "standard" && value.lengthIn != null;
  const standardConfirmable = complete && !value.productKind && stiff.raStatus === "selected" && value.mode === "listed" && hasStandardLength;
  const customRequest = complete && !standardConfirmable && (stiff.raStatus === "out_of_range_custom_request" || value.mode === "custom" || value.lengthMode === "custom" || value.productKind === "sst" || value.productKind === "spot");
  return { ok, value, errors, standardConfirmable, customRequest, missingForStandard: ok ? missing : [] };
}

export function createConfigurations({ store, access, now = () => Date.now() }) {
  const iso = (ms) => new Date(ms).toISOString();

  function resource(cfg) {
    return { kind: "configuration", ownerUserId: cfg.ownerUserId, profileId: cfg.profileId, readCapability: "configurations:read_all" };
  }

  function publicConfig(rec, revision) {
    const c = rec.doc;
    return { ...c, version: rec.version, currentRevision: revision ? publicRevision(revision) : undefined };
  }
  const publicRevision = (r) => ({ id: r.id, configurationId: r.configurationId, number: r.number, fields: r.fields, standardConfirmable: r.standardConfirmable, customRequest: r.customRequest, missingForStandard: r.missingForStandard, hash: r.hash, createdAt: r.createdAt, createdByUserId: r.createdByUserId });

  function revisionDoc({ configurationId, number, validated, userId, at }) {
    const id = newId("rev");
    const hash = sha256(canonical(validated.value));
    return { id, configurationId, number, fields: validated.value, standardConfirmable: validated.standardConfirmable, customRequest: validated.customRequest, missingForStandard: validated.missingForStandard, hash, createdAt: iso(at), createdByUserId: userId, immutable: true };
  }

  async function loadRevision(id) {
    const r = await store.get("revision", id);
    return r ? r.doc : null;
  }

  async function get(ctx, id) {
    const rec = await store.get("configuration", id);
    if (!rec) throw notFound();
    const d = await access.authorize(ctx, resource(rec.doc), "read");
    const rev = await loadRevision(rec.doc.currentRevisionId);
    return { ...publicConfig(rec, rev), access: d.via };
  }

  async function list(ctx, { profileId, limit = 50, offset = 0, includeArchived = false } = {}) {
    const controlled = await access.controlledProfileIds(ctx);
    const grants = await access.grantsForCoach(ctx.userId);
    const profileIds = profileId ? [profileId] : [...controlled, ...grants.filter((g) => g.scope.includes("configurations:read")).map((g) => g.profileId)];
    const out = [];
    for (const pid of profileIds) {
      if (!controlled.has(pid) && !grants.some((g) => g.profileId === pid && g.scope.includes("configurations:read"))) continue;
      const ids = await store.listIndex(`configurations:profile:${pid}`, { limit: 200 });
      const rows = await store.getMany("configuration", ids);
      for (const r of rows) {
        if (!includeArchived && r.doc.status === "archived") continue;
        const rev = await loadRevision(r.doc.currentRevisionId);
        out.push({ ...publicConfig(r, rev), access: controlled.has(pid) ? (r.doc.ownerUserId === ctx.userId ? "owner" : "guardian") : "coach" });
      }
    }
    out.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    return { items: out.slice(offset, offset + limit), total: out.length };
  }

  const CREATE_FIELDS = { name: text(80, { min: 1 }), profileId: text(40), fields: any({ required: true }) };

  async function create(ctx, input, { correlationId } = {}) {
    const r = validate(CREATE_FIELDS, input);
    if (!r.ok) throw validationError(r.errors);
    const validated = validateRevisionFields(r.value.fields);
    if (!validated.ok) throw validationError(validated.errors);
    let profileId = r.value.profileId;
    if (!profileId) profileId = (await access.ensureSelfProfile({ id: ctx.userId, displayName: ctx.email })).id;
    const controlled = await access.controlledProfileIds(ctx);
    if (!controlled.has(profileId)) throw notFound();
    const at = now();
    const id = newId("cfg");
    const rev = revisionDoc({ configurationId: id, number: 1, validated, userId: ctx.userId, at });
    const doc = { id, ownerUserId: ctx.userId, profileId, name: r.value.name || defaultName(validated.value), status: "draft", currentRevisionId: rev.id, revisionCount: 1, approvedRevisionId: null, lockedByOrderId: null, sharing: { publicLink: false }, createdAt: iso(at), updatedAt: iso(at), archivedAt: null };
    await store.commit(mergeCommits(
      { writes: [{ type: "configuration", id, doc, expectedVersion: -1 }, { type: "revision", id: rev.id, doc: rev, expectedVersion: -1 }], indexes: [{ name: `configurations:profile:${profileId}`, member: id, score: at }, { name: `revisions:configuration:${id}`, member: rev.id, score: at }] },
      auditWrites({ now: at, actor: { userId: ctx.userId }, action: "configuration.created", objectType: "configuration", objectId: id, correlationId, afterVersion: 1 })
    ));
    return { ...doc, version: 1, currentRevision: publicRevision(rev) };
  }

  function defaultName(f) {
    const w = f.mode === "listed" ? `${f.weight} g` : `${f.customWeight} g (custom)`;
    return `${String(f.series || "").toUpperCase()} ${f.cls || ""} · ${w} · ${f.grip || ""}`.trim();
  }

  /**
   * Updates name and/or fields. `ifMatch` is the version the client last saw; a mismatch answers
   * 409 with the server's current state and the submitted input, nothing is overwritten.
   */
  async function update(ctx, id, { ifMatch, name, fields }, { correlationId } = {}) {
    const rec = await store.get("configuration", id);
    if (!rec) throw notFound();
    await access.authorize(ctx, resource(rec.doc), "write");
    if (rec.doc.status === "archived") throw conflict("configuration_archived");
    if (rec.doc.lockedByOrderId) throw conflict("change_request_required", { details: { orderId: rec.doc.lockedByOrderId } });
    if (ifMatch === undefined || ifMatch === null) throw validationError({ ifMatch: "required" });
    const current = await loadRevision(rec.doc.currentRevisionId);
    if (Number(ifMatch) !== rec.version) {
      throw new ApiError(409, "version_conflict", { details: { server: publicConfig(rec, current), yourInput: { name, fields } } });
    }
    const at = now();
    const next = { ...rec.doc, updatedAt: iso(at) };
    if (name !== undefined) {
      const n = validate({ name: text(80, { min: 1 }) }, { name });
      if (!n.ok) throw validationError(n.errors);
      next.name = n.value.name;
    }
    const writes = [];
    const indexes = [];
    let newRev = null;
    if (fields !== undefined) {
      const validated = validateRevisionFields(fields);
      if (!validated.ok) throw validationError(validated.errors);
      const hash = sha256(canonical(validated.value));
      if (!current || current.hash !== hash) {
        newRev = revisionDoc({ configurationId: id, number: rec.doc.revisionCount + 1, validated, userId: ctx.userId, at });
        writes.push({ type: "revision", id: newRev.id, doc: newRev, expectedVersion: -1 });
        indexes.push({ name: `revisions:configuration:${id}`, member: newRev.id, score: at });
        next.currentRevisionId = newRev.id;
        next.revisionCount = rec.doc.revisionCount + 1;
        // A new revision after approval is a new draft; the approved revision itself stays immutable.
        if (["approved_specification", "manufacturing_review", "submitted"].includes(next.status)) next.status = "draft";
      }
    }
    writes.unshift({ type: "configuration", id, doc: next, expectedVersion: rec.version });
    try {
      await store.commit(mergeCommits({ writes, indexes }, auditWrites({ now: at, actor: { userId: ctx.userId }, action: newRev ? "configuration.revision_created" : "configuration.renamed", objectType: "configuration", objectId: id, correlationId, beforeVersion: rec.version, afterVersion: rec.version + 1, meta: newRev ? { revision: newRev.number } : undefined })));
    } catch (e) {
      if (e && e.code === "version_conflict") {
        const fresh = await store.get("configuration", id);
        throw new ApiError(409, "version_conflict", { details: { server: publicConfig(fresh, await loadRevision(fresh.doc.currentRevisionId)), yourInput: { name, fields } } });
      }
      throw e;
    }
    return { ...next, version: rec.version + 1, currentRevision: publicRevision(newRev || current) };
  }

  async function duplicate(ctx, id, { correlationId } = {}) {
    const rec = await store.get("configuration", id);
    if (!rec) throw notFound();
    await access.authorize(ctx, resource(rec.doc), "read");
    const current = await loadRevision(rec.doc.currentRevisionId);
    // Copies the technical fields only — never documents, personal data, approvals or a price.
    const fields = { ...current.fields };
    delete fields.engraving;
    fields.ptype = "none";
    const created = await create(ctx, { name: `${rec.doc.name} (copy)`, fields: { ...fields, targetRA: fields.targetRAInput ?? undefined } }, { correlationId });
    return created;
  }

  async function archive(ctx, id, { correlationId } = {}) {
    const rec = await store.get("configuration", id);
    if (!rec) throw notFound();
    await access.authorize(ctx, resource(rec.doc), "write");
    if (rec.doc.lockedByOrderId) throw conflict("configuration_locked_by_order");
    const at = now();
    const doc = { ...rec.doc, status: "archived", archivedAt: iso(at), updatedAt: iso(at) };
    await store.commit(mergeCommits({ writes: [{ type: "configuration", id, doc, expectedVersion: rec.version }] }, auditWrites({ now: at, actor: { userId: ctx.userId }, action: "configuration.archived", objectType: "configuration", objectId: id, correlationId })));
    return { ...doc, version: rec.version + 1 };
  }

  async function revisions(ctx, id) {
    const rec = await store.get("configuration", id);
    if (!rec) throw notFound();
    await access.authorize(ctx, resource(rec.doc), "read");
    const ids = await store.listIndex(`revisions:configuration:${id}`, { limit: 200, reverse: false });
    return (await store.getMany("revision", ids)).map((r) => publicRevision(r.doc));
  }

  /** Guest draft (sessionStorage shape {v:2, c:{…}}) imported explicitly after sign-in. */
  async function importDraft(ctx, draft, { correlationId } = {}) {
    if (!draft || typeof draft !== "object" || draft.v !== 2 || !draft.c || typeof draft.c !== "object") throw validationError({ draft: "invalid" });
    const c = draft.c;
    const fields = { lengthMode: c.lengthMode, lengthIn: c.lengthIn, customLengthIn: c.customLengthIn, catalogueVersion: c.catalogueVersion, series: c.series, cls: c.cls, mode: c.mode, weight: c.weight, customWeight: c.customWeight, basis: c.basis, balanceReq: c.balanceReq, sw: c.sw, targetRA: c.ra, grip: c.grip, ptype: c.ptype || "none", setType: c.setType, sets: c.sets, teamSize: c.teamSize, use: c.use };
    const validated = validateRevisionFields(fields);
    if (!validated.ok) throw validationError(validated.errors);
    return create(ctx, { name: "Imported draft", fields }, { correlationId });
  }

  /* ------------------------------------------------------------ manufacturing review */

  async function requestManufacturingConfirmation(ctx, id, { correlationId } = {}) {
    const rec = await store.get("configuration", id);
    if (!rec) throw notFound();
    await access.authorize(ctx, resource(rec.doc), "write");
    if (!ctx.emailVerified) throw forbidden("email_verification_required");
    const rev = await loadRevision(rec.doc.currentRevisionId);
    // Revalidate immutable historical revisions: old readiness flags cannot invent a missing length.
    const readiness = validateRevisionFields({ ...rev.fields, targetRA: rev.fields.targetRAInput ?? rev.fields.targetRA });
    if (!readiness.ok || (!readiness.standardConfirmable && !readiness.customRequest)) throw new ApiError(409, "standard_confirmation_blocked", { details: { missingForStandard: readiness.missingForStandard, raStatus: readiness.value.raStatus, errors: readiness.errors } });
    const existing = await store.getUnique("review_revision", rev.id);
    if (existing) return (await store.get("review", existing)).doc;
    const at = now();
    const reviewId = newId("mfr");
    const review = {
      id: reviewId, configurationId: id, revisionId: rev.id, status: "pending", customRequest: !readiness.standardConfirmable, requestedAt: iso(at), requestedByUserId: ctx.userId,
      targets: { lengthIn: rev.fields.lengthIn ?? null, customLengthIn: rev.fields.customLengthIn ?? null, lengthMode: rev.fields.lengthMode ?? null, weightG: rev.fields.mode === "listed" ? rev.fields.weight : rev.fields.customWeight, balanceMm: rev.fields.balanceReq ?? null, swingweightKgCm2: rev.fields.sw ?? null, targetRA: rev.fields.targetRA, targetRAInput: rev.fields.targetRAInput, basis: rev.fields.basis || "unknown" },
      tolerances: toleranceFor(rev.fields.cls), protocol: null, decidedAt: null, decidedByUserId: null, customerNote: null, decision: null,
    };
    const cfgNext = { ...rec.doc, status: "manufacturing_review", updatedAt: iso(at) };
    await store.commit(mergeCommits(
      { writes: [{ type: "review", id: reviewId, doc: review, expectedVersion: -1 }, { type: "configuration", id, doc: cfgNext, expectedVersion: rec.version }], uniques: [{ name: "review_revision", value: rev.id, owner: reviewId }], indexes: [{ name: `reviews:configuration:${id}`, member: reviewId, score: at }, { name: "admin:reviews:pending", member: reviewId, score: at }] },
      auditWrites({ now: at, actor: { userId: ctx.userId }, action: "manufacturing_review.requested", objectType: "configuration", objectId: id, correlationId, meta: { revision: rev.number, targetRA: rev.fields.targetRAInput, custom: review.customRequest } })
    ));
    return review;
  }

  const PROTOCOL_FIELDS = {
    method: text(200, { required: true }), instrument: text(200, { required: true }), resolution: text(100, { required: true }), calibration: text(200, { required: true }),
    conditions: text(300), basis: oneOf(["strung", "unstrung"], { required: true }), fixture: text(200), repeats: text(100), results: text(1000),
    // For a custom request (RA outside 30–90 or a custom weight) the factory records the target it agreed to.
    agreedTargetRA: int(1, 200), agreedWeightG: int(100, 600), agreedLengthIn: any(),
  };

  async function decideReview(ctx, reviewId, { decision, customerNote, protocol, tolerances }, { correlationId } = {}) {
    access.requireCap(ctx, "reviews:decide");
    if (!["approved", "needs_clarification", "declined"].includes(decision)) throw validationError({ decision: "invalid_choice" });
    const rec = await store.get("review", reviewId);
    if (!rec) throw notFound();
    if (rec.doc.status === "approved") throw conflict("review_already_approved");
    const cfgRec = await store.get("configuration", rec.doc.configurationId);
    if (cfgRec.doc.currentRevisionId !== rec.doc.revisionId && decision === "approved") throw conflict("review_revision_superseded");
    let proto = null;
    if (decision === "approved") {
      const p = validate(PROTOCOL_FIELDS, protocol);
      if (!p.ok) throw validationError(p.errors);
      proto = p.value;
      const revision = await loadRevision(rec.doc.revisionId);
      const current = validateRevisionFields({ ...revision.fields, targetRA: revision.fields.targetRAInput ?? revision.fields.targetRA });
      if (!current.ok || (!current.standardConfirmable && !current.customRequest)) throw new ApiError(409, "standard_confirmation_blocked", { details: { missingForStandard: current.missingForStandard } });
      const requestedLength = revision.fields.customLengthIn ?? revision.fields.lengthIn;
      if (requestedLength != null || proto.agreedLengthIn != null) {
        const agreed = parseLength(proto.agreedLengthIn);
        if (agreed.error || (requestedLength != null && agreed.value !== requestedLength)) throw validationError({ agreedLengthIn: "invalid" });
        proto.agreedLengthIn = agreed.value;
      }
      if (!revision.fields.productKind && rec.doc.targets.targetRA === null && !proto.agreedTargetRA) throw new ApiError(409, "target_ra_not_selected");
    }
    const at = now();
    const review = { ...rec.doc, status: decision, decision, decidedAt: iso(at), decidedByUserId: ctx.userId, customerNote: customerNote ? String(customerNote).slice(0, 1000) : null, protocol: proto, tolerances: tolerances || rec.doc.tolerances };
    const cfgNext = { ...cfgRec.doc, updatedAt: iso(at), status: decision === "approved" ? "approved_specification" : decision === "declined" ? "draft" : "manufacturing_review", approvedRevisionId: decision === "approved" ? rec.doc.revisionId : cfgRec.doc.approvedRevisionId };
    await store.commit(mergeCommits(
      { writes: [{ type: "review", id: reviewId, doc: review, expectedVersion: rec.version }, { type: "configuration", id: cfgRec.doc.id, doc: cfgNext, expectedVersion: cfgRec.version }], unindexes: decision === "needs_clarification" ? [] : [{ name: "admin:reviews:pending", member: reviewId }] },
      auditWrites({ now: at, actor: { userId: ctx.userId, roles: ctx.opsRoles }, action: `manufacturing_review.${decision}`, objectType: "configuration", objectId: cfgRec.doc.id, correlationId, reason: customerNote })
    ));
    return review;
  }

  async function reviewsFor(ctx, configurationId) {
    const rec = await store.get("configuration", configurationId);
    if (!rec) throw notFound();
    await access.authorize(ctx, resource(rec.doc), "read");
    const ids = await store.listIndex(`reviews:configuration:${configurationId}`, { limit: 50 });
    return (await store.getMany("review", ids)).map((r) => publicReview(r.doc));
  }

  /** Internal notes never leave the server; the customer sees the decision, the targets, tolerances and protocol. */
  const publicReview = (r) => ({ id: r.id, configurationId: r.configurationId, revisionId: r.revisionId, status: r.status, customRequest: r.customRequest, requestedAt: r.requestedAt, decidedAt: r.decidedAt, customerNote: r.customerNote, targets: r.targets, tolerances: r.tolerances, protocol: r.protocol });

  async function pendingReviews(ctx, { limit = 50, offset = 0 } = {}) {
    access.requireCap(ctx, "reviews:decide");
    const ids = await store.listIndex("admin:reviews:pending", { limit, offset, reverse: false });
    return (await store.getMany("review", ids)).map((r) => r.doc);
  }

  async function acceptSpecification(ctx, reviewId, { artworkAccepted, acceptedText }, { correlationId } = {}) {
    const rec = await store.get("review", reviewId);
    if (!rec) throw notFound();
    const cfgRec = await store.get("configuration", rec.doc.configurationId);
    await access.authorize(ctx, resource(cfgRec.doc), "write");
    if (rec.doc.status !== "approved") throw conflict("review_not_approved");
    if (artworkAccepted !== true) throw validationError({ artworkAccepted: "consent_required" });
    const existing = await store.getUnique("spec_approval", rec.doc.revisionId);
    if (existing) return (await store.get("spec_approval", existing)).doc;
    const at = now();
    const id = newId("spa");
    const textHash = sha256(canonical({ targets: rec.doc.targets, tolerances: rec.doc.tolerances, protocol: rec.doc.protocol, acceptedText: acceptedText || null }));
    const doc = { id, revisionId: rec.doc.revisionId, reviewId, configurationId: rec.doc.configurationId, acceptedByUserId: ctx.userId, acceptedAt: iso(at), artworkAccepted: true, textHash, locale: ctx.locale };
    await store.commit(mergeCommits(
      { writes: [{ type: "spec_approval", id, doc, expectedVersion: -1 }], uniques: [{ name: "spec_approval", value: rec.doc.revisionId, owner: id }], indexes: [{ name: `spec_approvals:configuration:${rec.doc.configurationId}`, member: id, score: at }] },
      auditWrites({ now: at, actor: { userId: ctx.userId }, action: "specification.accepted", objectType: "configuration", objectId: rec.doc.configurationId, correlationId, meta: { revisionId: rec.doc.revisionId } })
    ));
    return doc;
  }

  async function specificationApprovalFor(revisionId) {
    const id = await store.getUnique("spec_approval", revisionId);
    return id ? (await store.get("spec_approval", id)).doc : null;
  }

  async function approvedReviewFor(revisionId) {
    const id = await store.getUnique("review_revision", revisionId);
    if (!id) return null;
    const r = await store.get("review", id);
    return r && r.doc.status === "approved" ? r.doc : null;
  }

  /** Locks the configuration to a paid order: further edits must go through a change request. */
  async function lockForOrder(configurationId, orderId) {
    const rec = await store.get("configuration", configurationId);
    if (!rec || rec.doc.lockedByOrderId === orderId) return;
    await store.commit({ writes: [{ type: "configuration", id: configurationId, doc: { ...rec.doc, lockedByOrderId: orderId, updatedAt: iso(now()) }, expectedVersion: rec.version }] });
  }

  /* ------------------------------------------------------------ coach proposals */

  async function propose(ctx, configurationId, { fields, comment }, { correlationId } = {}) {
    const rec = await store.get("configuration", configurationId);
    if (!rec) throw notFound();
    await access.authorize(ctx, resource(rec.doc), "propose");
    const validated = validateRevisionFields(fields);
    if (!validated.ok) throw validationError(validated.errors);
    const c = validate({ comment: text(1000) }, { comment });
    if (!c.ok) throw validationError(c.errors);
    const at = now();
    const id = newId("prp");
    const doc = { id, configurationId, coachUserId: ctx.userId, fields: validated.value, comment: c.value.comment || null, status: "open", createdAt: iso(at) };
    await store.commit(mergeCommits({ writes: [{ type: "proposal", id, doc, expectedVersion: -1 }], indexes: [{ name: `proposals:configuration:${configurationId}`, member: id, score: at }] }, auditWrites({ now: at, actor: { userId: ctx.userId }, action: "configuration.proposal_created", objectType: "configuration", objectId: configurationId, correlationId })));
    return doc;
  }

  async function proposals(ctx, configurationId) {
    const rec = await store.get("configuration", configurationId);
    if (!rec) throw notFound();
    await access.authorize(ctx, resource(rec.doc), "read");
    const ids = await store.listIndex(`proposals:configuration:${configurationId}`, { limit: 50 });
    return (await store.getMany("proposal", ids)).map((r) => r.doc);
  }

  async function loadForOrder(revisionId) {
    const rev = await loadRevision(revisionId);
    if (!rev) return null;
    const cfg = await store.get("configuration", rev.configurationId);
    return { revision: rev, configuration: cfg ? cfg.doc : null };
  }

  return { readTargetRA, validateRevisionFields, get, list, create, update, duplicate, archive, revisions, importDraft, requestManufacturingConfirmation, decideReview, reviewsFor, pendingReviews, acceptSpecification, specificationApprovalFor, approvedReviewFor, lockForOrder, propose, proposals, loadForOrder, loadRevision, resource };
}
