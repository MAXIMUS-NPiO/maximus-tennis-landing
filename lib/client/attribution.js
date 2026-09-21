/**
 * Campaign attribution — first touch per browser session.
 * Stored: landing path, locale, utm_* (sanitised). Ad click IDs are kept only with analytics consent.
 * Never stored: full URLs, referrers, query strings beyond the allowlist.
 */
import { sanitizeAttribution, UTM_KEYS, CLICK_ID_KEYS } from "../intake/schema";
import { STORAGE_KEYS, readJson, writeJson } from "./storage";
import { getConsent } from "./consent";

export function captureAttribution(locale) {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  const incoming = { landing_path: window.location.pathname, locale };
  let hasCampaign = false;
  for (const k of UTM_KEYS) if (params.get(k)) { incoming[k] = params.get(k); hasCampaign = true; }
  if (getConsent() === "granted") for (const k of CLICK_ID_KEYS) if (params.get(k)) { incoming[k] = params.get(k); hasCampaign = true; }
  const current = readJson(STORAGE_KEYS.attribution);
  const currentHasCampaign = current && UTM_KEYS.concat(CLICK_ID_KEYS).some((k) => current[k]);
  if (!current || (hasCampaign && !currentHasCampaign)) writeJson(STORAGE_KEYS.attribution, sanitizeAttribution(incoming));
}

export function getAttribution() {
  const a = sanitizeAttribution(readJson(STORAGE_KEYS.attribution) || {});
  if (getConsent() !== "granted") for (const k of CLICK_ID_KEYS) delete a[k];
  return a;
}
