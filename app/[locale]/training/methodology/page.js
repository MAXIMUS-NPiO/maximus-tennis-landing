import { ctx, meta } from "../../../../lib/page";
import { PageHero, Section, Cta, Steps } from "../../../../components/Ui";

export const generateMetadata = meta("methodology", (d) => [d.methodology.title, d.methodology.lead]);

export default async function Page({ params }) {
  const { locale, dict } = await ctx(params);
  const M = dict.methodology;
  return (
    <>
      <PageHero eyebrow={dict.nav.groups.training} title={M.title} lead={M.lead} />
      <Section first title={M.stepsTitle}><Steps items={M.steps} /></Section>
      <Section band="band-paper" title={M.educationTitle}>
        <div className="grid-3">{Object.values(M.education).map((t) => <div key={t} className="card"><p>{t}</p></div>)}</div>
        <h3 className="h-3" style={{ marginTop: 36, marginBottom: 10 }}>{M.evidenceTitle}</h3><p className="lead">{M.evidenceP}</p>
      </Section>
      <Section band="band-carbon" title={M.experienceTitle} lead={M.experienceP}>
        <div className="btn-row" style={{ marginTop: 0 }}><Cta locale={locale} to="experience" label={M.cta} /><Cta locale={locale} to="contact" label={M.cta2} kind="btn-outline" purpose="coach" /></div>
      </Section>
    </>
  );
}
