import { readConfig, processingSummary } from "../../../../lib/intake/config";
import { deliver, processDue } from "../../../../lib/intake/notify";
import { safeEqual, clientIp, ipBucket } from "../../../../lib/intake/service";

/**
 * /api/leads/admin — private request register for the responsible person.
 * Enabled only when LEADS_ADMIN_PASSWORD (≥ 12 characters) is set; otherwise 404.
 * HTTP Basic authentication (any user name), failed attempts rate-limited per hashed IP,
 * no caching, no indexing, strict CSP, same-origin POST for manual retries.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ID_RE = /^MX-[A-Z]{3}-\d{8}-[0-9A-Z]{5,6}$/;
const SECURITY = {
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
};

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function page(title, body, status = 200) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>body{font:15px/1.5 -apple-system,Segoe UI,Arial,sans-serif;margin:24px;color:#171b18;background:#f7f8f5}table{border-collapse:collapse;width:100%;background:#fff}th,td{border:1px solid #d8ddd3;padding:6px 8px;text-align:left;vertical-align:top}th{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#555e55}dl{display:grid;grid-template-columns:minmax(160px,240px) 1fr;gap:4px 16px;background:#fff;border:1px solid #d8ddd3;padding:12px}dt{color:#555e55}dd{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}.sent{color:#506529;font-weight:600}.failed{color:#a33a3a;font-weight:600}.retry,.pending,.not_configured{color:#8a6414;font-weight:600}button{font:inherit;padding:8px 14px;border:1px solid #171b18;background:#171b18;color:#fff;border-radius:4px;cursor:pointer}code{font-family:ui-monospace,Menlo,monospace}</style></head><body>${body}</body></html>`;
  return new Response(html, { status, headers: { ...SECURITY, "Content-Type": "text/html; charset=utf-8" } });
}

async function authorise(request, config) {
  if (!config.adminPassword) return { ok: false, res: new Response("Not found", { status: 404, headers: SECURITY }) };
  const ip = clientIp(request.headers);
  const failKey = config.store ? ipBucket(config, ip, "admin-fail", 600) : null;
  const header = request.headers.get("authorization") || "";
  let password = "";
  if (header.startsWith("Basic ")) {
    try {
      const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
      password = decoded.slice(decoded.indexOf(":") + 1);
    } catch {
      password = "";
    }
  }
  if (password && safeEqual(password, config.adminPassword)) return { ok: true };
  if (failKey && password) {
    const n = await config.store.rateLimit(failKey, 600).catch(() => 0);
    if (n > 10) return { ok: false, res: new Response("Too many attempts", { status: 429, headers: { ...SECURITY, "Retry-After": "600" } }) };
  }
  return { ok: false, res: new Response("Authentication required", { status: 401, headers: { ...SECURITY, "WWW-Authenticate": 'Basic realm="MAXIMUS requests", charset="UTF-8"' } }) };
}

function statusCell(n) {
  const s = (n && n.status) || "pending";
  return `<span class="${esc(s)}">${esc(s)}</span>`;
}

function dl(obj) {
  const rows = Object.entries(obj || {})
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(Array.isArray(v) ? v.join(", ") : typeof v === "object" ? JSON.stringify(v) : v)}</dd>`)
    .join("");
  return rows ? `<dl>${rows}</dl>` : "<p>—</p>";
}

export async function GET(request) {
  const config = readConfig();
  const auth = await authorise(request, config);
  if (!auth.ok) return auth.res;
  const processing = processingSummary();
  if (!config.store) return page("Requests", `<h1>Requests</h1><p>No durable store is configured. Intake answers 503 and no request can be accepted.</p>`);

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const asJson = url.searchParams.get("format") === "json";
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...SECURITY, "Content-Type": "application/json; charset=utf-8" } });
  try {
    if (asJson) {
      if (id) {
        const lead = ID_RE.test(id) ? await config.store.getLead(id) : null;
        return lead ? json(200, lead) : json(404, { status: "not_found" });
      }
      const [leads, total, pending] = await Promise.all([config.store.listLeads(100), config.store.countLeads(), config.store.pendingCount()]);
      return json(200, { total, pending, leads: leads.map(({ record: r, notify }) => ({ request_id: r.request_id, created_at: r.created_at, purpose: r.purpose, locale: r.locale, notify })) });
    }
    if (id) {
      if (!ID_RE.test(id)) return page("Not found", "<p>Unknown request.</p>", 404);
      const lead = await config.store.getLead(id);
      if (!lead) return page("Not found", "<p>Unknown request.</p>", 404);
      const r = lead.record;
      const body = `<p><a href="?">← All requests</a></p><h1><code>${esc(r.request_id)}</code></h1>
<p>${esc(r.created_at)} · ${esc(r.purpose)} · ${esc(r.locale)} · notification: ${statusCell(lead.notify)} · attempts ${esc(lead.notify.attempts || 0)} ${lead.notify.last_error ? `· last error <code>${esc(lead.notify.last_error)}</code>` : ""}</p>
<h2>Contact</h2>${dl(r.contact)}<h2>Details</h2>${dl(r.details)}${r.config ? `<h2>Configuration request</h2>${dl(r.config)}` : ""}${r.profile ? `<h2>GPS profile</h2>${dl(r.profile)}` : ""}
<h2>Context</h2>${dl(r.context)}<h2>Attribution</h2>${dl(r.attribution)}<h2>Notification</h2>${dl(lead.notify)}
<form method="post"><input type="hidden" name="id" value="${esc(r.request_id)}"><button type="submit">Retry notification now</button></form>`;
      return page(r.request_id, body);
    }
    const [leads, total, pending] = await Promise.all([config.store.listLeads(100), config.store.countLeads(), config.store.pendingCount()]);
    const rows = leads
      .map(({ record: r, notify: n }) => `<tr><td><a href="?id=${encodeURIComponent(r.request_id)}"><code>${esc(r.request_id)}</code></a></td><td>${esc(r.created_at)}</td><td>${esc(r.purpose)}</td><td>${esc(r.locale)}</td><td>${esc(r.contact && r.contact.country)}</td><td>${statusCell(n)}</td><td>${esc(n.attempts || 0)}</td><td><code>${esc(n.last_error || "")}</code></td></tr>`)
      .join("");
    const body = `<h1>Requests</h1>
<p>Total stored: <b>${total}</b> · notifications pending or scheduled: <b>${pending}</b> · store: <code>${esc(processing.store)}</code> · notification channel: <code>${esc(processing.notification || "not configured")}</code></p>
<form method="post"><input type="hidden" name="id" value="all"><button type="submit">Process due notifications now</button></form>
<table><thead><tr><th>Request ID</th><th>Received (UTC)</th><th>Purpose</th><th>Locale</th><th>Country</th><th>Notification</th><th>Attempts</th><th>Last error</th></tr></thead><tbody>${rows || '<tr><td colspan="8">No requests yet.</td></tr>'}</tbody></table>`;
    return page("Requests", body);
  } catch (e) {
    return page("Store unavailable", `<p>The store did not answer: <code>${esc((e && e.code) || "error")}</code>.</p>`, 503);
  }
}

export async function POST(request) {
  const config = readConfig();
  const auth = await authorise(request, config);
  if (!auth.ok) return auth.res;
  // Same-origin POST only (CSRF protection for Basic-authenticated browsers).
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
  const site = request.headers.get("sec-fetch-site");
  let originHost = null;
  try {
    originHost = origin ? new URL(origin).host : null;
  } catch {
    originHost = "invalid";
  }
  if ((origin && originHost !== host) || (site && site !== "same-origin")) return new Response("Forbidden", { status: 403, headers: SECURITY });
  if (!config.store) return page("Requests", "<p>No durable store is configured.</p>", 503);
  const form = await request.formData().catch(() => null);
  const id = form ? String(form.get("id") || "") : "";
  try {
    if (id === "all") {
      const s = await processDue(config.store, config.notifier, { limit: 20, now: Date.now() });
      return page("Processed", `<p>Processed ${s.processed}: sent ${s.sent}, scheduled ${s.retry}, failed ${s.failed}, notification not configured ${s.not_configured}.</p><p><a href="?">Back</a></p>`);
    }
    if (!ID_RE.test(id)) return page("Not found", "<p>Unknown request.</p>", 404);
    const r = await deliver(config.store, config.notifier, id);
    return page("Retry", `<p>Result for <code>${esc(id)}</code>: <b>${esc(r.state)}</b>${r.errorCode ? ` (<code>${esc(r.errorCode)}</code>)` : ""}.</p><p><a href="?id=${encodeURIComponent(id)}">Back</a></p>`);
  } catch (e) {
    return page("Store unavailable", `<p>The store did not answer: <code>${esc((e && e.code) || "error")}</code>.</p>`, 503);
  }
}
