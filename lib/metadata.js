import { site } from "../data/site";
import { getDict, localeMeta } from "./i18n";
import { alternates } from "./paths";

export function pageMeta(locale, path, title, description) {
  const dict = getDict(locale);
  const url = `${site.website}/${locale}${path}`;
  const fullTitle = `${title}${dict.meta.titleSuffix}`;
  return {
    title: fullTitle,
    description,
    alternates: { canonical: url, languages: alternates(path) },
    openGraph: { title: fullTitle, description, url, siteName: dict.meta.siteName, locale: localeMeta[locale].ogLocale, type: "website", images: [{ url: "/brand/og-maximus.png", width: 1200, height: 630, alt: "MAXIMUS GPS" }] },
    twitter: { card: "summary_large_image", title: fullTitle, description, images: ["/brand/og-maximus.png"] },
  };
}
