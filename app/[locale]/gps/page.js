import { ctx, meta, formDict } from "../../../lib/page";
import { productDataVersion } from "../../../data/products";
import { PageHero, Section, Note } from "../../../components/Ui";
import GpsWizard, { GPS_RULES_VERSION } from "../../../components/GpsWizard";

export const generateMetadata = meta("gps", (d) => [d.gps.metaTitle, d.gps.lead]);

export default async function Page({ params }) {
  const { locale, dict } = await ctx(params);
  const G = dict.gps, H = dict.home.gps;
  return (
    <>
      <PageHero eyebrow={`${H.a.h} · ${H.b.h}`} title={G.title} lead={G.lead}>
        <p className="muted mono" style={{ fontSize: 13, marginTop: 18 }}>{G.rulesVersion}: {GPS_RULES_VERSION} · {G.dataVersion}: {productDataVersion}</p>
      </PageHero>
      <Section first>
        <Note>{G.honesty}</Note>
        <div style={{ height: 20 }} />
        <GpsWizard locale={locale} dict={formDict(dict, ["racquets"])} />
      </Section>
    </>
  );
}
