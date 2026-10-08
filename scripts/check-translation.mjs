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
  "your@email.com",     // the placeholder is an address pattern, not a sentence
  "ZERO",               // the name of the exclusive option, Latin in every locale like the mark itself
  "min", "h", "≈",      // Family Plan units: minutes, hours, and the sign for an approximate figure
  "{scenario}: {field}", // Family Plan error label: two placeholders and a colon, nothing to translate
  "VAT TRN",            // the tax label as it appears on the licence
  "10–13", "14–17",     // age bands: figures
  // Trainer captions: the product name plus a weight and a balance — nothing else to translate.
  "Sweet Spot Trainer, 270 g / 330 mm", "Sweet Spot Trainer, 285 g / 325 mm",
  "Sweet Spot Trainer, 300 g / 325 mm", "Sweet Spot Trainer, 400 g / 320 mm",
]);

/**
 * Words a particular language legitimately shares with English. These are per language on
 * purpose: allowing "Construction" everywhere would stop this check noticing a Russian or
 * Chinese value that was never translated. Each entry is a real word of that language.
 */
const ALLOWED_BY_LOCALE = {
  pl: new Set([
    "Padel", "Pickleball", "Squash", "Badminton", "Racquetball",   // the Polish names of these sports
    "Menu", "Status",                                              // Polish words spelled as in English
    "Swingweight", "Twistweight",                                  // what Polish stringers say
  ]),
  hu: new Set([
    "Padel", "Pickleball", "Racquetball",                          // no Hungarian form in use
    "Swingweight", "Twistweight",
  ]),
  sk: new Set([
    "Padel", "Pickleball", "Squash", "Racquetball",
    "Swingweight", "Twistweight",
  ]),
  sr: new Set([
    "Padel", "Pickleball", "Badminton",
    "Sport", "Status",                                             // Serbian words spelled as in English
    "Swingweight", "Twistweight",
  ]),
  ro: new Set([
    "Padel", "Pickleball", "Squash", "Badminton", "Racquetball", "Beach tennis",
    "Contact", "Control", "Transfer",                              // Romanian words spelled as in English
    "GREAT — 97 in² · Control", "MAXIMUS GREAT · 97 in² · Control", // series mark, unit, and that same word
    "Swingweight", "Twistweight",
  ]),
  bg: new Set([]),
  sv: new Set([
    "Padel", "Pickleball", "Squash", "Badminton", "Racquetball", "Tennis",
    "Distribution", "Innovation", "Institution", "Organisation", "Process", "Service", "Sport", "Status",
    "Under 10", "Version 2026-09-21",                              // "under" and "version" are Swedish too
    "Swingweight", "Twistweight",
  ]),
  no: new Set([
    "Padel", "Pickleball", "Squash", "Badminton", "Racquetball", "Tennis",
    "Status",
    "Swingweight", "Twistweight",
  ]),
  nl: new Set([
    "Padel", "Pickleball", "Squash", "Badminton", "Racquetball", "Tennis",   // the Dutch names of these sports
    "Contact", "Training", "Product", "Menu", "Status", "Sport", "Comfort", "Beginner",  // Dutch words spelled as in English
    "3 series", "4 parameters",                                  // "series" and "parameters" are the Dutch plurals too
    "SPIN — 100 in² · Spin",                                     // series mark, unit, and the Dutch word for the stroke
    "Swingweight", "Twistweight",                                // what Dutch stringers say
  ]),
  hr: new Set([
    "Padel", "Pickleball", "Badminton",
    "Sport", "Status",                                           // Croatian words spelled as in English
    "Swingweight", "Twistweight",
  ]),
  el: new Set([
    "Pickleball", "Racquetball",                                 // no Greek name in use
    "Swingweight", "Twistweight",
  ]),
  id: new Set([
    "Padel", "Pickleball", "Squash", "Racquetball",
    "Status", "Menu", "Distributor",                             // Indonesian words spelled as in English
    "Swingweight", "Twistweight",
  ]),
  az: new Set([
    "Padel", "Badminton", "Tennis",
    "Nominal", "Fitting",                                        // used as written by the Azerbaijani trade
    "Swingweight", "Twistweight",
  ]),
  uz: new Set([
    "Padel", "Badminton", "Tennis",
    "Fitting",
    "Swingweight", "Twistweight",
  ]),
  de: new Set([
    "Tennis", "Padel", "Pickleball", "Squash", "Badminton", "Racquetball",
    "Status", "Training", "Organisation", "Name", "Innovation", "Institution", "Distributor",
    "Swingweight", "Twistweight", "Balance", "Fitting",        // the words the German racquet trade uses
    "POWER — 98 in² · Power", "SPIN — 100 in² · Spin",          // series name plus its retail characteristic
    "Sweet Spot Trainer, 270 g / 330 mm", "Sweet Spot Trainer, 285 g / 325 mm",
    "Sweet Spot Trainer, 300 g / 325 mm", "Sweet Spot Trainer, 400 g / 320 mm",
  ]),
  fr: new Set([
    "Tennis", "Padel", "Pickleball", "Squash", "Badminton", "Racquetball",
    "Menu", "Organisation", "Construction", "Production", "Promotion", "Participation",
    "Distribution", "Institution", "Licence", "Version 2026-09-21",
    "Contact",                                                  // French for the navigation label, kept short so it fits the bar
    "Swingweight", "Twistweight", "Fitting",                    // what French stringers say
    "Sweet Spot Trainer, 270 g / 330 mm", "Sweet Spot Trainer, 285 g / 325 mm",
    "Sweet Spot Trainer, 300 g / 325 mm", "Sweet Spot Trainer, 400 g / 320 mm",
  ]),
  es: new Set([
    "Squash", "Pickleball", "Racquetball", "No",
    "Balance", "Swingweight", "Twistweight", "Control",         // the Spanish spec sheet's own words
    "GREAT — 97 in² · Control", "MAXIMUS GREAT · 97 in² · Control",
  ]),
  it: new Set([
    "Tennis", "Padel", "Pickleball", "Squash", "Badminton", "Racquetball",
    "Swingweight", "Twistweight", "Comfort", "No",
  ]),
  pt: new Set([
    "Padel", "Pickleball", "Squash", "Badminton", "Racquetball", "Beach tennis",
    "Swingweight", "Twistweight", "Fitting", "All-court",       // loanwords the Brazilian trade uses
    "Analytics", "Performance", "Status", "Menu", "Nominal",    // words Portuguese shares with English
    "Sweet Spot Trainer, 270 g / 330 mm", "Sweet Spot Trainer, 285 g / 325 mm",
    "Sweet Spot Trainer, 300 g / 325 mm", "Sweet Spot Trainer, 400 g / 320 mm",
  ]),
  tr: new Set([
    "Padel", "Pickleball", "Squash", "Badminton", "Racquetball",
    "Swingweight", "Twistweight", "Fitting", "Nominal",          // what the Turkish trade writes in Latin
    "SPIN — 100 in² · Spin",
    "Sweet Spot Trainer, 270 g / 330 mm", "Sweet Spot Trainer, 285 g / 325 mm",
    "Sweet Spot Trainer, 300 g / 325 mm", "Sweet Spot Trainer, 400 g / 320 mm",
  ]),
  uk: new Set([
    "Sweet Spot Trainer, 270 g / 330 mm", "Sweet Spot Trainer, 285 g / 325 mm",
    "Sweet Spot Trainer, 300 g / 325 mm", "Sweet Spot Trainer, 400 g / 320 mm",
  ]),
  ar: new Set([
    "Swingweight",                                               // the Gulf trade writes it in Latin
    "Sweet Spot Trainer, 270 g / 330 mm", "Sweet Spot Trainer, 285 g / 325 mm",
    "Sweet Spot Trainer, 300 g / 325 mm", "Sweet Spot Trainer, 400 g / 320 mm",
  ]),
  ko: new Set([
    "Sweet Spot Trainer, 270 g / 330 mm", "Sweet Spot Trainer, 285 g / 325 mm",
    "Sweet Spot Trainer, 300 g / 325 mm", "Sweet Spot Trainer, 400 g / 320 mm",
  ]),
  // ---- Languages added 8 October 2026. Each string below is a real word of that language that
  // happens to be spelled as in English — chiefly the names of the racquet sports and the two
  // stringing-trade terms the trade writes in English everywhere.
  cs: new Set([
    "Padel", "Pickleball", "Squash", "Badminton", "Racquetball",
    "Swingweight", "Twistweight",
    "Role", "Sport", "Distributor", "Licence",                     // ordinary Czech words
  ]),
  sl: new Set([
    "Padel", "Pickleball", "Squash", "Badminton", "Racquetball",
    "Swingweight", "Twistweight",
  ]),
  bs: new Set(["Badminton"]),
  sq: new Set([
    "Padel", "Pickleball", "Squash", "Badminton", "Racquetball",
    "Swingweight", "Twistweight", "Distributor", "Menu",
  ]),
  da: new Set([
    "Tennis", "Padel", "Pickleball", "Squash", "Badminton",
    "Swingweight", "Twistweight", "Balance",
    "Start", "Status", "Menu", "Organisation", "Institution", "Distribution", "Service",
    "SPIN — 100 in² · Spin",                                       // mark + unit + the Danish word for the stroke
  ]),
  fi: new Set([
    "Tennis", "Padel", "Pickleball", "Squash", "Racquetball",
    "Swingweight", "Twistweight",
  ]),
  is: new Set(["Tennis", "Padel", "Pickleball", "Badminton", "Racquetball"]),
  ga: new Set(["Pickleball", "Racquetball"]),
  et: new Set([
    "Tennis", "Padel", "Squash", "Pickleball", "Racquetball",
  ]),
  lv: new Set(["Pickleball"]),
  lt: new Set(["Pickleball"]),
  mt: new Set([
    "Tennis", "Padel", "Pickleball", "Squash", "Badminton", "Racquetball",
    "Swingweight", "Twistweight", "Sport", "Status", "Menu",
    "SPIN — 100 in² · Spin",
  ]),
  ca: new Set([
    "Tennis", "Pickleball", "Squash", "Racquetball",
    "Swingweight", "Twistweight",
    "Control", "No", "Nominal", "Professional",                    // Catalan words spelled as in English
    "GREAT — 97 in² · Control", "MAXIMUS GREAT · 97 in² · Control",
  ]),
  eu: new Set([
    "Padel", "Pickleball", "Squash", "Badminton", "Racquetball",
    "Swingweight", "Twistweight",
  ]),
  gl: new Set([
    "Pickleball", "Squash", "Racquetball",
    "Swingweight", "Twistweight",
    "Balance", "Control", "Nominal", "3 series",
    "GREAT — 97 in² · Control", "MAXIMUS GREAT · 97 in² · Control",
  ]),
  // mk and be need no entries: nothing in them collides with English.

};

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
    const trimmed = value.trim();
    if (ALLOWED.has(trimmed) || trimmed === "") continue;
    if ((ALLOWED_BY_LOCALE[locale] || new Set()).has(trimmed)) continue;
    problems.push(`${locale}: untranslated at ${key} :: ${value.slice(0, 70)}`);
  }
}

if (problems.length) {
  console.error(problems.join("\n"));
  console.error(`\ntranslation check FAILED: ${problems.length} untranslated value(s)`);
  process.exit(1);
}
console.log(`translation OK for ${targets.join(", ") || "(nothing to check)"} — no English left in any translated locale`);
