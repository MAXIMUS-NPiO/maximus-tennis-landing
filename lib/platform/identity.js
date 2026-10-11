/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/**
 * Identity — registration, e-mail verification, sessions, recovery, e-mail change, devices,
 * consents, deletion and export. SERVER ONLY (APP-014 … APP-017, APP-020, APP-055, APP-056).
 *
 * Rules implemented here:
 *   • one account per normalised e-mail; roles player / parent / coach combine on one account;
 *   • verification and reset tokens are stored only as SHA-256 hashes, expire by configuration,
 *     and are redeemed atomically (version check) — a replayed or expired token never activates
 *     or changes anything;
 *   • public responses never reveal whether an address is registered;
 *   • passwords: Node's scrypt (a maintained standard-library KDF, no home-made cryptography),
 *     any length up to 1024 characters so password managers work, never mailed, never logged;
 *   • web sessions are opaque identifiers kept hashed, with idle and absolute expiry, rotation on
 *     login and privilege change, logout of one or all devices;
 *   • iOS sessions use a short-lived access token and a rotating refresh token; reuse of a
 *     consumed refresh token revokes the whole session;
 *   • consents are recorded separately (terms, privacy, child data, marketing), never pre-ticked.
 */
import crypto from "node:crypto";
import { newId, randomToken, sha256 } from "./ids";
import { ApiError, badRequest, unauthorized, forbidden, conflict, validationError, tooMany } from "./errors";
import { validate, text, email as emailSpec, oneOf, many, bool, country, obj } from "./validate";
import { auditWrites, mergeCommits } from "./audit";

export const CLIENT_ROLES = ["player", "parent", "coach"];
export const ACCOUNT_STATUS = ["pending_verification", "active", "suspended", "deletion_requested", "deleted"];
export const CONSENT_TYPES = ["terms", "privacy", "child_data", "marketing"];

/** Versions of the texts a consent refers to. The hash is of the published English master. */
export const TEXT_VERSIONS = Object.freeze({ terms: "2026-09-21", privacy: "2026-09-21", child_data: "2026-10-09-draft", marketing: "2026-10-09" });

const SCRYPT = { N: 1 << 15, r: 8, p: 1, keylen: 64 };

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPassword(password, stored) {
  try {
    const [alg, N, r, p, saltB64, hashB64] = String(stored).split("$");
    if (alg !== "scrypt") return false;
    const expected = Buffer.from(hashB64, "base64");
    const actual = crypto.scryptSync(password, Buffer.from(saltB64, "base64"), expected.length, { N: Number(N), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 });
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

// Generated once per process. Unknown addresses perform the same single KDF as
// a known account with a wrong password, without a second hash on every attempt.
const DUMMY_PASSWORD_HASH = hashPassword(randomToken(32));

export function normalizeEmail(raw) {
  return String(raw || "").trim().normalize("NFKC").toLowerCase();
}

export function readIdentityConfig(env = {}) {
  const n = (k, d) => {
    const v = Number(env[k]);
    return Number.isFinite(v) && v > 0 ? v : d;
  };
  return {
    verifyTtlMinutes: n("AUTH_VERIFY_TTL_MINUTES", 60),
    resetTtlMinutes: n("AUTH_RESET_TTL_MINUTES", 30),
    emailChangeTtlMinutes: n("AUTH_EMAIL_CHANGE_TTL_MINUTES", 60),
    sessionIdleMinutes: n("AUTH_SESSION_IDLE_MINUTES", 12 * 60),
    sessionAbsoluteHours: n("AUTH_SESSION_ABSOLUTE_HOURS", 30 * 24),
    accessTtlMinutes: n("AUTH_ACCESS_TTL_MINUTES", 15),
    refreshTtlDays: n("AUTH_REFRESH_TTL_DAYS", 30),
    resendCooldownSeconds: n("AUTH_RESEND_COOLDOWN_SECONDS", 60),
    reauthWindowMinutes: n("AUTH_REAUTH_WINDOW_MINUTES", 10),
    loginAttemptsPer10Min: n("AUTH_LOGIN_ATTEMPTS_PER_10MIN", 10),
    passwordMinLength: n("AUTH_PASSWORD_MIN_LENGTH", 10),
    deletionGraceDays: n("ACCOUNT_DELETION_GRACE_DAYS", 14),
    publicBaseUrl: env.PUBLIC_BASE_URL || env.NEXT_PUBLIC_SITE_URL || "https://maximus.tennis",
  };
}

const PASSWORD_MAX = 1024;

const REGISTER_FIELDS = {
  email: emailSpec({ required: true }),
  password: text(PASSWORD_MAX, { required: true }),
  displayName: text(120, { required: true, min: 1 }),
  roles: many(CLIENT_ROLES, 3, { required: true }),
  locale: text(8, { pattern: /^[a-z]{2,3}$/ }),
  country: country(),
  consents: obj({ terms: bool({ required: true }), privacy: bool({ required: true }), marketing: bool() }, { required: true }),
};

const PROFILE_FIELDS = {
  displayName: text(120, { min: 1 }),
  locale: text(8, { pattern: /^[a-z]{2,3}$/ }),
  country: country(),
  timezone: text(64, { pattern: /^[A-Za-z_]+(?:\/[A-Za-z_+\-0-9]+)*$/ }),
  roles: many(CLIENT_ROLES, 3),
  notificationPrefs: obj({ requestUpdates: bool(), orderUpdates: bool(), securityAlerts: bool() }),
};

/** The subset of a user document that may leave the server. */
export function publicUser(u) {
  return {
    id: u.id,
    email: u.emailDisplay,
    emailVerified: u.status !== "pending_verification",
    status: u.status,
    roles: u.roles,
    displayName: u.displayName,
    locale: u.locale,
    country: u.country || null,
    timezone: u.timezone || null,
    notificationPrefs: u.notificationPrefs,
    marketingConsent: !!u.marketingConsent,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

export function createIdentity({ store, mailer, env = {}, now = () => Date.now(), locales = ["en"] }) {
  const cfg = readIdentityConfig(env);
  const iso = (ms) => new Date(ms).toISOString();
  const minutes = (m) => m * 60 * 1000;

  const notify = async (payload) => {
    try {
      return await mailer.send(payload);
    } catch {
      return { ok: false, status: "failed" };
    }
  };

  async function getUser(id) {
    return store.get("user", id);
  }

  async function findUserByEmail(normalized) {
    const id = await store.getUnique("user_email", normalized);
    return id ? getUser(id) : null;
  }

  async function rate(name, max, windowSeconds) {
    const n = await store.counter(name, windowSeconds);
    if (n > max) throw tooMany(windowSeconds);
  }

  function consentDocs({ userId, consents, locale, method, at }) {
    const writes = [];
    const indexes = [];
    for (const type of CONSENT_TYPES) {
      if (consents[type] === undefined) continue;
      const id = newId("cns");
      const doc = {
        id, subjectUserId: userId, type, basis: type === "marketing" ? "consent" : "contract", textVersion: TEXT_VERSIONS[type],
        textHash: sha256(`${type}:${TEXT_VERSIONS[type]}`), locale, at: iso(at), action: consents[type] ? "granted" : "withdrawn", method,
        withdrawal: "account settings or written request to gps@maximus.tennis",
      };
      writes.push({ type: "consent", id, doc, expectedVersion: -1 });
      indexes.push({ name: `consents:user:${userId}`, member: id, score: at });
    }
    return { writes, indexes };
  }

  function tokenDocs({ kind, userId, ttlMinutes, payload, at }) {
    const raw = randomToken(32);
    const id = sha256(raw);
    const doc = { id, kind, userId, createdAt: iso(at), expiresAt: iso(at + minutes(ttlMinutes)), usedAt: null, payload: payload || null };
    return { raw, write: { type: "token", id, doc, expectedVersion: -1 }, index: { name: `tokens:user:${userId}`, member: id, score: at } };
  }

  /** Finds a live token by its raw value; returns null for unknown, used or expired tokens alike. */
  async function liveToken(raw, kind, at) {
    if (typeof raw !== "string" || raw.length < 20 || raw.length > 200) return null;
    const rec = await store.get("token", sha256(raw));
    if (!rec || rec.doc.kind !== kind || rec.doc.usedAt || Date.parse(rec.doc.expiresAt) <= at) return null;
    return rec;
  }

  function verifyLink(raw, locale) {
    return `${cfg.publicBaseUrl}/${locale}/account/verify?token=${raw}`;
  }
  function resetLink(raw, locale) {
    return `${cfg.publicBaseUrl}/${locale}/account/reset?token=${raw}`;
  }

  /* ------------------------------------------------------------ registration */

  async function register(input, { ip, correlationId } = {}) {
    const r = validate(REGISTER_FIELDS, input);
    if (!r.ok) throw validationError(r.errors);
    const v = r.value;
    if (v.password.length < cfg.passwordMinLength) throw validationError({ password: "too_short" });
    if (v.consents.terms !== true || v.consents.privacy !== true) {
      const fe = {};
      if (v.consents.terms !== true) fe["consents.terms"] = "consent_required";
      if (v.consents.privacy !== true) fe["consents.privacy"] = "consent_required";
      throw validationError(fe);
    }
    const locale = locales.includes(v.locale) ? v.locale : "en";
    const normalized = normalizeEmail(v.email);
    const at = now();
    await rate(`register:ip:${sha256(String(ip || "unknown")).slice(0, 24)}`, 20, 3600);
    await rate(`register:email:${sha256(normalized).slice(0, 24)}`, 5, 3600);

    const existing = await findUserByEmail(normalized);
    if (existing) {
      // Same public answer as for a new address. The holder is told in writing that someone tried.
      await notify({ to: existing.doc.emailDisplay, templateKey: "register_existing", locale: existing.doc.locale || locale, params: {}, dedupeKey: `register_existing:${existing.doc.id}:${Math.floor(at / 3600000)}` });
      return { accepted: true };
    }
    const id = newId("usr");
    const user = {
      id, emailNormalized: normalized, emailDisplay: v.email.trim(), status: "pending_verification", roles: v.roles,
      displayName: v.displayName, locale, country: v.country || null, timezone: null,
      passwordHash: hashPassword(v.password), passwordChangedAt: iso(at),
      notificationPrefs: { requestUpdates: true, orderUpdates: true, securityAlerts: true },
      marketingConsent: v.consents.marketing === true,
      createdAt: iso(at), updatedAt: iso(at),
    };
    const token = tokenDocs({ kind: "verify_email", userId: id, ttlMinutes: cfg.verifyTtlMinutes, at });
    const consents = consentDocs({ userId: id, consents: v.consents, locale, method: "web_or_app_registration", at });
    const commit = mergeCommits(
      { writes: [{ type: "user", id, doc: user, expectedVersion: -1 }, token.write], uniques: [{ name: "user_email", value: normalized, owner: id }], indexes: [{ name: "users:all", member: id, score: at }, token.index] },
      consents,
      auditWrites({ now: at, actor: { userId: id }, action: "account.register", objectType: "user", objectId: id, correlationId, afterVersion: 1, meta: { roles: v.roles, locale } })
    );
    await store.commit(commit);
    await notify({ to: user.emailDisplay, templateKey: "verify_email", locale, params: { link: verifyLink(token.raw, locale), ttlMinutes: cfg.verifyTtlMinutes }, dedupeKey: `verify:${token.write.id}` });
    return { accepted: true, userId: id };
  }

  async function verifyEmail({ token }, { correlationId } = {}) {
    const at = now();
    const rec = await liveToken(token, "verify_email", at);
    if (!rec) throw badRequest("token_invalid");
    const user = await getUser(rec.doc.userId);
    if (!user) throw badRequest("token_invalid");
    const next = { ...user.doc, updatedAt: iso(at) };
    if (next.status === "pending_verification") next.status = "active";
    try {
      await store.commit(mergeCommits(
        { writes: [{ type: "token", id: rec.doc.id, doc: { ...rec.doc, usedAt: iso(at) }, expectedVersion: rec.version }, { type: "user", id: user.doc.id, doc: next, expectedVersion: user.version }] },
        auditWrites({ now: at, actor: { userId: user.doc.id }, action: "account.email_verified", objectType: "user", objectId: user.doc.id, correlationId, beforeVersion: user.version, afterVersion: user.version + 1 })
      ));
    } catch (e) {
      if (e && e.code === "version_conflict") throw badRequest("token_invalid");
      throw e;
    }
    return { verified: true, userId: user.doc.id };
  }

  async function resendVerification({ email: raw }, { ip } = {}) {
    const normalized = normalizeEmail(raw);
    if (!normalized) throw validationError({ email: "required" });
    await rate(`resend:ip:${sha256(String(ip || "unknown")).slice(0, 24)}`, 10, 3600);
    const cool = await store.counter(`resend:email:${sha256(normalized).slice(0, 24)}`, cfg.resendCooldownSeconds);
    if (cool > 1) return { accepted: true, cooldownSeconds: cfg.resendCooldownSeconds };
    const user = await findUserByEmail(normalized);
    if (user && user.doc.status === "pending_verification") {
      const at = now();
      const token = tokenDocs({ kind: "verify_email", userId: user.doc.id, ttlMinutes: cfg.verifyTtlMinutes, at });
      await store.commit({ writes: [token.write], indexes: [token.index] });
      await notify({ to: user.doc.emailDisplay, templateKey: "verify_email", locale: user.doc.locale, params: { link: verifyLink(token.raw, user.doc.locale), ttlMinutes: cfg.verifyTtlMinutes }, dedupeKey: `verify:${token.write.id}` });
    }
    return { accepted: true };
  }

  /* ------------------------------------------------------------ sessions */

  function newSessionDoc({ userId, platform, deviceLabel, at, mfaLevel }) {
    const id = newId("ses");
    return {
      id, userId, platform, deviceLabel: deviceLabel ? String(deviceLabel).slice(0, 80) : platform === "ios" ? "iPhone" : "Browser",
      createdAt: iso(at), lastSeenAt: iso(at), idleExpiresAt: iso(at + minutes(cfg.sessionIdleMinutes)), absoluteExpiresAt: iso(at + cfg.sessionAbsoluteHours * 3600 * 1000),
      revokedAt: null, revokedReason: null, reauthAt: iso(at), mfaLevel: mfaLevel || "none",
      csrf: randomToken(24),
      tokenHash: null, accessHash: null, accessExpiresAt: null, refreshHash: null, refreshExpiresAt: null, refreshGeneration: 0, previousRefreshHash: null,
    };
  }

  function issueWeb(doc, at) {
    const raw = randomToken(32);
    doc.tokenHash = sha256(raw);
    return { sessionToken: raw, csrfToken: doc.csrf, expiresAt: doc.absoluteExpiresAt };
  }

  function issueMobile(doc, at) {
    const access = randomToken(32);
    const refresh = randomToken(32);
    doc.previousRefreshHash = doc.refreshHash;
    doc.accessHash = sha256(access);
    doc.accessExpiresAt = iso(at + minutes(cfg.accessTtlMinutes));
    doc.refreshHash = sha256(refresh);
    doc.refreshExpiresAt = iso(at + cfg.refreshTtlDays * 24 * 3600 * 1000);
    doc.refreshGeneration += 1;
    return { accessToken: access, accessExpiresAt: doc.accessExpiresAt, refreshToken: refresh, refreshExpiresAt: doc.refreshExpiresAt, tokenType: "Bearer" };
  }

  async function login({ email: raw, password, platform = "web", deviceLabel }, { ip, correlationId } = {}) {
    const normalized = normalizeEmail(raw);
    if (!normalized || typeof password !== "string" || password.length > PASSWORD_MAX) throw unauthorized("invalid_credentials");
    if (!["web", "ios"].includes(platform)) throw validationError({ platform: "invalid_choice" });
    const at = now();
    await rate(`login:ip:${sha256(String(ip || "unknown")).slice(0, 24)}`, cfg.loginAttemptsPer10Min * 5, 600);
    await rate(`login:email:${sha256(normalized).slice(0, 24)}`, cfg.loginAttemptsPer10Min, 600);
    const user = await findUserByEmail(normalized);
    const matches = verifyPassword(password, user?.doc.passwordHash || DUMMY_PASSWORD_HASH);
    const ok = user && ["pending_verification", "active"].includes(user.doc.status) && matches;
    if (!ok) {
      throw unauthorized("invalid_credentials");
    }
    const doc = newSessionDoc({ userId: user.doc.id, platform, deviceLabel, at });
    const issued = platform === "ios" ? issueMobile(doc, at) : issueWeb(doc, at);
    await store.commit(mergeCommits(
      { writes: [{ type: "session", id: doc.id, doc, expectedVersion: -1 }], uniques: tokenClaims(doc), indexes: [{ name: `sessions:user:${user.doc.id}`, member: doc.id, score: at }] },
      auditWrites({ now: at, actor: { userId: user.doc.id }, action: "session.login", objectType: "session", objectId: doc.id, correlationId, meta: { platform } })
    ));
    return { session: doc, user: user.doc, ...issued };
  }

  function sessionAlive(s, at) {
    return !s.revokedAt && Date.parse(s.idleExpiresAt) > at && Date.parse(s.absoluteExpiresAt) > at;
  }

  /** Authenticates a web session token or a mobile access token. Returns { user, session } or null. */
  async function authenticate({ sessionToken, accessToken }) {
    const at = now();
    const raw = accessToken || sessionToken;
    if (!raw) return null;
    const rec = await lookupSession(raw);
    if (!rec) return null;
    const s = rec.doc;
    if (!sessionAlive(s, at)) return null;
    if (accessToken) {
      if (s.accessHash !== sha256(accessToken) || Date.parse(s.accessExpiresAt) <= at) return null;
    } else if (s.tokenHash !== sha256(sessionToken)) return null;
    const user = await getUser(s.userId);
    if (!user || !["pending_verification", "active", "deletion_requested"].includes(user.doc.status)) return null;
    // A stale touch must never restore a revoked session or superseded token hashes.
    if (at - Date.parse(s.lastSeenAt) > 60 * 1000) {
      const touched = { ...s, lastSeenAt: iso(at), idleExpiresAt: iso(at + minutes(cfg.sessionIdleMinutes)) };
      try {
        await store.commit({ writes: [{ type: "session", id: s.id, doc: touched, expectedVersion: rec.version }] });
      } catch (e) {
        if (!e || e.code !== "version_conflict") throw e;
      }
    }
    const fresh = await store.get("session", s.id);
    if (!fresh || !sessionAlive(fresh.doc, at)) return null;
    if (accessToken) {
      if (fresh.doc.accessHash !== sha256(accessToken) || Date.parse(fresh.doc.accessExpiresAt) <= at) return null;
    } else if (fresh.doc.tokenHash !== sha256(sessionToken)) return null;
    return { user: user.doc, userVersion: user.version, session: fresh.doc, sessionVersion: fresh.version };
  }

  /** Token → session: the hash of every issued token is claimed as a unique key pointing at the session. */
  async function lookupSession(raw) {
    const id = await store.getUnique("session_token", sha256(raw));
    return id ? store.get("session", id) : null;
  }

  function tokenClaims(doc) {
    const out = [];
    for (const h of [doc.tokenHash, doc.accessHash, doc.refreshHash]) if (h) out.push({ name: "session_token", value: h, owner: doc.id });
    return out;
  }

  async function refresh({ refreshToken }, { correlationId } = {}) {
    const at = now();
    const rec = await lookupSession(refreshToken);
    if (!rec) throw unauthorized("refresh_invalid");
    const s = rec.doc;
    const hash = sha256(refreshToken);
    if (s.previousRefreshHash === hash && s.refreshHash !== hash) {
      // A consumed refresh token was presented again: treat the session as compromised.
      await store.commit(mergeCommits(
        { writes: [{ type: "session", id: s.id, doc: { ...s, revokedAt: iso(at), revokedReason: "refresh_reuse" }, expectedVersion: rec.version }] },
        auditWrites({ now: at, actor: { userId: s.userId }, action: "session.revoked_refresh_reuse", objectType: "session", objectId: s.id, correlationId })
      )).catch(() => {});
      throw unauthorized("refresh_invalid");
    }
    if (s.refreshHash !== hash || !sessionAlive(s, at) || Date.parse(s.refreshExpiresAt) <= at) throw unauthorized("refresh_invalid");
    const next = { ...s, lastSeenAt: iso(at), idleExpiresAt: iso(at + minutes(cfg.sessionIdleMinutes)) };
    const oldAccess = s.accessHash;
    const issued = issueMobile(next, at);
    try {
      await store.commit({ writes: [{ type: "session", id: s.id, doc: next, expectedVersion: rec.version }], uniques: tokenClaims(next) });
    } catch (e) {
      if (e && e.code === "version_conflict") throw unauthorized("refresh_invalid");
      throw e;
    }
    // The superseded access token can no longer authenticate (hash mismatch); its claim is released.
    if (oldAccess) await store.releaseUnique("session_token", oldAccess).catch(() => {});
    return issued;
  }

  async function revokeSessions({ userId, except, reason, actor, correlationId }) {
    const at = now();
    const ids = await store.listIndex(`sessions:user:${userId}`, { limit: 500 });
    const rows = await store.getMany("session", ids);
    const writes = [];
    for (const r of rows) {
      if (r.doc.revokedAt || r.id === except) continue;
      writes.push({ type: "session", id: r.id, doc: { ...r.doc, revokedAt: iso(at), revokedReason: reason }, expectedVersion: r.version });
    }
    if (!writes.length) return 0;
    await store.commit(mergeCommits({ writes }, auditWrites({ now: at, actor: actor || { userId }, action: "session.revoke_all", objectType: "user", objectId: userId, reason, correlationId, meta: { count: writes.length } })));
    return writes.length;
  }

  async function logout({ session }, { correlationId } = {}) {
    const at = now();
    const rec = await store.get("session", session.id);
    if (!rec || rec.doc.revokedAt) return { revoked: false };
    await store.commit(mergeCommits(
      { writes: [{ type: "session", id: session.id, doc: { ...rec.doc, revokedAt: iso(at), revokedReason: "logout" }, expectedVersion: rec.version }] },
      auditWrites({ now: at, actor: { userId: session.userId }, action: "session.logout", objectType: "session", objectId: session.id, correlationId })
    ));
    return { revoked: true };
  }

  async function logoutAll({ user, session }, ctx = {}) {
    const n = await revokeSessions({ userId: user.id, reason: "logout_all", actor: { userId: user.id }, correlationId: ctx.correlationId });
    return { revoked: n };
  }

  async function listDevices({ user, session }) {
    const at = now();
    const ids = await store.listIndex(`sessions:user:${user.id}`, { limit: 100 });
    const rows = await store.getMany("session", ids);
    return rows.filter((r) => sessionAlive(r.doc, at)).map((r) => ({
      id: r.doc.id, platform: r.doc.platform, deviceLabel: r.doc.deviceLabel, createdAt: r.doc.createdAt, lastSeenAt: r.doc.lastSeenAt, current: session ? r.doc.id === session.id : false,
    }));
  }

  async function revokeDevice({ user, sessionId }, { correlationId } = {}) {
    const rec = await store.get("session", sessionId);
    if (!rec || rec.doc.userId !== user.id) throw new ApiError(404, "not_found");
    if (rec.doc.revokedAt) return { revoked: false };
    const at = now();
    await store.commit(mergeCommits(
      { writes: [{ type: "session", id: sessionId, doc: { ...rec.doc, revokedAt: iso(at), revokedReason: "revoked_by_user" }, expectedVersion: rec.version }] },
      auditWrites({ now: at, actor: { userId: user.id }, action: "session.revoke_device", objectType: "session", objectId: sessionId, correlationId })
    ));
    return { revoked: true };
  }

  /** Re-authentication for sensitive actions: the password is checked and the session stamped. */
  async function reauthenticate({ user, session, password }, { correlationId } = {}) {
    const at = now();
    await rate(`reauth:${user.id}`, 10, 600);
    const fresh = await getUser(user.id);
    if (!fresh || typeof password !== "string" || !verifyPassword(password, fresh.doc.passwordHash)) throw unauthorized("invalid_credentials");
    const rec = await store.get("session", session.id);
    if (!rec) throw unauthorized("session_invalid");
    await store.commit({ writes: [{ type: "session", id: session.id, doc: { ...rec.doc, reauthAt: iso(at) }, expectedVersion: rec.version }] });
    return { reauthenticatedAt: iso(at) };
  }

  function requireRecentReauth(session) {
    const at = now();
    const rec = session.reauthAt ? Date.parse(session.reauthAt) : 0;
    if (at - rec > minutes(cfg.reauthWindowMinutes)) throw new ApiError(403, "reauth_required", { details: { windowMinutes: cfg.reauthWindowMinutes } });
  }

  /* ------------------------------------------------------------ recovery */

  async function requestPasswordReset({ email: raw }, { ip } = {}) {
    const normalized = normalizeEmail(raw);
    if (!normalized) throw validationError({ email: "required" });
    await rate(`reset:ip:${sha256(String(ip || "unknown")).slice(0, 24)}`, 10, 3600);
    await rate(`reset:email:${sha256(normalized).slice(0, 24)}`, 3, 3600);
    const user = await findUserByEmail(normalized);
    if (user && ["active", "pending_verification"].includes(user.doc.status)) {
      const at = now();
      const token = tokenDocs({ kind: "password_reset", userId: user.doc.id, ttlMinutes: cfg.resetTtlMinutes, at });
      await store.commit({ writes: [token.write], indexes: [token.index] });
      await notify({ to: user.doc.emailDisplay, templateKey: "password_reset", locale: user.doc.locale, params: { link: resetLink(token.raw, user.doc.locale), ttlMinutes: cfg.resetTtlMinutes }, dedupeKey: `reset:${token.write.id}` });
    }
    return { accepted: true };
  }

  async function resetPassword({ token, newPassword }, { correlationId } = {}) {
    const at = now();
    if (typeof newPassword !== "string" || newPassword.length < cfg.passwordMinLength || newPassword.length > PASSWORD_MAX) throw validationError({ newPassword: "too_short" });
    const rec = await liveToken(token, "password_reset", at);
    if (!rec) throw badRequest("token_invalid");
    const user = await getUser(rec.doc.userId);
    if (!user) throw badRequest("token_invalid");
    const next = { ...user.doc, passwordHash: hashPassword(newPassword), passwordChangedAt: iso(at), updatedAt: iso(at) };
    if (next.status === "pending_verification") next.status = "active"; // the link proved control of the address
    try {
      await store.commit(mergeCommits(
        { writes: [{ type: "token", id: rec.doc.id, doc: { ...rec.doc, usedAt: iso(at) }, expectedVersion: rec.version }, { type: "user", id: user.doc.id, doc: next, expectedVersion: user.version }] },
        auditWrites({ now: at, actor: { userId: user.doc.id }, action: "account.password_reset", objectType: "user", objectId: user.doc.id, correlationId })
      ));
    } catch (e) {
      if (e && e.code === "version_conflict") throw badRequest("token_invalid");
      throw e;
    }
    await revokeSessions({ userId: user.doc.id, reason: "password_reset", correlationId });
    await notify({ to: user.doc.emailDisplay, templateKey: "security_password_changed", locale: user.doc.locale, params: {}, dedupeKey: `pwchanged:${user.doc.id}:${at}` });
    return { reset: true };
  }

  async function changePassword({ user, session, currentPassword, newPassword }, { correlationId } = {}) {
    const at = now();
    if (typeof newPassword !== "string" || newPassword.length < cfg.passwordMinLength || newPassword.length > PASSWORD_MAX) throw validationError({ newPassword: "too_short" });
    const fresh = await getUser(user.id);
    if (!fresh || !verifyPassword(String(currentPassword || ""), fresh.doc.passwordHash)) throw unauthorized("invalid_credentials");
    await store.commit(mergeCommits(
      { writes: [{ type: "user", id: user.id, doc: { ...fresh.doc, passwordHash: hashPassword(newPassword), passwordChangedAt: iso(at), updatedAt: iso(at) }, expectedVersion: fresh.version }] },
      auditWrites({ now: at, actor: { userId: user.id }, action: "account.password_changed", objectType: "user", objectId: user.id, correlationId })
    ));
    await revokeSessions({ userId: user.id, except: session.id, reason: "password_changed", correlationId });
    await notify({ to: fresh.doc.emailDisplay, templateKey: "security_password_changed", locale: fresh.doc.locale, params: {}, dedupeKey: `pwchanged:${user.id}:${at}` });
    return { changed: true };
  }

  /* ------------------------------------------------------------ e-mail change */

  async function requestEmailChange({ user, session, newEmail }, { correlationId } = {}) {
    requireRecentReauth(session);
    const r = validate({ newEmail: emailSpec({ required: true }) }, { newEmail });
    if (!r.ok) throw validationError(r.errors);
    const normalized = normalizeEmail(r.value.newEmail);
    const at = now();
    await rate(`emailchange:${user.id}`, 3, 3600);
    if (normalized === user.emailNormalized) throw validationError({ newEmail: "invalid" });
    const taken = await store.getUnique("user_email", normalized);
    if (!taken) {
      const token = tokenDocs({ kind: "email_change", userId: user.id, ttlMinutes: cfg.emailChangeTtlMinutes, at, payload: { newEmailNormalized: normalized, newEmailDisplay: r.value.newEmail.trim() } });
      await store.commit(mergeCommits({ writes: [token.write], indexes: [token.index] }, auditWrites({ now: at, actor: { userId: user.id }, action: "account.email_change_requested", objectType: "user", objectId: user.id, correlationId })));
      await notify({ to: r.value.newEmail.trim(), templateKey: "email_change_verify", locale: user.locale, params: { link: `${cfg.publicBaseUrl}/${user.locale}/account/verify?change=${token.raw}` }, dedupeKey: `emailchange:${token.write.id}` });
    }
    // The old address is always told that a change was requested (no personal data beyond that).
    await notify({ to: user.emailDisplay, templateKey: "email_change_notice", locale: user.locale, params: {}, dedupeKey: `emailchangenotice:${user.id}:${Math.floor(at / 600000)}` });
    return { accepted: true };
  }

  async function confirmEmailChange({ token, user }, { correlationId } = {}) {
    const at = now();
    const rec = await liveToken(token, "email_change", at);
    if (!rec || !user || rec.doc.userId !== user.id) throw badRequest("token_invalid");
    const fresh = await getUser(user.id);
    if (!fresh) throw badRequest("token_invalid");
    const { newEmailNormalized, newEmailDisplay } = rec.doc.payload;
    const old = fresh.doc.emailNormalized;
    const next = { ...fresh.doc, emailNormalized: newEmailNormalized, emailDisplay: newEmailDisplay, updatedAt: iso(at) };
    try {
      await store.commit(mergeCommits(
        { writes: [{ type: "token", id: rec.doc.id, doc: { ...rec.doc, usedAt: iso(at) }, expectedVersion: rec.version }, { type: "user", id: user.id, doc: next, expectedVersion: fresh.version }], uniques: [{ name: "user_email", value: newEmailNormalized, owner: user.id }] },
        auditWrites({ now: at, actor: { userId: user.id }, action: "account.email_changed", objectType: "user", objectId: user.id, correlationId })
      ));
    } catch (e) {
      if (e && (e.code === "version_conflict" || e.code === "unique_conflict")) throw badRequest("token_invalid");
      throw e;
    }
    await store.releaseUnique("user_email", old);
    await notify({ to: fresh.doc.emailDisplay, templateKey: "email_changed_old_address", locale: fresh.doc.locale, params: {}, dedupeKey: `emailchanged:${user.id}:${at}` });
    return { changed: true };
  }

  /* ------------------------------------------------------------ profile, consents, deletion, export */

  async function updateProfile({ user, patch }, { correlationId } = {}) {
    const r = validate(PROFILE_FIELDS, patch);
    if (!r.ok) throw validationError(r.errors);
    const fresh = await getUser(user.id);
    const at = now();
    const next = { ...fresh.doc, ...r.value, updatedAt: iso(at) };
    if (r.value.locale && !locales.includes(r.value.locale)) throw validationError({ locale: "invalid_choice" });
    if (r.value.roles && r.value.roles.length === 0) throw validationError({ roles: "required" });
    if (r.value.notificationPrefs) next.notificationPrefs = { ...fresh.doc.notificationPrefs, ...r.value.notificationPrefs };
    await store.commit(mergeCommits(
      { writes: [{ type: "user", id: user.id, doc: next, expectedVersion: fresh.version }] },
      auditWrites({ now: at, actor: { userId: user.id }, action: "account.profile_updated", objectType: "user", objectId: user.id, correlationId, beforeVersion: fresh.version, afterVersion: fresh.version + 1, meta: { fields: Object.keys(r.value) } })
    ));
    return publicUser(next);
  }

  async function setMarketingConsent({ user, granted }, { correlationId } = {}) {
    const fresh = await getUser(user.id);
    const at = now();
    const consents = consentDocs({ userId: user.id, consents: { marketing: granted === true }, locale: fresh.doc.locale, method: "account_settings", at });
    await store.commit(mergeCommits(
      { writes: [{ type: "user", id: user.id, doc: { ...fresh.doc, marketingConsent: granted === true, updatedAt: iso(at) }, expectedVersion: fresh.version }] },
      consents,
      auditWrites({ now: at, actor: { userId: user.id }, action: granted ? "consent.marketing_granted" : "consent.marketing_withdrawn", objectType: "user", objectId: user.id, correlationId })
    ));
    return { marketingConsent: granted === true };
  }

  async function listConsents({ userId }) {
    const ids = await store.listIndex(`consents:user:${userId}`, { limit: 200 });
    return (await store.getMany("consent", ids)).map((r) => r.doc);
  }

  async function requestDeletion({ user, session, password }, { correlationId } = {}) {
    const at = now();
    const fresh = await getUser(user.id);
    if (!fresh || !verifyPassword(String(password || ""), fresh.doc.passwordHash)) throw unauthorized("invalid_credentials");
    const scheduled = iso(at + cfg.deletionGraceDays * 24 * 3600 * 1000);
    await store.commit(mergeCommits(
      { writes: [{ type: "user", id: user.id, doc: { ...fresh.doc, status: "deletion_requested", deletionRequestedAt: iso(at), deletionScheduledFor: scheduled, updatedAt: iso(at) }, expectedVersion: fresh.version }], indexes: [{ name: "users:deletion_requested", member: user.id, score: at }] },
      auditWrites({ now: at, actor: { userId: user.id }, action: "account.deletion_requested", objectType: "user", objectId: user.id, correlationId, meta: { scheduledFor: scheduled } })
    ));
    await revokeSessions({ userId: user.id, reason: "deletion_requested", correlationId });
    await notify({ to: fresh.doc.emailDisplay, templateKey: "deletion_requested", locale: fresh.doc.locale, params: { scheduledFor: scheduled }, dedupeKey: `deletion:${user.id}` });
    return { status: "deletion_requested", scheduledFor: scheduled, retained: "orders, invoices, payment and ledger records are kept for the statutory retention period with the account identifier pseudonymised" };
  }

  /** Executes a due deletion: personal data minimised, e-mail uniqueness released, record kept as a tombstone. */
  async function executeDeletion({ userId, actor }, { correlationId } = {}) {
    const fresh = await getUser(userId);
    if (!fresh || fresh.doc.status !== "deletion_requested") throw conflict("not_deletion_requested");
    const at = now();
    const tomb = {
      id: userId, status: "deleted", emailNormalized: null, emailDisplay: null, emailHash: sha256(fresh.doc.emailNormalized), displayName: null, roles: [], passwordHash: null,
      locale: fresh.doc.locale, country: null, timezone: null, notificationPrefs: {}, marketingConsent: false, createdAt: fresh.doc.createdAt, updatedAt: iso(at), deletedAt: iso(at),
    };
    await store.commit(mergeCommits(
      { writes: [{ type: "user", id: userId, doc: tomb, expectedVersion: fresh.version }], unindexes: [{ name: "users:deletion_requested", member: userId }] },
      auditWrites({ now: at, actor: actor || { kind: "system" }, action: "account.deleted", objectType: "user", objectId: userId, correlationId })
    ));
    await store.releaseUnique("user_email", fresh.doc.emailNormalized);
    return { deleted: true };
  }

  async function exportIdentity({ user }) {
    const fresh = await getUser(user.id);
    return { profile: publicUser(fresh.doc), consents: await listConsents({ userId: user.id }), devices: await listDevices({ user: fresh.doc }) };
  }

  /* ------------------------------------------------------------ operational roles bootstrap */

  /**
   * Initial administrators are named through configuration (PLATFORM_OWNER_EMAILS), never through
   * the client. The owner role is granted when that address verifies its e-mail; every grant is
   * audited. Further operational roles are assigned by an owner through the admin API.
   */
  function ownerEmails() {
    return String(env.PLATFORM_OWNER_EMAILS || "").split(",").map(normalizeEmail).filter(Boolean);
  }

  return {
    cfg, hashPassword, verifyPassword, normalizeEmail, publicUser, ownerEmails,
    getUser, findUserByEmail,
    register, verifyEmail, resendVerification,
    login, authenticate, refresh, logout, logoutAll, listDevices, revokeDevice, reauthenticate, requireRecentReauth, revokeSessions,
    requestPasswordReset, resetPassword, changePassword,
    requestEmailChange, confirmEmailChange,
    updateProfile, setMarketingConsent, listConsents, requestDeletion, executeDeletion, exportIdentity,
  };
}
