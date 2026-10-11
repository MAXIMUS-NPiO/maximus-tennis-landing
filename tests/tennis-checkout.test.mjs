/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTennisCheckoutService, normalizeTennisCheckoutRoute, TENNIS_CHECKOUT_TYPE, TENNIS_EMBEDDED_CONTRACT } from '../lib/commerce/tennis-checkout.js';
import { handleTennisCheckoutRequest, resolveTennisCheckoutRuntime } from '../lib/commerce/tennis-checkout-http.js';
import { createMemoryStore, createUpstashStore } from '../lib/platform/store.js';
import { createMemoryCommerceStore, createCommerceStore } from '../lib/commerce/store.js';
import { COMMERCE_LEDGER_SELLER } from '../lib/platform/commerce-ledger.js';
import { hashPayload } from '../lib/platform/ids.js';
import { createPortal } from '../lib/platform/portal.js';
import { authorized } from '../lib/commerce/service.js';
import { accessToken } from '../lib/commerce/access.js';
import { startBridge, startTestRedis } from './redis-rest-bridge.mjs';

const AT = Date.parse('2026-10-11T00:00:00.000Z');
const ORDER = `MX-ORD-${'c'.repeat(32)}`, OTHER_ORDER = `MX-ORD-${'d'.repeat(32)}`;
const USER = `usr_${'0'.repeat(19)}1`, OTHER_USER = `usr_${'0'.repeat(19)}2`;
const ORIGIN = 'https://maximus.tennis', GATEWAY = 'https://ap-gateway.mastercard.com';
const env = { NODE_ENV: 'test', PORTAL_ENABLED: 'true', PORTAL_RUNTIME_VERIFIED: 'true' };
const evidenceFields = [['featureEvidenceId', 'merchant_hosted_checkout_feature'], ['originEvidenceId', 'approved_tennis_origin'], ['sessionSchemaEvidenceId', 'mpgs_checkout_session_schema'], ['sdkEvidenceId', 'mpgs_embedded_sdk_contract'], ['threeDsEvidenceId', 'mpgs_3ds_return_behavior']];
const request = (body, headers = {}, path = `/api/accounts/orders/${ORDER}/checkout`) => new Request(ORIGIN + path, { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

/** Synthetic DI contracts only: no installed merchant feature, current price or live proof. */
async function fixture({ store = createMemoryStore(), commerceStore = createMemoryCommerceStore(), userId = USER } = {}) {
  let at = AT;
  const now = () => at;
  const rawRoute = { id: 'synthetic-own-site-route', version: 'synthetic-v1', status: 'verified_live_tennis_checkout', enabled: true, mode: 'live', projectId: 'tennis', organizationId: 'maximus-tennis', processor: 'MPGS', merchantId: '300281', currency: 'AED', sellerLegalName: COMMERCE_LEDGER_SELLER, gatewayOrigin: GATEWAY, publicOrigin: ORIGIN, presentation: 'embedded', contract: TENNIS_EMBEDDED_CONTRACT, sdkVersion: '100', apiVersion: '99', verifiedAt: new Date(AT).toISOString(), ...Object.fromEntries(evidenceFields.map(([field]) => [field, `synthetic-${field}`])) };
  const route = normalizeTennisCheckoutRoute(rawRoute, now());
  const configuration = { series: 'synthetic-approved-stock', racquetsTotal: 1 }, technical = { final: true, specification: 'synthetic-final' };
  const offer = { approved: true, evidence: 'synthetic-price-approval', currency: 'AED', totalMinor: 12345, productMinor: 12000, taxMinor: 345, shippingMinor: 0, seller: { legalName: COMMERCE_LEDGER_SELLER }, configurationHash: hashPayload(configuration), fulfillableCountries: ['AE'], termsVersion: 'synthetic-approved-terms', expiresAt: new Date(AT + 3600000).toISOString() };
  const doc = { id: ORDER, snapshot: { schema: 1, projectId: 'tennis', plan: 'A', customerUserId: userId, locale: 'ru', createdAt: new Date(AT).toISOString(), contact: { country: 'AE', email: 'synthetic-untrusted-form@example.invalid' }, configuration, configurationHash: hashPayload(configuration), technical, offer, fulfillment: { verified: true, country: 'AE' }, paymentPreference: 'payment_link',
    quotation: { number: 'SYNTHETIC-APPROVED-GOODS', status: 'quotation', test: false, orderId: ORDER, projectId: 'tennis', issuedAt: new Date(AT).toISOString(), expiresAt: offer.expiresAt, currency: 'AED', totalMinor: 12345, seller: offer.seller, termsVersion: offer.termsVersion, items: [{ quantity: 1, configuration, technical, unitPriceMinor: 12345, lineTotalMinor: 12345 }] } }, payment: { status: 'ready' }, invoice: null, mail: {}, events: [] };
  const ctx = { userId, organizationId: 'maximus-tennis', emailVerified: true };
  async function change(type, id, fields) { const row = await store.get(type, id); await store.commit({ writes: [{ type, id, expectedVersion: row.version, doc: { ...row.doc, ...fields } }] }); }
  async function installRoute(r = route) {
    const docs = [{ type: 'tennisCheckoutRoute', id: r.id, doc: r }, ...evidenceFields.map(([field, kind]) => ({ type: 'tennisCheckoutEvidence', id: r[field], doc: { id: r[field], kind, routeId: r.id, routeVersion: r.version, routeHash: r.hash, status: 'verified', verifiedAt: new Date(AT).toISOString(), authenticationBasis: 'operator_configuration_inspection' } }))];
    await store.commit({ writes: await Promise.all(docs.map(async d => ({ ...d, expectedVersion: (await store.get(d.type, d.id))?.version ?? -1 }))) });
  }
  async function addOrder(document = doc) {
    await commerceStore.create(hashPayload(['synthetic-own-site-order', document.id]), document);
    await store.commit({ writes: [{ type: 'portalOrder', id: document.id, expectedVersion: -1, doc: { id: document.id, customerUserId: userId, projectId: 'tennis', organizationId: 'maximus-tennis', ownershipProof: 'verified_session_and_order_capability' } }], uniques: [{ name: 'portal_order_owner', value: `tennis:${document.id}`, owner: userId }] });
  }
  for (const [type, id, data] of [['user', userId, { id: userId, status: 'active' }], ['portalMembership', `maximus-tennis_${userId}`, { id: `maximus-tennis_${userId}`, userId, organizationId: 'maximus-tennis' }]]) if (!await store.get(type, id)) await store.commit({ writes: [{ type, id, expectedVersion: -1, doc: data }] });
  await addOrder(); await installRoute();
  const state = { created: [], resolved: [], result: { status: 'accepted', reference: 'synthetic-private-reference' }, proofStatus: 'verified', proofChange: null, throwCreate: false };
  const deps = { store, commerceStore, route, now, production: false,
    createAuthenticatedSession: async ({ intent, order, signal }) => { state.created.push({ intent: structuredClone(intent), order, signal }); if (state.throwCreate) throw Error('synthetic-private-provider-password'); return structuredClone(state.result); },
    resolveAuthenticatedSession: async ({ intent, reference, signal }) => { state.resolved.push({ intent, reference, signal }); const proof = { status: state.proofStatus, authenticationBasis: 'provider_server_session_query', mode: 'live', routeHash: route.hash, providerOrderId: intent.providerOrderId, correlation: intent.correlation, merchantId: route.merchantId, apiVersion: route.apiVersion, gatewayOrigin: GATEWAY, sdkVersion: route.sdkVersion, contract: TENNIS_EMBEDDED_CONTRACT, currency: intent.currency, totalMinor: intent.totalMinor, snapshotHash: intent.snapshotHash, termsVersion: intent.termsVersion, sessionId: 'SESSIONsyntheticPrivateOpaque123', evidenceId: 'synthetic-stable-session-evidence', verifiedAt: new Date(now()).toISOString(), expiresAt: new Date(AT + 7200000).toISOString() }; state.proofChange?.(proof); return proof; } };
  const service = createTennisCheckoutService(deps);
  const input = { ctx, orderId: ORDER, idempotencyKey: 'synthetic-checkout-001', termsVersion: offer.termsVersion };
  return { store, commerceStore, route, rawRoute, doc, deps, service, input, state, ctx, now, change, installRoute, addOrder, setTime: value => { at = value; } };
}
function loseAcknowledgement(store, predicate) {
  let fired = false;
  return new Proxy(store, { get(target, key) { if (key === 'commit') return async p => { const r = await target.commit(p); if (!fired && predicate(p)) { fired = true; throw Error('synthetic-lost-atomic-ack'); } return r; }; return typeof target[key] === 'function' ? target[key].bind(target) : target[key]; } });
}
const onlyProjection = p => assert.deepEqual(Object.keys(p).sort(), ['checkoutHandle', 'checkoutPath', 'embedded', 'expiresAt', 'status']);

test('trusted exact nonTEST own-account order creates one session and keeps legacy hosted payment private', async () => {
  const f = await fixture(), result = await f.service.checkout(f.input), saved = await f.commerceStore.get(ORDER);
  assert.equal(result.status, 'ready'); onlyProjection(result); assert.equal(result.checkoutPath, '/ru/checkout');
  assert.equal(result.expiresAt, f.doc.snapshot.offer.expiresAt); assert.equal(result.embedded.serverVerified, true);
  assert.equal(f.state.created.length, 1); assert.equal(f.state.created[0].intent.totalMinor, '12345');
  assert.equal(saved.payment.status, 'pending'); assert.equal(saved.payment.termsAcceptedAt, AT);
  assert.equal(saved.payment.session, undefined); assert.equal(saved.invoice, null);
  assert.deepEqual(saved.snapshot, f.doc.snapshot); assert.equal(f.state.created[0].signal instanceof AbortSignal, true);
  const repeated = await f.service.checkout({ ...f.input, idempotencyKey: 'synthetic-other-key' });
  assert.deepEqual(repeated, result); assert.equal(f.state.created.length, 1);
});

test('missing server adapters, bad route or production memory cannot create any intent', async () => {
  const f = await fixture();
  for (const dep of ['createAuthenticatedSession', 'resolveAuthenticatedSession']) {
    const s = createTennisCheckoutService({ ...f.deps, [dep]: undefined }); assert.equal(s.readiness.ready, false);
    await assert.rejects(s.checkout(f.input), { code: 'checkout_unconfigured' });
  }
  assert.throws(() => createTennisCheckoutService({ ...f.deps, production: true }), { code: 'checkout_runtime_unavailable' });
  for (const fields of [{ mode: 'test' }, { gatewayOrigin: 'https://evil.example.invalid' }, { currency: 'USD' }, { apiVersion: '' }, { sdkVersion: '57' }, { presentation: 'redirect' }]) assert.throws(() => normalizeTennisCheckoutRoute({ ...f.rawRoute, ...fields }, AT));
  assert.equal(await f.store.countType(TENNIS_CHECKOUT_TYPE), 0);
});

test('all five durable merchant/origin/schema/SDK/3DS evidence rows are mandatory and revocable', async () => {
  for (const [field] of evidenceFields) {
    const f = await fixture(); await f.change('tennisCheckoutEvidence', f.route[field], { status: 'revoked' });
    await assert.rejects(f.service.checkout(f.input), { code: 'checkout_route_unverified' }); assert.equal(f.state.created.length, 0);
  }
  const f = await fixture(), ready = await f.service.checkout(f.input); await f.change('tennisCheckoutEvidence', f.route.sdkEvidenceId, { routeVersion: 'changed' });
  await assert.rejects(f.service.checkout(f.input), { code: 'checkout_route_unverified' }); assert.equal(f.state.created.length, 1);
  assert.equal((await f.store.get(TENNIS_CHECKOUT_TYPE, ready.checkoutHandle)).doc.status, 'ready');
});

test('client proof/IDs, foreign owner, revoked account, tenant and durable ownership cannot claim checkout', async () => {
  for (const modify of [f => ({ ...f.input, customerUserId: USER }), f => ({ ...f.input, providerOrderId: 'caller' }), f => ({ ...f.input, ctx: { ...f.ctx, userId: OTHER_USER } }), f => ({ ...f.input, ctx: { ...f.ctx, emailVerified: false } }), f => ({ ...f.input, ctx: { ...f.ctx, organizationId: 'other' } })]) {
    const f = await fixture(); await assert.rejects(f.service.checkout(modify(f))); assert.equal(f.state.created.length, 0);
  }
  for (const mutation of [f => f.change('user', USER, { status: 'disabled' }), f => f.change('portalOrder', ORDER, { customerUserId: OTHER_USER }), f => f.change('portalOrder', ORDER, { ownershipProof: 'email_claim' }), f => f.change('portalMembership', `maximus-tennis_${USER}`, { organizationId: 'other' }), f => f.store.releaseUnique('portal_order_owner', `tennis:${ORDER}`)]) {
    const f = await fixture(); await mutation(f); await assert.rejects(f.service.checkout(f.input)); assert.equal(f.state.created.length, 0);
  }
});

test('draft/TEST/unapproved or wrong exact amount/seller/configuration/fulfillment never creates a session', async () => {
  const changes = [d => { d.snapshot.offer = null; }, d => { d.snapshot.quotation = null; }, d => { d.snapshot.offer.approved = false; }, d => { d.snapshot.quotation.test = true; }, d => { d.snapshot.quotation.number = 'TEST-SYNTHETIC'; }, d => { d.snapshot.offer.currency = 'USD'; }, d => { d.snapshot.quotation.totalMinor++; }, d => { d.snapshot.offer.seller.legalName = 'Synthetic other seller'; }, d => { d.snapshot.technical.final = false; }, d => { d.snapshot.fulfillment.verified = false; }, d => { d.snapshot.configuration.racquetsTotal = 2; }, d => { d.invoice = { test: true }; }];
  for (const change of changes) {
    const f = await fixture(), changed = structuredClone(f.doc); change(changed);
    const s = createTennisCheckoutService({ ...f.deps, commerceStore: { ...f.commerceStore, get: async () => changed } });
    await assert.rejects(s.checkout(f.input)); assert.equal(f.state.created.length, 0); assert.equal(await f.store.countType(TENNIS_CHECKOUT_TYPE), 0);
  }
});

test('terms mismatch, expired offer, legacy TEST session and terminal orders fail before reservation', async () => {
  const f = await fixture(); await assert.rejects(f.service.checkout({ ...f.input, termsVersion: 'caller-new-terms' }));
  f.setTime(AT + 3600000); await assert.rejects(f.service.checkout(f.input), { code: 'checkout_offer_expired' });
  for (const fields of [{ status: 'paid' }, { status: 'awaiting_quote' }, { status: 'pending' }, { session: { id: 'TEST-synthetic' } }]) {
    const f = await fixture(), before = await f.commerceStore.get(ORDER), after = structuredClone(before); Object.assign(after.payment, fields); await f.commerceStore.swap(before, after);
    await assert.rejects(f.service.checkout(f.input), { code: 'checkout_order_not_ready' }); assert.equal(f.state.created.length, 0);
  }
});

test('concurrent requests and different keys share one acknowledged reservation/provider create', async () => {
  const f = await fixture(); const results = await Promise.all(Array.from({ length: 8 }, (_, n) => f.service.checkout({ ...f.input, idempotencyKey: `synthetic-parallel-${n}` })));
  assert.equal(new Set(results.map(p => p.checkoutHandle)).size, 1); assert.equal(f.state.created.length, 1);
  assert.equal(await f.store.countType(TENNIS_CHECKOUT_TYPE), 1); assert.equal((await f.service.checkout(f.input)).status, 'ready');
});

test('shared native order fence and scoped idempotency prevent second routes/orders', async () => {
  const f = await fixture(); await f.service.checkout(f.input);
  const other = structuredClone(f.doc); other.id = OTHER_ORDER; other.snapshot.quotation.orderId = OTHER_ORDER; await f.addOrder(other);
  await assert.rejects(f.service.checkout({ ...f.input, orderId: OTHER_ORDER }), { code: 'checkout_idempotency_conflict' });
  const g = await fixture(); await g.store.commit({ uniques: [{ name: 'native_checkout_commerce_order', value: hashPayload(['maximus-tennis', 'tennis', ORDER]), owner: `nci_${'e'.repeat(64)}` }] });
  await assert.rejects(g.service.checkout(g.input), { code: 'checkout_other_intent_exists' }); assert.equal(g.state.created.length, 0);
});

test('reservation ACK loss never calls creator, and recovery never manufactures a replacement session', async () => {
  const f = await fixture(), lost = loseAcknowledgement(f.store, p => p.writes?.some(w => w.type === TENNIS_CHECKOUT_TYPE && w.expectedVersion === -1));
  const s = createTennisCheckoutService({ ...f.deps, store: lost });
  const first = await s.checkout(f.input); assert.equal(first.status, 'creating'); assert.equal(f.state.created.length, 0);
  f.setTime(AT + 31000); f.state.proofStatus = 'not_found';
  assert.equal((await createTennisCheckoutService(f.deps).checkout(f.input)).status, 'uncertain'); assert.equal(f.state.created.length, 0);
});

test('lost provider response recovers by independent query after restart without a second create', async () => {
  const f = await fixture(); f.state.throwCreate = true; f.state.proofStatus = 'not_found';
  const first = await f.service.checkout(f.input); assert.equal(first.status, 'uncertain'); assert.equal(first.embedded, null);
  f.state.proofStatus = 'verified'; const recovered = await createTennisCheckoutService(f.deps).checkout(f.input);
  assert.equal(recovered.status, 'ready'); assert.equal(recovered.checkoutHandle, first.checkoutHandle); assert.equal(f.state.created.length, 1);
});

test('final descriptor ACK loss safely reads back the durable receipt', async () => {
  const f = await fixture(), lost = loseAcknowledgement(f.store, p => p.writes?.some(w => w.type === TENNIS_CHECKOUT_TYPE && w.doc.status === 'ready'));
  const result = await createTennisCheckoutService({ ...f.deps, store: lost }).checkout(f.input);
  assert.equal(result.status, 'ready'); assert.equal((await f.service.checkout(f.input)).checkoutHandle, result.checkoutHandle); assert.equal(f.state.created.length, 1);
});

test('every trusted session proof field is exact and no bad proof returns a descriptor', async () => {
  for (const [key, value] of [['mode', 'test'], ['merchantId', 'other'], ['currency', 'USD'], ['totalMinor', '12346'], ['snapshotHash', 'bad'], ['termsVersion', 'bad'], ['providerOrderId', 'other'], ['correlation', 'other'], ['gatewayOrigin', 'https://evil.example.invalid'], ['sdkVersion', '57'], ['contract', 'other'], ['authenticationBasis', 'browser_return'], ['verifiedAt', new Date(AT - 1).toISOString()], ['sessionId', 'bad']]) {
    const f = await fixture(); f.state.proofChange = p => { p[key] = value; }; const result = await f.service.checkout(f.input);
    assert.equal(result.status, 'review_required', key); assert.equal(result.embedded, null); assert.equal(f.state.created.length, 1);
    assert.equal((await f.service.checkout(f.input)).status, 'review_required');
  }
});

test('late proof after offer expiry is retained as expired and browser never reports paid', async () => {
  const f = await fixture(); f.state.proofStatus = 'pending'; const first = await f.service.checkout(f.input);
  f.setTime(AT + 3600001); f.state.proofStatus = 'verified'; const result = await f.service.checkout(f.input);
  assert.equal(result.status, 'expired'); assert.equal(result.checkoutHandle, first.checkoutHandle); assert.equal(result.embedded, null);
  assert.equal((await f.commerceStore.get(ORDER)).payment.status, 'pending'); assert.equal(f.state.created.length, 1);
});

test('receipt expiry/session corruption is rejected on ready replay', async () => {
  for (const fields of [{ expiresAt: new Date(AT + 7200000).toISOString() }, { sessionId: 'SESSIONsyntheticTampered123' }, { createAttempts: 2 }, { locale: 'caller-path' }]) {
    const f = await fixture(), first = await f.service.checkout(f.input); await f.change(TENNIS_CHECKOUT_TYPE, first.checkoutHandle, fields);
    await assert.rejects(f.service.checkout(f.input), { code: 'checkout_intent_integrity_failed' }); assert.equal(f.state.created.length, 1);
  }
});

test('bounded provider timeout leaves uncertain and aborted requests never repeat create', async () => {
  const f = await fixture(); f.state.proofStatus = 'pending';
  const s = createTennisCheckoutService({ ...f.deps, providerTimeoutMs: 10, createAuthenticatedSession: async () => { f.state.created.push({}); await new Promise(() => {}); } });
  assert.equal((await s.checkout(f.input)).status, 'uncertain'); assert.equal(f.state.created.length, 1);
  assert.equal((await s.checkout(f.input)).status, 'uncertain'); assert.equal(f.state.created.length, 1);
});

test('concurrent invalid recovery remains terminal while held valid recovery finishes', async () => {
  const f = await fixture(); f.state.proofStatus = 'pending'; const first = await f.service.checkout(f.input); f.state.proofStatus = 'verified';
  let release, entered;
  const held = new Promise(r => { release = r; }), waiting = new Promise(r => { entered = r; });
  const valid = createTennisCheckoutService({ ...f.deps, resolveAuthenticatedSession: async args => { const p = await f.deps.resolveAuthenticatedSession(args); entered(); await held; return p; } });
  const invalid = createTennisCheckoutService({ ...f.deps, resolveAuthenticatedSession: async args => ({ ...await f.deps.resolveAuthenticatedSession(args), totalMinor: '99999' }) });
  const pending = valid.checkout(f.input); await waiting;
  assert.equal((await invalid.checkout(f.input)).status, 'review_required'); release();
  const result = await pending; assert.equal(result.status, 'review_required'); assert.equal(result.embedded, null);
  assert.equal((await f.store.get(TENNIS_CHECKOUT_TYPE, first.checkoutHandle)).doc.status, 'review_required');
});

test('concurrent ready winner cannot expose session after commerce became paid', async () => {
  const f = await fixture(); f.state.proofStatus = 'pending'; await f.service.checkout(f.input); f.state.proofStatus = 'verified';
  let release, entered;
  const held = new Promise(r => { release = r; }), waiting = new Promise(r => { entered = r; });
  const delayed = createTennisCheckoutService({ ...f.deps, resolveAuthenticatedSession: async args => { const p = await f.deps.resolveAuthenticatedSession(args); entered(); await held; return p; } });
  const recovering = delayed.checkout(f.input); await waiting;
  assert.equal((await f.service.checkout(f.input)).status, 'ready');
  const before = await f.commerceStore.get(ORDER), after = structuredClone(before); after.payment.status = 'paid'; await f.commerceStore.swap(before, after);
  release(); await assert.rejects(recovering, { code: 'checkout_commerce_fence_changed' }); assert.equal(f.state.created.length, 1);
});

test('offer expiry during precreate awaits prevents any session create and uncertain never recreates', async () => {
  const f = await fixture(); let reads = 0;
  const wrapped = { ...f.commerceStore, get: async id => { const d = await f.commerceStore.get(id); if (++reads === 4) f.setTime(AT + 3600000); return d; } };
  const result = await createTennisCheckoutService({ ...f.deps, commerceStore: wrapped }).checkout(f.input);
  assert.ok(['creating', 'uncertain'].includes(result.status)); assert.equal(f.state.created.length, 0);
  f.state.proofStatus = 'not_found'; assert.equal((await f.service.checkout(f.input)).status, 'uncertain'); assert.equal(f.state.created.length, 0);
});

test('production safeguard covers omitted NODE_ENV argument and unclassified commerce store', async () => {
  const f = await fixture(), saved = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production'; const { production, ...deps } = f.deps;
    assert.throws(() => createTennisCheckoutService(deps), { code: 'checkout_runtime_unavailable' });
    assert.throws(() => createTennisCheckoutService({ ...f.deps, store: { ...f.store, kind: 'upstash' }, production: true }), { code: 'checkout_runtime_unavailable' });
  } finally { if (saved === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = saved; }
});

test('commerce pending-save ACK loss resolves without recreation after process reconstruction', async () => {
  const f = await fixture(); let lost = false;
  const wrapped = { ...f.commerceStore, swap: async (before, after) => { const ok = await f.commerceStore.swap(before, after); if (ok && !lost && after.payment.status === 'pending') { lost = true; throw Error('synthetic-commerce-lost-ack'); } return ok; } };
  const result = await createTennisCheckoutService({ ...f.deps, commerceStore: wrapped }).checkout(f.input); assert.equal(result.status, 'uncertain');
  assert.equal((await createTennisCheckoutService(f.deps).checkout(f.input)).status, 'ready'); assert.equal(f.state.created.length, 1);
});

test('real Redis atomic intent uniqueness plus commerce Lua CAS survive restart and acknowledgement loss', async t => {
  let redis, rest;
  try {
    try { redis = await startTestRedis(6399); rest = await startBridge({ redisPort: 6399, token: 'synthetic-own-site-local-only' }); }
    catch (error) { if (process.env.INTAKE_REQUIRE_REDIS === '1' || !['ENOENT', 'EACCES', 'EPERM'].includes(error.code)) throw error; return t.skip(`native Redis unavailable: ${error.code}`); }
    // A future server factory may label only its actually resolved durable store.
    // The existing commerce API has no kind tag; this wrapper never changes its methods.
    const credentials = { url: rest.url, token: 'synthetic-own-site-local-only' }, f = await fixture({ store: createUpstashStore(credentials), commerceStore: { ...createCommerceStore(credentials), kind: 'upstash' } });
    f.state.throwCreate = true; f.state.proofStatus = 'pending';
    const results = await Promise.all(Array.from({ length: 6 }, (_, n) => f.service.checkout({ ...f.input, idempotencyKey: `synthetic-redis-${n}` })));
    assert.equal(new Set(results.map(p => p.checkoutHandle)).size, 1); assert.equal(f.state.created.length, 1);
    f.state.proofStatus = 'verified';
    const lost = loseAcknowledgement(f.store, p => p.writes?.some(w => w.type === TENNIS_CHECKOUT_TYPE && w.doc.status === 'ready'));
    const rebuilt = createTennisCheckoutService({ ...f.deps, production: true, store: lost });
    const result = await rebuilt.checkout(f.input); assert.equal(result.status, 'ready'); assert.equal(f.state.created.length, 1);
    assert.equal((await f.commerceStore.get(ORDER)).payment.session, undefined);
    assert.equal((await createTennisCheckoutService({ ...f.deps, production: true }).checkout(f.input)).checkoutHandle, result.checkoutHandle);
  } finally { rest?.close(); await redis?.close(); }
});

async function httpFixture() {
  const store = createMemoryStore(), commerceStore = createMemoryCommerceStore(), messages = [], secret = 'SYNTHETIC-HTTP-CAPABILITY-SECRET';
  const portal = createPortal({ store, env, now: () => AT, mailer: { send: async m => { messages.push(m); return { ok: true }; } }, resolveOrderOwnership: ({ orderId, accessToken: token }) => authorized(commerceStore, orderId, token, secret, AT, 'tennis') });
  const email = 'synthetic-checkout-owner@example.invalid', password = 'synthetic-long-passphrase';
  assert.equal((await portal.handle(request({ email, password, displayName: 'Synthetic owner', roles: ['player'], locale: 'ru', consents: { terms: true, privacy: true, marketing: false } }, {}, '/api/accounts/register'), 'register')).status, 202);
  const token = new URL(messages[0].params.link).searchParams.get('token'); assert.equal((await portal.handle(request({ token }, {}, '/api/accounts/verify'), 'verify')).status, 200);
  const login = await portal.handle(request({ email, password }, {}, '/api/accounts/login'), 'login'); assert.equal(login.status, 200);
  const logged = await login.json(), cookie = login.headers.get('set-cookie').split(';')[0];
  const f = await fixture({ store, commerceStore, userId: logged.user.id });
  let authCalls = 0, checkoutCalls = 0;
  const runtime = { service: { readiness: f.service.readiness, checkout: input => { checkoutCalls++; return f.service.checkout(input); } }, authenticateCustomer: (req, options) => { authCalls++; return portal.authenticatedCustomer(req, options); } };
  const deps = { env, runtimeFactory: async () => runtime, now: () => AT };
  const headers = { Cookie: cookie, 'X-CSRF-Token': logged.csrfToken };
  const post = (body = { idempotencyKey: 'synthetic-http-checkout', termsVersion: f.input.termsVersion }, extra = {}, path) => handleTennisCheckoutRequest(request(body, { ...headers, ...extra }, path), ORDER, deps);
  return { ...f, portal, deps, runtime, headers, post, counts: () => ({ authCalls, checkoutCalls }) };
}

test('production HTTP is unconfigured before secret, body, auth or store reads even when portal flags are on', async () => {
  const guarded = new Proxy(env, { get(target, key) { if (key === 'PORTAL_ENABLED' || key === 'PORTAL_RUNTIME_VERIFIED') return target[key]; assert.fail(`unexpected env read ${String(key)}`); } });
  const req = request({ idempotencyKey: 'synthetic-http', termsVersion: 'terms' });
  const result = await handleTennisCheckoutRequest(req, ORDER, { env: guarded }); assert.equal(result.status, 503); assert.equal(req.bodyUsed, false);
  const p = await result.json(); assert.equal(p.code, 'checkout_unconfigured'); assert.equal(p.messageKey, 'errors.checkout_unconfigured'); assert.equal(p.retryable, true);
  assert.equal((await resolveTennisCheckoutRuntime()).service, null);
  for (const flags of [{}, { PORTAL_ENABLED: 'true' }, { PORTAL_RUNTIME_VERIFIED: 'true' }]) assert.equal((await handleTennisCheckoutRequest(request({}), ORDER, { env: flags, runtimeFactory: () => assert.fail('flags OFF') })).status, 503);
});

test('actual verified session and CSRF deliver private own-site descriptor without manual order capability', async () => {
  const f = await httpFixture(), first = await f.post(), again = await f.post(); assert.equal(first.status, 200); assert.equal(again.status, 200);
  const a = await first.json(), b = await again.json(); assert.equal(a.checkoutHandle, b.checkoutHandle); assert.equal(a.status, 'ready');
  assert.deepEqual(Object.keys(a).sort(), ['checkoutHandle', 'checkoutPath', 'code', 'correlationId', 'embedded', 'expiresAt', 'status']);
  assert.equal(a.checkoutPath, '/ru/checkout'); assert.equal(first.headers.get('referrer-policy'), 'no-referrer'); assert.match(first.headers.get('cache-control'), /no-store/);
  assert.equal(first.headers.get('x-correlation-id'), a.correlationId); assert.notEqual(a.correlationId, b.correlationId);
  assert.equal(f.state.created.length, 1); assert.equal(JSON.stringify(a).includes('300281'), false); assert.equal(JSON.stringify(a).includes('synthetic-private-reference'), false);
});

test('actual portal guest, wrong CSRF/origin, foreign account and capability header fail before checkout', async () => {
  const f = await httpFixture();
  for (const [headers, status] of [[{ Cookie: '' }, 401], [{ 'X-CSRF-Token': '' }, 403], [{ Origin: 'https://evil.example.invalid' }, 403], [{ 'Sec-Fetch-Site': 'cross-site' }, 403], [{ Authorization: 'Bearer caller-capability' }, 400]]) {
    const result = await f.post(undefined, headers); assert.equal(result.status, status); assert.equal(f.state.created.length, 0);
  }
  await f.change('portalOrder', ORDER, { customerUserId: OTHER_USER }); assert.equal((await f.post()).status, 404); assert.equal(f.state.created.length, 0);
});

test('strict HTTP accepts only idempotency and immutable terms version; URL/query and caller facts are rejected', async () => {
  const f = await httpFixture();
  for (const body of [{}, { idempotencyKey: 'synthetic-http' }, { idempotencyKey: 'synthetic-http', termsVersion: f.input.termsVersion, amount: 1 }, { idempotencyKey: 'short', termsVersion: f.input.termsVersion }, { idempotencyKey: 'synthetic-http', termsVersion: true }]) assert.equal((await f.post(body)).status, 400);
  assert.equal((await f.post(undefined, {}, `/api/accounts/orders/${ORDER}/checkout?locale=en`)).status, 400);
  assert.equal((await f.post(undefined, { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await f.post(undefined, { 'Content-Length': '1025' })).status, 413);
  assert.equal(f.state.created.length, 0);
});

test('HTTP parser bounds actual streamed bytes, UTF8 and pending body reads', async () => {
  const f = await httpFixture(), headers = { ...f.headers, Origin: ORIGIN, 'Content-Type': 'application/json' };
  for (const [payload, status] of [[new Uint8Array(1025), 413], [new Uint8Array([0xff]), 400]]) {
    const req = new Request(ORIGIN + `/api/accounts/orders/${ORDER}/checkout`, { method: 'POST', headers, body: payload }); assert.equal((await handleTennisCheckoutRequest(req, ORDER, f.deps)).status, status);
  }
  const stream = new ReadableStream({ start() {} });
  const pending = new Request(ORIGIN + `/api/accounts/orders/${ORDER}/checkout`, { method: 'POST', headers, body: stream, duplex: 'half' });
  assert.equal((await handleTennisCheckoutRequest(pending, ORDER, { ...f.deps, bodyTimeoutMs: 10 })).status, 408); assert.equal(f.state.created.length, 0);
});

test('HTTP projection strips private provider fields and rejects unaudited descriptor origins/status', async () => {
  const f = await httpFixture(); const good = await f.service.checkout(f.input);
  const call = async result => handleTennisCheckoutRequest(request({ idempotencyKey: 'synthetic-http', termsVersion: f.input.termsVersion }, f.headers), ORDER, { ...f.deps, runtimeFactory: async () => ({ ...f.runtime, service: { readiness: { ready: true }, checkout: async () => result } }) });
  const result = await call({ ...good, merchantId: 'private-merchant', providerOrderId: 'private-order', rawError: 'private-error' });
  const p = await result.json(); assert.equal(p.merchantId, undefined); assert.equal(p.providerOrderId, undefined); assert.equal(p.rawError, undefined);
  for (const invalid of [{ ...good, status: 'paid' }, { ...good, checkoutPath: 'https://evil.example.invalid/checkout' }, { ...good, embedded: { ...good.embedded, serverVerified: false } }, { ...good, embedded: { ...good.embedded, gatewayOrigin: 'https://evil.example.invalid' } }]) assert.equal((await call(invalid)).status, 503);
});
