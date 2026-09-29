import { processingSummary, readConfig } from "../../../../lib/intake/config";

/**
 * GET /api/leads/status — setup aid, not a data endpoint.
 *
 * It reports whether the durable store and the notification channel are configured, and for the
 * Telegram channel whether a destination chat has been resolved yet. While the store is NOT
 * configured it also lists the NAMES of the Redis/KV REST variables present in the environment,
 * so that a wrong variable prefix can be identified without opening the dashboard.
 * Secrets are never read and never returned; no request data is reachable here.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REST_NAME = /(^|_)(KV_REST_API|UPSTASH_REDIS_REST|REDIS_REST)_(URL|TOKEN)$/;

export async function GET() {
  const summary = processingSummary();
  const configured = summary.store !== null;
  const body = {
    store: configured,
    notification: summary.notification,
    ...(configured ? {} : { variablesPresent: Object.keys(process.env).filter((k) => REST_NAME.test(k)).sort() }),
  };
  if (summary.notification === "telegram") {
    try {
      const cfg = readConfig();
      const chat = cfg.notifier && cfg.notifier.resolveChat ? await cfg.notifier.resolveChat() : null;
      body.telegramChatResolved = !!chat;
    } catch {
      body.telegramChatResolved = false;
    }
  }
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
  });
}
