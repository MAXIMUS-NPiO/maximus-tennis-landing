/**
 * Notification of accepted requests — SERVER ONLY.
 *
 * A request is stored durably BEFORE any notification is attempted. A notification failure never
 * changes the accepted status of a request: the attempt is recorded and a retry is scheduled.
 *
 * Channels (one is active; LEAD_NOTIFY_CHANNEL chooses when both are configured):
 *   smtp     — authenticated SMTP (for maximus.tennis: Google Workspace, smtp.gmail.com:465,
 *              an app password of the sending mailbox). Plain-text message only.
 *   webhook  — HTTPS POST with an HMAC-SHA256 signature (for a CRM or automation endpoint).
 *
 * Message content is built only from validated fields. Subjects contain enums and the
 * request_id only. Nothing is written to logs except error codes.
 */
import crypto from "node:crypto";

/** Delay before retry N (after attempt N failed). 8 attempts in total, then "failed". */
export const RETRY_SCHEDULE_MS = [60e3, 5 * 60e3, 15 * 60e3, 3600e3, 3 * 3600e3, 6 * 3600e3, 12 * 3600e3, 24 * 3600e3];
export const MAX_ATTEMPTS = RETRY_SCHEDULE_MS.length;

/** Returns the time of the next attempt, or null when no attempt remains. */
export function nextAttemptAt(attemptsMade, now = Date.now()) {
  if (attemptsMade >= MAX_ATTEMPTS) return null;
  return now + RETRY_SCHEDULE_MS[Math.max(0, attemptsMade - 1)];
}

/* ------------------------------------------------------------------ message */

const LABELS = {
  name: "Name", email: "Email", role: "Role", country: "Country / region", organisation: "Organisation", message: "Message",
  level: "Level", objectives: "Objectives", currentRacquet: "Current racquet", grip: "Grip", coachInvolved: "Coach involved",
  city: "City / location", timing: "Preferred timing", targets: "Preferred targets", limits: "Mandatory limits", use: "Intended use",
  tradeoffs: "Acceptable trade-offs", basis: "Measurement basis", seriesInterest: "Series of interest", quantity: "Quantity",
  players: "Players", interests: "Interests", territory: "Territory", channels: "Channels / experience", audience: "Audience",
  proposal: "Proposal", goal: "Development goal", ageBand: "Age band", scope: "Programme scope", interestArea: "Area of interest",
  productRef: "Product / serial reference", requestType: "Request type", seeking: "Seeking",
  series: "Series", cls: "Precision class", mode: "Weight mode", weight: "Listed weight (g)", customWeight: "Requested weight (g) — technical review",
  balanceReq: "Requested balance (mm)", sw: "Requested swingweight (kg·cm²)", ra: "Requested stiffness (RA)",
  ptype: "Personalisation", engraving: "Engraving text", engravingArtworkReview: "Artwork confirmation required",
  setType: "Set type", sets: "Number of sets / racquets", teamSize: "Racquets per team set", racquetsTotal: "Racquets in total", notes: "Additional requirements",
  sport: "Sport", experience: "Experience", style: "Playing style", equipment: "Current equipment", preference: "Preference",
  coach: "Coach involved", directions: "Declared directions (not a fitting)", rulesVersion: "GPS rules version",
};

function fmt(v) {
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "boolean") return v ? "yes" : "no";
  return String(v);
}

function block(title, obj) {
  const lines = [];
  for (const [k, v] of Object.entries(obj || {})) {
    if (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0)) continue;
    const text = fmt(v);
    if (text.includes("\n")) lines.push(`${LABELS[k] || k}:`, ...text.split("\n").map((l) => `    ${l}`));
    else lines.push(`${LABELS[k] || k}: ${text}`);
  }
  return lines.length ? [`== ${title} ==`, ...lines, ""] : [];
}

export function buildMessage(record) {
  const subject = `[MAXIMUS] ${record.request_id} | ${record.purpose} | ${record.locale}`;
  const text = [
    `Request ID: ${record.request_id}`,
    `Received (UTC): ${record.created_at}`,
    `Purpose: ${record.purpose}`,
    `Locale: ${record.locale}`,
    "",
    ...block("Contact", record.contact),
    ...block("Details", record.details),
    ...block("Configuration request", record.config),
    ...block("GPS profile", record.profile),
    ...block("Context", record.context),
    ...block("Attribution", record.attribution),
    "Status: accepted for review. This is a request, not an order, a price or a manufacturing commitment.",
    "Reply to the requester using the Reply-To address.",
  ].join("\n");
  return { subject, text };
}

/* ------------------------------------------------------------------ channels */

function smtpErrorCode(e) {
  const c = (e && (e.code || e.responseCode)) || "";
  if (c === "EAUTH") return "smtp_auth";
  if (["ECONNECTION", "ETIMEDOUT", "ESOCKET", "EDNS", "ECONNREFUSED"].includes(c)) return "smtp_connection";
  if (c === "EENVELOPE") return "smtp_envelope";
  if (typeof c === "number" && c >= 400) return `smtp_${c}`;
  return "smtp_error";
}

export function createSmtpNotifier(cfg, { transportFactory } = {}) {
  let transport = null;
  const getTransport = async () => {
    if (transport) return transport;
    if (transportFactory) transport = transportFactory(cfg);
    else {
      const nodemailer = (await import("nodemailer")).default;
      transport = nodemailer.createTransport({
        host: cfg.host,
        port: cfg.port,
        secure: cfg.secure,
        requireTLS: cfg.requireTLS,
        ignoreTLS: cfg.ignoreTLS,
        auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
        tls: { minVersion: "TLSv1.2" },
      });
    }
    return transport;
  };
  return {
    channel: "smtp",
    async send(record) {
      const { subject, text } = buildMessage(record);
      try {
        const t = await getTransport();
        const info = await t.sendMail({
          from: cfg.from,
          to: cfg.to,
          replyTo: record.contact && record.contact.email ? record.contact.email : undefined,
          subject,
          text,
          headers: { "X-Maximus-Request-Id": record.request_id },
        });
        const rejected = (info && info.rejected) || [];
        if (rejected.length > 0) return { ok: false, errorCode: "smtp_rejected" };
        return { ok: true, messageId: info && info.messageId ? String(info.messageId).slice(0, 200) : "" };
      } catch (e) {
        // Error codes only; set INTAKE_DEBUG=1 to also log the transport message (never request content).
        if (process.env.INTAKE_DEBUG === "1") console.error("[intake] smtp", e && e.code, e && e.message);
        return { ok: false, errorCode: smtpErrorCode(e) };
      }
    },
  };
}

export function createWebhookNotifier(cfg, { fetchImpl = fetch } = {}) {
  return {
    channel: "webhook",
    async send(record) {
      const body = JSON.stringify({ event: "lead.accepted", request_id: record.request_id, created_at: record.created_at, record });
      const ts = String(Math.floor(Date.now() / 1000));
      const sig = crypto.createHmac("sha256", cfg.secret).update(`${ts}.${body}`).digest("hex");
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10000);
      try {
        const res = await fetchImpl(cfg.url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Maximus-Timestamp": ts, "X-Maximus-Signature": `sha256=${sig}`, "X-Maximus-Request-Id": record.request_id },
          body,
          signal: ctrl.signal,
          cache: "no-store",
          redirect: "error",
        });
        if (res.status >= 200 && res.status < 300) return { ok: true, messageId: `webhook-${res.status}` };
        return { ok: false, errorCode: `http_${res.status}` };
      } catch (e) {
        return { ok: false, errorCode: e && e.name === "AbortError" ? "webhook_timeout" : "webhook_unreachable" };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/* ------------------------------------------------------------------ delivery control */

/**
 * Attempts delivery of one stored request. Protected by a short lock so that concurrent triggers
 * (after-response hook, opportunistic retry, cron, admin) never send the same request twice at once.
 * Returns { state: "sent" | "retry" | "failed" | "not_configured" | "locked" | "missing" }.
 */
export async function deliver(store, notifier, requestId, now = Date.now()) {
  if (!notifier) {
    await store.markNotConfigured(requestId);
    return { state: "not_configured" };
  }
  const locked = await store.lock(`notify:${requestId}`, 90);
  if (!locked) return { state: "locked" };
  try {
    const lead = await store.getLead(requestId);
    if (!lead) return { state: "missing" };
    if (lead.notify && lead.notify.status === "sent") return { state: "sent" };
    const result = await notifier.send(lead.record);
    const made = (Number(lead.notify && lead.notify.attempts) || 0) + 1;
    if (result.ok) {
      await store.recordAttempt(requestId, { ok: true, messageId: result.messageId });
      return { state: "sent", messageId: result.messageId };
    }
    const next = nextAttemptAt(made, now);
    await store.recordAttempt(requestId, { ok: false, errorCode: result.errorCode, nextAttemptAt: next, final: next === null });
    return { state: next === null ? "failed" : "retry", errorCode: result.errorCode };
  } finally {
    await store.unlock(`notify:${requestId}`);
  }
}

/** Processes due notifications (oldest first). Returns a count summary without request content. */
export async function processDue(store, notifier, { limit = 5, now = Date.now() } = {}) {
  const ids = await store.dueNotifications(now, limit);
  const summary = { processed: 0, sent: 0, retry: 0, failed: 0, not_configured: 0, locked: 0, missing: 0 };
  for (const id of ids) {
    const r = await deliver(store, notifier, id, now);
    summary.processed += 1;
    summary[r.state] = (summary[r.state] || 0) + 1;
  }
  return summary;
}
