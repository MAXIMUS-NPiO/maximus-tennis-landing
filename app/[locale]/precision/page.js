import { ctx, meta } from "../../../lib/page";
import { extendedParameters } from "../../../data/products";
import { PageHero, Section, Cta, Note, Chain } from "../../../components/Ui";
import { PrecisionTable } from "../../../components/Product";

export const generateMetadata = meta("precision", (d) => [d.precision.title, d.precision.lead]);

export default async function Page({ params }) {
  const { locale, dict } = await ctx(params);
  const P = dict.precision;
  return (
    <>
      <PageHero eyebrow={dict.home.precision.eyebrow} title={P.title} statement={P.statement} lead={P.lead} />
      <Section first>
        <PrecisionTable dict={dict} />
        <p className="muted" style={{ marginTop: 14, fontSize: 14 }}>{P.stiffExample}</p>
        <Note>{P.targetsNote}</Note>
        <Note red>{P.noZero}</Note>
      </Section>
      <Section band="band-paper" title={P.stiffnessTitle}>
        <div className="split">
          <div className="stack"><p className="lead">{P.stiffnessP1}</p><p>{P.stiffnessP2}</p></div>
          <div className="stack"><Chain items={P.fields} /><p className="muted" style={{ fontSize: 14 }}>{P.fieldsNote}</p></div>
        </div>
      </Section>
      <Section title={P.matchedTitle}><p className="lead">{P.matchedP}</p></Section>
      <Section band="band-carbon" title={P.extendedTitle} lead={P.extendedP}>
        <div className="grid-4">{extendedParameters.map((k) => <div key={k} className="card"><h3>{P.extended[k]}</h3><span className="status notprovided">{dict.common.statuses.notprovided}</span></div>)}</div>
        <div className="btn-row"><Cta locale={locale} to="build" label={P.cta} /><Cta locale={locale} to="custom" label={dict.custom.cta} kind="btn-outline" /></div>
      </Section>
    </>
  );
}
