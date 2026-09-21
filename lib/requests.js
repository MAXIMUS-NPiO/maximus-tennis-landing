/**
 * Request workflow boundary.
 *
 * CURRENT MODE: "compose" — no server-side delivery, database or CRM is configured for this
 * project (no credentials or providers were supplied). A request therefore becomes a structured
 * email that the visitor sends from their own mail application. Nothing is recorded server-side
 * and the interface never claims that a request was "sent" or "submitted".
 *
 * INTEGRATION BOUNDARY: when an authorised delivery provider exists, implement `submitRequest`
 * with a server route that validates, stores durably, and returns the reference. The public
 * components already treat the returned object as the single source of truth for status.
 */
import { site } from "../data/site";

export const REQUEST_MODE = "compose";

const CODES = {
  product: "PRD", fitting: "FIT", technical: "TEC", coach: "COA", club: "CLB", distribution: "DST",
  brand: "BRD", family: "FAM", institutional: "INS", strategic: "STR", owner: "OWN", network: "NET",
  general: "GEN", gps: "GPS", config: "CFG",
};

export function makeReference(purpose) {
  const d = new Date();
  const stamp = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  let rand = "";
  try {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    rand = a[0].toString(36).toUpperCase().slice(-5).padStart(5, "0");
  } catch {
    rand = Math.floor(Math.random() * 60466176).toString(36).toUpperCase().padStart(5, "0");
  }
  return `MX-${CODES[purpose] || "GEN"}-${stamp}-${rand}`;
}

/** Plain-text summary: one line per field, blank values omitted. */
export function formatSummary(reference, title, entries) {
  const lines = [`${title}`, `Reference: ${reference}`, ""];
  for (const [label, value] of entries) {
    if (value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0)) continue;
    lines.push(`${label}: ${Array.isArray(value) ? value.join(", ") : String(value)}`);
  }
  return lines.join("\n");
}

export function buildMailto(subject, body) {
  return `mailto:${site.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Session-scoped, non-sensitive state (progress only — never names, emails or engraving text). */
export function loadState(key) {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveState(key, value) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable — state stays in memory only */
  }
}

export function clearState(key) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
