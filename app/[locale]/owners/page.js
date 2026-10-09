import { ctx, meta } from "../../../lib/page";
import { PageHero, Section, Cta, Kickers } from "../../../components/Ui";

export const generateMetadata = meta("owners", (d) => [d.owners.title, d.owners.lead]);

export default async function Page({ params }) {
  const { locale, dict } = await ctx(params);
  const O = dict.owners;
  return (
    <>
      <PageHero eyebrow={dict.nav.owners} title={O.title} lead={O.lead} />
      <Section first>
        <div className="grid-2">
          <div className="card"><h3>{O.nowTitle}</h3><Kickers items={O.now} /></div>
          <div className="card"><h3>{O.archTitle}</h3><Kickers items={O.arch} /></div>
        </div>
      </Section>
      <Section band="band-2" title={O.separationTitle}><Kickers items={O.separation} /></Section>
      <Section band="band-1" title={O.techTitle}><p className="lead">{O.techP}</p><div className="btn-row"><Cta locale={locale} to="contact" label={O.cta} purpose="owner" /></div></Section>
    </>
  );
}
