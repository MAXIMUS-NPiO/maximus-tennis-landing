import { ctx, meta } from "../../../../lib/page";
import { spotTrainer as spot } from "../../../../data/products";
import { media, spotGallery } from "../../../../data/media";
import { PageHero, Section, Cta, Kickers } from "../../../../components/Ui";
import SpotShowcase from "../../../../components/SpotShowcase";

export const generateMetadata = meta("spot", (d) => [d.spot.title, d.spot.lead]);

export default async function Page({ params }) {
  const { locale, dict } = await ctx(params);
  const S = dict.spot, L = dict.common.labels;
  const C = dict.seriesPage.catalogue;

  // The photographs are handed over as plain image records, so the dictionary stays on the server
  // and only the strings this section needs cross to the client.
  const views = spotGallery.map((id) => ({ id, img: media[id].src, alt: dict.media[id] }));

  return (
    <>
      <PageHero eyebrow={dict.nav.groups.training} title={S.title} lead={S.lead} />
      <SpotShowcase
        eyebrow={S.purposeTitle}
        title={dict.seriesPage.specsTitle}
        lead={S.purposeP}
        views={views}
        weights={spot.weights}
        weightsLabel={S.weightsTitle}
        specs={[
          [C.gripsLabel, spot.grips],
        ]}
        note={`${S.grips} ${S.weightsP}`}
        strings={{ zoom: C.zoom, close: C.close, grams: L.grams }}
      />
      <Section band="band-1"><Kickers items={S.notes} /><div className="btn-row"><Cta locale={locale} to="contact" label={S.cta} purpose="product" /></div></Section>
    </>
  );
}
