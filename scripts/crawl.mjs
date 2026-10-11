/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/**
 * Crawl every localized route, verify HTTP 200, follow every internal link once, and scan the
 * rendered HTML for strings that must never appear on the public site.
 * Usage: node scripts/crawl.mjs http://localhost:3100
 */
const base = (process.argv[2] || "http://localhost:3100").replace(/\/$/, "");
const { routes, site } = await import("../data/site.js");
// Every registered language, so a language added to data/site.js is crawled without editing this.
const locales = site.locales;
const HREFLANGS = locales.map((l) => site.localeMeta[l].hrefLang);
const LANG_RE = new RegExp(`<html lang="(${HREFLANGS.map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})"`);

// Checked against the whole HTML (markup, attributes and inline data).
const FORBIDDEN_RAW = [
  /NOT_PROVIDED/, /FOUNDER_CONFIRMED/, /\+971/,
];
// Confidential terms are checked by hash (scripts/lib/guard.mjs), so this public script does not
// publish what it guards.
const { confidentialHits } = await import("./lib/guard.mjs");
const { storePurchaseHtmlForGuard } = await import("../data/store-products.js");
// Checked against visible text only (tags, scripts and styles removed): wording that must never be published.
/**
 * MAXIMUS talks about itself and compares itself with no one (Founder, 1 October 2026). Two things
 * are blocked: the names of other racquet brands, and the comparative constructions that make a
 * claim about "other brands" without naming one. "Head" is deliberately absent from the list —
 * head size, racquet head and string bed vocabulary make it unusable as a brand pattern.
 */
const COMPETITORS = [
  /\bbabolat\b/i, /\byonex\b/i, /\btecnifibre\b/i, /\bsolinco\b/i, /\bdunlop\b/i,
  /\bv(ö|o)lkl\b/i, /\bprince\b/i, /\bwilson\b/i,
];
// Two names were tried and withdrawn: "gamma" is the Italian word for a product range and
// "pacific" is a geography this site writes about. Across every language on the site a brand pattern
// has to be one that no language uses as an ordinary word.
// The English master is the source every translation is written from, so catching a comparison
// here catches it before it can reach twenty-eight other languages.
const COMPARISONS = [
  /other brands?/i, /no one else/i, /nobody else/i, /unlike (other|any)/i, /than any other/i,
  /only brand/i, /\bcompetitors?\b/i,
];

/**
 * The family programme is about tennis, and its name says so in every language (Founder, 8 October
 * 2026): a literal "family plan" reads as family planning — contraception — in the Philippines and
 * in several other markets. Neither the old name nor the term for family planning may appear.
 */
const FAMILY_PLANNING = [
  /\bfamily[\s\u00a0-]+plan/i, /pagpaplano ng pamilya/i, /keluarga berencana/i, /rencana keluarga/i,
  /วางแผนครอบครัว/, /परिवार नियोजन/, /计划生育/, /家庭计划/, /家族計画/, /가족\s?계획/, /تنظيم الأسرة/,
  /планирование семьи/i, /планування сім/i, /familienplanung/i, /planning familial/i,
  /planificación familiar/i, /planejamento familiar/i, /pianificazione familiare/i,
];

const FORBIDDEN_TEXT = [
  ...COMPETITORS, ...COMPARISONS, ...FAMILY_PLANNING,
  /temporary/i, /placeholder/i,
  /lorem ipsum/i, /TODO/, /royalt[a-z]* (rate|percentage) of \d/i, /50\s?%/, /\bwallet\b/i, /\bpayout/i,
];
const visibleText = (html) => html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ");

/**
 * A zero-tolerance claim is published only where the measurement qualification is published with
 * it. The blanket ban on the wording was lifted when the Founder introduced the ZERO exclusive
 * option on 1 October 2026; the qualification is what keeps the claim defensible, so it is the
 * qualification that is now enforced instead of the words.
 */
const ZERO_CLAIM = /zero[\s\u00a0-]*(gram|weight|g)?[\s\u00a0-]*toleran/i;
const ZERO_QUALIFIERS = [
  /resolution of the factory/i, /factory measurement instrument/i,
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
  for (const re of FORBIDDEN_RAW) if (re.test(html)) problems.push(`forbidden ${re} in ${path}`);
  if (confidentialHits(storePurchaseHtmlForGuard(path, html))) problems.push(`confidential term (guarded by hash) in ${path}`);
  // Authorship on every page (Founder, 10 October 2026): the footer line with the author's name,
  // the head metadata, the structured data; the calculation-model line under every tool; the
  // anchored rights statement on the terms page.
  if (!/data-authorship="site"[^>]*>[\s\S]{0,200}?Maximus Kiriyakulov/.test(html)) problems.push(`footer authorship line missing in ${path}`);
  if (!/<meta name="copyright" content="© 20\d\d(–20\d\d)? Maximus Kiriyakulov/.test(html)) problems.push(`copyright meta missing in ${path}`);
  if (!/"copyrightHolder":\{"@type":"Person","name":"Maximus Kiriyakulov"\}/.test(html)) problems.push(`structured authorship missing in ${path}`);
  if (/\/(family-plan|build|gps)$/.test(path) && !/data-authorship="model"[^>]*>[^<]*Maximus Kiriyakulov/.test(html)) problems.push(`calculation-model authorship missing in ${path}`);
  if (/\/terms$/.test(path) && !/id="copyright"/.test(html)) problems.push(`rights statement anchor missing in ${path}`);
  const text = visibleText(html);
  for (const re of FORBIDDEN_TEXT) if (re.test(text)) problems.push(`forbidden text ${re} in ${path}`);
  // English pages only: the qualifier phrases are English. Every other language is covered by the
  // length check on precision.zero.p and precision.zero.note in scripts/check-i18n.mjs.
  if (path.startsWith("/en") && ZERO_CLAIM.test(text) && !ZERO_QUALIFIERS.some((re) => re.test(text))) {
    problems.push(`zero-tolerance claim without its measurement qualification in ${path}`);
  }
  if (!LANG_RE.test(html)) problems.push(`lang attribute missing in ${path}`);
  if (!/rel="canonical"/.test(html)) problems.push(`canonical missing in ${path}`);
  for (const h of HREFLANGS) if (!new RegExp(`hreflang="${h}"`, "i").test(html)) problems.push(`hreflang ${h} missing in ${path}`);
  if (!/hreflang="x-default"/i.test(html)) problems.push(`hreflang x-default missing in ${path}`);
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
console.log("crawl OK — all 200, no forbidden strings, lang/canonical/hreflang present, authorship on every page");
