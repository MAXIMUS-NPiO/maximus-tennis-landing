/**
 * Intake configuration — SERVER ONLY. Every secret is read from environment variables on the
 * server; nothing here is exposed to the browser. See README → "Request intake".
 */
import crypto from "node:crypto";
import { resolveStore } from "./store";
import { createSmtpNotifier, createWebhookNotifier } from "./notify";

const int = (v, d) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : d;
};

const LOCAL_HTTP = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//;

export function smtpSettings(env = process.env) {
  const production = env.NODE_ENV === "production";
  const authNone = !production && env.SMTP_AUTH === "none";
  if (!env.SMTP_HOST || !env.LEAD_NOTIFY_TO) return null;
  if (!authNone && !(env.SMTP_USER && env.SMTP_PASS)) return null;
  const port = int(env.SMTP_PORT, 465);
  const secure = env.SMTP_SECURE ? env.SMTP_SECURE === "true" : port === 465;
  const plainAllowed = !production && env.SMTP_REQUIRE_TLS === "false";
  return {
    host: env.SMTP_HOST,
    port,
    secure,
    requireTLS: !secure && !plainAllowed,
    ignoreTLS: plainAllowed,
    user: authNone ? undefined : env.SMTP_USER,
    pass: authNone ? undefined : env.SMTP_PASS,
    from: env.LEAD_NOTIFY_FROM || env.SMTP_USER,
    to: env.LEAD_NOTIFY_TO,
  };
}

export function webhookSettings(env = process.env) {
  const production = env.NODE_ENV === "production";
  const url = env.LEAD_WEBHOOK_URL;
  if (!url || !env.LEAD_WEBHOOK_SECRET || env.LEAD_WEBHOOK_SECRET.length < 16) return null;
  if (!(url.startsWith("https://") || (!production && LOCAL_HTTP.test(url)))) return null;
  return { url, secret: env.LEAD_WEBHOOK_SECRET };
}

export function resolveNotifier(env = process.env, deps = {}) {
  const smtp = smtpSettings(env);
  const webhook = webhookSettings(env);
  const pick = env.LEAD_NOTIFY_CHANNEL;
  if (pick === "webhook") return webhook ? createWebhookNotifier(webhook, deps) : null;
  if (pick === "smtp") return smtp ? createSmtpNotifier(smtp, deps) : null;
  if (smtp) return createSmtpNotifier(smtp, deps);
  if (webhook) return createWebhookNotifier(webhook, deps);
  return null;
}

let instanceSalt = null;

export function readConfig(env = process.env, deps = {}) {
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN || "";
  let salt = env.RATE_LIMIT_SALT;
  if (!salt && token) salt = crypto.createHash("sha256").update(`mx-rl:${token}`).digest("hex");
  if (!salt) salt = instanceSalt || (instanceSalt = crypto.randomBytes(32).toString("hex"));
  return {
    store: deps.store !== undefined ? deps.store : resolveStore(env),
    notifier: deps.notifier !== undefined ? deps.notifier : resolveNotifier(env, deps),
    rateLimit: { max: int(env.LEADS_RATE_LIMIT, 10), windowSeconds: int(env.LEADS_RATE_WINDOW_SECONDS, 600) },
    salt,
    minElapsedMs: 1500,
    adminPassword: env.LEADS_ADMIN_PASSWORD && env.LEADS_ADMIN_PASSWORD.length >= 12 ? env.LEADS_ADMIN_PASSWORD : null,
    cronSecret: env.CRON_SECRET && env.CRON_SECRET.length >= 16 ? env.CRON_SECRET : null,
  };
}

/** Non-secret description of the active processing chain (used by the admin page and privacy page). */
export function processingSummary(env = process.env) {
  const storeConfigured = !!((env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL) && (env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN));
  const smtp = smtpSettings(env);
  const webhook = webhookSettings(env);
  return {
    store: storeConfigured ? "upstash-redis" : null,
    notification: smtp && env.LEAD_NOTIFY_CHANNEL !== "webhook" ? (/(^|\.)(gmail|google)\.com$/.test(smtp.host) ? "google-workspace-smtp" : "smtp") : webhook ? "webhook" : null,
    analytics: env.NEXT_PUBLIC_GA_MEASUREMENT_ID ? "ga4" : null,
  };
}
