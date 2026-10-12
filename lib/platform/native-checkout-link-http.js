/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/** Server-only preparation boundary. It never publishes an order or starts a payment. */
import { ApiError, badRequest, unavailable } from "./errors";
import { correlationId } from "./ids";
import { getVerifiedPortalOrderContext } from "./portal";

const MAX_BYTES = 1024;
const ORDER_RE = /^MX-ORD-[0-9a-f]{32}$/;
const KEY_RE = /^[A-Za-z0-9_-]{8,128}$/;
const STATES = new Set(["prepared", "publishing", "uncertain", "bound", "expired", "review_required"]);
const HEADERS = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store, private", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };

function response(status, code, cid, fields = {}, headers = {}) {
  const errorFields = status >= 400 ? { messageKey: `errors.${code}`, retryable: status >= 500 || status === 408 || status === 429 } : {};
  return new Response(JSON.stringify({ code, ...errorFields, ...fields, correlationId: cid }), {
    status, headers: { ...HEADERS, "X-Correlation-ID": cid, ...headers },
  });
}

/** No installed, inspected native publisher/resolver exists in this checkout.
 * Flags alone cannot activate this route. A future reviewed server runtime must supply
 * the service whose own readiness validates those adapters, mapping and durable store.
 */
export async function resolveNativeCheckoutLinkHttpRuntime() {
  return { service: null, authenticateCustomer: getVerifiedPortalOrderContext };
}

async function readPreparationBody(request, timeoutMs) {
  const type = (request.headers.get("content-type") || "").split(";", 1)[0].trim().toLowerCase();
  if (type !== "application/json") throw new ApiError(415, "unsupported_media_type");
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_BYTES)) throw new ApiError(413, "too_large");
  if (!request.body) throw badRequest("invalid_request");
  const reader = request.body.getReader(), decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0, text = "", timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new ApiError(408, "body_timeout")), timeoutMs); });
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), timeout]);
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) throw new ApiError(413, "too_large");
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } catch (error) {
    void reader.cancel().catch(() => {});
    if (error instanceof ApiError) throw error;
    throw badRequest("invalid_request");
  } finally { clearTimeout(timer); }
  let body;
  try { body = JSON.parse(text); } catch { throw badRequest("invalid_request"); }
  if (!body || Array.isArray(body) || typeof body !== "object" || Object.keys(body).length !== 1 || !Object.hasOwn(body, "idempotencyKey") || !KEY_RE.test(body.idempotencyKey) || typeof body.idempotencyKey !== "string") throw badRequest("invalid_request");
  return body.idempotencyKey;
}

function orderCapability(request) {
  const auth = request.headers.get("authorization") || "";
  const match = /^Bearer ([A-Za-z0-9._~-]{1,200})$/.exec(auth);
  if (!match) throw new ApiError(401, "unauthorized");
  return match[1];
}

function publicPreparation(result) {
  if (!result || typeof result.intentId !== "string" || !/^nci_[0-9a-f]{64}$/.test(result.intentId) || !STATES.has(result.status) || result.bindingReady !== (result.status === "bound") || typeof result.expiresAt !== "string" || result.expiresAt.length > 30 || !Number.isFinite(Date.parse(result.expiresAt))) throw unavailable("unavailable");
  return { intentId: result.intentId, status: result.status, expiresAt: result.expiresAt, bindingReady: result.bindingReady };
}

/** DI is reserved for local verification; the production route passes no dependencies. */
export async function handleNativeCheckoutLinkRequest(request, orderId, {
  env = process.env, runtimeFactory = resolveNativeCheckoutLinkHttpRuntime, bodyTimeoutMs = 5000,
} = {}) {
  const cid = correlationId();
  if (request.method !== "POST") return response(405, "method_not_allowed", cid, {}, { Allow: "POST" });
  if (env.PORTAL_ENABLED !== "true" || env.PORTAL_RUNTIME_VERIFIED !== "true") return response(503, "native_checkout_link_unconfigured", cid);
  if (!Number.isSafeInteger(bodyTimeoutMs) || bodyTimeoutMs < 1 || bodyTimeoutMs > 5000) return response(503, "unavailable", cid);
  try {
    const runtime = await runtimeFactory({ env });
    if (runtime?.service?.readiness?.ready !== true || typeof runtime.service.prepare !== "function" || typeof runtime.authenticateCustomer !== "function") return response(503, "native_checkout_link_unconfigured", cid);
    if (typeof orderId !== "string" || !ORDER_RE.test(orderId) || new URL(request.url).search) throw badRequest("invalid_request");
    const accessToken = orderCapability(request);
    // Authentication and same-origin CSRF use the existing mandatory portal boundary.
    const ctx = await runtime.authenticateCustomer(request, { requireCsrf: true });
    if (!ctx || ctx.organizationId !== "maximus-tennis" || ctx.emailVerified !== true || !/^usr_[0-9A-HJKMNP-TV-Z]{20}$/.test(ctx.userId || "")) throw new ApiError(403, "forbidden");
    const idempotencyKey = await readPreparationBody(request, bodyTimeoutMs);
    const result = await runtime.service.prepare({ ctx, orderId, accessToken, idempotencyKey });
    return response(200, "native_checkout_link_prepared", cid, publicPreparation(result));
  } catch (error) {
    // Never pass adapter/store messages, raw proof, native IDs or field details to a client.
    const codes = { 400: "invalid_request", 401: "unauthorized", 403: "forbidden", 404: "not_found", 408: "body_timeout", 409: "conflict", 413: "too_large", 415: "unsupported_media_type", 429: "rate_limited" };
    if (error instanceof ApiError && Object.hasOwn(codes, error.status)) return response(error.status, codes[error.status], cid);
    return response(503, "unavailable", cid);
  }
}
