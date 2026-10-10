/**
 * Authenticated server-to-server events from MAXIMUS Baby Tennis.
 * No browser credentials, channel fallback, request logging, or recipient discovery.
 * The existing durable intake queue remains responsible for notification retries.
 */
import crypto from "node:crypto";
import { createTelegramNotifier, deliver } from "./notify";

export const SITE_EVENT_SOURCE = "maximus-baby-tennis";
export const MAX_SITE_EVENT_BYTES = 12 * 1024;
const SIGNATURE_WINDOW_SECONDS = 300;
const EVENTS = new Set(["registration.created", "inquiry.created", "connection.test"]);
const TOP_KEYS = new Set(["source", "event", "event_id", "created_at", "contact", "details"]);
const CONTACT_KEYS = new Set(["name", "email"]);
const DETAIL_KEYS = new Set(["message", "role", "country", "quantity"]);
const CHAT_ID = /^-?[1-9]\d{0,19}$/;
const BASE_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
};

export function siteEventResponse(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...BASE_HEADERS, ...extraHeaders } });
}

const failure = (http, code) => siteEventResponse(http, { ok: false, code });
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const plainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const allowedKeys = (value, keys) => plainObject(value) && Object.keys(value).every((key) => keys.has(key));
const controls = /[\u0000-\u001f\u007f]/;
const messageControls = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

function canonical(value) {
  if (plainObject(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function boundedText(value, limit, multiline = false) {
  if (typeof value !== "string" || value.length > limit || (multiline ? messageControls : controls).test(value)) return null;
  return value.trim();
}

function validatePayload(input, now) {
  if (!allowedKeys(input, TOP_KEYS) || Object.keys(input).length !== TOP_KEYS.size) return null;
  if (input.source !== SITE_EVENT_SOURCE || !EVENTS.has(input.event)) return null;
  if (typeof input.event_id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(input.event_id)) return null;
  if (typeof input.created_at !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(input.created_at)) return null;
  const createdAt = Date.parse(input.created_at);
  if (!Number.isFinite(createdAt) || new Date(createdAt).toISOString() !== input.created_at || createdAt > now + SIGNATURE_WINDOW_SECONDS * 1000) return null;
  if (!allowedKeys(input.contact, CONTACT_KEYS) || !allowedKeys(input.details, DETAIL_KEYS)) return null;

  const contact = {};
  for (const key of Object.keys(input.contact)) {
    const value = boundedText(input.contact[key], key === "email" ? 254 : 160);
    if (value === null) return null;
    if (value) contact[key] = value;
  }
  if (contact.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)) return null;
  if (input.event !== "connection.test" && !contact.email) return null;

  const details = {};
  for (const key of Object.keys(input.details)) {
    if (key === "quantity") {
      if (!Number.isSafeInteger(input.details.quantity) || input.details.quantity < 0 || input.details.quantity > 1000000) return null;
      details.quantity = input.details.quantity;
      continue;
    }
    const limit = key === "message" ? 2000 : key === "country" ? 100 : 120;
    const value = boundedText(input.details[key], limit, key === "message");
    if (value === null) return null;
    if (value) details[key] = value;
  }
  if (input.event === "inquiry.created" && !details.message) return null;
  return { source: input.source, event: input.event, event_id: input.event_id, created_at: input.created_at, contact, details };
}

/** Reads at most 12 KiB, even when Content-Length is absent or dishonest. */
async function readBody(request) {
  const header = request.headers.get("content-length");
  if (header !== null && !/^\d+$/.test(header)) return { error: "invalid_request", http: 400 };
  const declared = header === null ? null : Number(header);
  if (declared !== null && (!Number.isSafeInteger(declared) || declared > MAX_SITE_EVENT_BYTES)) return { error: "too_large", http: 413 };
  if (!request.body) return { error: "invalid_request", http: 400 };
  let reader;
  try {
    reader = request.body.getReader();
  } catch {
    return { error: "invalid_request", http: 400 };
  }
  const chunks = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_SITE_EVENT_BYTES) {
        await reader.cancel().catch(() => {});
        return { error: "too_large", http: 413 };
      }
      chunks.push(Buffer.from(value));
    }
  } catch {
    return { error: "invalid_request", http: 400 };
  } finally {
    reader.releaseLock();
  }
  if (declared !== null && declared !== bytes) return { error: "invalid_request", http: 400 };
  return { bytes: Buffer.concat(chunks, bytes) };
}

/**
 * Pins only the existing owner destination. A fresh notifier per send prevents the
 * shared notifier's 400/403 recovery from ever rediscovering a different recipient.
 */
export async function fixedOwnerTelegramDelivery({ env, store, telegram, notifierFactory = createTelegramNotifier }) {
  if (!store || !telegram || (env.LEAD_NOTIFY_CHANNEL && env.LEAD_NOTIFY_CHANNEL !== "telegram")) return null;
  if (typeof telegram.token !== "string" || !/^\d{6,}:[A-Za-z0-9_-]{20,}$/.test(telegram.token)) return null;
  if (env.TELEGRAM_CHAT_ID && (typeof env.TELEGRAM_CHAT_ID !== "string" || !CHAT_ID.test(env.TELEGRAM_CHAT_ID))) return null;
  const chatId = env.TELEGRAM_CHAT_ID || (await store.setting("telegram_chat"));
  if (typeof chatId !== "string" || !CHAT_ID.test(chatId)) return null;
  return {
    store,
    notifier: {
      channel: "telegram",
      async send(record) {
        return notifierFactory({ token: telegram.token, chatId }, { store }).send(record);
      },
    },
  };
}

function accepted(input, requestId, lead) {
  const state = lead?.notify?.status;
  if (state === "sent") {
    const messageId = lead.notify.message_id;
    return siteEventResponse(200, {
      ok: true, status: "delivered", event_id: input.event_id, request_id: requestId,
      ...(typeof messageId === "string" && /^tg-\d{1,20}$/.test(messageId) ? { message_id: messageId } : {}),
    });
  }
  if (["pending", "retry", "not_configured"].includes(state)) {
    return siteEventResponse(202, { ok: true, status: "queued", event_id: input.event_id, request_id: requestId });
  }
  return failure(503, "temporarily_unavailable");
}

/**
 * HMAC: SHA256(secret, ASCII(timestamp) + "." + exact raw request bytes).
 * Authentication happens before configuration/store access. Replays with a current
 * timestamp return the same durable ID and do not retry or duplicate the send.
 */
export async function handleSiteEvent(request, { secret, getDeliveryConfig, now = Date.now(), deliverImpl = deliver }) {
  if (request.method !== "POST") return siteEventResponse(405, { ok: false, code: "method_not_allowed" }, { Allow: "POST" });
  if (typeof secret !== "string" || secret.length < 32) return failure(503, "temporarily_unavailable");
  const timestamp = request.headers.get("x-maximus-timestamp") || "";
  const signature = request.headers.get("x-maximus-signature") || "";
  if (!/^\d{10}$/.test(timestamp) || !/^sha256=[a-f0-9]{64}$/.test(signature)) return failure(401, "unauthorized");
  if (Math.abs(Math.floor(now / 1000) - Number(timestamp)) > SIGNATURE_WINDOW_SECONDS) return failure(401, "unauthorized");
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get("content-type") || "")) return failure(415, "unsupported_media_type");
  const encoding = request.headers.get("content-encoding");
  if (encoding && encoding.toLowerCase() !== "identity") return failure(415, "unsupported_media_type");
  const raw = await readBody(request);
  if (raw.error) return failure(raw.http, raw.error);
  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.`).update(raw.bytes).digest();
  if (!crypto.timingSafeEqual(expected, Buffer.from(signature.slice(7), "hex"))) return failure(401, "unauthorized");

  let input;
  try {
    input = validatePayload(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw.bytes)), now);
  } catch {
    return failure(400, "invalid_request");
  }
  if (!input) return failure(400, "invalid_request");

  try {
    const config = await getDeliveryConfig();
    if (!config?.store || config.notifier?.channel !== "telegram") return failure(503, "temporarily_unavailable");
    const store = config.store;
    const identityHash = hash(`site-event:${input.source}:${input.event_id}`);
    const requestId = `MX-BABY-${identityHash.slice(0, 32).toUpperCase()}`;
    const payloadHash = hash(canonical(input));
    let existing = await store.getLead(requestId);
    if (existing) {
      if (existing.record?.payload_hash !== payloadHash) return failure(409, "event_conflict");
      return accepted(input, requestId, existing);
    }

    const purpose = input.event === "connection.test"
      ? "MAXIMUS BABY TENNIS — TEST connection"
      : input.event === "registration.created" ? "MAXIMUS BABY TENNIS — registration" : "MAXIMUS BABY TENNIS — inquiry";
    const record = {
      schema: 1,
      request_id: requestId,
      created_at: input.created_at,
      purpose,
      locale: "en",
      contact: input.contact,
      details: input.details,
      context: {
        source: input.source,
        event: input.event,
        event_id: input.event_id,
        admin_url: "https://maximusbabytennis.com/#community",
      },
      payload_hash: payloadHash,
    };
    const result = await store.createLead({ idemHash: identityHash, requestId, record });
    if (result.requestId !== requestId) return failure(503, "temporarily_unavailable");
    // Atomic creation resolves concurrent requests. Verify the winner before sending.
    existing = await store.getLead(requestId);
    if (!existing || existing.record?.payload_hash !== payloadHash) return failure(existing ? 409 : 503, existing ? "event_conflict" : "temporarily_unavailable");
    if (result.created) {
      try {
        await deliverImpl(store, config.notifier, requestId, now);
      } catch {
        // The durable pending record survives transport/storage failures. Read its
        // persisted state below; never expose exceptions or claim unverified delivery.
      }
      existing = await store.getLead(requestId);
    }
    return accepted(input, requestId, existing);
  } catch {
    return failure(503, "temporarily_unavailable");
  }
}

/** Authenticated daily-cron recovery of the Baby site's own durable outbox. */
export async function retryBabyOutbox({ secret, fetchImpl = fetch, now = Date.now } = {}) {
  const result = { disabled: false, failed: false, processed: 0, relayed: 0 };
  if (typeof secret !== "string" || secret.length < 32) return { ...result, disabled: true };
  try {
    const timestamp = String(Math.floor(now() / 1000));
    if (!/^\d{10}$/.test(timestamp)) return { ...result, failed: true };
    const signature = crypto.createHmac("sha256", secret).update(`${timestamp}.retry-baby-owner-notifications`).digest("hex");
    const response = await fetchImpl("https://maximusbabytennis.com/api/notifications/flush", {
      method: "POST",
      headers: { "X-Maximus-Timestamp": timestamp, "X-Maximus-Signature": `sha256=${signature}` },
      body: "",
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(25000),
    });
    if (!response.ok) return { ...result, failed: true };
    const data = await response.json();
    if (data?.configured !== true || !Number.isInteger(data.processed) || data.processed < 0 || data.processed > 5
      || !Number.isInteger(data.relayed) || data.relayed < 0 || data.relayed > data.processed) return { ...result, failed: true };
    return { ...result, processed: data.processed, relayed: data.relayed };
  } catch {
    return { ...result, failed: true };
  }
}
