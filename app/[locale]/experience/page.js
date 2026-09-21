import { ctx, meta } from "../../../lib/page";
import { PageHero, Section, Kickers } from "../../../components/Ui";
import RequestForm from "../../../components/RequestForm";

export const generateMetadata = meta("experience", (d) => [d.experience.title, d.experience.lead]);

export default async function Page({ params }) {
  const { locale, dict } = await ctx(params);
  const E = dict.experience;
  return (
    <>
      <PageHero eyebrow={dict.nav.experience} title={E.title} statement={E.statement} lead={E.lead} />
      <Section first title={E.optionsTitle}><Kickers items={E.options} /></Section>
      <Section band="band-carbon" title={E.formTitle}><RequestForm dict={dict} fixedPurpose="fitting" prefillKey="mx.gps.handoff" /></Section>
    </>
  );
}
