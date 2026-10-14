/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import { ctx, formDict } from "../../../lib/page";
import { pageMeta } from "../../../lib/metadata";
import { routes } from "../../../data/site";
import { PageHero, Section, Note } from "../../../components/Ui";
import LeadForm from "../../../components/LeadForm";

/**
 * Meetings — Dubai first, other cities by expressed interest (Founder's update of 14 October 2026,
 * section 11). A working interest form through the existing request intake: the request is stored
 * before any notification and receives a number. The private participant account (branch
 * forum/meeting-interest-preview-20261013) is connected later; no status is shown that a real
 * record does not carry. No date, venue, partner, travel offer or bonus use is represented.
 */
export async function generateMetadata({ params }) {
  const { locale, dict } = await ctx(params);
  return pageMeta(locale, routes.meetings, dict.meetings.title, `${dict.meetings.lead} ${dict.meetings.proposal}`);
}

export default async function Page({ params }) {
  const { locale, dict } = await ctx(params);
  const M = dict.meetings, E = dict.editorial.meetings;
  return (
    <>
      <PageHero eyebrow={`${dict.nav.groups.partnerships} · ${E.nav}`} title={M.title} lead={M.lead} />
      <Section first>
        <Note>{M.proposal}</Note>
        <p className="muted" style={{ marginTop: 14 }}>{E.noAccount}</p>
      </Section>
      <Section id="register" band="band-2" title={M.apply}>
        <div className="panel form-panel">
          <LeadForm dict={formDict(dict)} locale={locale} purpose="meeting" context={{ from: "partner" }} />
        </div>
      </Section>
      <Section title={E.stagesTitle}>
        <ol className="stages">{E.stages.map((t, i) => <li key={t}><b>{i + 1}</b><span>{t}</span></li>)}</ol>
        <p className="muted small" style={{ marginTop: 16 }}>{E.stagesNote}</p>
      </Section>
      <Section band="band-1" title={M.futureTitle}>
        <p>{M.future}</p>
      </Section>
    </>
  );
}
