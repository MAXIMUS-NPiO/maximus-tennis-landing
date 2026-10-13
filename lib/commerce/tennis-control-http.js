/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/**
 * Own-account payment-control HTTP boundary: prepare, initiate, status, current, readiness.
 * Verified portal session + CSRF + exact origin on every action; the account is reauthenticated
 * after the body is read and after service work. Responses are private/no-store and pass a second
 * allowlist so no private service field (authorization, correlation, provider order, proof rows)
 * can reach a browser. The session descriptor is returned only by `initiate`, only to the owner,
 * only while the local attempt window is open.
 */
import { ApiError, badRequest, forbidden, unavailable } from '../platform/errors';
import { correlationId } from '../platform/ids';
import { site } from '../../data/site';
import { resolveTennisControlRuntime, TENNIS_CONTROL_RUNTIME_CONTRACT, TENNIS_CONTROL_EMBEDDED_CONTRACT, TENNIS_CONTROL_PAYMENT_STATES } from './tennis-control-runtime';

const ORIGIN = 'https://maximus.tennis';
const ACTIONS = new Set(['prepare', 'initiate', 'status', 'current', 'readiness']);
const ORDER = /^MX-CTL-[0-9a-f]{32}$/;
const USER = /^usr_[0-9A-HJKMNP-TV-Z]{20}$/;
const ORDER_STATES = new Set(['issued', 'creating', 'uncertain', 'session_created', 'expired', 'review_required']);
const PROOF_STATES = new Set(['pending', 'captured', 'partially_refunded', 'refunded', 'review_required']);
const REASONS = new Set(['provider_history_requires_review', 'provider_observation_requires_review', 'provider_history_changed']);
const PAYMENT_STATES = new Set(TENNIS_CONTROL_PAYMENT_STATES);
const GATEWAY_TOKEN = /^[A-Z][A-Z0-9_]{0,39}$/;
const HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store, private', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' };
const iso = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(Date.parse(value)).toISOString() === value;
const text = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
const minor = value => typeof value === 'string' && /^(0|[1-9]\d{0,2})$/.test(value) && BigInt(value) <= 100n;
const reply = (status, code, cid, fields = {}) => new Response(JSON.stringify({ code, ...(status >= 400 ? { messageKey: `errors.${code}`, retryable: status >= 500 || status === 408 || status === 429 } : {}), ...fields, correlationId: cid }), { status, headers: { ...HEADERS, 'X-Correlation-ID': cid, ...(status === 405 ? { Allow: 'POST' } : {}) } });
const BODY_FIELDS = { prepare: ['idempotencyKey', 'termsVersion'], initiate: ['orderId', 'locale'], status: ['orderId'], current: [], readiness: [] };

async function body(request, action, timeoutMs) {
  if ((request.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase() !== 'application/json') throw new ApiError(415, 'unsupported_media_type');
  const length = request.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > 1024)) throw new ApiError(413, 'too_large');
  if (!request.body) throw badRequest('invalid_request');
  const reader = request.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true });
  let timer, count = 0, source = '';
  const expiry = new Promise((_, reject) => { timer = setTimeout(() => reject(new ApiError(408, 'body_timeout')), timeoutMs); });
  try {
    while (true) {
      const chunk = await Promise.race([reader.read(), expiry]);
      if (chunk.done) break;
      count += chunk.value.byteLength;
      if (count > 1024) throw new ApiError(413, 'too_large');
      source += decoder.decode(chunk.value, { stream: true });
    }
    source += decoder.decode();
  } catch (error) {
    void reader.cancel().catch(() => {});
    if (error instanceof ApiError) throw error;
    throw badRequest('invalid_request');
  } finally { clearTimeout(timer); }
  let p;
  try { p = JSON.parse(source); } catch { throw badRequest('invalid_request'); }
  const fields = BODY_FIELDS[action];
  if (!p || typeof p !== 'object' || Array.isArray(p) || Object.keys(p).length !== fields.length || fields.some(key => !Object.hasOwn(p, key))) throw badRequest('invalid_request');
  if (action === 'prepare' && (typeof p.idempotencyKey !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(p.idempotencyKey) || !text(p.termsVersion, 200) || /[\r\n\t]/.test(p.termsVersion))) throw badRequest('invalid_request');
  if ((action === 'initiate' || action === 'status') && !ORDER.test(p.orderId || '')) throw badRequest('invalid_request');
  if (action === 'initiate' && !site.locales.includes(p.locale)) throw badRequest('invalid_request');
  return p;
}

function projectOrder(o, now) {
  if (!o || !ORDER.test(o.id || '') || o.kind !== 'payment_control' || o.currency !== 'USD' || o.totalMinor !== '100' || o.fulfillment !== 'none' || !ORDER_STATES.has(o.status) || o.paymentVerified !== false || o.financialProductEnabled !== false || !iso(o.createdAt) || Date.parse(o.createdAt) > now || !(o.localSessionDeadline === null || iso(o.localSessionDeadline)) || !text(o.terms?.version, 200) || !text(o.terms?.text, 16000) || !Number.isSafeInteger(o.terms?.acceptedAt) || o.terms.acceptedAt !== Date.parse(o.createdAt)) throw unavailable('unavailable');
  if (o.localSessionDeadline !== null && Date.parse(o.localSessionDeadline) <= now && o.status !== 'expired') throw unavailable('unavailable');
  return { id: o.id, kind: o.kind, currency: 'USD', totalMinor: '100', fulfillment: 'none', status: o.status,
    terms: { version: o.terms.version, text: o.terms.text, acceptedAt: o.terms.acceptedAt }, createdAt: o.createdAt, localSessionDeadline: o.localSessionDeadline, financialProductEnabled: false };
}
function projectProof(p, order, now) {
  if (p === null || p === undefined) return null;
  if (!p || p.orderId !== order.id || !PROOF_STATES.has(p.status) || p.currency !== 'USD' || p.totalMinor !== '100' || !minor(p.capturedMinor) || !minor(p.refundedMinor) || BigInt(p.refundedMinor) > BigInt(p.capturedMinor) || !Number.isInteger(p.movementCount) || p.movementCount < 0 || p.movementCount > 20 || !iso(p.observedAt) || Date.parse(p.observedAt) > now || !(p.reason === null || REASONS.has(p.reason)) || p.ledgerPosted !== false) throw unavailable('unavailable');
  if ((p.status === 'pending' && (p.capturedMinor !== '0' || p.refundedMinor !== '0' || p.movementCount !== 0)) || (['captured', 'partially_refunded', 'refunded'].includes(p.status) && (p.capturedMinor !== '100' || p.movementCount < 1)) || (p.status === 'captured' && p.refundedMinor !== '0') || (p.status === 'partially_refunded' && (p.refundedMinor === '0' || p.refundedMinor === '100')) || (p.status === 'refunded' && p.refundedMinor !== '100') || (p.status === 'review_required' ? !REASONS.has(p.reason) : p.reason !== null)) throw unavailable('unavailable');
  return { status: p.status, currency: 'USD', totalMinor: '100', capturedMinor: p.capturedMinor, refundedMinor: p.refundedMinor, movementCount: p.movementCount, observedAt: p.observedAt, reason: p.reason, ledgerPosted: false };
}
const token = value => value === null || value === undefined ? null : typeof value === 'string' && GATEWAY_TOKEN.test(value) ? value : 'UNKNOWN';
function projectObservation(w, now) {
  if (w === null || w === undefined) return null;
  if (typeof w.present !== 'boolean' || !iso(w.observedAt) || Date.parse(w.observedAt) > now) throw unavailable('unavailable');
  if (!w.present) return { present: false, observedAt: w.observedAt };
  if (typeof w.currencyMatches !== 'boolean' || typeof w.amountMatches !== 'boolean' || !Number.isInteger(w.transactionCount) || w.transactionCount < 0) throw unavailable('unavailable');
  const last = w.lastTransaction ? { type: token(w.lastTransaction.type), result: token(w.lastTransaction.result), gatewayCode: token(w.lastTransaction.gatewayCode) } : null;
  return { present: true, observedAt: w.observedAt, orderStatus: token(w.orderStatus), currencyMatches: w.currencyMatches, amountMatches: w.amountMatches, transactionCount: Math.min(w.transactionCount, 1000), lastTransaction: last };
}
function projectSession(s) {
  if (s === null || s === undefined) return null;
  if (s.contract !== TENNIS_CONTROL_EMBEDDED_CONTRACT || s.serverVerified !== true || !/^SESSION[A-Za-z0-9_-]{10,100}$/.test(s.sessionId || '') || s.gatewayOrigin !== 'https://ap-gateway.mastercard.com' || s.sdkUrl !== 'https://ap-gateway.mastercard.com/static/checkout/checkout.min.js' || s.sdkVersion !== '100' || !iso(s.expiresAt)) throw unavailable('unavailable');
  return { contract: s.contract, serverVerified: true, sessionId: s.sessionId, gatewayOrigin: s.gatewayOrigin, sdkUrl: s.sdkUrl, sdkVersion: s.sdkVersion, expiresAt: s.expiresAt };
}
function projectMerchant(m) {
  if (!m || !['ok', 'unavailable'].includes(m.status) || !iso(m.checkedAt) || !(m.usdPermitted === null || typeof m.usdPermitted === 'boolean') || !Array.isArray(m.currencies) || !Array.isArray(m.threeDSecureSchemes)) throw unavailable('unavailable');
  return { status: m.status, checkedAt: m.checkedAt, usdPermitted: m.usdPermitted, cardPayments: m.cardPayments === true, currencies: m.currencies.filter(c => /^[A-Z]{3}$/.test(c)).slice(0, 200), threeDSecureSchemes: m.threeDSecureSchemes.filter(c => /^[A-Z_]{1,30}$/.test(c)).slice(0, 50) };
}
const payment = value => { if (!PAYMENT_STATES.has(value)) throw unavailable('unavailable'); return value; };

/** A second allowlist at HTTP prevents an accidental private service field reaching a browser. */
function projection(result, action, now) {
  if (action === 'readiness') {
    if (result?.configured !== true || result.embeddedContract !== TENNIS_CONTROL_EMBEDDED_CONTRACT || result.sdk?.version !== '100' || typeof result.webhookConfigured !== 'boolean') throw unavailable('unavailable');
    return { configured: true, merchant: projectMerchant(result.merchant), webhookConfigured: result.webhookConfigured, sdk: { url: 'https://ap-gateway.mastercard.com/static/checkout/checkout.min.js', version: '100', mount: 'showEmbeddedPage' }, embeddedContract: TENNIS_CONTROL_EMBEDDED_CONTRACT };
  }
  if (action === 'current') {
    if (typeof result?.owner !== 'boolean') throw unavailable('unavailable');
    if (!result.owner) return { owner: false };
    if (!text(result.terms?.version, 200) || !text(result.terms?.text, 16000) || typeof result.canOpen !== 'boolean' || typeof result.webhookConfigured !== 'boolean') throw unavailable('unavailable');
    const order = result.order ? projectOrder(result.order, now) : null;
    return { owner: true, canOpen: result.canOpen, terms: { version: result.terms.version, text: result.terms.text }, webhookConfigured: result.webhookConfigured, order,
      proof: order ? projectProof(result.proof, order, now) : null, observation: order ? projectObservation(result.observation, now) : null, payment: order ? payment(result.payment) : null };
  }
  const order = projectOrder(result?.order, now);
  if (action === 'prepare') {
    if (typeof result.duplicate !== 'boolean') throw unavailable('unavailable');
    return { order, duplicate: result.duplicate };
  }
  if (action === 'initiate') return { order, session: projectSession(result.session) };
  return { order, proof: projectProof(result.proof, order, now), observation: projectObservation(result.observation, now), payment: payment(result.payment) };
}

export async function handleTennisControlRequest(request, action, { runtimeFactory = resolveTennisControlRuntime, bodyTimeoutMs = 5000, now = () => Date.now() } = {}) {
  const cid = correlationId();
  if (request.method !== 'POST') return reply(405, 'method_not_allowed', cid);
  try {
    if (!ACTIONS.has(action)) throw badRequest('invalid_request');
    if (!Number.isInteger(bodyTimeoutMs) || bodyTimeoutMs < 1 || bodyTimeoutMs > 5000) throw unavailable('unavailable');
    const runtime = await runtimeFactory();
    const service = runtime?.service, readiness = service?.readiness;
    if (readiness?.contract !== TENNIS_CONTROL_RUNTIME_CONTRACT || readiness.runtimeEnabled !== true || readiness.initiationAvailable !== true || readiness.financialProductEnabled !== false || typeof runtime.authenticateCustomer !== 'function') return reply(503, 'control_unconfigured', cid);
    const url = new URL(request.url);
    if (url.search || url.hash || url.username || url.password || request.headers.has('authorization')) throw badRequest('invalid_request');
    if (url.origin !== ORIGIN || request.headers.get('origin') !== ORIGIN || ['cross-site', 'same-site'].includes(request.headers.get('sec-fetch-site'))) throw forbidden('origin_invalid');
    const authenticate = async previous => {
      const current = await runtime.authenticateCustomer(request, { requireCsrf: true });
      if (!current || current.emailVerified !== true || current.organizationId !== 'maximus-tennis' || !USER.test(current.userId || '') || (previous && current.userId !== previous.userId)) throw forbidden('forbidden');
      return current;
    };
    const ctx = await authenticate();
    const p = await body(request, action, bodyTimeoutMs);
    await authenticate(ctx); // A slow request body must not outlive logout/session revocation.
    const signal = ['prepare', 'initiate', 'readiness'].includes(action) ? { signal: request.signal } : {};
    const result = action === 'readiness' ? await service.readinessFor({ ctx, ...signal }) : await service[action]({ ctx, ...p, ...signal });
    await authenticate(ctx); // Account/membership rereads alone do not revalidate the session.
    const fields = projection(result, action, now());
    if ((action === 'status' || action === 'initiate') && fields.order.id !== p.orderId) throw unavailable('unavailable');
    const codes = { prepare: fields.duplicate ? 'control_prepared' : 'control_prepared', initiate: 'control_initiated', status: 'control_status', current: 'control_current', readiness: 'control_readiness' };
    return reply(action === 'prepare' && !fields.duplicate ? 201 : 200, codes[action], cid, fields);
  } catch (error) {
    const codes = { 400: 'invalid_request', 401: 'unauthorized', 403: 'forbidden', 404: 'not_found', 408: 'body_timeout', 409: 'conflict', 413: 'too_large', 415: 'unsupported_media_type', 429: 'rate_limited' };
    if (error instanceof ApiError && Object.hasOwn(codes, error.status)) {
      // Owner-facing reasons that are safe and needed to act: the account is not the configured owner,
      // or the acquirer does not permit the control currency. Everything else stays generic.
      const detail = ['control_owner_mismatch', 'control_currency_not_permitted', 'control_terms_mismatch', 'control_authorization_expired'].includes(error.code) ? { reason: error.code } : {};
      return reply(error.status, codes[error.status], cid, detail);
    }
    return reply(503, 'unavailable', cid);
  }
}
