/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import { ctx } from "../../../lib/page";
import { pageMeta } from "../../../lib/metadata";
import { routes } from "../../../data/site";
import { PageHero, Section, Cta, Note } from "../../../components/Ui";
import { ProShopDiagram } from "../../../components/Editorial";

/**
 * MAXIMUS Pro Shop — an architectural concept for a tennis concept club (Founder's update of
 * 14 October 2026, section 9). Shown as a concept diagram; concept visualisations are published
 * only after the Founder approves them. No engineered system, capacity or certification is claimed.
 */
export async function generateMetadata({ params }) {
  const { locale, dict } = await ctx(params);
  const S = dict.editorial.proShop;
  return pageMeta(locale, routes.proShop, `${S.nav} · ${S.eyebrow}`, S.meta);
}

export default async function Page({ params }) {
  const { locale, dict } = await ctx(params);
  const S = dict.editorial.proShop;
  return (
    <>
      <PageHero eyebrow={`${S.nav} · ${S.eyebrow}`} title={S.title} lead={S.lead}>
        <div className="badges"><span className="status concept">{dict.common.statuses.concept}</span></div>
      </PageHero>
      <Section first>
        <div className="split proshop-split">
          <ProShopDiagram labels={S.labels} caption={S.diagramCaption} />
          <div>
            <h2 className="h-3" style={{ marginBottom: 12 }}>{S.sequenceTitle}</h2>
            <ol className="steps seq">{S.sequence.map((t) => <li key={t}><div><strong>{t}</strong></div></li>)}</ol>
          </div>
        </div>
      </Section>
      <Section band="band-1" title={S.designTitle}>
        <p className="lead" style={{ maxWidth: 860 }}>{S.designText}</p>
      </Section>
      <Section title={S.conceptTitle}>
        <Note>{S.conceptText}</Note>
        <p className="muted small" style={{ marginTop: 18 }}>{dict.nationalPackage.proShop}</p>
        <div className="btn-row">
          <Cta locale={locale} to="contact" purpose="club" label={S.cta} track="proshop_club" />
          <Cta locale={locale} to="clubs" label={dict.nav.clubs} kind="btn-outline" />
        </div>
      </Section>
    </>
  );
}
