/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import { readConfig } from "../../../../lib/intake/config";
import { processDue } from "../../../../lib/intake/notify";
import { retryBabyOutbox } from "../../../../lib/intake/site-events";
import { safeEqual } from "../../../../lib/intake/service";
import { retryForumOutbox } from "../../../../lib/platform/portal";

/**
 * GET /api/leads/retry — scheduled retry of overdue notifications (Vercel Cron, see vercel.json).
 * Requires "Authorization: Bearer <CRON_SECRET>". Returns counts only, never request content.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const HEADERS = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: HEADERS });

export async function GET(request) {
  const config = readConfig();
  if (!config.cronSecret) return json(503, { status: "not_configured" });
  if (!safeEqual(request.headers.get("authorization") || "", `Bearer ${config.cronSecret}`)) return json(401, { status: "unauthorized" });
  if (!config.store) return json(503, { status: "unavailable" });
  try {
    const baby = await retryBabyOutbox({ secret: process.env.BABY_TENNIS_NOTIFY_SECRET });
    const summary = await processDue(config.store, config.notifier, { limit: 20 });
    // Independent recovery: an unavailable forum must not stop existing lead retries.
    let forum;
    try { forum = await retryForumOutbox(); } catch { forum = { unavailable: true }; }
    return json(200, { status: "ok", ...summary, baby, forum, pending: await config.store.pendingCount() });
  } catch (e) {
    return json(503, { status: "unavailable", code: (e && e.code) || "error" });
  }
}

