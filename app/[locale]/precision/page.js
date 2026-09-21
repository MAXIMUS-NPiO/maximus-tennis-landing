import { ctx, meta } from "../../../lib/page";
import { extendedParameters } from "../../../data/products";
import { PageHero, Section, Cta, Note, Chain } from "../../../components/Ui";
import { PrecisionTable } from "../../../components/Product";
import PrecisionSwitch from "../../../components/PrecisionSwitch";

export const generateMetadata = meta("precision", (d) => [d.precision.title, d.precision.lead]);

export default async function Page({ params }) {
  const { locale, dict } = await ctx(params);
  const P = dict.precision;
  return (
    <>
      <PageHero eyebrow={dict.home.precision.eyebrow} title={P.title} statement={P.statement} lead={P.lead} />
      <Section first>
        <PrecisionSwitch dict={dict} />
        <h2 className="h-3" style={{ margin: "40px 0 14px" }}>{P.switch.fullTable}</h2>
        <PrecisionTable dict={dict} />
        <p className="muted" style={{ marginTop: 14, fontSize: 14 }}>{P.stiffExample}</p>
        <Note>{P.targetsNote}</Note>
        <Note red>{P.noZero}</Note>
      </Section>
      <Section id="stiffness" band="band-2" title={P.stiffnessTitle}>
        <p className="lead" style={{ marginBottom: 30 }}>{P.stiffnessP1}</p>
        <div className="grid-3" style={{ marginBottom: 30 }}>
          {dict.home.stiffness.cols.map(([h, t]) => <div key={h} className="stat"><b style={{ fontSize: "clamp(26px,3vw,38px)" }}>{h}</b><span style={{ fontSize: 16.5 }}>{t}</span></div>)}
        </div>
        <div className="split">
          <p>{P.stiffnessP2}</p>
          <div className="stack"><Chain items={P.fields} /><p className="muted" style={{ fontSize: 15 }}>{P.fieldsNote}</p></div>
        </div>
      </Section>
      <Section title={P.matchedTitle}><p className="lead">{P.matchedP}</p></Section>
      <Section band="band-1" title={P.extendedTitle} lead={P.extendedP}>
        <div className="grid-4">{extendedParameters.map((k) => <div key={k} className="card"><h3>{P.extended[k]}</h3><span className="status notprovided">{dict.common.statuses.notprovided}</span></div>)}</div>
        <div className="btn-row"><Cta locale={locale} to="build" label={P.cta} /><Cta locale={locale} to="custom" label={dict.custom.cta} kind="btn-outline" /></div>
      </Section>
    </>
  );
}
