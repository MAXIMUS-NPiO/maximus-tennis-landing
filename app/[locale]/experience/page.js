import { ctx, meta, formDict } from "../../../lib/page";
import { PageHero, Section, Kickers } from "../../../components/Ui";
import LeadForm from "../../../components/LeadForm";

export const generateMetadata = meta("experience", (d) => [d.experience.title, d.experience.lead]);

export default async function Page({ params }) {
  const { locale, dict } = await ctx(params);
  const E = dict.experience;
  return (
    <>
      <PageHero eyebrow={dict.nav.experience} title={E.title} statement={E.statement} lead={E.lead} />
      <Section first title={E.optionsTitle}><Kickers items={E.options} /></Section>
      <Section band="band-1" title={E.formTitle}><div className="panel form-panel"><LeadForm dict={formDict(dict)} locale={locale} purpose="fitting" context={{ from: "training" }} /></div></Section>
    </>
  );
}
