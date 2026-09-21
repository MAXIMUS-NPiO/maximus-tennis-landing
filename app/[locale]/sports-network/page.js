import { ctx, meta } from "../../../lib/page";
import { PageHero, Section, Cta } from "../../../components/Ui";

export const generateMetadata = meta("network", (d) => [d.network.title, d.network.lead]);

export default async function Page({ params }) {
  const { locale, dict } = await ctx(params);
  const N = dict.network, S = dict.common.statuses;
  return (
    <>
      <PageHero eyebrow={dict.nav.network} title={N.title} lead={N.lead} />
      <Section first title={N.functionsTitle}><div className="chain">{N.functions.map((f) => <span key={f}>{f}</span>)}</div></Section>
      <Section band="band-1" title={N.statusTitle}><span className="status request">{S.request}</span><p className="lead" style={{ marginTop: 14 }}>{N.statusP}</p><div className="btn-row"><Cta locale={locale} to="contact" label={N.cta} purpose="network" /></div></Section>
    </>
  );
}
