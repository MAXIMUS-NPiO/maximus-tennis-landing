import { notFound } from "next/navigation";
import { ctx } from "../../../../lib/page";
import { pageMeta } from "../../../../lib/metadata";
import { routes } from "../../../../data/site";
import { seriesList, getSeries } from "../../../../data/products";
import { locales } from "../../../../lib/i18n";
import { PageHero, Section, Cta, Kickers, Note } from "../../../../components/Ui";
import { WeightMatrix, PrecisionTable, GripRow } from "../../../../components/Product";

export const dynamicParams = false;
export function generateStaticParams() {
  return locales.flatMap((locale) => seriesList.map((s) => ({ locale, series: s.id })));
}

export async function generateMetadata({ params }) {
  const { locale, series: id } = await params;
  const { dict } = await ctx(Promise.resolve({ locale }));
  const s = getSeries(id);
  if (!s) return {};
  return pageMeta(locale, routes[id], `${s.name} — ${s.headSizeSqIn} in²`, dict.seriesPage.intro[id]);
}

export default async function Page({ params }) {
  const { locale, series: id } = await params;
  const { dict } = await ctx(Promise.resolve({ locale }));
  const s = getSeries(id);
  if (!s) notFound();
  const P = dict.seriesPage, L = dict.common.labels, R = dict.racquets, S = dict.common.statuses;
  return (
    <>
      <PageHero eyebrow={`${P.eyebrow} · ${R.directionLabel}: ${R.direction[s.direction]}`} title={s.name} lead={P.intro[id]}>
        <div className="hero-meta">
          <div><b>{s.headSizeSqIn} {L.sqin}</b>{L.headSize}</div>
          <div><b>{s.matrix.length}</b>{P.weightsLabel}</div>
          <div><b>{s.matrix[0].weight}–{s.matrix[s.matrix.length - 1].weight} {L.grams}</b>{L.weight}</div>
          <div><b>L0–L7</b>{L.grip}</div>
        </div>
      </PageHero>
      <Section first title={P.matrixTitle} lead={P.matrixLead}>
        <div className="badges" style={{ marginBottom: 16 }}>
          <span className="status confirmed">{S.confirmed} · {L.weight}</span>
          <span className={`status ${s.balanceStatus === "MODELLED" ? "modelled" : "notprovided"}`}>{s.balanceStatus === "MODELLED" ? S.modelled : S.notprovided} · {L.balance}</span>
        </div>
        <WeightMatrix series={s} dict={dict} />
        <Note>{s.balanceStatus === "MODELLED" ? P.balanceNote.modelled : P.balanceNote.notprovided}</Note>
        <div className="btn-row"><Cta locale={locale} to="build" label={P.ctaBuild} /><Cta locale={locale} to="racquets" label={P.ctaCompare} kind="btn-outline" /></div>
      </Section>
      <Section band="band-1" title={P.sharedTitle}>
        <div className="split">
          <Kickers items={P.shared} />
          <div className="stack"><PrecisionTable dict={dict} compact /><GripRow dict={dict} emphasise={false} /></div>
        </div>
        <Note red>{P.notPublished}</Note>
      </Section>
    </>
  );
}
