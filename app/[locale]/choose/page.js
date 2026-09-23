import { ctx, meta, formDict } from "../../../lib/page";
import { PageHero, Section, Steps, Cta, Note } from "../../../components/Ui";
import LeadForm from "../../../components/LeadForm";

export const generateMetadata = meta("choose", (d) => [d.choose.title, d.choose.lead]);

export default async function Page({ params }) {
  const { locale, dict } = await ctx(params);
  const C = dict.choose;
  return (
    <>
      <PageHero eyebrow={C.eyebrow} title={C.title} lead={C.lead} />
      <Section first>
        <div className="split choose-split">
          <div className="panel">
            <h2 className="h-3" style={{ marginBottom: 16 }}>{C.formTitle}</h2>
            <LeadForm dict={formDict(dict)} locale={locale} purpose="selection" submitLabel={C.submit} context={{ from: "choose" }} />
          </div>
          <div className="stack-lg">
            <div>
              <h2 className="h-3" style={{ marginBottom: 12 }}>{C.stepsTitle}</h2>
              <Steps items={C.steps} />
              <Note>{C.note}</Note>
            </div>
            <div>
              <h2 className="h-3" style={{ marginBottom: 12 }}>{C.altTitle}</h2>
              <div className="btn-row" style={{ marginTop: 0 }}>
                <Cta locale={locale} to="gps" label={C.altGps} kind="btn-outline" track="choose_gps" />
                <Cta locale={locale} to="build" query="from=choose" label={C.altBuild} kind="btn-outline" track="choose_build" />
              </div>
            </div>
          </div>
        </div>
      </Section>
    </>
  );
}
