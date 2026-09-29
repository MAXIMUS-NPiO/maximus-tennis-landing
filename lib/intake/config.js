/**
 * Intake configuration — SERVER ONLY. Every secret is read from environment variables on the
 * server; nothing here is exposed to the browser. See README → "Request intake".
 */
import crypto from "node:crypto";
import { resolveStore, readRestCredentials } from "./store";
import { createSmtpNotifier, createWebhookNotifier, createTelegramNotifier } from "./notify";

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

/** Telegram needs one secret: the bot token. The destination chat is resolved by the server. */
export function telegramSettings(env = process.env) {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token || !/^\d{6,}:[A-Za-z0-9_-]{20,}$/.test(token)) return null;
  const chatId = env.TELEGRAM_CHAT_ID && /^-?\d{1,20}$/.test(env.TELEGRAM_CHAT_ID) ? env.TELEGRAM_CHAT_ID : null;
  return { token, chatId };
}

export function resolveNotifier(env = process.env, deps = {}) {
  const smtp = smtpSettings(env);
  const webhook = webhookSettings(env);
  const telegram = telegramSettings(env);
  const pick = env.LEAD_NOTIFY_CHANNEL;
  if (pick === "webhook") return webhook ? createWebhookNotifier(webhook, deps) : null;
  if (pick === "smtp") return smtp ? createSmtpNotifier(smtp, deps) : null;
  if (pick === "telegram") return telegram ? createTelegramNotifier(telegram, deps) : null;
  // Default order: the channel that reaches the responsible person fastest comes first.
  if (telegram) return createTelegramNotifier(telegram, deps);
  if (smtp) return createSmtpNotifier(smtp, deps);
  if (webhook) return createWebhookNotifier(webhook, deps);
  return null;
}

let instanceSalt = null;

export function readConfig(env = process.env, deps = {}) {
  const token = readRestCredentials(env).token || "";
  let salt = env.RATE_LIMIT_SALT;
  if (!salt && token) salt = crypto.createHash("sha256").update(`mx-rl:${token}`).digest("hex");
  if (!salt) salt = instanceSalt || (instanceSalt = crypto.randomBytes(32).toString("hex"));
  // The store is resolved first: the Telegram channel keeps its resolved chat there.
  const store = deps.store !== undefined ? deps.store : resolveStore(env);
  return {
    store,
    notifier: deps.notifier !== undefined ? deps.notifier : resolveNotifier(env, { store, ...deps }),
    rateLimit: { max: int(env.LEADS_RATE_LIMIT, 10), windowSeconds: int(env.LEADS_RATE_WINDOW_SECONDS, 600) },
    salt,
    minElapsedMs: 1500,
    adminPassword: env.LEADS_ADMIN_PASSWORD && env.LEADS_ADMIN_PASSWORD.length >= 12 ? env.LEADS_ADMIN_PASSWORD : null,
    cronSecret: env.CRON_SECRET && env.CRON_SECRET.length >= 16 ? env.CRON_SECRET : null,
  };
}

/** Non-secret description of the active processing chain (used by the admin page and privacy page). */
export function processingSummary(env = process.env) {
  const rest = readRestCredentials(env);
  const storeConfigured = !!(rest.url && rest.token);
  const smtp = smtpSettings(env);
  const webhook = webhookSettings(env);
  const telegram = telegramSettings(env);
  const active = resolveNotifier(env, { store: null, transportFactory: () => null });
  const channel = active ? active.channel : null;
  const named = channel === "smtp"
    ? (smtp && /(^|\.)(gmail|google)\.com$/.test(smtp.host) ? "google-workspace-smtp" : "smtp")
    : channel === "telegram" && telegram ? "telegram" : channel === "webhook" && webhook ? "webhook" : null;
  return {
    store: storeConfigured ? "upstash-redis" : null,
    notification: named,
    analytics: env.NEXT_PUBLIC_GA_MEASUREMENT_ID ? "ga4" : null,
  };
}
