/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTennisControlMpgsAdapter, TENNIS_CONTROL_MPGS_CONTRACT } from '../lib/platform/tennis-control-mpgs.js';
import { createNativeMpgsReader, createTennisControlMpgsReader, NATIVE_MPGS_SCHEMA } from '../lib/platform/native-mpgs.js';

const AT = Date.parse('2026-10-11T00:00:00.000Z');
const PROVIDER = `MC${'a'.repeat(32)}`;
const PASSWORD = 'SYNTHETIC-LOCAL-ONLY-NEVER-A-CREDENTIAL';
const REQUEST_URL = 'https://ap-gateway.mastercard.com/api/rest/version/100/merchant/300281/session';
const attempt = () => ({ orderId: `MX-CTL-${'b'.repeat(32)}`, providerOrderId: PROVIDER, correlation: `tcc_${'c'.repeat(43)}`, currency: 'USD', totalMinor: '100', kind: 'payment_control', scopeHash: 'd'.repeat(64), attemptedAt: AT, localSessionDeadline: new Date(AT + 900000).toISOString() });
const payload = () => ({ result: 'SUCCESS', session: { id: 'SESSIONsyntheticPrivateControl123', version: 'opaque-version-with-no-source-format' }, successIndicator: 'synthetic-private-indicator', sourceOfFunds: { private: 'synthetic-private-source' } });
const json = (value, options = {}) => new Response(typeof value === 'string' ? value : JSON.stringify(value), { status: 201, headers: { 'content-type': 'application/json' }, ...options });
const options = extra => ({ password: PASSWORD, merchantName: 'SYNTHETIC CONTROL MERCHANT', returnUrl: 'https://maximus.tennis/en/payment-control', cancelUrl: 'https://maximus.tennis/en/payment-control', now: () => AT, fetchImpl: async () => json(payload()), ...extra });

test('control initiation sends one pinned source-derived POST and returns only a private local receipt', async () => {
  const calls = [], a = attempt();
  const adapter = createTennisControlMpgsAdapter(options({ fetchImpl: async (url, init) => { calls.push({ url, init }); return json(payload()); } }));
  const result = await adapter.initiate({ attempt: a });
  assert.equal(calls.length, 1); assert.equal(calls[0].url, REQUEST_URL);
  const { init } = calls[0];
  assert.equal(init.method, 'POST'); assert.equal(init.redirect, 'manual'); assert.equal(init.credentials, 'omit'); assert.equal(init.cache, 'no-store');
  assert.deepEqual(init.headers, { Authorization: `Basic ${Buffer.from(`merchant.300281:${PASSWORD}`).toString('base64')}`, Accept: 'application/json', 'Content-Type': 'application/json' });
  assert.deepEqual(JSON.parse(init.body), { apiOperation: 'INITIATE_CHECKOUT', interaction: { operation: 'PURCHASE', returnUrl: 'https://maximus.tennis/en/payment-control', cancelUrl: 'https://maximus.tennis/en/payment-control', merchant: { name: 'SYNTHETIC CONTROL MERCHANT' } }, order: { id: PROVIDER, reference: PROVIDER, amount: '1.00', currency: 'USD', description: 'MAXIMUS payment verification control' }, transaction: { reference: PROVIDER } });
  assert.deepEqual(result, { contract: TENNIS_CONTROL_MPGS_CONTRACT, sessionId: payload().session.id, providerOrderId: PROVIDER, currency: 'USD', totalMinor: '100', correlation: a.correlation, verifiedAt: new Date(AT).toISOString(), localSessionDeadline: a.localSessionDeadline });
  for (const forbidden of ['sourceOfFunds', 'successIndicator', 'sessionVersion', 'expiresAt', 'providerExpiresAt', 'verified_live', 'currencyPermission', PASSWORD]) assert.equal(JSON.stringify(result).includes(forbidden), false);
});

test('HTTP200 is accepted without assuming optional version, indicator, bank expiry or renderer', async () => {
  const adapter = createTennisControlMpgsAdapter(options({ fetchImpl: async () => json({ result: 'SUCCESS', session: { id: payload().session.id } }, { status: 200 }) }));
  const result = await adapter.initiate({ attempt: attempt() });
  assert.equal(result.sessionId, payload().session.id); assert.equal(result.expiry, undefined); assert.equal(result.embedded, undefined);
});

test('missing explicit transport/credentials/name, browser and extra route configuration fail without default fetch', () => {
  let calls = 0; const savedFetch = globalThis.fetch;
  globalThis.fetch = () => { calls++; assert.fail('must not use global fetch'); };
  try {
    for (const field of ['fetchImpl', 'password', 'merchantName', 'returnUrl', 'cancelUrl']) assert.throws(() => createTennisControlMpgsAdapter(options({ [field]: undefined })));
    for (const extra of [{ apiVersion: '99' }, { origin: 'https://evil.invalid' }, { currency: 'AED' }, { merchantId: 'other' }, { password: 'unsafe\nheader' }, { merchantName: 'x'.repeat(41) }, { timeoutMs: 6001 }, { maxBodyBytes: 65537 }]) assert.throws(() => createTennisControlMpgsAdapter(options(extra)));
    globalThis.window = {};
    try { assert.throws(() => createTennisControlMpgsAdapter(options()), { code: 'tennis_control_mpgs_server_only' }); } finally { delete globalThis.window; }
    assert.equal(calls, 0);
  } finally { globalThis.fetch = savedFetch; }
});

test('return/cancel URLs reject preview wildcard, credentials, cross-origin and descriptor query data', () => {
  for (const url of ['https://preview.vercel.app/en/payment-control', 'https://maximus.tennis.evil.invalid/control', 'http://maximus.tennis/control', 'https://user:pass@maximus.tennis/control', 'https://maximus.tennis/control?session=private', 'https://maximus.tennis/control#private', 'https://maximus.tennis//control', 'https://maximus.tennis/a/../control']) {
    assert.throws(() => createTennisControlMpgsAdapter(options({ returnUrl: url })), { code: 'tennis_control_mpgs_return_unconfigured' });
    assert.throws(() => createTennisControlMpgsAdapter(options({ cancelUrl: url })), { code: 'tennis_control_mpgs_return_unconfigured' });
  }
});

test('exact control scope, amount, currency, references and fresh local deadline precede any POST', async () => {
  let calls = 0; const adapter = createTennisControlMpgsAdapter(options({ fetchImpl: async () => { calls++; return json(payload()); } }));
  for (const fields of [{ totalMinor: '101' }, { totalMinor: 100 }, { currency: 'AED' }, { currency: 'EUR' }, { kind: 'goods' }, { kind: 'deposit' }, { orderId: `MX-ORD-${'b'.repeat(32)}` }, { providerOrderId: '../other' }, { correlation: 'unbound' }, { scopeHash: 'bad' }, { attemptedAt: AT + 1 }, { localSessionDeadline: new Date(AT).toISOString() }, { localSessionDeadline: new Date(AT + 900001).toISOString() }, { sessionId: payload().session.id }]) await assert.rejects(adapter.initiate({ attempt: { ...attempt(), ...fields } }));
  await assert.rejects(adapter.initiate({ attempt: attempt(), amountMinor: '100' }));
  await assert.rejects(adapter.initiate({ attempt: attempt(), signal: {} }));
  assert.equal(calls, 0);
});

test('attempt fields are snapshotted before the transport await', async () => {
  const a = attempt();
  const adapter = createTennisControlMpgsAdapter(options({ fetchImpl: async () => { a.providerOrderId = 'caller-change'; a.correlation = 'caller-change'; return json(payload()); } }));
  const result = await adapter.initiate({ attempt: a }); assert.equal(result.providerOrderId, PROVIDER); assert.equal(result.correlation, attempt().correlation);
});

test('success requires bounded valid private session and no explicit test/mock state', async () => {
  for (const raw of [null, [], {}, { result: 'PENDING', session: payload().session }, { result: 'ERROR', error: { explanation: PASSWORD } }, { result: 'SUCCESS', session: { id: '' } }, { result: 'SUCCESS', session: { id: 'https://evil.invalid/session' } }, { ...payload(), test: true }, { ...payload(), mock: true }, { ...payload(), liveMode: false }, { ...payload(), mode: 'test' }]) {
    await assert.rejects(createTennisControlMpgsAdapter(options({ fetchImpl: async () => json(raw) })).initiate({ attempt: attempt() }), error => error.code === 'tennis_control_mpgs_session_invalid' && !JSON.stringify(error).includes(PASSWORD));
  }
});

test('HTTP errors, redirects, HTML and wrong response origin are redacted and never retried', async () => {
  const responses = [
    [() => new Response(PASSWORD, { status: 401 }), 'tennis_control_mpgs_http_error'],
    [() => new Response(PASSWORD, { status: 302, headers: { location: 'https://evil.invalid' } }), 'tennis_control_mpgs_redirect_forbidden'],
    [() => new Response(PASSWORD, { status: 200, headers: { 'content-type': 'text/html' } }), 'tennis_control_mpgs_content_type_invalid'],
    [() => { const r = json(payload()); Object.defineProperty(r, 'url', { value: 'https://evil.invalid/session' }); return r; }, 'tennis_control_mpgs_response_origin_invalid'],
    [() => { const r = json(payload()); Object.defineProperty(r, 'redirected', { value: true }); return r; }, 'tennis_control_mpgs_redirect_forbidden'],
  ];
  for (const [response, code] of responses) {
    let calls = 0; const adapter = createTennisControlMpgsAdapter(options({ fetchImpl: async () => { calls++; return response(); } }));
    await assert.rejects(adapter.initiate({ attempt: attempt() }), e => e.code === code && e.cause === undefined && !JSON.stringify(e).includes(PASSWORD)); assert.equal(calls, 1);
  }
});

test('declared and streamed body bounds, invalid UTF8/JSON and nonobject responses fail safely', async () => {
  for (const [response, expected] of [
    [() => json(payload(), { headers: { 'content-type': 'application/json', 'content-length': '999999' } }), 'tennis_control_mpgs_body_too_large'],
    [() => json({ ...payload(), extra: 'x'.repeat(1000) }), 'tennis_control_mpgs_body_too_large'],
    [() => new Response(new Uint8Array([0xff]), { status: 200, headers: { 'content-type': 'application/json' } }), 'tennis_control_mpgs_json_invalid'],
    [() => json('{badjson' + PASSWORD), 'tennis_control_mpgs_json_invalid'],
  ]) await assert.rejects(createTennisControlMpgsAdapter(options({ maxBodyBytes: 512, fetchImpl: async () => response() })).initiate({ attempt: attempt() }), { code: expected });
});

test('unknown initiation acknowledgement/fetch error is uncertain once with no spoofed error preservation', async () => {
  for (const error of [Error(PASSWORD), Object.assign(Error(PASSWORD), { code: 'tennis_control_mpgs_session_invalid', status: 503 })]) {
    let calls = 0; const adapter = createTennisControlMpgsAdapter(options({ fetchImpl: async () => { calls++; throw error; } }));
    await assert.rejects(adapter.initiate({ attempt: attempt() }), e => e.code === 'tennis_control_mpgs_transport_uncertain' && e.cause === undefined && !String(e).includes(PASSWORD)); assert.equal(calls, 1);
  }
});

test('transport and body deadlines cancel bounded work without an automatic replacement POST', async () => {
  for (const fetchImpl of [async () => new Promise(() => {}), async () => new Response(new ReadableStream({ pull() { return new Promise(() => {}); }, cancel() { return new Promise(() => {}); } }), { status: 200, headers: { 'content-type': 'application/json' } })]) {
    let calls = 0; const start = Date.now();
    const adapter = createTennisControlMpgsAdapter(options({ timeoutMs: 20, fetchImpl: async (...args) => { calls++; return fetchImpl(...args); } }));
    await assert.rejects(adapter.initiate({ attempt: attempt() }), { code: 'tennis_control_mpgs_timeout' }); assert.equal(calls, 1); assert.ok(Date.now() - start < 1000);
  }
});

test('preaborted and inflight signals never retry; expiry while response arrives does not invent bank TTL', async () => {
  const controller = new AbortController(); let calls = 0;
  const adapter = createTennisControlMpgsAdapter(options({ fetchImpl: async () => { calls++; return new Promise(() => {}); } }));
  const pending = adapter.initiate({ attempt: attempt(), signal: controller.signal }); controller.abort();
  await assert.rejects(pending, { code: 'tennis_control_mpgs_aborted' }); assert.equal(calls, 1);
  await assert.rejects(adapter.initiate({ attempt: attempt(), signal: controller.signal }), { code: 'tennis_control_mpgs_aborted' }); assert.equal(calls, 1);
  let now = AT;
  const late = createTennisControlMpgsAdapter(options({ now: () => now, fetchImpl: async () => { now = AT + 900000; return json(payload()); } }));
  await assert.rejects(late.initiate({ attempt: attempt() }), { code: 'tennis_control_mpgs_local_attempt_expired' });
});

const readRequest = { providerOrderId: PROVIDER, transactionId: 'synthetic-control-payment', kind: 'capture' };
function order(currency = 'USD') {
  return { result: 'SUCCESS', id: PROVIDER, merchant: '300281', currency, amount: '1.00', totalCapturedAmount: '1.00', totalRefundedAmount: '0.00', status: 'CAPTURED', transaction: [{ result: 'SUCCESS', merchant: '300281', order: { id: PROVIDER, currency, amount: '1.00' }, response: { gatewayCode: 'APPROVED' }, timeOfRecord: new Date(AT).toISOString(), transaction: { id: readRequest.transactionId, type: 'PAYMENT', currency, amount: '1.00' } }] };
}
const readOptions = raw => ({ origin: 'https://ap-gateway.mastercard.com', merchantId: '300281', apiVersion: '100', schema: NATIVE_MPGS_SCHEMA, password: PASSWORD, now: () => AT, fetchImpl: async () => json(raw, { status: 200 }) });

test('separate control reader verifies exact USD100 capture via injected authenticated GET', async () => {
  let observed; const raw = order(); raw.session = { id: 'private-session' };
  const reader = createTennisControlMpgsReader({ ...readOptions(raw), fetchImpl: async (url, init) => { observed = { url, init }; return json(raw, { status: 200 }); } });
  const receipt = await reader.readMovement(readRequest);
  assert.equal(receipt.currency, 'USD'); assert.equal(receipt.amountMinor, '100'); assert.equal(receipt.totalMinor, '100'); assert.equal(receipt.capturedMinor, '100');
  assert.equal(observed.url, `https://ap-gateway.mastercard.com/api/rest/version/100/merchant/300281/order/${PROVIDER}`); assert.equal(observed.init.method, 'GET'); assert.equal(observed.init.body, undefined); assert.equal(JSON.stringify(receipt).includes('private-session'), false);
});

test('original native reader remains AED-only including a caller currency override', async () => {
  for (const extra of [{}, { currency: 'USD' }]) await assert.rejects(createNativeMpgsReader({ ...readOptions(order()), ...extra }).readMovement(readRequest), { code: 'native_mpgs_order_mismatch' });
  const result = await createNativeMpgsReader(readOptions(order('AED'))).readMovement(readRequest); assert.equal(result.currency, 'AED');
  await assert.rejects(createTennisControlMpgsReader(readOptions(order('AED'))).readMovement(readRequest), { code: 'native_mpgs_order_mismatch' });
});

test('control reader requires explicit fetch/API100 and rejects non-control provider orders', async () => {
  for (const fields of [{ fetchImpl: undefined }, { apiVersion: '99' }]) assert.throws(() => createTennisControlMpgsReader({ ...readOptions(order()), ...fields }), { code: 'tennis_control_reader_unconfigured' });
  let calls = 0; const reader = createTennisControlMpgsReader({ ...readOptions(order()), fetchImpl: async () => { calls++; return json(order(), { status: 200 }); } });
  await assert.rejects(reader.readMovement({ ...readRequest, providerOrderId: 'native-goods-order' }), { code: 'native_identifier_invalid' }); assert.equal(calls, 0);
});

test('control reader rejects wrong total/partial capture/AUTHORIZED-only and mismatched currency', async () => {
  const changes = [r => { r.amount = '1.01'; r.totalCapturedAmount = '1.01'; r.transaction[0].order.amount = '1.01'; r.transaction[0].transaction.amount = '1.01'; }, r => { r.totalCapturedAmount = '0.99'; }, r => { r.status = 'AUTHORIZED'; r.transaction[0].transaction.type = 'AUTHORIZATION'; }, r => { r.transaction[0].response.gatewayCode = 'DECLINED'; }, r => { r.transaction[0].transaction.currency = 'AED'; }, r => { r.transaction[0].order.currency = 'AED'; }, r => { r.merchant = 'other'; }];
  for (const change of changes) { const raw = order(); change(raw); await assert.rejects(createTennisControlMpgsReader(readOptions(raw)).readMovement(readRequest)); }
  const emptyWrongTotal = order(); emptyWrongTotal.amount = '2.00'; emptyWrongTotal.transaction = [];
  await assert.rejects(createTennisControlMpgsReader(readOptions(emptyWrongTotal)).discoverMovements({ providerOrderId: PROVIDER }));
});

test('USD control refunds require full original capture and exact complete refund history', async () => {
  const raw = order(); raw.totalRefundedAmount = '0.25';
  const refund = structuredClone(raw.transaction[0]); refund.transaction = { id: 'synthetic-control-refund', type: 'REFUND', currency: 'USD', amount: '0.25' }; raw.transaction.push(refund);
  const reader = createTennisControlMpgsReader(readOptions(raw)), request = { ...readRequest, transactionId: refund.transaction.id, kind: 'refund' };
  const result = await reader.readMovement(request); assert.equal(result.amountMinor, '25'); assert.equal(result.refundedMinor, '25');
  assert.deepEqual((await reader.discoverMovements({ providerOrderId: PROVIDER })).map(m => [m.kind, m.currency]), [['capture', 'USD'], ['refund', 'USD']]);
  raw.totalCapturedAmount = '0.50'; await assert.rejects(createTennisControlMpgsReader(readOptions(raw)).readMovement(request), { code: 'native_mpgs_totals_invalid' });
  raw.totalCapturedAmount = '1.00'; raw.totalRefundedAmount = '0.50'; await assert.rejects(createTennisControlMpgsReader(readOptions(raw)).readMovement(request), { code: 'native_mpgs_refund_history_requires_review' });
});

test('USD control histories containing successful monetary voids/chargeback cannot become capture proof', async () => {
  for (const type of ['VOID_PAYMENT', 'VOID_CAPTURE', 'VOID_REFUND', 'CHARGEBACK', 'FUNDING']) {
    const raw = order(), unsupported = structuredClone(raw.transaction[0]); unsupported.transaction = { ...unsupported.transaction, id: 'synthetic-unsupported', type }; raw.transaction.push(unsupported);
    const reader = createTennisControlMpgsReader(readOptions(raw));
    await assert.rejects(reader.readMovement(readRequest), { code: 'native_mpgs_history_requires_review' }); await assert.rejects(reader.discoverMovements({ providerOrderId: PROVIDER }), { code: 'native_mpgs_history_requires_review' });
  }
});
