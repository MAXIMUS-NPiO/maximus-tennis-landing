/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/** Browser-only checkout review. No payment evidence, storage, analytics or provider transport. */
import { site } from '../../data/site';

const ORDER = /^MX-ORD-[0-9a-f]{32}$/;
const TOKEN = /^[0-9]{13}\.[0-9a-f]{64}$/;
const IDEM = /^[A-Za-z0-9_-]{8,128}$/;
const STATES = new Set(['ready', 'creating', 'uncertain', 'review_required', 'expired']);
const text = (value, max = 200) => typeof value === 'string' && value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);

export class TennisCheckoutClientError extends Error {
  constructor(code = 'session_unavailable') { super(code); this.code = code; }
}
const fail = code => { throw new TennisCheckoutClientError(code); };
export const validTennisOrderId = value => typeof value === 'string' && ORDER.test(value);

/** Legacy access capabilities are accepted only from the fragment and remain in component memory. */
export function readTennisCheckoutFragment(fragment) {
  if (typeof fragment !== 'string' || fragment.length > 512) return null;
  const fields = new URLSearchParams(fragment.replace(/^#/, ''));
  if ([...fields.keys()].some(key => !['order', 'access'].includes(key)) || fields.getAll('order').length !== 1 || fields.getAll('access').length > 1 || !validTennisOrderId(fields.get('order'))) return null;
  const accessToken = fields.get('access');
  if (accessToken !== null && !TOKEN.test(accessToken)) return null;
  return { orderId: fields.get('order'), ...(accessToken ? { accessToken } : {}) };
}

export function tennisCheckoutHref(locale, orderId) {
  if (!site.locales.includes(locale) || !validTennisOrderId(orderId)) fail('invalid_request');
  return `/${locale}/checkout#order=${orderId}`;
}

/** Program interest is a request for conditions; it never changes the goods payment total. */
export function tennisPurchaseReview(snapshot) {
  const programPending = snapshot?.purchaseIntent === 'goods_with_program_interest';
  const request = snapshot?.programRequest;
  const result = { labelKey: programPending ? 'goodsAndProgram' : 'goodsOnly', programPending };
  if (programPending && request?.status === 'terms_requested' && typeof request.requestedPrincipalMinor === 'string' && /^[1-9][0-9]{0,7999}$/.test(request.requestedPrincipalMinor) && ['EUR', 'AED', 'USD'].includes(request.currency)) {
    result.requestedPrincipalMinor = request.requestedPrincipalMinor;
    result.currency = request.currency;
  }
  return result;
}

/** A frontend eligibility check cannot approve an offer; the server rechecks its original snapshot. */
export function canRequestTennisCheckout(order, now = Date.now()) {
  const s = order?.snapshot, offer = s?.offer, quote = s?.quotation;
  return validTennisOrderId(order?.id) && s?.schema === 1 && s.projectId === 'tennis' && s.plan === 'A' &&
    s.paymentPreference === 'payment_link' && s.technical?.final === true && s.fulfillment?.verified === true &&
    offer?.approved === true && text(offer.evidence) && text(offer.termsVersion) && text(offer.termsText, 16000) &&
    Number.isSafeInteger(offer.totalMinor) && offer.totalMinor > 0 && /^[A-Z]{3}$/.test(offer.currency || '') &&
    Number.isFinite(Date.parse(offer.expiresAt)) && Date.parse(offer.expiresAt) > now &&
    quote?.test === false && quote.status === 'quotation' && text(quote.number) && !quote.number.startsWith('TEST-') && quote.orderId === order.id &&
    quote.projectId === 'tennis' && quote.currency === offer.currency && quote.totalMinor === offer.totalMinor && quote.termsVersion === offer.termsVersion &&
    !order.invoice?.test && !order.invoice?.number?.startsWith('TEST-') && ['ready', 'pending'].includes(order.payment?.status);
}

export function createTennisCheckoutAttempt(makeKey = () => globalThis.crypto.randomUUID()) {
  let previous, key;
  return Object.freeze({ keyFor({ orderId, termsVersion }) {
    if (!validTennisOrderId(orderId) || !text(termsVersion)) fail('invalid_request');
    const signature = JSON.stringify([orderId, termsVersion]);
    if (previous !== signature) {
      const generated = makeKey();
      if (typeof generated !== 'string' || !IDEM.test(generated)) fail('invalid_request');
      previous = signature; key = generated;
    }
    return key;
  } });
}

async function clientJson(fetchImpl, path, { method = 'GET', body, csrfToken, signal } = {}) {
  let response, value;
  try {
    response = await fetchImpl(path, { method, credentials: 'same-origin', mode: 'same-origin', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', signal,
      headers: { ...(method === 'POST' ? { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (response.redirected) fail('session_unavailable');
    if (!response.ok) fail([401, 403].includes(response.status) ? 'account_required' : response.status === 404 ? 'order_unavailable' : 'session_unavailable');
    value = await response.json();
  } catch (error) { if (error instanceof TennisCheckoutClientError) throw error; fail('session_unavailable'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('session_unavailable');
  return value;
}

export async function loadTennisCheckout(orderId, { fetchImpl = globalThis.fetch, signal } = {}) {
  if (!validTennisOrderId(orderId)) fail('invalid_request');
  const account = await clientJson(fetchImpl, '/api/accounts/session', { signal });
  if (account.user?.emailVerified !== true || !/^usr_[0-9A-HJKMNP-TV-Z]{20}$/.test(account.user?.id || '') || !text(account.csrfToken) || !/^[A-Za-z0-9_-]{20,200}$/.test(account.csrfToken)) fail('account_required');
  const result = await clientJson(fetchImpl, `/api/accounts/orders/${orderId}`, { signal });
  const order = result.order;
  if (order?.id !== orderId || order.snapshot?.schema !== 1 || order.snapshot.projectId !== 'tennis' || (order.snapshot.customerUserId && order.snapshot.customerUserId !== account.user.id)) fail('order_unavailable');
  // Session details beyond the verified subject and CSRF never enter payment state.
  return { order, session: { userId: account.user.id, csrfToken: account.csrfToken } };
}

export function validateTennisCheckoutResult(value, { locale, now = Date.now() } = {}) {
  if (!site.locales.includes(locale) || !value || !STATES.has(value.status) || !site.locales.some(supported => value.checkoutPath === `/${supported}/checkout`) || typeof value.checkoutHandle !== 'string' || !/^tco_[A-Za-z0-9_-]{43}$/.test(value.checkoutHandle)) fail('session_unavailable');
  const expires = value.expiresAt === null ? null : typeof value.expiresAt === 'string' && value.expiresAt.length <= 30 ? Date.parse(value.expiresAt) : NaN;
  if (expires !== null && (!Number.isFinite(expires) || (value.status === 'ready' && expires <= now))) fail('session_unavailable');
  if (expires !== null && new Date(expires).toISOString() !== value.expiresAt) fail('session_unavailable');
  if (value.status === 'ready' && expires === null) fail('session_unavailable');
  let embedded = null;
  if (value.embedded !== null) {
    const d = value.embedded;
    if (value.status !== 'ready' || !d || d.contract !== 'mpgs_hosted_checkout_embedded_v1' || d.serverVerified !== true || d.gatewayOrigin !== 'https://ap-gateway.mastercard.com' || d.sdkVersion !== '100' || typeof d.sessionId !== 'string' || !/^SESSION[A-Za-z0-9_-]{10,100}$/.test(d.sessionId)) fail('session_unavailable');
    embedded = { contract: d.contract, serverVerified: true, gatewayOrigin: d.gatewayOrigin, sdkVersion: d.sdkVersion, sessionId: d.sessionId };
  }
  if (value.status === 'ready' && !embedded) fail('session_unavailable');
  // The original order locale may differ from the current page. Validate and discard
  // checkoutPath; it is never used for navigation. A ready session is still not paid.
  return { status: value.status, checkoutHandle: value.checkoutHandle, expiresAt: value.expiresAt, embedded };
}

export async function requestTennisCheckout({ orderId, locale, termsVersion, idempotencyKey, csrfToken, termsAccepted }, { fetchImpl = globalThis.fetch, signal, now } = {}) {
  if (!validTennisOrderId(orderId) || !site.locales.includes(locale) || !text(termsVersion) || typeof idempotencyKey !== 'string' || !IDEM.test(idempotencyKey) || !/^[A-Za-z0-9_-]{20,200}$/.test(csrfToken || '') || termsAccepted !== true) fail('invalid_request');
  const result = await clientJson(fetchImpl, `/api/accounts/orders/${orderId}/checkout`, {
    method: 'POST', body: { idempotencyKey, termsVersion }, csrfToken, signal,
  });
  return validateTennisCheckoutResult(result, { locale, ...(now === undefined ? {} : { now }) });
}
