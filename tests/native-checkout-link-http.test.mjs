/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { handleNativeCheckoutLinkRequest, resolveNativeCheckoutLinkHttpRuntime } from '../lib/platform/native-checkout-link-http.js';
import { createNativeCheckoutLinkService, NATIVE_CHECKOUT_INTENT_TYPE } from '../lib/platform/native-checkout-link.js';
import { createPortal } from '../lib/platform/portal.js';
import { createMemoryStore } from '../lib/platform/store.js';
import { createMemoryCommerceStore } from '../lib/commerce/store.js';
import { accessToken } from '../lib/commerce/access.js';
import { authorized } from '../lib/commerce/service.js';
import { COMMERCE_LEDGER_SELLER } from '../lib/platform/commerce-ledger.js';
import { hashPayload } from '../lib/platform/ids.js';
import { ApiError } from '../lib/platform/errors.js';
import { normalizeNativeMapping } from '../lib/platform/native-ledger-runtime.js';

const origin = 'https://maximus.tennis', AT = Date.parse('2026-10-11T00:00:00.000Z');
const ORDER = `MX-ORD-${'b'.repeat(32)}`;
const env = { NODE_ENV: 'test', PORTAL_ENABLED: 'true', PORTAL_RUNTIME_VERIFIED: 'true' };
const secret = 'SYNTHETIC-HTTP-ORDER-CAPABILITY-NOT-A-CREDENTIAL';
const key = 'synthetic-intent-001';
const path = id => `/api/accounts/orders/${id}/native-checkout-link`;
const request = (urlPath, body = {}, headers = {}) => new Request(origin + urlPath, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

async function fixture({ verified = true, snapshotChanges = {}, paymentChanges = {}, invoice = null } = {}) {
  let clock = AT, authCalls = 0, prepareCalls = 0, publisherCalls = 0, nativeReads = 0;
  const now = () => clock, store = createMemoryStore(), commerce = createMemoryCommerceStore(), messages = [];
  const portal = createPortal({ store, env, now, mailer: { send: async message => { messages.push(message); return { ok: true }; } },
    resolveOrderOwnership: ({ orderId, accessToken }) => authorized(commerce, orderId, accessToken, secret, now(), 'tennis') });
  async function login(email, verify = true) {
    const password = 'synthetic-fixture-long-password';
    if (!(await portal.identity.findUserByEmail(email))) {
      const before = messages.length;
      const registered = await portal.handle(request('/api/accounts/register', { email, password, displayName: 'Synthetic HTTP owner', roles: ['player'], locale: 'en', consents: { terms: true, privacy: true, marketing: false } }), 'register');
      assert.equal(registered.status, 202);
      if (verify) {
        const token = new URL(messages[before].params.link).searchParams.get('token');
        assert.equal((await portal.handle(request('/api/accounts/verify', { token }), 'verify')).status, 200);
      }
    }
    const loggedIn = await portal.handle(request('/api/accounts/login', { email, password }), 'login');
    assert.equal(loggedIn.status, 200);
    const session = await loggedIn.json();
    return { cookie: loggedIn.headers.get('set-cookie').split(';')[0], csrf: session.csrfToken, userId: session.user.id };
  }
  const owner = await login('owner@example.invalid', verified);
  // Every native field/approval here is synthetic. No fixture is an installed mapping or price.
  const mapping = { id: 'synthetic-link-http', version: 'synthetic-v1', status: 'verified_live_native_mapping', enabled: true, mode: 'live', mappingMode: 'durable_server_binding_v1', captureMode: 'full_single', projectId: 'tennis', organizationId: 'maximus-tennis', source: 'cscart_mpgs', merchantId: '300281', paymentMethodId: '18', companyId: '991', storefrontId: '991', currency: 'AED', processor: 'MPGS', sellerLegalName: COMMERCE_LEDGER_SELLER, storeOrigin: 'https://maximussports.ae', mpgsOrigin: 'https://ap-gateway.mastercard.com', mpgsApiVersion: '99', cscartApiVersion: '2.0', mpgsSchema: 'mpgs_order_transactions_v1', cscartSchema: 'cscart_order_core_v1', verifiedAt: new Date(AT).toISOString(), liveModeEvidenceId: 'synthetic-live', nativeMappingEvidenceId: 'synthetic-mapping', customerBindingEvidenceId: 'synthetic-owner', providerSchemaEvidenceId: 'synthetic-schema' };
  const normalized = normalizeNativeMapping(mapping, now());
  await store.commit({ writes: [{ type: 'nativeCommerceMapping', id: mapping.id, expectedVersion: -1, doc: mapping },
    ...[['liveModeEvidenceId', 'live_route'], ['nativeMappingEvidenceId', 'native_order_mapping'], ['customerBindingEvidenceId', 'verified_customer_binding_schema'], ['providerSchemaEvidenceId', 'mpgs_retrieve_order_schema']].map(([field, kind]) => ({ type: 'nativeCommerceEvidence', id: normalized[field], expectedVersion: -1,
      doc: { id: normalized[field], kind, status: 'verified', mappingId: normalized.id, mappingVersion: normalized.version, mappingHash: normalized.hash, verifiedAt: new Date(AT).toISOString(), authenticationBasis: 'operator_addon_source_inspection' } }))] });
  const configuration = { series: 'synthetic-series', racquetsTotal: 1, mode: 'stock' }, technical = { final: true, specification: 'synthetic-approved' };
  const offer = { approved: true, evidence: 'synthetic-price-approval', currency: 'AED', totalMinor: 12345, productMinor: 12000, taxMinor: 345, shippingMinor: 0, seller: { legalName: COMMERCE_LEDGER_SELLER }, configurationHash: hashPayload(configuration), fulfillableCountries: ['AE'], termsVersion: 'synthetic-accepted-goods-terms', expiresAt: '2026-10-12T00:00:00.000Z' };
  const snapshot = { schema: 1, projectId: 'tennis', plan: 'A', customerUserId: owner.userId, createdAt: new Date(AT).toISOString(), contact: { email: 'ignored-form@example.invalid', country: 'AE' }, offer, configuration, configurationHash: hashPayload(configuration), technical, fulfillment: { verified: true, country: 'AE' }, paymentPreference: 'payment_link',
    quotation: { number: 'SYNTHETIC-APPROVED-GOODS', status: 'quotation', test: false, orderId: ORDER, projectId: 'tennis', issuedAt: new Date(AT).toISOString(), expiresAt: offer.expiresAt, seller: offer.seller, currency: 'AED', totalMinor: 12345, termsVersion: offer.termsVersion, items: [{ quantity: 1, configuration, technical, unitPriceMinor: 12345, lineTotalMinor: 12345 }] }, ...snapshotChanges };
  const document = { id: ORDER, snapshot, payment: { status: 'ready', termsVersion: offer.termsVersion, termsAcceptedAt: AT, ...paymentChanges }, invoice, mail: { confirmation: { status: 'pending', attempts: 0, nextAt: AT, history: [] } }, events: [] };
  await commerce.create(hashPayload(['synthetic-http-order', owner.userId]), document);
  const capability = accessToken(document, secret);
  if (verified && snapshot.projectId === 'tennis' && snapshot.customerUserId === owner.userId) await portal.linkOrder(request(path(ORDER), {}, { Cookie: owner.cookie, 'X-CSRF-Token': owner.csrf }), { orderId: ORDER, accessToken: capability });
  const service = createNativeCheckoutLinkService({ store, mapping, now,
    authorizeOrder: ({ ctx, orderId, accessToken: token }) => {
      assert.equal(ctx.organizationId, 'maximus-tennis');
      return authorized(commerce, orderId, token, secret, now(), 'tennis');
    }, loadCommerceOrder: id => commerce.get(id),
    readNativeOrder: async () => { nativeReads++; assert.fail('prepare must never query/create a native order'); },
    publishNativeIntent: async () => { publisherCalls++; assert.fail('HTTP must never publish'); },
    resolvePublishedIntent: async () => { assert.fail('HTTP must never recover/publish'); },
  });
  const runtime = { service: { readiness: service.readiness, prepare: args => { prepareCalls++; return service.prepare(args); } }, authenticateCustomer: (req, options) => { authCalls++; return portal.authenticatedCustomer(req, options); } };
  const deps = { env, runtimeFactory: async () => runtime };
  const post = (body = { idempotencyKey: key }, headers = {}, id = ORDER) => handleNativeCheckoutLinkRequest(request(path(id), body, { Cookie: owner.cookie, 'X-CSRF-Token': owner.csrf, Authorization: `Bearer ${capability}`, ...headers }), id, deps);
  const change = async (type, id, fields) => { const row = await store.get(type, id); await store.commit({ writes: [{ type, id, expectedVersion: row.version, doc: { ...row.doc, ...fields } }] }); };
  return { store, commerce, portal, owner, service, runtime, deps, capability, post, login, change, advance: ms => { clock += ms; }, counts: () => ({ authCalls, prepareCalls, publisherCalls, nativeReads }) };
}

test('default production runtime stays unconfigured before body, auth, credentials or intent work', async () => {
  const guardedEnv = new Proxy({ ...env, NODE_ENV: 'production' }, { get(target, name) { if (name === 'PORTAL_ENABLED' || name === 'PORTAL_RUNTIME_VERIFIED') return target[name]; assert.fail(`unexpected environment read: ${String(name)}`); } });
  const req = request(path(ORDER), { idempotencyKey: key });
  const result = await handleNativeCheckoutLinkRequest(req, ORDER, { env: guardedEnv });
  assert.equal(result.status, 503); assert.equal(req.bodyUsed, false);
  assert.equal((await resolveNativeCheckoutLinkHttpRuntime()).service, null);
  const body = await result.json();
  assert.equal(body.code, 'native_checkout_link_unconfigured');
  assert.equal(body.messageKey, 'errors.native_checkout_link_unconfigured');
  assert.equal(body.retryable, true);
});

test('both portal kill switches stop before constructing a runtime or consuming the body', async () => {
  for (const flags of [{}, { PORTAL_ENABLED: 'true' }, { PORTAL_RUNTIME_VERIFIED: 'true' }, { ...env, PORTAL_ENABLED: 'false' }]) {
    const req = request(path(ORDER), { idempotencyKey: key });
    const result = await handleNativeCheckoutLinkRequest(req, ORDER, { env: flags, runtimeFactory: async () => assert.fail('OFF runtime') });
    assert.equal(result.status, 503); assert.equal(req.bodyUsed, false);
  }
});

test('native-specific readiness is mandatory even with both portal flags enabled', async () => {
  for (const runtime of [null, { service: { readiness: { ready: false } }, authenticateCustomer: () => assert.fail('unready auth') }, { service: { readiness: { ready: true }, prepare() {} } }]) {
    const req = request(path(ORDER), { idempotencyKey: key });
    const result = await handleNativeCheckoutLinkRequest(req, ORDER, { env, runtimeFactory: async () => runtime });
    assert.equal(result.status, 503); assert.equal(req.bodyUsed, false);
  }
});

test('real verified portal session, CSRF and capability prepare one immutable intent on replay', async () => {
  const f = await fixture();
  const first = await f.post(), again = await f.post();
  assert.equal(first.status, 200); assert.equal(again.status, 200);
  const a = await first.json(), b = await again.json();
  assert.equal(a.intentId, b.intentId); assert.equal(a.status, 'prepared'); assert.equal(a.bindingReady, false);
  const row = await f.store.get(NATIVE_CHECKOUT_INTENT_TYPE, a.intentId);
  assert.equal(row.version, 1); assert.equal(row.doc.customerUserId, f.owner.userId);
  assert.equal(row.doc.publishAttempts, 0); assert.equal(row.doc.cashTotalMinor, '12345');
  assert.equal(f.counts().publisherCalls, 0); assert.equal(f.counts().nativeReads, 0);
  assert.deepEqual(Object.keys(a).sort(), ['bindingReady', 'code', 'correlationId', 'expiresAt', 'intentId', 'status']);
  assert.notEqual(a.correlationId, b.correlationId); assert.equal(first.headers.get('x-correlation-id'), a.correlationId);
  assert.match(first.headers.get('cache-control'), /no-store/); assert.equal(first.headers.get('referrer-policy'), 'no-referrer');
});

test('guest, duplicate cookie and unverified account cannot prepare an intent', async () => {
  const f = await fixture();
  for (const Cookie of ['', `${f.owner.cookie}; ${f.owner.cookie}`]) {
    assert.equal((await f.post(undefined, { Cookie })).status, 401);
  }
  assert.equal(f.counts().prepareCalls, 0);
  const unverified = await fixture({ verified: false });
  assert.equal((await unverified.post()).status, 403); assert.equal(unverified.counts().prepareCalls, 0);
});

test('missing CSRF, different Origin and cross-site requests fail through actual portal auth', async () => {
  const f = await fixture();
  for (const headers of [{ 'X-CSRF-Token': '' }, { 'X-CSRF-Token': 'wrong' }, { Origin: '' }, { Origin: 'https://attacker.example.invalid' }, { 'Sec-Fetch-Site': 'cross-site' }]) {
    const req = request(path(ORDER), { idempotencyKey: key }, { Cookie: f.owner.cookie, 'X-CSRF-Token': f.owner.csrf, Authorization: `Bearer ${f.capability}`, ...headers });
    assert.equal((await handleNativeCheckoutLinkRequest(req, ORDER, f.deps)).status, 403);
    assert.equal(req.bodyUsed, false);
  }
  assert.equal(f.counts().prepareCalls, 0);
});

test('expired and explicitly revoked real sessions fail before preparation', async () => {
  const expired = await fixture(); expired.advance(13 * 3600000);
  assert.equal((await expired.post()).status, 401); assert.equal(expired.counts().prepareCalls, 0);
  const revoked = await fixture();
  const auth = await revoked.portal.identity.authenticate({ sessionToken: revoked.owner.cookie.split('=')[1] });
  await revoked.portal.identity.logout({ session: auth.session });
  assert.equal((await revoked.post()).status, 401); assert.equal(revoked.counts().prepareCalls, 0);
});

test('another verified session cannot use a stolen valid order capability', async () => {
  const f = await fixture(), other = await f.login('other@example.invalid');
  const result = await f.post(undefined, { Cookie: other.cookie, 'X-CSRF-Token': other.csrf });
  assert.equal(result.status, 403); assert.equal((await result.json()).code, 'forbidden');
  assert.equal(f.counts().publisherCalls, 0);
});

test('order capabilities are bounded and cryptographically checked, not accepted from body or query', async () => {
  const f = await fixture();
  for (const Authorization of ['', 'Basic invalid', `Bearer ${'a'.repeat(201)}`, `Bearer ${f.capability} another`, 'Bearer forged-token']) {
    const result = await f.post(undefined, { Authorization });
    assert.ok([401, 403].includes(result.status));
  }
  assert.equal((await f.post({ idempotencyKey: key, accessToken: f.capability }, { Authorization: '' })).status, 401);
  const req = request(`${path(ORDER)}?accessToken=${f.capability}`, { idempotencyKey: key });
  assert.equal((await handleNativeCheckoutLinkRequest(req, ORDER, f.deps)).status, 400);
  assert.equal(f.counts().publisherCalls, 0);
});

test('foreign portal tenant/project and missing durable membership cannot prepare', async () => {
  for (const fields of [{ organizationId: 'foreign-tenant' }, { projectId: 'foreign-project' }, { ownershipProof: 'client_claim' }]) {
    const f = await fixture(); await f.change('portalOrder', ORDER, fields);
    assert.equal((await f.post()).status, 403);
  }
  const f = await fixture(); await f.change('portalMembership', `maximus-tennis_${f.owner.userId}`, { organizationId: 'foreign-tenant' });
  assert.equal((await f.post()).status, 403);
});

test('durable unique owner must match the authenticated owner even when portal row matches', async () => {
  const f = await fixture();
  await f.store.releaseUnique('portal_order_owner', `tennis:${ORDER}`);
  assert.equal((await f.post()).status, 403); assert.equal(f.counts().publisherCalls, 0);
});

test('TEST quotation, technical draft, unapproved goods or TEST invoice never become native-ready', async () => {
  for (const change of [{ quotation: { test: true, number: 'TEST-QUOTE-fixture' } }, { technical: { final: false } }, { offer: { approved: false } }]) {
    const f = await fixture({ snapshotChanges: change });
    assert.equal((await f.post()).status, 403);
  }
  const f = await fixture({ invoice: { test: true, number: 'TEST-INV-fixture' } });
  assert.equal((await f.post()).status, 403);
});

test('request cannot accept terms or replace missing authoritative accepted terms', async () => {
  const f = await fixture({ paymentChanges: { termsAcceptedAt: null } });
  assert.equal((await f.post({ idempotencyKey: key, acceptedTerms: true, termsVersion: 'synthetic-accepted-goods-terms' })).status, 400);
  assert.equal((await f.post()).status, 403); assert.equal(f.counts().publisherCalls, 0);
});

test('existing TEST/payment session and expired offer fail before any intent is created', async () => {
  const session = await fixture({ paymentChanges: { session: { id: 'synthetic-existing-session' } } });
  assert.equal((await session.post()).status, 409);
  const expired = await fixture();
  expired.advance(25 * 3600000);
  // A fresh login isolates quote expiry from the ordinary session idle expiry.
  const owner = await expired.login('owner@example.invalid');
  assert.equal((await expired.post(undefined, { Cookie: owner.cookie, 'X-CSRF-Token': owner.csrf })).status, 409);
});

test('client financial/customer/native/provider/verified claims and malformed JSON are rejected', async () => {
  const f = await fixture();
  for (const extra of ['userId', 'customerUserId', 'amountMinor', 'currency', 'nativeOrderId', 'providerOrderId', 'verified', 'paid', 'acceptedTerms']) {
    assert.equal((await f.post({ idempotencyKey: key, [extra]: 'client-claim' })).status, 400);
  }
  for (const body of [{}, [], null, { idempotencyKey: 'short' }, { idempotencyKey: 'a'.repeat(129) }, { idempotencyKey: 123456789 }]) assert.equal((await f.post(body)).status, 400);
  const req = new Request(origin + path(ORDER), { method: 'POST', headers: { Origin: origin, Cookie: f.owner.cookie, 'X-CSRF-Token': f.owner.csrf, Authorization: `Bearer ${f.capability}`, 'Content-Type': 'application/json' }, body: '{bad-json' });
  assert.equal((await handleNativeCheckoutLinkRequest(req, ORDER, f.deps)).status, 400);
  assert.equal(f.counts().prepareCalls, 0);
});

test('wrong media type, invalid UTF8, declared and streamed oversize fail before service', async () => {
  const f = await fixture(), headers = { Origin: origin, Cookie: f.owner.cookie, 'X-CSRF-Token': f.owner.csrf, Authorization: `Bearer ${f.capability}`, 'Content-Type': 'application/json' };
  assert.equal((await f.post(undefined, { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await f.post(undefined, { 'Content-Length': '1025' })).status, 413);
  assert.equal((await f.post(undefined, { 'Content-Length': 'invalid' })).status, 413);
  for (const [body, status] of [[new Uint8Array([0xff]), 400], [' '.repeat(1025), 413]]) {
    const req = new Request(origin + path(ORDER), { method: 'POST', headers, body });
    assert.equal((await handleNativeCheckoutLinkRequest(req, ORDER, f.deps)).status, status);
  }
  assert.equal(f.counts().prepareCalls, 0);
});

test('stalled request body is bounded and cancelled without invoking service', async () => {
  const f = await fixture(); let cancelled = false;
  const body = new ReadableStream({ cancel() { cancelled = true; } });
  const req = new Request(origin + path(ORDER), { method: 'POST', duplex: 'half', headers: { Origin: origin, Cookie: f.owner.cookie, 'X-CSRF-Token': f.owner.csrf, Authorization: `Bearer ${f.capability}`, 'Content-Type': 'application/json' }, body });
  const result = await handleNativeCheckoutLinkRequest(req, ORDER, { ...f.deps, bodyTimeoutMs: 10 });
  assert.equal(result.status, 408); assert.equal(cancelled, true); assert.equal(f.counts().prepareCalls, 0);
});

test('only exact MXORD path and POST method are allowed; no status or publishing HTTP action', async () => {
  const f = await fixture();
  for (const id of ['MX-ORD-client', `MX-ORD-${'B'.repeat(32)}`, `${ORDER}/publish`]) assert.equal((await f.post(undefined, {}, id)).status, 400);
  for (const method of ['GET', 'PUT', 'DELETE']) {
    const result = await handleNativeCheckoutLinkRequest(new Request(origin + path(ORDER), { method }), ORDER, { env, runtimeFactory: async () => assert.fail('wrong method runtime') });
    assert.equal(result.status, 405); assert.equal(result.headers.get('allow'), 'POST');
  }
});

test('adapter errors/details are private and service output is strictly projected', async () => {
  const f = await fixture();
  for (const error of [new Error('synthetic-private-provider-response'), new ApiError(409, 'synthetic-private-error', { details: { secret: 'synthetic-private-detail' } })]) {
    const runtime = { ...f.runtime, service: { readiness: { ready: true }, prepare: async () => { throw error; } } };
    const req = request(path(ORDER), { idempotencyKey: key }, { Cookie: f.owner.cookie, 'X-CSRF-Token': f.owner.csrf, Authorization: `Bearer ${f.capability}` });
    const result = await handleNativeCheckoutLinkRequest(req, ORDER, { env, runtimeFactory: async () => runtime });
    assert.ok([409, 503].includes(result.status)); assert.equal((await result.text()).includes('synthetic-private'), false);
  }
  const runtime = { ...f.runtime, service: { readiness: { ready: true }, prepare: async args => ({ ...await f.service.prepare(args), rawProof: 'synthetic-private-proof', nativeOrderId: 'synthetic-private-native-id', checkoutUrl: 'https://example.invalid/private', customerUserId: f.owner.userId }) } };
  const req = request(path(ORDER), { idempotencyKey: key }, { Cookie: f.owner.cookie, 'X-CSRF-Token': f.owner.csrf, Authorization: `Bearer ${f.capability}` });
  const result = await handleNativeCheckoutLinkRequest(req, ORDER, { env, runtimeFactory: async () => runtime });
  assert.equal(result.status, 200); const text = await result.text();
  assert.equal(text.includes('synthetic-private'), false); assert.equal(text.includes(f.owner.userId), false); assert.equal(text.includes('checkoutUrl'), false);
});

test('malformed intent identifier or binding-ready claim is rejected at the response boundary', async () => {
  const f = await fixture();
  for (const invalid of [{ intentId: 'native-id-that-is-not-an-intent' }, { bindingReady: true }, { intentId: `nci_${'A'.repeat(64)}` }, { expiresAt: 'x'.repeat(1000) }]) {
    const runtime = { ...f.runtime, service: { readiness: { ready: true }, prepare: async args => ({ ...await f.service.prepare(args), ...invalid }) } };
    const req = request(path(ORDER), { idempotencyKey: key }, { Cookie: f.owner.cookie, 'X-CSRF-Token': f.owner.csrf, Authorization: `Bearer ${f.capability}` });
    const result = await handleNativeCheckoutLinkRequest(req, ORDER, { env, runtimeFactory: async () => runtime });
    assert.equal(result.status, 503); assert.equal((await result.json()).code, 'unavailable');
  }
});

test('changed or revoked durable native evidence blocks preparation and existing-intent replay', async () => {
  for (const id of ['synthetic-live', 'synthetic-mapping', 'synthetic-owner', 'synthetic-schema']) {
    const f = await fixture();
    const first = await f.post(); assert.equal(first.status, 200);
    const { intentId } = await first.json(), before = await f.store.get(NATIVE_CHECKOUT_INTENT_TYPE, intentId);
    await f.change('nativeCommerceEvidence', id, { status: 'unverified' });
    assert.equal((await f.post()).status, 503);
    const after = await f.store.get(NATIVE_CHECKOUT_INTENT_TYPE, intentId);
    assert.deepEqual(after, before); assert.equal(f.counts().publisherCalls, 0);
  }
  const f = await fixture(); await f.change('nativeCommerceMapping', 'synthetic-link-http', { version: 'uninspected-revision' });
  assert.equal((await f.post()).status, 503); assert.equal(f.counts().publisherCalls, 0);
});
