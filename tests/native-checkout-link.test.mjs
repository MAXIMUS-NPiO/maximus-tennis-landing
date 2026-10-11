/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore, createUpstashStore } from '../lib/platform/store.js';
import { hashPayload } from '../lib/platform/ids.js';
import { createNativeCheckoutLinkService, NATIVE_CHECKOUT_INTENT_TYPE } from '../lib/platform/native-checkout-link.js';
import { normalizeNativeMapping } from '../lib/platform/native-ledger-runtime.js';
import { NATIVE_BINDING_TYPES } from '../lib/platform/native-bindings.js';
import { COMMERCE_LEDGER_SELLER } from '../lib/platform/commerce-ledger.js';
import { forbidden } from '../lib/platform/errors.js';
import { startTestRedis, startBridge } from './redis-rest-bridge.mjs';

const AT = Date.parse('2026-10-11T00:00:00.000Z');
const ORDER = `MX-ORD-${'a'.repeat(32)}`, OTHER_ORDER = `MX-ORD-${'b'.repeat(32)}`;
const USER = `usr_${'0'.repeat(19)}1`, OTHER_USER = `usr_${'0'.repeat(19)}2`;
const CAPABILITY = 'synthetic-existing-order-capability';
const ctx = { userId: USER, organizationId: 'maximus-tennis', emailVerified: true };
async function fixture(store = createMemoryStore()) {
  let at = AT;
  const rawMapping = { id: 'synthetic-checkout-mapping', version: 'synthetic-v1', status: 'verified_live_native_mapping', enabled: true, mode: 'live', mappingMode: 'durable_server_binding_v1', captureMode: 'full_single', projectId: 'tennis', organizationId: 'maximus-tennis', source: 'cscart_mpgs', merchantId: '300281', paymentMethodId: '18', companyId: '991', storefrontId: '991', currency: 'AED', processor: 'MPGS', sellerLegalName: COMMERCE_LEDGER_SELLER, storeOrigin: 'https://maximussports.ae', mpgsOrigin: 'https://ap-gateway.mastercard.com', mpgsApiVersion: '99', cscartApiVersion: '2.0', mpgsSchema: 'mpgs_order_transactions_v1', cscartSchema: 'cscart_order_core_v1', verifiedAt: new Date(AT).toISOString(), liveModeEvidenceId: 'synthetic-live', nativeMappingEvidenceId: 'synthetic-native', customerBindingEvidenceId: 'synthetic-customer', providerSchemaEvidenceId: 'synthetic-schema' };
  const now = () => at, mapping = normalizeNativeMapping(rawMapping, now());
  const configuration = { series: 'synthetic-stock', racquetsTotal: 1 }, technical = { final: true, specification: 'synthetic-approved' };
  const offer = { approved: true, evidence: 'synthetic-approved-price', currency: 'AED', totalMinor: 12345, productMinor: 12000, taxMinor: 345, shippingMinor: 0, seller: { legalName: COMMERCE_LEDGER_SELLER }, configurationHash: hashPayload(configuration), fulfillableCountries: ['AE'], termsVersion: 'synthetic-accepted-terms', expiresAt: new Date(AT + 3600000).toISOString() };
  const commercial = { id: ORDER, snapshot: { schema: 1, projectId: 'tennis', plan: 'A', customerUserId: USER, createdAt: new Date(AT).toISOString(), contact: { email: 'synthetic-no-owner-join@example.invalid', country: 'AE' }, configuration, configurationHash: hashPayload(configuration), technical, offer, fulfillment: { verified: true, country: 'AE' }, paymentPreference: 'payment_link',
    quotation: { number: 'SYNTHETIC-NONTEST-APPROVED-QUOTE', test: false, status: 'quotation', orderId: ORDER, projectId: 'tennis', issuedAt: new Date(AT).toISOString(), expiresAt: offer.expiresAt, currency: offer.currency, totalMinor: offer.totalMinor, seller: offer.seller, termsVersion: offer.termsVersion, items: [{ quantity: 1, configuration, technical, unitPriceMinor: 12345, lineTotalMinor: 12345 }] } }, payment: { status: 'ready', termsVersion: offer.termsVersion, termsAcceptedAt: AT }, invoice: null };
  const orders = new Map([[ORDER, commercial]]);
  const native = { nativeOrderId: '901', companyId: '991', paymentMethodId: '18', cashTotalMinor: '12345', items: [{ productId: '99991', quantity: '1', optionsHash: hashPayload({}) }] };
  const attestation = { status: 'verified', authenticationBasis: 'server_authenticated_addon_query', mode: 'live', kind: 'goods', approval: 'approved', mappingHash: mapping.hash, nativeOrderId: native.nativeOrderId, providerOrderId: 'synthetic-provider-order', commerceOrderId: ORDER, customerUserId: USER, cashTotalMinor: native.cashTotalMinor, companyId: mapping.companyId, paymentMethodId: mapping.paymentMethodId, merchantId: mapping.merchantId, currency: mapping.currency, evidenceId: 'synthetic-authenticated-correlation', verifiedAt: new Date(AT).toISOString(), itemBindings: [{ nativeProductId: '99991', quantity: '1', optionsHash: hashPayload({}), commerceConfigurationHash: hashPayload(configuration) }] };
  const calls = { authorizations: 0, published: [], resolved: [], native: 0 };
  const state = { publisherResult: { status: 'accepted', attestationReference: 'synthetic-opaque-attestation' }, resolverResult: 'verified', publisherError: false };
  async function installMapping(m = mapping) {
    const docs = [{ type: 'nativeCommerceMapping', id: m.id, doc: m }, ...[['liveModeEvidenceId', 'live_route'], ['nativeMappingEvidenceId', 'native_order_mapping'], ['customerBindingEvidenceId', 'verified_customer_binding_schema'], ['providerSchemaEvidenceId', 'mpgs_retrieve_order_schema']].map(([field, kind]) => ({ type: 'nativeCommerceEvidence', id: m[field], doc: { id: m[field], kind, status: 'verified', mappingId: m.id, mappingVersion: m.version, mappingHash: m.hash, authenticationBasis: 'operator_addon_source_inspection', verifiedAt: new Date(AT).toISOString() } }))];
    await store.commit({ writes: await Promise.all(docs.map(async write => ({ ...write, expectedVersion: (await store.get(write.type, write.id))?.version ?? -1 }))) });
  }
  async function addOrder(id) {
    if (!orders.has(id)) { const other = structuredClone(commercial); other.id = id; other.snapshot.quotation.orderId = id; orders.set(id, other); }
    await store.commit({ writes: [{ type: 'portalOrder', id, expectedVersion: -1, doc: { id, projectId: 'tennis', organizationId: 'maximus-tennis', customerUserId: USER, ownershipProof: 'verified_session_and_order_capability' } }], uniques: [{ name: 'portal_order_owner', value: `tennis:${id}`, owner: USER }] });
  }
  await store.commit({ writes: [
    { type: 'user', id: USER, expectedVersion: -1, doc: { id: USER, status: 'active', email: 'synthetic-different@example.invalid' } },
    { type: 'portalMembership', id: `maximus-tennis_${USER}`, expectedVersion: -1, doc: { id: `maximus-tennis_${USER}`, userId: USER, organizationId: 'maximus-tennis' } },
  ] });
  await addOrder(ORDER);
  await installMapping();
  const deps = { store, mapping, now, authorizeOrder: async ({ ctx: customer, orderId, accessToken }) => {
    calls.authorizations++;
    if (customer.userId !== USER || accessToken !== CAPABILITY) throw forbidden('synthetic_capability_invalid');
    return structuredClone(orders.get(orderId));
  }, loadCommerceOrder: async id => structuredClone(orders.get(id)), readNativeOrder: async () => { calls.native++; return structuredClone(native); },
  publishNativeIntent: async ({ intent }) => { calls.published.push(structuredClone(intent)); if (state.publisherError) throw Error('synthetic-private-transport-error'); return structuredClone(state.publisherResult); },
  resolvePublishedIntent: async request => { calls.resolved.push(structuredClone(request)); if (state.resolverResult !== 'verified') return { status: state.resolverResult }; return { ...structuredClone(attestation), intentId: request.intentId, correlation: request.correlation }; } };
  const service = createNativeCheckoutLinkService(deps);
  const input = { ctx, orderId: ORDER, accessToken: CAPABILITY, idempotencyKey: 'synthetic-intent-one' };
  return { store, mapping, rawMapping, deps, service, input, commercial, native, attestation, calls, state, now, setTime: value => { at = value; }, addOrder, installMapping, orders };
}

test('missing native adapters are fail-closed before authorization or intent persistence', async () => {
  const f = await fixture();
  const service = createNativeCheckoutLinkService({ ...f.deps, publishNativeIntent: undefined, resolvePublishedIntent: undefined });
  assert.equal(service.readiness.ready, false);
  assert.deepEqual(service.readiness.missing, ['authenticated_native_publisher', 'authenticated_native_correlation_resolver']);
  await assert.rejects(service.prepare(f.input), { code: 'native_checkout_publisher_unconfigured', status: 503 });
  assert.equal(f.calls.authorizations, 0); assert.equal(await f.store.countType(NATIVE_CHECKOUT_INTENT_TYPE), 0);
  assert.throws(() => createNativeCheckoutLinkService({ ...f.deps, production: true }), { code: 'native_checkout_runtime_unavailable' });
});

test('prepare reserves one opaque server correlation and returns only customer-safe status', async () => {
  const f = await fixture(), result = await f.service.prepare(f.input);
  assert.deepEqual(Object.keys(result).sort(), ['bindingReady', 'expiresAt', 'intentId', 'status']);
  assert.equal(result.status, 'prepared'); assert.equal(result.bindingReady, false);
  const d = (await f.store.get(NATIVE_CHECKOUT_INTENT_TYPE, result.intentId)).doc;
  assert.match(d.correlation, /^ncc_[A-Za-z0-9_-]{43}$/);
  assert.equal(d.commercialApprovalHash.length, 64); assert.equal(d.publishAttempts, 0);
  for (const value of [CAPABILITY, 'example.invalid', d.correlation, USER, ORDER, 'synthetic-provider-order']) assert.equal(JSON.stringify(result).includes(value), false);
  assert.equal(JSON.stringify(d).includes(CAPABILITY), false);
  assert.equal(f.calls.published.length, 0); assert.equal(f.calls.native, 0); assert.equal(f.calls.authorizations, 1);
});

test('production default rejects memory when the optional production argument is omitted', async () => {
  const f = await fixture(), prior = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    assert.throws(() => createNativeCheckoutLinkService(f.deps), { code: 'native_checkout_runtime_unavailable' });
    assert.equal(createNativeCheckoutLinkService({ ...f.deps, production: false }).readiness.ready, true);
  } finally { if (prior === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = prior; }
  assert.equal(await f.store.countType(NATIVE_CHECKOUT_INTENT_TYPE), 0);
});

test('client identity/native/proof fields, malformed ctx and invalid capability are rejected', async () => {
  for (const extra of [{ customerUserId: USER }, { nativeOrderId: '901' }, { providerOrderId: 'x' }, { proof: { verified: true } }, { amountMinor: '12345' }]) {
    const f = await fixture(); await assert.rejects(f.service.prepare({ ...f.input, ...extra }), { code: 'native_checkout_input_invalid' });
    assert.equal(await f.store.countType(NATIVE_CHECKOUT_INTENT_TYPE), 0);
  }
  for (const change of [{ ctx: null }, { ctx: { ...ctx, emailVerified: false } }, { ctx: { ...ctx, organizationId: 'other' } }, { accessToken: 'wrong-capability' }, { idempotencyKey: '../bad' }]) {
    const f = await fixture(); await assert.rejects(f.service.prepare({ ...f.input, ...change }));
    assert.equal(await f.store.countType(NATIVE_CHECKOUT_INTENT_TYPE), 0);
  }
});

test('durable exact portal ownership, active user and tenant membership are required', async () => {
  for (const [type, id, change] of [['portalOrder', ORDER, { ownershipProof: 'email_match' }], ['portalOrder', ORDER, { customerUserId: OTHER_USER }], ['portalOrder', ORDER, { organizationId: 'other' }], ['user', USER, { status: 'pending_verification' }], ['portalMembership', `maximus-tennis_${USER}`, { organizationId: 'other' }]]) {
    const f = await fixture(), row = await f.store.get(type, id);
    await f.store.commit({ writes: [{ type, id, expectedVersion: row.version, doc: { ...row.doc, ...change } }] });
    await assert.rejects(f.service.prepare(f.input), { code: 'native_checkout_order_owner_required' });
    assert.equal(await f.store.countType(NATIVE_CHECKOUT_INTENT_TYPE), 0);
  }
  const f = await fixture(); f.commercial.snapshot.customerUserId = OTHER_USER;
  await assert.rejects(f.service.prepare(f.input), { code: 'native_actual_commerce_order_required' });
});

test('the original authorized full snapshot is required, never the public order projection', async () => {
  const f = await fixture(), service = createNativeCheckoutLinkService({ ...f.deps, authorizeOrder: async () => ({ id: ORDER, snapshot: { projectId: 'tennis' } }) });
  await assert.rejects(service.prepare(f.input), { code: 'native_checkout_authorized_snapshot_required' });
});

test('missing/draft/TEST/wrong money or technical contract never becomes a live intent', async () => {
  const changes = [f => { f.commercial.snapshot.offer = null; }, f => { f.commercial.snapshot.quotation = null; }, f => { f.commercial.snapshot.offer.approved = false; }, f => { f.commercial.snapshot.quotation.test = true; }, f => { f.commercial.snapshot.quotation.number = 'TEST-SYNTHETIC'; }, f => { f.commercial.snapshot.offer.currency = 'USD'; }, f => { f.commercial.snapshot.quotation.totalMinor++; }, f => { f.commercial.snapshot.technical.final = false; }, f => { f.commercial.snapshot.fulfillment.verified = false; }, f => { f.commercial.payment.termsAcceptedAt = null; }, f => { f.commercial.payment.status = 'awaiting_quote'; }, f => { f.commercial.invoice = { test: true, number: 'TEST-SYNTHETIC' }; }];
  for (const change of changes) {
    const f = await fixture(); change(f); await assert.rejects(f.service.prepare(f.input));
    assert.equal(await f.store.countType(NATIVE_CHECKOUT_INTENT_TYPE), 0); assert.equal(f.calls.published.length, 0);
  }
});

test('first prepare rejects expired, terminal, pending or already-session orders', async () => {
  for (const status of ['paid', 'refunded', 'pending', 'creating', 'review_required']) {
    const f = await fixture(); f.commercial.payment.status = status;
    await assert.rejects(f.service.prepare(f.input), { code: 'native_checkout_order_not_ready' });
  }
  const f = await fixture(); f.setTime(AT + 3600000);
  await assert.rejects(f.service.prepare(f.input), { code: 'native_checkout_offer_expired' });
  const withSession = await fixture(); withSession.commercial.payment.session = { id: 'synthetic-existing-test-session' };
  await assert.rejects(withSession.service.prepare(withSession.input), { code: 'native_checkout_order_not_ready' });
});

test('durable live/schema/owner evidence is mandatory and revocation blocks a reserved publisher', async () => {
  for (const field of ['liveModeEvidenceId', 'nativeMappingEvidenceId', 'customerBindingEvidenceId', 'providerSchemaEvidenceId']) {
    const f = await fixture(), row = await f.store.get('nativeCommerceEvidence', f.mapping[field]);
    await f.store.commit({ writes: [{ type: 'nativeCommerceEvidence', id: row.doc.id, expectedVersion: row.version, doc: { ...row.doc, status: 'unverified' } }] });
    await assert.rejects(f.service.prepare(f.input), { code: 'native_checkout_mapping_unverified' });
    assert.equal(await f.store.countType(NATIVE_CHECKOUT_INTENT_TYPE), 0);
  }
  const f = await fixture(), p = await f.service.prepare(f.input), row = await f.store.get('nativeCommerceEvidence', f.mapping.nativeMappingEvidenceId);
  await f.store.commit({ writes: [{ type: 'nativeCommerceEvidence', id: row.doc.id, expectedVersion: row.version, doc: { ...row.doc, mappingVersion: 'other' } }] });
  await assert.rejects(f.service.publish({ intentId: p.intentId }), { code: 'native_checkout_mapping_unverified' });
  assert.equal(f.calls.published.length, 0); assert.equal((await f.store.get(NATIVE_CHECKOUT_INTENT_TYPE, p.intentId)).doc.status, 'prepared');
});

test('concurrent prepare and new keys reuse the reserved correlation without extra native creates', async () => {
  const f = await fixture();
  const results = await Promise.all(Array.from({ length: 8 }, (_, n) => f.service.prepare({ ...f.input, idempotencyKey: `synthetic-key-${n}` })));
  assert.equal(new Set(results.map(result => result.intentId)).size, 1);
  assert.equal(await f.store.countType(NATIVE_CHECKOUT_INTENT_TYPE), 1);
  const before = (await f.store.get(NATIVE_CHECKOUT_INTENT_TYPE, results[0].intentId)).doc.correlation;
  assert.equal((await f.service.prepare(f.input)).intentId, results[0].intentId);
  assert.equal((await f.store.get(NATIVE_CHECKOUT_INTENT_TYPE, results[0].intentId)).doc.correlation, before);
  assert.equal(f.calls.published.length, 0);
});

test('idempotency cannot change MX order, and mapping drift cannot create a second intent', async () => {
  const f = await fixture(); await f.service.prepare(f.input); await f.addOrder(OTHER_ORDER);
  await assert.rejects(f.service.prepare({ ...f.input, orderId: OTHER_ORDER }), { code: 'native_checkout_idempotency_conflict' });
  const changedMapping = normalizeNativeMapping({ ...f.rawMapping, version: 'synthetic-v2' }, f.now());
  await f.installMapping(changedMapping);
  const changed = createNativeCheckoutLinkService({ ...f.deps, mapping: changedMapping });
  await assert.rejects(changed.prepare({ ...f.input, idempotencyKey: 'synthetic-new-map-key' }), { code: 'native_checkout_mapping_pinned' });
  assert.equal(await f.store.countType(NATIVE_CHECKOUT_INTENT_TYPE), 1);
});

test('only one acknowledged CAS caller publishes and independent native proof establishes binding', async () => {
  const f = await fixture(), prepared = await f.service.prepare(f.input);
  await Promise.all(Array.from({ length: 8 }, () => f.service.publish({ intentId: prepared.intentId })));
  const result = await f.service.readStatus({ ctx, intentId: prepared.intentId });
  assert.equal(result.status, 'bound'); assert.equal(result.bindingReady, true);
  assert.equal(f.calls.published.length, 1); assert.equal(await f.store.countType(NATIVE_BINDING_TYPES.binding), 1);
  assert.equal((await f.service.publish({ intentId: prepared.intentId })).status, 'bound');
  assert.equal(f.calls.published.length, 1);
});

test('uncertain responses and not-found recovery never repeat native-create even after offer expiry/reconstruction', async () => {
  const f = await fixture(); f.state.publisherError = true; f.state.resolverResult = 'not_found';
  const prepared = await f.service.prepare(f.input);
  assert.equal((await f.service.publish({ intentId: prepared.intentId })).status, 'uncertain');
  f.setTime(AT + 7200000);
  const rebuilt = createNativeCheckoutLinkService(f.deps);
  assert.equal((await rebuilt.publish({ intentId: prepared.intentId })).status, 'uncertain');
  assert.equal((await rebuilt.recover({ intentId: prepared.intentId })).status, 'uncertain');
  f.state.resolverResult = 'verified';
  assert.equal((await rebuilt.recover({ intentId: prepared.intentId })).status, 'bound');
  assert.equal(f.calls.published.length, 1);
});

test('expiry between prepare and first publish blocks creation permanently', async () => {
  const f = await fixture(), prepared = await f.service.prepare(f.input); f.setTime(AT + 3600000);
  assert.equal((await f.service.publish({ intentId: prepared.intentId })).status, 'expired');
  assert.equal((await f.service.publish({ intentId: prepared.intentId })).status, 'expired');
  assert.equal(f.calls.published.length, 0);
});

test('immutable commerce mutation and wrong read-status owner cannot use a reserved intent', async () => {
  const f = await fixture(), prepared = await f.service.prepare(f.input);
  await assert.rejects(f.service.readStatus({ ctx: { ...ctx, userId: OTHER_USER }, intentId: prepared.intentId }), { status: 404 });
  f.commercial.snapshot.contact.email = 'synthetic-changed@example.invalid';
  await assert.rejects(f.service.publish({ intentId: prepared.intentId }), { code: 'native_checkout_snapshot_changed' });
  assert.equal(f.calls.published.length, 0);
});

test('publisher accepted/status/URL are not proof, and rejected outcome is terminal', async () => {
  const f = await fixture(); f.state.publisherResult = { status: 'accepted', url: 'https://untrusted.invalid/', verified: true }; f.state.resolverResult = 'pending';
  const prepared = await f.service.prepare(f.input);
  assert.equal((await f.service.publish({ intentId: prepared.intentId })).status, 'uncertain');
  assert.equal(await f.store.countType(NATIVE_BINDING_TYPES.binding), 0);
  const rejected = await fixture(); rejected.state.publisherResult = { status: 'rejected' };
  const p = await rejected.service.prepare(rejected.input);
  assert.equal((await rejected.service.publish({ intentId: p.intentId })).status, 'review_required');
  assert.equal((await rejected.service.recover({ intentId: p.intentId })).status, 'review_required');
  assert.equal(rejected.calls.published.length, 1); assert.equal(rejected.calls.resolved.length, 0);
});

test('wrong correlation/customer/mapping or unauthenticated resolver cannot register a binding', async () => {
  for (const change of [{ correlation: 'forged' }, { intentId: 'forged' }, { customerUserId: OTHER_USER }, { authenticationBasis: 'client_email' }, { mappingHash: 'f'.repeat(64) }, { commerceOrderId: OTHER_ORDER }, { cashTotalMinor: '12346' }, { verifiedAt: new Date(AT - 1).toISOString() }]) {
    const f = await fixture(), service = createNativeCheckoutLinkService({ ...f.deps, resolvePublishedIntent: async request => ({ ...f.attestation, intentId: request.intentId, correlation: request.correlation, ...change }) });
    const prepared = await service.prepare(f.input);
    assert.equal((await service.publish({ intentId: prepared.intentId })).status, 'review_required');
    assert.equal(await f.store.countType(NATIVE_BINDING_TYPES.binding), 0);
  }
});

test('a trusted attestation still requires the independently read exact native amount and SKU/options', async () => {
  for (const change of [f => { f.native.cashTotalMinor = '12346'; }, f => { f.native.items[0].productId = '99992'; }, f => { f.native.items[0].optionsHash = hashPayload({ other: true }); }, f => { f.attestation.mode = 'test'; }]) {
    const f = await fixture(); change(f); const prepared = await f.service.prepare(f.input);
    assert.equal((await f.service.publish({ intentId: prepared.intentId })).status, 'review_required');
    assert.equal(await f.store.countType(NATIVE_BINDING_TYPES.binding), 0);
  }
});

function loseAcknowledgement(store, predicate, { before = false } = {}) {
  let lost = false;
  return { ...store, async commit(commit) {
    if (!lost && predicate(commit)) { lost = true; if (!before) await store.commit(commit); throw Error('synthetic-private-ack-loss'); }
    return store.commit(commit);
  } };
}

test('lost prepare acknowledgement recovers the same durable correlation', async () => {
  const f = await fixture(), store = loseAcknowledgement(f.store, commit => commit.writes?.some(write => write.type === NATIVE_CHECKOUT_INTENT_TYPE && write.doc.status === 'prepared'));
  const service = createNativeCheckoutLinkService({ ...f.deps, store });
  const p = await service.prepare(f.input);
  assert.equal((await service.prepare(f.input)).intentId, p.intentId);
  assert.equal(await f.store.countType(NATIVE_CHECKOUT_INTENT_TYPE), 1); assert.equal(f.calls.published.length, 0);
});

test('lost publishing-reservation acknowledgement never calls create and lease expiry permits query only', async () => {
  const f = await fixture(), p = await f.service.prepare(f.input);
  const store = loseAcknowledgement(f.store, commit => commit.writes?.some(write => write.type === NATIVE_CHECKOUT_INTENT_TYPE && write.doc.status === 'publishing'));
  const service = createNativeCheckoutLinkService({ ...f.deps, store });
  await assert.rejects(service.publish({ intentId: p.intentId }), { code: 'native_checkout_publish_reservation_unavailable' });
  assert.equal(f.calls.published.length, 0);
  f.state.resolverResult = 'not_found'; f.setTime(AT + 31000);
  assert.equal((await service.recover({ intentId: p.intentId })).status, 'uncertain');
  await service.publish({ intentId: p.intentId }); assert.equal(f.calls.published.length, 0);
});

test('binding commit acknowledgement loss recovers one native binding without another create', async () => {
  const f = await fixture(), p = await f.service.prepare(f.input);
  const store = loseAcknowledgement(f.store, commit => commit.writes?.some(write => write.type === NATIVE_BINDING_TYPES.binding));
  const service = createNativeCheckoutLinkService({ ...f.deps, store });
  assert.equal((await service.publish({ intentId: p.intentId })).status, 'uncertain');
  assert.equal(await f.store.countType(NATIVE_BINDING_TYPES.binding), 1);
  assert.equal((await createNativeCheckoutLinkService({ ...f.deps, store }).recover({ intentId: p.intentId })).status, 'bound');
  assert.equal(await f.store.countType(NATIVE_BINDING_TYPES.binding), 1); assert.equal(f.calls.published.length, 1);
});

test('final intent-write acknowledgement loss returns only independently reread durable binding status', async () => {
  const f = await fixture(), p = await f.service.prepare(f.input);
  const store = loseAcknowledgement(f.store, commit => commit.writes?.some(write => write.type === NATIVE_CHECKOUT_INTENT_TYPE && write.doc.status === 'bound'));
  const service = createNativeCheckoutLinkService({ ...f.deps, store });
  assert.equal((await service.publish({ intentId: p.intentId })).status, 'bound');
  assert.equal((await service.recover({ intentId: p.intentId })).status, 'bound');
  assert.equal(await f.store.countType(NATIVE_BINDING_TYPES.binding), 1); assert.equal(f.calls.published.length, 1);
});

test('a delayed store cannot allow first publish after offer expiry', async () => {
  const f = await fixture(), p = await f.service.prepare(f.input);
  let delayed = false;
  const store = { ...f.store, async commit(commit) {
    const result = await f.store.commit(commit);
    if (!delayed && commit.writes?.some(write => write.type === NATIVE_CHECKOUT_INTENT_TYPE && write.doc.status === 'publishing')) { delayed = true; f.setTime(AT + 3600000); }
    return result;
  } };
  const service = createNativeCheckoutLinkService({ ...f.deps, store });
  assert.equal((await service.publish({ intentId: p.intentId })).status, 'publishing');
  assert.equal(f.calls.published.length, 0);
});

test('attempted prepared-state corruption cannot repeat create', async () => {
  const f = await fixture(), p = await f.service.prepare(f.input), row = await f.store.get(NATIVE_CHECKOUT_INTENT_TYPE, p.intentId);
  await f.store.commit({ writes: [{ type: NATIVE_CHECKOUT_INTENT_TYPE, id: p.intentId, expectedVersion: row.version, doc: { ...row.doc, publishAttempts: 1 } }] });
  await assert.rejects(f.service.publish({ intentId: p.intentId }), { code: 'native_checkout_intent_integrity_failed' });
  assert.equal(f.calls.published.length, 0);
});

test('lease expiry during awaited owner recheck observes concurrent recovery and never calls stale publisher', async () => {
  const f = await fixture(), p = await f.service.prepare(f.input); f.state.resolverResult = 'not_found';
  let loads = 0, service;
  service = createNativeCheckoutLinkService({ ...f.deps, loadCommerceOrder: async id => {
    loads++;
    if (loads === 2) { f.setTime(AT + 31000); await service.recover({ intentId: p.intentId }); }
    return structuredClone(f.orders.get(id));
  } });
  assert.equal((await service.publish({ intentId: p.intentId })).status, 'uncertain');
  assert.equal(f.calls.published.length, 0);
});

test('terminal review cannot be revived by a stale registry failure or success', async () => {
  for (const fail of [false, true]) {
    const f = await fixture(), p = await f.service.prepare(f.input);
    let changed = false;
    const service = createNativeCheckoutLinkService({ ...f.deps, readNativeOrder: async () => {
      if (!changed) {
        changed = true; const row = await f.store.get(NATIVE_CHECKOUT_INTENT_TYPE, p.intentId);
        await f.store.commit({ writes: [{ type: NATIVE_CHECKOUT_INTENT_TYPE, id: p.intentId, expectedVersion: row.version, doc: { ...row.doc, status: 'review_required', reason: 'synthetic-concurrent-review' } }] });
        if (fail) throw Error('synthetic-private-query-outage');
      }
      return structuredClone(f.native);
    } });
    assert.equal((await service.publish({ intentId: p.intentId })).status, 'review_required');
    assert.equal((await f.store.get(NATIVE_CHECKOUT_INTENT_TYPE, p.intentId)).doc.status, 'review_required');
    assert.equal(await f.store.countType(NATIVE_BINDING_TYPES.binding), 0);
    assert.equal((await service.recover({ intentId: p.intentId })).status, 'review_required');
  }
});

test('concurrent invalid recovery while native GET waits atomically blocks binding and pollable index', async () => {
  const f = await fixture(); f.state.resolverResult = 'pending';
  const p = await f.service.prepare(f.input); await f.service.publish({ intentId: p.intentId });
  f.state.resolverResult = 'verified';
  let release, reached;
  const held = new Promise(resolve => { release = resolve; }), entered = new Promise(resolve => { reached = resolve; });
  const valid = createNativeCheckoutLinkService({ ...f.deps, readNativeOrder: async () => { reached(); await held; return structuredClone(f.native); } });
  const invalid = createNativeCheckoutLinkService({ ...f.deps, resolvePublishedIntent: async request => ({ ...f.attestation, intentId: request.intentId, correlation: 'synthetic-forged-correlation' }) });
  const recovering = valid.recover({ intentId: p.intentId });
  await entered;
  assert.equal((await invalid.recover({ intentId: p.intentId })).status, 'review_required');
  release();
  assert.equal((await recovering).status, 'review_required');
  assert.equal(await f.store.countType(NATIVE_BINDING_TYPES.binding), 0);
  assert.equal(await f.store.indexSize(`native-bindings:${f.mapping.hash}`), 0);
});

test('bound status cannot hide corrupted native fingerprint or missing native unique ownership', async () => {
  for (const corruption of ['fingerprint', 'unique']) {
    const f = await fixture(), p = await f.service.prepare(f.input); await f.service.publish({ intentId: p.intentId });
    const d = (await f.store.get(NATIVE_CHECKOUT_INTENT_TYPE, p.intentId)).doc;
    if (corruption === 'fingerprint') {
      const b = await f.store.get(NATIVE_BINDING_TYPES.binding, d.bindingId);
      await f.store.commit({ writes: [{ type: NATIVE_BINDING_TYPES.binding, id: d.bindingId, expectedVersion: b.version, doc: { ...b.doc, fingerprint: 'f'.repeat(64) } }] });
    } else await f.store.releaseUnique('native_store_order', hashPayload([f.mapping.hash, f.native.nativeOrderId]));
    await assert.rejects(f.service.readStatus({ ctx, intentId: p.intentId }), { code: 'native_binding_integrity_failed' });
    await assert.rejects(f.service.prepare(f.input), { code: 'native_binding_integrity_failed' });
  }
});

test('actual Redis enforces one reservation/create and reconstructs uncertain binding after ack loss', async t => {
  let redis, rest;
  try {
    try { redis = await startTestRedis(6398); rest = await startBridge({ redisPort: 6398, token: 'synthetic-checkout-local-only' }); }
    catch (error) { if (process.env.INTAKE_REQUIRE_REDIS === '1' || !['ENOENT', 'EACCES', 'EPERM'].includes(error.code)) throw error; return t.skip(`native Redis unavailable: ${error.code}`); }
    const store = createUpstashStore({ url: rest.url, token: 'synthetic-checkout-local-only' });
    const f = await fixture(store), p = await f.service.prepare(f.input);
    const uncertainStore = loseAcknowledgement(store, commit => commit.writes?.some(write => write.type === NATIVE_BINDING_TYPES.binding));
    const service = createNativeCheckoutLinkService({ ...f.deps, store: uncertainStore, production: true });
    const results = await Promise.all(Array.from({ length: 5 }, () => service.prepare(f.input)));
    assert.ok(results.every(result => result.intentId === p.intentId));
    assert.equal((await service.publish({ intentId: p.intentId })).status, 'uncertain');
    assert.equal((await createNativeCheckoutLinkService({ ...f.deps, production: true }).recover({ intentId: p.intentId })).status, 'bound');
    assert.equal((await store.get(NATIVE_CHECKOUT_INTENT_TYPE, p.intentId)).doc.status, 'bound'); assert.equal(await store.indexSize(`native-bindings:${f.mapping.hash}`), 1); assert.equal(f.calls.published.length, 1);
    // The same atomic no-change intent guard is exercised by the real Redis Lua commit.
    await f.addOrder(OTHER_ORDER); f.attestation.commerceOrderId = OTHER_ORDER;
    f.attestation.nativeOrderId = '902'; f.native.nativeOrderId = '902'; f.attestation.providerOrderId = 'synthetic-second-native-order';
    f.state.resolverResult = 'pending';
    const second = await f.service.prepare({ ...f.input, orderId: OTHER_ORDER, idempotencyKey: 'synthetic-redis-second' });
    await f.service.publish({ intentId: second.intentId }); f.state.resolverResult = 'verified';
    let release, reached;
    const held = new Promise(resolve => { release = resolve; }), entered = new Promise(resolve => { reached = resolve; });
    const valid = createNativeCheckoutLinkService({ ...f.deps, production: true, readNativeOrder: async () => { reached(); await held; return structuredClone(f.native); } });
    const invalid = createNativeCheckoutLinkService({ ...f.deps, production: true, resolvePublishedIntent: async request => ({ ...f.attestation, intentId: request.intentId, correlation: 'synthetic-invalid-correlation' }) });
    const recovering = valid.recover({ intentId: second.intentId }); await entered;
    assert.equal((await invalid.recover({ intentId: second.intentId })).status, 'review_required'); release();
    assert.equal((await recovering).status, 'review_required');
    assert.equal(await store.indexSize(`native-bindings:${f.mapping.hash}`), 1);
    assert.equal(await store.getUnique('native_commerce_order', hashPayload([f.mapping.hash, OTHER_ORDER])), null);
    const drift = normalizeNativeMapping({ ...f.rawMapping, version: 'synthetic-v2' }, f.now());
    await f.installMapping(drift);
    await assert.rejects(createNativeCheckoutLinkService({ ...f.deps, mapping: drift, production: true }).prepare({ ...f.input, idempotencyKey: 'synthetic-drift-key' }), { code: 'native_checkout_mapping_pinned' });
  } finally { rest?.close(); await redis?.close(); }
});
