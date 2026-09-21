import { ctx, meta } from "../../../lib/page";
import { site } from "../../../data/site";
import { processingSummary } from "../../../lib/intake/config";
import { PageHero, Section } from "../../../components/Ui";

export const generateMetadata = meta("privacy", (d) => [d.privacy.title, d.privacy.sections.collect[1]]);

/**
 * The notice describes the processing chain that is actually configured for this deployment
 * (read from server environment variables at build time): storage, notification and analytics.
 */
export default async function Page({ params }) {
  const { dict } = await ctx(params);
  const T = dict.privacy;
  const X = T.sections;
  const p = processingSummary();
  const sections = [X.collect, X.purpose, p.store ? X.storageOn : X.storageOff, X.browser, p.analytics ? X.analyticsOn : X.analyticsOff, X.retention, X.children, X.rights, X.controlled];
  return (
    <>
      <PageHero title={T.title} lead={T.updated} />
      <Section first narrow>
        <div className="stack-lg">
          {sections.map(([h, text]) => (
            <div key={h}><h2 className="h-3" style={{ marginBottom: 8 }}>{h}</h2><p className="muted">{text}</p></div>
          ))}
          <div><h2 className="h-3" style={{ marginBottom: 8 }}>{T.contactTitle}</h2><p><a href={`mailto:${site.email}`}>{site.email}</a></p></div>
        </div>
      </Section>
    </>
  );
}
