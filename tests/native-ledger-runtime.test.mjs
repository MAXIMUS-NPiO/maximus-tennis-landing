/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore, createUpstashStore } from '../lib/platform/store.js';
import { startTestRedis, startBridge } from './redis-rest-bridge.mjs';
import { createNativeBindingRegistry, NATIVE_BINDING_TYPES } from '../lib/platform/native-bindings.js';
import { normalizeNativeMapping, createNativeCommerceLedgerRuntime } from '../lib/platform/native-ledger-runtime.js';
import { COMMERCE_LEDGER_SELLER } from '../lib/platform/commerce-ledger.js';
import { createLedgerService } from '../lib/platform/ledger.js';
import { hashPayload } from '../lib/platform/ids.js';
import { handleLedgerWorkerRequest } from '../lib/platform/ledger-worker.js';
import { createNativeMpgsReader } from '../lib/platform/native-mpgs.js';

const AT = '2026-10-11T00:00:00.000Z';
const ORDER = `MX-ORD-${'c'.repeat(32)}`, USER = `usr_${'0'.repeat(19)}1`;
async function fixture(store = createMemoryStore()) {
  const now = () => Date.parse(AT), fetchCalls = [];
  // Fully synthetic evidence, version and storefront. These are never operator/production facts.
  const rawMapping = { id: 'synthetic-native-mapping', version: 'synthetic-v1', status: 'verified_live_native_mapping', enabled: true, mode: 'live', mappingMode: 'durable_server_binding_v1', captureMode: 'full_single', projectId: 'tennis', organizationId: 'maximus-tennis', source: 'cscart_mpgs', merchantId: '300281', paymentMethodId: '18', companyId: '991', storefrontId: '991', currency: 'AED', processor: 'MPGS', sellerLegalName: COMMERCE_LEDGER_SELLER, storeOrigin: 'https://maximussports.ae', mpgsOrigin: 'https://ap-gateway.mastercard.com', mpgsApiVersion: '99', cscartApiVersion: '2.0', mpgsSchema: 'mpgs_order_transactions_v1', cscartSchema: 'cscart_order_core_v1', verifiedAt: AT, liveModeEvidenceId: 'synthetic-live-evidence', nativeMappingEvidenceId: 'synthetic-addon-evidence', customerBindingEvidenceId: 'synthetic-owner-evidence', providerSchemaEvidenceId: 'synthetic-provider-schema' };
  const mapping = normalizeNativeMapping(rawMapping, now());
  const evidence = [['liveModeEvidenceId', 'live_route'], ['nativeMappingEvidenceId', 'native_order_mapping'], ['customerBindingEvidenceId', 'verified_customer_binding_schema'], ['providerSchemaEvidenceId', 'mpgs_retrieve_order_schema']].map(([field, kind]) => ({ type: 'nativeCommerceEvidence', id: mapping[field], expectedVersion: -1, doc: { id: mapping[field], kind, status: 'verified', mappingId: mapping.id, mappingVersion: mapping.version, mappingHash: mapping.hash, verifiedAt: AT, authenticationBasis: 'operator_addon_source_inspection' } }));
  const configuration = { series: 'synthetic-series', racquetsTotal: 1, mode: 'stock' }, technical = { final: true, specification: 'synthetic-approved-technical' };
  const offer = { approved: true, evidence: 'synthetic-price-approval', currency: 'AED', totalMinor: 12345, productMinor: 12000, taxMinor: 345, shippingMinor: 0, seller: { legalName: COMMERCE_LEDGER_SELLER }, configurationHash: hashPayload(configuration), fulfillableCountries: ['AE'], termsVersion: 'synthetic-goods-terms', expiresAt: '2026-10-12T00:00:00.000Z' };
  const commercial = { id: ORDER, snapshot: { schema: 1, projectId: 'tennis', plan: 'A', customerUserId: USER, createdAt: AT, contact: { email: 'ignored-do-not-join@example.invalid', country: 'AE' }, offer, configuration, configurationHash: hashPayload(configuration), technical, fulfillment: { verified: true, country: 'AE' }, paymentPreference: 'payment_link',
    quotation: { number: 'SYNTHETIC-APPROVED-GOODS-QUOTE', status: 'quotation', test: false, orderId: ORDER, projectId: 'tennis', issuedAt: AT, expiresAt: offer.expiresAt, seller: offer.seller, currency: 'AED', totalMinor: 12345, termsVersion: offer.termsVersion, items: [{ quantity: 1, configuration, technical, unitPriceMinor: 12345, lineTotalMinor: 12345 }] } },
    payment: { status: 'pending', termsVersion: offer.termsVersion, termsAcceptedAt: Date.parse(AT) }, invoice: null };
  const native = { nativeOrderId: '901', companyId: '991', paymentMethodId: '18', cashTotalMinor: '12345', items: [{ productId: '99991', quantity: '1', optionsHash: hashPayload({}) }] };
  await store.commit({ writes: [
    { type: 'nativeCommerceMapping', id: mapping.id, expectedVersion: -1, doc: rawMapping }, ...evidence,
    { type: 'user', id: USER, expectedVersion: -1, doc: { id: USER, status: 'active', email: 'different@example.invalid' } },
    { type: 'portalMembership', id: `maximus-tennis_${USER}`, expectedVersion: -1, doc: { id: `maximus-tennis_${USER}`, userId: USER, organizationId: 'maximus-tennis' } },
    { type: 'portalOrder', id: ORDER, expectedVersion: -1, doc: { id: ORDER, projectId: 'tennis', organizationId: 'maximus-tennis', customerUserId: USER, ownershipProof: 'verified_session_and_order_capability' } },
  ], uniques: [{ name: 'portal_order_owner', value: `tennis:${ORDER}`, owner: USER }] });
  const bindingAttestation = { status: 'verified', authenticationBasis: 'server_authenticated_addon_query', mode: 'live', kind: 'goods', approval: 'approved', mappingHash: mapping.hash, nativeOrderId: '901', providerOrderId: 'synthetic-provider-order', commerceOrderId: ORDER, customerUserId: USER, cashTotalMinor: '12345', companyId: '991', paymentMethodId: '18', merchantId: '300281', currency: 'AED', evidenceId: 'synthetic-authenticated-native-binding', verifiedAt: AT,
    itemBindings: [{ nativeProductId: '99991', quantity: '1', optionsHash: hashPayload({}), commerceConfigurationHash: hashPayload(configuration) }] };
  const references = new Map();
  const registry = createNativeBindingRegistry({ store, mapping, now, readNativeOrder: async () => structuredClone(native), loadCommerceOrder: async id => id === commercial.id ? structuredClone(commercial) : null,
    resolveTrustedBinding: async ref => ref === 'opaque-addon-binding' ? structuredClone(bindingAttestation) : null,
    resolveTrustedReference: async ref => structuredClone(references.get(ref)),
    readProviderMovement: async request => createNativeMpgsReader({ origin: mapping.mpgsOrigin, merchantId: mapping.merchantId, apiVersion: mapping.mpgsApiVersion, schema: mapping.mpgsSchema, password: env.NATIVE_MPGS_API_PASSWORD, fetchImpl, now }).readMovement(request) });
  const provider = { result: 'SUCCESS', id: bindingAttestation.providerOrderId, merchant: '300281', currency: 'AED', amount: '123.45', totalCapturedAmount: '123.45', totalRefundedAmount: '0.00', status: 'CAPTURED', sourceOfFunds: { card: { number: 'synthetic-never-store-pan' } }, transaction: [
    { result: 'SUCCESS', merchant: '300281', order: { id: bindingAttestation.providerOrderId, currency: 'AED', amount: '123.45' }, response: { gatewayCode: 'APPROVED' }, timeOfRecord: AT, transaction: { type: 'PAYMENT', id: 'synthetic-transaction', amount: '123.45', currency: 'AED' } },
  ] };
  const env = { NODE_ENV: 'test', COMMERCE_LEDGER_ENABLED: 'true', COMMERCE_LEDGER_MAPPING_ID: mapping.id, NATIVE_MPGS_API_PASSWORD: 'synthetic-password', NATIVE_CSCART_API_USER: 'synthetic@example.invalid', NATIVE_CSCART_API_KEY: 'synthetic-key' };
  const fetchImpl = async (url, options) => { fetchCalls.push({ url, options }); assert.equal(options.method, 'GET');
    if (url.startsWith('https://ap-gateway.mastercard.com/')) return new Response(JSON.stringify(provider), { headers: { 'content-type': 'application/json' } });
    if (url === `https://maximussports.ae/api/2.0/orders/${native.nativeOrderId}`) return new Response(JSON.stringify({ order_id: native.nativeOrderId, company_id: native.companyId, payment_id: native.paymentMethodId, total: `${BigInt(native.cashTotalMinor) / 100n}.${(BigInt(native.cashTotalMinor) % 100n).toString().padStart(2, '0')}`, status: 'P', is_parent_order: 'N', parent_order_id: '0', products: Object.fromEntries(native.items.map((item, index) => [String(index), { product_id: item.productId, amount: item.quantity, product_options: {} }])), payment_info: { secrets: 'never-store-native-payment-info' } }), { headers: { 'content-type': 'application/json' } });
    assert.fail('unexpected network route');
  };
  async function register(ref = 'opaque-event-one', kind = 'capture', tx = 'synthetic-transaction') {
    references.set(ref, { status: 'verified', authenticationBasis: 'server_authenticated_addon_query', mappingHash: mapping.hash, mode: 'live', eventReference: ref, providerOrderId: bindingAttestation.providerOrderId, transactionId: tx, kind, evidenceId: `synthetic-reference-${kind}`, verifiedAt: AT });
    await registry.persistVerifiedReference(ref);
  }
  const runtime = extra => createNativeCommerceLedgerRuntime({ env, store, now, fetchImpl, loadCommerceOrder: async id => id === commercial.id ? structuredClone(commercial) : null, ...extra });
  return { store, mapping, rawMapping, registry, bindingAttestation, commercial, native, provider, env, references, register, runtime, fetchCalls, now };
}

test('disabled factory performs no store/credential/transport work and never provides a bridge', async () => {
  const result = await createNativeCommerceLedgerRuntime({ env: {}, store: { get() { assert.fail('disabled must not read'); } }, fetchImpl() { assert.fail('disabled must not fetch'); } });
  assert.equal(result.bridge, null); assert.equal(result.readiness.ready, false); assert.deepEqual(result.readiness.missing, ['server_bridge_not_enabled']);
});

test('store without a bounded binding index fails before runtime construction or transport', async () => {
  const f = await fixture(), store = { ...f.store, listIndex: undefined };
  const result = await f.runtime({ store });
  assert.equal(result.bridge, null); assert.equal(result.readiness.ready, false);
  assert.deepEqual(result.readiness.missing, ['durable_store']); assert.equal(f.fetchCalls.length, 0);
});

test('explicit scoped live/schema evidence and durable production store are required', async () => {
  const f = await fixture();
  assert.equal((await f.runtime()).readiness.ready, true);
  assert.equal(f.fetchCalls.length, 0);
  assert.equal((await f.runtime({ env: { ...f.env, NODE_ENV: 'production' } })).bridge, null);
  for (const field of ['liveModeEvidenceId', 'nativeMappingEvidenceId', 'customerBindingEvidenceId', 'providerSchemaEvidenceId']) {
    const row = await f.store.get('nativeCommerceEvidence', f.mapping[field]);
    await f.store.commit({ writes: [{ type: 'nativeCommerceEvidence', id: row.doc.id, expectedVersion: row.version, doc: { ...row.doc, status: 'unverified' } }] });
    const blocked = await f.runtime(); assert.equal(blocked.readiness.ready, false); assert.equal(blocked.bridge, null);
    const current = await f.store.get('nativeCommerceEvidence', row.doc.id);
    await f.store.commit({ writes: [{ type: 'nativeCommerceEvidence', id: row.doc.id, expectedVersion: current.version, doc: row.doc }] });
  }
  assert.equal((await f.runtime({ env: { ...f.env, NATIVE_MPGS_API_PASSWORD: undefined } })).readiness.ready, false);
  assert.equal(f.fetchCalls.length, 0);
});

test('current allowlisted merchant/store/method/AED/schema/company and explicit versions cannot be guessed', async () => {
  const f = await fixture();
  for (const [field, value] of [['mpgsApiVersion', undefined], ['cscartApiVersion', 'latest'], ['mappingMode', undefined], ['mode', 'test'], ['merchantId', 'historical-other-merchant'], ['currency', 'EUR'], ['paymentMethodId', '17'], ['companyId', '992'], ['mpgsOrigin', 'https://test-gateway.mastercard.com'], ['providerSchemaEvidenceId', undefined], ['mpgsSchema', 'guess']]) {
    assert.throws(() => normalizeNativeMapping({ ...f.rawMapping, [field]: value }, f.now()));
    assert.equal((await f.runtime({ mapping: { ...f.rawMapping, [field]: value } })).bridge, null);
  }
});

test('mapping hash covers schema/version and evidence records cannot be transplanted across scope', async () => {
  const f = await fixture(), different = { ...f.rawMapping, mpgsApiVersion: '98' };
  assert.notEqual(normalizeNativeMapping(different, f.now()).hash, f.mapping.hash);
  assert.equal((await f.runtime({ mapping: different })).bridge, null);
  const runtime = await f.runtime(); assert.equal(runtime.readiness.mappingHash, f.mapping.hash); assert.equal(runtime.readiness.source, 'cscart_mpgs');
});

test('trusted binding persists immutable snapshot and verified account; email is irrelevant', async () => {
  const f = await fixture();
  const result = await f.registry.persistVerifiedBinding('opaque-addon-binding');
  const d = (await f.store.get(NATIVE_BINDING_TYPES.binding, result.bindingId)).doc;
  assert.equal(d.customerUserId, USER); assert.equal(d.basis, 'immutable_commerce_customer');
  assert.match(d.immutableOrderRevisionId, /^snapshot_[0-9a-f]{64}$/);
  assert.equal(JSON.stringify(d).includes('@'), false); assert.equal(JSON.stringify(d).includes('contact'), false);
  assert.equal((await f.registry.persistVerifiedBinding('opaque-addon-binding')).duplicate, true);
});

test('no trusted resolver, guessed email binding or client-shaped claims can register an owner', async () => {
  const f = await fixture();
  await assert.rejects(f.registry.persistVerifiedBinding({ ...f.bindingAttestation }), { code: 'native_opaque_reference_invalid' });
  for (const [field, value] of [['authenticationBasis', 'client_email'], ['customerUserId', `usr_${'0'.repeat(19)}2`], ['mode', 'test'], ['kind', 'funding'], ['approval', 'draft'], ['cashTotalMinor', '12346']]) {
    const old = f.bindingAttestation[field]; f.bindingAttestation[field] = value;
    await assert.rejects(f.registry.persistVerifiedBinding('opaque-addon-binding')); f.bindingAttestation[field] = old;
  }
  const noVerifier = createNativeBindingRegistry({ store: f.store, mapping: f.mapping, readNativeOrder: async () => f.native, loadCommerceOrder: async () => f.commercial });
  await assert.rejects(noVerifier.persistVerifiedBinding('opaque'), { code: 'native_addon_binding_verifier_required' });
});

test('missing unique portal ownership, foreign tenant or inactive account cannot bind a native order', async () => {
  for (const [type, id, change] of [['portalOrder', ORDER, { organizationId: 'foreign' }], ['portalOrder', ORDER, { ownershipProof: 'email_match' }], ['user', USER, { status: 'unverified' }], ['portalMembership', `maximus-tennis_${USER}`, { organizationId: 'foreign' }]]) {
    const f = await fixture(), row = await f.store.get(type, id);
    await f.store.commit({ writes: [{ type, id, expectedVersion: row.version, doc: { ...row.doc, ...change } }] });
    await assert.rejects(f.registry.persistVerifiedBinding('opaque-addon-binding'));
    assert.equal(await f.store.countType(NATIVE_BINDING_TYPES.binding), 0);
  }
});

test('guest claim requires existing durable unique portal owner and cannot be reassigned', async () => {
  const f = await fixture(); f.commercial.snapshot.customerUserId = null;
  await f.registry.persistVerifiedBinding('opaque-addon-binding');
  assert.equal((await f.registry.readBinding(f.bindingAttestation.providerOrderId)).basis, 'durable_unique_portal_order_owner');
  const row = await f.store.get('portalOrder', ORDER);
  await f.store.commit({ writes: [{ type: 'portalOrder', id: ORDER, expectedVersion: row.version, doc: { ...row.doc, customerUserId: `usr_${'0'.repeat(19)}2` } }] });
  await assert.rejects(f.registry.readBinding(f.bindingAttestation.providerOrderId));
});

test('immutable binding rejects changed native amount and changed accepted commerce snapshot', async () => {
  const f = await fixture(); await f.registry.persistVerifiedBinding('opaque-addon-binding');
  f.native.cashTotalMinor = '12346'; await assert.rejects(f.registry.readBinding(f.bindingAttestation.providerOrderId), { code: 'native_binding_snapshot_changed' });
  f.native.cashTotalMinor = '12345'; f.commercial.snapshot.contact.email = 'changed-but-not-owner@example.invalid';
  await assert.rejects(f.registry.readBinding(f.bindingAttestation.providerOrderId), { code: 'native_binding_snapshot_changed' });
});

test('request-only, draft, TEST, wrong-price/currency and unapproved fulfillment cannot become approved goods', async () => {
  const changes = [s => { s.offer = null; }, s => { s.quotation = null; }, s => { s.offer.approved = false; }, s => { s.quotation.test = true; }, s => { s.quotation.number = 'TEST-QUOTE-synthetic'; }, s => { s.offer.currency = 'USD'; }, s => { s.quotation.currency = 'USD'; }, s => { s.offer.totalMinor++; }, s => { s.quotation.totalMinor++; }, s => { s.technical.final = false; }, s => { s.fulfillment.verified = false; }, s => { s.configuration.racquetsTotal = 2; }, s => { s.quotation.orderId = `MX-ORD-${'d'.repeat(32)}`; }];
  for (const change of changes) {
    const f = await fixture(); change(f.commercial.snapshot);
    await assert.rejects(f.registry.persistVerifiedBinding('opaque-addon-binding'));
    assert.equal(await f.store.countType(NATIVE_BINDING_TYPES.binding), 0);
  }
  for (const change of [p => { p.status = 'awaiting_quote'; }, p => { p.termsAcceptedAt = undefined; }, p => { p.termsVersion = 'not-accepted-terms'; }]) {
    const f = await fixture(); change(f.commercial.payment);
    await assert.rejects(f.registry.persistVerifiedBinding('opaque-addon-binding'), { code: 'native_approved_goods_contract_required' });
  }
});

test('coherent changed commercial total still cannot claim a differently priced native order', async () => {
  const f = await fixture();
  f.commercial.snapshot.offer.totalMinor = 13000; f.commercial.snapshot.offer.productMinor = 12655;
  f.commercial.snapshot.quotation.totalMinor = 13000; f.commercial.snapshot.quotation.items[0].unitPriceMinor = 13000; f.commercial.snapshot.quotation.items[0].lineTotalMinor = 13000;
  await assert.rejects(f.registry.persistVerifiedBinding('opaque-addon-binding'), { code: 'native_addon_binding_scope_mismatch' });
});

test('wrong native SKU, quantity, options or missing config mapping cannot bind approved goods', async () => {
  for (const change of [f => { f.bindingAttestation.itemBindings[0].nativeProductId = '99992'; }, f => { f.native.items[0].quantity = '2'; f.bindingAttestation.itemBindings[0].quantity = '2'; }, f => { f.native.items[0].optionsHash = hashPayload({ syntheticOption: 'other-variant' }); }, f => { f.bindingAttestation.itemBindings[0].commerceConfigurationHash = hashPayload({ other: 'configuration' }); }, f => { f.bindingAttestation.itemBindings = undefined; }]) {
    const f = await fixture(); change(f);
    await assert.rejects(f.registry.persistVerifiedBinding('opaque-addon-binding'));
    assert.equal(await f.store.countType(NATIVE_BINDING_TYPES.binding), 0);
  }
});

test('fresh independent reference verification remains idempotent for same economic identity', async () => {
  const f = await fixture(); await f.registry.persistVerifiedBinding('opaque-addon-binding'); await f.register();
  const a = f.references.get('opaque-event-one'); a.verifiedAt = '2026-10-10T23:59:59.000Z'; a.evidenceId = 'synthetic-new-independent-query';
  assert.equal((await f.registry.persistVerifiedReference('opaque-event-one')).duplicate, true);
  const ref = await f.registry.readReference('opaque-event-one');
  assert.equal(ref.verifiedAt, AT); assert.equal(ref.evidenceId, 'synthetic-reference-capture');
});

test('MPGS transaction IDs scoped to different orders never collide in the ledger', async () => {
  const f = await fixture(); await f.registry.persistVerifiedBinding('opaque-addon-binding'); await f.register();
  const { bridge } = await f.runtime(); await bridge.consumeReference('opaque-event-one');
  const second = `MX-ORD-${'d'.repeat(32)}`;
  f.commercial.id = second; f.commercial.snapshot.quotation.orderId = second;
  f.bindingAttestation.commerceOrderId = second; f.bindingAttestation.providerOrderId = 'synthetic-provider-order-two'; f.bindingAttestation.nativeOrderId = '902'; f.native.nativeOrderId = '902';
  f.provider.id = f.bindingAttestation.providerOrderId; f.provider.transaction[0].order.id = f.provider.id;
  await f.store.commit({ writes: [{ type: 'portalOrder', id: second, expectedVersion: -1, doc: { id: second, projectId: 'tennis', organizationId: 'maximus-tennis', customerUserId: USER, ownershipProof: 'verified_session_and_order_capability' } }], uniques: [{ name: 'portal_order_owner', value: `tennis:${second}`, owner: USER }] });
  await f.registry.persistVerifiedBinding('opaque-addon-binding'); await f.register('opaque-second-event');
  await bridge.consumeReference('opaque-second-event'); assert.equal(await f.store.countType('ledgerJournal'), 2);
});

test('concurrent binding is idempotent and a different provider cannot reuse native or MX order', async () => {
  const f = await fixture();
  const results = await Promise.all(Array.from({ length: 8 }, () => f.registry.persistVerifiedBinding('opaque-addon-binding')));
  assert.equal(results.filter(r => !r.duplicate).length, 1); assert.equal(await f.store.countType(NATIVE_BINDING_TYPES.binding), 1);
  f.bindingAttestation.providerOrderId = 'synthetic-other-provider';
  await assert.rejects(f.registry.persistVerifiedBinding('opaque-addon-binding'), { code: 'native_binding_conflict' });
});

test('unknown reference never reaches any merchant query and reference claims cannot be overwritten', async () => {
  const f = await fixture(); await f.registry.persistVerifiedBinding('opaque-addon-binding');
  const { bridge } = await f.runtime();
  await assert.rejects(bridge.enqueueReference('https://evil.invalid/provider-order'), { code: 'native_event_reference_not_registered' });
  assert.equal(f.fetchCalls.length, 0);
  await f.register(); assert.equal((await f.registry.persistVerifiedReference('opaque-event-one')).duplicate, true);
  f.references.get('opaque-event-one').transactionId = 'synthetic-other-transaction';
  await assert.rejects(f.registry.persistVerifiedReference('opaque-event-one'), { code: 'native_reference_conflict' });
});

test('actual GET projections drive durable capture once and expose no PAN/processor body', async () => {
  const f = await fixture(); await f.registry.persistVerifiedBinding('opaque-addon-binding'); await f.register();
  const { bridge, readiness } = await f.runtime(); assert.equal(readiness.ready, true);
  await bridge.consumeReference('opaque-event-one'); await bridge.consumeReference('opaque-event-one');
  assert.equal(await f.store.countType('ledgerJournal'), 1);
  const reader = createLedgerService({ store: f.store, now: f.now, authorizeRead: async () => true, resolveVerifiedEvent: async () => null, loadOrder: async () => null });
  const summary = await reader.readClientSummary({ ctx: { userId: USER }, projectId: 'tennis', customerId: USER });
  assert.equal(summary.currencies[0].capturedMinor, '12345'); assert.equal(summary.currencies[0].myDeposit.returnablePrincipalMinor, '0'); assert.equal(summary.currencies[0].myBonus.accruedMinor, '0');
  const journal = await reader.readClientJournal({ ctx: { userId: USER }, projectId: 'tennis', customerId: USER });
  for (const value of ['synthetic-never-store-pan', 'never-store-native-payment-info', 'synthetic-password', 'synthetic-key']) assert.equal(JSON.stringify(journal).includes(value), false);
  assert.ok(f.fetchCalls.every(c => c.options.method === 'GET' && !c.options.body));
});

test('refund independently queries transaction and totals, with no financial programme posting', async () => {
  const f = await fixture(); await f.registry.persistVerifiedBinding('opaque-addon-binding'); await f.register();
  const { bridge } = await f.runtime(); await bridge.consumeReference('opaque-event-one');
  f.provider.totalRefundedAmount = '23.45'; f.provider.transaction.push({ result: 'SUCCESS', merchant: '300281', order: { id: f.provider.id, currency: 'AED', amount: '123.45' }, response: { gatewayCode: 'APPROVED' }, timeOfRecord: AT, transaction: { id: 'synthetic-refund', type: 'REFUND', amount: '23.45', currency: 'AED' } });
  await f.register('opaque-refund', 'refund', 'synthetic-refund'); await bridge.consumeReference('opaque-refund');
  const reader = createLedgerService({ store: f.store, now: f.now, authorizeRead: async () => true, resolveVerifiedEvent: async () => null, loadOrder: async () => null });
  const summary = (await reader.readClientSummary({ ctx: { userId: USER }, projectId: 'tennis', customerId: USER })).currencies[0];
  assert.equal(summary.refundedMinor, '2345'); assert.equal(summary.netCapturedMinor, '10000'); assert.equal(summary.myBonus.accruedMinor, '0');
});

test('provider amount mismatch and changed native payment configuration cannot enqueue payment', async () => {
  const f = await fixture(); await f.registry.persistVerifiedBinding('opaque-addon-binding'); await f.register();
  f.provider.amount = '120.00'; f.provider.totalCapturedAmount = '120.00'; f.provider.transaction[0].transaction.amount = '120.00'; f.provider.transaction[0].order.amount = '120.00';
  const { bridge } = await f.runtime();
  await assert.rejects(bridge.enqueueReference('opaque-event-one'), { code: 'native_provider_order_amount_mismatch' });
  f.provider.amount = '123.45'; f.provider.totalCapturedAmount = '123.45'; f.provider.transaction[0].transaction.amount = '123.45'; f.provider.transaction[0].order.amount = '123.45'; f.native.paymentMethodId = '17';
  await assert.rejects(bridge.enqueueReference('opaque-event-one'), { code: 'native_cscart_order_scope_mismatch' });
  assert.equal(await f.store.countType('ledgerJournal'), 0); assert.equal(await f.store.countType('commerceLedgerInbox'), 0);
});

test('source-only runtime does not silently create evidence, mappings, identities or test fallback', async () => {
  const store = createMemoryStore();
  const r = await createNativeCommerceLedgerRuntime({ env: { COMMERCE_LEDGER_ENABLED: 'true', NODE_ENV: 'test' }, store, fetchImpl() { assert.fail('no live config must not call'); } });
  assert.equal(r.bridge, null); assert.deepEqual(r.readiness.missing, ['verified_live_native_mapping']);
  for (const type of ['nativeCommerceEvidence', 'nativeCommerceMapping', 'user', 'ledgerJournal']) assert.equal(await store.countType(type), 0);
});

test('scoped binding index and authenticated GET references work without an addon event publisher', async () => {
  const f = await fixture(); await f.registry.persistVerifiedBinding('opaque-addon-binding');
  const page = await f.registry.listBindings({ limit: 1 }); assert.equal(page.items.length, 1); assert.equal(page.nextOffset, 1);
  assert.equal((await f.registry.listBindings({ offset: 1, limit: 1 })).nextOffset, null);
  const binding = page.items[0];
  for (const marker of [USER, ORDER, '@', 'cashTotalMinor']) assert.equal(JSON.stringify(binding).includes(marker), false);
  const ref = await f.registry.registerQueriedMovement({ binding, transactionId: 'synthetic-transaction', kind: 'capture', amountMinor: '1', customerUserId: 'client-claim-is-ignored' });
  assert.match(ref.eventReference, /^np_[0-9a-f]{64}$/);
  assert.equal((await f.registry.registerQueriedMovement({ binding, transactionId: 'synthetic-transaction', kind: 'capture' })).duplicate, true);
  const registered = await f.registry.readReference(ref.eventReference); assert.equal(registered.authenticationBasis, 'provider_server_query');
  const { bridge } = await f.runtime(); await bridge.consumeReference(ref.eventReference); assert.equal(await f.store.countType('ledgerJournal'), 1);
  await assert.rejects(f.registry.registerQueriedMovement({ binding: { ...binding, mappingHash: 'f'.repeat(64) }, transactionId: 'synthetic-transaction', kind: 'capture' }), { code: 'native_poll_binding_scope_mismatch' });
  await assert.rejects(f.registry.registerQueriedMovement({ binding, transactionId: 'nonexistent', kind: 'capture' }), { code: 'native_mpgs_transaction_missing_or_ambiguous' });
});

test('ascending binding pages retain older entries when new bindings are appended between pages', async () => {
  const f = await fixture();
  await f.registry.persistVerifiedBinding('opaque-addon-binding');
  async function append(idChar, nativeOrderId, providerOrderId) {
    const commerceOrderId = `MX-ORD-${idChar.repeat(32)}`;
    f.commercial.id = commerceOrderId; f.commercial.snapshot.quotation.orderId = commerceOrderId;
    f.native.nativeOrderId = nativeOrderId;
    Object.assign(f.bindingAttestation, { commerceOrderId, nativeOrderId, providerOrderId });
    await f.store.commit({ writes: [{ type: 'portalOrder', id: commerceOrderId, expectedVersion: -1,
      doc: { id: commerceOrderId, projectId: 'tennis', organizationId: 'maximus-tennis', customerUserId: USER, ownershipProof: 'verified_session_and_order_capability' } }],
      uniques: [{ name: 'portal_order_owner', value: `tennis:${commerceOrderId}`, owner: USER }] });
    await f.registry.persistVerifiedBinding('opaque-addon-binding');
  }
  await append('d', '902', 'synthetic-second-binding');
  const first = await f.registry.listBindings({ limit: 1 });
  assert.equal(first.items[0].providerOrderId, 'synthetic-provider-order');
  await append('e', '903', 'synthetic-third-binding');
  const second = await f.registry.listBindings({ offset: first.nextOffset, limit: 1 });
  assert.equal(second.items[0].providerOrderId, 'synthetic-second-binding');
  await append('f', '904', 'synthetic-fourth-binding');
  const third = await f.registry.listBindings({ offset: second.nextOffset, limit: 2 });
  assert.deepEqual(third.items.map(item => item.providerOrderId), ['synthetic-third-binding', 'synthetic-fourth-binding']);
});

test('runtime poller finds a capture, durably queues opaque reference and worker reconciles once', async () => {
  const f = await fixture(); await f.registry.persistVerifiedBinding('opaque-addon-binding');
  const secret = 'synthetic-api-poll-worker-secret';
  const deps = { env: { ...f.env, CRON_SECRET: secret }, store: f.store, now: f.now, runtimeFactory: args => f.runtime(args) };
  const request = () => new Request('https://synthetic.invalid/api/ledger/worker', { headers: { authorization: `Bearer ${secret}` } });
  const first = await handleLedgerWorkerRequest(request(), 'retry', deps); assert.equal(first.status, 200);
  assert.equal(await f.store.countType(NATIVE_BINDING_TYPES.reference), 1); assert.equal(await f.store.countType('ledgerJournal'), 1);
  const second = await handleLedgerWorkerRequest(request(), 'retry', deps); assert.equal(second.status, 200); assert.equal(await f.store.countType('ledgerJournal'), 1);
  assert.ok(f.fetchCalls.every(call => call.options.method === 'GET'));
});

test('protected HTTP delivery and scheduler use the actual native factory and post one verified goods journal', async () => {
  const f = await fixture(); await f.registry.persistVerifiedBinding('opaque-addon-binding'); await f.register();
  const secret = 'synthetic-native-worker-secret';
  const deps = { env: { ...f.env, CRON_SECRET: secret }, store: f.store, now: f.now, runtimeFactory: args => f.runtime(args) };
  const post = () => new Request('https://synthetic.invalid/api/ledger/event-reference', { method: 'POST', headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' }, body: JSON.stringify({ eventReference: 'opaque-event-one' }) });
  const accepted = await handleLedgerWorkerRequest(post(), 'event-reference', deps);
  assert.equal(accepted.status, 202); assert.equal((await accepted.json()).status, 'accepted');
  assert.equal((await handleLedgerWorkerRequest(post(), 'event-reference', deps)).status, 202);
  const cron = await handleLedgerWorkerRequest(new Request('https://synthetic.invalid/api/ledger/worker', { headers: { authorization: `Bearer ${secret}` } }), 'retry', deps);
  assert.equal(cron.status, 200); assert.equal(await f.store.countType('ledgerJournal'), 1);
  assert.ok(f.fetchCalls.length >= 3); assert.ok(f.fetchCalls.every(call => call.options.method === 'GET' && call.options.body === undefined));
  const reply = JSON.stringify(await cron.json());
  for (const privateValue of [USER, ORDER, 'synthetic-never-store-pan', 'synthetic-password', 'opaque-event-one']) assert.equal(reply.includes(privateValue), false);
});

test('native Redis preserves binding uniqueness and capture idempotence across factory reconstruction', async t => {
  let redis, rest;
  try {
    try { redis = await startTestRedis(6397); rest = await startBridge({ redisPort: 6397, token: 'native-binding-synthetic-local-only' }); }
    catch (error) { if (process.env.INTAKE_REQUIRE_REDIS === '1' || !['ENOENT', 'EACCES', 'EPERM'].includes(error.code)) throw error; return t.skip(`native Redis unavailable: ${error.code}`); }
    const store = createUpstashStore({ url: rest.url, token: 'native-binding-synthetic-local-only' });
    const f = await fixture(store);
    const results = await Promise.all(Array.from({ length: 6 }, () => f.registry.persistVerifiedBinding('opaque-addon-binding')));
    assert.equal(results.filter(row => !row.duplicate).length, 1);
    await f.register();
    const first = await f.runtime({ env: { ...f.env, NODE_ENV: 'production' } }); assert.equal(first.readiness.ready, true);
    await first.bridge.consumeReference('opaque-event-one');
    const rebuilt = await f.runtime({ env: { ...f.env, NODE_ENV: 'production' } });
    const queued = await rebuilt.bridge.enqueueReference('opaque-event-one'); assert.equal(queued.duplicate, true);
    const result = await rebuilt.bridge.processWork(queued.workId); assert.equal(result.duplicate, true);
    const reader = createLedgerService({ store, now: f.now, authorizeRead: async () => true, resolveVerifiedEvent: async () => null, loadOrder: async () => null });
    const journal = await reader.readClientJournal({ ctx: { userId: USER }, projectId: 'tennis', customerId: USER }); assert.equal(journal.items.length, 1);
    f.bindingAttestation.providerOrderId = 'synthetic-conflicting-provider';
    await assert.rejects(f.registry.persistVerifiedBinding('opaque-addon-binding'), { code: 'native_binding_conflict' });
  } finally { rest?.close(); await redis?.close(); }
});
