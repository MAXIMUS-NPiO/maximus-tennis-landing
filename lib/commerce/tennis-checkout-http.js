/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/** Own-account checkout POST. Production transport intentionally remains unconfigured. */
import { ApiError, badRequest, unavailable } from '../platform/errors';
import { correlationId } from '../platform/ids';
import { getVerifiedPortalOrderContext } from '../platform/portal';
import { TENNIS_EMBEDDED_CONTRACT } from './tennis-checkout';
import { site } from '../../data/site';

const HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store, private', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' };
const STATES = new Set(['creating', 'uncertain', 'ready', 'review_required', 'expired']);
const validTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(Date.parse(value)).toISOString() === value;
const reply = (status, code, cid, fields = {}) => new Response(JSON.stringify({ code, ...(status >= 400 ? { messageKey: `errors.${code}`, retryable: status >= 500 || status === 408 || status === 429 } : {}), ...fields, correlationId: cid }), { status, headers: { ...HEADERS, 'X-Correlation-ID': cid, ...(status === 405 ? { Allow: 'POST' } : {}) } });
export async function resolveTennisCheckoutRuntime() {
  // No credentials, store, provider transport or evidence is constructed/read here.
  return { service: null, authenticateCustomer: getVerifiedPortalOrderContext };
}
async function body(request, timeoutMs) {
  if ((request.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase() !== 'application/json') throw new ApiError(415, 'unsupported_media_type');
  const length = request.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > 1024)) throw new ApiError(413, 'too_large');
  if (!request.body) throw badRequest('invalid_request');
  const reader = request.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true }); let timer, bytes = 0, text = '';
  const expiry = new Promise((_, reject) => { timer = setTimeout(() => reject(new ApiError(408, 'body_timeout')), timeoutMs); });
  try {
    while (true) {
      const chunk = await Promise.race([reader.read(), expiry]); if (chunk.done) break;
      bytes += chunk.value.byteLength; if (bytes > 1024) throw new ApiError(413, 'too_large');
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
  } catch (error) { void reader.cancel().catch(() => {}); if (error instanceof ApiError) throw error; throw badRequest('invalid_request'); }
  finally { clearTimeout(timer); }
  let p; try { p = JSON.parse(text); } catch { throw badRequest('invalid_request'); }
  if (!p || typeof p !== 'object' || Array.isArray(p) || Object.keys(p).length !== 2 || !Object.hasOwn(p, 'idempotencyKey') || !Object.hasOwn(p, 'termsVersion') || typeof p.idempotencyKey !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(p.idempotencyKey) || typeof p.termsVersion !== 'string' || p.termsVersion.length < 1 || p.termsVersion.length > 200 || /[\u0000-\u001f\u007f]/.test(p.termsVersion)) throw badRequest('invalid_request');
  return p;
}
function publicResult(p, now) {
  if (!p || !STATES.has(p.status) || !/^tco_[A-Za-z0-9_-]{43}$/.test(p.checkoutHandle || '') || !site.locales.some(locale => p.checkoutPath === `/${locale}/checkout`) || !(p.expiresAt === null || validTime(p.expiresAt))) throw unavailable('unavailable');
  let embedded = null;
  if (p.status === 'ready') {
    const e = p.embedded;
    if (!e || e.contract !== TENNIS_EMBEDDED_CONTRACT || e.serverVerified !== true || e.gatewayOrigin !== 'https://ap-gateway.mastercard.com' || e.sdkVersion !== '100' || !/^SESSION[A-Za-z0-9_-]{10,100}$/.test(e.sessionId || '') || !validTime(p.expiresAt) || Date.parse(p.expiresAt) <= now) throw unavailable('unavailable');
    embedded = { contract: e.contract, serverVerified: true, sessionId: e.sessionId, gatewayOrigin: e.gatewayOrigin, sdkVersion: e.sdkVersion };
  } else if (p.embedded !== null) throw unavailable('unavailable');
  return { status: p.status, checkoutPath: p.checkoutPath, checkoutHandle: p.checkoutHandle, expiresAt: p.expiresAt, embedded };
}
export async function handleTennisCheckoutRequest(request, orderId, { env = process.env, runtimeFactory = resolveTennisCheckoutRuntime, now = () => Date.now(), bodyTimeoutMs = 5000 } = {}) {
  const cid = correlationId();
  if (request.method !== 'POST') return reply(405, 'method_not_allowed', cid);
  if (env.PORTAL_ENABLED !== 'true' || env.PORTAL_RUNTIME_VERIFIED !== 'true') return reply(503, 'checkout_unconfigured', cid);
  try {
    if (!Number.isInteger(bodyTimeoutMs) || bodyTimeoutMs < 1 || bodyTimeoutMs > 5000) throw unavailable('unavailable');
    const runtime = await runtimeFactory({ env });
    if (runtime?.service?.readiness?.ready !== true || typeof runtime.service.checkout !== 'function' || typeof runtime.authenticateCustomer !== 'function') return reply(503, 'checkout_unconfigured', cid);
    if (!/^MX-ORD-[0-9a-f]{32}$/.test(orderId || '') || new URL(request.url).search || request.headers.has('authorization')) throw badRequest('invalid_request');
    const ctx = await runtime.authenticateCustomer(request, { requireCsrf: true });
    if (!ctx || ctx.emailVerified !== true || ctx.organizationId !== 'maximus-tennis' || !/^usr_[0-9A-HJKMNP-TV-Z]{20}$/.test(ctx.userId || '')) throw new ApiError(403, 'forbidden');
    const p = await body(request, bodyTimeoutMs);
    const result = await runtime.service.checkout({ ctx, orderId, ...p, signal: request.signal });
    return reply(result.status === 'ready' ? 200 : 202, result.status === 'ready' ? 'checkout_ready' : 'checkout_pending', cid, publicResult(result, now()));
  } catch (error) {
    const codes = { 400: 'invalid_request', 401: 'unauthorized', 403: 'forbidden', 404: 'not_found', 408: 'body_timeout', 409: 'conflict', 413: 'too_large', 415: 'unsupported_media_type', 429: 'rate_limited' };
    if (error instanceof ApiError && Object.hasOwn(codes, error.status)) return reply(error.status, codes[error.status], cid);
    return reply(503, 'unavailable', cid);
  }
}
