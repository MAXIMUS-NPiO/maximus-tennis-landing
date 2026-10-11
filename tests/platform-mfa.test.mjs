/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { createMfa, totp, decodeBase32, readMfaReadiness } from "../lib/platform/mfa.js";
import { createMemoryStore, createUpstashStore } from "../lib/platform/store.js";
import { hashPassword, createIdentity } from "../lib/platform/identity.js";
import { ORGANIZATION } from "../lib/platform/access.js";
import { sha256 } from "../lib/platform/ids.js";
import { startTestRedis, startBridge, RedisConn } from "./redis-rest-bridge.mjs";

// Synthetic fixture only. No operator credentials or existing account documents are read.
const fixtureKey = Buffer.from(Array.from({ length: 32 }, (_, n) => n)).toString("base64");
const env = { NODE_ENV: "production", ADMIN_MFA_PROVIDER: "totp", ADMIN_MFA_ENCRYPTION_KEY: fixtureKey };
const password = "fixture-password-for-local-mfa-only";
const passwordHash = hashPassword(password);
const initial = Date.parse("2026-10-10T12:00:00Z");
const iso = (n) => new Date(n).toISOString();
const mfaId = (u = "u") => `${ORGANIZATION}:${u}`;

async function fixture(store = createMemoryStore()) {
  let at = initial;
  const mfa = createMfa({ store, env, now: () => at });
  const identity = createIdentity({ store, mailer: { send: async () => ({ ok: true }) }, now: () => at });
  async function session(userId = "u", sessionId = "s") {
    const raw = `synthetic-token-${sessionId}`;
    const doc = { id: sessionId, userId, platform: "web", tokenHash: sha256(raw), csrf: `csrf-${sessionId}`,
      revokedAt: null, reauthAt: iso(at), mfaLevel: "none", lastSeenAt: iso(at),
      idleExpiresAt: iso(at + 3600000), absoluteExpiresAt: iso(at + 86400000) };
    await store.commit({ writes: [{ type: "session", id: sessionId, doc, expectedVersion: -1 }],
      uniques: [{ name: "session_token", value: doc.tokenHash, owner: sessionId }] });
    return raw;
  }
  async function user(userId = "u", roleFields = {}) {
    const roleId = `role-${userId}`;
    await store.commit({ writes: [
      { type: "user", id: userId, doc: { id: userId, status: "active", passwordHash, passwordChangedAt: iso(at - 1000) }, expectedVersion: -1 },
      { type: "role", id: roleId, doc: { id: roleId, userId, role: "owner", organizationId: ORGANIZATION, revokedAt: null, ...roleFields }, expectedVersion: -1 }],
      indexes: [{ name: `roles:user:${userId}`, member: roleId, score: at }] });
  }
  async function auth(userId = "u", sessionId = "s") {
    const [user, session] = await Promise.all([store.get("user", userId), store.get("session", sessionId)]);
    return { user: user?.doc, userVersion: user?.version, session: session?.doc, sessionVersion: session?.version };
  }
  async function change(type, id, patch) {
    const rec = await store.get(type, id);
    await store.commit({ writes: [{ type, id, doc: { ...rec.doc, ...patch }, expectedVersion: rec.version }] });
  }
  await user(); const raw = await session();
  async function enroll() {
    const pending = await mfa.beginEnrollment({ auth: await auth(), password });
    const secret = decodeBase32(pending.secret);
    const issued = await mfa.confirmEnrollment({ auth: await auth(), enrollmentId: pending.enrollmentId, code: totp(secret, { at }) });
    return { ...pending, issued, secret };
  }
  return { store, mfa, identity, user, session, auth, change, enroll, raw, at: () => at, advance: (ms) => { at += ms; } };
}

test("RFC 6238 Appendix B: all 18 SHA1/SHA256/SHA512 vectors, including year 2603", () => {
  const vectors = [
    [59, "94287082", "46119246", "90693936"],
    [1111111109, "07081804", "68084774", "25091201"],
    [1111111111, "14050471", "67062674", "99943326"],
    [1234567890, "89005924", "91819424", "93441116"],
    [2000000000, "69279037", "90698825", "38618901"],
    [20000000000, "65353130", "77737706", "47863826"],
  ];
  const seeds = ["12345678901234567890", "12345678901234567890123456789012", "1234567890123456789012345678901234567890123456789012345678901234"];
  for (const [seconds, ...codes] of vectors) ["sha1", "sha256", "sha512"].forEach((algorithm, n) => {
    assert.equal(totp(Buffer.from(seeds[n]), { at: seconds * 1000, digits: 8, algorithm }), codes[n]);
  });
  assert.throws(() => totp(Buffer.from(seeds[0]), { counter: -1 }), { code: "mfa_invalid_parameters" });
});

test("readiness contains booleans only and production cannot disable the MFA requirement", () => {
  assert.deepEqual(readMfaReadiness({ ...env, ADMIN_REQUIRE_MFA: "false" }),
    { providerSupported: true, encryptionKeyConfigured: true, configured: true, required: true });
  assert.equal(readMfaReadiness({ ...env, ADMIN_MFA_PROVIDER: "arbitrary" }).configured, false);
  for (const key of [undefined, "password", Buffer.alloc(32).toString("base64"), fixtureKey.slice(1)]) {
    assert.equal(readMfaReadiness({ ...env, ADMIN_MFA_ENCRYPTION_KEY: key }).encryptionKeyConfigured, false);
  }
});

test("enrollment encrypts secrets, stays pending until a valid code and rotates token/CSRF on activation", async () => {
  const f = await fixture();
  const pending = await f.mfa.beginEnrollment({ auth: await f.auth(), password });
  const rec = await f.store.get("mfa", mfaId());
  assert.equal(rec.doc.status, "pending");
  assert.equal(JSON.stringify(rec).includes(pending.secret), false);
  assert.equal(rec.doc.encryptedSecret.data.length > 0, true);
  assert.equal(new URL(pending.otpauthUri).searchParams.get("secret"), pending.secret);
  await assert.rejects(f.mfa.requireVerifiedAdmin(await f.auth()), { code: "mfa_required" });
  const code = totp(decodeBase32(pending.secret), { at: f.at() });
  const issued = await f.mfa.confirmEnrollment({ auth: await f.auth(), enrollmentId: pending.enrollmentId, code });
  assert.notEqual(issued.sessionToken, f.raw); assert.notEqual(issued.csrfToken, "csrf-s");
  assert.equal(issued.mfaLevel, "totp");
  assert.equal(await f.identity.authenticate({ sessionToken: f.raw }), null);
  assert.ok(await f.identity.authenticate({ sessionToken: issued.sessionToken }));
  assert.equal(await f.mfa.requireVerifiedAdmin(await f.auth()), true);
  const audits = await f.store.getMany("audit", await f.store.listIndex("audit:all"));
  const auditJson = JSON.stringify(audits);
  for (const sensitive of [pending.secret, pending.otpauthUri, code, password, passwordHash, issued.sessionToken, fixtureKey]) assert.equal(auditJson.includes(sensitive), false);
});

test("unverified/suspended users, cross-tenant/foreign/revoked roles and wrong passwords cannot enroll", async () => {
  for (const status of ["pending_verification", "suspended", "deleted", "deletion_requested"]) {
    const f = await fixture(); await f.change("user", "u", { status });
    await assert.rejects(f.mfa.beginEnrollment({ auth: await f.auth(), password }), { code: "verified_account_required" });
    assert.equal(await f.store.get("mfa", mfaId()), null);
  }
  for (const patch of [{ organizationId: "other" }, { userId: "other" }, { revokedAt: iso(initial) }, { role: "player" }]) {
    const f = await fixture(); await f.change("role", "role-u", patch);
    await assert.rejects(f.mfa.beginEnrollment({ auth: await f.auth(), password }), { code: "capability_required" });
    assert.equal(await f.store.get("mfa", mfaId()), null);
  }
  const f = await fixture();
  await assert.rejects(f.mfa.beginEnrollment({ auth: await f.auth(), password: "wrong" }), { code: "reauth_failed" });
  assert.equal(await f.store.get("mfa", mfaId()), null);
});

test("pending challenges expire, bind to the original user/session/token and require unchanged password", async () => {
  for (const mismatch of ["expiry", "session", "user", "rotation", "password_change"]) {
    const f = await fixture(); const pending = await f.mfa.beginEnrollment({ auth: await f.auth(), password });
    let auth = await f.auth();
    if (mismatch === "expiry") f.advance(300000);
    if (mismatch === "session") { await f.session("u", "s2"); auth = await f.auth("u", "s2"); }
    if (mismatch === "user") { await f.user("u2"); await f.session("u2", "s2"); auth = await f.auth("u2", "s2"); }
    if (mismatch === "rotation") { await f.change("session", "s", { tokenHash: sha256("replacement") }); auth = await f.auth(); }
    if (mismatch === "password_change") { f.advance(1); await f.change("user", "u", { passwordChangedAt: iso(f.at()) }); auth = await f.auth(); }
    const code = totp(decodeBase32(pending.secret), { at: f.at() });
    await assert.rejects(f.mfa.confirmEnrollment({ auth, enrollmentId: pending.enrollmentId, code }),
      { code: mismatch === "password_change" ? "reauth_required" : "mfa_enrollment_invalid" });
    assert.equal((await f.store.get("mfa", mfaId())).doc.status, "pending");
  }
});

async function replayConcurrency(f) {
  const enrolled = await f.enroll();
  await assert.rejects(f.mfa.stepUp({ auth: await f.auth(), code: totp(enrolled.secret, { at: f.at() }) }), { code: "mfa_code_invalid" });
  f.advance(30000); await f.session("u", "s2");
  const code = totp(enrolled.secret, { at: f.at() });
  const one = await f.auth(), two = await f.auth("u", "s2");
  const results = await Promise.allSettled([f.mfa.stepUp({ auth: one, code }), f.mfa.stepUp({ auth: two, code })]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(results.filter((r) => r.status === "rejected").length, 1);
  assert.ok(["mfa_state_changed", "mfa_code_invalid"].includes(results.find((r) => r.status === "rejected").reason.code));
  await assert.rejects(f.mfa.stepUp({ auth: await f.auth(), code }), { code: "mfa_code_invalid" });
  assert.equal((await f.store.get("mfa", mfaId())).doc.lastCounter, Math.floor(f.at() / 30000));
}
test("a code is consumed once across sessions and concurrent step-up commits", async () => replayConcurrency(await fixture()));

test("verification accepts at most one time step drift and maintains a monotonic counter", async () => {
  const f = await fixture(); const e = await f.enroll(); f.advance(30000);
  const current = Math.floor(f.at() / 30000);
  await assert.rejects(f.mfa.stepUp({ auth: await f.auth(), code: totp(e.secret, { counter: current + 2 }) }), { code: "mfa_code_invalid" });
  await f.mfa.stepUp({ auth: await f.auth(), code: totp(e.secret, { counter: current + 1 }) });
  f.advance(30000);
  await assert.rejects(f.mfa.stepUp({ auth: await f.auth(), code: totp(e.secret, { at: f.at() }) }), { code: "mfa_code_invalid" });
});

test("invalid and malformed codes share a bounded per-user rate limit", async () => {
  const f = await fixture(); await f.enroll();
  // Activation consumed attempt one; four failed attempts exhaust the five-attempt window.
  for (const code of [123456, "123", "0000000", "123456\n"]) await assert.rejects(f.mfa.stepUp({ auth: await f.auth(), code }), { code: "mfa_code_invalid" });
  await assert.rejects(f.mfa.stepUp({ auth: await f.auth(), code: "000000" }), { code: "rate_limited", status: 429 });
});

test("revocation, rotation, suspension and role revoke racing a commit never restore authority", async () => {
  for (const race of ["logout", "rotation", "suspension", "role"]) {
    const f = await fixture(); const e = await f.enroll(); f.advance(30000);
    const original = f.store.commit.bind(f.store); let raced = false;
    f.store.commit = async (c) => {
      if (!raced && c.writes?.some((w) => w.type === "mfa")) {
        raced = true;
        const type = race === "suspension" ? "user" : race === "role" ? "role" : "session";
        const id = type === "user" ? "u" : type === "role" ? "role-u" : "s";
        const rec = await f.store.get(type, id);
        const patch = race === "logout" ? { revokedAt: iso(f.at()) } : race === "rotation" ? { tokenHash: sha256("new-token") } : race === "suspension" ? { status: "suspended" } : { revokedAt: iso(f.at()) };
        await original({ writes: [{ type, id, doc: { ...rec.doc, ...patch }, expectedVersion: rec.version }] });
      }
      return original(c);
    };
    const before = await f.store.get("mfa", mfaId()), requestAuth = await f.auth();
    await assert.rejects(f.mfa.stepUp({ auth: requestAuth, code: totp(e.secret, { at: f.at() }) }), { code: "mfa_state_changed" });
    assert.deepEqual(await f.store.get("mfa", mfaId()), before);
    if (race === "logout") assert.ok((await f.store.get("session", "s")).doc.revokedAt);
    if (race === "rotation") assert.equal((await f.store.get("session", "s")).doc.tokenHash, sha256("new-token"));
    await assert.rejects(f.mfa.requireVerifiedAdmin(requestAuth));
  }
});

test("stale authenticated token, expired sessions and arbitrary MFA labels fail closed", async () => {
  const f = await fixture(); await f.enroll();
  const stale = await f.auth(); await f.change("session", "s", { tokenHash: sha256("another-token") });
  await assert.rejects(f.mfa.stepUp({ auth: stale, code: "000000" }), { code: "session_invalid" });
  await f.change("session", "s", { mfaLevel: "anything-else" });
  await assert.rejects(f.mfa.requireVerifiedAdmin(await f.auth()), { code: "mfa_required" });
  await f.change("session", "s", { mfaLevel: "totp", mfaVerifiedAt: iso(f.at() + 1) });
  await assert.rejects(f.mfa.requireVerifiedAdmin(await f.auth()), { code: "mfa_required" });
  await f.change("session", "s", { idleExpiresAt: iso(f.at()) });
  await assert.rejects(f.mfa.requireVerifiedAdmin(await f.auth()), { code: "session_invalid" });
});

test("ciphertext is authenticated and cannot move between users or enrollment generations", async () => {
  const f = await fixture(); const e = await f.enroll(); f.advance(30000);
  await f.user("u2"); await f.session("u2", "s2");
  const rec = await f.store.get("mfa", mfaId());
  await f.store.commit({ writes: [{ type: "mfa", id: mfaId("u2"), doc: { ...rec.doc, id: mfaId("u2"), userId: "u2" }, expectedVersion: -1 }] });
  await assert.rejects(f.mfa.stepUp({ auth: await f.auth("u2", "s2"), code: totp(e.secret, { at: f.at() }) }), { code: "mfa_secret_unavailable" });
  await f.change("mfa", mfaId(), { enrollmentId: "different-generation" });
  await assert.rejects(f.mfa.stepUp({ auth: await f.auth(), code: totp(e.secret, { at: f.at() }) }), { code: "mfa_secret_unavailable" });
});

test("disable needs fresh password+unused code, rotates to none and immediately invalidates other sessions", async () => {
  const f = await fixture(); const e = await f.enroll(); f.advance(30000);
  await f.session("u", "s2");
  await f.mfa.stepUp({ auth: await f.auth("u", "s2"), code: totp(e.secret, { at: f.at() }) });
  f.advance(30000);
  const code = totp(e.secret, { at: f.at() });
  await assert.rejects(f.mfa.disable({ auth: await f.auth(), password: "incorrect", code }), { code: "reauth_failed" });
  const issued = await f.mfa.disable({ auth: await f.auth(), password, code });
  assert.equal(issued.mfaLevel, "none"); assert.notEqual(issued.csrfToken, e.issued.csrfToken);
  assert.equal((await f.store.get("mfa", mfaId())).doc.encryptedSecret, undefined);
  for (const id of ["s", "s2"]) await assert.rejects(f.mfa.requireVerifiedAdmin(await f.auth("u", id)), { code: "mfa_required" });
  const replacement = await f.mfa.beginEnrollment({ auth: await f.auth(), password });
  assert.notEqual(replacement.enrollmentId, e.enrollmentId);
  await assert.rejects(f.mfa.requireVerifiedAdmin(await f.auth("u", "s2")), { code: "mfa_required" });
});

test("step-up expires after 15 minutes and missing/unsupported provider never grants access", async () => {
  const f = await fixture(); await f.enroll(); f.advance(15 * 60000);
  await assert.rejects(f.mfa.requireVerifiedAdmin(await f.auth()), { code: "mfa_required" });
  for (const badEnv of [{ ...env, ADMIN_MFA_PROVIDER: "sms" }, { ...env, ADMIN_MFA_ENCRYPTION_KEY: undefined }, { NODE_ENV: "production", ADMIN_REQUIRE_MFA: "false" }]) {
    const service = createMfa({ store: f.store, env: badEnv, now: f.at });
    await assert.rejects(service.requireVerifiedAdmin(await f.auth()), { code: "mfa_not_configured", status: 503 });
    await assert.rejects(service.beginEnrollment({ auth: await f.auth(), password }), { code: "mfa_not_configured" });
  }
});

describe("MFA compare-and-swap on native Redis", () => {
  let redis, bridge, conn, store, unavailable;
  before(async () => {
    try {
      redis = await startTestRedis(6394); conn = new RedisConn(6394); await conn.ready;
      bridge = await startBridge({ redisPort: 6394, token: "mfa-native-fixture-only" });
      store = createUpstashStore({ url: bridge.url, token: "mfa-native-fixture-only" });
    } catch (error) {
      bridge?.close(); conn?.close(); await redis?.close();
      if (process.env.INTAKE_REQUIRE_REDIS === "1" || !["ENOENT", "EACCES", "EPERM"].includes(error.code)) throw error;
      unavailable = `native Redis unavailable: ${error.code}`;
    }
  });
  after(async () => { bridge?.close(); conn?.close(); await redis?.close(); });
  test("real shared store accepts exactly one replaying concurrent session and commits audit with authority", async (t) => {
    if (unavailable) return t.skip(unavailable);
    const f = await fixture(store);
    await replayConcurrency(f);
    const audits = await store.getMany("audit", await store.listIndex("audit:all"));
    assert.deepEqual(audits.map((r) => r.doc.action).sort(), ["mfa.enabled", "mfa.enrollment_started", "mfa.verified"]);
  });
});
