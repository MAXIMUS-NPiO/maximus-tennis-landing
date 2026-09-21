import { routes, site } from "../data/site";
import { locales } from "./i18n";

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
  const languages = Object.fromEntries(locales.map((l) => [l === "zh" ? "zh-CN" : l, `${site.website}/${l}${path}`]));
  languages["x-default"] = `${site.website}/en${path}`;
  return languages;
}
