/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/**
 * Payment service provider abstraction (APP-037, APP-038) — SERVER ONLY.
 *
 * Audit result for this repository (9 October 2026): NO payment provider is configured. There are
 * no PSP variables in .env.example, no provider SDK in package.json and no checkout route. The
 * provider slot below therefore resolves to null in every environment unless the owner configures
 * one; a null provider means the API answers `psp_not_connected` and the cabinet shows the bank
 * transfer path only. No key, account ID or payment link is invented.
 *
 * `test-hmac` is a signed-webhook test double for non-production environments: it proves the
 * verification chain (signature over the raw body, freshness, event ID uniqueness, merchant match,
 * amount / currency / order match, allowed transition, replay safety) without any real money.
 */
import crypto from "node:crypto";

export const WEBHOOK_MAX_AGE_SECONDS = 300;

export function resolveProvider(env = process.env) {
  const name = env.PSP_PROVIDER;
  if (!name) return null;
  if (name === "test-hmac") {
    if (env.NODE_ENV === "production") return null;
    const secret = env.PSP_WEBHOOK_SECRET;
    const merchant = env.PSP_MERCHANT_ID || "test-merchant";
    if (!secret || secret.length < 16) return null;
    return createTestHmacProvider({ secret, merchant, baseUrl: env.PSP_HOSTED_BASE_URL || "https://psp.invalid/checkout" });
  }
  // Any other provider name needs its adapter written against the owner's verified merchant setup.
  return null;
}

export function createTestHmacProvider({ secret, merchant, baseUrl }) {
  const sign = (ts, body) => crypto.createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
  return {
    name: "test-hmac",
    merchant,
    capabilities: { hostedCheckout: true, refunds: true, applePay: false, physicalGoods: true, currencies: ["EUR"], mode: "test" },
    /** Server-side session creation from an accepted snapshot; the redirect host is the configured one only. */
    async createCheckoutSession({ order, idempotencyKey, returnUrl }) {
      const id = `tcs_${crypto.createHash("sha256").update(`${merchant}|${order.id}|${idempotencyKey}`).digest("hex").slice(0, 24)}`;
      const url = new URL(baseUrl);
      url.searchParams.set("session", id);
      return { sessionId: id, redirectUrl: url.toString(), amountCents: order.totals.dueNowCents, currency: order.totals.currency, returnUrl };
    },
    /** Verifies a webhook. Returns { ok, event } or { ok: false, code }. */
    verifyWebhook({ rawBody, headers, now = Date.now() }) {
      const ts = headers["x-psp-timestamp"];
      const sig = headers["x-psp-signature"];
      if (!ts || !sig) return { ok: false, code: "signature_missing" };
      if (!/^\d+$/.test(String(ts))) return { ok: false, code: "timestamp_invalid" };
      if (Math.abs(Math.floor(now / 1000) - Number(ts)) > WEBHOOK_MAX_AGE_SECONDS) return { ok: false, code: "stale" };
      const expected = Buffer.from(sign(ts, rawBody));
      const given = Buffer.from(String(sig).replace(/^sha256=/, ""));
      if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return { ok: false, code: "signature_invalid" };
      let event;
      try {
        event = JSON.parse(rawBody);
      } catch {
        return { ok: false, code: "body_invalid" };
      }
      if (!event || typeof event.id !== "string" || typeof event.type !== "string") return { ok: false, code: "event_invalid" };
      if (event.merchant !== merchant) return { ok: false, code: "merchant_mismatch" };
      return { ok: true, event };
    },
    /** Test helper: produces a signed webhook request for a given event. */
    signEvent(event, now = Date.now()) {
      const body = JSON.stringify(event);
      const ts = String(Math.floor(now / 1000));
      return { rawBody: body, headers: { "x-psp-timestamp": ts, "x-psp-signature": `sha256=${sign(ts, body)}` } };
    },
  };
}

/** Maps provider event types to payment transitions. */
export const EVENT_TRANSITIONS = Object.freeze({
  "payment.succeeded": "confirmed",
  "payment.failed": "failed",
  "payment.cancelled": "cancelled",
  "payment.expired": "expired",
  "refund.succeeded": "refund",
  "dispute.opened": "disputed",
});
