/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { site } from '../data/site.js';
import { canRequestTennisCheckout, createTennisCheckoutAttempt, loadTennisCheckout, readTennisCheckoutFragment, requestTennisCheckout, tennisCheckoutHref, tennisPurchaseReview, validateTennisCheckoutResult } from '../lib/client/tennis-checkout.js';

const AT = Date.parse('2026-10-11T00:00:00.000Z'), ORDER = `MX-ORD-${'a'.repeat(32)}`, OTHER = `MX-ORD-${'b'.repeat(32)}`;
const USER = `usr_${'0'.repeat(19)}1`, CSRF = 'synthetic-csrf-token-1234567890', capability = `1791676800000.${'a'.repeat(64)}`;
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
function order() {
  return { id: ORDER, snapshot: { schema: 1, projectId: 'tennis', customerUserId: USER, plan: 'A', paymentPreference: 'payment_link', technical: { final: true }, fulfillment: { verified: true },
    offer: { approved: true, evidence: 'synthetic-approved-offer', totalMinor: 12345, currency: 'AED', termsVersion: 'synthetic-terms-v1', termsText: 'Synthetic approved goods terms', expiresAt: '2026-10-12T00:00:00.000Z' },
    quotation: { number: 'SYNTHETIC-GOODS-QUOTE', test: false, status: 'quotation', orderId: ORDER, projectId: 'tennis', totalMinor: 12345, currency: 'AED', termsVersion: 'synthetic-terms-v1' } }, payment: { status: 'ready' }, invoice: null };
}
const ready = () => ({ code: 'checkout_ready', status: 'ready', checkoutPath: '/ru/checkout', checkoutHandle: `tco_${'a'.repeat(43)}`, expiresAt: '2026-10-11T01:00:00.000Z',
  embedded: { contract: 'mpgs_hosted_checkout_embedded_v1', serverVerified: true, sessionId: `SESSION${'a'.repeat(32)}`, gatewayOrigin: 'https://ap-gateway.mastercard.com', sdkVersion: '100' } });
const input = over => ({ orderId: ORDER, locale: 'ru', termsVersion: 'synthetic-terms-v1', idempotencyKey: 'synthetic-idempotency-one', csrfToken: CSRF, termsAccepted: true, ...over });

test('fragments accept only a bounded order and optional legacy capability, never browser-paid claims', () => {
  assert.deepEqual(readTennisCheckoutFragment(`#order=${ORDER}`), { orderId: ORDER });
  assert.deepEqual(readTennisCheckoutFragment(`#order=${ORDER}&access=${capability}`), { orderId: ORDER, accessToken: capability });
  for (const fragment of ['', '#paid=true', `#order=${ORDER}&paid=true`, `#order=${ORDER}&resultIndicator=approved`, `#order=${ORDER}&order=${OTHER}`, `#order=${ORDER}&access=${capability}&access=${capability}`, `#order=${ORDER}&access=forged`, '#order=../../private', '#order=' + 'a'.repeat(600)]) assert.equal(readTennisCheckoutFragment(fragment), null);
});

test('all 48 internal checkout links carry only the order fragment and never an access token', () => {
  for (const locale of site.locales) {
    const href = tennisCheckoutHref(locale, ORDER), url = new URL(href, 'https://maximus.tennis');
    assert.equal(url.origin, 'https://maximus.tennis'); assert.equal(url.pathname, `/${locale}/checkout`);
    assert.equal(url.search, ''); assert.equal(url.hash, `#order=${ORDER}`); assert.equal(href.includes(capability), false);
  }
  for (const locale of ['//external.example.invalid', '../private', 'unknown']) assert.throws(() => tennisCheckoutHref(locale, ORDER), { code: 'invalid_request' });
  assert.throws(() => tennisCheckoutHref('ru', 'forged-order'), { code: 'invalid_request' });
});

test('unchanged order/terms retain one idempotency key across retries and double clicks', () => {
  let calls = 0;
  const attempt = createTennisCheckoutAttempt(() => `synthetic-key-${++calls}`);
  const a = attempt.keyFor({ orderId: ORDER, termsVersion: 'terms-v1' });
  assert.equal(attempt.keyFor({ orderId: ORDER, termsVersion: 'terms-v1' }), a); assert.equal(calls, 1);
  assert.notEqual(attempt.keyFor({ orderId: ORDER, termsVersion: 'terms-v2' }), a);
  assert.notEqual(attempt.keyFor({ orderId: OTHER, termsVersion: 'terms-v2' }), a); assert.equal(calls, 3);
  assert.throws(() => createTennisCheckoutAttempt(() => 'bad').keyFor({ orderId: ORDER, termsVersion: 'terms-v1' }), { code: 'invalid_request' });
});

test('review keeps program interest separate from payment and preserves exact requested principal', () => {
  const principal = '99999999999999999999999999';
  assert.deepEqual(tennisPurchaseReview({}), { labelKey: 'goodsOnly', programPending: false });
  assert.deepEqual(tennisPurchaseReview({ purchaseIntent: 'goods_only', programRequest: { status: 'terms_requested', requestedPrincipalMinor: principal, currency: 'AED' } }), { labelKey: 'goodsOnly', programPending: false });
  const result = tennisPurchaseReview({ purchaseIntent: 'goods_with_program_interest', programRequest: { status: 'terms_requested', requestedPrincipalMinor: principal, currency: 'AED', enrolled: true, annualRate: '20%', cashDue: principal } });
  assert.deepEqual(result, { labelKey: 'goodsAndProgram', programPending: true, requestedPrincipalMinor: principal, currency: 'AED' });
  for (const change of [{ status: 'enrolled' }, { requestedPrincipalMinor: 12345 }, { requestedPrincipalMinor: '1.23' }, { requestedPrincipalMinor: '-123' }, { currency: 'UNKNOWN' }]) {
    assert.deepEqual(tennisPurchaseReview({ purchaseIntent: 'goods_with_program_interest', programRequest: { status: 'terms_requested', requestedPrincipalMinor: principal, currency: 'AED', ...change } }), { labelKey: 'goodsAndProgram', programPending: true });
  }
});

test('unapproved/TEST/draft/expired orders never offer a live payment action', () => {
  assert.equal(canRequestTennisCheckout(order(), AT), true);
  const mutations = [d => { d.snapshot.projectId = 'foreign'; }, d => { d.snapshot.plan = 'B'; }, d => { d.snapshot.offer.approved = false; }, d => { d.snapshot.offer.evidence = ''; }, d => { d.snapshot.offer.totalMinor = 0; }, d => { d.snapshot.offer.termsText = ''; }, d => { d.snapshot.technical.final = false; }, d => { d.snapshot.fulfillment.verified = false; }, d => { d.snapshot.paymentPreference = 'bank_wire'; }, d => { d.snapshot.quotation.test = true; }, d => { d.snapshot.quotation.number = 'TEST-QUOTE-synthetic'; }, d => { d.snapshot.quotation.termsVersion = 'different-terms'; }, d => { d.snapshot.quotation.orderId = OTHER; }, d => { d.payment.status = 'awaiting_quote'; }, d => { d.payment.status = 'paid'; }, d => { d.invoice = { test: true, number: 'TEST-INV-synthetic' }; }];
  for (const mutate of mutations) { const d = order(); mutate(d); assert.equal(canRequestTennisCheckout(d, AT), false); }
  assert.equal(canRequestTennisCheckout(order(), AT + 2 * 86400000), false);
});

test('checkout loads verified session first, then own order without capability or caller identity', async () => {
  const calls = [], abort = new AbortController();
  const result = await loadTennisCheckout(ORDER, { signal: abort.signal, fetchImpl: async (path, options) => {
    calls.push({ path, options });
    return path === '/api/accounts/session' ? json({ user: { id: USER, emailVerified: true, email: 'synthetic-never-return@example.invalid' }, csrfToken: CSRF, unrelatedSecret: 'synthetic-never-return' }) : json({ order: order() });
  } });
  assert.deepEqual(calls.map(c => c.path), ['/api/accounts/session', `/api/accounts/orders/${ORDER}`]);
  for (const { options } of calls) { assert.equal(options.credentials, 'same-origin'); assert.equal(options.mode, 'same-origin'); assert.equal(options.cache, 'no-store'); assert.equal(options.redirect, 'error'); assert.equal(options.referrerPolicy, 'no-referrer'); assert.equal(options.signal, abort.signal); assert.deepEqual(options.headers, {}); assert.equal(options.body, undefined); }
  assert.deepEqual(result.session, { userId: USER, csrfToken: CSRF }); assert.equal(JSON.stringify(result.session).includes('@'), false);
});

test('guest, unverified subject and malformed CSRF stop before any order request', async () => {
  for (const response of [json({}, 401), json({ user: { id: USER, emailVerified: false }, csrfToken: CSRF }), json({ user: { id: USER, emailVerified: true }, csrfToken: '' }), json({ user: { id: 'client-claimed-user', emailVerified: true }, csrfToken: CSRF })]) {
    let calls = 0;
    await assert.rejects(loadTennisCheckout(ORDER, { fetchImpl: async () => { calls++; return response; } }), { code: 'account_required' });
    assert.equal(calls, 1);
  }
});

test('wrong returned order, project or immutable owner is rejected despite HTTP200', async () => {
  for (const mutate of [d => { d.id = OTHER; }, d => { d.snapshot.projectId = 'foreign'; }, d => { d.snapshot.customerUserId = `usr_${'0'.repeat(19)}2`; }]) {
    const d = order(); mutate(d);
    await assert.rejects(loadTennisCheckout(ORDER, { fetchImpl: async path => path === '/api/accounts/session' ? json({ user: { id: USER, emailVerified: true }, csrfToken: CSRF }) : json({ order: d }) }), { code: 'order_unavailable' });
  }
});

test('explicit terms consent and bounded valid inputs are required before checkout POST', async () => {
  for (const over of [{ termsAccepted: false }, { csrfToken: '' }, { idempotencyKey: 'short' }, { termsVersion: '' }, { orderId: '../../private' }, { locale: '../external' }]) {
    await assert.rejects(requestTennisCheckout(input(over), { fetchImpl: async () => assert.fail('invalid request must not fetch') }), { code: 'invalid_request' });
  }
});

test('checkout POST contains exactly termsVersion/idempotencyKey and session CSRF, no client financial proof', async () => {
  const calls = [], abort = new AbortController();
  const result = await requestTennisCheckout(input({ userId: 'client-owner', amountMinor: '999999', paid: true, accessToken: capability, providerOrderId: 'client-provider' }), { now: AT, signal: abort.signal, fetchImpl: async (path, options) => { calls.push({ path, options }); return json(ready()); } });
  assert.equal(calls.length, 1); assert.equal(calls[0].path, `/api/accounts/orders/${ORDER}/checkout`);
  const options = calls[0].options;
  assert.equal(options.method, 'POST'); assert.deepEqual(JSON.parse(options.body), { termsVersion: 'synthetic-terms-v1', idempotencyKey: 'synthetic-idempotency-one' });
  assert.deepEqual(options.headers, { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF }); assert.equal(options.signal, abort.signal);
  assert.equal(result.status, 'ready'); assert.equal(result.paid, undefined); assert.equal(JSON.stringify(options).includes(capability), false);
});

test('server unavailable/raw errors never become a session or leak provider secrets', async () => {
  for (const fetchImpl of [async () => json({ code: 'synthetic-private-provider-detail', details: { password: 'synthetic-private-value' } }, 503), async () => { throw new Error('synthetic-private-transport-detail'); }, async () => json({ status: 'paid', checkout_url: 'https://external.example.invalid' })]) {
    await assert.rejects(requestTennisCheckout(input(), { fetchImpl, now: AT }), error => error.code === 'session_unavailable' && !error.message.includes('synthetic-private'));
  }
});

test('only server-verified exact production embedded contract can survive descriptor validation', () => {
  const d = ready();
  assert.equal(validateTennisCheckoutResult(d, { locale: 'ru', now: AT }).embedded.sessionId, d.embedded.sessionId);
  for (const changes of [{ serverVerified: false }, { serverVerified: undefined }, { contract: 'guessed-sdk' }, { gatewayOrigin: 'https://test-gateway.mastercard.com' }, { gatewayOrigin: 'https://ap-gateway.mastercard.com.external.example.invalid' }, { sdkVersion: 'latest' }, { sessionId: 'not-a-session' }, { sessionId: `SESSION${'a'.repeat(101)}` }]) {
    assert.throws(() => validateTennisCheckoutResult({ ...ready(), embedded: { ...ready().embedded, ...changes } }, { locale: 'ru', now: AT }), { code: 'session_unavailable' });
  }
});

test('wrong path, expired session, client-paid status and missing descriptor fail closed', () => {
  for (const changes of [{ status: 'paid' }, { checkoutPath: 'https://external.example.invalid/checkout' }, { checkoutPath: '/unknown/checkout' }, { checkoutPath: '/ru/checkout?token=secret' }, { checkoutHandle: 'client-generated' }, { checkoutHandle: `tco_${'a'.repeat(42)}` }, { checkoutHandle: `tco_${'a'.repeat(44)}` }, { expiresAt: null }, { expiresAt: 'invalid' }, { expiresAt: '2026-10-11T01:00:00Z' }, { expiresAt: '2026-10-10T00:00:00.000Z' }, { embedded: null }]) {
    assert.throws(() => validateTennisCheckoutResult({ ...ready(), ...changes }, { locale: 'ru', now: AT }), { code: 'session_unavailable' });
  }
});

test('original order language may differ from the visible page without causing a redirect', () => {
  for (const locale of site.locales) {
    const result = validateTennisCheckoutResult({ ...ready(), checkoutPath: `/${locale}/checkout` }, { locale: 'ru', now: AT });
    assert.equal(result.status, 'ready'); assert.equal(result.checkoutPath, undefined);
  }
});

test('uncertain/review/expired outcomes have no executable embedded descriptor', () => {
  for (const status of ['creating', 'uncertain', 'review_required', 'expired']) {
    const value = { ...ready(), status, embedded: null, expiresAt: status === 'expired' ? '2026-10-10T00:00:00.000Z' : null };
    assert.deepEqual(validateTennisCheckoutResult(value, { locale: 'ru', now: AT }), { status, checkoutHandle: value.checkoutHandle, expiresAt: value.expiresAt, embedded: null });
    assert.throws(() => validateTennisCheckoutResult({ ...value, embedded: ready().embedded }, { locale: 'ru', now: AT }), { code: 'session_unavailable' });
  }
});

test('descriptor projection discards checkout URLs, HTML, PAN, proof and browser-return paid claims', () => {
  const result = validateTennisCheckoutResult({ ...ready(), paid: true, html: '<script>synthetic-private</script>', checkout_url: 'https://external.example.invalid', providerProof: { raw: 'synthetic-private' }, embedded: { ...ready().embedded, pan: 'synthetic-private', password: 'synthetic-private' } }, { locale: 'ru', now: AT });
  assert.deepEqual(Object.keys(result).sort(), ['checkoutHandle', 'embedded', 'expiresAt', 'status']);
  assert.equal(JSON.stringify(result).includes('synthetic-private'), false); assert.equal(result.paid, undefined);
});

test('redirected authenticated reads are refused rather than following an external storefront', async () => {
  let calls = 0;
  await assert.rejects(loadTennisCheckout(ORDER, { fetchImpl: async () => { calls++; return { redirected: true, ok: true, json: async () => assert.fail('redirect body') }; } }), { code: 'session_unavailable' });
  assert.equal(calls, 1);
});

test('caller AbortSignal reaches the request and cancellation remains a coarse unavailable result', async () => {
  const controller = new AbortController();
  const pending = requestTennisCheckout(input(), { fetchImpl: async (_, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('synthetic-private-cancel-reason')), { once: true })), signal: controller.signal, now: AT });
  controller.abort(); await assert.rejects(pending, { code: 'session_unavailable' });
});
