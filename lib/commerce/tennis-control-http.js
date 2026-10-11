/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/** Unregistered own-account preparation/status handlers. Neither operation initiates payment. */
import { ApiError, badRequest, forbidden, unavailable } from '../platform/errors';
import { correlationId } from '../platform/ids';
import { resolveTennisControlRuntime, TENNIS_CONTROL_RUNTIME_CONTRACT } from './tennis-control-runtime';

const ORIGIN = 'https://maximus.tennis';
const ORDER = /^MX-CTL-[0-9a-f]{32}$/;
const USER = /^usr_[0-9A-HJKMNP-TV-Z]{20}$/;
const ORDER_STATES = new Set(['issued', 'creating', 'uncertain', 'session_created', 'expired', 'review_required']);
const PROOF_STATES = new Set(['pending', 'captured', 'partially_refunded', 'refunded', 'review_required']);
const REASONS = new Set(['provider_history_requires_review', 'provider_observation_requires_review', 'provider_history_changed']);
const HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store, private', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' };
const iso = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(Date.parse(value)).toISOString() === value;
const text = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
const minor = value => typeof value === 'string' && /^(0|[1-9]\d{0,2})$/.test(value) && BigInt(value) <= 100n;
const reply = (status, code, cid, fields = {}) => new Response(JSON.stringify({ code, ...(status >= 400 ? { messageKey: `errors.${code}`, retryable: status >= 500 || status === 408 || status === 429 } : {}), ...fields, correlationId: cid }), { status, headers: { ...HEADERS, 'X-Correlation-ID': cid, ...(status === 405 ? { Allow: 'POST' } : {}) } });

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
  const fields = action === 'prepare' ? ['idempotencyKey', 'termsVersion'] : ['orderId'];
  if (!p || typeof p !== 'object' || Array.isArray(p) || Object.keys(p).length !== fields.length || fields.some(key => !Object.hasOwn(p, key))) throw badRequest('invalid_request');
  if (action === 'prepare' ? typeof p.idempotencyKey !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(p.idempotencyKey) || !text(p.termsVersion, 200) || /[\r\n\t]/.test(p.termsVersion) : !ORDER.test(p.orderId || '')) throw badRequest('invalid_request');
  return p;
}

/** A second allowlist at HTTP prevents an accidental private service field reaching a browser. */
function projection(result, action, now) {
  const o = result?.order;
  if (!o || !ORDER.test(o.id || '') || o.kind !== 'payment_control' || o.currency !== 'USD' || o.totalMinor !== '100' || o.fulfillment !== 'none' || !ORDER_STATES.has(o.status) || o.paymentVerified !== false || o.rendererReady !== false || o.financialProductEnabled !== false || !iso(o.createdAt) || Date.parse(o.createdAt) > now || !(o.localSessionDeadline === null || iso(o.localSessionDeadline)) || !text(o.terms?.version, 200) || !text(o.terms?.text, 16000) || !Number.isSafeInteger(o.terms?.acceptedAt) || o.terms.acceptedAt !== Date.parse(o.createdAt)) throw unavailable('unavailable');
  if (o.localSessionDeadline !== null && Date.parse(o.localSessionDeadline) <= now && o.status !== 'expired') throw unavailable('unavailable');
  const order = { id: o.id, kind: o.kind, currency: 'USD', totalMinor: '100', fulfillment: 'none', status: o.status,
    terms: { version: o.terms.version, text: o.terms.text, acceptedAt: o.terms.acceptedAt }, createdAt: o.createdAt, localSessionDeadline: o.localSessionDeadline,
    paymentVerified: false, rendererReady: false, financialProductEnabled: false };
  let proof = null;
  if (result.proof !== null) {
    const p = result.proof;
    if (action !== 'status' || !p || p.orderId !== o.id || !PROOF_STATES.has(p.status) || p.currency !== 'USD' || p.totalMinor !== '100' || !minor(p.capturedMinor) || !minor(p.refundedMinor) || BigInt(p.refundedMinor) > BigInt(p.capturedMinor) || !Number.isInteger(p.movementCount) || p.movementCount < 0 || p.movementCount > 20 || !iso(p.observedAt) || Date.parse(p.observedAt) > now || !(p.reason === null || REASONS.has(p.reason)) || p.ledgerPosted !== false) throw unavailable('unavailable');
    if ((p.status === 'pending' && (p.capturedMinor !== '0' || p.refundedMinor !== '0' || p.movementCount !== 0)) || (['captured', 'partially_refunded', 'refunded'].includes(p.status) && (p.capturedMinor !== '100' || p.movementCount < 1)) || (p.status === 'captured' && p.refundedMinor !== '0') || (p.status === 'partially_refunded' && (p.refundedMinor === '0' || p.refundedMinor === '100')) || (p.status === 'refunded' && p.refundedMinor !== '100') || (p.status === 'review_required' ? !REASONS.has(p.reason) : p.reason !== null)) throw unavailable('unavailable');
    proof = { status: p.status, currency: 'USD', totalMinor: '100', capturedMinor: p.capturedMinor, refundedMinor: p.refundedMinor, movementCount: p.movementCount, observedAt: p.observedAt, reason: p.reason, ledgerPosted: false };
  }
  if (action === 'prepare' && typeof result.duplicate !== 'boolean') throw unavailable('unavailable');
  return { order, proof, ...(action === 'prepare' ? { duplicate: result.duplicate } : {}), initiationAvailable: false, rendererReady: false };
}

export async function handleTennisControlRequest(request, action, { runtimeFactory = resolveTennisControlRuntime, bodyTimeoutMs = 5000, now = () => Date.now() } = {}) {
  const cid = correlationId();
  if (request.method !== 'POST') return reply(405, 'method_not_allowed', cid);
  try {
    if (!['prepare', 'status'].includes(action)) throw badRequest('invalid_request');
    if (!Number.isInteger(bodyTimeoutMs) || bodyTimeoutMs < 1 || bodyTimeoutMs > 5000) throw unavailable('unavailable');
    const runtime = await runtimeFactory();
    const service = runtime?.service, readiness = service?.readiness;
    if (readiness?.contract !== TENNIS_CONTROL_RUNTIME_CONTRACT || readiness.preparationReady !== true || readiness.observationReady !== true || readiness.runtimeEnabled !== false || readiness.initiationAvailable !== false || readiness.rendererReady !== false || typeof service[action] !== 'function' || typeof runtime.authenticateCustomer !== 'function') return reply(503, 'control_unconfigured', cid);
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
    const result = await service[action]({ ctx, ...p, ...(action === 'prepare' ? { signal: request.signal } : {}) });
    await authenticate(ctx); // Account/membership rereads alone do not revalidate the session.
    const fields = projection(result, action, now());
    if (action === 'status' && fields.order.id !== p.orderId) throw unavailable('unavailable');
    return reply(action === 'prepare' && !fields.duplicate ? 201 : 200, action === 'prepare' ? 'control_prepared' : 'control_status', cid, fields);
  } catch (error) {
    const codes = { 400: 'invalid_request', 401: 'unauthorized', 403: 'forbidden', 404: 'not_found', 408: 'body_timeout', 409: 'conflict', 413: 'too_large', 415: 'unsupported_media_type', 429: 'rate_limited' };
    if (error instanceof ApiError && Object.hasOwn(codes, error.status)) return reply(error.status, codes[error.status], cid);
    return reply(503, 'unavailable', cid);
  }
}
