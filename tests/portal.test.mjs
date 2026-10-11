/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createPortal, createPortalMailer, resolvePortalRuntime, PORTAL_PROJECT_ID } from "../lib/platform/portal.js";
import { createMemoryStore } from "../lib/platform/store.js";
import { ORGANIZATION } from "../lib/platform/access.js";
import { sha256 } from "../lib/platform/ids.js";
import { createLedgerService } from "../lib/platform/ledger.js";
import { accessToken, hasAccess } from "../lib/commerce/access.js";
import { totp, decodeBase32 } from "../lib/platform/mfa.js";

const origin = "https://maximus.tennis";
const password = "test-password-long-enough";
const fixtureMfaConfig = { ADMIN_MFA_PROVIDER: "totp", ADMIN_MFA_ENCRYPTION_KEY: Buffer.from(Array.from({ length: 32 }, (_, i) => i + 1)).toString("base64") };
const request = (path, body, headers = {}) => new Request(`${origin}/api/${path}`, { method: body === undefined ? "GET" : "POST", headers: { ...(body === undefined ? {} : { "Content-Type": "application/json", Origin: origin }), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const registration = (email = "portal-client@example.invalid") => ({ email, password, displayName: "Portal test client", roles: ["player"], locale: "en", consents: { terms: true, privacy: true, marketing: false } });

function fixture(env = {}, portalDeps = {}) {
  const store = createMemoryStore();
  const messages = [];
  let now = Date.parse("2026-10-11T00:00:00Z");
  const mailer = { verify: async () => true, send: async (message) => { messages.push(message); return { ok: true }; } };
  const portal = createPortal({ store, mailer, env: { NODE_ENV: "test", ...env }, now: () => now, ...portalDeps });
  return { store, messages, mailer, portal, now: () => now, advance: (ms) => { now += ms; } };
}
async function registerAndVerify(f, email) {
  const body = registration(email);
  const registered = await f.portal.handle(request("accounts/register", body), "register");
  assert.equal(registered.status, 202);
  assert.deepEqual(await registered.json(), { accepted: true });
  const message = f.messages.find((m) => m.to === body.email && m.templateKey === "verify_email");
  const token = new URL(message.params.link).searchParams.get("token");
  const verified = await f.portal.handle(request("accounts/verify", { token }), "verify");
  assert.equal(verified.status, 200);
  return { email: body.email, token };
}
async function login(f, email, headers = {}) {
  const result = await f.portal.handle(request("accounts/login", { email, password, platform: "ios", opsRoles: ["owner"] }, headers), "login");
  assert.equal(result.status, 200);
  return { cookie: result.headers.get("set-cookie").split(";")[0], cookieHeader: result.headers.get("set-cookie"), body: await result.json() };
}
async function assign(f, userId, { role = "finance", organizationId = ORGANIZATION, subjectId = userId, revokedAt = null } = {}) {
  const id = `test_role_${Math.random()}`;
  await f.store.commit({ writes: [{ type: "role", id, doc: { id, userId: subjectId, role, organizationId, revokedAt }, expectedVersion: -1 }], indexes: [{ name: `roles:user:${userId}`, member: id, score: 1 }] });
  return id;
}

test("runtime is disabled by default and never falls back to memory", async () => {
  await assert.rejects(resolvePortalRuntime({}), { code: "portal_disabled", status: 503 });
  await assert.rejects(resolvePortalRuntime({ PORTAL_ENABLED: "true" }), { code: "portal_runtime_unverified", status: 503 });
  const env = { PORTAL_ENABLED: "true", PORTAL_RUNTIME_VERIFIED: "true", KV_REST_API_URL: "https://redis.example.invalid", KV_REST_API_TOKEN: "fixture-token" };
  const f = fixture();
  await assert.rejects(resolvePortalRuntime(env, { store: f.store, mailer: f.mailer }), { code: "portal_unavailable", status: 503 });
  await assert.rejects(resolvePortalRuntime({ ...env, KV_REST_API_URL: "http://127.0.0.1:9999" }, { store: f.store, mailer: f.mailer }), { code: "portal_unavailable", status: 503 });
});

test("runtime checks durable store and SMTP verification before serving", async () => {
  const env = { PORTAL_ENABLED: "true", PORTAL_RUNTIME_VERIFIED: "true", KV_REST_API_URL: "https://redis.example.invalid", KV_REST_API_TOKEN: "fixture-token" };
  const f = fixture();
  let pings = 0, verifies = 0;
  const store = { ...f.store, kind: "upstash", ping: async () => { pings++; return true; } };
  const mailer = { ...f.mailer, verify: async () => { verifies++; return true; } };
  assert.ok(await resolvePortalRuntime(env, { store, mailer }));
  assert.equal(pings, 1); assert.equal(verifies, 1);
  await assert.rejects(resolvePortalRuntime(env, { store, mailer: { ...mailer, verify: async () => false } }), { code: "portal_unavailable", status: 503 });
});

test("registration is generic, consent separates marketing, and secrets stay server-side", async () => {
  const f = fixture();
  const body = registration();
  body.opsRoles = ["owner"];
  const result = await f.portal.handle(request("accounts/register", body), "register");
  assert.deepEqual(await result.json(), { accepted: true });
  const id = await f.store.getUnique("user_email", body.email);
  const user = await f.store.get("user", id);
  assert.equal(user.doc.marketingConsent, false);
  assert.match(user.doc.passwordHash, /^scrypt\$/);
  assert.notEqual(user.doc.passwordHash, password);
  assert.deepEqual(await f.store.listIndex(`roles:user:${id}`), []);
  const token = new URL(f.messages[0].params.link).searchParams.get("token");
  const stored = await f.store.get("token", sha256(token));
  assert.ok(stored); assert.equal(stored.doc.raw, undefined);
  const duplicate = await f.portal.handle(request("accounts/register", registration()), "register");
  assert.deepEqual(await duplicate.json(), { accepted: true });
  for (const audit of await f.store.getMany("audit", await f.store.listIndex("audit:all", { limit: 100 }))) {
    const text = JSON.stringify(audit.doc);
    assert.ok(!text.includes(password)); assert.ok(!text.includes(token));
  }
});

test("mandatory consent and silently trimmed passwords are rejected", async () => {
  const f = fixture();
  for (const body of [{ ...registration(), consents: { terms: true, privacy: false, marketing: false } }, { ...registration(), password: ` ${password} ` }]) {
    const result = await f.portal.handle(request("accounts/register", body), "register");
    assert.equal(result.status, 400);
  }
  assert.equal((await f.store.listIndex("users:all")).length, 0);
  assert.equal(f.messages.length, 0);
});

test("verification is one-time and expired tokens do not activate accounts", async () => {
  const f = fixture();
  const { token } = await registerAndVerify(f);
  const replay = await f.portal.handle(request("accounts/verify", { token }), "verify");
  assert.equal(replay.status, 400);
  assert.equal((await replay.json()).code, "token_invalid");
  const other = registration("expired@example.invalid");
  await f.portal.handle(request("accounts/register", other), "register");
  const expiredToken = new URL(f.messages.find((m) => m.to === other.email).params.link).searchParams.get("token");
  f.advance(61 * 60 * 1000);
  const expired = await f.portal.handle(request("accounts/verify", { token: expiredToken }), "verify");
  assert.equal(expired.status, 400);
  const user = await f.store.get("user", await f.store.getUnique("user_email", other.email));
  assert.equal(user.doc.status, "pending_verification");
});

test("pending verification permits session UI but never a financial ledger", async () => {
  const f = fixture();
  await f.portal.handle(request("accounts/register", registration()), "register");
  const logged = await login(f, registration().email);
  assert.equal(logged.body.user.emailVerified, false);
  const ledger = await f.portal.handle(request("ledger/account", undefined, { Cookie: logged.cookie }), "ledger-account");
  assert.equal(ledger.status, 403);
  assert.equal((await ledger.json()).code, "email_verification_required");
});

test("production session uses host-only Secure HttpOnly cookie and JSON has no bearer/password", async () => {
  const f = fixture({ NODE_ENV: "production" });
  const { email } = await registerAndVerify(f);
  const logged = await login(f, email);
  assert.match(logged.cookieHeader, /^__Host-mx_session=/);
  assert.match(logged.cookieHeader, /; Secure/); assert.match(logged.cookieHeader, /; HttpOnly/);
  assert.match(logged.cookieHeader, /; SameSite=Lax/); assert.match(logged.cookieHeader, /; Path=\//);
  assert.ok(!logged.cookieHeader.includes("Domain="));
  assert.equal(logged.body.sessionToken, undefined); assert.equal(logged.body.user.passwordHash, undefined);
  assert.equal(logged.body.user.password, undefined);
  const session = await f.portal.handle(request("accounts/session", undefined, { Cookie: logged.cookie }), "session");
  assert.equal(session.status, 200); assert.equal(session.headers.get("cache-control"), "no-store, private");
});

test("login rotates the current browser session and logout requires CSRF then revokes it", async () => {
  const f = fixture();
  const { email } = await registerAndVerify(f);
  const first = await login(f, email);
  const second = await login(f, email, { Cookie: first.cookie });
  assert.notEqual(second.cookie, first.cookie);
  assert.equal((await f.portal.handle(request("accounts/session", undefined, { Cookie: first.cookie }), "session")).status, 401);
  const failed = await f.portal.handle(request("accounts/logout", {}, { Cookie: second.cookie, "X-CSRF-Token": "wrong" }), "logout");
  assert.equal(failed.status, 403);
  const logout = await f.portal.handle(request("accounts/logout", {}, { Cookie: second.cookie, "X-CSRF-Token": second.body.csrfToken }), "logout");
  assert.equal(logout.status, 200); assert.match(logout.headers.get("set-cookie"), /Max-Age=0/);
  assert.equal((await f.portal.handle(request("accounts/session", undefined, { Cookie: second.cookie }), "session")).status, 401);
});

test("mutation origin and JSON boundary reject cross-site, bad and oversized requests", async () => {
  const f = fixture();
  for (const originValue of ["https://attacker.example.invalid", "null", ""]) {
    const result = await f.portal.handle(request("accounts/register", registration(), { Origin: originValue }), "register");
    assert.equal(result.status, 403);
  }
  const type = await f.portal.handle(request("accounts/login", {}, { "Content-Type": "text/plain" }), "login");
  assert.equal(type.status, 415);
  const large = await f.portal.handle(request("accounts/login", { password: "x".repeat(17000) }), "login");
  assert.equal(large.status, 413);
  const invalid = await f.portal.handle(new Request(`${origin}/api/accounts/login`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: "{" }), "login");
  assert.equal(invalid.status, 400);
  assert.equal((await f.store.listIndex("users:all")).length, 0);
});

test("overflow does not wait for an indefinitely pending stream cancellation", async () => {
  const f = fixture();
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(17000)); }, cancel() { return new Promise(() => {}); } });
  const req = new Request(`${origin}/api/accounts/login`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: stream, duplex: "half" });
  const result = await f.portal.handle(req, "login");
  assert.equal(result.status, 413);
});

test("authenticated client sees only actual own empty journal and cannot select another user", async () => {
  const f = fixture();
  const { email } = await registerAndVerify(f);
  const logged = await login(f, email);
  const result = await f.portal.handle(request("ledger/account", undefined, { Cookie: logged.cookie }), "ledger-account");
  assert.equal(result.status, 200);
  const body = await result.json();
  assert.deepEqual(body.summary.currencies, []);
  assert.deepEqual(body.journal.items, []);
  assert.equal(body.summary.financePostingEnabled, false);
  assert.equal((await f.portal.handle(request("ledger/account?customerId=another-user", undefined, { Cookie: logged.cookie }), "ledger-account")).status, 404);
  await assert.rejects(f.portal.authorizeRead({ ctx: { userId: logged.body.user.id, organizationId: ORGANIZATION, accountStatus: "active", emailVerified: true }, projectId: PORTAL_PROJECT_ID, customerId: "another-user", action: "client_summary" }), { status: 404 });
});

test("admin privileges require an unrevoked role for the same subject and organization", async () => {
  const f = fixture();
  const { email } = await registerAndVerify(f);
  const logged = await login(f, email);
  const call = () => f.portal.handle(request("ledger/admin", undefined, { Cookie: logged.cookie }), "ledger-admin");
  assert.equal((await call()).status, 403);
  await assign(f, logged.body.user.id, { organizationId: "foreign-organization" });
  await assign(f, logged.body.user.id, { subjectId: "different-user" });
  await assign(f, logged.body.user.id, { revokedAt: "2026-10-10T00:00:00Z" });
  assert.equal((await call()).status, 403);
  const roleId = await assign(f, logged.body.user.id);
  const result = await call();
  assert.equal(result.status, 200); assert.deepEqual((await result.json()).summary.currencies, []);
  const role = await f.store.get("role", roleId);
  await f.store.commit({ writes: [{ type: "role", id: roleId, doc: { ...role.doc, revokedAt: "2026-10-11T00:00:00Z" }, expectedVersion: role.version }] });
  assert.equal((await call()).status, 403);
});

test("production administrative financial reads retain MFA even when a false flag is supplied", async () => {
  const f = fixture({ NODE_ENV: "production", ADMIN_REQUIRE_MFA: "false", ...fixtureMfaConfig });
  const { email } = await registerAndVerify(f);
  const logged = await login(f, email);
  await assign(f, logged.body.user.id);
  const result = await f.portal.handle(request("ledger/admin", undefined, { Cookie: logged.cookie }), "ledger-admin");
  assert.equal(result.status, 403); assert.equal((await result.json()).code, "mfa_required");
});

test("admin per-client read requires portal membership and does not use raw email claims", async () => {
  const f = fixture();
  const one = await registerAndVerify(f, "admin-test@example.invalid");
  const admin = await login(f, one.email);
  await assign(f, admin.body.user.id);
  const two = await registerAndVerify(f, "customer-test@example.invalid");
  const customerId = await f.store.getUnique("user_email", two.email);
  const before = await f.portal.handle(request(`ledger/admin?customerId=${customerId}`, undefined, { Cookie: admin.cookie }), "ledger-admin");
  assert.equal(before.status, 404);
  await login(f, two.email);
  const result = await f.portal.handle(request(`ledger/admin?customerId=${customerId}`, undefined, { Cookie: admin.cookie }), "ledger-admin");
  assert.equal(result.status, 200);
  const body = await result.json();
  assert.equal(body.customer.id, customerId); assert.equal(body.customer.email, undefined);
  assert.deepEqual(body.summary.currencies, []);
});

test("real journal projections stay isolated per client and aggregate per currency without bank balances", async () => {
  const f = fixture();
  const one = await registerAndVerify(f, "first-journal@example.invalid");
  const first = await login(f, one.email);
  const two = await registerAndVerify(f, "second-journal@example.invalid");
  const second = await login(f, two.email);
  const orders = new Map(), events = new Map();
  for (const [index, customer, amount, currency] of [[1, first, "12345", "AED"], [2, second, "25000", "AED"], [3, second, "8000", "EUR"]]) {
    const id = `test-order-${index}`;
    const scope = { customerId: customer.body.user.id, projectId: PORTAL_PROJECT_ID, merchantId: "test-existing-merchant", currency };
    orders.set(id, { id, revisionId: `test-revision-${index}`, ...scope, kind: "goods", status: "approved", totalMinor: amount, principalMinor: "0", bonusMinor: "0" });
    events.set(`test-reference-${index}`, { ...scope, source: "test-verified-query", eventId: `test-event-${index}`, transactionId: `test-transaction-${index}`, paymentId: `test-payment-${index}`, orderId: id, kind: "capture", amountMinor: amount, occurredAt: "2026-10-10T00:00:00Z", proof: { method: "provider_server_query", evidenceId: `test-evidence-${index}`, verifiedAt: "2026-10-10T00:00:01Z" } });
  }
  const writer = createLedgerService({ store: f.store, now: () => Date.parse("2026-10-11T00:00:00Z"), authorizeRead: async () => false, resolveVerifiedEvent: async (ref) => events.get(ref), loadOrder: async (id) => orders.get(id) });
  for (const ref of events.keys()) await writer.postVerifiedEvent(ref);
  const own = await f.portal.handle(request("ledger/account", undefined, { Cookie: first.cookie }), "ledger-account");
  assert.equal(own.status, 200);
  const ownBody = await own.json();
  assert.equal(ownBody.summary.currencies.length, 1);
  assert.equal(ownBody.summary.currencies[0].capturedMinor, "12345");
  assert.equal(ownBody.summary.currencies[0].bankBalanceMinor, null);
  assert.equal(ownBody.summary.currencies[0].myBonus.availableMinor, "0");
  assert.equal(ownBody.summary.currencies[0].myDeposit.returnablePrincipalMinor, "0");
  assert.equal(ownBody.journal.items.length, 1);
  assert.ok(ownBody.journal.items.every((entry) => entry.customerId === first.body.user.id));
  await assign(f, first.body.user.id);
  const admin = await f.portal.handle(request("ledger/admin", undefined, { Cookie: first.cookie }), "ledger-admin");
  assert.equal(admin.status, 200);
  const adminBody = await admin.json();
  assert.equal(adminBody.summary.currencies.find((row) => row.currency === "AED").capturedMinor, "37345");
  assert.equal(adminBody.summary.currencies.find((row) => row.currency === "EUR").capturedMinor, "8000");
  assert.ok(adminBody.summary.currencies.every((row) => row.bankBalanceMinor === null));
  assert.equal(adminBody.clients.items.length, 3);
});

test("approved program terms and posted bonus amounts cross the read-only admin boundary without forecasts", async () => {
  const f = fixture();
  const customer = await login(f, (await registerAndVerify(f, "program-client@example.invalid")).email);
  const operator = await login(f, (await registerAndVerify(f, "program-operator@example.invalid")).email);
  await assign(f, operator.body.user.id);
  const startsAt = "2026-10-10T00:00:00.000Z", recordedAt = "2026-10-11T00:00:00.000Z";
  const scope = { customerId: customer.body.user.id, projectId: PORTAL_PROJECT_ID, merchantId: "test-existing-merchant", currency: "AED" };
  const rules = { id: "synthetic-program", version: "synthetic-approved-v1", status: "approved", ...scope,
    legalApprovalId: "synthetic-legal-evidence", merchantEligibilityApprovalId: "synthetic-merchant-evidence", agreementVersion: "synthetic-agreement-v1", approvedByUserId: "synthetic-approver",
    durationDays: 90, rateBps: 1375, accrualConvention: "actual_365_simple_half_up_minor_v1", reversalPolicy: "freeze_bonus_and_review", allowedSources: ["cscart"],
    allowAdvance: true, advanceBps: 1, advanceAccrualTreatment: "offset_future_accrual" };
  const order = { id: "synthetic-program-order", revisionId: "synthetic-program-order-v1", ...scope, kind: "funding", status: "approved", totalMinor: "100000", principalMinor: "100000", programId: rules.id, programVersion: rules.version, agreementId: "synthetic-client-agreement" };
  const event = { ...scope, source: "cscart", eventId: "synthetic-fund", transactionId: "synthetic-fund-transaction", paymentId: "synthetic-fund-payment", orderId: order.id, kind: "capture", amountMinor: "100000", occurredAt: startsAt,
    proof: { method: "provider_server_query", evidenceId: "synthetic-payment-evidence", verifiedAt: recordedAt } };
  const operations = new Map();
  const writer = createLedgerService({ store: f.store, now: f.now, authorizeRead: async () => false, resolveVerifiedEvent: async (ref) => ref === "synthetic-fund-ref" ? event : null,
    loadOrder: async (id) => id === order.id ? order : null, resolveApprovedRules: async () => rules, resolveAuthorizedOperation: async (ref) => operations.get(ref) });
  const posted = await writer.postVerifiedEvent("synthetic-fund-ref");
  const journal = (await f.store.get("ledgerJournal", posted.journalId)).doc;
  const position = (await f.store.get("ledgerPosition", journal.programPositionId)).doc;
  for (const [reference, kind, amountMinor, period] of [["advance", "bonus_advance", "10", {}], ["accrue", "bonus_accrue", "28", { periodStart: startsAt, periodEnd: recordedAt }]]) {
    operations.set(reference, { ...event, source: "approved_policy", eventId: `synthetic-${reference}`, transactionId: `synthetic-${reference}-transaction`, kind, amountMinor, occurredAt: recordedAt,
      proof: { method: "approved_policy_operation", evidenceId: `synthetic-${reference}-evidence`, verifiedAt: recordedAt },
      positionId: position.id, rulesHash: position.rulesSnapshot.hash, policyOperationId: `synthetic-${reference}-operation`, ...period });
    await writer.postProgramOperation(reference);
  }
  const result = await f.portal.handle(request(`ledger/admin?customerId=${customer.body.user.id}`, undefined, { Cookie: operator.cookie }), "ledger-admin");
  assert.equal(result.status, 200);
  const body = await result.json(), row = body.summary.currencies[0];
  assert.deepEqual(row.myDeposit.programs.map(({ durationDays, rateBps, startsAt, maturesAt, status, frozen, principalOutstandingMinor }) => ({ durationDays, rateBps, startsAt, maturesAt, status, frozen, principalOutstandingMinor })),
    [{ durationDays: 90, rateBps: 1375, startsAt, maturesAt: "2027-01-08T00:00:00.000Z", status: "active", frozen: false, principalOutstandingMinor: "100000" }]);
  assert.equal(row.myDeposit.principalReturnedMinor, "0"); assert.equal(row.myDeposit.principalReversedMinor, "0");
  assert.deepEqual(row.myBonus, { status: "active", accruedMinor: "28", availableMinor: "10", redeemedMinor: "0", expiredMinor: "0", advanceMinor: "10", frozenMinor: "0" });
  assert.equal(row.bankBalanceMinor, null); assert.equal(body.summary.financePostingEnabled, false);
  assert.equal(body.cashflowCalendar, undefined); assert.equal(body.forecast, undefined);
  const denied = await f.portal.handle(request(`ledger/admin?customerId=${customer.body.user.id}`, undefined, { Cookie: customer.cookie }), "ledger-admin");
  assert.equal(denied.status, 403);
});

test("accepted order linking needs verified session, CSRF and private capability, never email matching", async () => {
  const secret = "fixture-order-access-secret-at-least-32-characters";
  const order = { id: `MX-ORD-${"a".repeat(32)}`, snapshot: { projectId: PORTAL_PROJECT_ID, createdAt: "2026-10-10T00:00:00Z", contact: { email: "different-email@example.invalid" } } };
  const proof = accessToken(order, secret);
  const f = fixture({}, { resolveOrderOwnership: async ({ orderId, accessToken: token }) => orderId === order.id && hasAccess(order, token, secret, Date.parse("2026-10-11T00:00:00Z"), PORTAL_PROJECT_ID) ? order : null });
  const one = await registerAndVerify(f, "link-client@example.invalid");
  const first = await login(f, one.email);
  const call = (accessTokenValue, auth = first, csrf = auth.body.csrfToken) => f.portal.handle(request("accounts/orders/link", { orderId: order.id, accessToken: accessTokenValue, customerUserId: "attacker-claim", email: order.snapshot.contact.email }, { Cookie: auth.cookie, "X-CSRF-Token": csrf }), "order-link");
  assert.equal((await call(proof, first, "wrong")).status, 403);
  assert.equal((await call("wrong-private-capability")).status, 404);
  const linked = await call(proof);
  assert.equal(linked.status, 200); assert.deepEqual(await linked.json(), { linked: true, orderId: order.id });
  assert.equal((await call(proof)).status, 200);
  const two = await registerAndVerify(f, "other-link-client@example.invalid");
  const second = await login(f, two.email);
  assert.equal((await call(proof, second)).status, 404);
  const mapping = await f.store.get("portalOrder", order.id);
  assert.equal(mapping.doc.customerUserId, first.body.user.id);
  assert.equal(mapping.doc.accessToken, undefined); assert.equal(mapping.doc.email, undefined);
  const firstOrders = await f.portal.handle(request("accounts/orders", undefined, { Cookie: first.cookie }), "orders");
  assert.deepEqual((await firstOrders.json()).items.map((item) => item.orderId), [order.id]);
  const secondOrders = await f.portal.handle(request("accounts/orders", undefined, { Cookie: second.cookie }), "orders");
  assert.deepEqual((await secondOrders.json()).items, []);
});

test("new immutable server customer binding cannot be claimed by another session", async () => {
  const order = { id: `MX-ORD-${"b".repeat(32)}`, snapshot: { projectId: PORTAL_PROJECT_ID, customerUserId: "different-server-customer", createdAt: "2026-10-10T00:00:00Z" } };
  const f = fixture({}, { resolveOrderOwnership: async () => order });
  const one = await registerAndVerify(f);
  const logged = await login(f, one.email);
  const req = request("accounts/orders/link", { orderId: order.id, accessToken: "test-private-capability" }, { Cookie: logged.cookie, "X-CSRF-Token": logged.body.csrfToken });
  assert.equal((await f.portal.handle(req, "order-link")).status, 404);
  assert.equal(await f.store.get("portalOrder", order.id), null);
  const ctx = await f.portal.authenticatedCustomer(request("orders", {}, { Cookie: logged.cookie, "X-CSRF-Token": logged.body.csrfToken }));
  assert.deepEqual(ctx, { userId: logged.body.user.id, organizationId: ORGANIZATION, emailVerified: true });
});

test("saved order ownership remains readable after the old capability expires", async () => {
  const secret = "fixture-expiring-order-capability-secret-32chars";
  const order = { id: `MX-ORD-${"c".repeat(32)}`, snapshot: { projectId: PORTAL_PROJECT_ID, createdAt: "2026-10-10T00:00:00Z", plan: "B", accountTerms: { private: "historical-unpaid-example" } }, payment: { status: "awaiting_quote" }, invoice: null, events: [], mail: {} };
  let f;
  f = fixture({}, { resolveOrderOwnership: async ({ orderId, accessToken: token }) => orderId === order.id && hasAccess(order, token, secret, f.now(), PORTAL_PROJECT_ID) ? order : null, loadLinkedOrder: async (id) => id === order.id ? order : null });
  const one = await registerAndVerify(f);
  const first = await login(f, one.email);
  const proof = accessToken(order, secret);
  await f.portal.linkOrder(request("accounts/orders/link", {}, { Cookie: first.cookie, "X-CSRF-Token": first.body.csrfToken }), { orderId: order.id, accessToken: proof });
  f.advance(8 * 86400000);
  assert.equal(hasAccess(order, proof, secret, f.now(), PORTAL_PROJECT_ID), false);
  const current = await login(f, one.email);
  const read = await f.portal.handle(request(`accounts/orders/${order.id}`, undefined, { Cookie: current.cookie }), "order-detail", { orderId: order.id });
  assert.equal(read.status, 200);
  const body = await read.json();
  assert.equal(body.order.id, order.id); assert.equal(body.accessToken, undefined);
  assert.equal(body.order.accounts, null); assert.equal(body.order.snapshot.accountTerms, undefined);
  const mapping = await f.store.get("portalOrder", order.id);
  await f.store.commit({ writes: [{ type: "portalOrder", id: order.id, doc: { ...mapping.doc, organizationId: "other-organization" }, expectedVersion: mapping.version }] });
  assert.equal((await f.portal.handle(request(`accounts/orders/${order.id}`, undefined, { Cookie: current.cookie }), "order-detail", { orderId: order.id })).status, 404);
});

test("MFA HTTP enrollment verifies password/CSRF and rotates cookie without leaking its session bearer", async () => {
  const f = fixture({ NODE_ENV: "production", ...fixtureMfaConfig });
  const one = await registerAndVerify(f);
  let current = await login(f, one.email);
  await assign(f, current.body.user.id);
  const post = (action, body, auth = current) => f.portal.handle(request(`accounts/mfa/${action}`, body, { Cookie: auth.cookie, "X-CSRF-Token": auth.body.csrfToken }), `mfa-${action}`);
  assert.equal((await post("enroll", { password: "wrong-password" })).status, 401);
  const enroll = await post("enroll", { password });
  assert.equal(enroll.status, 200);
  const setup = await enroll.json();
  assert.match(setup.secret, /^[A-Z2-7]+$/); assert.match(setup.otpauthUri, /^otpauth:\/\/totp\//);
  const first = current;
  const confirm = await post("confirm", { enrollmentId: setup.enrollmentId, code: totp(decodeBase32(setup.secret), { at: f.now() }) });
  assert.equal(confirm.status, 200);
  const confirmed = await confirm.json();
  assert.equal(confirmed.mfaLevel, "totp"); assert.equal(confirmed.secret, undefined); assert.equal(confirmed.sessionToken, undefined);
  current = { cookie: confirm.headers.get("set-cookie").split(";")[0], body: { ...first.body, ...confirmed } };
  assert.notEqual(current.cookie, first.cookie); assert.notEqual(current.body.csrfToken, first.body.csrfToken);
  assert.equal((await f.portal.handle(request("accounts/session", undefined, { Cookie: first.cookie }), "session")).status, 401);
  assert.equal((await f.portal.handle(request("ledger/admin", undefined, { Cookie: current.cookie }), "ledger-admin")).status, 200);
  f.advance(16 * 60 * 1000);
  const expired = await f.portal.handle(request("ledger/admin", undefined, { Cookie: current.cookie }), "ledger-admin");
  assert.equal(expired.status, 403); assert.equal((await expired.json()).code, "mfa_required");
  const stepUp = await post("verify", { code: totp(decodeBase32(setup.secret), { at: f.now() }) });
  assert.equal(stepUp.status, 200);
});

test("SMTP adapter sends verification only to the requested client and removes URL query tokens", async () => {
  const sent = [];
  const mailer = createPortalMailer({ NODE_ENV: "test", SMTP_HOST: "127.0.0.1", SMTP_PORT: "2525", SMTP_AUTH: "none", SMTP_REQUIRE_TLS: "false", LEAD_NOTIFY_FROM: "no-reply@example.invalid", LEAD_NOTIFY_TO: "staff@example.invalid" }, { transportFactory: async () => ({ verify: async () => true, sendMail: async (mail) => { sent.push(mail); return { accepted: [mail.to], rejected: [] }; } }) });
  assert.equal(await mailer.verify(), true);
  await mailer.send({ to: "client@example.invalid", templateKey: "verify_email", params: { link: `${origin}/en/account/verify?token=${"a".repeat(43)}`, ttlMinutes: 60 }, dedupeKey: "fixture-hashed-token" });
  assert.equal(sent[0].to, "client@example.invalid"); assert.ok(!sent[0].text.includes("staff@example.invalid"));
  assert.ok(sent[0].text.includes("#token=")); assert.ok(!sent[0].text.includes("?token="));
  await assert.rejects(mailer.send({ to: "client@example.invalid\r\nBcc: victim@example.invalid", templateKey: "verify_email" }), { code: "portal_mail_unavailable" });
  assert.equal(sent.length, 1);
});
