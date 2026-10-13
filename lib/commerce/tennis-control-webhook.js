/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/**
 * MPGS webhook receiver for payment-control orders. The gateway sends its configured secret in
 * X-Notification-Secret with every notification (Merchant Administration > Webhook Notifications);
 * X-Notification-ID identifies a notification across redeliveries, X-Notification-Attempt counts
 * them. The body is a wake-up only: nothing in it changes an order. After authenticating the
 * secret, the receiver records the delivery, acknowledges with 200 and schedules the same
 * authenticated Retrieve Order verification the owner's status call performs. An unknown order,
 * a declared amount/currency that does not fit the control scope, or a redelivery are all recorded
 * and acknowledged; none of them can mark an order paid or declined.
 */
import { ApiError, badRequest, unavailable } from '../platform/errors';
import { correlationId, safeEqual, sha256, hashPayload } from '../platform/ids';
import { auditWrites, mergeCommits } from '../platform/audit';
import { tennisControlProviderKey } from './tennis-control-order';
import { readTennisControlConfig, resolveTennisControlRuntime, TENNIS_CONTROL_RUNTIME_CONTRACT } from './tennis-control-runtime';

export const TENNIS_CONTROL_WEBHOOK_TYPE = 'tennisControlWebhookEvent';
const HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store, private', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' };
const PROVIDER_ORDER = /^MC[0-9a-f]{32}$/;
const NOTIFICATION_ID = /^[A-Za-z0-9._:-]{1,120}$/;
const GATEWAY_TOKEN = /^[A-Z][A-Z0-9_]{0,39}$/;
const token = value => typeof value === 'string' && GATEWAY_TOKEN.test(value) ? value : value === undefined || value === null ? null : 'UNKNOWN';
const reply = (status, code, cid, fields = {}) => new Response(JSON.stringify({ code, ...fields, correlationId: cid }), { status, headers: { ...HEADERS, 'X-Correlation-ID': cid, ...(status === 405 ? { Allow: 'POST' } : {}) } });

function minorOf(value) {
  const text = typeof value === 'number' && Number.isFinite(value) ? String(value) : typeof value === 'string' ? value : null;
  if (text === null || !/^(0|[1-9]\d{0,12})(?:\.\d{1,3})?$/.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  if (fraction.length === 3 && fraction[2] !== '0') return null;
  return String(BigInt(whole) * 100n + BigInt(fraction.slice(0, 2).padEnd(2, '0')));
}

async function readBody(request, maxBodyBytes, timeoutMs) {
  if ((request.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase() !== 'application/json') throw new ApiError(415, 'unsupported_media_type');
  const length = request.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > maxBodyBytes)) throw new ApiError(413, 'too_large');
  if (!request.body) throw badRequest('invalid_request');
  const reader = request.body.getReader();
  let timer, count = 0; const parts = [];
  const expiry = new Promise((_, reject) => { timer = setTimeout(() => reject(new ApiError(408, 'body_timeout')), timeoutMs); });
  try {
    while (true) {
      const chunk = await Promise.race([reader.read(), expiry]);
      if (chunk.done) break;
      count += chunk.value.byteLength;
      if (count > maxBodyBytes) throw new ApiError(413, 'too_large');
      parts.push(chunk.value);
    }
  } catch (error) {
    void reader.cancel().catch(() => {});
    if (error instanceof ApiError) throw error;
    throw badRequest('invalid_request');
  } finally { clearTimeout(timer); }
  const raw = Buffer.concat(parts, count);
  let parsed;
  try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)); } catch { throw badRequest('invalid_request'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw badRequest('invalid_request');
  return { parsed, digest: sha256(raw) };
}

/** Sanitized, bounded view of what the gateway declared. Recorded for audit, never trusted. */
function declaredOf(p) {
  const order = p.order && typeof p.order === 'object' && !Array.isArray(p.order) ? p.order : {};
  const tx = p.transaction && typeof p.transaction === 'object' && !Array.isArray(p.transaction) ? p.transaction : {};
  const response = p.response && typeof p.response === 'object' && !Array.isArray(p.response) ? p.response : {};
  const amountMinor = minorOf(order.amount), currency = typeof order.currency === 'string' && /^[A-Z]{3}$/.test(order.currency) ? order.currency : null;
  const result = token(p.result), type = token(tx.type), gatewayCode = token(response.gatewayCode), orderStatus = token(order.status);
  const monetary = result === 'SUCCESS' && ['PAYMENT', 'CAPTURE', 'REFUND'].includes(type);
  // A failed attempt is reported with a zero amount; only a successful money movement is compared with the scope.
  const mismatch = monetary && (currency !== 'USD' || amountMinor !== '100');
  return { result, type, gatewayCode, orderStatus, currency, amountMinor, mismatch };
}

export async function handleTennisControlWebhook(request, { runtimeFactory = resolveTennisControlRuntime, env = process.env, schedule, now = () => Date.now(), maxBodyBytes = 65536, bodyTimeoutMs = 5000 } = {}) {
  const cid = correlationId();
  if (request.method !== 'POST') return reply(405, 'method_not_allowed', cid);
  try {
    const config = readTennisControlConfig(env);
    const runtime = await runtimeFactory();
    const service = runtime?.service;
    if (service?.readiness?.contract !== TENNIS_CONTROL_RUNTIME_CONTRACT || service.readiness.runtimeEnabled !== true || typeof service.system?.verify !== 'function') return reply(503, 'control_unconfigured', cid);
    if (!config.notificationSecret) return reply(503, 'webhook_unconfigured', cid);
    // Authentication before any body read: an unauthenticated sender cannot make this route work.
    const supplied = request.headers.get('x-notification-secret') || '';
    if (!supplied || !safeEqual(supplied, config.notificationSecret)) return reply(401, 'unauthorized', cid);
    const { parsed, digest } = await readBody(request, maxBodyBytes, bodyTimeoutMs);
    const { store, merchantId } = service.system;
    const providerOrderId = parsed.order && typeof parsed.order === 'object' && typeof parsed.order.id === 'string' ? parsed.order.id : '';
    if (!PROVIDER_ORDER.test(providerOrderId)) return reply(200, 'webhook_ignored', cid, { received: true, ignored: true });
    const orderId = await store.getUnique('tennis_control_provider', tennisControlProviderKey(merchantId, providerOrderId));
    if (!orderId || !/^MX-CTL-[0-9a-f]{32}$/.test(orderId)) return reply(200, 'webhook_ignored', cid, { received: true, ignored: true });
    const headerId = request.headers.get('x-notification-id') || '';
    const notificationId = NOTIFICATION_ID.test(headerId) ? headerId : `body_${digest}`;
    const attemptHeader = request.headers.get('x-notification-attempt') || '';
    const attempt = /^[1-9]\d{0,3}$/.test(attemptHeader) ? Number(attemptHeader) : null;
    const at = new Date(now()).toISOString(), declared = declaredOf(parsed);
    const id = hashPayload([merchantId, providerOrderId, notificationId]);
    // One durable record per notification identity; redeliveries append their attempt, nothing else.
    for (let retry = 0; retry < 4; retry++) {
      const existing = await store.get(TENNIS_CONTROL_WEBHOOK_TYPE, id);
      const doc = existing ? { ...existing.doc, deliveries: [...existing.doc.deliveries, { at, attempt }].slice(-25), lastReceivedAt: at, redelivered: true }
        : { id, orderId, notificationId: notificationId.startsWith('body_') ? null : notificationId, bodyDigest: digest, firstReceivedAt: at, lastReceivedAt: at, deliveries: [{ at, attempt }], redelivered: false, declared, mismatch: declared.mismatch };
      try {
        await store.commit(mergeCommits({ writes: [{ type: TENNIS_CONTROL_WEBHOOK_TYPE, id, expectedVersion: existing ? existing.version : -1, doc }], indexes: [{ name: `control:webhooks:${orderId}`, member: id, score: now() }] },
          auditWrites({ now: now(), actor: { kind: 'mpgs_webhook' }, action: existing ? 'control.webhook_redelivered' : 'control.webhook_received', objectType: 'control_order', objectId: orderId, correlationId: cid, meta: { attempt, result: declared.result, type: declared.type, gatewayCode: declared.gatewayCode, mismatch: declared.mismatch } })));
        break;
      } catch (error) {
        if (error?.code !== 'version_conflict' || retry === 3) throw unavailable('webhook_save_unconfirmed');
      }
    }
    // The verification is the authenticated Retrieve Order read; its outcome, not this body, is recorded as proof.
    const task = () => service.system.verify({ orderId }).then(() => undefined, () => undefined);
    if (typeof schedule === 'function') schedule(task); else await task();
    return reply(200, 'webhook_received', cid, { received: true, ...(declared.mismatch ? { reviewFlagged: true } : {}) });
  } catch (error) {
    const codes = { 400: 'invalid_request', 401: 'unauthorized', 408: 'body_timeout', 413: 'too_large', 415: 'unsupported_media_type' };
    if (error instanceof ApiError && Object.hasOwn(codes, error.status)) return reply(error.status, codes[error.status], cid);
    return reply(503, 'unavailable', cid);
  }
}
