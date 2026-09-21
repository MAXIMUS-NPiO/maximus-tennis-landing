/**
 * Crawl every localized route, verify HTTP 200, follow every internal link once, and scan the
 * rendered HTML for strings that must never appear on the public site.
 * Usage: node scripts/crawl.mjs http://localhost:3100
 */
const base = (process.argv[2] || "http://localhost:3100").replace(/\/$/, "");
const { routes } = await import("../data/site.js");
const locales = ["en", "ru", "zh"];

const FORBIDDEN = [
  /zero weight tolerance/i, /shaleni/i, /ghana/i, /borteyman/i, /\bjude\b/i, /\bnii\b/i, /norris/i, /go tennis/i,
  /1,104,600/, /2,946,618/, /381\.135245/, /0\.162636422/, /5,?000 racquets? per week/i, /20,000 per month/i,
  /temporary/i, /placeholder/i, /lorem ipsum/i, /TODO/, /NOT_PROVIDED/, /FOUNDER_CONFIRMED/, /gm@maximussports/i,
  /\+971/, /royalt[a-z]* (rate|percentage) of \d/i, /50%/,
];

const seen = new Map();
const problems = [];
async function get(path) {
  if (seen.has(path)) return seen.get(path);
  const res = await fetch(base + path, { redirect: "manual" });
  const html = res.status === 200 ? await res.text() : "";
  seen.set(path, { status: res.status, html });
  return seen.get(path);
}

const queue = [];
for (const l of locales) for (const k of Object.keys(routes)) queue.push(`/${l}${routes[k]}`);

while (queue.length) {
  const path = queue.shift();
  const { status, html } = await get(path);
  if (status !== 200) { problems.push(`${status} ${path}`); continue; }
  for (const re of FORBIDDEN) if (re.test(html)) problems.push(`forbidden ${re} in ${path}`);
  if (!/<html lang="(en|ru|zh-CN)"/.test(html)) problems.push(`lang attribute missing in ${path}`);
  if (!/rel="canonical"/.test(html)) problems.push(`canonical missing in ${path}`);
  if (!/hreflang="zh-CN"/i.test(html)) problems.push(`hreflang missing in ${path}`);
  for (const m of html.matchAll(/href="(\/[^"#?]*)(?:[#?][^"]*)?"/g)) {
    const p = m[1];
    if (p.startsWith("/_next") || p.startsWith("/brand") || /\.(png|xml|txt|ico)$/.test(p)) continue;
    if (!seen.has(p) && !queue.includes(p)) queue.push(p);
  }
}
const nf = await fetch(base + "/en/this-page-does-not-exist");
if (nf.status !== 404) problems.push(`expected 404 for unknown page, got ${nf.status}`);

console.log(`checked ${seen.size} paths`);
if (problems.length) { console.error(problems.join("\n")); process.exit(1); }
console.log("crawl OK — all 200, no forbidden strings, lang/canonical/hreflang present");
