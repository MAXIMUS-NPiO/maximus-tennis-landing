/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/** Isolated synthetic React DOM fixture. Every fetch is intercepted; CSP blocks real connections. */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import TennisCheckout from '../../components/TennisCheckout.js';
import dict from '../../content/en.js';
import { tennisCheckoutLabels } from '../../content/tennis-checkout.js';

const ORDER = `MX-ORD-${'a'.repeat(32)}`, USER = `usr_${'0'.repeat(19)}1`;
const CSRF = 'synthetic-csrf-token-1234567890', CAPABILITY = `1791676800000.${'a'.repeat(64)}`;
const HANDLE = `tco_${'b'.repeat(43)}`, SESSION = `SESSION${'c'.repeat(32)}`;
const P = tennisCheckoutLabels.en, mount = document.getElementById('mount');
const report = { passed: [], failures: [] }, logs = [], writes = [], navigations = [];
const originalHistory = history.replaceState.bind(history), originalSetTimeout = window.setTimeout.bind(window);
let current;
const assert = (value, message) => { if (!value) throw new Error(message); };
const waitFor = async predicate => {
  for (let i = 0; i < 200; i++) { if (predicate()) return; await new Promise(resolve => originalSetTimeout(resolve, 5)); }
  throw new Error('Component state did not settle');
};
for (const key of ['log', 'warn', 'error', 'info', 'debug']) console[key] = (...args) => { logs.push(args.map(String).join(' ')); };
Storage.prototype.setItem = function (key, value) { writes.push([key, value]); throw new Error('No storage is permitted in this fixture'); };
history.replaceState = (...args) => { navigations.push(args[2]); return originalHistory(...args); };
window.open = () => { throw new Error('Popup forbidden'); };
navigator.sendBeacon = () => { throw new Error('Beacon forbidden'); };
window.WebSocket = class { constructor() { throw new Error('WebSocket forbidden'); } };
window.XMLHttpRequest = class { constructor() { throw new Error('XHR forbidden'); } };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function order() {
  return { id: ORDER, snapshot: { schema: 1, projectId: 'tennis', customerUserId: USER, plan: 'A', paymentPreference: 'payment_link',
    configuration: { series: 'great', racquetsTotal: 1 }, technical: { final: true, measurement_basis: 'unstrung', balance: {}, frame_stiffness: {} }, fulfillment: { verified: true },
    offer: { approved: true, evidence: 'SYNTHETIC-NOT-A-REAL-APPROVAL', totalMinor: 12345, currency: 'AED', termsVersion: 'synthetic-v1', termsText: 'Synthetic goods terms — no real order', expiresAt: '2099-10-12T00:00:00.000Z' },
    quotation: { number: 'SYNTHETIC-NOT-VALID', test: false, status: 'quotation', seller: { legalName: 'Synthetic fixture only' }, orderId: ORDER, projectId: 'tennis', totalMinor: 12345, currency: 'AED', termsVersion: 'synthetic-v1' } }, payment: { status: 'ready' }, invoice: null, mail: {} };
}
function result(status) {
  return { status, checkoutPath: '/ru/checkout', checkoutHandle: HANDLE, expiresAt: status === 'ready' ? '2099-10-11T01:00:00.000Z' : status === 'expired' ? '2000-10-10T00:00:00.000Z' : null,
    embedded: status === 'ready' ? { contract: 'mpgs_hosted_checkout_embedded_v1', serverVerified: true, sessionId: SESSION, gatewayOrigin: 'https://ap-gateway.mastercard.com', sdkVersion: '100' } : null };
}
const checkbox = () => mount.querySelector('input[type="checkbox"]');
const button = () => [...mount.querySelectorAll('button')].find(element => element.textContent === P.continueCheckout);
const refresh = () => mount.querySelector('.btn-row button');
const paymentState = () => mount.querySelector('[aria-labelledby="tennis-payment-title"] [role="status"]')?.textContent;
const posts = () => current.calls.filter(call => call.options.method === 'POST');
function clean() {
  if (current?.root) flushSync(() => current.root.unmount());
  current = null; mount.replaceChildren(); window.setTimeout = originalSetTimeout;
}
function StrictModeProbe({ fixture, children }) {
  React.useEffect(() => { fixture.lifecycle.push('mount'); return () => fixture.lifecycle.push('cleanup'); }, [fixture]);
  return children;
}
async function setup({ mutate, guest = false, fragment = `#order=${ORDER}&access=${CAPABILITY}`, post, readSession, readOrder, settle = true, strictMode = false } = {}) {
  clean(); originalHistory(null, '', `/${fragment}`); navigations.length = logs.length = writes.length = 0;
  const fixture = { doc: order(), calls: [], lifecycle: [], response: deferred(), root: createRoot(mount), readSession, readOrder }; current = fixture;
  if (mutate) mutate(fixture.doc);
  globalThis.fetch = async (path, options) => {
    fixture.calls.push({ path, options });
    if (path === '/api/accounts/session') return fixture.readSession ? fixture.readSession(options) : guest ? json({}, 401) : json({ user: { id: USER, emailVerified: true }, csrfToken: CSRF });
    if (path === `/api/accounts/orders/${ORDER}`) return fixture.readOrder ? fixture.readOrder(options) : json({ order: fixture.doc });
    if (path === `/api/accounts/orders/${ORDER}/checkout` && options.method === 'POST') return post ? post(options) : fixture.response.promise;
    throw new Error('Unexpected fetch in isolated fixture');
  };
  const component = React.createElement(TennisCheckout, { dict, locale: 'en' });
  flushSync(() => fixture.root.render(strictMode ? React.createElement(React.StrictMode, null, React.createElement(StrictModeProbe, { fixture }, component)) : component));
  if (settle) await waitFor(() => mount.querySelector('[aria-busy="false"]'));
  return fixture;
}
async function consent() { assert(checkbox() && !checkbox().checked, 'Consent must start unchecked'); checkbox().click(); await waitFor(() => !button().disabled); }
async function submit() { await consent(); button().click(); await waitFor(() => posts().length === 1); }
function privacy() {
  const observed = [mount.outerHTML, location.href, JSON.stringify([...document.querySelectorAll('a')].map(a => a.href)), JSON.stringify(logs), JSON.stringify(writes), JSON.stringify(navigations), JSON.stringify(current?.calls.map(call => ({ path: call.path, body: call.options.body })) || [])].join(' ');
  for (const secret of [HANDLE, SESSION, CAPABILITY, 'synthetic-private-provider-detail']) assert(!observed.includes(secret), 'Private descriptor/capability escaped');
  assert(!document.querySelector('iframe'), 'No bank iframe is allowed');
  assert(document.scripts.length === 1, 'No provider script is loaded');
  assert(writes.length === 0 && localStorage.length === 0 && sessionStorage.length === 0, 'No storage write');
  assert([...performance.getEntriesByType('resource')].every(entry => new URL(entry.name).origin === location.origin), 'No external resource');
}
async function scenario(name, run) {
  try { await run(); privacy(); report.passed.push(name); }
  catch (error) { report.failures.push({ name, error: error.message }); }
  finally { clean(); }
}

try {
  await scenario('verified owner loads and strips fragment capability without POST or consent', async () => {
    await setup(); assert(current.calls.length === 2, 'Exactly session and own order reads');
    assert(location.hash === `#order=${ORDER}`, 'Fragment capability stripped');
    assert(button().disabled && !checkbox().checked, 'Explicit consent required');
    assert(posts().length === 0, 'No automatic creation');
  });
  await scenario('guest sees account requirement and never fetches an order', async () => {
    await setup({ guest: true }); assert(current.calls.length === 1, 'Guest only reads session');
    assert(mount.textContent.includes(P.accountRequired) && !button(), 'Guest cannot prepare');
  });
  await scenario('forged paid return is discarded and makes no requests', async () => {
    await setup({ fragment: `#order=${ORDER}&paid=true` }); assert(current.calls.length === 0, 'Forged fragment must not fetch');
    assert(location.hash === '' && !button(), 'Forged paid is not evidence');
  });
  await scenario('foreign owner response fails closed in the rendered component', async () => {
    await setup({ mutate: doc => { doc.snapshot.customerUserId = `usr_${'0'.repeat(19)}2`; } });
    assert(!checkbox() && !button() && mount.textContent.includes(P.sessionUnavailable), 'Foreign order hidden');
  });
  await scenario('TEST quote never renders a prepare action', async () => {
    await setup({ mutate: doc => { doc.snapshot.quotation.test = true; } });
    assert(!checkbox() && !button() && posts().length === 0, 'TEST quote not payable');
  });
  await scenario('control-order identifiers cannot enter the goods checkout or create a goods payment', async () => {
    await setup({ fragment: `#order=MX-CTL-${'a'.repeat(32)}` });
    assert(current.calls.length === 0 && !checkbox() && !button(), 'Control orders require their separate verified journey');
    assert(location.hash === '' && mount.textContent.includes(P.accountRequired), 'Unsupported control fragment cleared');
  });
  await scenario('StrictMode effect replay preserves explicit consent and sends one request per action', async () => {
    await setup({ strictMode: true });
    assert(current.lifecycle.slice(0, 3).join(',') === 'mount,cleanup,mount', 'Actual development effect replay must run');
    assert(posts().length === 0 && button().disabled && !checkbox().checked, 'Effect replay must not initiate payment');
    await submit(); current.response.resolve(json(result('ready')));
    await waitFor(() => paymentState() === P.sessionUnavailable && mount.querySelector('[aria-busy="false"]'));
    assert(posts().length === 1 && button().disabled, 'One intentional request, no renderer mount');
  });
  for (const [status, label] of [['creating', 'checkoutCreating'], ['uncertain', 'checkoutUncertain'], ['review_required', 'checkoutReviewRequired'], ['expired', 'checkoutExpired'], ['ready', 'sessionUnavailable']]) {
    await scenario(`${status} response retains its safe display state and blocks blind retries`, async () => {
      await setup(); await submit();
      assert(paymentState() === P.checkoutCreating && button().disabled, 'Pending request displays creating');
      current.response.resolve(json(result(status)));
      await waitFor(() => paymentState() === P[label] && mount.querySelector('[aria-busy="false"]'));
      assert(button().disabled && checkbox().disabled, 'Outcome requires an order refresh');
      assert(!mount.textContent.includes(SESSION) && !mount.textContent.includes(HANDLE), 'Descriptor not rendered');
      assert(posts().length === 1 && current.doc.payment.status === 'ready' && !current.doc.invoice, 'Preparation is not payment evidence');
    });
  }
  await scenario('synchronous duplicate clicks send a single request', async () => {
    await setup(); await consent(); const target = button();
    target.dispatchEvent(new MouseEvent('click', { bubbles: true })); target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitFor(() => posts().length === 1); assert(paymentState() === P.checkoutCreating, 'Creating state visible');
    current.response.resolve(json(result('creating'))); await waitFor(() => mount.querySelector('[aria-busy="false"]'));
    assert(posts().length === 1, 'Duplicate click ignored');
  });
  await scenario('lost ACK becomes uncertain and retains the same key after explicit refresh and consent', async () => {
    await setup(); await submit(); const first = JSON.parse(posts()[0].options.body);
    current.response.reject(new Error('synthetic-private-provider-detail'));
    await waitFor(() => paymentState() === P.checkoutUncertain);
    assert(button().disabled, 'No blind retry after ACK loss'); refresh().click();
    await waitFor(() => checkbox() && !checkbox().checked && mount.querySelector('[aria-busy="false"]'));
    assert(button().disabled && !paymentState(), 'Refresh clears state and consent');
    current.response = deferred(); await consent(); button().click(); await waitFor(() => posts().length === 2);
    assert(JSON.parse(posts()[1].options.body).idempotencyKey === first.idempotencyKey, 'Stable idempotency after ACK loss');
    current.response.resolve(json(result('review_required'))); await waitFor(() => paymentState() === P.checkoutReviewRequired);
  });
  await scenario('changed approved terms need new consent and a new attempt key after refresh', async () => {
    await setup(); await submit(); const first = JSON.parse(posts()[0].options.body);
    current.response.resolve(json(result('expired'))); await waitFor(() => paymentState() === P.checkoutExpired);
    current.doc.snapshot.offer.termsVersion = current.doc.snapshot.quotation.termsVersion = 'synthetic-v2';
    current.doc.snapshot.offer.termsText = 'Changed synthetic goods terms'; refresh().click();
    await waitFor(() => checkbox() && !checkbox().checked && mount.querySelector('[aria-busy="false"]'));
    assert(button().disabled, 'Changed terms do not inherit consent'); current.response = deferred();
    await consent(); button().click(); await waitFor(() => posts().length === 2);
    const second = JSON.parse(posts()[1].options.body); assert(second.termsVersion === 'synthetic-v2' && second.idempotencyKey !== first.idempotencyKey, 'Changed terms are bound to a distinct request');
    current.response.resolve(json(result('review_required'))); await waitFor(() => paymentState() === P.checkoutReviewRequired);
  });
  await scenario('request timeout aborts and reports uncertainty without a second POST', async () => {
    await setup({ post: ({ signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('synthetic-private-provider-detail')), { once: true })) });
    window.setTimeout = (callback, delay, ...args) => originalSetTimeout(callback, delay === 20000 ? 20 : delay, ...args);
    await submit(); await waitFor(() => paymentState() === P.checkoutUncertain);
    assert(posts()[0].options.signal.aborted && posts().length === 1 && button().disabled, 'Timeout is uncertain and cannot retry blindly');
  });
  for (const status of [401, 403]) {
    await scenario(`checkout HTTP${status} clears stale account data and consent until an authenticated refresh`, async () => {
      await setup({ post: async () => json({ code: 'synthetic-private-provider-detail' }, status) }); await submit();
      await waitFor(() => mount.querySelector('[aria-busy="false"]') && mount.textContent.includes(P.accountRequired));
      assert(!button() && !checkbox() && !mount.textContent.includes(ORDER), 'Rejected authentication must clear the old order and action');
      assert(posts().length === 1, 'No automatic repeat after authentication failure');
      refresh().click(); await waitFor(() => checkbox() && mount.querySelector('[aria-busy="false"]'));
      assert(!checkbox().checked && button().disabled && !mount.textContent.includes(P.accountRequired), 'Authenticated reload requires new explicit consent');
      assert(posts().length === 1, 'Refreshing authentication cannot prepare a new session');
    });
  }
  await scenario('unmount during account read aborts and prevents a late follow-up order request', async () => {
    const pending = deferred();
    const fixture = await setup({ readSession: () => pending.promise, settle: false });
    await waitFor(() => fixture.calls.length === 1); const signal = fixture.calls[0].options.signal;
    flushSync(() => fixture.root.unmount()); fixture.root = null;
    pending.resolve(json({ user: { id: USER, emailVerified: true }, csrfToken: CSRF }));
    await new Promise(resolve => originalSetTimeout(resolve, 10));
    assert(signal.aborted && fixture.calls.length === 1 && mount.childElementCount === 0, 'Cancelled account load cannot continue or render');
  });
  await scenario('a refresh response arriving after remount cannot restore old terms or consent', async () => {
    await setup(); const older = deferred(); let reads = 0;
    current.readOrder = () => { reads++; return older.promise; };
    const target = refresh();
    target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitFor(() => reads === 1);
    const fixture = current, firstSignal = fixture.calls.at(-1).options.signal;
    flushSync(() => fixture.root.unmount()); fixture.root = null;
    const changed = await setup({ mutate: doc => {
      doc.snapshot.offer.termsVersion = doc.snapshot.quotation.termsVersion = 'synthetic-new-owner-session-terms';
      doc.snapshot.offer.termsText = 'New authenticated review terms';
    } });
    older.resolve(json({ order: fixture.doc })); await new Promise(resolve => originalSetTimeout(resolve, 10));
    assert(firstSignal.aborted && current === changed && mount.textContent.includes('New authenticated review terms'), 'Old read cannot overwrite a new mount');
    assert(!checkbox().checked && button().disabled && posts().length === 0, 'Late old terms cannot consent or submit');
  });
  await scenario('a late ready response from an old mount cannot affect a new authenticated checkout', async () => {
    const old = await setup(); await submit(); const signal = posts()[0].options.signal;
    const fresh = await setup(); old.response.resolve(json(result('ready')));
    await new Promise(resolve => originalSetTimeout(resolve, 10));
    assert(signal.aborted && current === fresh && !paymentState() && !checkbox().checked && button().disabled, 'Old ready descriptor cannot alter fresh state');
    assert(posts().length === 0, 'Remount cannot automatically prepare payment');
  });
  await scenario('unmount aborts a pending request and ignores its late ready response', async () => {
    await setup(); await submit(); const fixture = current, signal = posts()[0].options.signal;
    flushSync(() => fixture.root.unmount()); fixture.root = null;
    assert(signal.aborted && mount.childElementCount === 0, 'Unmount aborts and clears UI');
    fixture.response.resolve(json(result('ready'))); await new Promise(resolve => originalSetTimeout(resolve, 10));
    assert(mount.childElementCount === 0 && posts().length === 1, 'Late response cannot remount or create payment evidence');
  });
} catch (error) { report.failures.push({ name: 'fixture', error: error.message }); }
finally {
  clean();
  document.getElementById('result').textContent = btoa(unescape(encodeURIComponent(JSON.stringify(report))));
}
