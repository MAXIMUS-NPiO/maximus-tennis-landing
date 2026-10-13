/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/**
 * Browser-only payment-control client. Every value here is an authenticated server projection
 * or a bank SDK handle; nothing in this module can mark an order paid. The private session
 * descriptor is passed in memory to the documented Checkout API and is never written to markup,
 * URLs, storage or logs. A browser callback or a return from the bank page only triggers an
 * authenticated status read.
 *
 * Bank SDK contract (gateway reference "Implementing the Hosted Payment Page", API 100):
 *   <script src="https://ap-gateway.mastercard.com/static/checkout/checkout.min.js"
 *           data-complete="…" data-error="…" data-timeout="…">   (callbacks are global names)
 *   Checkout.configure({ session: { id } });  Checkout.showEmbeddedPage('#container');
 * The cancel callback exists for the Payment Page only; the Embedded Page has none.
 */
import { site } from '../../data/site';

export const CONTROL_ORDER = /^MX-CTL-[0-9a-f]{32}$/;
export const CONTROL_GATEWAY_ORIGIN = 'https://ap-gateway.mastercard.com';
export const CONTROL_SDK_URL = `${CONTROL_GATEWAY_ORIGIN}/static/checkout/checkout.min.js`;
export const CONTROL_SDK_VERSION = '100';
export const CONTROL_CALLBACK_GLOBAL = 'maximusTennisControl';
export const CONTROL_PAYMENT_STATES = Object.freeze(['not_started', 'awaiting_payment', 'authentication_pending', 'pending', 'pending_verification', 'declined', 'cancelled', 'expired', 'uncertain', 'paid', 'partially_refunded', 'refunded', 'review_required']);
/** States in which the bank form stays mounted and the status keeps being read. */
export const CONTROL_OPEN_STATES = Object.freeze(['awaiting_payment', 'authentication_pending', 'pending', 'pending_verification', 'declined', 'cancelled']);
/** Keys the bank SDK itself writes for its redirect-resume feature; cleared before and after every mount. */
export const CONTROL_SDK_STORAGE_KEYS = Object.freeze(['HostedCheckout_sessionId', 'HostedCheckout_embedContainer', 'HostedCheckout_merchantState', 'HostedCheckout_showLightboxFunc']);
const ORDER_STATES = new Set(['issued', 'creating', 'uncertain', 'session_created', 'expired', 'review_required']);
const PROOF_STATES = new Set(['pending', 'captured', 'partially_refunded', 'refunded', 'review_required']);
const SESSION_ID = /^SESSION[A-Za-z0-9_-]{10,100}$/;
const IDEM = /^[A-Za-z0-9_-]{8,128}$/;
const CSRF = /^[A-Za-z0-9_-]{20,200}$/;
const USER = /^usr_[0-9A-HJKMNP-TV-Z]{20}$/;
const REASONS = { control_owner_mismatch: 'not_owner', control_currency_not_permitted: 'currency_not_permitted', control_terms_mismatch: 'terms_changed', control_authorization_expired: 'authorization_expired' };
const text = (value, max = 200) => typeof value === 'string' && value.length > 0 && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
const iso = value => typeof value === 'string' && value.length <= 30 && Number.isFinite(Date.parse(value)) && new Date(Date.parse(value)).toISOString() === value;
const minor = value => typeof value === 'string' && /^(0|[1-9]\d{0,2})$/.test(value) && Number(value) <= 100;

export class TennisControlClientError extends Error {
  constructor(code = 'unavailable', reason = null) { super(code); this.code = code; this.reason = reason; }
}
const fail = (code, reason) => { throw new TennisControlClientError(code, reason); };

/* ---------------------------------------------------------------- projections */

export function validateControlOrder(o) {
  if (!o || typeof o !== 'object' || !CONTROL_ORDER.test(o.id || '') || o.kind !== 'payment_control' || o.currency !== 'USD' || o.totalMinor !== '100' || o.fulfillment !== 'none' || !ORDER_STATES.has(o.status) || o.financialProductEnabled !== false || !iso(o.createdAt) || !(o.localSessionDeadline === null || iso(o.localSessionDeadline)) || !text(o.terms?.version) || !text(o.terms?.text, 16000) || !Number.isSafeInteger(o.terms?.acceptedAt)) fail('unavailable');
  return { id: o.id, status: o.status, createdAt: o.createdAt, localSessionDeadline: o.localSessionDeadline, terms: { version: o.terms.version, text: o.terms.text, acceptedAt: o.terms.acceptedAt } };
}
function validateProof(p) {
  if (p === null || p === undefined) return null;
  if (!p || typeof p !== 'object' || !PROOF_STATES.has(p.status) || p.currency !== 'USD' || p.totalMinor !== '100' || !minor(p.capturedMinor) || !minor(p.refundedMinor) || !iso(p.observedAt)) fail('unavailable');
  return { status: p.status, capturedMinor: p.capturedMinor, refundedMinor: p.refundedMinor, observedAt: p.observedAt };
}
function validateObservation(w) {
  if (w === null || w === undefined) return null;
  if (!w || typeof w !== 'object' || typeof w.present !== 'boolean' || !iso(w.observedAt)) fail('unavailable');
  if (!w.present) return { present: false, observedAt: w.observedAt };
  if (typeof w.currencyMatches !== 'boolean' || typeof w.amountMatches !== 'boolean') fail('unavailable');
  return { present: true, observedAt: w.observedAt, orderStatus: typeof w.orderStatus === 'string' ? w.orderStatus : 'UNKNOWN', currencyMatches: w.currencyMatches, amountMatches: w.amountMatches };
}
const payment = value => { if (!CONTROL_PAYMENT_STATES.includes(value)) fail('unavailable'); return value; };

/** The private embedded descriptor: validated, kept in memory, handed only to the documented SDK call. */
export function validateControlSession(s) {
  if (s === null || s === undefined) return null;
  if (!s || typeof s !== 'object' || s.contract !== 'mpgs_hosted_checkout_embedded_v1' || s.serverVerified !== true || !SESSION_ID.test(s.sessionId || '') || s.gatewayOrigin !== CONTROL_GATEWAY_ORIGIN || s.sdkUrl !== CONTROL_SDK_URL || s.sdkVersion !== CONTROL_SDK_VERSION || !iso(s.expiresAt)) fail('unavailable');
  return { sessionId: s.sessionId, expiresAt: s.expiresAt };
}
export function validateControlCurrent(v) {
  if (!v || typeof v !== 'object' || typeof v.owner !== 'boolean') fail('unavailable');
  if (!v.owner) return { owner: false };
  if (typeof v.canOpen !== 'boolean' || !text(v.terms?.version) || !text(v.terms?.text, 16000) || typeof v.webhookConfigured !== 'boolean') fail('unavailable');
  const order = v.order ? validateControlOrder(v.order) : null;
  return { owner: true, canOpen: v.canOpen, terms: { version: v.terms.version, text: v.terms.text }, webhookConfigured: v.webhookConfigured, order,
    proof: order ? validateProof(v.proof) : null, observation: order ? validateObservation(v.observation) : null, payment: order ? payment(v.payment) : null };
}
export function validateControlStatus(v, orderId) {
  const order = validateControlOrder(v?.order);
  if (order.id !== orderId) fail('unavailable');
  return { order, proof: validateProof(v.proof), observation: validateObservation(v.observation), payment: payment(v.payment) };
}

/* ---------------------------------------------------------------- transport */

async function clientJson(fetchImpl, path, { method = 'GET', body, csrfToken, signal } = {}) {
  let response, value;
  if (signal?.aborted) fail('unavailable');
  try {
    response = await fetchImpl(path, { method, credentials: 'same-origin', mode: 'same-origin', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', signal,
      headers: { ...(method === 'POST' ? { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (signal?.aborted || response.redirected) fail('unavailable');
    value = await response.json().catch(() => null);
    if (!response.ok) {
      const reason = REASONS[value?.reason] || null;
      if ([401, 403].includes(response.status)) fail(reason || 'account_required', reason);
      if (response.status === 503 && ['control_unconfigured', 'portal_disabled', 'portal_runtime_unverified'].includes(value?.code)) fail('unconfigured');
      fail('unavailable', reason);
    }
  } catch (error) { if (error instanceof TennisControlClientError) throw error; fail('unavailable'); }
  // A late body after cancellation must not resurrect a disposed page state.
  if (signal?.aborted || !value || typeof value !== 'object' || Array.isArray(value)) fail('unavailable');
  return value;
}

export async function loadTennisControlAccount({ fetchImpl = globalThis.fetch, signal } = {}) {
  const account = await clientJson(fetchImpl, '/api/accounts/session', { signal });
  if (account.user?.emailVerified !== true || !USER.test(account.user?.id || '') || !CSRF.test(account.csrfToken || '')) fail('account_required');
  return { userId: account.user.id, csrfToken: account.csrfToken };
}

async function post(action, body, { csrfToken, fetchImpl = globalThis.fetch, signal } = {}) {
  if (!CSRF.test(csrfToken || '')) fail('account_required');
  return clientJson(fetchImpl, `/api/accounts/control/${action}`, { method: 'POST', body, csrfToken, signal });
}
export async function readTennisControlCurrent(options) { return validateControlCurrent(await post('current', {}, options)); }
export async function prepareTennisControl({ idempotencyKey, termsVersion, termsAccepted }, options) {
  if (!IDEM.test(idempotencyKey || '') || !text(termsVersion) || termsAccepted !== true) fail('invalid_request');
  const result = await post('prepare', { idempotencyKey, termsVersion }, options);
  if (typeof result.duplicate !== 'boolean') fail('unavailable');
  return { order: validateControlOrder(result.order), duplicate: result.duplicate };
}
export async function initiateTennisControl({ orderId, locale }, options) {
  if (!CONTROL_ORDER.test(orderId || '') || !site.locales.includes(locale)) fail('invalid_request');
  const result = await post('initiate', { orderId, locale }, options);
  const order = validateControlOrder(result.order);
  if (order.id !== orderId) fail('unavailable');
  return { order, session: validateControlSession(result.session) };
}
export async function readTennisControlStatus({ orderId }, options) {
  if (!CONTROL_ORDER.test(orderId || '')) fail('invalid_request');
  return validateControlStatus(await post('status', { orderId }, options), orderId);
}

/** One idempotency key per accepted terms version; a new version needs a new key. */
export function createTennisControlAttempt(makeKey = () => globalThis.crypto.randomUUID()) {
  let previous, key;
  return Object.freeze({ keyFor(termsVersion) {
    if (!text(termsVersion)) fail('invalid_request');
    if (previous !== termsVersion) {
      const generated = makeKey();
      if (!IDEM.test(generated || '')) fail('invalid_request');
      previous = termsVersion; key = generated;
    }
    return key;
  } });
}

/* ---------------------------------------------------------------- bank return and storage */

/**
 * The gateway returns the payer to this page with resultIndicator/sessionVersion in the query
 * (interaction.returnUrl) or with an SDK action flag in the fragment. Both are observations,
 * never evidence: the values are dropped and the URL is cleaned before any request.
 */
export function readTennisControlReturn(location) {
  const search = typeof location?.search === 'string' ? location.search : '';
  const hash = typeof location?.hash === 'string' ? location.hash : '';
  const fields = new URLSearchParams(search);
  const returned = ['resultIndicator', 'sessionVersion', 'checkoutVersion'].some(key => fields.has(key)) || /^#__hc-action-/.test(hash);
  return { returned, href: typeof location?.pathname === 'string' ? location.pathname : '/' };
}

export function clearCheckoutSdkStorage(storage) {
  try { for (const key of CONTROL_SDK_STORAGE_KEYS) storage?.removeItem(key); } catch { /* Storage may be blocked; nothing depends on it. */ }
}

/* ---------------------------------------------------------------- renderer */

const sdkReady = api => Boolean(api) && typeof api.configure === 'function' && typeof api.showEmbeddedPage === 'function';

function defaultLoadScript(doc, url, attributes, timeoutMs) {
  return new Promise((resolve, reject) => {
    const script = doc.createElement('script');
    script.src = url; script.async = true;
    for (const [name, value] of Object.entries(attributes)) script.setAttribute(name, value);
    const timer = setTimeout(() => { settle(new Error('sdk_timeout')); }, timeoutMs);
    const settle = error => { clearTimeout(timer); script.onload = script.onerror = null; error ? reject(error) : resolve(); };
    script.onload = () => settle(); script.onerror = () => settle(new Error('sdk_load_failed'));
    doc.head.appendChild(script);
  });
}

/**
 * Loads the gateway SDK once and mounts the Embedded Page into a container. Callbacks reach the
 * active handler only; a late callback after unmount is dropped. The SDK is never asked for a
 * payment result: every callback is reported as an event for an authenticated status read.
 */
export function createCheckoutRenderer({ win = globalThis.window, doc = globalThis.document, loadScript = defaultLoadScript, timeoutMs = 20000, sdkUrl = CONTROL_SDK_URL } = {}) {
  if (!win || !doc) fail('unavailable');
  let loading = null, current = null, mounted = false;
  const dispatch = (event, detail) => { const handler = current; if (handler) { try { handler(event, detail); } catch { /* Handler errors never reach the SDK. */ } } };
  win[CONTROL_CALLBACK_GLOBAL] = Object.freeze({ complete: detail => dispatch('complete', detail), error: detail => dispatch('error', detail), timeout: detail => dispatch('timeout', detail) });
  async function ensureSdk() {
    if (sdkReady(win.Checkout)) return win.Checkout;
    loading ||= loadScript(doc, sdkUrl, { 'data-complete': `${CONTROL_CALLBACK_GLOBAL}.complete`, 'data-error': `${CONTROL_CALLBACK_GLOBAL}.error`, 'data-timeout': `${CONTROL_CALLBACK_GLOBAL}.timeout` }, timeoutMs)
      .catch(error => { loading = null; throw error; });
    await loading;
    if (!sdkReady(win.Checkout)) fail('sdk_incompatible');
    return win.Checkout;
  }
  async function mount({ sessionId, container, handler }) {
    if (!SESSION_ID.test(sessionId || '') || !container || typeof container.id !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]*$/.test(container.id) || typeof handler !== 'function') fail('invalid_request');
    if (mounted) fail('already_mounted');
    let api;
    try { api = await ensureSdk(); } catch (error) { throw error instanceof TennisControlClientError ? error : new TennisControlClientError('sdk_unavailable'); }
    current = handler; mounted = true;
    clearCheckoutSdkStorage(win.sessionStorage);
    try {
      await Promise.resolve(api.configure({ session: { id: sessionId } }));
      await Promise.resolve(api.showEmbeddedPage(`#${container.id}`));
    } catch { unmount(container); fail('mount_failed'); }
    return true;
  }
  function unmount(container) {
    current = null; mounted = false;
    try { doc.getElementById('hc-comms-layer-iframe')?.remove(); } catch { /* Already removed. */ }
    try { if (container) container.replaceChildren(); } catch { /* Container already detached. */ }
    clearCheckoutSdkStorage(win.sessionStorage);
  }
  return Object.freeze({ ensureSdk, mount, unmount, get mounted() { return mounted; } });
}
