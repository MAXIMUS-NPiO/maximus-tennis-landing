/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/** Browser client helpers for the payment control, with synthetic DOM, SDK and transport objects. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONTROL_CALLBACK_GLOBAL, CONTROL_SDK_STORAGE_KEYS, CONTROL_SDK_URL, TennisControlClientError, clearCheckoutSdkStorage, createCheckoutRenderer, createTennisControlAttempt, initiateTennisControl, loadTennisControlAccount, prepareTennisControl, readTennisControlCurrent, readTennisControlReturn, readTennisControlStatus, validateControlCurrent, validateControlOrder, validateControlSession, validateControlStatus } from '../lib/client/tennis-control.js';

const ORDER = `MX-CTL-${'a'.repeat(32)}`, SESSION = 'SESSIONsyntheticPrivateControl123', CSRF = 'synthetic-csrf-token-1234567890';
const order = (extra = {}) => ({ id: ORDER, kind: 'payment_control', currency: 'USD', totalMinor: '100', fulfillment: 'none', status: 'session_created', terms: { version: 'v1', text: 'Synthetic control terms text for the fixture', acceptedAt: 1760000000000 }, createdAt: '2026-10-13T06:00:00.000Z', localSessionDeadline: '2026-10-13T06:15:00.000Z', financialProductEnabled: false, ...extra });
const session = (extra = {}) => ({ contract: 'mpgs_hosted_checkout_embedded_v1', serverVerified: true, sessionId: SESSION, gatewayOrigin: 'https://ap-gateway.mastercard.com', sdkUrl: CONTROL_SDK_URL, sdkVersion: '100', expiresAt: '2026-10-13T06:15:00.000Z', ...extra });
const current = (extra = {}) => ({ owner: true, canOpen: false, terms: { version: 'v1', text: 'Synthetic control terms text for the fixture' }, webhookConfigured: true, order: order(), proof: { status: 'pending', currency: 'USD', totalMinor: '100', capturedMinor: '0', refundedMinor: '0', movementCount: 0, observedAt: '2026-10-13T06:01:00.000Z', reason: null, ledgerPosted: false }, observation: { present: false, observedAt: '2026-10-13T06:01:00.000Z' }, payment: 'awaiting_payment', ...extra });
const rejects = (fn, code) => assert.throws(fn, error => error instanceof TennisControlClientError && error.code === code);

test('projections accept only the exact control scope and never a paid state the server did not say', () => {
  assert.equal(validateControlOrder(order()).id, ORDER);
  for (const bad of [{ currency: 'AED' }, { totalMinor: '10000' }, { kind: 'goods' }, { fulfillment: 'ship' }, { status: 'paid' }, { financialProductEnabled: true }, { id: `MX-ORD-${'a'.repeat(32)}` }, { localSessionDeadline: 'soon' }]) rejects(() => validateControlOrder(order(bad)), 'unavailable');
  assert.equal(validateControlCurrent(current()).payment, 'awaiting_payment');
  assert.deepEqual(validateControlCurrent({ owner: false }), { owner: false });
  rejects(() => validateControlCurrent(current({ payment: 'settled' })), 'unavailable');
  rejects(() => validateControlCurrent(current({ proof: { status: 'captured', currency: 'USD', totalMinor: '100', capturedMinor: '1000', refundedMinor: '0', observedAt: '2026-10-13T06:01:00.000Z' } })), 'unavailable');
  rejects(() => validateControlStatus({ order: order(), proof: null, observation: null, payment: 'paid' }, `MX-CTL-${'b'.repeat(32)}`), 'unavailable');
  assert.equal(validateControlStatus({ order: order(), proof: null, observation: null, payment: 'paid' }, ORDER).payment, 'paid');
  assert.deepEqual(validateControlSession(session()), { sessionId: SESSION, expiresAt: '2026-10-13T06:15:00.000Z' });
  assert.equal(validateControlSession(null), null);
  for (const bad of [{ serverVerified: false }, { gatewayOrigin: 'https://example.invalid' }, { sdkUrl: 'https://ap-gateway.mastercard.com/static/checkout/other.js' }, { sdkVersion: '62' }, { sessionId: 'not-a-session' }, { contract: 'lightbox' }]) rejects(() => validateControlSession(session(bad)), 'unavailable');
});

test('a bank return is detected from the query or the SDK fragment and reduced to the clean path', () => {
  assert.deepEqual(readTennisControlReturn({ pathname: '/en/checkout/control', search: '?resultIndicator=abc&sessionVersion=0001', hash: '' }), { returned: true, href: '/en/checkout/control' });
  assert.deepEqual(readTennisControlReturn({ pathname: '/ru/checkout/control', search: '', hash: '#__hc-action-complete-abc-def' }), { returned: true, href: '/ru/checkout/control' });
  assert.deepEqual(readTennisControlReturn({ pathname: '/ru/checkout/control', search: '?utm=1', hash: '#top' }), { returned: false, href: '/ru/checkout/control' });
  assert.deepEqual(readTennisControlReturn(undefined), { returned: false, href: '/' });
  const storage = new Map([...CONTROL_SDK_STORAGE_KEYS.map(key => [key, 'x']), ['mx.attr', 'keep']]);
  clearCheckoutSdkStorage({ removeItem: key => storage.delete(key) });
  assert.deepEqual([...storage.keys()], ['mx.attr']);
  clearCheckoutSdkStorage(null); clearCheckoutSdkStorage({ removeItem() { throw new Error('blocked'); } });
});

test('one idempotency key per accepted terms version', () => {
  let n = 0; const attempts = createTennisControlAttempt(() => `synthetic-key-${++n}`);
  assert.equal(attempts.keyFor('v1'), 'synthetic-key-1'); assert.equal(attempts.keyFor('v1'), 'synthetic-key-1');
  assert.equal(attempts.keyFor('v2'), 'synthetic-key-2');
  rejects(() => attempts.keyFor(''), 'invalid_request');
  rejects(() => createTennisControlAttempt(() => 'short').keyFor('v1'), 'invalid_request');
});

function transport(routes) {
  const calls = [];
  const fetchImpl = async (path, options) => { calls.push({ path, options }); const route = routes[path]; if (!route) throw new Error('unexpected'); const [status, body, extra = {}] = typeof route === 'function' ? route(options) : route; return { ok: status < 400, status, redirected: Boolean(extra.redirected), json: async () => body }; };
  return { calls, fetchImpl };
}
test('transport maps authentication, owner, currency and configuration outcomes to safe client codes', async () => {
  const ok = transport({ '/api/accounts/session': [200, { user: { id: `usr_${'0'.repeat(19)}1`, emailVerified: true }, csrfToken: CSRF }], '/api/accounts/control/current': [200, current()], '/api/accounts/control/prepare': [201, { order: order({ status: 'issued', localSessionDeadline: null }), duplicate: false }], '/api/accounts/control/initiate': [200, { order: order(), session: session() }], '/api/accounts/control/status': [200, { order: order(), proof: null, observation: null, payment: 'awaiting_payment' }] });
  const account = await loadTennisControlAccount({ fetchImpl: ok.fetchImpl });
  assert.equal(account.csrfToken, CSRF);
  assert.equal((await readTennisControlCurrent({ csrfToken: CSRF, fetchImpl: ok.fetchImpl })).owner, true);
  assert.equal((await prepareTennisControl({ idempotencyKey: 'synthetic-key-1', termsVersion: 'v1', termsAccepted: true }, { csrfToken: CSRF, fetchImpl: ok.fetchImpl })).order.status, 'issued');
  assert.equal((await initiateTennisControl({ orderId: ORDER, locale: 'en' }, { csrfToken: CSRF, fetchImpl: ok.fetchImpl })).session.sessionId, SESSION);
  assert.equal((await readTennisControlStatus({ orderId: ORDER }, { csrfToken: CSRF, fetchImpl: ok.fetchImpl })).payment, 'awaiting_payment');
  for (const call of ok.calls.filter(c => c.options.method === 'POST')) { assert.equal(call.options.headers['X-CSRF-Token'], CSRF); assert.equal(call.options.credentials, 'same-origin'); assert.equal(call.options.redirect, 'error'); assert.equal(call.options.referrerPolicy, 'no-referrer'); }
  await assert.rejects(prepareTennisControl({ idempotencyKey: 'synthetic-key-1', termsVersion: 'v1', termsAccepted: false }, { csrfToken: CSRF, fetchImpl: ok.fetchImpl }), e => e.code === 'invalid_request');
  await assert.rejects(initiateTennisControl({ orderId: ORDER, locale: 'xx' }, { csrfToken: CSRF, fetchImpl: ok.fetchImpl }), e => e.code === 'invalid_request');
  await assert.rejects(readTennisControlCurrent({ csrfToken: 'short', fetchImpl: ok.fetchImpl }), e => e.code === 'account_required');

  const outcomes = [[401, {}, 'account_required'], [403, { code: 'forbidden', reason: 'control_owner_mismatch' }, 'not_owner'], [403, { code: 'forbidden', reason: 'control_currency_not_permitted' }, 'currency_not_permitted'], [409, { code: 'conflict', reason: 'control_terms_mismatch' }, 'unavailable'], [503, { code: 'control_unconfigured' }, 'unconfigured'], [503, { code: 'portal_disabled' }, 'unconfigured'], [503, { code: 'unavailable' }, 'unavailable'], [200, { owner: true, canOpen: true, terms: { version: 'v1', text: 'x'.repeat(30) }, webhookConfigured: false, order: null, proof: { status: 'captured' }, observation: null, payment: 'paid' }, null]];
  for (const [status, body, code] of outcomes) {
    const t = transport({ '/api/accounts/control/current': [status, body] });
    if (code) await assert.rejects(readTennisControlCurrent({ csrfToken: CSRF, fetchImpl: t.fetchImpl }), e => e.code === code);
    else assert.equal((await readTennisControlCurrent({ csrfToken: CSRF, fetchImpl: t.fetchImpl })).payment, null, 'no order means no payment state');
  }
  const redirected = transport({ '/api/accounts/session': [200, {}, { redirected: true }] });
  await assert.rejects(loadTennisControlAccount({ fetchImpl: redirected.fetchImpl }), e => e.code === 'unavailable');
  const guest = transport({ '/api/accounts/session': [200, { user: { id: `usr_${'0'.repeat(19)}1`, emailVerified: false }, csrfToken: CSRF }] });
  await assert.rejects(loadTennisControlAccount({ fetchImpl: guest.fetchImpl }), e => e.code === 'account_required');
});

/** Synthetic window/document: the SDK contract is simulated, never downloaded. */
function dom({ api, loadFails = false, defineOnLoad = true } = {}) {
  const storage = new Map(CONTROL_SDK_STORAGE_KEYS.map(key => [key, 'stale']));
  const win = { sessionStorage: { removeItem: key => storage.delete(key), setItem: (key, value) => storage.set(key, value) } };
  const scripts = [], elements = new Map();
  const container = { id: 'tennis-control-bank', children: ['frame'], replaceChildren() { this.children = []; } };
  const doc = { head: { appendChild: element => scripts.push(element) }, createElement: () => { const element = { attributes: {}, setAttribute(name, value) { this.attributes[name] = value; } }; return element; }, getElementById: id => elements.get(id) || null };
  const loadScript = async (document, url, attributes) => { scripts.push({ url, attributes }); if (loadFails) throw new Error('sdk_load_failed'); if (defineOnLoad) win.Checkout = api; };
  return { win, doc, storage, scripts, container, elements, loadScript };
}
function fakeSdk(record) {
  return { configure: async options => { record.push(['configure', options]); return true; }, showEmbeddedPage: async selector => { record.push(['show', selector]); return true; } };
}

test('renderer loads the SDK once with named global callbacks, mounts into the container and drops late callbacks after unmount', async () => {
  const record = [], f = dom({ api: fakeSdk(record) });
  const renderer = createCheckoutRenderer({ win: f.win, doc: f.doc, loadScript: f.loadScript });
  assert.equal(typeof f.win[CONTROL_CALLBACK_GLOBAL].complete, 'function');
  const events = [];
  await renderer.mount({ sessionId: SESSION, container: f.container, handler: (event, detail) => events.push([event, detail]) });
  assert.equal(f.scripts.length, 1); assert.equal(f.scripts[0].url, CONTROL_SDK_URL);
  assert.deepEqual(f.scripts[0].attributes, { 'data-complete': `${CONTROL_CALLBACK_GLOBAL}.complete`, 'data-error': `${CONTROL_CALLBACK_GLOBAL}.error`, 'data-timeout': `${CONTROL_CALLBACK_GLOBAL}.timeout` });
  assert.deepEqual(record, [['configure', { session: { id: SESSION } }], ['show', '#tennis-control-bank']]);
  assert.equal(renderer.mounted, true);
  assert.equal([...f.storage.keys()].some(key => CONTROL_SDK_STORAGE_KEYS.includes(key)), false, 'stale SDK resume data is cleared before configure');
  f.win[CONTROL_CALLBACK_GLOBAL].complete({ resultIndicator: 'synthetic' }); f.win[CONTROL_CALLBACK_GLOBAL].error({ cause: 'x' }); f.win[CONTROL_CALLBACK_GLOBAL].timeout();
  assert.deepEqual(events.map(e => e[0]), ['complete', 'error', 'timeout']);
  await assert.rejects(renderer.mount({ sessionId: SESSION, container: f.container, handler: () => {} }), e => e.code === 'already_mounted');
  f.elements.set('hc-comms-layer-iframe', { removed: false, remove() { this.removed = true; } });
  renderer.unmount(f.container);
  assert.equal(renderer.mounted, false); assert.deepEqual(f.container.children, []); assert.equal(f.elements.get('hc-comms-layer-iframe').removed, true);
  f.win[CONTROL_CALLBACK_GLOBAL].complete({}); assert.equal(events.length, 3, 'late callbacks after unmount are dropped');
  // A second mount reuses the loaded SDK: no second script element.
  await renderer.mount({ sessionId: SESSION, container: f.container, handler: () => {} });
  assert.equal(f.scripts.length, 1); assert.equal(record.length, 4);
  assert.equal(JSON.stringify(f.scripts).includes(SESSION), false, 'the session never enters script attributes');
});

test('renderer fails closed for an unavailable or incompatible SDK, a rejected mount and invalid input', async () => {
  const failing = dom({ loadFails: true });
  const renderer = createCheckoutRenderer({ win: failing.win, doc: failing.doc, loadScript: failing.loadScript });
  await assert.rejects(renderer.mount({ sessionId: SESSION, container: failing.container, handler: () => {} }), e => e.code === 'sdk_unavailable');
  assert.equal(renderer.mounted, false);
  // A later attempt may load again after a failure.
  failing.loadScript = async () => { failing.win.Checkout = { configure() {} }; };
  const incompatible = createCheckoutRenderer({ win: failing.win, doc: failing.doc, loadScript: failing.loadScript });
  await assert.rejects(incompatible.mount({ sessionId: SESSION, container: failing.container, handler: () => {} }), e => e.code === 'sdk_incompatible');
  const rejecting = dom({ api: { configure: async () => { throw new Error('Session ID not provided.'); }, showEmbeddedPage: async () => true } });
  const r = createCheckoutRenderer({ win: rejecting.win, doc: rejecting.doc, loadScript: rejecting.loadScript });
  await assert.rejects(r.mount({ sessionId: SESSION, container: rejecting.container, handler: () => {} }), e => e.code === 'mount_failed');
  assert.equal(r.mounted, false);
  const good = dom({ api: fakeSdk([]) });
  const g = createCheckoutRenderer({ win: good.win, doc: good.doc, loadScript: good.loadScript });
  await assert.rejects(g.mount({ sessionId: 'nope', container: good.container, handler: () => {} }), e => e.code === 'invalid_request');
  await assert.rejects(g.mount({ sessionId: SESSION, container: { id: '1 bad' }, handler: () => {} }), e => e.code === 'invalid_request');
  await assert.rejects(g.mount({ sessionId: SESSION, container: good.container, handler: null }), e => e.code === 'invalid_request');
  assert.equal(good.scripts.length, 0, 'invalid input never loads the SDK');
});
