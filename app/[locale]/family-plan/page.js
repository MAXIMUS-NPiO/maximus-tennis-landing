import { ctx, meta } from "../../../lib/page";
import { site } from "../../../data/site";
import { Cta } from "../../../components/Ui";
import FamilyPlan from "../../../components/FamilyPlan";

export const generateMetadata = meta("familyPlan", (d) => [d.familyPlan.title, d.familyPlan.metaDescription]);

/**
 * Family Plan (Founder's brief of 7 October 2026). The calculator turns the family's own inputs
 * into sessions, hours, ball contacts and cost; it promises no saving, medical effect or result.
 * The two services beyond the court are described, never priced: there is nothing to price them on.
 */
export default async function Page({ params }) {
  const { locale, dict } = await ctx(params);
  const F = dict.familyPlan;
  const numLocale = site.localeMeta[locale].hrefLang;
  return (
    <>
      <section className="page-hero fp-hero">
        <div className="shell">
          <p className="eyebrow">{F.eyebrow}</p>
          <h1 className="h-1">{F.heroTitle}</h1>
          <p className="lead">{F.heroLead}</p>
          <div className="btn-row"><a className="btn" href="#calculator">{F.heroCta} <span aria-hidden="true">↓</span></a></div>
        </div>
      </section>

      <section className="section band-ink fp-strategy">
        <div className="shell">
          <p className="eyebrow">{F.strategy.eyebrow}</p>
          <h2 className="h-2">{F.strategy.title}</h2>
          <div className="fp-strategy-body">
            <p className="lead">{F.strategy.p1}</p>
            <p>{F.strategy.p2}</p>
            <p>{F.strategy.p3}</p>
            <p>{F.strategy.p4}</p>
          </div>
          <p className="fp-strategy-note">{F.strategy.note}</p>
          <div className="btn-row">
            <a className="btn" href="#calculator">{F.strategy.ctaCalc} <span aria-hidden="true">↓</span></a>
            <Cta locale={locale} to="contact" purpose="strategic" label={F.strategy.ctaPartner} kind="btn-outline" track="familyplan_partner" />
          </div>
        </div>
      </section>

      <section id="calculator" className="section fp-calc">
        <div className="shell">
          <FamilyPlan t={F} numLocale={numLocale} />
        </div>
      </section>

      <section className="section band-1 fp-beyond">
        <div className="shell">
          <p className="eyebrow">{F.beyond.eyebrow}</p>
          <h2 className="h-2">{F.beyond.title}</h2>
          <div className="grid-2 fp-beyond-grid">
            <article className="card">
              <h3>{F.beyond.admission.h}</h3>
              <p>{F.beyond.admission.p}</p>
            </article>
            <article className="card">
              <h3>{F.beyond.assets.h}</h3>
              <p>{F.beyond.assets.p}</p>
            </article>
          </div>
          <p className="fp-note">{F.beyond.note}</p>
          <div className="btn-row"><Cta locale={locale} to="contact" purpose="family" label={F.beyond.cta} track="familyplan_beyond" /></div>
        </div>
      </section>
    </>
  );
}
