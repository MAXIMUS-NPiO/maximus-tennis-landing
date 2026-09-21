import Link from "next/link";
import { getDict } from "../../lib/i18n";
import { pageMeta } from "../../lib/metadata";
import { formDict } from "../../lib/page";
import { href } from "../../lib/paths";
import { routes } from "../../data/site";
import { seriesList, sweetSpotTrainer } from "../../data/products";
import { seriesMedia } from "../../data/media";
import { Section, Chain, Cta, Kickers } from "../../components/Ui";
import { Photo, PhotoPending } from "../../components/Media";
import { StiffnessSchematic, GripScale } from "../../components/Schematics";
import PrecisionSwitch from "../../components/PrecisionSwitch";
import LeadForm from "../../components/LeadForm";

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const d = getDict(locale);
  return pageMeta(locale, routes.home, d.meta.defaultTitle, d.meta.defaultDescription);
}

const HOME_PURPOSES = ["general", "selection", "coach", "club", "distribution", "strategic"];

export default async function Home({ params }) {
  const { locale } = await params;
  const dict = getDict(locale);
  const H = dict.home;
  const L = dict.common.labels;
  const S = dict.common.statuses;
  const M = dict.media;
  const sst = sweetSpotTrainer;

  return (
    <>
      {/* 01 — racquet, positioning, action */}
      <section id="top" className="hero hero-product">
        <div className="shell hero-grid">
          <div className="hero-copy">
            <p className="eyebrow accent">{H.heroEyebrow}</p>
            <h1 className="h-display">{H.heroTitle}</h1>
            <p className="hero-line">{H.heroProduct}</p>
            <div className="btn-row">
              <Cta locale={locale} to="choose" label={H.heroCta1} track="hero_choose" />
              <Cta locale={locale} to="racquets" label={H.heroCta2} kind="btn-outline" track="hero_series" />
            </div>
          </div>
          <Photo id="powerFull" alt={M.powerFull} caption={H.heroCaption} priority sizes="(min-width: 900px) 360px, 270px" className="hero-photo" />
          <div className="hero-meta">
            {H.heroMeta.map(([b, s]) => <div key={b}><b>{b}</b>{s}</div>)}
          </div>
        </div>
      </section>

      {/* 02 — choose your path */}
      <Section id="paths" band="band-1" eyebrow={H.paths.eyebrow} title={H.paths.title}>
        <div className="grid-4">
          {[["player", "choose"], ["parent", "families"], ["coach", "coaches"], ["partner", "partnerships"]].map(([k, to]) => (
            <Link key={k} href={href(locale, to)} className="card card-link path-card">
              <h3>{H.paths.items[k].h}</h3>
              <p>{H.paths.items[k].p}</p>
              <span className="arrow">{H.paths.items[k].a} →</span>
            </Link>
          ))}
        </div>
      </Section>

      {/* 03 — GREAT / POWER / SPIN with their own photographs */}
      <Section id="series" eyebrow={H.series.eyebrow} title={H.series.title} lead={H.series.lead}>
        <div className="series-grid">
          {seriesList.map((s) => {
            const card = seriesMedia[s.id].card;
            const requested = s.matrixStatus === "REQUESTED_ARCHITECTURE";
            return (
              <article key={s.id} className="series-card">
                {card ? (
                  <Photo id={card} alt={M[card]} caption={H.series.photoLabel[s.id]} sizes="(min-width: 1024px) 30vw, (min-width: 760px) 45vw, 92vw" className="series-photo" />
                ) : (
                  <PhotoPending name={s.short} sub={`${s.headSizeSqIn} ${L.sqin}`} note={H.series.photoPending} className="series-photo" />
                )}
                <div className="series-body">
                  <p className="eyebrow">{dict.racquets.direction[s.direction]} · {s.headSizeSqIn} {L.sqin}</p>
                  <h3>{s.name}</h3>
                  <p className="mono">{s.matrix.length} {L.points} · {s.matrix[0].weight}–{s.matrix[s.matrix.length - 1].weight} {L.grams}</p>
                  <div className="badges">
                    <span className={`status ${requested ? "requested" : "confirmed"}`}>{L.weight}: {requested ? S.requested : S.confirmed}</span>
                    <span className={`status ${s.balanceStatus === "MODELLED" ? "modelled" : "notprovided"}`}>{L.balance}: {s.balanceStatus === "MODELLED" ? S.modelled : S.notprovided}</span>
                  </div>
                  <div className="btn-row">
                    <Cta locale={locale} to="build" query={`series=${s.id}&from=series`} label={`${H.series.configure} ${s.short}`} track={`home_configure_${s.id}`} series={s.id} />
                    <Cta locale={locale} to={s.id} label={H.series.open} kind="btn-outline" />
                  </div>
                </div>
              </article>
            );
          })}
        </div>
        <div className="btn-row"><Cta locale={locale} to="racquets" label={H.series.cta} kind="btn-outline" /></div>
      </Section>

      {/* 04 — precision switch */}
      <Section id="precision" band="band-1" eyebrow={H.precision.eyebrow} title={H.precision.title}>
        <p className="statement" style={{ marginBottom: 18 }}><span className="accent">{H.precision.sub}</span></p>
        <p className="lead" style={{ marginBottom: 26 }}>{H.precision.lead}</p>
        <PrecisionSwitch dict={{ precision: dict.precision, common: dict.common }} />
        <p className="muted small" style={{ marginTop: 14 }}>{dict.precision.programmeNote}</p>
        <div className="btn-row"><Cta locale={locale} to="precision" label={H.precision.cta} kind="btn-outline" /></div>
      </Section>

      {/* 05 — stiffness */}
      <Section id="stiffness" eyebrow={H.stiffness.eyebrow} title={H.stiffness.title}>
        <div className="split">
          <div className="stack">
            <p className="lead">{H.stiffness.p}</p>
            <div className="grid-3 compact-stats">
              {H.stiffness.cols.map(([h, t]) => <div key={h} className="stat"><b className="stat-word">{h}</b><span>{t}</span></div>)}
            </div>
          </div>
          <StiffnessSchematic labels={H.stiffness.bands} caption={H.stiffness.schematicCaption} schematicLabel={L.schematic} />
        </div>
      </Section>

      {/* 06 — L0–L7 */}
      <Section id="grip" band="band-2" eyebrow={H.carbon.eyebrow} title={H.carbon.gripTitle}>
        <p className="lead" style={{ marginBottom: 20 }}>{H.carbon.title} {H.carbon.gripP}</p>
        <GripScale caption={H.carbon.scaleCaption} schematicLabel={L.schematic} />
        <div className="btn-row"><Cta locale={locale} to="grip" label={H.carbon.cta} kind="btn-outline" /></div>
      </Section>

      {/* 07 — custom engineering */}
      <Section id="custom" eyebrow={H.custom.eyebrow} title={H.custom.title}>
        <p className="statement" style={{ marginBottom: 18 }}>{H.custom.sub}</p>
        <p className="lead" style={{ marginBottom: 26 }}>{H.custom.p}</p>
        <Chain items={H.custom.chain} />
        <div className="btn-row">
          <Cta locale={locale} to="custom" label={H.custom.cta} track="home_technical_brief" />
          <Cta locale={locale} to="contact" purpose="technical" label={H.custom.cta2} kind="btn-outline" />
        </div>
      </Section>

      {/* 08 — training systems */}
      <Section id="training" band="band-1" eyebrow={H.training.eyebrow} title={H.training.title}>
        <p className="lead" style={{ marginBottom: 26 }}>{H.training.p}</p>
        <div className="grid-3">
          <Link href={href(locale, "sst")} className="card card-link">
            <PhotoPending name="SST" sub={`${sst.headSizeSqIn} ${L.sqin} · ${sst.lengthIn}″ · ${sst.stringPattern}`} note={H.training.photoPending} className="mini" />
            <h3 style={{ marginTop: 14 }}>{dict.training.sst.h}</h3>
            <p>{sst.system.map((x) => `${x.weight}/${x.balance}`).join(" · ")} ({L.grams}/{L.mm})</p>
            <span className="arrow">{L.learn} →</span>
          </Link>
          <Link href={href(locale, "spot")} className="card card-link"><h3>{dict.training.spot.h}</h3><p>{dict.training.spot.p}</p><span className="arrow">{L.learn} →</span></Link>
          <Link href={href(locale, "methodology")} className="card card-link"><h3>{dict.training.method.h}</h3><p>{dict.training.method.p}</p><span className="arrow">{L.learn} →</span></Link>
        </div>
        <div className="btn-row"><Cta locale={locale} to="training" label={H.training.cta} /><Cta locale={locale} to="experience" label={H.training.cta2} kind="btn-outline" /></div>
      </Section>

      {/* 09 — manufacturing and QC */}
      <Section id="manufacturing" eyebrow={H.manufacturing.eyebrow} title={H.manufacturing.title}>
        <p className="lead" style={{ marginBottom: 26 }}>{H.manufacturing.p}</p>
        <div className="detail-grid">
          <Photo id="lettering" alt={M.lettering} caption={H.manufacturing.captions.lettering} sizes="(min-width: 760px) 24vw, 46vw" />
          <Photo id="buttcap" alt={M.buttcap} caption={H.manufacturing.captions.buttcap} sizes="(min-width: 760px) 24vw, 46vw" />
          <Photo id="powerHandle" alt={M.powerHandle} caption={H.manufacturing.captions.handle} sizes="(min-width: 760px) 24vw, 46vw" />
          <Photo id="finish" alt={M.finish} caption={H.manufacturing.captions.finish} sizes="(min-width: 760px) 24vw, 46vw" />
        </div>
        <div className="grid-2" style={{ marginTop: 26 }}>
          <div className="card"><span className="status confirmed">{S.confirmed}</span><h3 style={{ marginTop: 12 }}>{H.manufacturing.confirmedTitle}</h3><Kickers items={H.manufacturing.confirmed} /></div>
          <div className="card"><span className="status notprovided">{S.notprovided}</span><h3 style={{ marginTop: 12 }}>{H.manufacturing.pendingTitle}</h3><p>{H.manufacturing.pending}</p></div>
        </div>
        <div className="btn-row"><Cta locale={locale} to="engineering" label={H.manufacturing.cta} kind="btn-outline" /></div>
      </Section>

      {/* 10 — GPS, personalisation, development, extended ecosystem */}
      <Section id="world" band="band-2" eyebrow={H.world.eyebrow} title={H.world.title}>
        <div className="grid-4">
          {[["gps", "gps", "current"], ["personal", "build", "agreement"], ["development", "methodology", "agreement"], ["ecosystem", "ecosystem", "concept"]].map(([k, to, st]) => (
            <Link key={k} href={href(locale, to)} className="card card-link">
              <span className={`status ${st}`}>{S[st]}</span>
              <h3 style={{ marginTop: 12 }}>{H.world.items[k].h}</h3>
              <p>{H.world.items[k].p}</p>
              <span className="arrow">{L.learn} →</span>
            </Link>
          ))}
        </div>
        <p className="muted small" style={{ marginTop: 18, maxWidth: 820 }}>{H.world.note}</p>
      </Section>

      {/* 11 — partner routes and short enquiry */}
      <Section id="contact" eyebrow={H.partners.eyebrow} title={H.partners.title}>
        <p className="lead" style={{ marginBottom: 22 }}>{H.partners.p}</p>
        <div className="route-links">
          {["coaches", "clubs", "distribution", "strategic", "institutional"].map((k) => (
            <Link key={k} href={href(locale, k)}>{dict.partnerships.routes[k].title} →</Link>
          ))}
        </div>
        <div className="panel" style={{ marginTop: 28 }}>
          <h3 className="h-3">{H.partners.formTitle}</h3>
          <p className="muted" style={{ margin: "8px 0 18px" }}>{H.partners.formLead}</p>
          <LeadForm dict={formDict(dict)} locale={locale} purposes={HOME_PURPOSES} initialPurpose="general" optionalExtras={false} context={{ from: "home" }} />
        </div>
      </Section>
    </>
  );
}
