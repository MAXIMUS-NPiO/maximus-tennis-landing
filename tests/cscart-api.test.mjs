/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCsCartReadClient, inspectCsCartSelection, CS_CART_ORIGIN, CsCartReadError } from '../lib/commerce/cscart-api.js';
import { runCsCartInspection } from '../scripts/inspect-cscart.mjs';

const user = 'api-reader@example.invalid';
const key = 'MOCK-API-KEY-never-real-credentials';
const merchantSecret = 'MOCK-MPGS-PASSWORD-never-real-credentials';
const basic = Buffer.from(`${user}:${key}`).toString('base64');
const payment = { payment_id: '18', payment: 'VISA / MasterCard', status: 'A', company_id: '1',
  processor: 'Mastercard MPGS', processor_id: '99', processor_type: 'P',
  processor_params: { currency: 'AED', api_password: merchantSecret, merchant: 'PRIVATE-MERCHANT',
    api_key: key, processor_host: 'ap-gateway.mastercard.com' }, instructions: merchantSecret };
const store = { company_id: '1', company: 'MAXIMUS SPORTS DUBAI', status: 'A', storefront: 'maximussports.ae',
  secure_storefront: 'maximussports.ae', email: user, password: key, sensitive_unlisted: merchantSecret };
const product = { product_id: '123', product: 'MAXIMUS POWER', product_code: 'POWER-P15', company_id: '1',
  status: 'A', price: '2400.00', currency: 'AED', options_type: 'P', exceptions_type: 'F',
  full_description: merchantSecret, internal_api_key: key };
const options = { '4': { option_id: '4', product_id: '123', company_id: '1', option_name: 'Grip',
  option_type: 'S', required: 'Y', inventory: 'Y', status: 'A', description: merchantSecret,
  variants: { '11': { variant_id: '11', option_id: '4', variant_name: 'L5', modifier: '0.000', modifier_type: 'A',
    internal_key: key, absolute_path: merchantSecret } } } };
function json(value, init = {}) { return new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' }, ...init }); }
function fixture({ mutate, ...overrides } = {}) {
  const requests = [];
  const fetchImpl = async (url, opts) => {
    requests.push({ url, opts });
    const u = new URL(url);
    const path = u.pathname.replace('/api/2.0/', '').replace('/api/', '');
    const all = { 'payments/18': payment, 'stores/1': store, 'products/123': product, options };
    assert.ok(Object.hasOwn(all, path));
    if (path === 'options') assert.equal(u.search, '?product_id=123');
    return json(mutate ? mutate(path, structuredClone(all[path])) : all[path]);
  };
  return { requests, client: createCsCartReadClient({ user, key, storeId: 1, productIds: [123], fetchImpl, ...overrides }) };
}
function rejectsCode(promise, code) { return assert.rejects(promise, e => e instanceof CsCartReadError && e.code === code); }

test('native read probe uses only exact selected GET routes, Basic auth and a fixed HTTPS origin', async () => {
  const { client, requests } = fixture();
  const report = await inspectCsCartSelection(client, { declaredPrimaryCurrency: 'AED', now: new Date('2026-10-10T00:00:00Z') });
  assert.deepEqual(requests.map(r => new URL(r.url).pathname + new URL(r.url).search),
    ['/api/2.0/payments/18', '/api/2.0/stores/1', '/api/2.0/products/123', '/api/2.0/options?product_id=123']);
  for (const { url, opts } of requests) {
    assert.equal(new URL(url).origin, CS_CART_ORIGIN);
    assert.equal(opts.method, 'GET'); assert.equal(opts.redirect, 'manual'); assert.equal(opts.credentials, 'omit');
    assert.equal(opts.cache, 'no-store'); assert.equal(opts.headers.Authorization, `Basic ${basic}`);
    assert.equal(opts.headers.Accept, 'application/json'); assert.equal(opts.body, undefined);
  }
  assert.equal(report.payment.processorName, 'Mastercard MPGS');
  assert.equal(report.payment.configuredCurrency, 'AED');
  assert.equal(report.products[0].options[0].variants[0].name, 'L5');
  assert.equal(report.products[0].basePrice, '2400.00');
  assert.equal(report.readyForPayments, false);
  assert.equal(report.currencyMapping.primaryCurrencyVerified, false);
  assert.equal(report.currencyMapping.declarationEvidence, 'operator_declaration_not_api_verification');
  for (const forbidden of [key, user, basic, merchantSecret, 'PRIVATE-MERCHANT', 'ap-gateway.mastercard.com', 'processor_params":']) {
    assert.ok(!JSON.stringify(report).includes(forbidden), `unsafe output escaped: ${forbidden}`);
  }
});

test('selected products and credentials/origin limits fail before any network request', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return json(product); };
  const base = { user, key, storeId: 1, productIds: [123], fetchImpl };
  for (const origin of ['http://maximussports.ae', 'https://other.example', 'https://maximussports.ae.evil.example',
    'https://maximussports.ae:444', 'https://maximussports.ae/path', 'https://maximussports.ae?x=y',
    'https://api-reader:password@maximussports.ae', 'https://maximussports.ae/']) {
    assert.throws(() => createCsCartReadClient({ ...base, origin }), /cscart_origin_forbidden/);
  }
  for (const patch of [{ key: undefined }, { user: 'bad:login' }, { key: 'unsafe\nkey' }, { storeId: '../users' },
    { productIds: [] }, { productIds: [123, 123] }, { productIds: ['123?dispatch=orders.add'] },
    { timeoutMs: 30001 }, { maxBodyBytes: 1048577 }, { apiVersion: '../../users' }]) {
    assert.throws(() => createCsCartReadClient({ ...base, ...patch }), CsCartReadError);
  }
  const client = createCsCartReadClient(base);
  await rejectsCode(client.readProduct(124), 'cscart_product_forbidden');
  await rejectsCode(client.readProductOptions(124), 'cscart_product_forbidden');
  await rejectsCode(client.readProduct('123/../users'), 'cscart_id_invalid');
  assert.equal(calls, 0);
  assert.deepEqual(Object.keys(client).sort(), ['apiVersion', 'origin', 'readPayment18', 'readProduct', 'readProductOptions', 'readStore', 'selectedProductIds', 'selectedStoreId'].sort());
});

test('explicit API 1.0 choice uses documented single-object routes and never auto-retries', async () => {
  const { client, requests } = fixture({ apiVersion: '1.0' });
  await client.readPayment18();
  assert.equal(requests[0].url, 'https://maximussports.ae/api/payments/18');
  assert.equal(requests.length, 1);
});

test('redirects are refused without reading their body or following a Location', async () => {
  let reads = 0, calls = 0;
  const client = fixture({ fetchImpl: async () => { calls++; return { status: 302,
    headers: new Headers({ Location: `https://other.example/${key}` }),
    body: { getReader() { reads++; throw Error(merchantSecret); } } }; } }).client;
  await rejectsCode(client.readPayment18(), 'cscart_redirect_forbidden');
  assert.equal(reads, 0); assert.equal(calls, 1);
  // Response.url is read-only; define the injected transport's value explicitly.
  const injected = fixture({ fetchImpl: async () => { const r = json(payment); Object.defineProperty(r, 'url', { value: 'https://other.example/api/2.0/payments/18' }); return r; } }).client;
  await rejectsCode(injected.readPayment18(), 'cscart_response_origin_invalid');
});

test('HTTP and network failures never expose server text, request headers, cause or credentials', async () => {
  const client = fixture({ fetchImpl: async () => new Response(JSON.stringify({ error: key, merchant_password: merchantSecret }), { status: 401 }) }).client;
  await assert.rejects(client.readPayment18(), e => {
    assert.equal(e.status, 401); assert.equal(e.code, 'cscart_http_error');
    assert.ok(!e.stack.includes(key)); assert.equal(e.cause, undefined); assert.ok(!JSON.stringify(e).includes(merchantSecret)); return true;
  });
  const network = fixture({ fetchImpl: async () => { throw Error(`Authorization: Basic ${basic}; ${key}; ${merchantSecret}`); } }).client;
  await assert.rejects(network.readPayment18(), e => e.code === 'cscart_network_error' && !e.stack.includes(key) && !e.stack.includes(basic));
  assert.equal(new CsCartReadError(key).code, 'cscart_inspection_failed');
});

test('response byte limit catches both declared and streamed oversized bodies', async () => {
  let readerCalls = 0;
  const declared = fixture({ maxBodyBytes: 64, fetchImpl: async () => ({ status: 200,
    headers: new Headers({ 'Content-Type': 'application/json', 'Content-Length': '65' }),
    body: { getReader() { readerCalls++; throw Error(key); } } }) }).client;
  await rejectsCode(declared.readPayment18(), 'cscart_body_too_large'); assert.equal(readerCalls, 0);
  let cancelled = false;
  const streamed = fixture({ maxBodyBytes: 64, fetchImpl: async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(40)); controller.enqueue(new Uint8Array(30)); },
    cancel() { cancelled = true; },
  }), { headers: { 'Content-Type': 'application/json' } }) }).client;
  await rejectsCode(streamed.readPayment18(), 'cscart_body_too_large'); assert.equal(cancelled, true);
});

test('deadline bounds pending fetch and body reads and aborts/cancels the transport', async () => {
  let signal;
  const hangingFetch = fixture({ timeoutMs: 10, fetchImpl: async (_u, opts) => { signal = opts.signal; return new Promise(() => {}); } }).client;
  await rejectsCode(hangingFetch.readPayment18(), 'cscart_timeout'); assert.equal(signal.aborted, true);
  let cancelled = false;
  const hangingBody = fixture({ timeoutMs: 10, fetchImpl: async () => new Response(new ReadableStream({
    cancel() { cancelled = true; },
  }), { headers: { 'Content-Type': 'application/json' } }) }).client;
  await rejectsCode(hangingBody.readPayment18(), 'cscart_timeout'); assert.equal(cancelled, true);
});

test('wrong MIME, invalid JSON/UTF-8 and mismatched entity IDs are refused without response disclosure', async () => {
  for (const [response, code] of [[new Response(key), 'cscart_content_type_invalid'],
    [new Response(`{"password":"${key}"`, { headers: { 'Content-Type': 'application/json' } }), 'cscart_json_invalid'],
    [new Response(new Uint8Array([0xff]), { headers: { 'Content-Type': 'application/json' } }), 'cscart_json_invalid'],
    [json({ ...payment, payment_id: '16' }), 'cscart_payment_response_invalid']]) {
    await rejectsCode(fixture({ fetchImpl: async () => response }).client.readPayment18(), code);
  }
  await rejectsCode(fixture({ mutate: (path, v) => path === 'products/123' ? { ...v, product_id: '124' } : v }).client.readProduct(123), 'cscart_product_response_invalid');
});

test('explicit names are credential-redacted too and unreported currency is never inferred as AED', async () => {
  const { client } = fixture({ mutate: (path, v) => {
    if (path === 'payments/18') return { ...v, payment: `${key}\n${user}`, processor: `Mastercard MPGS ${basic}`, processor_params: { api_password: merchantSecret } };
    if (path === 'stores/1') return { ...v, company: `STORE ${encodeURIComponent(key)}` };
    if (path === 'products/123') return { ...v, product: key, product_code: user, currency: undefined };
    if (path === 'options') { v['4'].option_name = key; v['4'].variants['11'].variant_name = `${user}:${key}`; }
    return v;
  } });
  const report = await inspectCsCartSelection(client);
  for (const secret of [key, user, basic, merchantSecret, encodeURIComponent(key)]) assert.ok(!JSON.stringify(report).includes(secret));
  assert.match(report.payment.name, /\[redacted\]/); assert.equal(report.payment.configuredCurrency, null);
  assert.equal(report.products[0].reportedCurrency, null); assert.equal(report.currencyMapping.declaredPrimaryCurrency, null);
  assert.equal(report.readyForPayments, false);
});

test('product-specific option query rejects foreign product/variant bindings and accepts explicit global options', async () => {
  const wrongProduct = fixture({ mutate: (path, v) => { if (path === 'options') v['4'].product_id = '124'; return v; } }).client;
  await rejectsCode(wrongProduct.readProductOptions(123), 'cscart_option_product_mismatch');
  const wrongVariant = fixture({ mutate: (path, v) => { if (path === 'options') v['4'].variants['11'].option_id = '5'; return v; } }).client;
  await rejectsCode(wrongVariant.readProductOptions(123), 'cscart_variant_option_mismatch');
  const globalOption = fixture({ mutate: (path, v) => { if (path === 'options') v['4'].product_id = '0'; return v; } }).client;
  assert.equal((await globalOption.readProductOptions(123))[0].productId, 0);
});

test('CLI help and invalid/missing credentials perform no requests and never echo arguments or secrets', async () => {
  let calls = 0, out = '', err = '';
  const deps = { env: {}, fetchImpl: async () => { calls++; throw Error(key); }, write: x => { out += x; }, writeError: x => { err += x; } };
  assert.equal(await runCsCartInspection(['--help'], deps), 0);
  assert.match(out, /CS_CART_API_USER/);
  assert.equal(await runCsCartInspection(['--store-id', '1', '--product-id', '123'], deps), 1);
  assert.equal(JSON.parse(err).code, 'cscart_credentials_missing_or_invalid');
  err = '';
  assert.equal(await runCsCartInspection(['--api-key', key], deps), 1);
  assert.equal(JSON.parse(err).code, 'cscart_cli_arguments_invalid');
  assert.ok(!err.includes(key)); assert.equal(calls, 0);
});

test('CLI emits only sanitized metadata and typed errors, not raw processor response', async () => {
  let output = '', errors = '';
  const all = { 'payments/18': payment, 'stores/1': store, 'products/123': product, options };
  const deps = { env: { CS_CART_API_USER: user, CS_CART_API_KEY: key },
    fetchImpl: async url => json(all[new URL(url).pathname.replace('/api/2.0/', '')]),
    write: x => { output += x; }, writeError: x => { errors += x; } };
  assert.equal(await runCsCartInspection(['--store-id', '1', '--product-id', '123', '--primary-currency', 'AED'], deps), 0);
  const report = JSON.parse(output); assert.equal(report.readyForPayments, false); assert.equal(errors, '');
  for (const secret of [key, user, basic, merchantSecret]) assert.ok(!output.includes(secret));
  output = '';
  assert.equal(await runCsCartInspection(['--store-id', '1', '--product-id', '123'], { ...deps, fetchImpl: async () => { throw Error(key); } }), 1);
  assert.equal(JSON.parse(errors).code, 'cscart_network_error'); assert.equal(output, ''); assert.ok(!errors.includes(key));
});
