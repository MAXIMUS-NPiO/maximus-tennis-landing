import Link from "next/link";
import { ctx, meta } from "../../../lib/page";
import { href } from "../../../lib/paths";
import { sweetSpotTrainer } from "../../../data/products";
import { PageHero, Section, Cta, Note } from "../../../components/Ui";

export const generateMetadata = meta("training", (d) => [d.training.title, d.training.lead]);

export default async function Page({ params }) {
  const { locale, dict } = await ctx(params);
  const T = dict.training, L = dict.common.labels;
  return (
    <>
      <PageHero eyebrow={dict.nav.groups.training} title={T.title} lead={T.lead} />
      <Section first>
        <div className="grid-3">
          <Link href={href(locale, "sst")} className="card card-link"><h3>{T.sst.h}</h3><p>{T.sst.p}</p><p className="mono" style={{ fontSize: 13 }}>{sweetSpotTrainer.headSizeSqIn} {L.sqin} · {sweetSpotTrainer.system.map((x) => x.weight).join(" / ")} {L.grams}</p><span className="arrow">{L.learn} →</span></Link>
          <Link href={href(locale, "spot")} className="card card-link"><h3>{T.spot.h}</h3><p>{T.spot.p}</p><span className="arrow">{L.learn} →</span></Link>
          <Link href={href(locale, "methodology")} className="card card-link"><h3>{T.method.h}</h3><p>{T.method.p}</p><span className="arrow">{L.learn} →</span></Link>
        </div>
        <Note>{T.distinct}</Note>
      </Section>
      <Section band="band-paper" title={T.experience} lead={T.experienceP}>
        <div className="btn-row" style={{ marginTop: 0 }}><Cta locale={locale} to="experience" label={T.cta} /></div>
      </Section>
    </>
  );
}
