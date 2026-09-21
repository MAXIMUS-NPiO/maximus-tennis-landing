import en from "../content/en";
import ru from "../content/ru";
import zh from "../content/zh";
import { site } from "../data/site";

export const locales = site.locales;
export const defaultLocale = site.defaultLocale;

export const localeMeta = {
  en: { name: "English", short: "EN", htmlLang: "en", ogLocale: "en_GB" },
  ru: { name: "Русский", short: "RU", htmlLang: "ru", ogLocale: "ru_RU" },
  zh: { name: "简体中文", short: "中文", htmlLang: "zh-CN", ogLocale: "zh_CN" },
};

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

const dictionaries = { en, ru: merge(en, ru), zh: merge(en, zh) };

export function isLocale(value) {
  return locales.includes(value);
}

/** Returns the full dictionary for a locale. Falls back to English for any unknown locale. */
export function getDict(locale) {
  return dictionaries[isLocale(locale) ? locale : defaultLocale];
}
