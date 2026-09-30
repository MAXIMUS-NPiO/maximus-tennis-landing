/**
 * Translation completeness: fails when a locale still carries English text.
 *
 * A value equal to the English one is only allowed when it is a brand mark, a product name,
 * a unit, or a technical value sent to the server. Everything else must be translated.
 * Usage: node scripts/check-translation.mjs [locale ...]
 */
import { pathToFileURL } from "node:url";
import path from "node:path";

const root = process.cwd();
const load = async (l) => (await import(pathToFileURL(path.join(root, "content", `${l}.js`)).href)).default;
const site = (await import(pathToFileURL(path.join(root, "data", "site.js")).href)).site;

/** Values that are the same in every language: marks, product names, units, machine codes. */
const ALLOWED = new Set([
  "MAXIMUS", " | MAXIMUS", "MAXIMUS GPS", "MAXIMUS TENNIS · GREAT POWER & SPIN", "GREAT POWER & SPIN",
  "Sweet Spot Trainer", "Spot Trainer", "Sports Network", "MAXIMUS Sports Network", "Instagram",
  "Great", "Power", "Spin", "GREAT · POWER · SPIN", "GREAT · 97 in²", "POWER · 98 in²", "SPIN · 100 in²",
  "GREAT · POWER · SPIN · Sweet Spot Trainer · Spot Trainer", "Player-to-Brand · Coach-to-Brand",
  "g", "mm", "in²", "in", "RA", "kg·cm²",
  "coach", "club", "distribution", "strategic", "institutional",
  "| MAXIMUS",          // the title suffix: the mark itself
  "Email",              // used as written in every locale on this site
  "VAT TRN",            // the tax label as it appears on the licence
  "10–13", "14–17",     // age bands: figures
]);

function walk(obj, trail, out) {
  if (typeof obj === "string") { out.set(trail, obj); return; }
  if (Array.isArray(obj)) { obj.forEach((v, i) => walk(v, `${trail}[${i}]`, out)); return; }
  if (obj && typeof obj === "object") for (const k of Object.keys(obj)) walk(obj[k], trail ? `${trail}.${k}` : k, out);
}

const en = new Map();
walk(await load(site.defaultLocale), "", en);

const targets = process.argv.slice(2).length ? process.argv.slice(2) : site.locales.filter((l) => l !== site.defaultLocale);
const problems = [];
for (const locale of targets) {
  const map = new Map();
  walk(await load(locale), "", map);
  for (const [key, value] of map) {
    if (!en.has(key)) continue;
    if (value !== en.get(key)) continue;
    if (ALLOWED.has(value.trim()) || value.trim() === "") continue;
    problems.push(`${locale}: untranslated at ${key} :: ${value.slice(0, 70)}`);
  }
}

if (problems.length) {
  console.error(problems.join("\n"));
  console.error(`\ntranslation check FAILED: ${problems.length} untranslated value(s)`);
  process.exit(1);
}
console.log(`translation OK for ${targets.join(", ") || "(nothing to check)"} — no English left in any translated locale`);
