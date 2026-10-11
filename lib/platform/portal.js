/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/** Customer/admin portal HTTP boundary. Server only; no seeded accounts or money. */
import { createIdentity, publicUser } from "./identity";
import { createAccess, capabilitiesFor, ORGANIZATION } from "./access";
import { resolvePlatformStore } from "./store";
import { readRestCredentials } from "../intake/store";
import { clientIp } from "../intake/service";
import { createLedgerService } from "./ledger";
import { ApiError, badRequest, forbidden, notFound, unauthorized, unavailable, errorBody } from "./errors";
import { auditWrites, mergeCommits } from "./audit";
import { correlationId, safeEqual, sha256 } from "./ids";
import { EMAIL_RE } from "./validate";
import { site } from "../../data/site";
import { readFlags } from "./flags";

export const PORTAL_PROJECT_ID = "tennis";
const MAX_BYTES = 16 * 1024;
const BODY_TIMEOUT_MS = 5000;
const HEADERS = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store, private", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };
const response = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers: { ...HEADERS, ...headers } });

function publicOrigin(env) {
  let url;
  try { url = new URL(env.PUBLIC_BASE_URL || env.NEXT_PUBLIC_SITE_URL || "https://maximus.tennis"); } catch { throw unavailable("portal_unavailable"); }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.username || url.password || (url.protocol !== "https:" && !(env.NODE_ENV !== "production" && loopback && url.protocol === "http:"))) throw unavailable("portal_unavailable");
  return url.origin;
}

/** Uses SMTP credentials on the server; client recipients come from identity, never staff config. */
export function createPortalMailer(env = {}, { transportFactory } = {}) {
  const production = env.NODE_ENV === "production";
  const noAuth = !production && env.SMTP_AUTH === "none";
  const port = Number(env.SMTP_PORT || 465);
  const from = env.LEAD_NOTIFY_FROM || env.SMTP_USER;
  if (!env.SMTP_HOST || !from || /[\r\n]/.test(from) || !Number.isInteger(port) || port < 1 || port > 65535 || (!noAuth && !(env.SMTP_USER && env.SMTP_PASS))) return null;
  const secure = env.SMTP_SECURE ? env.SMTP_SECURE === "true" : port === 465;
  const plainLocal = !production && ["127.0.0.1", "localhost"].includes(env.SMTP_HOST) && env.SMTP_REQUIRE_TLS === "false";
  let transport;
  async function getTransport() {
    if (!transport) transport = transportFactory ? await transportFactory() : (await import("nodemailer")).default.createTransport({
      host: env.SMTP_HOST, port, secure, requireTLS: !secure && !plainLocal, ignoreTLS: plainLocal,
      ...(noAuth ? {} : { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } }),
      connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
    });
    return transport;
  }
  return {
    async verify() { return (await getTransport()).verify(); },
    async send({ to, templateKey, params = {}, dedupeKey }) {
      if (typeof to !== "string" || !EMAIL_RE.test(to) || /[\r\n]/.test(to)) throw unavailable("portal_mail_unavailable");
      let subject, text;
      if (templateKey === "verify_email") {
        const link = new URL(params.link);
        if (link.origin !== publicOrigin(env) || !/^\/[a-z]{2,3}\/account\/verify$/.test(link.pathname)) throw unavailable("portal_mail_unavailable");
        const token = link.searchParams.get("token");
        if (!token || !/^[A-Za-z0-9_-]{20,200}$/.test(token)) throw unavailable("portal_mail_unavailable");
        link.search = "";
        link.hash = `token=${token}`; // A fragment never reaches HTTP request logs or referrers.
        subject = "Verify your MAXIMUS account";
        text = `Verify your email address:\n${link.href}\n\nThis link expires in ${params.ttlMinutes} minutes. If you did not request this account, ignore this email.\n`;
      } else if (templateKey === "register_existing") {
        subject = "MAXIMUS account security notice";
        text = "A registration request was made for this email address. Your existing account has not been changed. If you did not make this request, no action is required.\n";
      } else throw unavailable("portal_mail_unavailable");
      const result = await (await getTransport()).sendMail({ from, to, subject, text, messageId: `<account.${sha256(String(dedupeKey || templateKey))}@maximus.tennis>` });
      if (result.rejected?.length || !result.accepted?.length) throw unavailable("portal_mail_unavailable");
      return { ok: true };
    },
  };
}

/** Pure dependency constructor for service tests. Runtime routes never use a memory fallback. */
export function createPortal({ store, mailer, env = {}, now = () => Date.now(), ledgerFactory = createLedgerService, resolveOrderOwnership, loadLinkedOrder }) {
  if (!store || !mailer) throw unavailable("portal_unavailable");
  const origin = publicOrigin(env);
  const production = env.NODE_ENV === "production";
  const cookieName = production ? "__Host-mx_session" : "mx_session";
  const identity = createIdentity({ store, mailer, env: { ...env, PUBLIC_BASE_URL: origin }, now, locales: site.locales });
  const access = createAccess({ store, mailer, now, publicBaseUrl: origin });
  const flags = readFlags(env);

  async function contextFor(auth) {
    // access.opsRolesOf is a primitive; this HTTP boundary also validates tenant and subject.
    const ids = await store.listIndex(`roles:user:${auth.user.id}`, { limit: 50 });
    const roles = await store.getMany("role", ids);
    const opsRoles = roles.filter(({ doc }) => doc.userId === auth.user.id && doc.organizationId === ORGANIZATION && !doc.revokedAt).map(({ doc }) => doc.role);
    return { userId: auth.user.id, roles: auth.user.roles || [], opsRoles, capabilities: capabilitiesFor(opsRoles),
      emailVerified: auth.user.status === "active", accountStatus: auth.user.status, organizationId: ORGANIZATION,
      locale: auth.user.locale || "en", session: { id: auth.session.id, platform: "web", tokenHash: auth.session.tokenHash, mfaLevel: auth.session.mfaLevel, reauthAt: auth.session.reauthAt } };
  }
  function verified(ctx) {
    if (ctx.organizationId !== ORGANIZATION || ctx.accountStatus !== "active" || !ctx.emailVerified) throw forbidden("email_verification_required");
  }
  const mfaService = async () => (await import("./mfa")).createMfa({ store, env, now });
  async function requireAdmin(ctx) {
    access.requireCap(ctx, "ledger:read");
    if (production || flags.adminRequireMfa) {
      const [user, session] = await Promise.all([store.get("user", ctx.userId), store.get("session", ctx.session?.id)]);
      if (!user || !session || session.doc.userId !== ctx.userId || session.doc.tokenHash !== ctx.session.tokenHash) throw unauthorized();
      await (await mfaService()).requireVerifiedAdmin({ user: user.doc, userVersion: user.version, session: session.doc, sessionVersion: session.version });
    }
  }
  async function authorizeRead({ ctx, projectId, customerId, action }) {
    if (!ctx || projectId !== PORTAL_PROJECT_ID) throw notFound();
    verified(ctx);
    if (action.startsWith("admin_") || action === "finance_readiness") await requireAdmin(ctx);
    else if (customerId !== ctx.userId) throw notFound();
    return true;
  }
  const readAdapters = { resolveVerifiedEvent: async () => { throw forbidden("portal_posting_disabled"); }, loadOrder: async () => null };
  const ledger = ledgerFactory({ store, now, authorizeRead, ...readAdapters });

  async function joinPortal(user, cid) {
    const id = `${ORGANIZATION}_${user.id}`;
    const existing = await store.get("portalMembership", id);
    if (existing) {
      if (existing.doc.userId !== user.id || existing.doc.organizationId !== ORGANIZATION) throw forbidden();
      return;
    }
    const at = now();
    try {
      await store.commit(mergeCommits({
        writes: [{ type: "portalMembership", id, doc: { id, userId: user.id, organizationId: ORGANIZATION, joinedAt: new Date(at).toISOString() }, expectedVersion: -1 }],
        indexes: [{ name: `portal:members:${ORGANIZATION}`, member: user.id, score: at }],
      }, auditWrites({ now: at, actor: { userId: user.id }, action: "portal.joined", objectType: "user", objectId: user.id, correlationId: cid })));
    } catch (err) { if (err?.code !== "version_conflict") throw err; }
  }

  function cookieToken(request) {
    const values = (request.headers.get("cookie") || "").split(";").map((x) => x.trim()).filter((x) => x.startsWith(`${cookieName}=`));
    if (values.length !== 1) return null;
    const raw = values[0].slice(cookieName.length + 1);
    return /^[A-Za-z0-9_-]{20,200}$/.test(raw) ? raw : null;
  }
  async function authenticate(request) {
    const token = cookieToken(request);
    const auth = token ? await identity.authenticate({ sessionToken: token }) : null;
    if (!auth) throw unauthorized();
    return { ...auth, ctx: await contextFor(auth) };
  }
  async function authenticatedCustomer(request, { requireCsrf = true } = {}) {
    const auth = await authenticate(request);
    verified(auth.ctx);
    if (new URL(request.url).origin !== origin || request.headers.get("sec-fetch-site") === "cross-site") throw forbidden("origin_invalid");
    if (requireCsrf && (request.headers.get("origin") !== origin || !safeEqual(request.headers.get("x-csrf-token") || "", auth.session.csrf))) throw forbidden("csrf_invalid");
    return { userId: auth.user.id, organizationId: ORGANIZATION, emailVerified: true };
  }
  async function linkOrder(request, { orderId, accessToken }) {
    const customer = await authenticatedCustomer(request);
    if (typeof orderId !== "string" || !/^MX-ORD-[0-9a-f]{32}$/.test(orderId) || typeof accessToken !== "string" || accessToken.length > 200) throw notFound();
    const resolver = resolveOrderOwnership || (async ({ orderId, accessToken }) => {
      const [{ resolveCommerceStore }, { authorized }] = await Promise.all([import("../commerce/store"), import("../commerce/service")]);
      const commerceStore = resolveCommerceStore(env);
      if (!commerceStore || !env.ORDER_ACCESS_SECRET || env.ORDER_ACCESS_SECRET.length < 32) throw unavailable("order_link_unavailable");
      return authorized(commerceStore, orderId, accessToken, env.ORDER_ACCESS_SECRET, now(), PORTAL_PROJECT_ID);
    });
    const order = await resolver({ orderId, accessToken });
    if (!order || order.id !== orderId || order.snapshot?.projectId !== PORTAL_PROJECT_ID || (order.snapshot.customerUserId && order.snapshot.customerUserId !== customer.userId)) throw notFound();
    const existing = await store.get("portalOrder", orderId);
    if (existing) {
      if (existing.doc.customerUserId !== customer.userId || existing.doc.projectId !== PORTAL_PROJECT_ID || existing.doc.organizationId !== ORGANIZATION) throw notFound();
      return { linked: true, orderId };
    }
    const at = now();
    try {
      await store.commit(mergeCommits({
        writes: [{ type: "portalOrder", id: orderId, doc: { id: orderId, projectId: PORTAL_PROJECT_ID, organizationId: ORGANIZATION, customerUserId: customer.userId, ownershipProof: "verified_session_and_order_capability", acceptedAt: order.snapshot.createdAt, linkedAt: new Date(at).toISOString() }, expectedVersion: -1 }],
        uniques: [{ name: "portal_order_owner", value: `${PORTAL_PROJECT_ID}:${orderId}`, owner: customer.userId }],
        indexes: [{ name: `portal:orders:${PORTAL_PROJECT_ID}:${customer.userId}`, member: orderId, score: at }],
      }, auditWrites({ now: at, actor: { userId: customer.userId }, action: "portal.order_linked", objectType: "order", objectId: orderId, correlationId: correlationId() })));
    } catch (err) {
      if (!["version_conflict", "unique_conflict"].includes(err?.code)) throw err;
      const winner = await store.get("portalOrder", orderId);
      if (!winner || winner.doc.customerUserId !== customer.userId || winner.doc.projectId !== PORTAL_PROJECT_ID || winner.doc.organizationId !== ORGANIZATION) throw notFound();
    }
    return { linked: true, orderId };
  }
  async function linkedOrder(request, orderId) {
    const customer = await authenticatedCustomer(request, { requireCsrf: false });
    if (typeof orderId !== "string" || !/^MX-ORD-[0-9a-f]{32}$/.test(orderId)) throw notFound();
    const mapping = await store.get("portalOrder", orderId);
    if (!mapping || mapping.doc.customerUserId !== customer.userId || mapping.doc.projectId !== PORTAL_PROJECT_ID || mapping.doc.organizationId !== ORGANIZATION || mapping.doc.ownershipProof !== "verified_session_and_order_capability") throw notFound();
    const load = loadLinkedOrder || (async (id) => {
      const { resolveCommerceStore } = await import("../commerce/store");
      const commerceStore = resolveCommerceStore(env);
      if (!commerceStore) throw unavailable("order_link_unavailable");
      return commerceStore.get(id);
    });
    const doc = await load(orderId);
    if (!doc || doc.id !== orderId || doc.snapshot?.projectId !== PORTAL_PROJECT_ID || (doc.snapshot.customerUserId && doc.snapshot.customerUserId !== customer.userId)) throw notFound();
    const { publicOrder } = await import("../commerce/service");
    return { order: publicOrder(doc) };
  }
  const publicSession = (auth, ctx) => ({ user: publicUser(auth.user), csrfToken: auth.session.csrf, canReadAdminLedger: ctx.emailVerified && access.can(ctx, "ledger:read") });
  function sessionCookie(token, expiresAt) {
    const maxAge = Math.max(0, Math.floor((Date.parse(expiresAt) - now()) / 1000));
    return `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}; Expires=${new Date(expiresAt).toUTCString()}${production ? "; Secure" : ""}`;
  }
  function clearCookie() { return `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${production ? "; Secure" : ""}`; }

  async function account(request, action, body, cid) {
    const meta = { ip: clientIp(request.headers), correlationId: cid };
    if (action === "register") {
      // The reused declarative identity validator trims text. Reject rather than silently
      // changing a password containing leading/trailing whitespace at this boundary.
      if (typeof body.password === "string" && body.password !== body.password.trim()) throw new ApiError(400, "validation_failed", { fieldErrors: { password: "surrounding_whitespace_not_supported" } });
      try { await identity.register(body, meta); } catch (err) { if (err?.code !== "unique_conflict") throw err; }
      return response(202, { accepted: true }); // Identical for new/existing/racing email addresses.
    }
    if (action === "verify") {
      await identity.verifyEmail({ token: body.token }, { correlationId: cid });
      return response(200, { verified: true });
    }
    if (action === "resend") {
      await identity.resendVerification({ email: body.email }, meta);
      return response(202, { accepted: true });
    }
    if (action === "login") {
      const oldToken = cookieToken(request);
      const oldAuth = oldToken ? await identity.authenticate({ sessionToken: oldToken }) : null;
      const issued = await identity.login({ email: body.email, password: body.password, platform: "web" }, meta);
      await joinPortal(issued.user, cid);
      if (oldAuth) await identity.logout(oldAuth, { correlationId: cid });
      return response(200, publicSession(issued, await contextFor(issued)), { "Set-Cookie": sessionCookie(issued.sessionToken, issued.expiresAt) });
    }
    const auth = await authenticate(request);
    if (action === "session") return response(200, publicSession(auth, auth.ctx));
    if (action === "reauth" || action.startsWith("mfa-")) {
      verified(auth.ctx);
      access.requireCap(auth.ctx, "ledger:read");
      if (!safeEqual(request.headers.get("x-csrf-token") || "", auth.session.csrf)) throw forbidden("csrf_invalid");
      if (action === "reauth") return response(200, await identity.reauthenticate({ ...auth, password: body.password }, { correlationId: cid }));
      const mfa = await mfaService();
      if (action === "mfa-enroll") return response(200, await mfa.beginEnrollment({ auth, password: body.password }));
      let issued;
      if (action === "mfa-confirm") issued = await mfa.confirmEnrollment({ auth, enrollmentId: body.enrollmentId, code: body.code });
      else if (action === "mfa-verify") issued = await mfa.stepUp({ auth, code: body.code });
      else if (action === "mfa-disable") issued = await mfa.disable({ auth, password: body.password, code: body.code });
      else throw notFound();
      return response(200, { csrfToken: issued.csrfToken, mfaLevel: issued.mfaLevel }, { "Set-Cookie": sessionCookie(issued.sessionToken, issued.expiresAt) });
    }
    if (action === "order-link") return response(200, await linkOrder(request, body));
    if (action === "orders") {
      verified(auth.ctx);
      const ids = await store.listIndex(`portal:orders:${PORTAL_PROJECT_ID}:${auth.user.id}`, { limit: 100 });
      const rows = await store.getMany("portalOrder", ids);
      if (rows.length !== ids.length || rows.some(({ doc }) => doc.projectId !== PORTAL_PROJECT_ID || doc.customerUserId !== auth.user.id || doc.organizationId !== ORGANIZATION)) throw unavailable("portal_unavailable");
      return response(200, { items: rows.map(({ doc }) => ({ orderId: doc.id, acceptedAt: doc.acceptedAt, linkedAt: doc.linkedAt })) });
    }
    if (action === "logout") {
      if (!safeEqual(request.headers.get("x-csrf-token") || "", auth.session.csrf)) throw forbidden("csrf_invalid");
      const result = await identity.logout(auth, { correlationId: cid });
      return response(200, result, { "Set-Cookie": clearCookie() });
    }
    throw notFound();
  }

  async function ledgerRead(request, action, cid) {
    const auth = await authenticate(request);
    verified(auth.ctx);
    const params = new URL(request.url).searchParams;
    const limit = params.has("limit") ? Number(params.get("limit")) : 50;
    const offset = params.has("offset") ? Number(params.get("offset")) : 0;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0 || offset > 100000) throw badRequest("invalid_pagination");
    let result;
    if (action === "ledger-account") {
      if (params.has("customerId")) throw notFound();
      const scope = { ctx: auth.ctx, projectId: PORTAL_PROJECT_ID, customerId: auth.user.id };
      result = { summary: await ledger.readClientSummary(scope), journal: await ledger.readClientJournal({ ...scope, limit, offset }) };
    } else {
      await requireAdmin(auth.ctx);
      const customerId = params.get("customerId");
      const scope = { ctx: auth.ctx, projectId: PORTAL_PROJECT_ID };
      if (customerId) {
        if (!/^[A-Za-z0-9_-]{1,80}$/.test(customerId)) throw notFound();
        const user = await store.get("user", customerId);
        const membership = await store.get("portalMembership", `${ORGANIZATION}_${customerId}`);
        if (!user || !membership || membership.doc.userId !== customerId || membership.doc.organizationId !== ORGANIZATION) throw notFound();
        // Admin read reuses client projections with an explicit scoped read capability.
        const adminLedger = ledgerFactory({ store, now, ...readAdapters, authorizeRead: async (args) => { verified(args.ctx); if (args.projectId !== PORTAL_PROJECT_ID) throw notFound(); await requireAdmin(args.ctx); return true; } });
        result = { customer: { id: user.doc.id, displayName: user.doc.displayName }, summary: await adminLedger.readClientSummary({ ...scope, customerId }), journal: await adminLedger.readClientJournal({ ...scope, customerId, limit, offset }) };
      } else result = { summary: await ledger.readAdminSummary(scope), clients: await ledger.readAdminClients({ ...scope, limit, offset }) };
    }
    await store.commit(auditWrites({ now: now(), actor: { userId: auth.user.id, roles: auth.ctx.opsRoles }, action: action === "ledger-account" ? "portal.ledger_read" : "portal.admin_ledger_read", objectType: "user", objectId: params.get("customerId") || auth.user.id, correlationId: cid }));
    return response(200, result);
  }

  async function handle(request, action, params = {}) {
    const cid = correlationId();
    try {
      const isRead = ["session", "orders", "order-detail", "ledger-account", "ledger-admin"].includes(action);
      if (request.method !== (isRead ? "GET" : "POST")) return response(405, { code: "method_not_allowed" }, { Allow: isRead ? "GET" : "POST" });
      if (new URL(request.url).origin !== origin || request.headers.get("sec-fetch-site") === "cross-site") throw forbidden("origin_invalid");
      if (!isRead && request.headers.get("origin") !== origin) throw forbidden("origin_invalid");
      const body = isRead ? null : await readBody(request);
      if (action === "order-detail") return response(200, await linkedOrder(request, params.orderId));
      if (action.startsWith("ledger-")) return await ledgerRead(request, action, cid);
      return await account(request, action, body, cid);
    } catch (err) {
      const result = errorBody(err, cid);
      const { details, ...body } = result.body;
      return response(result.status, body, result.headers);
    }
  }
  return { handle, identity, access, ledger, authorizeRead, authenticatedCustomer, linkOrder, linkedOrder };
}

async function readBody(request) {
  if (!(request.headers.get("content-type") || "").toLowerCase().startsWith("application/json")) throw new ApiError(415, "unsupported_media_type");
  if (Number(request.headers.get("content-length") || 0) > MAX_BYTES) throw new ApiError(413, "too_large");
  if (!request.body) throw badRequest("bad_json");
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0, text = "";
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new ApiError(408, "request_timeout")), BODY_TIMEOUT_MS); });
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), timeout]);
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) throw new ApiError(413, "too_large");
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } catch (err) {
    // A broken/slow producer's cancel promise must not keep the HTTP request open.
    void reader.cancel().catch(() => {});
    if (err instanceof ApiError) throw err;
    throw badRequest("bad_json");
  } finally { clearTimeout(timer); }
  let body;
  try { body = JSON.parse(text); } catch { throw badRequest("bad_json"); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw badRequest("bad_json");
  return body;
}

export async function resolvePortalRuntime(env = process.env, deps = {}) {
  if (env.PORTAL_ENABLED !== "true") throw unavailable("portal_disabled");
  if (env.PORTAL_RUNTIME_VERIFIED !== "true") throw unavailable("portal_runtime_unverified");
  const creds = readRestCredentials(env);
  if (!creds.url || !creds.token || !creds.url.startsWith("https://")) throw unavailable("portal_unavailable");
  const store = deps.store || resolvePlatformStore(env, { readRestCredentials });
  const mailer = deps.mailer || createPortalMailer(env);
  if (!store || store.kind === "memory" || !mailer) throw unavailable("portal_unavailable");
  try {
    if (!(await store.ping()) || !(await mailer.verify())) throw unavailable("portal_unavailable");
  } catch { throw unavailable("portal_unavailable"); }
  return createPortal({ store, mailer, env, ...(deps.now ? { now: deps.now } : {}), ...(deps.ledgerFactory ? { ledgerFactory: deps.ledgerFactory } : {}) });
}

// Production routes have no test dependencies, auth bypass, memory store or automatic admin.
let runtimePromise;
async function runtimePortal() {
  if (process.env.PORTAL_ENABLED !== "true") throw unavailable("portal_disabled");
  if (process.env.PORTAL_RUNTIME_VERIFIED !== "true") throw unavailable("portal_runtime_unverified");
  runtimePromise ||= resolvePortalRuntime().catch((err) => { runtimePromise = null; throw err; });
  return runtimePromise;
}

/** Optional server identity for existing public order intake; a guest has no customer identity. */
export async function getPortalOrderContext(request) {
  const cookieName = process.env.NODE_ENV === "production" ? "__Host-mx_session" : "mx_session";
  if (!(request.headers.get("cookie") || "").split(";").some((item) => item.trim().startsWith(`${cookieName}=`))) return null;
  return (await runtimePortal()).authenticatedCustomer(request);
}

/** Mandatory verified session and CSRF for protected order actions; a guest is rejected. */
export async function getVerifiedPortalOrderContext(request, { requireCsrf = true } = {}) {
  return (await runtimePortal()).authenticatedCustomer(request, { requireCsrf });
}

/** After an accepted order: atomically link its validated private capability to the verified user. */
export async function linkAcceptedOrderToCustomer(request, { orderId, accessToken }) {
  return (await runtimePortal()).linkOrder(request, { orderId, accessToken });
}

export async function handlePortalRequest(request, action, params) {
  try {
    return (await runtimePortal()).handle(request, action, params);
  } catch (err) {
    const result = errorBody(err, correlationId());
    return response(result.status, result.body, result.headers);
  }
}
