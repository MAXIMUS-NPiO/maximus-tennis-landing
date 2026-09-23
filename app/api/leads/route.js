import { after } from "next/server";
import { readConfig } from "../../../lib/intake/config";
import { acceptRequest, afterAccept, clientIp } from "../../../lib/intake/service";

/**
 * POST /api/leads — the single production intake for every public form.
 * Responses: 201 accepted · 200 accepted (duplicate) · 400 invalid/rejected · 413 · 415 · 429 · 503.
 * Leads are never readable through this endpoint.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 32 * 1024;
const BASE_HEADERS = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };

function json(status, body, extra = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...BASE_HEADERS, ...extra } });
}

export async function POST(request) {
  const type = (request.headers.get("content-type") || "").toLowerCase();
  if (!type.startsWith("application/json")) return json(415, { status: "invalid", code: "unsupported_media_type" });
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > MAX_BYTES) return json(413, { status: "invalid", code: "too_large" });

  let text;
  try {
    text = await request.text();
  } catch {
    return json(400, { status: "invalid", code: "unreadable" });
  }
  if (Buffer.byteLength(text, "utf8") > MAX_BYTES) return json(413, { status: "invalid", code: "too_large" });

  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    return json(400, { status: "invalid", code: "bad_json" });
  }

  const config = readConfig();
  const result = await acceptRequest(payload, { ip: clientIp(request.headers), config });
  if (result.requestId) {
    after(async () => {
      try {
        await afterAccept(config, result.requestId, result.created);
      } catch (e) {
        console.error("[intake] notification step failed:", (e && e.code) || "error");
      }
    });
  }
  const extra = result.http === 429 ? { "Retry-After": String(result.body.retry_after) } : {};
  return json(result.http, result.body, extra);
}

export function GET() {
  return json(405, { status: "method_not_allowed" }, { Allow: "POST" });
}
