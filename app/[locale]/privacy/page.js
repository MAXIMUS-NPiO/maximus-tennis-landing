import { ctx, meta } from "../../../lib/page";
import { PageHero, Section } from "../../../components/Ui";

export const generateMetadata = meta("privacy", (d) => [d.privacy.title, d.privacy.sections[0][1]]);

export default async function Page({ params }) {
  const { dict } = await ctx(params);
  const T = dict.privacy;
  return (
    <>
      <PageHero title={T.title} lead={T.updated} />
      <Section first narrow>
        <div className="stack-lg">{T.sections.map(([h, p]) => <div key={h}><h2 className="h-3" style={{ marginBottom: 8 }}>{h}</h2><p className="muted">{p}</p></div>)}</div>
      </Section>
    </>
  );
}
