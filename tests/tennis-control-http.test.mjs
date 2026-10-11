/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { handleTennisControlRequest } from '../lib/commerce/tennis-control-http.js';
import { createTennisControlRuntime } from '../lib/commerce/tennis-control-runtime.js';
import { createTennisControlOrderService, TENNIS_CONTROL_SCOPE } from '../lib/commerce/tennis-control-order.js';
import { createMemoryStore } from '../lib/platform/store.js';
import { createPortal } from '../lib/platform/portal.js';
import { ApiError } from '../lib/platform/errors.js';

const AT = Date.parse('2026-10-11T12:00:00.000Z'), ORIGIN = 'https://maximus.tennis';
const request = (p, headers = {}, path = '/api/synthetic-control') => new Request(ORIGIN + path, { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(p) });
/** Real existing portal auth against synthetic accounts; no external mail or provider requests. */
async function fixture() {
  const store = createMemoryStore(), messages = [];
  const portal = createPortal({ store, now: () => AT, env: { NODE_ENV: 'test', PORTAL_ENABLED: 'true', PORTAL_RUNTIME_VERIFIED: 'true' }, mailer: { send: async message => { messages.push(message); return { ok: true }; } } });
  async function account(email) {
    const password = 'synthetic-control-long-password';
    assert.equal((await portal.handle(request({ email, password, displayName: 'Synthetic control owner', roles: ['player'], locale: 'en', consents: { terms: true, privacy: true, marketing: false } }), 'register')).status, 202);
    const token = new URL(messages.find(m => m.to === email && m.templateKey === 'verify_email').params.link).searchParams.get('token');
    assert.equal((await portal.handle(request({ token }), 'verify')).status, 200);
    const login = await portal.handle(request({ email, password }), 'login'); assert.equal(login.status, 200);
    const result = await login.json(); return { user: result.user, headers: { Cookie: login.headers.get('set-cookie').split(';')[0], 'X-CSRF-Token': result.csrfToken } };
  }
  const owner = await account('synthetic-control-owner@example.invalid');
  const ctx = { userId: owner.user.id, organizationId: 'maximus-tennis', emailVerified: true };
  const grant = { status: 'verified', kind: 'payment_control_authorization', purpose: 'payment_control', mode: 'live', test: false, authenticationBasis: 'independently_verified_owner_authorization', authorizationId: 'synthetic-http-grant', evidenceId: 'synthetic-http-evidence', scopeHash: TENNIS_CONTROL_SCOPE.hash, projectId: 'tennis', organizationId: 'maximus-tennis', ownerUserId: ctx.userId, currency: 'USD', totalMinor: '100', fulfillment: 'none', termsVersion: 'synthetic-control-v1', termsText: 'USD 1.00 control payment. No goods, delivery or investment.', verifiedAt: new Date(AT - 1000).toISOString(), expiresAt: new Date(AT + 3600000).toISOString() };
  let references = 0, reads = 0;
  const assembly = { store, now: () => AT, production: false, resolveAuthorizationReference: async () => { references++; return 'synthetic-private-reference'; }, resolveAuthorization: async () => structuredClone(grant), authenticateCustomer: portal.authenticatedCustomer,
    reader: { async discoverMovements() { reads++; return []; } } };
  const runtime = createTennisControlRuntime(assembly), deps = { runtimeFactory: async () => runtime, now: () => AT };
  const prepareBody = { idempotencyKey: 'synthetic-control-http-idem', termsVersion: grant.termsVersion };
  const post = (action = 'prepare', p = prepareBody, headers = {}, path) => handleTennisControlRequest(request(p, { ...owner.headers, ...headers }, path), action, deps);
  const suspend = async () => { const row = await store.get('user', ctx.userId); await store.commit({ writes: [{ type: 'user', id: ctx.userId, expectedVersion: row.version, doc: { ...row.doc, status: 'suspended' } }] }); };
  return { store, portal, account, owner, ctx, grant, assembly, runtime, deps, prepareBody, post, suspend, counts: () => ({ references, reads }) };
}
function privateFree(p) {
  const source = JSON.stringify(p);
  for (const token of ['synthetic-private', 'sessionId', 'providerOrderId', 'authorizationReference', 'ownerUserId', 'evidenceHash', 'snapshotHash', 'successIndicator', 'password', 'cardNumber', '300281']) assert.equal(source.includes(token), false, token);
}

test('control HTTP default is unconfigured before body/session reads and rejects unsupported methods', async () => {
  const req = request({}); const result = await handleTennisControlRequest(req, 'prepare');
  assert.equal(result.status, 503); assert.equal((await result.json()).code, 'control_unconfigured'); assert.equal(req.bodyUsed, false);
  const get = await handleTennisControlRequest(new Request(ORIGIN + '/api/synthetic-control'), 'status', { runtimeFactory: () => assert.fail('method rejected first') });
  assert.equal(get.status, 405); assert.equal(get.headers.get('allow'), 'POST');
});

test('actual cookie session and CSRF prepare once without a bank call, safe result and private headers', async () => {
  const f = await fixture(), first = await f.post(), again = await f.post(), p = await first.json(), q = await again.json();
  assert.equal(first.status, 201); assert.equal(again.status, 200); assert.equal(p.code, 'control_prepared'); assert.equal(p.order.id, q.order.id);
  assert.equal(p.order.currency, 'USD'); assert.equal(p.order.totalMinor, '100'); assert.equal(p.order.status, 'issued'); assert.equal(p.proof, null); assert.equal(p.initiationAvailable, false); assert.equal(p.rendererReady, false);
  privateFree(p); assert.equal(f.counts().reads, 0); assert.notEqual(p.correlationId, q.correlationId);
  for (const [header, expected] of [['cache-control', 'no-store, private'], ['referrer-policy', 'no-referrer'], ['x-content-type-options', 'nosniff'], ['x-robots-tag', 'noindex, nofollow']]) assert.equal(first.headers.get(header), expected);
  assert.equal(first.headers.get('x-correlation-id'), p.correlationId);
});

test('actual guest, wrong CSRF, foreign origin, bearer and query references fail before any order preparation', async () => {
  const f = await fixture();
  for (const [headers, expected] of [[{ Cookie: '' }, 401], [{ 'X-CSRF-Token': 'bad' }, 403], [{ Origin: '' }, 403], [{ Origin: 'https://foreign.example.invalid' }, 403], [{ 'Sec-Fetch-Site': 'cross-site' }, 403], [{ 'Sec-Fetch-Site': 'same-site' }, 403], [{ Authorization: 'Bearer private' }, 400]]) {
    const response = await f.post('prepare', f.prepareBody, headers); assert.equal(response.status, expected); privateFree(await response.json());
  }
  assert.equal((await f.post('prepare', f.prepareBody, {}, '/api/synthetic-control?authorizationReference=private')).status, 400);
  const alien = new Request('https://foreign.example.invalid/api/synthetic-control', { method: 'POST', headers: { ...f.owner.headers, Origin: ORIGIN, 'Content-Type': 'application/json' }, body: JSON.stringify(f.prepareBody) });
  assert.equal((await handleTennisControlRequest(alien, 'prepare', f.deps)).status, 403); assert.equal(f.counts().references, 0);
});

test('foreign actual account and revoked owner cannot inspect order or trigger a reader', async () => {
  const f = await fixture(), created = await (await f.post()).json(), other = await f.account('synthetic-other-owner@example.invalid');
  const p = { orderId: created.order.id };
  assert.equal((await f.post('status', p, other.headers)).status, 404);
  assert.equal((await f.post('prepare', f.prepareBody, other.headers)).status, 403);
  await f.suspend(); assert.equal((await f.post('status', p)).status, 401); assert.equal(f.counts().reads, 0);
});

test('authenticated status checks CSRF and reads only after durable attempt reservation', async () => {
  const f = await fixture(), p = await (await f.post()).json(), query = { orderId: p.order.id };
  assert.equal((await f.post('status', query, { 'X-CSRF-Token': '' })).status, 403);
  const before = await (await f.post('status', query)).json(); assert.equal(before.proof, null); assert.equal(f.counts().reads, 0);
  await createTennisControlOrderService(f.assembly).reserveAttempt({ ctx: f.ctx, orderId: p.order.id });
  const after = await (await f.post('status', query)).json(); assert.equal(after.proof.status, 'pending'); assert.equal(after.proof.ledgerPosted, false); assert.equal(f.counts().reads, 1); privateFree(after);
});

test('HTTP financial fields, callbacks, refs, sessions, wrong order format and missing terms are rejected', async () => {
  const f = await fixture();
  for (const p of [{}, { ...f.prepareBody, authorizationReference: 'private' }, { ...f.prepareBody, currency: 'AED' }, { ...f.prepareBody, totalMinor: '1' }, { ...f.prepareBody, ownerUserId: f.ctx.userId }, { ...f.prepareBody, sessionId: 'SESSIONprivate' }, { ...f.prepareBody, termsVersion: '' }, { ...f.prepareBody, idempotencyKey: 'short' }]) assert.equal((await f.post('prepare', p)).status, 400);
  for (const p of [{ orderId: `MX-ORD-${'1'.repeat(32)}` }, { orderId: `MX-CTL-${'1'.repeat(32)}`, resultIndicator: 'SUCCESS' }, { providerOrderId: 'private' }, []]) assert.equal((await f.post('status', p)).status, 400);
  assert.equal(f.counts().references, 0); assert.equal(f.counts().reads, 0);
});

test('parser bounds content type, declared and streamed bytes, invalid UTF8 and pending bodies', async () => {
  const f = await fixture();
  for (const [headers, expected] of [[{ 'Content-Type': 'text/plain' }, 415], [{ 'Content-Length': '1025' }, 413], [{ 'Content-Length': '-1' }, 413]]) assert.equal((await f.post('prepare', f.prepareBody, headers)).status, expected);
  const headers = { ...f.owner.headers, Origin: ORIGIN, 'Content-Type': 'application/json' };
  for (const [body, expected] of [[new Uint8Array(1025), 413], [new Uint8Array([0xff]), 400], ['{', 400]]) {
    const req = new Request(ORIGIN + '/api/synthetic-control', { method: 'POST', headers, body }); assert.equal((await handleTennisControlRequest(req, 'prepare', f.deps)).status, expected);
  }
  const stalled = new Request(ORIGIN + '/api/synthetic-control', { method: 'POST', headers, body: new ReadableStream({ start() {} }), duplex: 'half' });
  assert.equal((await handleTennisControlRequest(stalled, 'prepare', { ...f.deps, bodyTimeoutMs: 10 })).status, 408); assert.equal(f.counts().references, 0);
});

test('trusted dependency failures are sanitized including nested details, messages, URLs and headers', async () => {
  const f = await fixture();
  for (const error of [new Error('secret-key https://private.example.invalid/session'), new ApiError(403, 'secret-key', { details: { sessionId: 'private' }, headers: { 'X-Secret': 'private' }, messageKey: 'private', fieldErrors: { cardNumber: 'private' } })]) {
    const runtime = { ...f.runtime, service: { ...f.runtime.service, prepare: async () => { throw error; } } };
    const response = await handleTennisControlRequest(request(f.prepareBody, f.owner.headers), 'prepare', { ...f.deps, runtimeFactory: async () => runtime });
    assert.equal(response.status, error instanceof ApiError ? 403 : 503); const p = await response.json(); privateFree(p); assert.equal(JSON.stringify(p).includes('secret-key'), false); assert.equal(JSON.stringify(p).includes('example.invalid'), false); assert.equal(response.headers.get('x-secret'), null);
  }
});

test('HTTP response projection rejects forged readiness, money, paid states and foreign proof/order', async () => {
  const f = await fixture(), good = await f.runtime.service.prepare({ ctx: f.ctx, ...f.prepareBody });
  const call = async (value, action = 'prepare') => handleTennisControlRequest(request(action === 'prepare' ? f.prepareBody : { orderId: good.order.id }, f.owner.headers), action, { ...f.deps, runtimeFactory: async () => ({ ...f.runtime, service: { ...f.runtime.service, [action]: async () => value } }) });
  const extra = await call({ ...good, sessionId: 'private', order: { ...good.order, providerOrderId: 'private', terms: { ...good.order.terms, private: 'private' } } }); assert.equal(extra.status, 201); privateFree(await extra.json());
  for (const change of [{ currency: 'AED' }, { totalMinor: '101' }, { rendererReady: true }, { paymentVerified: true }, { status: 'paid' }]) assert.equal((await call({ ...good, order: { ...good.order, ...change } })).status, 503);
  const proof = { orderId: good.order.id, status: 'captured', currency: 'USD', totalMinor: '100', capturedMinor: '100', refundedMinor: '0', movementCount: 1, observedAt: new Date(AT).toISOString(), reason: null, ledgerPosted: false };
  assert.equal((await call({ order: good.order, proof }, 'status')).status, 200);
  for (const change of [{ orderId: `MX-CTL-${'f'.repeat(32)}` }, { capturedMinor: '99' }, { refundedMinor: '100' }, { status: 'paid' }, { reason: 'private-key' }, { ledgerPosted: true }]) assert.equal((await call({ order: good.order, proof: { ...proof, ...change } }, 'status')).status, 503);
  assert.equal((await call({ order: { ...good.order, id: `MX-CTL-${'f'.repeat(32)}` }, proof: null }, 'status')).status, 503);
  const readiness = { ...f.runtime.service.readiness, initiationAvailable: true };
  assert.equal((await handleTennisControlRequest(request(f.prepareBody, f.owner.headers), 'prepare', { ...f.deps, runtimeFactory: async () => ({ ...f.runtime, service: { ...f.runtime.service, readiness } }) })).status, 503);
});

test('logout while request body is pending prevents preparation after initial authentication', async () => {
  const f = await fixture(); let streamController, entered;
  const authenticated = new Promise(resolve => { entered = resolve; });
  const runtime = { ...f.runtime, authenticateCustomer: async (request, options) => { const ctx = await f.portal.authenticatedCustomer(request, options); entered(); return ctx; } };
  const req = new Request(ORIGIN + '/api/synthetic-control', { method: 'POST', headers: { ...f.owner.headers, Origin: ORIGIN, 'Content-Type': 'application/json' }, body: new ReadableStream({ start(controller) { streamController = controller; } }), duplex: 'half' });
  const pending = handleTennisControlRequest(req, 'prepare', { ...f.deps, runtimeFactory: async () => runtime });
  await authenticated;
  assert.equal((await f.portal.handle(request({}, f.owner.headers), 'logout')).status, 200);
  streamController.enqueue(new TextEncoder().encode(JSON.stringify(f.prepareBody))); streamController.close();
  const response = await pending; assert.equal(response.status, 401); assert.equal(f.counts().references, 0); privateFree(await response.json());
});

test('logout during a status reader call prevents returning control data from a stale session', async () => {
  const f = await fixture(), created = await (await f.post()).json();
  await createTennisControlOrderService(f.assembly).reserveAttempt({ ctx: f.ctx, orderId: created.order.id });
  const runtime = createTennisControlRuntime({ ...f.assembly, reader: { async discoverMovements() { assert.equal((await f.portal.handle(request({}, f.owner.headers), 'logout')).status, 200); return []; } } });
  const response = await handleTennisControlRequest(request({ orderId: created.order.id }, f.owner.headers), 'status', { ...f.deps, runtimeFactory: async () => runtime });
  assert.equal(response.status, 401); const result = await response.json(); assert.equal(result.order, undefined); assert.equal(result.proof, undefined); privateFree(result);
});

test('authenticated subject change across body processing fails closed', async () => {
  const f = await fixture(); let calls = 0;
  const runtime = { ...f.runtime, authenticateCustomer: async () => ({ ...f.ctx, ...(++calls > 1 ? { userId: `usr_${'1'.repeat(20)}` } : {}) }) };
  const response = await handleTennisControlRequest(request(f.prepareBody, f.owner.headers), 'prepare', { ...f.deps, runtimeFactory: async () => runtime });
  assert.equal(response.status, 403); assert.equal(f.counts().references, 0);
});
