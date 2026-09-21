import { getDict } from "./i18n";
import { pageMeta } from "./metadata";
import { routes } from "../data/site";

/** Resolve locale + dictionary for a page. */
export async function ctx(params) {
  const { locale } = await params;
  return { locale, dict: getDict(locale) };
}

/** Standard metadata factory: key = route key, pick = (dict) => [title, description]. */
export function meta(key, pick) {
  return async function generateMetadata({ params }) {
    const { locale, dict } = await ctx(params);
    const [title, description] = pick(dict);
    return pageMeta(locale, routes[key], title, description);
  };
}
