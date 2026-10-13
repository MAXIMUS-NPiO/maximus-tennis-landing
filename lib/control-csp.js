/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/**
 * Route-scoped security headers for the owner payment-control page only. Edge-safe (no Node
 * imports): the middleware applies them to `/<locale>/checkout/control`, every other page keeps
 * the site-wide headers from next.config.mjs unchanged.
 *
 * Allowed third party: the bank gateway origin alone, for the Checkout SDK script and the
 * Embedded Page frame (gateway reference "Implementing the Hosted Payment Page", API 100). The
 * 3-D Secure challenge is rendered inside the gateway's own frame; a redirect-based challenge is
 * a top-level navigation, which a Content Security Policy does not govern. Next.js receives the
 * nonce through the request header and applies it to its own scripts.
 */
import { site } from "../data/site";

export const CONTROL_GATEWAY_ORIGIN = "https://ap-gateway.mastercard.com";
const CONTROL_PATH = /^\/([a-z]{2,3})\/checkout\/control\/?$/;

/** The locale of a payment-control page path, or null for every other path. */
export function controlPaymentLocale(pathname) {
  const match = CONTROL_PATH.exec(pathname || "");
  return match && site.locales.includes(match[1]) ? match[1] : null;
}

export function controlPaymentNonce(bytes = globalThis.crypto.getRandomValues(new Uint8Array(18))) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function controlPaymentCsp(nonce, { production = true } = {}) {
  if (typeof nonce !== "string" || !/^[A-Za-z0-9+/=]{16,64}$/.test(nonce)) throw new Error("control_csp_nonce_invalid");
  const scripts = [`'self'`, `'nonce-${nonce}'`, CONTROL_GATEWAY_ORIGIN, ...(production ? [] : [`'unsafe-eval'`])];
  const connect = [`'self'`, ...(production ? [] : ["ws:", "wss:"])];
  return [
    "default-src 'none'", "base-uri 'none'", "object-src 'none'", "frame-ancestors 'self'", "form-action 'self'",
    `script-src ${scripts.join(" ")}`, "style-src 'self' 'unsafe-inline'", "img-src 'self' data:", "font-src 'self'",
    `connect-src ${connect.join(" ")}`, `frame-src ${CONTROL_GATEWAY_ORIGIN}`, "manifest-src 'self'", "worker-src 'self'",
    ...(production ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

/** Response headers of the control page besides the policy: never cached, never referred, never indexed. */
export const CONTROL_PAYMENT_HEADERS = Object.freeze({
  "Cache-Control": "no-store, private",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(self \"https://ap-gateway.mastercard.com\")",
});
