import { ctx, meta } from "../../../lib/page";
import { PageHero, Section, Kickers, Chain } from "../../../components/Ui";
import { EcosystemMap } from "../../../components/Ecosystem";

export const generateMetadata = meta("ecosystem", (d) => [d.ecosystem.title, d.ecosystem.lead]);

export default async function Page({ params }) {
  const { locale, dict } = await ctx(params);
  const E = dict.ecosystem;
  return (
    <>
      <PageHero eyebrow={dict.nav.groups.ecosystem} title={E.title} lead={E.lead}><div style={{ marginTop: 22 }}><Chain items={E.words} /></div></PageHero>
      <Section first><EcosystemMap locale={locale} dict={dict} /></Section>
      <Section band="band-2" title={E.boundaryTitle}><Kickers items={E.boundary} /></Section>
      <Section band="band-1" title={E.techTitle}><p className="lead">{E.techP}</p></Section>
    </>
  );
}
