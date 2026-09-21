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

const locales = process.argv.slice(2).length ? process.argv.slice(2) : ["ru", "zh"];
const en = await load("en");
for (const l of locales) {
  try {
    walk(en, await load(l), "root", l);
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
