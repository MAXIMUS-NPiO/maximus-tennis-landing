/**
 * Measurement boundary (client). Events are sent to GA4 only when a measurement ID is configured
 * AND the visitor granted analytics consent. Parameters are an allowlist of short tokens:
 * no contacts, request text, engraving, information about children, full URLs or referrers.
 * lead_submit_success is reported to GA4 as "generate_lead", once per request (deduplicated).
 */
import { STORAGE_KEYS, readJson, writeJson } from "./client/storage";
import { getConsent } from "./client/consent";

export const EVENTS = [
  "primary_cta_click", "series_view", "gps_started", "gps_completed", "config_started", "config_completed",
  "lead_form_started", "lead_submit_attempt", "lead_submit_success", "lead_submit_error",
];
const PARAMS = ["locale", "purpose", "series", "cta", "route", "error_code", "step"];
const TOKEN = /^[A-Za-z0-9_.\-]{1,40}$/;
const PATH = /^\/[A-Za-z0-9/_\-]{0,199}$/;

function fnv(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16);
}

export function cleanParams(params = {}) {
  const out = {};
  for (const k of PARAMS) {
    const v = params[k];
    if (typeof v === "string" && (k === "route" ? PATH.test(v) : TOKEN.test(v))) out[k] = v;
  }
  return out;
}

export function track(name, params = {}) {
  if (typeof window === "undefined" || !EVENTS.includes(name)) return;
  const clean = cleanParams(params);
  if (name === "lead_submit_success") {
    if (!params.request_id) return;
    const h = fnv(String(params.request_id));
    const seen = readJson(STORAGE_KEYS.conversions) || [];
    if (Array.isArray(seen) && seen.includes(h)) return;
    writeJson(STORAGE_KEYS.conversions, [...(Array.isArray(seen) ? seen : []), h].slice(-20));
  }
  if (window.__MX_ANALYTICS_TEST__) (window.__mxEvents = window.__mxEvents || []).push({ name, params: clean });
  if (getConsent() === "granted" && typeof window.gtag === "function") {
    window.gtag("event", name === "lead_submit_success" ? "generate_lead" : name, clean);
  }
}
