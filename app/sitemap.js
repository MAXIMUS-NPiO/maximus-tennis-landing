import { routes, site } from "../data/site";
import { locales } from "../lib/i18n";

export default function sitemap() {
  const out = [];
  for (const key of Object.keys(routes)) {
    for (const l of locales) {
      out.push({ url: `${site.website}/${l}${routes[key]}`, lastModified: new Date("2026-09-21"), changeFrequency: "monthly", priority: key === "home" ? 1 : 0.7,
        alternates: { languages: Object.fromEntries(locales.map((x) => [x === "zh" ? "zh-CN" : x, `${site.website}/${x}${routes[key]}`])) } });
    }
  }
  return out;
}
