import "../globals.css";
import { notFound } from "next/navigation";
import Header from "../../components/Header";
import Footer from "../../components/Footer";
import { getDict, isLocale, localeMeta, locales } from "../../lib/i18n";
import { site, entities } from "../../data/site";

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
  const org = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "MAXIMUS GPS",
    alternateName: "MAXIMUS",
    url: site.website,
    logo: `${site.website}/brand/maximus-lion-emblem.png`,
    email: site.email,
    sameAs: [site.instagram],
    description: dict.meta.defaultDescription,
    parentOrganization: { "@type": "Organization", name: entities.stewardship },
  };
  return (
    <html lang={localeMeta[locale].htmlLang}>
      <body>
        <Header locale={locale} nav={dict.nav} />
        <main id="main">{children}</main>
        <Footer locale={locale} dict={dict} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(org) }} />
      </body>
    </html>
  );
}
