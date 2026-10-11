/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/** Server-only TOTP enrollment and session step-up. Never import into client components. */
import crypto from "node:crypto";
import { ORGANIZATION, capabilitiesFor } from "./access";
import { verifyPassword } from "./identity";
import { newId, randomToken, sha256, safeEqual } from "./ids";
import { auditWrites, mergeCommits } from "./audit";
import { badRequest, forbidden, unauthorized, conflict, unavailable, tooMany } from "./errors";

const STEP_MS = 30_000;
const ENROLL_MS = 5 * 60_000;
const VERIFIED_MS = 15 * 60_000;
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const iso = (at) => new Date(at).toISOString();
const timestamp = (value) => typeof value === "string" ? Date.parse(value) : NaN;
const recordId = (userId) => `${ORGANIZATION}:${userId}`;

/** RFC 6238 primitive, including 64-bit moving factors. Service uses SHA1/6 digits/30 sec. */
export function totp(secret, { at = Date.now(), counter = Math.floor(at / STEP_MS), digits = 6, algorithm = "sha1" } = {}) {
  if (!Buffer.isBuffer(secret) || !secret.length || !Number.isSafeInteger(counter) || counter < 0 ||
      ![6, 8].includes(digits) || !["sha1", "sha256", "sha512"].includes(algorithm)) throw badRequest("mfa_invalid_parameters");
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const mac = crypto.createHmac(algorithm, secret).update(message).digest();
  const offset = mac[mac.length - 1] & 15;
  return String((mac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits).padStart(digits, "0");
}

export function encodeBase32(bytes) {
  let bits = 0, value = 0, out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { bits -= 5; out += BASE32[(value >>> bits) & 31]; }
    value &= (1 << bits) - 1;
  }
  if (bits) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function decodeBase32(value) {
  if (typeof value !== "string" || !/^[A-Z2-7]+$/.test(value)) throw badRequest("mfa_invalid_secret");
  let bits = 0, accumulator = 0;
  const out = [];
  for (const char of value) {
    accumulator = (accumulator << 5) | BASE32.indexOf(char); bits += 5;
    if (bits >= 8) { bits -= 8; out.push((accumulator >>> bits) & 255); }
    accumulator &= (1 << bits) - 1;
  }
  const bytes = Buffer.from(out);
  if (encodeBase32(bytes) !== value) throw badRequest("mfa_invalid_secret");
  return bytes;
}

function encryptionKey(env) {
  const encoded = env.ADMIN_MFA_ENCRYPTION_KEY;
  if (typeof encoded !== "string" || !/^[A-Za-z0-9+/]{43}=$/.test(encoded)) return null;
  const key = Buffer.from(encoded, "base64");
  // Structural checks reject common placeholders; operator must supply cryptographically random bytes.
  if (key.length !== 32 || key.toString("base64") !== encoded || new Set(key).size < 16) return null;
  return key;
}

/** Safe readiness projection: no key, code, enrollment secret or ciphertext is returned. */
export function readMfaReadiness(env = {}) {
  const providerSupported = env.ADMIN_MFA_PROVIDER === "totp";
  const encryptionKeyConfigured = !!encryptionKey(env);
  return { providerSupported, encryptionKeyConfigured, configured: providerSupported && encryptionKeyConfigured,
    required: env.NODE_ENV === "production" || env.ADMIN_REQUIRE_MFA === "true" || env.ADMIN_REQUIRE_MFA === "1" };
}

export function createMfa({ store, env = {}, now = () => Date.now() }) {
  if (!store?.get || !store?.commit || !store?.counter) throw unavailable("mfa_store_unavailable");
  const readiness = readMfaReadiness(env);
  const key = encryptionKey(env);
  function configured() { if (!readiness.configured) throw unavailable("mfa_not_configured"); }
  function clock() { const at = now(); if (!Number.isSafeInteger(at) || at < 0) throw unavailable("mfa_clock_invalid"); return at; }
  const aad = (doc) => Buffer.from(`mx-mfa-v1:${doc.organizationId}:${doc.userId}:${doc.enrollmentId}`);
  function encrypt(secret, doc) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv); cipher.setAAD(aad(doc));
    const ciphertext = Buffer.concat([cipher.update(secret), cipher.final()]);
    return { version: 1, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: ciphertext.toString("base64") };
  }
  function decrypt(doc) {
    try {
      if (doc.encryptedSecret?.version !== 1) throw Error();
      const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(doc.encryptedSecret.iv, "base64"));
      decipher.setAAD(aad(doc)); decipher.setAuthTag(Buffer.from(doc.encryptedSecret.tag, "base64"));
      const secret = Buffer.concat([decipher.update(Buffer.from(doc.encryptedSecret.data, "base64")), decipher.final()]);
      if (secret.length !== 20) throw Error();
      return secret;
    } catch { throw unavailable("mfa_secret_unavailable"); }
  }
  async function limited(userId, kind, limit = 5, seconds = 300) {
    const count = await store.counter(`mfa:${ORGANIZATION}:${userId}:${kind}`, seconds);
    if (count > limit) throw tooMany(seconds);
  }
  async function authorized(auth, at) {
    if (!auth?.user?.id || !auth?.session?.id) throw unauthorized();
    const [user, session] = await Promise.all([store.get("user", auth.user.id), store.get("session", auth.session.id)]);
    const doc = session?.doc;
    if (!user || user.doc.id !== auth.user.id || !doc || doc.id !== auth.session.id || doc.userId !== user.doc.id ||
        auth.session.userId !== user.doc.id || doc.platform !== "web" || doc.revokedAt ||
        !doc.tokenHash || !safeEqual(doc.tokenHash, auth.session.tokenHash || "") ||
        !(timestamp(doc.idleExpiresAt) > at) || !(timestamp(doc.absoluteExpiresAt) > at)) throw unauthorized("session_invalid");
    if (user.doc.status !== "active") throw forbidden("verified_account_required");
    const roleIds = await store.listIndex(`roles:user:${user.doc.id}`, { limit: 51 });
    if (roleIds.length > 50) throw forbidden("mfa_role_limit");
    const roles = (await store.getMany("role", roleIds)).filter((r) => r.doc.userId === user.doc.id &&
      r.doc.id === r.id && r.doc.organizationId === ORGANIZATION && !r.doc.revokedAt && capabilitiesFor([r.doc.role]).has("ledger:read"));
    if (!roles.length) throw forbidden("capability_required");
    return { user, session, roles, auth };
  }
  async function passwordReauth(context, password) {
    await limited(context.user.doc.id, "password");
    if (typeof password !== "string" || password.length > 1024 || !verifyPassword(password, context.user.doc.passwordHash)) throw unauthorized("reauth_failed");
  }
  function recentPassword(context, at) {
    const reauth = timestamp(context.session.doc.reauthAt);
    const changed = timestamp(context.user.doc.passwordChangedAt);
    if (!Number.isFinite(reauth) || reauth > at || at - reauth > 10 * 60_000 || (Number.isFinite(changed) && changed > reauth)) throw forbidden("reauth_required");
  }
  async function getRecord(userId) {
    const rec = await store.get("mfa", recordId(userId));
    if (rec && (rec.doc.id !== recordId(userId) || rec.doc.userId !== userId || rec.doc.organizationId !== ORGANIZATION || rec.doc.provider !== "totp")) throw forbidden("mfa_record_invalid");
    return rec;
  }
  function verifiedCounter(doc, code, at) {
    if (typeof code !== "string" || !/^\d{6}$/.test(code) || !Number.isSafeInteger(doc.lastCounter) || doc.lastCounter < -1) throw unauthorized("mfa_code_invalid");
    const secret = decrypt(doc), current = Math.floor(at / STEP_MS);
    let matched = -1;
    for (const counter of [current - 1, current, current + 1]) {
      if (counter >= 0 && counter > doc.lastCounter && safeEqual(totp(secret, { counter }), code)) matched = Math.max(matched, counter);
    }
    secret.fill(0);
    if (matched < 0) throw unauthorized("mfa_code_invalid");
    return matched;
  }
  function rotated(context, at, level, generation) {
    const sessionToken = randomToken(32), csrfToken = randomToken(24);
    const doc = { ...context.session.doc, tokenHash: sha256(sessionToken), csrf: csrfToken,
      mfaLevel: level, mfaVerifiedAt: level === "totp" ? iso(at) : null, mfaGeneration: generation || null };
    return { doc, issued: { sessionToken, csrfToken, expiresAt: doc.absoluteExpiresAt, mfaLevel: level } };
  }
  async function commit(context, rec, doc, sessionDoc, action, at) {
    // Store has no check-only assertions: unchanged user/role writes fence concurrent disable/revoke.
    const guards = [{ type: "user", id: context.user.doc.id, doc: context.user.doc, expectedVersion: context.user.version },
      ...context.roles.map((r) => ({ type: "role", id: r.id, doc: r.doc, expectedVersion: r.version }))];
    const old = context.session.doc;
    try {
      await store.commit(mergeCommits({ writes: [...guards,
        { type: "mfa", id: doc.id, doc, expectedVersion: rec ? rec.version : -1 },
        { type: "session", id: old.id, doc: sessionDoc, expectedVersion: context.session.version }],
        uniques: sessionDoc.tokenHash !== old.tokenHash ? [{ name: "session_token", value: sessionDoc.tokenHash, owner: old.id }] : [] },
      auditWrites({ now: at, actor: { userId: context.user.doc.id }, action, objectType: "mfa", objectId: doc.id,
        beforeVersion: rec?.version || 0, afterVersion: (rec?.version || 0) + 1, meta: { provider: "totp" } })));
    } catch (error) {
      if (error?.code === "version_conflict" || error?.code === "unique_conflict") throw conflict("mfa_state_changed");
      throw error;
    }
  }
  async function beginEnrollment({ auth, password }) {
    configured(); const at = clock(), context = await authorized(auth, at);
    await passwordReauth(context, password);
    await limited(context.user.doc.id, "enrollment", 3, 600);
    const rec = await getRecord(context.user.doc.id);
    if (rec?.doc.status === "active") throw conflict("mfa_already_enabled");
    const enrollmentId = newId("mfa"), secret = crypto.randomBytes(20);
    const doc = { id: recordId(context.user.doc.id), organizationId: ORGANIZATION, userId: context.user.doc.id, provider: "totp",
      status: "pending", enrollmentId, boundSessionId: context.session.doc.id, boundTokenHash: context.session.doc.tokenHash,
      enrollmentExpiresAt: iso(at + ENROLL_MS), createdAt: iso(at), updatedAt: iso(at), lastCounter: -1 };
    try {
      doc.encryptedSecret = encrypt(secret, doc);
      await commit(context, rec, doc, { ...context.session.doc, reauthAt: iso(at) }, "mfa.enrollment_started", at);
      const encoded = encodeBase32(secret), label = encodeURIComponent(`MAXIMUS:${context.user.doc.id}`);
      return { enrollmentId, secret: encoded, otpauthUri: `otpauth://totp/${label}?secret=${encoded}&issuer=MAXIMUS&algorithm=SHA1&digits=6&period=30`, expiresAt: doc.enrollmentExpiresAt };
    } finally { secret.fill(0); }
  }
  async function confirmEnrollment({ auth, enrollmentId, code }) {
    configured(); const at = clock(), context = await authorized(auth, at);
    await limited(context.user.doc.id, "code"); recentPassword(context, at);
    const rec = await getRecord(context.user.doc.id), doc = rec?.doc;
    if (!doc || doc.status !== "pending" || doc.enrollmentId !== enrollmentId || doc.boundSessionId !== context.session.doc.id ||
        !safeEqual(doc.boundTokenHash, context.session.doc.tokenHash) || !(timestamp(doc.enrollmentExpiresAt) > at)) throw forbidden("mfa_enrollment_invalid");
    const counter = verifiedCounter(doc, code, at);
    const active = { ...doc, status: "active", lastCounter: counter, activatedAt: iso(at), updatedAt: iso(at) };
    delete active.boundSessionId; delete active.boundTokenHash; delete active.enrollmentExpiresAt;
    const next = rotated(context, at, "totp", doc.enrollmentId);
    await commit(context, rec, active, next.doc, "mfa.enabled", at);
    return next.issued;
  }
  async function stepUp({ auth, code }) {
    configured(); const at = clock(), context = await authorized(auth, at);
    await limited(context.user.doc.id, "code");
    const rec = await getRecord(context.user.doc.id);
    if (rec?.doc.status !== "active") throw forbidden("mfa_enrollment_required");
    const doc = { ...rec.doc, lastCounter: verifiedCounter(rec.doc, code, at), updatedAt: iso(at) };
    const next = rotated(context, at, "totp", doc.enrollmentId);
    await commit(context, rec, doc, next.doc, "mfa.verified", at);
    return next.issued;
  }
  async function disable({ auth, password, code }) {
    configured(); const at = clock(), context = await authorized(auth, at);
    await passwordReauth(context, password); await limited(context.user.doc.id, "code");
    const rec = await getRecord(context.user.doc.id);
    if (rec?.doc.status !== "active") throw forbidden("mfa_enrollment_required");
    const doc = { ...rec.doc, status: "disabled", lastCounter: verifiedCounter(rec.doc, code, at), disabledAt: iso(at), updatedAt: iso(at) };
    delete doc.encryptedSecret;
    const next = rotated(context, at, "none", null); next.doc.reauthAt = iso(at);
    await commit(context, rec, doc, next.doc, "mfa.disabled", at);
    return next.issued;
  }
  async function requireVerifiedAdmin(auth) {
    configured(); const at = clock(), context = await authorized(auth, at);
    const rec = await getRecord(context.user.doc.id), verifiedAt = timestamp(context.session.doc.mfaVerifiedAt);
    if (rec?.doc.status !== "active" || context.session.doc.mfaLevel !== "totp" ||
        context.session.doc.mfaGeneration !== rec.doc.enrollmentId || !Number.isFinite(verifiedAt) || verifiedAt > at || at - verifiedAt >= VERIFIED_MS) throw forbidden("mfa_required");
    return true;
  }
  return { beginEnrollment, confirmEnrollment, stepUp, disable, requireVerifiedAdmin, readiness: { ...readiness } };
}
