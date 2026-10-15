/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import { ctx, meta } from "../../../lib/page";
import { localeMeta } from "../../../lib/i18n";
import { catalogue } from "../../../data/catalogue";
import { catalogueCounts, nationalPackage } from "../../../data/products";
import { fill } from "../../../content/catalogue-download-copy.js";
import { PageHero, Section, Cta } from "../../../components/Ui";
import CatalogueDownload from "../../../components/CatalogueDownload";

export const generateMetadata = meta("catalogue", (d) => [d.catalogueDownload.title, d.catalogueDownload.metaDescription]);

/**
 * The catalogue (Founder's update of 14 October 2026): the visible edition, an overview of what the
 * PDF contains, and the PDF itself from its stable address. Every count comes from data/products.js,
 * the same matrix the configurator uses; nothing here is typed by hand.
 */
export default async function Page({ params }) {
  const { locale, dict } = await ctx(params);
  const K = dict.catalogueDownload;
  const nf = new Intl.NumberFormat(localeMeta[locale]?.htmlLang || "en");
  const matrix = fill(K.matrix, { variants: nf.format(catalogueCounts.totalRequestedVariants), combinations: nf.format(nationalPackage.combinations) });
  const [cover, ...inside] = catalogue.previews;
  // Chapters as laid out in the PDF of the current edition (data/catalogue.js).
  const { chapterPages } = catalogue;

  return (
    <>
      <PageHero eyebrow={K.eyebrow} title={K.title} lead={K.lead}>
        <CatalogueDownload locale={locale} dict={dict} configure />
      </PageHero>
      <Section first>
        <div className="catalogue-overview">
          <a className="catalogue-cover" href={catalogue.stablePath} download={catalogue.fileName}>
            <img src={cover.src} width={cover.width} height={cover.height} alt={`${K.eyebrow} · ${cover.page}`} loading="eager" decoding="async" />
          </a>
          <div className="catalogue-index">
            <h2 className="h-2">{K.insideTitle}</h2>
            <ol className="catalogue-chapters">
              {K.chapters.map((c, i) => (
                <li key={c}><span className="mono">{String(i + 1).padStart(2, "0")}</span><b>{c}</b><span className="mono">{chapterPages[i]}</span></li>
              ))}
            </ol>
            <p className="lead">{matrix}</p>
            <div className="catalogue-pages">
              {inside.map((p) => (
                <img key={p.src} src={p.src} width={p.width} height={p.height} alt={`${K.eyebrow} · ${p.page}`} loading="lazy" decoding="async" />
              ))}
            </div>
          </div>
        </div>
        <div className="btn-row">
          <Cta locale={locale} to="choose" label={K.heroChoose} track="catalogue_choose" />
          <Cta locale={locale} to="partnerships" label={K.heroPartner} kind="btn-outline" track="catalogue_partner" />
        </div>
      </Section>
    </>
  );
}
