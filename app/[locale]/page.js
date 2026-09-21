import Link from "next/link";
import { getDict } from "../../lib/i18n";
import { pageMeta } from "../../lib/metadata";
import { href } from "../../lib/paths";
import { routes } from "../../data/site";
import { seriesList, precisionClasses, grips, sweetSpotTrainer } from "../../data/products";
import { Section, Chain, Cta, Note, Steps } from "../../components/Ui";
import { SeriesCards, PrecisionTable, GripRow } from "../../components/Product";
import { EcosystemMap, EcosystemStrip } from "../../components/Ecosystem";
import PrecisionSwitch from "../../components/PrecisionSwitch";
import SeriesIndex from "../../components/SeriesIndex";

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const d = getDict(locale);
  return pageMeta(locale, routes.home, d.meta.defaultTitle.replace(d.meta.titleSuffix, ""), d.meta.defaultDescription);
}

export default async function Home({ params }) {
  const { locale } = await params;
  const dict = getDict(locale);
  const H = dict.home, L = dict.common.labels, R = dict.routes;
  const sst = sweetSpotTrainer;

  return (
    <>
      {/* 01 — identity, authentic product, racquet-as-key */}
      <section id="top" className="hero">
        <div className="shell reveal">
          <p className="eyebrow accent">{H.heroEyebrow}</p>
          <h1 className="h-display">{H.heroTitle}</h1>
          <p className="statement" style={{ marginTop: 22, color: "var(--ink-2)" }}>{H.heroLine}</p>
          <p className="lead">{H.heroLead}</p>
          <div className="btn-row">
            <Cta locale={locale} to="gps" label={H.heroCta1} />
            <Cta locale={locale} to="build" label={H.heroCta2} kind="btn-outline" />
          </div>
          <div className="hero-meta">
            {H.heroMeta.map(([b, s]) => <div key={b}><b>{b}</b>{s}</div>)}
          </div>
          <div className="hero-index">
            <p className="eyebrow accent" style={{ marginBottom: 10 }}>{H.index.title}</p>
            <SeriesIndex locale={locale} dict={dict} />
            <p className="muted" style={{ fontSize: 15, marginTop: 12 }}>{H.index.note}</p>
          </div>
          <p className="muted" style={{ fontSize: 14, marginTop: 28, maxWidth: 780 }}>{H.keyNote}</p>
        </div>
      </section>

      <EcosystemStrip locale={locale} dict={dict} />

      {/* 02 — GPS */}
      <Section id="gps" eyebrow={H.gps.eyebrow} title={H.gps.title}>
        <div className="grid-2">
          <div className="card"><p className="eyebrow accent">{H.gps.a.h}</p><p>{H.gps.a.p}</p></div>
          <div className="card"><p className="eyebrow accent">{H.gps.b.h}</p><p>{H.gps.b.p}</p></div>
        </div>
        <div className="btn-row"><Cta locale={locale} to="gps" label={H.gps.cta} /></div>
        <p className="muted" style={{ fontSize: 14, marginTop: 16 }}>{H.gps.note}</p>
      </Section>

      {/* 03 — series */}
      <Section id="series" band="band-1" eyebrow={H.series.eyebrow} title={H.series.title} lead={H.series.lead}>
        <SeriesCards locale={locale} dict={dict} />
        <div className="btn-row"><Cta locale={locale} to="racquets" label={H.series.cta} kind="btn-outline" /></div>
      </Section>

      {/* 04 — precision system */}
      <Section id="methodology" eyebrow={H.precision.eyebrow} title={H.precision.title}>
        <p className="statement" style={{ marginBottom: 18 }}><span className="accent">{H.precision.sub}</span></p>
        <p className="lead" style={{ marginBottom: 26 }}>{H.precision.lead}</p>
        <PrecisionSwitch dict={dict} />
        <details className="expander">
          <summary>{dict.precision.switch.fullTable}</summary>
          <div><PrecisionTable dict={dict} /><p className="note" style={{ marginTop: 14 }}>{dict.precision.targetsNote}</p></div>
        </details>
        <div className="btn-row"><Cta locale={locale} to="precision" label={H.precision.cta} kind="btn-outline" /></div>
      </Section>

      {/* 05 — stiffness */}
      <Section id="stiffness" band="band-2" eyebrow={H.stiffness.eyebrow} title={H.stiffness.title}>
        <p className="lead" style={{ marginBottom: 30 }}>{H.stiffness.p}</p>
        <div className="grid-3" style={{ marginBottom: 30 }}>
          {H.stiffness.cols.map(([h, t]) => <div key={h} className="stat"><b style={{ fontSize: "clamp(26px,3vw,38px)" }}>{h}</b><span style={{ fontSize: 16.5 }}>{t}</span></div>)}
        </div>
        <div className="stack"><Chain items={dict.precision.fields} /><p className="muted" style={{ fontSize: 15 }}>{dict.precision.fieldsNote}</p></div>
        <div className="btn-row"><Cta locale={locale} to="precision" label={dict.nav.precision} kind="btn-outline" /></div>
      </Section>

      {/* 06 — carbon + L0–L7 */}
      <Section id="carbon" eyebrow={H.carbon.eyebrow} title={H.carbon.title}>
        <p className="lead" style={{ marginBottom: 32 }}>{H.carbon.p}</p>
        <h3 className="h-3" style={{ marginBottom: 14 }}>{H.carbon.gripTitle}</h3>
        <GripRow dict={dict} />
        <p className="muted" style={{ marginTop: 16, maxWidth: 760 }}>{H.carbon.gripP}</p>
        <div className="btn-row"><Cta locale={locale} to="grip" label={H.carbon.cta} kind="btn-outline" /></div>
      </Section>

      {/* 07 — configuration and custom engineering */}
      <Section band="band-1" eyebrow={H.custom.eyebrow} title={H.custom.title}>
        <p className="statement" style={{ marginBottom: 18 }}>{H.custom.sub}</p>
        <p className="lead" style={{ marginBottom: 26 }}>{H.custom.p}</p>
        <div className="grid-3" style={{ marginBottom: 26 }}>
          {seriesList.map((s) => (
            <div key={s.id} className="stat"><b>{s.matrix.length}</b><span>{s.short} · {L.points} · {s.matrix[0].weight}–{s.matrix[s.matrix.length - 1].weight} {L.grams}</span></div>
          ))}
        </div>
        <Chain items={H.custom.chain} />
        <div className="btn-row"><Cta locale={locale} to="custom" label={H.custom.cta} /><Cta locale={locale} to="build" label={H.heroCta2} kind="btn-outline" /></div>
      </Section>

      {/* 08 — personalisation */}
      <Section eyebrow={H.personal.eyebrow} title={H.personal.title}>
        <div className="split">
          <p className="lead">{H.personal.p}</p>
          <div className="card">
            <p className="eyebrow">{dict.build.q.engravingType}</p>
            <ul className="kicker-list">{Object.values(dict.build.q.types).slice(1).map((t) => <li key={t}><span>{t}</span></li>)}</ul>
            <div className="btn-row"><Cta locale={locale} to="build" label={H.personal.cta} /></div>
          </div>
        </div>
      </Section>

      {/* 09 — training */}
      <Section band="band-2" eyebrow={H.training.eyebrow} title={H.training.title}>
        <p className="lead" style={{ marginBottom: 26 }}>{H.training.p}</p>
        <div className="grid-3">
          <Link href={href(locale, "sst")} className="card card-link"><h3>{dict.training.sst.h}</h3><p>{sst.headSizeSqIn} {L.sqin} · {sst.system.map((x) => x.weight).join(" / ")} {L.grams} · L0–L7</p><span className="arrow">{L.learn} →</span></Link>
          <Link href={href(locale, "spot")} className="card card-link"><h3>{dict.training.spot.h}</h3><p>{dict.training.spot.p}</p><span className="arrow">{L.learn} →</span></Link>
          <Link href={href(locale, "methodology")} className="card card-link"><h3>{dict.training.method.h}</h3><p>{dict.training.method.p}</p><span className="arrow">{L.learn} →</span></Link>
        </div>
        <div className="btn-row"><Cta locale={locale} to="training" label={H.training.cta} /><Cta locale={locale} to="experience" label={H.training.cta2} kind="btn-outline" /></div>
      </Section>

      {/* 10 — personal brands */}
      <Section eyebrow={H.brands.eyebrow} title={H.brands.title}>
        <div className="split">
          <p className="lead">{H.brands.p}</p>
          <Steps items={dict.brands.progression.slice(0, 4)} />
        </div>
        <div className="btn-row"><Cta locale={locale} to="brands" label={H.brands.cta} kind="btn-outline" /></div>
      </Section>

      {/* 11 — families and owners */}
      <Section band="band-1" eyebrow={H.families.eyebrow} title={H.families.title}>
        <p className="lead" style={{ marginBottom: 26 }}>{H.families.p}</p>
        <div className="grid-2">
          <div className="card"><span className="status request">{dict.common.statuses.request}</span><h3 style={{ marginTop: 12 }}>{dict.families.title}</h3><ul className="kicker-list">{dict.families.now.slice(0, 3).map((t) => <li key={t}><span>{t}</span></li>)}</ul><div className="btn-row"><Cta locale={locale} to="families" label={H.families.cta1} kind="btn-outline" /></div></div>
          <div className="card"><span className="status planned">{dict.common.statuses.planned}</span><h3 style={{ marginTop: 12 }}>{dict.owners.title}</h3><ul className="kicker-list">{dict.owners.arch.slice(0, 3).map((t) => <li key={t}><span>{t}</span></li>)}</ul><div className="btn-row"><Cta locale={locale} to="owners" label={H.families.cta2} kind="btn-outline" /></div></div>
        </div>
      </Section>

      {/* 12 — network and role routes */}
      <Section id="partnership" eyebrow={H.network.eyebrow} title={H.network.title}>
        <p className="lead" style={{ marginBottom: 26 }}>{H.network.p}</p>
        <div className="btn-row" style={{ marginTop: 0, marginBottom: 40 }}><Cta locale={locale} to="network" label={H.network.cta} /></div>
        <h3 className="h-3" style={{ marginBottom: 6 }}>{H.network.routesTitle}</h3>
        <p className="muted" style={{ marginBottom: 18 }}>{R.lead}</p>
        <div className="grid-4">
          {Object.entries(R.items).map(([k, r]) => (
            <Link key={k} href={r.href ? href(locale, r.href) : `${href(locale, "contact")}?purpose=${r.purpose}`} className="card card-link"><h3>{r.h}</h3><p>{r.p}</p><span className="arrow">{r.a} →</span></Link>
          ))}
        </div>
      </Section>

      {/* 13 — engineering and production */}
      <Section band="band-2" eyebrow={H.engineering.eyebrow} title={H.engineering.title}>
        <div className="split">
          <p className="lead">{H.engineering.p}</p>
          <Steps items={dict.engineering.sequence} />
        </div>
        <div className="btn-row"><Cta locale={locale} to="engineering" label={H.engineering.cta} kind="btn-outline" /></div>
      </Section>

      {/* 14 — distribution, strategic, institutional */}
      <Section id="distribution" eyebrow={H.partners.eyebrow} title={H.partners.title}>
        <p className="lead" style={{ marginBottom: 26 }}>{H.partners.p}</p>
        <div className="grid-3">
          {["distribution", "strategic", "institutional"].map((k) => (
            <Link key={k} href={href(locale, k)} className="card card-link"><h3>{dict.partnerships.routes[k].title}</h3><p>{dict.partnerships.routes[k].lead}</p><span className="arrow">{dict.partnerships.routes[k].cta} →</span></Link>
          ))}
        </div>
        <div className="btn-row"><Cta locale={locale} to="partnerships" label={H.partners.cta} kind="btn-outline" /></div>
      </Section>

      {/* 15 — ecosystem map and final entry */}
      <Section id="ecosystem" band="band-1" eyebrow={H.map.eyebrow} title={H.map.title}>
        <EcosystemMap locale={locale} dict={dict} compact />
        <div className="btn-row"><Cta locale={locale} to="ecosystem" label={H.map.cta} kind="btn-outline" /></div>
      </Section>

      <section id="contact" className="section band-2">
        <div className="shell">
          <h2 className="h-display" style={{ maxWidth: "12ch" }}>{H.final.title}</h2>
          <p className="lead" style={{ marginTop: 22 }}>{H.final.p}</p>
          <div className="btn-row"><Cta locale={locale} to="gps" label={H.final.cta1} /><Cta locale={locale} to="contact" label={H.final.cta2} kind="btn-outline" /></div>
        </div>
      </section>
    </>
  );
}
