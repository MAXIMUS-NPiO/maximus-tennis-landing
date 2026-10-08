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
  };
}

export default async function LocaleLayout({ children, params }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDict(locale);
  // Factual structured data only: brand, site, logo, contact address and the verified profile.
  const org = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "MAXIMUS",
    alternateName: "MAXIMUS GPS",
    url: site.website,
    logo: `${site.website}/brand/maximus-lion-emblem.png`,
    email: site.email,
    sameAs: [site.instagram],
  };
  return (
    <html lang={localeMeta[locale].htmlLang} dir={localeMeta[locale].dir}>
      <body>
        <LanguageSuggestion locale={locale} />
        <Header locale={locale} nav={dict.nav} />
        <main id="main">{children}</main>
        <Footer locale={locale} dict={dict} />
        <Analytics locale={locale} dict={dict.consent} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(org) }} />
      </body>
    </html>
  );
}
