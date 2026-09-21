import { ctx, meta } from "../../../lib/page";
import { PageHero, Section, Chain, Steps, Note } from "../../../components/Ui";
import RequestForm from "../../../components/RequestForm";

export const generateMetadata = meta("custom", (d) => [d.custom.title, d.custom.lead]);

export default async function Page({ params }) {
  const { locale, dict } = await ctx(params);
  const C = dict.custom;
  return (
    <>
      <PageHero eyebrow={dict.home.custom.eyebrow} title={C.title} statement={`${C.statement} ${C.sub}`} lead={C.lead} />
      <Section first title={C.scopeTitle}>
        <div className="chain">{C.scope.map((s) => <span key={s}>{s}</span>)}</div>
      </Section>
      <Section title={C.processTitle}><Chain items={C.process.map((p) => p[0])} big /><div style={{ height: 24 }} /><Steps items={C.process} /><Note>{C.protected}</Note></Section>
      <Section id="brief" band="band-1" title={C.formTitle} lead={C.formLead}>
        <RequestForm dict={dict} fixedPurpose="technical" />
      </Section>
    </>
  );
}
