import { bundles } from "../content";
import { site } from "../data/site";

export const locales = site.locales;
export const defaultLocale = site.defaultLocale;

/** Per-language metadata, read from the single registry in data/site.js. */
export const localeMeta = Object.fromEntries(
  locales.map((l) => {
    const m = site.localeMeta[l];
    return [l, { name: m.name, short: m.short, htmlLang: m.hrefLang, ogLocale: m.ogLocale }];
  }),
);

/**
 * Safety net only: a key missing in a translation falls back to English instead of breaking the
 * page. Parity is enforced separately by `npm run check:i18n`, which fails on any missing key.
 */
function merge(base, over) {
  if (Array.isArray(base)) return Array.isArray(over) ? over : base;
  if (base && typeof base === "object") {
    const out = { ...base };
    if (over && typeof over === "object") for (const k of Object.keys(over)) out[k] = k in base ? merge(base[k], over[k]) : over[k];
    return out;
  }
  return over === undefined ? base : over;
}

/** Every locale is merged over English, so a key added to English never breaks a page. */
const base = bundles[defaultLocale];
const dictionaries = Object.fromEntries(
  locales.map((l) => [l, l === defaultLocale ? base : merge(base, bundles[l] || {})]),
);

export function isLocale(value) {
  return locales.includes(value);
}

/** Returns the full dictionary for a locale. Falls back to English for any unknown locale. */
export function getDict(locale) {
  return dictionaries[isLocale(locale) ? locale : defaultLocale];
}
