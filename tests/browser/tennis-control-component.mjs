/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/** Isolated React DOM fixture for the payment-control page. Every fetch is intercepted, the bank SDK is a recorder, CSP blocks real connections. */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import TennisControl from '../../components/TennisControl.js';
import { tennisControlLabels } from '../../content/tennis-control.js';
import { tennisCheckoutLabels } from '../../content/tennis-checkout.js';
import { accountLabels } from '../../content/account.js';

const ORDER = `MX-CTL-${'a'.repeat(32)}`, USER = `usr_${'0'.repeat(19)}1`, CSRF = 'synthetic-csrf-token-1234567890', SESSION = 'SESSIONsyntheticPrivateControl123';
const P = tennisControlLabels.en, C = tennisCheckoutLabels.en, A = accountLabels.en, mount = document.getElementById('mount');
const report = { passed: [], failures: [] }, logs = [], writes = [], navigations = [];
const originalHistory = history.replaceState.bind(history), originalSetTimeout = window.setTimeout.bind(window);
let current;
const assert = (value, message) => { if (!value) throw new Error(message); };
const waitFor = async (predicate, message = 'Component state did not settle') => {
  for (let i = 0; i < 400; i++) { if (predicate()) return; await new Promise(resolve => originalSetTimeout(resolve, 5)); }
  throw new Error(message);
};
for (const key of ['log', 'warn', 'error', 'info', 'debug']) console[key] = (...args) => { logs.push(args.map(String).join(' ')); };
Storage.prototype.setItem = function (key, value) { writes.push([key, value]); throw new Error('No storage is permitted in this fixture'); };
history.replaceState = (...args) => { navigations.push(args[2]); return originalHistory(...args); };
window.open = () => { throw new Error('Popup forbidden'); };
window.XMLHttpRequest = class { constructor() { throw new Error('XHR forbidden'); } };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const order = (extra = {}) => ({ id: ORDER, kind: 'payment_control', currency: 'USD', totalMinor: '100', fulfillment: 'none', status: 'session_created', terms: { version: 'control-v1', text: 'Synthetic control terms: USD 1.00 connection check, no goods, no program.', acceptedAt: 1760000000000 }, createdAt: '2026-10-13T06:00:00.000Z', localSessionDeadline: '2099-01-01T00:00:00.000Z', financialProductEnabled: false, ...extra });
const session = () => ({ contract: 'mpgs_hosted_checkout_embedded_v1', serverVerified: true, sessionId: SESSION, gatewayOrigin: 'https://ap-gateway.mastercard.com', sdkUrl: 'https://ap-gateway.mastercard.com/static/checkout/checkout.min.js', sdkVersion: '100', expiresAt: '2099-01-01T00:00:00.000Z' });
const terms = { version: 'control-v1', text: 'Synthetic control terms: USD 1.00 connection check, no goods, no program.' };
const proofFor = payment => payment === 'paid' ? { status: 'captured', currency: 'USD', totalMinor: '100', capturedMinor: '100', refundedMinor: '0', movementCount: 1, observedAt: '2026-10-13T06:05:00.000Z', reason: null, ledgerPosted: false } : { status: 'pending', currency: 'USD', totalMinor: '100', capturedMinor: '0', refundedMinor: '0', movementCount: 0, observedAt: '2026-10-13T06:01:00.000Z', reason: null, ledgerPosted: false };
function view(fixture) {
  const s = fixture.state;
  if (!s.order) return { owner: true, canOpen: true, terms, webhookConfigured: true, order: null, proof: null, observation: null, payment: null };
  return { owner: true, canOpen: s.canOpen, terms, webhookConfigured: true, order: order(s.orderExtra), proof: proofFor(s.payment), observation: { present: false, observedAt: '2026-10-13T06:01:00.000Z' }, payment: s.payment };
}
function recorder(fixture) {
  const r = { mounts: [], unmounts: 0, handler: null, mounted: false, fail: null };
  r.mount = async ({ sessionId, container, handler }) => { r.mounts.push({ sessionId, containerId: container?.id }); if (r.fail) { const error = new Error(r.fail); error.code = r.fail; throw error; } r.handler = handler; r.mounted = true; container.append(Object.assign(document.createElement('div'), { textContent: 'synthetic bank frame' })); };
  r.unmount = container => { r.unmounts++; r.mounted = false; r.handler = null; container?.replaceChildren(); };
  fixture.renderer = r; return r;
}
const posts = action => current.calls.filter(call => call.path === `/api/accounts/control/${action}`);
const text = selector => [...mount.querySelectorAll(selector)].map(e => e.textContent);
const statusLabel = () => mount.querySelector('[data-payment]')?.textContent;
const paymentAttr = () => mount.querySelector('[data-payment]')?.getAttribute('data-payment');
const startButton = () => [...mount.querySelectorAll('button')].find(b => b.textContent === P.start || b.textContent === P.newAttempt);
const checkbox = () => mount.querySelector('input[type="checkbox"]');
function clean() {
  if (current?.root) flushSync(() => current.root.unmount());
  current = null; mount.replaceChildren(); window.setTimeout = originalSetTimeout;
}
function StrictModeProbe({ fixture, children }) {
  React.useEffect(() => { fixture.lifecycle.push('mount'); return () => fixture.lifecycle.push('cleanup'); }, [fixture]);
  return children;
}
async function setup({ guest = false, unconfigured = false, owner = true, state = {}, url = '/en/checkout/control', initiate, strictMode = false, settle = true, failMount = null } = {}) {
  clean(); originalHistory(null, '', url); navigations.length = logs.length = writes.length = 0;
  const fixture = { calls: [], lifecycle: [], state: { order: false, canOpen: true, payment: 'awaiting_payment', orderExtra: {}, ...state }, root: createRoot(mount) }; current = fixture;
  const r = recorder(fixture); r.fail = failMount;
  globalThis.fetch = async (path, options) => {
    fixture.calls.push({ path, options, at: performance.now(), href: location.href });
    if (path === '/api/accounts/session') return guest ? json({ code: 'unauthorized' }, 401) : unconfigured ? json({ code: 'portal_disabled' }, 503) : json({ user: { id: USER, emailVerified: true }, csrfToken: CSRF });
    if (options?.method !== 'POST' || options.headers['X-CSRF-Token'] !== CSRF) throw new Error('Unexpected fetch in isolated fixture');
    const body = JSON.parse(options.body);
    if (path === '/api/accounts/control/current') return owner ? json(view(fixture)) : json({ owner: false });
    if (path === '/api/accounts/control/prepare') { fixture.state.order = true; fixture.state.canOpen = false; fixture.state.payment = 'awaiting_payment'; fixture.state.orderExtra = { status: 'issued', localSessionDeadline: null }; return json({ order: order(fixture.state.orderExtra), duplicate: false }, 201); }
    if (path === '/api/accounts/control/initiate') { if (initiate) return initiate(body, fixture); fixture.state.orderExtra = {}; return json({ order: order(), session: session() }); }
    if (path === '/api/accounts/control/status') { if (body.orderId !== ORDER) throw new Error('wrong order'); return json({ order: order(fixture.state.orderExtra), proof: proofFor(fixture.state.payment), observation: null, payment: fixture.state.payment }); }
    throw new Error('Unexpected fetch in isolated fixture');
  };
  const component = React.createElement(TennisControl, { locale: 'en', renderer: r, pollMs: 30 });
  flushSync(() => fixture.root.render(strictMode ? React.createElement(React.StrictMode, null, React.createElement(StrictModeProbe, { fixture }, component)) : component));
  if (settle) await waitFor(() => mount.querySelector('[aria-busy="false"]'));
  return fixture;
}
function privacy(fixture) {
  const observed = [mount.outerHTML, location.href, JSON.stringify(logs), JSON.stringify(writes), JSON.stringify(navigations), JSON.stringify(fixture.calls.map(call => ({ path: call.path, body: call.options?.body })))].join(' ');
  assert(!observed.includes(SESSION), 'Private session escaped into markup, URL, logs, storage or requests');
  assert(!observed.includes('resultIndicator=abc'), 'Return parameters leaked');
  assert(writes.length === 0 && localStorage.length === 0 && sessionStorage.length === 0, 'No storage write');
  assert(document.scripts.length === 1, 'No provider script is loaded by the fixture');
  assert([...performance.getEntriesByType('resource')].every(entry => new URL(entry.name).origin === location.origin), 'No external resource');
}
async function scenario(name, run) {
  try { await run(); report.passed.push(name); }
  catch (error) { report.failures.push(`${name}: ${error.message}`); }
  finally { clean(); }
}
async function startAttempt(fixture) {
  await waitFor(() => checkbox() && startButton(), 'terms block missing');
  assert(startButton().disabled, 'start must wait for consent');
  checkbox().click(); await waitFor(() => !startButton().disabled);
  startButton().click();
  await waitFor(() => posts('prepare').length === 1 && posts('initiate').length === 1, 'prepare and initiate expected');
}

await scenario('guest sees the account requirement and makes no control request', async () => {
  const f = await setup({ guest: true });
  assert(text('[role="alert"]').includes(C.accountRequired), 'account requirement');
  assert(f.calls.every(call => call.path === '/api/accounts/session'), 'no control request for a guest');
  assert(f.renderer.mounts.length === 0, 'no mount'); privacy(f);
});
await scenario('unconfigured runtime shows the not-connected notice without any attempt', async () => {
  const f = await setup({ unconfigured: true });
  assert(text('[role="alert"]').includes(C.sessionUnavailable), 'unconfigured notice');
  assert(posts('prepare').length === 0 && f.renderer.mounts.length === 0, 'nothing started'); privacy(f);
});
await scenario('a verified member who is not the owner cannot see terms or start', async () => {
  const f = await setup({ owner: false });
  assert(text('[role="alert"]').includes(P.notOwner), 'owner notice');
  assert(!checkbox() && !startButton() && posts('prepare').length === 0, 'no start path'); privacy(f);
});
await scenario('owner accepts the server terms, one prepare and one initiate mount the bank form with the private session kept out of the page', async () => {
  const f = await setup();
  assert(mount.textContent.includes(terms.text), 'server terms shown verbatim');
  await startAttempt(f);
  const prepare = JSON.parse(posts('prepare')[0].options.body);
  assert(/^[A-Za-z0-9_-]{8,128}$/.test(prepare.idempotencyKey) && prepare.termsVersion === 'control-v1' && Object.keys(prepare).length === 2, 'prepare body');
  assert(JSON.stringify(JSON.parse(posts('initiate')[0].options.body)) === JSON.stringify({ orderId: ORDER, locale: 'en' }), 'initiate body');
  await waitFor(() => f.renderer.mounts.length === 1 && mount.querySelector('[data-bank-form]')?.textContent === 'synthetic bank frame', 'bank form mounted once');
  assert(f.renderer.mounts[0].sessionId === SESSION && f.renderer.mounts[0].containerId === 'tennis-control-bank', 'mount arguments');
  assert(!checkbox(), 'terms block disappears once the attempt is open');
  await waitFor(() => posts('status').length >= 2, 'status is polled while the form is open');
  assert(paymentAttr() === 'awaiting_payment' && statusLabel().startsWith(P.awaitingPayment), 'awaiting label');
  privacy(f);
});
await scenario('a bank callback only triggers a status read; paid appears when the server says so and the receipt frame stays', async () => {
  const f = await setup();
  await startAttempt(f); await waitFor(() => f.renderer.mounted);
  const before = posts('status').length;
  f.renderer.handler('complete', { resultIndicator: 'synthetic-indicator', sessionVersion: '0000000001' });
  await waitFor(() => posts('status').length > before, 'callback causes a status read');
  assert(paymentAttr() === 'awaiting_payment', 'callback alone cannot make the page say paid');
  f.state.payment = 'paid'; f.state.canOpen = true;
  f.renderer.handler('complete', {});
  await waitFor(() => paymentAttr() === 'paid', 'paid after the authenticated read');
  assert(statusLabel().startsWith(P.paid), 'paid label');
  assert(f.renderer.mounted && f.renderer.unmounts === 0, 'gateway receipt stays visible');
  assert(posts('current').length >= 2, 'a closed attempt re-reads the account view');
  await waitFor(() => startButton()?.textContent === P.newAttempt, 'a new attempt may open after payment');
  const statusCalls = posts('status').length; await new Promise(resolve => originalSetTimeout(resolve, 120));
  assert(posts('status').length === statusCalls, 'polling stops after a terminal state');
  privacy(f);
});
await scenario('return from the bank page is cleaned before any request, shown as a notice and verified by the server, never mounted again', async () => {
  const f = await setup({ url: '/en/checkout/control?resultIndicator=abc&sessionVersion=0001', state: { order: true, canOpen: true, payment: 'paid' } });
  assert(navigations[0] === '/en/checkout/control' && f.calls.every(call => !call.href.includes('resultIndicator')), 'URL cleaned before the first request');
  assert(location.search === '' && location.hash === '', 'clean location');
  assert(text('[role="status"]').some(t => t === P.returned), 'return notice');
  assert(paymentAttr() === 'paid' && f.renderer.mounts.length === 0 && posts('initiate').length === 0, 'paid order is not re-initiated');
  privacy(f);
});
await scenario('reloading during an open attempt re-reads the same session and mounts without a new preparation', async () => {
  const f = await setup({ state: { order: true, canOpen: false, payment: 'awaiting_payment' } });
  await waitFor(() => f.renderer.mounts.length === 1, 'mounted from current');
  assert(posts('prepare').length === 0 && posts('initiate').length === 1, 'no prepare on reload');
  assert(!checkbox(), 'no second consent while the attempt is open'); privacy(f);
});
await scenario('the acquirer refusing USD stops the attempt before any bank form', async () => {
  const f = await setup({ initiate: () => json({ code: 'forbidden', reason: 'control_currency_not_permitted' }, 403) });
  await startAttempt(f);
  await waitFor(() => text('[role="alert"]').includes(P.currencyNotPermitted), 'currency notice');
  assert(f.renderer.mounts.length === 0, 'no mount'); privacy(f);
});
await scenario('an unavailable SDK leaves the attempt open with an honest notice and continued status reads', async () => {
  const f = await setup({ failMount: 'sdk_unavailable' });
  await startAttempt(f);
  await waitFor(() => text('[role="alert"]').includes(P.bankFormUnavailable), 'bank form notice');
  await waitFor(() => posts('status').length >= 1, 'status still read');
  assert(paymentAttr() === 'awaiting_payment', 'state honest'); privacy(f);
});
await scenario('a declined payment keeps the bank form for a retry while the window is open', async () => {
  const f = await setup({ state: { order: true, canOpen: false, payment: 'declined' } });
  await waitFor(() => f.renderer.mounts.length === 1 && paymentAttr() === 'declined', 'declined with form');
  assert(statusLabel().startsWith(P.declined) && f.renderer.mounted, 'form kept');
  await waitFor(() => posts('status').length >= 2, 'still polling'); privacy(f);
});
await scenario('an expired attempt unmounts the form, re-reads the account view and offers a new attempt', async () => {
  const f = await setup({ state: { order: true, canOpen: false, payment: 'awaiting_payment' } });
  await waitFor(() => f.renderer.mounted);
  f.state.payment = 'expired'; f.state.canOpen = true; f.state.orderExtra = { status: 'expired' };
  await waitFor(() => paymentAttr() === 'expired' && f.renderer.unmounts === 1, 'expired and unmounted');
  await waitFor(() => startButton()?.textContent === P.newAttempt, 'new attempt offered');
  f.renderer.handler = null; privacy(f);
});
await scenario('unmounting the page stops polling, unmounts the bank form and ignores a late callback', async () => {
  const f = await setup({ state: { order: true, canOpen: false, payment: 'awaiting_payment' } });
  await waitFor(() => f.renderer.mounted);
  const handler = f.renderer.handler;
  flushSync(() => f.root.unmount()); f.root = null;
  assert(f.renderer.unmounts === 1 && !f.renderer.mounted, 'bank unmounted with the page');
  const calls = f.calls.length; handler('complete', {});
  await new Promise(resolve => originalSetTimeout(resolve, 150));
  assert(f.calls.length === calls, 'no request after unmount'); privacy(f);
});
await scenario('React StrictMode effect replay still mounts the bank form exactly once', async () => {
  const f = await setup({ strictMode: true, state: { order: true, canOpen: false, payment: 'awaiting_payment' } });
  await waitFor(() => f.renderer.mounts.length >= 1);
  await new Promise(resolve => originalSetTimeout(resolve, 100));
  assert(f.lifecycle.includes('cleanup'), 'StrictMode replayed effects');
  assert(f.renderer.mounts.length === 1 && f.renderer.mounted, 'one live mount'); privacy(f);
});
await scenario('every payment state has distinct copy', async () => {
  const states = ['notStarted', 'awaitingPayment', 'authenticationPending', 'pending', 'pendingVerification', 'declined', 'cancelled', 'expired', 'uncertain', 'paid', 'partiallyRefunded', 'refunded', 'reviewRequired'];
  assert(new Set(states.map(key => P[key])).size === states.length, 'distinct labels');
});

document.getElementById('result').textContent = btoa(unescape(encodeURIComponent(JSON.stringify(report))));
