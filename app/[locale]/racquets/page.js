import Link from "next/link";
import { ctx, meta } from "../../../lib/page";
import { href } from "../../../lib/paths";
import { seriesList, otherRacquetSports } from "../../../data/products";
import { PageHero, Section, Cta, Kickers } from "../../../components/Ui";
import { SeriesCards } from "../../../components/Product";
import SeriesIndex from "../../../components/SeriesIndex";

export const generateMetadata = meta("racquets", (d) => [d.racquets.title, d.racquets.lead]);

export default async function Page({ params }) {
  const { locale, dict } = await ctx(params);
  const R = dict.racquets, L = dict.common.labels, S = dict.common.statuses;
  return (
    <>
      <PageHero eyebrow={dict.nav.groups.racquets} title={R.title} lead={R.lead} />
      <Section first>
        <div style={{ marginBottom: 36 }}><SeriesIndex locale={locale} dict={dict} /></div>
        <SeriesCards locale={locale} dict={dict} />
        <p className="note" style={{ marginTop: 22 }}>{R.construction}</p>
      </Section>
      <Section title={R.compareTitle}>
        <div className="spec-wrap" tabIndex={0}>
          <table className="spec">
            <thead><tr><th>{R.columns.series}</th><th className="num">{R.columns.head}</th><th>{R.columns.direction}</th><th className="num">{R.columns.weights}</th><th className="num">{R.columns.range}</th><th>{R.columns.balance}</th></tr></thead>
            <tbody>
              {seriesList.map((s) => (
                <tr key={s.id}>
                  <td className="row-head"><Link href={href(locale, s.id)}><strong>{s.name}</strong></Link></td>
                  <td className="num" data-label={R.columns.head}>{s.headSizeSqIn} {L.sqin}</td>
                  <td data-label={R.columns.direction}>{R.direction[s.direction]}</td>
                  <td className="num" data-label={R.columns.weights}>{s.matrix.length}</td>
                  <td className="num" data-label={R.columns.range}>{s.matrix[0].weight}–{s.matrix[s.matrix.length - 1].weight} {L.grams}</td>
                  <td data-label={R.columns.balance}>{s.balanceStatus === "MODELLED" ? <span className="status modelled">{S.modelled}</span> : <span className="status confirmed">{S.confirmed}</span>}{s.matrixStatus === "REQUESTED_ARCHITECTURE" && <><br /><span className="status requested" style={{ marginTop: 6 }}>{S.requested}</span></>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="btn-row"><Cta locale={locale} to="choose" label={dict.nav.choose} track="racquets_choose" /><Cta locale={locale} to="build" label={R.ctaConfigure} kind="btn-outline" /><Cta locale={locale} to="precision" label={dict.nav.precision} kind="btn-outline" /><Cta locale={locale} to="grip" label={dict.nav.grip} kind="btn-outline" /></div>
      </Section>
      <Section title={R.otherTitle} lead={R.otherLead}>
        <div className="facts">
          <Kickers items={otherRacquetSports.map((k) => R.other[k])} />
        </div>
      </Section>
    </>
  );
}
