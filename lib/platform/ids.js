/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/** Identifiers: stable, unguessable, prefixed by type. Unguessability is never used as authorisation. */
import crypto from "node:crypto";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function crock(n) {
  let s = "";
  for (const b of crypto.randomBytes(n)) s += CROCKFORD[b & 31];
  return s;
}

/** usr_…, cfg_…, ord_… — 20 Crockford characters of entropy. */
export function newId(prefix) {
  return `${prefix}_${crock(20)}`;
}

/** Human-facing numbers in the existing MX-<CODE>-YYYYMMDD-XXXXXX style. */
export function newNumber(code, date = new Date()) {
  const stamp = date.toISOString().slice(0, 10).replace(/-/g, "");
  return `MX-${code}-${stamp}-${crock(6)}`;
}

export const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

export function correlationId() {
  return `c_${crock(16)}`;
}

/** Stable serialisation (sorted keys) for payload hashing — the same rule as the intake service. */
export function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`;
  return JSON.stringify(v === undefined ? null : v);
}

export const hashPayload = (v) => sha256(canonical(v));

/** Constant-time comparison of two secrets of possibly different length. */
export function safeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb) && String(a).length === String(b).length;
}
