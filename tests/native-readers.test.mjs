/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeMpgsReader, NATIVE_MPGS_SCHEMA } from '../lib/platform/native-mpgs.js';
import { createNativeCsCartOrderReader, NATIVE_CSCART_SCHEMA } from '../lib/platform/native-cscart.js';
import { nativeMinor } from '../lib/platform/native-read-http.js';
import { hashPayload } from '../lib/platform/ids.js';

const AT = '2026-10-11T00:00:00.000Z';
const MPGS = { origin: 'https://ap-gateway.mastercard.com', merchantId: '300281', apiVersion: '99', schema: NATIVE_MPGS_SCHEMA, password: 'synthetic-password-only', now: () => Date.parse(AT) };
const CSCART = { origin: 'https://maximussports.ae', apiVersion: '2.0', companyId: '991', schema: NATIVE_CSCART_SCHEMA, user: 'synthetic@example.invalid', key: 'synthetic-api-key' };
const request = { providerOrderId: 'synthetic-order-one', transactionId: 'synthetic-tx-one', kind: 'capture' };
const mpgsOrder = () => ({ result: 'SUCCESS', id: request.providerOrderId, merchant: '300281', currency: 'AED', amount: '123.45', totalCapturedAmount: '123.45', totalRefundedAmount: '0.00', status: 'CAPTURED',
  transaction: [{ result: 'SUCCESS', merchant: '300281', order: { id: request.providerOrderId, currency: 'AED', amount: '123.45' }, response: { gatewayCode: 'APPROVED' }, timeOfRecord: AT, transaction: { id: request.transactionId, type: 'PAYMENT', currency: 'AED', amount: '123.45' } }] });
const nativeOrder = () => ({ order_id: '901', company_id: '991', payment_id: '18', total: '123.45', status: 'P', is_parent_order: 'N', parent_order_id: '0', products: { synthetic: { product_id: '99991', amount: '1', product_options: {} } }, email: 'private@example.invalid', payment_info: { card: 'must-never-leave-reader' }, payment_method: { processor_params: { password: 'must-never-leave-reader' } } });
const json = raw => new Response(typeof raw === 'string' ? raw : JSON.stringify(raw), { headers: { 'content-type': 'application/json' } });

test('MPGS performs exact authenticated GET and exposes only scalar movement evidence', async () => {
  let observed;
  const raw = mpgsOrder(); raw.sourceOfFunds = { card: { number: 'synthetic-private-card-marker' } }; raw.session = { id: 'synthetic-private-session' };
  const reader = createNativeMpgsReader({ ...MPGS, fetchImpl: async (url, options) => { observed = { url, options }; return json(raw); } });
  const evidence = await reader.readMovement(request);
  assert.equal(observed.url, 'https://ap-gateway.mastercard.com/api/rest/version/99/merchant/300281/order/synthetic-order-one');
  assert.equal(observed.options.method, 'GET'); assert.equal(observed.options.body, undefined); assert.equal(observed.options.redirect, 'manual'); assert.equal(observed.options.credentials, 'omit');
  assert.equal(observed.options.headers.Authorization, `Basic ${Buffer.from('merchant.300281:synthetic-password-only').toString('base64')}`);
  assert.equal(evidence.amountMinor, '12345'); assert.equal(evidence.totalMinor, '12345'); assert.equal(evidence.occurredAt, AT);
  for (const privateValue of ['synthetic-private-card-marker', 'synthetic-private-session', 'synthetic-password-only', 'sourceOfFunds', 'response']) assert.equal(JSON.stringify(evidence).includes(privateValue), false);
});

test('numeric financial JSON tokens retain original precision before projection', async () => {
  const raw = JSON.stringify(mpgsOrder()).replaceAll('"123.45"', '123.45').replace('"0.00"', '0.00');
  const reader = createNativeMpgsReader({ ...MPGS, fetchImpl: async () => json(raw) });
  assert.equal((await reader.readMovement(request)).amountMinor, '12345');
  const huge = '9007199254740993.01';
  assert.equal(nativeMinor(huge), '900719925474099301');
  const veryLarge = raw.replaceAll('123.45', huge);
  assert.equal((await createNativeMpgsReader({ ...MPGS, fetchImpl: async () => json(veryLarge) }).readMovement(request)).amountMinor, '900719925474099301');
  for (const value of [123.45, '1e2', '-1', '1.001', '01.00', 'NaN']) assert.throws(() => nativeMinor(value), { code: 'native_amount_invalid' });
});

test('Paid/status alone, authorization, partial capture and decline cannot establish a capture', async () => {
  for (const change of [raw => { raw.transaction = []; }, raw => { raw.transaction[0].transaction.type = 'AUTHORIZATION'; }, raw => { raw.totalCapturedAmount = '100.00'; }, raw => { raw.transaction[0].response.gatewayCode = 'DECLINED'; }, raw => { raw.transaction[0].result = 'PENDING'; }, raw => { raw.transaction[0].transaction.amount = '100.00'; }]) {
    const raw = mpgsOrder(); change(raw); raw.status = 'PAID';
    await assert.rejects(createNativeMpgsReader({ ...MPGS, fetchImpl: async () => json(raw) }).readMovement(request));
  }
});

test('exact merchant/order/currency and one successful transaction are required', async () => {
  for (const change of [raw => { raw.merchant = 'other'; }, raw => { raw.id = 'other'; }, raw => { raw.currency = 'USD'; }, raw => { raw.transaction[0].transaction.currency = 'USD'; }, raw => { raw.transaction.push(structuredClone(raw.transaction[0])); }, raw => { raw.transaction[0].timeOfRecord = '2026-10-12T00:00:00Z'; }, raw => { raw.transaction[0].timeOfRecord = '2026-02-30T00:00:00Z'; }, raw => { raw.liveMode = false; }, raw => { raw.test = true; }]) {
    const raw = mpgsOrder(); change(raw);
    await assert.rejects(createNativeMpgsReader({ ...MPGS, fetchImpl: async () => json(raw) }).readMovement(request));
  }
});

test('refund uses independently approved REFUND movement and bounded cumulative refund', async () => {
  const raw = mpgsOrder(); raw.totalRefundedAmount = '23.45'; raw.transaction[0].transaction.type = 'REFUND'; raw.transaction[0].transaction.amount = '23.45';
  const reader = createNativeMpgsReader({ ...MPGS, fetchImpl: async () => json(raw) });
  assert.equal((await reader.readMovement({ ...request, kind: 'refund' })).amountMinor, '2345');
  raw.totalRefundedAmount = '0.00';
  await assert.rejects(reader.readMovement({ ...request, kind: 'refund' }), { code: 'native_mpgs_movement_amount_invalid' });
  raw.totalRefundedAmount = '999.00';
  await assert.rejects(reader.readMovement({ ...request, kind: 'refund' }), { code: 'native_mpgs_totals_invalid' });
  await assert.rejects(reader.readMovement({ ...request, kind: 'chargeback' }), { code: 'native_movement_not_supported' });
});

test('dispute status is held for review rather than fabricated into a chargeback event', async () => {
  const raw = mpgsOrder(); raw.status = 'CHARGEBACK_PROCESSED';
  await assert.rejects(createNativeMpgsReader({ ...MPGS, fetchImpl: async () => json(raw) }).readMovement(request), { code: 'native_mpgs_dispute_requires_review' });
});

test('CS-Cart reads one specific order and drops payment_info, identity and processor settings', async () => {
  const calls = [];
  const reader = createNativeCsCartOrderReader({ ...CSCART, fetchImpl: async (url, options) => { calls.push({ url, options }); return json(nativeOrder()); } });
  assert.deepEqual(await reader.readOrder('901'), { nativeOrderId: '901', companyId: '991', paymentMethodId: '18', cashTotalMinor: '12345', items: [{ productId: '99991', quantity: '1', optionsHash: hashPayload({}) }], status: 'P', statusEvidence: 'configuration_only', providerOrderId: null, currency: null });
  assert.equal(calls[0].url, 'https://maximussports.ae/api/2.0/orders/901'); assert.equal(calls[0].options.method, 'GET');
  assert.equal(calls[0].options.headers.Authorization, `Basic ${Buffer.from('synthetic@example.invalid:synthetic-api-key').toString('base64')}`);
  for (const version of ['1.0', '2.0']) assert.doesNotThrow(() => createNativeCsCartOrderReader({ ...CSCART, apiVersion: version }));
});

test('CS-Cart refuses cross-store/method/parent/TEST orders regardless of status P', async () => {
  for (const change of [raw => { raw.order_id = '902'; }, raw => { raw.company_id = '992'; }, raw => { raw.payment_id = '17'; }, raw => { raw.is_parent_order = 'Y'; }, raw => { raw.parent_order_id = '900'; }, raw => { raw.mock = true; }, raw => { raw.mode = 'test'; }, raw => { raw.total = '0.00'; }]) {
    const raw = nativeOrder(); change(raw);
    await assert.rejects(createNativeCsCartOrderReader({ ...CSCART, fetchImpl: async () => json(raw) }).readOrder('901'));
  }
});

test('origin, route, credentials and version cannot be supplied through order identifiers', async () => {
  for (const origin of ['https://test-gateway.mastercard.com', 'https://ap-gateway.mastercard.com/', 'http://ap-gateway.mastercard.com', 'https://ap-gateway.mastercard.com.evil.invalid']) assert.throws(() => createNativeMpgsReader({ ...MPGS, origin }));
  for (const version of [undefined, 'latest', '../99', '099']) assert.throws(() => createNativeMpgsReader({ ...MPGS, apiVersion: version }));
  for (const id of ['../other', 'https://evil.invalid', 'id?mode=test', 'id#frag', 'a/b', '%2F']) await assert.rejects(createNativeMpgsReader({ ...MPGS, fetchImpl: () => { assert.fail('must not fetch'); } }).readMovement({ ...request, providerOrderId: id }));
  assert.throws(() => createNativeCsCartOrderReader({ ...CSCART, origin: 'https://maximussports.ae/' }));
});

test('HTTP errors, redirects, HTML and malformed JSON do not leak provider body or transport secrets', async () => {
  for (const response of [new Response('synthetic-private-error', { status: 401 }), new Response('synthetic-private-error', { status: 302, headers: { location: 'https://evil.invalid' } }), new Response('<html>synthetic-private-error</html>', { headers: { 'content-type': 'text/html' } }), json('not JSON synthetic-private-error')]) {
    await assert.rejects(createNativeMpgsReader({ ...MPGS, fetchImpl: async () => response }).readMovement(request), error => { assert.equal(JSON.stringify(error).includes('synthetic-private'), false); assert.equal(error.cause, undefined); return error.status === 503; });
  }
  await assert.rejects(createNativeMpgsReader({ ...MPGS, fetchImpl: async () => { throw new Error('synthetic-password-only Authorization raw PAN'); } }).readMovement(request), { code: 'native_read_network_error' });
});

test('response size, wrong returned origin and stalled body are bounded', async () => {
  await assert.rejects(createNativeMpgsReader({ ...MPGS, maxBodyBytes: 64, fetchImpl: async () => json(mpgsOrder()) }).readMovement(request), { code: 'native_body_too_large' });
  const response = json(mpgsOrder()); Object.defineProperty(response, 'url', { value: 'https://evil.invalid/order' });
  await assert.rejects(createNativeMpgsReader({ ...MPGS, fetchImpl: async () => response }).readMovement(request), { code: 'native_response_origin_invalid' });
  const hanging = new Response(new ReadableStream({ pull() { return new Promise(() => {}); }, cancel() { return new Promise(() => {}); } }), { headers: { 'content-type': 'application/json' } });
  const start = Date.now();
  await assert.rejects(createNativeMpgsReader({ ...MPGS, timeoutMs: 25, fetchImpl: async () => hanging }).readMovement(request), { code: 'native_read_timeout' });
  assert.ok(Date.now() - start < 1000);
});

test('shared worker AbortSignal stops a pending read without exposing transport details', async () => {
  const controller = new AbortController();
  const reader = createNativeMpgsReader({ ...MPGS, signal: controller.signal, fetchImpl: async () => new Promise(() => {}) });
  const pending = reader.readMovement(request); controller.abort();
  await assert.rejects(pending, { code: 'native_read_aborted' });
  await assert.rejects(reader.readMovement(request), { code: 'native_read_aborted' });
});

test('bounded authenticated GET discovery finds only approved capture/refund movements', async () => {
  const raw = mpgsOrder(); raw.totalRefundedAmount = '23.45';
  const refund = structuredClone(raw.transaction[0]); refund.transaction.id = 'synthetic-refund'; refund.transaction.type = 'REFUND'; refund.transaction.amount = '23.45';
  const declined = structuredClone(refund); declined.transaction.id = 'synthetic-declined'; declined.response.gatewayCode = 'DECLINED'; declined.result = 'FAILURE';
  const auth = structuredClone(raw.transaction[0]); auth.transaction.id = 'synthetic-auth'; auth.transaction.type = 'AUTHORIZATION';
  raw.transaction = [refund, declined, auth, raw.transaction[0]];
  let calls = 0;
  const reader = createNativeMpgsReader({ ...MPGS, fetchImpl: async () => { calls++; return json(raw); } });
  const movements = await reader.discoverMovements({ providerOrderId: request.providerOrderId });
  assert.equal(calls, 1); assert.deepEqual(movements.map(m => [m.kind, m.amountMinor]), [['capture', '12345'], ['refund', '2345']]);
  assert.equal(JSON.stringify(movements).includes('synthetic-declined'), false);
  await assert.rejects(reader.discoverMovements({ providerOrderId: request.providerOrderId, limit: 1 }), { code: 'native_discovery_requires_review' });
  for (const limit of [0, 21, NaN]) await assert.rejects(reader.discoverMovements({ providerOrderId: request.providerOrderId, limit }), { code: 'native_discovery_limit_invalid' });
});

test('polling discovery refuses disputed, ambiguous and partial capture histories', async () => {
  for (const change of [raw => { raw.status = 'DISPUTED'; }, raw => { raw.transaction.push(structuredClone(raw.transaction[0])); }, raw => { raw.totalCapturedAmount = '100.00'; raw.transaction[0].transaction.amount = '100.00'; }]) {
    const raw = mpgsOrder(); change(raw);
    await assert.rejects(createNativeMpgsReader({ ...MPGS, fetchImpl: async () => json(raw) }).discoverMovements({ providerOrderId: request.providerOrderId }));
  }
});

test('two distinct approved capture transactions cannot independently claim one full capture total', async () => {
  const raw = mpgsOrder(), another = structuredClone(raw.transaction[0]);
  another.transaction.id = 'synthetic-distinct-capture'; another.transaction.type = 'CAPTURE';
  raw.transaction.push(another);
  const reader = createNativeMpgsReader({ ...MPGS, fetchImpl: async () => json(raw) });
  await assert.rejects(reader.readMovement(request), { code: 'native_mpgs_multi_capture_requires_review' });
  await assert.rejects(reader.discoverMovements({ providerOrderId: request.providerOrderId }), { code: 'native_mpgs_multi_capture_requires_review' });
});

test('a successful voided refund cannot be masked by another refund in cumulative totals', async () => {
  const raw = mpgsOrder(); raw.totalRefundedAmount = '20.00';
  const refund = (id, amount) => { const tx = structuredClone(raw.transaction[0]); tx.transaction = { ...tx.transaction, id, type: 'REFUND', amount }; return tx; };
  const voided = refund('synthetic-void-refund-a', '10.00'); voided.transaction.type = 'VOID_REFUND';
  raw.transaction.push(refund('synthetic-refund-a', '10.00'), refund('synthetic-refund-b', '20.00'), voided);
  const reader = createNativeMpgsReader({ ...MPGS, fetchImpl: async () => json(raw) });
  await assert.rejects(reader.readMovement({ providerOrderId: request.providerOrderId, transactionId: 'synthetic-refund-a', kind: 'refund' }), { code: 'native_mpgs_history_requires_review' });
  await assert.rejects(reader.discoverMovements({ providerOrderId: request.providerOrderId }), { code: 'native_mpgs_history_requires_review' });
});

test('successful monetary voids, chargebacks, funding and unknown history require review before posting', async () => {
  for (const type of ['VOID_CAPTURE', 'VOID_PAYMENT', 'VOID_REFUND', 'CHARGEBACK', 'FUNDING', 'REFUND_REQUEST', 'UNKNOWN_FUTURE_MOVEMENT']) {
    const raw = mpgsOrder(), other = structuredClone(raw.transaction[0]); other.transaction.id = 'synthetic-unsupported'; other.transaction.type = type;
    raw.transaction.push(other);
    const reader = createNativeMpgsReader({ ...MPGS, fetchImpl: async () => json(raw) });
    await assert.rejects(reader.readMovement(request), { code: 'native_mpgs_history_requires_review' });
    await assert.rejects(reader.discoverMovements({ providerOrderId: request.providerOrderId }), { code: 'native_mpgs_history_requires_review' });
    other.result = 'FAILURE'; other.response.gatewayCode = 'DECLINED';
    assert.equal((await reader.readMovement(request)).amountMinor, '12345');
  }
});

test('all approved refund amounts must exactly match the independently returned cumulative total', async () => {
  const raw = mpgsOrder(), refundA = structuredClone(raw.transaction[0]), refundB = structuredClone(raw.transaction[0]);
  Object.assign(refundA.transaction, { id: 'synthetic-refund-a', type: 'REFUND', amount: '20.00' });
  Object.assign(refundB.transaction, { id: 'synthetic-refund-b', type: 'REFUND', amount: '20.00' });
  raw.transaction.push(refundA, refundB);
  const reader = createNativeMpgsReader({ ...MPGS, fetchImpl: async () => json(raw) });
  for (const aggregate of ['20.00', '30.00', '50.00']) {
    raw.totalRefundedAmount = aggregate;
    await assert.rejects(reader.readMovement({ providerOrderId: request.providerOrderId, transactionId: 'synthetic-refund-a', kind: 'refund' }), { code: 'native_mpgs_refund_history_requires_review' });
    await assert.rejects(reader.readMovement(request), { code: 'native_mpgs_refund_history_requires_review' });
    await assert.rejects(reader.discoverMovements({ providerOrderId: request.providerOrderId }), { code: 'native_mpgs_refund_history_requires_review' });
  }
  raw.totalRefundedAmount = '40.00';
  assert.equal((await reader.readMovement({ providerOrderId: request.providerOrderId, transactionId: 'synthetic-refund-a', kind: 'refund' })).amountMinor, '2000');
  assert.deepEqual((await reader.discoverMovements({ providerOrderId: request.providerOrderId })).map(m => m.amountMinor), ['12345', '2000', '2000']);
});
