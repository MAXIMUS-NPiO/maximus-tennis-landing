import { ctx, meta } from "../../../lib/page";
import { PageHero, Section, Cta, Steps, Note } from "../../../components/Ui";

export const generateMetadata = meta("engineering", (d) => [d.engineering.title, d.engineering.lead]);

export default async function Page({ params }) {
  const { locale, dict } = await ctx(params);
  const E = dict.engineering;
  return (
    <>
      <PageHero eyebrow={dict.nav.engineering} title={E.title} statement={E.statement} lead={E.lead} />
      <Section first band="band-paper">
        <div className="grid-2">{E.manifesto.map((m) => <p key={m} className="statement" style={{ textTransform: "none", fontSize: "clamp(22px,3vw,34px)" }}>{m}</p>)}</div>
      </Section>
      <Section title={E.capabilityTitle} lead={E.capabilityLead}>
        <Steps items={E.sequence} />
        <Note>{E.capacityNote}</Note>
        <Note red>{E.truth}</Note>
        <div className="btn-row"><Cta locale={locale} to="distribution" label={E.cta} /><Cta locale={locale} to="custom" label={E.cta2} kind="btn-outline" /></div>
      </Section>
    </>
  );
}
