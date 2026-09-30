import { site } from "../data/site";

/**
 * Language negotiation, kept free of framework imports so it can be tested and reused.
 *
 * The table is built from the registry in data/site.js: a device language tag selects the
 * locale whose `match` list holds the longest matching prefix. Adding a language there is
 * enough; nothing here needs editing.
 */
const TABLE = [];
for (const locale of site.locales) {
  for (const tag of site.localeMeta[locale].match || [locale]) TABLE.push([tag.toLowerCase(), locale]);
}
TABLE.sort((a, b) => b[0].length - a[0].length);

/** Best available locale for a list of language tags, most preferred first. */
export function matchLocale(tags) {
  for (const raw of tags || []) {
    const tag = String(raw || "").toLowerCase();
    if (!tag || tag === "*") continue;
    const hit = TABLE.find(([prefix]) => tag === prefix || tag.startsWith(`${prefix}-`));
    if (hit) return hit[1];
  }
  return site.defaultLocale;
}

/** Best available locale for an Accept-Language header, honouring the q values. */
export function pick(acceptLanguage) {
  if (!acceptLanguage) return site.defaultLocale;
  const wanted = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.split(";").map((s) => s.trim());
      const q = params.map((p) => p.match(/^q=([0-9.]+)$/i)).find(Boolean);
      return { tag, q: q ? Number(q[1]) : 1 };
    })
    .filter((x) => x.tag)
    .sort((a, b) => b.q - a.q)
    .map((x) => x.tag);
  return matchLocale(wanted);
}
