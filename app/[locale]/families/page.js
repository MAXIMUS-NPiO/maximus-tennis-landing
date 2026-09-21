import { ctx, meta } from "../../../lib/page";
import { PageHero, Section, Cta, Kickers, Note } from "../../../components/Ui";

export const generateMetadata = meta("families", (d) => [d.families.title, d.families.lead]);

export default async function Page({ params }) {
  const { locale, dict } = await ctx(params);
  const F = dict.families, S = dict.common.statuses;
  return (
    <>
      <PageHero eyebrow={dict.nav.families} title={F.title} lead={F.lead} />
      <Section first>
        <div className="grid-2">
          <div className="card"><span className="status available">{S.available}</span><h3 style={{ marginTop: 12 }}>{F.nowTitle}</h3><Kickers items={F.now} /></div>
          <div className="card"><span className="status planned">{S.planned}</span><h3 style={{ marginTop: 12 }}>{F.plannedTitle}</h3><Kickers items={F.planned} /></div>
        </div>
      </Section>
      <Section band="band-2" title={F.categoriesTitle} lead={F.categoriesP}><div className="chain">{F.categories.map((c) => <span key={c}>{c}</span>)}</div></Section>
      <Section band="band-1" title={F.statusTitle}><p className="lead">{F.statusP}</p><div className="btn-row"><Cta locale={locale} to="contact" label={F.cta} purpose="family" /></div></Section>
    </>
  );
}
