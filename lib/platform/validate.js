/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/**
 * Small declarative validator for platform payloads. Pure JavaScript, shared by the server (which
 * applies it authoritatively), the web cabinet and the iOS client (same rules, same codes).
 * Codes are the stable strings of the intake schema: required · invalid · too_long · too_short ·
 * invalid_email · invalid_choice · not_number · out_of_range · decimal_not_supported · too_many.
 */
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const LINEBREAK_RE = /[\r\n\u2028\u2029]/;
export const EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
const COUNTRY_RE = /^[A-Z]{2}$/;

export const text = (max, o = {}) => ({ type: "text", max, ...o });
export const textarea = (max, o = {}) => ({ type: "textarea", max, ...o });
export const email = (o = {}) => ({ type: "email", max: 254, ...o });
export const oneOf = (values, o = {}) => ({ type: "enum", values, ...o });
export const many = (values, max, o = {}) => ({ type: "multi", values, max, ...o });
export const int = (min, max, o = {}) => ({ type: "int", min, max, ...o });
export const bool = (o = {}) => ({ type: "bool", ...o });
export const country = (o = {}) => ({ type: "country", ...o });
export const obj = (fields, o = {}) => ({ type: "object", fields, ...o });
export const any = (o = {}) => ({ type: "any", ...o });

export function isBlank(v) {
  return v === undefined || v === null || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);
}

export function parseStrictInt(raw) {
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return { error: "not_number" };
    if (!Number.isInteger(raw)) return { error: "decimal_not_supported" };
    return { value: raw };
  }
  if (typeof raw !== "string") return { error: "not_number" };
  const s = raw.trim();
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    return Number.isSafeInteger(n) ? { value: n } : { error: "out_of_range" };
  }
  if (/^-?\d*[.,]\d+$/.test(s)) return { error: "decimal_not_supported" };
  if (/^-\d+$/.test(s)) return { error: "out_of_range" };
  return { error: "not_number" };
}

export function checkField(spec, raw) {
  if (isBlank(raw)) return spec.required ? { error: "required" } : { value: undefined };
  switch (spec.type) {
    case "text":
    case "textarea": {
      if (typeof raw !== "string") return { error: "invalid" };
      const v = spec.type === "text" ? raw.trim() : raw.replace(/\r\n/g, "\n").trim();
      if (CONTROL_RE.test(v)) return { error: "invalid" };
      if (spec.type === "text" && LINEBREAK_RE.test(v)) return { error: "invalid" };
      if (v.length > spec.max) return { error: "too_long" };
      if (spec.min && v.length < spec.min) return { error: "too_short" };
      if (spec.pattern && !spec.pattern.test(v)) return { error: "invalid" };
      return { value: v };
    }
    case "email": {
      if (typeof raw !== "string") return { error: "invalid_email" };
      const v = raw.trim();
      if (v.length > spec.max || !EMAIL_RE.test(v)) return { error: "invalid_email" };
      return { value: v };
    }
    case "enum":
      return typeof raw === "string" && spec.values.includes(raw) ? { value: raw } : { error: "invalid_choice" };
    case "multi": {
      if (!Array.isArray(raw)) return { error: "invalid_choice" };
      const uniq = [...new Set(raw)];
      if (uniq.some((x) => typeof x !== "string" || !spec.values.includes(x))) return { error: "invalid_choice" };
      if (uniq.length > spec.max) return { error: "too_many" };
      return { value: uniq };
    }
    case "int": {
      const p = parseStrictInt(raw);
      if (p.error) return p;
      if (p.value < spec.min || p.value > spec.max) return { error: "out_of_range" };
      return { value: p.value };
    }
    case "bool":
      return typeof raw === "boolean" ? { value: raw } : { error: "invalid" };
    case "country": {
      if (typeof raw !== "string") return { error: "invalid" };
      const v = raw.trim().toUpperCase();
      return COUNTRY_RE.test(v) ? { value: v } : { error: "invalid_choice" };
    }
    case "object": {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { error: "invalid" };
      const r = validate(spec.fields, raw);
      return r.ok ? { value: r.value } : { error: "invalid", nested: r.errors };
    }
    case "any":
      return { value: raw };
    default:
      return { error: "invalid" };
  }
}

/** Validates `input` against `fields`; unknown keys are dropped (never mass-assigned). */
export function validate(fields, input, prefix = "") {
  const value = {};
  const errors = {};
  const src = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  for (const [k, spec] of Object.entries(fields)) {
    const r = checkField(spec, src[k]);
    if (r.error) {
      if (r.nested) for (const [nk, code] of Object.entries(r.nested)) errors[`${prefix}${k}.${nk}`] = code;
      else errors[prefix + k] = r.error;
    } else if (r.value !== undefined) value[k] = r.value;
  }
  return { ok: Object.keys(errors).length === 0, value, errors };
}
