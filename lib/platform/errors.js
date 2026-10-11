/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/**
 * One error shape for every platform endpoint (APP-051):
 *   { code, messageKey, fieldErrors, correlationId, retryable }
 * Never a stack trace, never SQL, never a token, never another person's field.
 */
export class ApiError extends Error {
  constructor(status, code, { messageKey, fieldErrors, retryable = false, details, headers } = {}) {
    super(code);
    this.status = status;
    this.code = code;
    this.messageKey = messageKey || `errors.${code}`;
    this.fieldErrors = fieldErrors || undefined;
    this.retryable = retryable;
    this.details = details;
    this.headers = headers;
  }
}

export const badRequest = (code, opts) => new ApiError(400, code, opts);
export const unauthorized = (code = "unauthenticated", opts) => new ApiError(401, code, opts);
export const forbidden = (code = "forbidden", opts) => new ApiError(403, code, opts);
export const notFound = (code = "not_found", opts) => new ApiError(404, code, opts);
export const conflict = (code = "conflict", opts) => new ApiError(409, code, opts);
export const unavailable = (code = "unavailable", opts) => new ApiError(503, code, { retryable: true, ...opts });
export const tooMany = (retryAfter) => new ApiError(429, "rate_limited", { retryable: true, headers: { "Retry-After": String(retryAfter) } });

export function validationError(fieldErrors) {
  return new ApiError(400, "validation_failed", { fieldErrors });
}

/** Serialises any thrown value into the uniform body. Unknown errors become 500 without detail. */
export function errorBody(err, correlationId) {
  if (err instanceof ApiError) {
    return {
      status: err.status,
      headers: err.headers || {},
      body: { code: err.code, messageKey: err.messageKey, ...(err.fieldErrors ? { fieldErrors: err.fieldErrors } : {}), ...(err.details ? { details: err.details } : {}), correlationId, retryable: err.retryable },
    };
  }
  if (err && (err.code === "version_conflict" || err.code === "unique_conflict")) {
    return { status: 409, headers: {}, body: { code: err.code, messageKey: `errors.${err.code}`, correlationId, retryable: false } };
  }
  if (err && typeof err.code === "string" && err.code.startsWith("store_")) {
    return { status: 503, headers: { "Retry-After": "10" }, body: { code: "store_unavailable", messageKey: "errors.store_unavailable", correlationId, retryable: true } };
  }
  return { status: 500, headers: {}, body: { code: "internal_error", messageKey: "errors.internal_error", correlationId, retryable: true } };
}
