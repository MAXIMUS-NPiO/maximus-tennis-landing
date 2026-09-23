import { ctx, meta } from "../../../lib/page";
import { PageHero, Section, Cta, Kickers } from "../../../components/Ui";

export const generateMetadata = meta("owners", (d) => [d.owners.title, d.owners.lead]);

export default async function Page({ params }) {
  const { locale, dict } = await ctx(params);
  const O = dict.owners, S = dict.common.statuses;
  return (
    <>
      <PageHero eyebrow={dict.nav.owners} title={O.title} lead={O.lead} />
      <Section first>
        <div className="grid-2">
          <div className="card"><span className="status current">{S.current}</span><h3 style={{ marginTop: 12 }}>{O.nowTitle}</h3><Kickers items={O.now} /></div>
          <div className="card"><span className="status concept">{S.concept}</span><h3 style={{ marginTop: 12 }}>{O.archTitle}</h3><Kickers items={O.arch} /></div>
        </div>
      </Section>
      <Section band="band-2" title={O.separationTitle}><Kickers items={O.separation} /></Section>
      <Section band="band-1" title={O.techTitle}><p className="lead">{O.techP}</p><span className="status concept">{S.concept}</span><div className="btn-row"><Cta locale={locale} to="contact" label={O.cta} purpose="owner" /></div></Section>
    </>
  );
}
