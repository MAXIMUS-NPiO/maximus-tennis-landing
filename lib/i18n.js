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

const dictionaries = { en, ru, zh };

export function isLocale(value) {
  return locales.includes(value);
}

/** Returns the full dictionary for a locale. Falls back to English for any unknown locale. */
export function getDict(locale) {
  return dictionaries[isLocale(locale) ? locale : defaultLocale];
}
