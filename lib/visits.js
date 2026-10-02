/**
 * Visit counting — first party, cookieless, aggregate only.
 *
 * What is counted: one increment per page view, in a hash for that day, against a handful of
 * fields — the language served, the country the network says the request came from, the site that
 * sent the visitor, whether it was a phone or a larger screen, and which page it was.
 *
 * What is NOT counted, and never written: no IP address, no visitor identifier, no cookie, no
 * session, no fingerprint, nothing that could single out a person or follow them between visits.
 * Two people from the same country on the same day are one number, not two rows. That is why this
 * needs no consent bar and sends nothing to anyone outside this project.
 *
 * It runs in edge middleware, so this file imports nothing: no node:crypto, no store module, only
 * fetch. The counters live in the same Redis as the requests, read back by lib/intake/store.js.
 */

const REST_PAIRS = [
  ["KV_REST_API_URL", "KV_REST_API_TOKEN"],
  ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
  ["REDIS_REST_URL", "REDIS_REST_TOKEN"],
];

/** The same credential resolution as the intake store, repeated here because this file may not import it. */
export function restCredentials(env) {
  const prefixes = [""];
  for (const key of Object.keys(env || {})) {
    for (const [urlName] of REST_PAIRS) {
      if (key.length > urlName.length + 1 && key.endsWith(`_${urlName}`)) {
        const prefix = key.slice(0, key.length - urlName.length);
        if (!prefixes.includes(prefix)) prefixes.push(prefix);
      }
    }
  }
  for (const prefix of prefixes) {
    for (const [urlName, tokenName] of REST_PAIRS) {
      const url = env[prefix + urlName];
      const token = env[prefix + tokenName];
      if (url && token) return { url, token };
    }
  }
  return { url: undefined, token: undefined };
}

export const dayKey = (now = new Date()) => `mx:visits:${now.toISOString().slice(0, 10)}`;

/** Days are kept for thirteen months, long enough to compare a season with the one before it. */
export const VISIT_TTL_SECONDS = 400 * 24 * 3600;

const BOT_RE = /bot|crawler|spider|crawl|slurp|facebookexternalhit|preview|monitor|curl|wget|headless|lighthouse|pingdom|uptime|python-requests|axios|postman/i;
const SAFE = /[^a-z0-9._-]/gi;

/** A referring site, reduced to its host and nothing else — no path, no query, no campaign tail. */
function source(referer, host) {
  if (!referer) return "direct";
  try {
    const h = new URL(referer).hostname.replace(/^www\./, "").toLowerCase();
    if (!h || h === String(host || "").replace(/^www\./, "").toLowerCase()) return "direct";
    return h.slice(0, 48).replace(SAFE, "");
  } catch {
    return "direct";
  }
}

/**
 * The fields to increment for one page view, or null when this request is not a page view a person
 * made: a bot, a prefetch the browser performed on its own, or a non-HTML request.
 */
export function visitFields(request, locale, pathWithoutLocale) {
  const h = request.headers;
  const ua = h.get("user-agent") || "";
  if (!ua || BOT_RE.test(ua)) return null;
  if (h.get("next-router-prefetch") || h.get("purpose") === "prefetch" || h.get("x-purpose") === "prefetch") return null;
  if (h.get("sec-fetch-mode") === "cors" || h.get("sec-fetch-dest") === "script") return null;
  if (!(h.get("accept") || "").includes("text/html")) return null;

  const country = (h.get("x-vercel-ip-country") || "").toUpperCase().replace(SAFE, "").slice(0, 2) || "??";
  const mobile = h.get("sec-ch-ua-mobile") === "?1" || /iphone|android|mobile/i.test(ua);
  const path = (pathWithoutLocale || "/").slice(0, 48).replace(/[^a-z0-9/_-]/gi, "") || "/";
  return [
    "all",
    `loc:${String(locale).replace(SAFE, "").slice(0, 8)}`,
    `c:${country}`,
    `src:${source(h.get("referer"), h.get("host"))}`,
    `dev:${mobile ? "mobile" : "desktop"}`,
    `p:${path}`,
  ];
}

/**
 * Increments the day's counters. Fire and forget: the visitor's page is already on its way, and a
 * store that is slow or missing must never delay or fail a page view.
 */
export async function recordVisit(env, fields, now = new Date(), fetchImpl = fetch) {
  const { url, token } = restCredentials(env);
  if (!url || !token || !fields || !fields.length) return false;
  const key = dayKey(now);
  const commands = fields.map((f) => ["HINCRBY", key, f, "1"]);
  commands.push(["EXPIRE", key, String(VISIT_TTL_SECONDS)]);
  try {
    const res = await fetchImpl(url.replace(/\/$/, "") + "/pipeline", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(commands.map((c) => c.map(String))),
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** The last n day keys, newest first — what the register reads to draw the dashboard. */
export function dayKeys(n, now = new Date()) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getTime() - i * 86400000);
    out.push(`mx:visits:${d.toISOString().slice(0, 10)}`);
  }
  return out;
}
