import Link from "next/link";
import { ctx, meta } from "../../../lib/page";
import { href } from "../../../lib/paths";
import { seriesList, otherRacquetSports } from "../../../data/products";
import { PageHero, Section, Cta } from "../../../components/Ui";
import { SeriesCards } from "../../../components/Product";

export const generateMetadata = meta("racquets", (d) => [d.racquets.title, d.racquets.lead]);

export default async function Page({ params }) {
  const { locale, dict } = await ctx(params);
  const R = dict.racquets, L = dict.common.labels, S = dict.common.statuses;
  return (
    <>
      <PageHero eyebrow={dict.nav.groups.racquets} title={R.title} lead={R.lead} />
      <Section first>
        <SeriesCards locale={locale} dict={dict} />
        <p className="note" style={{ marginTop: 22 }}>{R.construction}</p>
      </Section>
      <Section band="band-carbon" title={R.compareTitle} lead={R.compareLead}>
        <div className="spec-wrap" tabIndex={0}>
          <table className="spec">
            <thead><tr><th>{R.columns.series}</th><th className="num">{R.columns.head}</th><th>{R.columns.direction}</th><th className="num">{R.columns.weights}</th><th className="num">{R.columns.range}</th><th>{R.columns.balance}</th></tr></thead>
            <tbody>
              {seriesList.map((s) => (
                <tr key={s.id}>
                  <td><Link href={href(locale, s.id)}><strong>{s.name}</strong></Link></td>
                  <td className="num">{s.headSizeSqIn} {L.sqin}</td>
                  <td>{R.direction[s.direction]}</td>
                  <td className="num">{s.matrix.length}</td>
                  <td className="num">{s.matrix[0].weight}–{s.matrix[s.matrix.length - 1].weight} {L.grams}</td>
                  <td>{s.balanceStatus === "MODELLED" ? <span className="status modelled">{S.modelled}</span> : <span className="status notprovided">{S.notprovided}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="btn-row"><Cta locale={locale} to="build" label={R.ctaConfigure} /><Cta locale={locale} to="precision" label={dict.nav.precision} kind="btn-outline" /><Cta locale={locale} to="grip" label={dict.nav.grip} kind="btn-outline" /></div>
      </Section>
      <Section title={R.otherTitle} lead={R.otherLead}>
        <div className="grid-3">
          {otherRacquetSports.map((k) => <div key={k} className="card"><h3>{R.other[k]}</h3><span className="status direction">{S.direction}</span></div>)}
        </div>
      </Section>
    </>
  );
}
