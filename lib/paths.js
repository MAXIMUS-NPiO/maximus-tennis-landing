/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import { routes, site } from "../data/site";

// The locale list comes from the site data, not from lib/i18n: lib/i18n loads every dictionary,
// and this module runs in the browser (header, language menu, forms). Importing it from here put
// all 48 dictionaries into the JavaScript of every page.
const locales = site.locales;

/** Locale-prefixed href for a route key or a raw locale-relative path. */
export function href(locale, key) {
  const path = key in routes ? routes[key] : key;
  return `/${locale}${path || ""}`;
}

/** Swap the locale prefix of a pathname while preserving the page. */
export function switchLocale(pathname, locale) {
  const parts = (pathname || "/").split("/");
  if (locales.includes(parts[1])) {
    parts[1] = locale;
    return parts.join("/") || `/${locale}`;
  }
  return `/${locale}${pathname === "/" ? "" : pathname}`;
}

export function absoluteUrl(path) {
  return `${site.website}${path}`;
}

/** hreflang alternates for a locale-relative path. */
export function alternates(path) {
  const languages = Object.fromEntries(locales.map((l) => [site.localeMeta[l].hrefLang, `${site.website}/${l}${path}`]));
  languages["x-default"] = `${site.website}/${site.defaultLocale}${path}`;
  return languages;
}
