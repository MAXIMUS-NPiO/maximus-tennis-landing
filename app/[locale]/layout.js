/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
// The catalogue's typefaces, self-hosted: each file declares its scripts by unicode-range, so a
// browser downloads only the subsets the page actually uses.
import "@fontsource-variable/inter";
import "@fontsource/cormorant-garamond/500.css";
import "@fontsource/cormorant-garamond/600.css";
import "@fontsource/cormorant-garamond/500-italic.css";
import "../globals.css";
import { notFound } from "next/navigation";
import Header from "../../components/Header";
import LanguageSuggestion from "../../components/LanguageSuggestion";
import Footer from "../../components/Footer";
import Analytics from "../../components/Analytics";
import { getDict, isLocale, localeMeta, locales } from "../../lib/i18n";
import { site } from "../../data/site";
import { AUTHOR, FIRST_YEAR, authorNode, noticeLine, rightsUrl } from "../../lib/authorship";
import { languageNames, regionNames, regionOf } from "../../data/language-names";

export const dynamicParams = false;
export function generateStaticParams() { return locales.map((locale) => ({ locale })); }

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const dict = getDict(locale);
  return {
    metadataBase: new URL(site.website),
    title: { default: dict.meta.defaultTitle, template: `%s` },
    description: dict.meta.defaultDescription,
    applicationName: dict.meta.siteName,
    openGraph: { siteName: dict.meta.siteName, type: "website", images: ["/brand/og-maximus.png"] },
    robots: { index: true, follow: true },
    // Authorship on every page, in the head as well as in the footer (Founder, 10 October 2026).
    authors: [{ name: AUTHOR, url: rightsUrl(locale) }],
    creator: AUTHOR,
    other: { copyright: noticeLine(), "dcterms.rightsHolder": AUTHOR, "dcterms.rights": rightsUrl(locale) },
  };
}

export default async function LocaleLayout({ children, params }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDict(locale);
  // Factual structured data only: brand, site, logo, contact address and the verified profile.
  const org = {
    "@type": "Organization",
    name: "MAXIMUS",
    alternateName: "MAXIMUS GPS",
    url: site.website,
    logo: `${site.website}/brand/maximus-lion-emblem.png`,
    email: site.email,
    sameAs: [site.instagram],
  };
  // The site as a work: its author, the holder of its copyright, and where the rights are stated.
  const work = {
    "@type": "WebSite",
    url: `${site.website}/${locale}`,
    name: dict.meta.siteName,
    inLanguage: localeMeta[locale].hrefLang,
    author: authorNode(),
    creator: authorNode(),
    copyrightHolder: authorNode(),
    copyrightYear: FIRST_YEAR,
    copyrightNotice: noticeLine(),
    license: rightsUrl(locale),
  };
  const graph = { "@context": "https://schema.org", "@graph": [org, work] };
  return (
    <html lang={localeMeta[locale].htmlLang} dir={localeMeta[locale].dir}>
      <body>
        <LanguageSuggestion locale={locale} />
        <Header locale={locale} nav={dict.nav} langMenu={{ names: languageNames[locale], namesEn: languageNames.en, regionNames: regionNames[locale], regionOf }} />
        <main id="main">{children}</main>
        <Footer locale={locale} dict={dict} />
        <Analytics locale={locale} dict={dict.consent} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }} />
      </body>
    </html>
  );
}
