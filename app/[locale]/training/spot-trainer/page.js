import { ctx, meta } from "../../../../lib/page";
import { spotTrainer as spot } from "../../../../data/products";
import { PageHero, Section, Cta, Kickers, Note } from "../../../../components/Ui";

export const generateMetadata = meta("spot", (d) => [d.spot.title, d.spot.lead]);

export default async function Page({ params }) {
  const { locale, dict } = await ctx(params);
  const S = dict.spot, L = dict.common.labels, ST = dict.common.statuses;
  return (
    <>
      <PageHero eyebrow={dict.nav.groups.training} title={S.title} lead={S.lead} />
      <Section first title={S.purposeTitle} lead={S.purposeP}>
        <div className="grid-2">
          <div className="card"><p className="eyebrow">{S.weightsTitle}</p><div className="chain">{spot.weights.map((w) => <span key={w}>{w} {L.grams}</span>)}</div><p style={{ marginTop: 14 }}>{S.weightsP}</p></div>
          <div className="card"><p className="eyebrow">{L.grip}</p><p className="statement" style={{ fontSize: 28 }}>L0–L7</p><p>{S.grips}</p><span className="status notprovided">{ST.notprovided}</span><p style={{ marginTop: 8 }}>{S.dims}</p></div>
        </div>
      </Section>
      <Section band="band-1"><Kickers items={S.notes} /><div className="btn-row"><Cta locale={locale} to="contact" label={S.cta} purpose="product" /></div></Section>
    </>
  );
}
