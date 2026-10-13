/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { handleTennisControlRequest } from '../lib/commerce/tennis-control-http.js';
import { createTennisControlRuntime } from '../lib/commerce/tennis-control-runtime.js';
import { createTennisControlAuthorizer, TENNIS_CONTROL_TERMS } from '../lib/commerce/tennis-control-authorizer.js';
import { TENNIS_CONTROL_SESSION_CONTRACT, TENNIS_CONTROL_TYPES } from '../lib/commerce/tennis-control-order.js';
import { createMemoryStore } from '../lib/platform/store.js';
import { createPortal } from '../lib/platform/portal.js';
import { ApiError } from '../lib/platform/errors.js';
import { hashPayload } from '../lib/platform/ids.js';

const AT = Date.parse('2026-10-12T12:00:00.000Z'), ORIGIN = 'https://maximus.tennis', OWNER_EMAIL = 'synthetic-control-owner@example.invalid';
const SESSION = 'SESSIONsyntheticPrivateControl123';
const request = (p, headers = {}, path = '/api/accounts/control/synthetic') => new Request(ORIGIN + path, { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(p) });
/** Real existing portal auth and real authorizer against synthetic accounts; synthetic gateway and reader. */
async function fixture() {
  const store = createMemoryStore(), messages = []; let at = AT;
  const portal = createPortal({ store, now: () => at, env: { NODE_ENV: 'test', PORTAL_ENABLED: 'true', PORTAL_RUNTIME_VERIFIED: 'true' }, mailer: { send: async message => { messages.push(message); return { ok: true }; } } });
  async function account(email) {
    const password = 'synthetic-control-long-password';
    assert.equal((await portal.handle(request({ email, password, displayName: 'Synthetic control owner', roles: ['player'], locale: 'en', consents: { terms: true, privacy: true, marketing: false } }), 'register')).status, 202);
    const token = new URL(messages.find(m => m.to === email && m.templateKey === 'verify_email').params.link).searchParams.get('token');
    assert.equal((await portal.handle(request({ token }), 'verify')).status, 200);
    const login = await portal.handle(request({ email, password }), 'login'); assert.equal(login.status, 200);
    const result = await login.json(); return { user: result.user, headers: { Cookie: login.headers.get('set-cookie').split(';')[0], 'X-CSRF-Token': result.csrfToken } };
  }
  const owner = await account(OWNER_EMAIL);
  const ctx = { userId: owner.user.id, organizationId: 'maximus-tennis', emailVerified: true };
  const state = { posts: 0, reads: 0, inquiries: 0, captured: false, gateway: null };
  const adapter = { merchantId: '300281',
    async inquire() { state.inquiries++; return { contract: 'mpgs_payment_options_inquiry_100_v1', merchantId: '300281', cardPayments: true, currencies: ['AED', 'USD'], threeDSecureSchemes: ['SECURE_CODE'], usdPermitted: true, observedAt: new Date(at).toISOString() }; },
    async initiate({ attempt }) { state.posts++; return { contract: TENNIS_CONTROL_SESSION_CONTRACT, sessionId: SESSION, providerOrderId: attempt.providerOrderId, currency: 'USD', totalMinor: '100', correlation: attempt.correlation, verifiedAt: new Date(at).toISOString(), localSessionDeadline: attempt.localSessionDeadline }; } };
  const reader = {
    async discoverMovements(q) {
      state.reads++; if (!state.captured) return [];
      const fields = ['providerOrderId', 'transactionId', 'kind', 'amountMinor', 'currency', 'totalMinor', 'capturedMinor', 'refundedMinor', 'occurredAt', 'merchantId'];
      const m = { providerOrderId: q.providerOrderId, transactionId: 'capture_1', kind: 'capture', amountMinor: '100', currency: 'USD', totalMinor: '100', capturedMinor: '100', refundedMinor: '0', occurredAt: new Date(AT).toISOString(), merchantId: '300281', verifiedAt: new Date(at).toISOString() };
      return [{ ...m, evidenceHash: hashPayload(Object.fromEntries(fields.map(key => [key, m[key]]))) }];
    },
    async readSummary({ providerOrderId }) { return state.gateway ? { present: true, providerOrderId, observedAt: new Date(at).toISOString(), currencyMatches: true, amountMatches: true, capturedMinor: state.captured ? '100' : '0', transactionCount: 1, ...state.gateway } : { present: false, providerOrderId, observedAt: new Date(at).toISOString(), validationType: 'INVALID' }; },
  };
  const authorizer = createTennisControlAuthorizer({ store, ownerEmail: OWNER_EMAIL, now: () => at });
  const assembly = { store, authorizer, adapter, reader, now: () => at, production: false, authenticateCustomer: portal.authenticatedCustomer, webhookConfigured: true };
  const runtime = createTennisControlRuntime(assembly), deps = { runtimeFactory: async () => runtime, now: () => at };
  const prepareBody = { idempotencyKey: 'synthetic-control-http-idem', termsVersion: TENNIS_CONTROL_TERMS.version };
  const post = (action = 'prepare', p = prepareBody, headers = {}, path) => handleTennisControlRequest(request(p, { ...owner.headers, ...headers }, path), action, deps);
  const suspend = async () => { const row = await store.get('user', ctx.userId); await store.commit({ writes: [{ type: 'user', id: ctx.userId, expectedVersion: row.version, doc: { ...row.doc, status: 'suspended' } }] }); };
  return { store, portal, account, owner, ctx, assembly, runtime, deps, prepareBody, post, suspend, state, advance: n => { at += n; } };
}
function privateFree(p, { allowSession = false } = {}) {
  const source = JSON.stringify(p);
  for (const token of ['synthetic-private', 'providerOrderId', 'authorizationReference', 'ownerUserId', 'evidenceHash', 'snapshotHash', 'successIndicator', 'password', 'cardNumber', '300281', 'correlation"', 'authorizationId', 'tcg_']) assert.equal(source.includes(token), false, token);
  if (!allowSession) assert.equal(source.includes(SESSION), false, 'session');
}

test('control HTTP default is unconfigured before body/session reads and rejects unsupported methods', async () => {
  const req = request({}); const result = await handleTennisControlRequest(req, 'prepare');
  assert.equal(result.status, 503); assert.equal((await result.json()).code, 'control_unconfigured'); assert.equal(req.bodyUsed, false);
  const get = await handleTennisControlRequest(new Request(ORIGIN + '/api/accounts/control/status'), 'status', { runtimeFactory: () => assert.fail('method rejected first') });
  assert.equal(get.status, 405); assert.equal(get.headers.get('allow'), 'POST');
  const f = await fixture(); assert.equal((await f.post('refund', {})).status, 400);
});

test('actual cookie session and CSRF prepare once without a bank call, safe result and private headers', async () => {
  const f = await fixture(), first = await f.post(), again = await f.post(), p = await first.json(), q = await again.json();
  assert.equal(first.status, 201); assert.equal(again.status, 200); assert.equal(p.code, 'control_prepared'); assert.equal(p.order.id, q.order.id); assert.equal(p.duplicate, false); assert.equal(q.duplicate, true);
  assert.equal(p.order.currency, 'USD'); assert.equal(p.order.totalMinor, '100'); assert.equal(p.order.status, 'issued'); assert.equal(p.order.terms.text, TENNIS_CONTROL_TERMS.text); assert.equal(p.session, undefined); assert.equal(p.proof, undefined);
  privateFree(p); assert.equal(f.state.reads, 0); assert.equal(f.state.posts, 0); assert.notEqual(p.correlationId, q.correlationId);
  for (const [header, expected] of [['cache-control', 'no-store, private'], ['referrer-policy', 'no-referrer'], ['x-content-type-options', 'nosniff'], ['x-robots-tag', 'noindex, nofollow']]) assert.equal(first.headers.get(header), expected);
  assert.equal(first.headers.get('x-correlation-id'), p.correlationId);
});

test('initiate returns the private session only to the owner, once reserved, and never through status or current', async () => {
  const f = await fixture(), created = await (await f.post()).json(), body = { orderId: created.order.id, locale: 'ru' };
  const first = await f.post('initiate', body), p = await first.json();
  assert.equal(first.status, 200); assert.equal(p.code, 'control_initiated'); assert.equal(p.order.status, 'session_created');
  assert.deepEqual(p.session, { contract: 'mpgs_hosted_checkout_embedded_v1', serverVerified: true, sessionId: SESSION, gatewayOrigin: 'https://ap-gateway.mastercard.com', sdkUrl: 'https://ap-gateway.mastercard.com/static/checkout/checkout.min.js', sdkVersion: '100', expiresAt: p.order.localSessionDeadline });
  privateFree(p, { allowSession: true }); assert.equal(f.state.posts, 1); assert.equal(f.state.inquiries, 1);
  const again = await (await f.post('initiate', body)).json(); assert.equal(again.session.sessionId, SESSION); assert.equal(f.state.posts, 1);
  const status = await (await f.post('status', { orderId: created.order.id })).json();
  assert.equal(status.code, 'control_status'); assert.equal(status.payment, 'awaiting_payment'); assert.equal(status.proof.status, 'pending'); assert.deepEqual(status.observation, { present: false, observedAt: new Date(AT).toISOString() }); privateFree(status);
  const current = await (await f.post('current', {})).json();
  assert.equal(current.code, 'control_current'); assert.equal(current.owner, true); assert.equal(current.order.id, created.order.id); assert.equal(current.payment, 'awaiting_payment'); assert.equal(current.canOpen, false); assert.equal(current.webhookConfigured, true); privateFree(current);
  const other = await f.account('synthetic-other-member@example.invalid');
  assert.equal((await f.post('initiate', body, other.headers)).status, 404);
  assert.deepEqual(await (await f.post('current', {}, other.headers)).json().then(r => r.owner), false);
  const readiness = await f.post('readiness', {}, other.headers); assert.equal(readiness.status, 403); assert.equal((await readiness.json()).reason, 'control_owner_mismatch');
  for (const p of [{ orderId: created.order.id }, { orderId: created.order.id, locale: 'xx' }, { orderId: created.order.id, locale: 'ru', sessionId: 'SESSIONx' }]) assert.equal((await f.post('initiate', p)).status, 400);
});

test('status reflects the authenticated gateway outcome: declined, then paid; the account view follows', async () => {
  const f = await fixture(), created = await (await f.post()).json(), query = { orderId: created.order.id };
  await f.post('initiate', { orderId: created.order.id, locale: 'en' });
  f.state.gateway = { orderStatus: 'FAILED', lastTransaction: { type: 'PAYMENT', result: 'FAILURE', gatewayCode: 'DECLINED' } };
  let status = await (await f.post('status', query)).json();
  assert.equal(status.payment, 'declined'); assert.deepEqual(status.observation.lastTransaction, { type: 'PAYMENT', result: 'FAILURE', gatewayCode: 'DECLINED' }); assert.equal(status.proof.status, 'pending');
  f.state.captured = true; f.state.gateway = { orderStatus: 'CAPTURED', lastTransaction: { type: 'PAYMENT', result: 'SUCCESS', gatewayCode: 'APPROVED' } };
  status = await (await f.post('status', query)).json(); assert.equal(status.payment, 'paid'); assert.equal(status.proof.status, 'captured'); assert.equal(status.proof.capturedMinor, '100'); assert.equal(status.proof.ledgerPosted, false);
  const current = await (await f.post('current', {})).json(); assert.equal(current.payment, 'paid'); assert.equal(current.canOpen, true);
  const next = await (await f.post('prepare', { ...f.prepareBody, idempotencyKey: 'synthetic-second-series' })).json(); assert.notEqual(next.order.id, created.order.id);
});

test('readiness reports the acquirer currency list, webhook flag and SDK contract to the owner only', async () => {
  const f = await fixture(), response = await f.post('readiness', {}), p = await response.json();
  assert.equal(response.status, 200); assert.equal(p.code, 'control_readiness'); assert.equal(p.configured, true); assert.equal(p.merchant.usdPermitted, true); assert.deepEqual(p.merchant.currencies, ['AED', 'USD']); assert.equal(p.webhookConfigured, true);
  assert.deepEqual(p.sdk, { url: 'https://ap-gateway.mastercard.com/static/checkout/checkout.min.js', version: '100', mount: 'showEmbeddedPage' }); assert.equal(p.embeddedContract, 'mpgs_hosted_checkout_embedded_v1');
  privateFree(p); assert.equal(f.state.inquiries, 1);
  assert.equal((await f.post('readiness', { refresh: true })).status, 400);
});

test('actual guest, wrong CSRF, foreign origin, bearer and query references fail before any order preparation', async () => {
  const f = await fixture();
  for (const [headers, expected] of [[{ Cookie: '' }, 401], [{ 'X-CSRF-Token': 'bad' }, 403], [{ Origin: '' }, 403], [{ Origin: 'https://foreign.example.invalid' }, 403], [{ 'Sec-Fetch-Site': 'cross-site' }, 403], [{ 'Sec-Fetch-Site': 'same-site' }, 403], [{ Authorization: 'Bearer private' }, 400]]) {
    const response = await f.post('prepare', f.prepareBody, headers); assert.equal(response.status, expected); privateFree(await response.json());
  }
  assert.equal((await f.post('prepare', f.prepareBody, {}, '/api/accounts/control/prepare?authorizationReference=private')).status, 400);
  const alien = new Request('https://foreign.example.invalid/api/accounts/control/prepare', { method: 'POST', headers: { ...f.owner.headers, Origin: ORIGIN, 'Content-Type': 'application/json' }, body: JSON.stringify(f.prepareBody) });
  assert.equal((await handleTennisControlRequest(alien, 'prepare', f.deps)).status, 403);
  assert.equal(await f.store.get('tennisControlGrantHead', f.ctx.userId), null);
});

test('a verified member who is not the configured owner gets an explicit reason and cannot see or prepare control orders', async () => {
  const f = await fixture(), created = await (await f.post()).json(), other = await f.account('synthetic-other-owner@example.invalid');
  const p = { orderId: created.order.id };
  assert.equal((await f.post('status', p, other.headers)).status, 404);
  const denied = await f.post('prepare', f.prepareBody, other.headers); assert.equal(denied.status, 403); assert.equal((await denied.json()).reason, 'control_owner_mismatch');
  await f.suspend(); assert.equal((await f.post('status', p)).status, 401); assert.equal(f.state.reads, 0);
});

test('authenticated status checks CSRF and reads only after durable attempt reservation', async () => {
  const f = await fixture(), p = await (await f.post()).json(), query = { orderId: p.order.id };
  assert.equal((await f.post('status', query, { 'X-CSRF-Token': '' })).status, 403);
  const before = await (await f.post('status', query)).json(); assert.equal(before.proof, null); assert.equal(before.payment, 'not_started'); assert.equal(f.state.reads, 0);
  await f.post('initiate', { orderId: p.order.id, locale: 'en' });
  const after = await (await f.post('status', query)).json(); assert.equal(after.proof.status, 'pending'); assert.equal(f.state.reads, 1); privateFree(after);
});

test('HTTP financial fields, callbacks, refs, sessions, wrong order format and missing terms are rejected', async () => {
  const f = await fixture();
  for (const p of [{}, { ...f.prepareBody, authorizationReference: 'private' }, { ...f.prepareBody, currency: 'AED' }, { ...f.prepareBody, totalMinor: '1' }, { ...f.prepareBody, ownerUserId: f.ctx.userId }, { ...f.prepareBody, sessionId: 'SESSIONprivate' }, { ...f.prepareBody, termsVersion: '' }, { ...f.prepareBody, idempotencyKey: 'short' }]) assert.equal((await f.post('prepare', p)).status, 400);
  for (const p of [{ orderId: `MX-ORD-${'1'.repeat(32)}` }, { orderId: `MX-CTL-${'1'.repeat(32)}`, resultIndicator: 'SUCCESS' }, { providerOrderId: 'private' }, []]) assert.equal((await f.post('status', p)).status, 400);
  for (const p of [{ orderId: 'x' }, { ownerUserId: f.ctx.userId }]) assert.equal((await f.post('current', p)).status, 400);
  assert.equal(await f.store.get('tennisControlGrantHead', f.ctx.userId), null); assert.equal(f.state.reads, 0);
});

test('parser bounds content type, declared and streamed bytes, invalid UTF8 and pending bodies', async () => {
  const f = await fixture();
  for (const [headers, expected] of [[{ 'Content-Type': 'text/plain' }, 415], [{ 'Content-Length': '1025' }, 413], [{ 'Content-Length': '-1' }, 413]]) assert.equal((await f.post('prepare', f.prepareBody, headers)).status, expected);
  const headers = { ...f.owner.headers, Origin: ORIGIN, 'Content-Type': 'application/json' };
  for (const [body, expected] of [[new Uint8Array(1025), 413], [new Uint8Array([0xff]), 400], ['{', 400]]) {
    const req = new Request(ORIGIN + '/api/accounts/control/prepare', { method: 'POST', headers, body }); assert.equal((await handleTennisControlRequest(req, 'prepare', f.deps)).status, expected);
  }
  const stalled = new Request(ORIGIN + '/api/accounts/control/prepare', { method: 'POST', headers, body: new ReadableStream({ start() {} }), duplex: 'half' });
  assert.equal((await handleTennisControlRequest(stalled, 'prepare', { ...f.deps, bodyTimeoutMs: 10 })).status, 408); assert.equal(await f.store.get('tennisControlGrantHead', f.ctx.userId), null);
});

test('trusted dependency failures are sanitized including nested details, messages, URLs and headers', async () => {
  const f = await fixture();
  for (const error of [new Error('secret-key https://private.example.invalid/session'), new ApiError(403, 'secret-key', { details: { sessionId: 'private' }, headers: { 'X-Secret': 'private' }, messageKey: 'private', fieldErrors: { cardNumber: 'private' } })]) {
    const runtime = { ...f.runtime, service: { ...f.runtime.service, prepare: async () => { throw error; } } };
    const response = await handleTennisControlRequest(request(f.prepareBody, f.owner.headers), 'prepare', { ...f.deps, runtimeFactory: async () => runtime });
    assert.equal(response.status, error instanceof ApiError ? 403 : 503); const p = await response.json(); privateFree(p); assert.equal(JSON.stringify(p).includes('secret-key'), false); assert.equal(JSON.stringify(p).includes('example.invalid'), false); assert.equal(response.headers.get('x-secret'), null); assert.equal(p.reason, undefined);
  }
  const blocked = { ...f.runtime, service: { ...f.runtime.service, initiate: async () => { throw new ApiError(403, 'control_currency_not_permitted'); } } };
  const response = await handleTennisControlRequest(request({ orderId: `MX-CTL-${'a'.repeat(32)}`, locale: 'en' }, f.owner.headers), 'initiate', { ...f.deps, runtimeFactory: async () => blocked });
  assert.equal(response.status, 403); assert.equal((await response.json()).reason, 'control_currency_not_permitted');
});

test('HTTP response projection rejects forged readiness, money, paid states, sessions and foreign proof/order', async () => {
  const f = await fixture(), good = await f.runtime.service.prepare({ ctx: f.ctx, ...f.prepareBody });
  const call = async (value, action = 'prepare') => handleTennisControlRequest(request(action === 'prepare' ? f.prepareBody : action === 'initiate' ? { orderId: good.order.id, locale: 'en' } : action === 'current' ? {} : { orderId: good.order.id }, f.owner.headers), action, { ...f.deps, runtimeFactory: async () => ({ ...f.runtime, service: { ...f.runtime.service, [action]: async () => value } }) });
  const extra = await call({ ...good, sessionId: 'private', order: { ...good.order, providerOrderId: 'private', terms: { ...good.order.terms, private: 'private' } } }); assert.equal(extra.status, 201); privateFree(await extra.json());
  for (const change of [{ currency: 'AED' }, { totalMinor: '101' }, { paymentVerified: true }, { status: 'paid' }, { financialProductEnabled: true }]) assert.equal((await call({ ...good, order: { ...good.order, ...change } })).status, 503);
  const proof = { orderId: good.order.id, status: 'captured', currency: 'USD', totalMinor: '100', capturedMinor: '100', refundedMinor: '0', movementCount: 1, observedAt: new Date(AT).toISOString(), reason: null, ledgerPosted: false };
  const observation = { present: true, observedAt: new Date(AT).toISOString(), orderStatus: 'CAPTURED', currencyMatches: true, amountMatches: true, transactionCount: 1, lastTransaction: { type: 'PAYMENT', result: 'SUCCESS', gatewayCode: 'APPROVED' } };
  assert.equal((await call({ order: good.order, proof, observation, payment: 'paid' }, 'status')).status, 200);
  for (const change of [{ orderId: `MX-CTL-${'f'.repeat(32)}` }, { capturedMinor: '99' }, { refundedMinor: '100' }, { status: 'paid' }, { reason: 'private-key' }, { ledgerPosted: true }]) assert.equal((await call({ order: good.order, proof: { ...proof, ...change }, observation, payment: 'paid' }, 'status')).status, 503);
  for (const value of ['settled', 'PAID', null, 42]) assert.equal((await call({ order: good.order, proof, observation, payment: value }, 'status')).status, 503);
  assert.equal((await call({ order: good.order, proof, observation: { ...observation, orderStatus: 'drop table' }, payment: 'paid' }, 'status')).status, 200);
  assert.equal((await call({ order: good.order, proof, observation: { present: 'yes' }, payment: 'paid' }, 'status')).status, 503);
  assert.equal((await call({ order: { ...good.order, id: `MX-CTL-${'f'.repeat(32)}` }, proof: null, observation: null, payment: 'not_started' }, 'status')).status, 503);
  const session = { contract: 'mpgs_hosted_checkout_embedded_v1', serverVerified: true, sessionId: SESSION, gatewayOrigin: 'https://ap-gateway.mastercard.com', sdkUrl: 'https://ap-gateway.mastercard.com/static/checkout/checkout.min.js', sdkVersion: '100', expiresAt: new Date(AT + 60000).toISOString() };
  assert.equal((await call({ order: { ...good.order, status: 'session_created', localSessionDeadline: session.expiresAt }, session }, 'initiate')).status, 200);
  for (const change of [{ gatewayOrigin: 'https://evil.invalid' }, { sdkUrl: 'https://evil.invalid/checkout.min.js' }, { sdkVersion: '99' }, { serverVerified: false }, { sessionId: 'not-a-session' }]) assert.equal((await call({ order: { ...good.order, status: 'session_created', localSessionDeadline: session.expiresAt }, session: { ...session, ...change } }, 'initiate')).status, 503);
  const readiness = { ...f.runtime.service.readiness, runtimeEnabled: false };
  assert.equal((await handleTennisControlRequest(request(f.prepareBody, f.owner.headers), 'prepare', { ...f.deps, runtimeFactory: async () => ({ ...f.runtime, service: { ...f.runtime.service, readiness } }) })).status, 503);
  assert.equal((await call({ owner: true, canOpen: true, terms: { version: 'v', text: 'synthetic terms text long enough' }, webhookConfigured: false, order: null, proof: null, observation: null, payment: null }, 'current')).status, 200);
  assert.equal((await call({ owner: true, canOpen: true, terms: { version: 'v', text: 'synthetic terms text long enough' }, webhookConfigured: false, order: good.order, proof: null, observation: null, payment: 'paid', secret: 'x' }, 'current')).status, 200);
  assert.equal((await call({ owner: 'yes' }, 'current')).status, 503);
});

test('logout while request body is pending prevents preparation after initial authentication', async () => {
  const f = await fixture(); let streamController, entered;
  const authenticated = new Promise(resolve => { entered = resolve; });
  const runtime = { ...f.runtime, authenticateCustomer: async (request, options) => { const ctx = await f.portal.authenticatedCustomer(request, options); entered(); return ctx; } };
  const req = new Request(ORIGIN + '/api/accounts/control/prepare', { method: 'POST', headers: { ...f.owner.headers, Origin: ORIGIN, 'Content-Type': 'application/json' }, body: new ReadableStream({ start(controller) { streamController = controller; } }), duplex: 'half' });
  const pending = handleTennisControlRequest(req, 'prepare', { ...f.deps, runtimeFactory: async () => runtime });
  await authenticated;
  assert.equal((await f.portal.handle(request({}, f.owner.headers), 'logout')).status, 200);
  streamController.enqueue(new TextEncoder().encode(JSON.stringify(f.prepareBody))); streamController.close();
  const response = await pending; assert.equal(response.status, 401); assert.equal(await f.store.get('tennisControlGrantHead', f.ctx.userId), null); privateFree(await response.json());
});

test('logout during a status reader call prevents returning control data from a stale session', async () => {
  const f = await fixture(), created = await (await f.post()).json();
  await f.post('initiate', { orderId: created.order.id, locale: 'en' });
  const runtime = createTennisControlRuntime({ ...f.assembly, reader: { ...f.assembly.reader, async discoverMovements() { assert.equal((await f.portal.handle(request({}, f.owner.headers), 'logout')).status, 200); return []; } } });
  const response = await handleTennisControlRequest(request({ orderId: created.order.id }, f.owner.headers), 'status', { ...f.deps, runtimeFactory: async () => runtime });
  assert.equal(response.status, 401); const result = await response.json(); assert.equal(result.order, undefined); assert.equal(result.proof, undefined); privateFree(result);
});

test('an expired local window withdraws the session from initiate while history remains readable', async () => {
  const f = await fixture(), created = await (await f.post()).json(), body = { orderId: created.order.id, locale: 'en' };
  await f.post('initiate', body); f.advance(15 * 60 * 1000);
  const late = await (await f.post('initiate', body)).json(); assert.equal(late.order.status, 'expired'); assert.equal(late.session, null); privateFree(late);
  const status = await (await f.post('status', { orderId: created.order.id })).json(); assert.equal(status.payment, 'expired'); assert.equal(f.state.posts, 1);
  assert.equal((await f.store.get(TENNIS_CONTROL_TYPES.attempt, created.order.id)).doc.createAttempts, 1);
});

test('authenticated subject change across body processing fails closed', async () => {
  const f = await fixture(); let calls = 0;
  const runtime = { ...f.runtime, authenticateCustomer: async () => ({ ...f.ctx, ...(++calls > 1 ? { userId: `usr_${'1'.repeat(20)}` } : {}) }) };
  const response = await handleTennisControlRequest(request(f.prepareBody, f.owner.headers), 'prepare', { ...f.deps, runtimeFactory: async () => runtime });
  assert.equal(response.status, 403); assert.equal(await f.store.get('tennisControlGrantHead', f.ctx.userId), null);
});
