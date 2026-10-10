import { readConfig, telegramSettings } from "../../../lib/intake/config";
import { fixedOwnerTelegramDelivery, handleSiteEvent, siteEventResponse } from "../../../lib/intake/site-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST /api/site-events — private HMAC-authenticated Baby Tennis relay. */
export async function POST(request) {
  return handleSiteEvent(request, {
    secret: process.env.BABY_TENNIS_NOTIFY_SECRET,
    getDeliveryConfig: async () => {
      const { store } = readConfig(process.env, { notifier: null });
      return fixedOwnerTelegramDelivery({ env: process.env, store, telegram: telegramSettings() });
    },
  });
}

export function GET() {
  return siteEventResponse(405, { ok: false, code: "method_not_allowed" }, { Allow: "POST" });
}
