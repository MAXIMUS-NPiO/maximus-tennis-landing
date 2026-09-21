import { ctx, meta } from "../../../lib/page";
import { grips } from "../../../data/products";
import { PageHero, Section, Cta } from "../../../components/Ui";
import { GripRow } from "../../../components/Product";

export const generateMetadata = meta("grip", (d) => [d.grip.title, d.grip.lead]);

export default async function Page({ params }) {
  const { locale, dict } = await ctx(params);
  const G = dict.grip;
  return (
    <>
      <PageHero eyebrow={dict.home.carbon.eyebrow} title={G.title} statement={G.statement} lead={G.lead} />
      <Section first><GripRow dict={dict} /></Section>
      <Section band="band-paper">
        <div className="split">
          <div className="stack"><p className="lead">{G.p1}</p><p>{G.p2}</p><p className="muted">{G.p3}</p></div>
          <div className="spec-wrap" tabIndex={0}><table className="spec"><thead><tr><th>{G.columns.size}</th><th className="num">{G.columns.nominal}</th><th>{G.columns.family}</th></tr></thead><tbody>
            {grips.map((g) => <tr key={g.id}><td><strong>{g.id}</strong></td><td className="num">{g.inches}{g.fraction}″</td><td><small>{G.families}</small></td></tr>)}
          </tbody></table></div>
        </div>
        <div className="btn-row"><Cta locale={locale} to="build" label={G.cta} /></div>
      </Section>
    </>
  );
}
