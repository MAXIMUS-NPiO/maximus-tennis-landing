/** Analytics consent (localStorage). Analytics loads only when a measurement ID exists AND consent is "granted". */
import { STORAGE_KEYS } from "./storage";

export const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || "";
export const ANALYTICS_CONFIGURED = /^G-[A-Z0-9]{4,}$/.test(GA_ID);

export function getConsent() {
  try {
    const v = window.localStorage.getItem(STORAGE_KEYS.consent);
    return v === "granted" || v === "denied" ? v : null;
  } catch {
    return null;
  }
}

export function setConsent(value) {
  try {
    window.localStorage.setItem(STORAGE_KEYS.consent, value === "granted" ? "granted" : "denied");
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new CustomEvent("mx:consent", { detail: value }));
  } catch {
    /* ignore */
  }
}
