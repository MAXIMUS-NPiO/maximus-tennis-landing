/**
 * Locale parity check: every locale must expose exactly the same key structure as English,
 * with the same array lengths and the same non-translatable technical values (hrefs, purposes).
 * Usage: node scripts/check-i18n.mjs [locale ...]
 */
import { pathToFileURL } from "node:url";
import path from "node:path";

const root = process.cwd();
const load = async (l) => (await import(pathToFileURL(path.join(root, "content", `${l}.js`)).href)).default;

const KEEP = new Set(["href", "purpose"]);
const problems = [];

function walk(a, b, trail, locale) {
  const ta = Array.isArray(a) ? "array" : typeof a;
  const tb = Array.isArray(b) ? "array" : typeof b;
  if (ta !== tb) return problems.push(`${locale}: type mismatch at ${trail} (${ta} vs ${tb})`);
  if (ta === "array") {
    if (a.length !== b.length) problems.push(`${locale}: array length ${a.length} vs ${b.length} at ${trail}`);
    a.forEach((v, i) => b[i] !== undefined && walk(v, b[i], `${trail}[${i}]`, locale));
    return;
  }
  if (ta === "object" && a !== null) {
    const ka = Object.keys(a), kb = Object.keys(b || {});
    for (const k of ka) if (!(k in b)) problems.push(`${locale}: missing key ${trail}.${k}`);
    for (const k of kb) if (!(k in a)) problems.push(`${locale}: extra key ${trail}.${k}`);
    for (const k of ka) if (k in b) {
      // Technical values are the string route codes (e.g. purpose: "fitting"); an array under the same key name
      // (e.g. sst.purpose — display text) is translatable and is compared structurally by walk() below.
      if (KEEP.has(k) && typeof a[k] === "string" && a[k] !== b[k]) problems.push(`${locale}: technical value changed at ${trail}.${k}`);
      walk(a[k], b[k], `${trail}.${k}`, locale);
    }
    return;
  }
  if (ta === "string" && b === "") problems.push(`${locale}: empty string at ${trail}`);
}

const site = (await import(pathToFileURL(path.join(root, "data", "site.js")).href)).site;
// Default: every registered language except the master. Adding a language to data/site.js
// puts it under this check automatically.
const locales = process.argv.slice(2).length ? process.argv.slice(2) : site.locales.filter((l) => l !== site.defaultLocale);
/**
 * The ZERO claim is publishable only together with its measurement qualification. The crawler can
 * only read that qualification in English, so the binding check lives here, where every language is
 * loaded: the two sentences that carry it must exist and must still be sentences. This catches the
 * realistic failure — a locale where someone shortens or empties them — in all twenty-nine.
 */
const MIN_ZERO = { p: 70, note: 30 };
function checkZero(dict, locale) {
  const z = dict && dict.precision && dict.precision.zero;
  if (!z) {
    problems.push(`${locale}: precision.zero missing — the exclusive option must be published in every language`);
    return;
  }
  for (const [k, min] of Object.entries(MIN_ZERO)) {
    const v = typeof z[k] === "string" ? z[k].trim() : "";
    if (v.length < min) {
      problems.push(`${locale}: precision.zero.${k} is ${v.length} characters — the measurement qualification must be published with the claim`);
    }
  }
}

const en = await load("en");
checkZero(en, "en");
for (const l of locales) {
  try {
    const d = await load(l);
    walk(en, d, "root", l);
    checkZero(d, l);
  } catch (e) {
    problems.push(`${l}: cannot load — ${e.message}`);
  }
}
if (problems.length) {
  console.error(problems.join("\n"));
  console.error(`\n${problems.length} problem(s).`);
  process.exit(1);
}
console.log(`i18n parity OK for ${locales.join(", ")}`);
