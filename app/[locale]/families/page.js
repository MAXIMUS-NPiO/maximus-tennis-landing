import { ctx, meta, formDict } from "../../../lib/page";
import { PageHero, Section, Kickers, Steps, Brief, Note } from "../../../components/Ui";
import LeadForm from "../../../components/LeadForm";

export const generateMetadata = meta("families", (d) => [d.families.title, d.families.lead]);

export default async function Page({ params }) {
  const { locale, dict } = await ctx(params);
  const F = dict.families;
  const S = dict.common.statuses;
  return (
    <>
      <PageHero eyebrow={dict.nav.families} title={F.title} lead={F.lead}>
        <Brief labels={dict.common.brief} brief={F.brief} />
      </PageHero>
      <Section first title={F.journeyTitle}>
        <Steps items={F.journey} />
      </Section>
      <Section id="enquiry" band="band-1" title={F.formTitle}>
        <div className="split">
          <div className="panel">
            <LeadForm dict={formDict(dict)} locale={locale} purpose="family" prefill={{ role: "parent" }} context={{ from: "family" }} />
          </div>
          <div className="stack">
            <Note red>{F.formNote}</Note>
            <Note>{F.noPromise}</Note>
          </div>
        </div>
      </Section>
      <Section>
        <div className="grid-2">
          <div className="card"><span className="status current">{S.current}</span><h3 style={{ marginTop: 12 }}>{F.nowTitle}</h3><Kickers items={F.now} /></div>
          <div className="card"><span className="status concept">{S.concept}</span><h3 style={{ marginTop: 12 }}>{F.plannedTitle}</h3><Kickers items={F.planned} /></div>
        </div>
      </Section>
      <Section band="band-2" title={F.categoriesTitle} lead={F.categoriesP}><div className="chain">{F.categories.map((c) => <span key={c}>{c}</span>)}</div></Section>
      <Section band="band-1" title={F.statusTitle}><p className="lead">{F.statusP}</p></Section>
    </>
  );
}
