/**
 * Request intake service — SERVER ONLY. Framework-independent so that it can be unit-tested.
 *
 * Contract: anti-spam checks → authoritative schema validation → rate limit → durable, idempotent
 * create with a server-generated request_id → response to the visitor → notification of the
 * responsible mailbox with delivery control and retries (after the response).
 *
 * Nothing in this module logs request content. The visitor's IP address is used only as a salted
 * hash inside a short-lived rate-limit counter and is never stored with the request.
 */
import crypto from "node:crypto";
import { validateRequest, sanitizeAttribution, IDEMPOTENCY_RE, GPS_RULES_VERSION } from "./schema";
import { productDataVersion } from "../../data/products";
import { StoreError } from "./store";
import { deliver, processDue } from "./notify";

export const CONSENT_VERSION = "2026-09-21";

const CODES = {
  selection: "SEL", fitting: "FIT", technical: "TEC", config: "CFG", gps: "GPS", product: "PRD", coach: "COA", club: "CLB",
  distribution: "DST", brand: "BRD", family: "FAM", institutional: "INS", strategic: "STR", owner: "OWN", network: "NET", general: "GEN",
};
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const PATH_RE = /^\/[A-Za-z0-9/_\-]{0,199}$/;
export const ENTRY_POINTS = ["direct", "home", "choose", "gps", "series", "precision", "grip", "custom", "training", "family", "coach", "club", "partner", "contact"];

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function makeRequestId(purpose, date = new Date()) {
  const stamp = date.toISOString().slice(0, 10).replace(/-/g, "");
  let rand = "";
  for (const b of crypto.randomBytes(6)) rand += CROCKFORD[b & 31];
  return `MX-${CODES[purpose] || "GEN"}-${stamp}-${rand}`;
}

/** Stable serialisation (sorted keys) for payload hashing. */
export function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`;
  return JSON.stringify(v === undefined ? null : v);
}

export function sanitizeContext(input) {
  const out = {};
  if (!input || typeof input !== "object") return out;
  if (typeof input.page === "string" && PATH_RE.test(input.page)) out.page = input.page;
  if (typeof input.from === "string" && ENTRY_POINTS.includes(input.from)) out.from = input.from;
  return out;
}

const reject = (http, body) => ({ http, body });

export async function acceptRequest(payload, { ip, config, now = Date.now() }) {
  const p = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : null;
  if (!p) return reject(400, { status: "invalid", errors: { form: "invalid" } });
  if (typeof p.hp === "string" && p.hp.trim() !== "") return reject(400, { status: "rejected", code: "spam_suspected" });
  if (!(typeof p.elapsedMs === "number" && Number.isFinite(p.elapsedMs) && p.elapsedMs >= config.minElapsedMs)) {
    return reject(400, { status: "rejected", code: "too_fast" });
  }
  if (typeof p.idempotencyKey !== "string" || !IDEMPOTENCY_RE.test(p.idempotencyKey)) {
    return reject(400, { status: "invalid", errors: { form: "invalid" } });
  }
  const v = validateRequest(p);
  if (!v.ok) return reject(400, { status: "invalid", errors: v.errors });
  if (!config.store) return reject(503, { status: "unavailable", code: "intake_not_configured" });

  try {
    const windowMs = config.rateLimit.windowSeconds * 1000;
    const bucket = `${sha256(`${config.salt}|${ip || "unknown"}`).slice(0, 32)}:${Math.floor(now / windowMs)}`;
    const count = await config.store.rateLimit(bucket, config.rateLimit.windowSeconds);
    if (count > config.rateLimit.max) return reject(429, { status: "rate_limited", retry_after: config.rateLimit.windowSeconds });

    const value = v.value;
    const payloadHash = sha256(canonical({ purpose: value.purpose, contact: value.contact, details: value.details, config: value.config || null, profile: value.profile || null }));
    const idemHash = sha256(`${p.idempotencyKey}|${payloadHash}`);
    const requestId = makeRequestId(value.purpose, new Date(now));
    const record = {
      schema: 1,
      request_id: requestId,
      created_at: new Date(now).toISOString(),
      purpose: value.purpose,
      locale: value.locale,
      contact: value.contact,
      details: value.details,
      ...(value.config ? { config: value.config } : {}),
      ...(value.profile ? { profile: value.profile } : {}),
      context: { ...sanitizeContext(p.context), productDataVersion, ...(value.profile ? { gpsRulesVersion: GPS_RULES_VERSION } : {}) },
      attribution: sanitizeAttribution(p.attribution),
      consent: { answer_request: true, text_version: CONSENT_VERSION },
      payload_hash: payloadHash,
    };
    const res = await config.store.createLead({ idemHash, requestId, record });
    return {
      http: res.created ? 201 : 200,
      body: { status: "accepted", request_id: res.requestId, ...(res.created ? {} : { duplicate: true }) },
      requestId: res.requestId,
      created: res.created,
    };
  } catch (e) {
    return reject(503, { status: "unavailable", code: e instanceof StoreError ? e.code : "store_error" });
  }
}

/**
 * Runs after the response: first delivery attempt for a new request (with one quick in-process
 * retry for transient failures), then up to three overdue notifications of earlier requests.
 */
export async function afterAccept(config, requestId, created, { quickRetryMs = 15000 } = {}) {
  if (!config.store) return;
  if (created) {
    const r = await deliver(config.store, config.notifier, requestId);
    if (r.state === "retry" && quickRetryMs > 0) {
      await sleep(quickRetryMs);
      await deliver(config.store, config.notifier, requestId);
    }
  }
  await processDue(config.store, config.notifier, { limit: 3 });
}

/** Constant-time string comparison for secrets. */
export function safeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb) && String(a).length === String(b).length;
}

export function clientIp(headers) {
  const real = headers.get("x-real-ip");
  if (real) return real.trim();
  const xff = headers.get("x-forwarded-for");
  return xff ? xff.split(",")[0].trim() : "unknown";
}

export function ipBucket(config, ip, label, windowSeconds, now = Date.now()) {
  return `${label}:${sha256(`${config.salt}|${ip}`).slice(0, 32)}:${Math.floor(now / (windowSeconds * 1000))}`;
}
