import { ctx, meta } from "../../../lib/page";
import { PageHero, Section, Cta, Steps, Kickers } from "../../../components/Ui";

export const generateMetadata = meta("brands", (d) => [d.brands.title, d.brands.lead]);

export default async function Page({ params }) {
  const { locale, dict } = await ctx(params);
  const B = dict.brands;
  return (
    <>
      <PageHero eyebrow={dict.home.brands.eyebrow} title={B.title} statement={B.statement} lead={B.lead} />
      <Section first title={B.progressionTitle}><Steps items={B.progression} /></Section>
      <Section band="band-2" title={B.royaltiesTitle}><Kickers items={B.royalties} /><div className="btn-row"><Cta locale={locale} to="contact" label={B.cta} purpose="brand" /><Cta locale={locale} to="contact" label={B.cta2} kind="btn-outline" purpose="coach" /></div></Section>
    </>
  );
}
