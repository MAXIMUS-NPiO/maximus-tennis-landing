import { notFound } from "next/navigation";
import { ctx } from "../../../../lib/page";
import { pageMeta } from "../../../../lib/metadata";
import { routes } from "../../../../data/site";
import { seriesList, getSeries, precisionClasses } from "../../../../data/products";
import { seriesMedia, spinWeights } from "../../../../data/media";
import { locales } from "../../../../lib/i18n";
import { Section, Cta, Note, Steps } from "../../../../components/Ui";
import { WeightMatrix, PrecisionTable, GripRow } from "../../../../components/Product";
import { Photo, PhotoPending } from "../../../../components/Media";
import TrackView from "../../../../components/TrackView";

export const dynamicParams = false;
export function generateStaticParams() {
  return locales.flatMap((locale) => seriesList.map((s) => ({ locale, series: s.id })));
}

export async function generateMetadata({ params }) {
  const { locale, series: id } = await params;
  const { dict } = await ctx(Promise.resolve({ locale }));
  const s = getSeries(id);
  if (!s) return {};
  return pageMeta(locale, routes[id], `${s.name} — ${s.headSizeSqIn} in² · ${dict.racquets.direction[s.direction]}`, dict.seriesPage.intro[id]);
}

export default async function Page({ params }) {
  const { locale, series: id } = await params;
  const { dict } = await ctx(Promise.resolve({ locale }));
  const s = getSeries(id);
  if (!s) notFound();
  const P = dict.seriesPage;
  const L = dict.common.labels;
  const R = dict.racquets;
  const S = dict.common.statuses;
  const M = dict.media;
  const m = seriesMedia[id];
  const requested = s.matrixStatus === "REQUESTED_ARCHITECTURE";
  const modelled = s.balanceStatus === "MODELLED";
  const hero = m.full; // a detail photo is never promoted to the series hero
  const faq = requested ? [P.faqSpinBalance, ...P.faq.slice(1)] : P.faq;
  const configure = <Cta locale={locale} to="build" query={`series=${id}&from=series`} label={P.ctaBuild} track={`series_configure_${id}`} series={id} />;
  const ask = <Cta locale={locale} to="contact" query={`purpose=product&series=${id}`} label={P.ctaAsk} kind="btn-outline" track={`series_ask_${id}`} series={id} />;

  return (
    <>
      <TrackView event="series_view" params={{ series: id, locale }} />
      <section className="series-hero">
        <div className="shell series-hero-grid">
          {hero ? (
            <Photo id={hero} alt={M[hero]} caption={dict.home.series.photoLabel[id] || M[hero]} priority sizes="(min-width: 900px) 360px, 290px" className="series-hero-photo" />
          ) : (
            <PhotoPending name={s.short} sub={`${s.headSizeSqIn} ${L.sqin} · ${R.direction[s.direction]}`} note={P.photoPending} className="series-hero-photo" />
          )}
          <div className="series-hero-copy">
            <p className="eyebrow accent">{P.eyebrow} · {R.directionLabel}: {R.direction[s.direction]}</p>
            <h1 className="h-1">{s.name}</h1>
            <p className="lead">{P.intro[id]}</p>
            <h2 className="eyebrow" style={{ marginTop: 26 }}>{P.specsTitle}</h2>
            <dl className="spec-list">
              <div><dt>{P.specs.head}</dt><dd>{s.headSizeSqIn} {L.sqin}</dd></div>
              <div><dt>{P.specs.direction}</dt><dd>{R.direction[s.direction]}</dd></div>
              <div><dt>{P.specs.weights}</dt><dd>{s.matrix.length} · {s.matrix[0].weight}–{s.matrix[s.matrix.length - 1].weight} {L.grams} <span className={`status ${requested ? "requested" : "confirmed"}`}>{requested ? S.requested : S.confirmed}</span></dd></div>
              <div><dt>{P.specs.balance}</dt><dd><span className={`status ${modelled ? "modelled" : "notprovided"}`}>{modelled ? S.modelled : S.notprovided}</span></dd></div>
              <div><dt>{P.specs.construction}</dt><dd>{P.construction}</dd></div>
              <div><dt>{P.specs.grips}</dt><dd>L0–L7</dd></div>
              <div><dt>{P.specs.precision}</dt><dd>{precisionClasses.map((c) => c.id).join(" · ")}</dd></div>
            </dl>
            <div className="btn-row">{configure}{ask}</div>
          </div>
        </div>
      </section>

      {id === "spin" && (
        <Section first title={P.weightVisualTitle} lead={P.weightVisualLead}>
          <div className="detail-grid">
            {spinWeights.map((k) => (
              <Photo key={k} id={k} alt={M[k]} caption={M[k]} sizes="(min-width: 760px) 30vw, 92vw" />
            ))}
          </div>
        </Section>
      )}

      <Section title={P.optionsTitle}>
        {m.details.filter((d) => d !== hero).length > 0 ? (
          <div className="detail-grid" style={{ marginBottom: 26 }}>
            {m.details.filter((d) => d !== hero).map((d) => <Photo key={d} id={d} alt={M[d]} caption={M[d]} sizes="(min-width: 760px) 30vw, 92vw" />)}
          </div>
        ) : null}
        {!m.full && <Note red>{P.detailPending}</Note>}
        <div className="split" style={{ marginTop: 20 }}>
          <PrecisionTable dict={dict} compact />
          <div className="stack"><GripRow dict={dict} emphasise={false} /><p className="muted small">{dict.home.carbon.gripP}</p></div>
        </div>
        <Note>{P.notPublished}</Note>
        <div className="btn-row">{configure}</div>
      </Section>

      <Section band="band-1" title={P.matrixTitle} lead={P.matrixLead}>
        <div className="badges" style={{ marginBottom: 16 }}>
          <span className={`status ${requested ? "requested" : "confirmed"}`}>{L.weight}: {requested ? S.requested : S.confirmed}</span>
          <span className={`status ${modelled ? "modelled" : "notprovided"}`}>{L.balance}: {modelled ? S.modelled : S.notprovided}</span>
        </div>
        {requested && <p className="note red" style={{ marginBottom: 16 }}>{P.spinExplanation}</p>}
        <WeightMatrix series={s} dict={dict} />
        {modelled && <Note>{P.balanceNote.modelled}</Note>}
        <div className="btn-row">{configure}<Cta locale={locale} to="racquets" label={P.ctaCompare} kind="btn-outline" /></div>
      </Section>

      <Section title={P.offerTitle}>
        <div className="split">
          <Steps items={P.offerSteps} />
          <div>
            <h3 className="h-3" style={{ marginBottom: 12 }}>{P.faqTitle}</h3>
            {faq.map(([q, a]) => (
              <details key={q} className="expander"><summary>{q}</summary><div><p>{a}</p></div></details>
            ))}
          </div>
        </div>
        <p className="muted small" style={{ marginTop: 20 }}>{dict.common.truth.noPrices}</p>
        <div className="btn-row">{configure}{ask}</div>
      </Section>
    </>
  );
}
