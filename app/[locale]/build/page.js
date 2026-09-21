import { ctx, meta } from "../../../lib/page";
import { PageHero, Section, Note } from "../../../components/Ui";
import Configurator from "../../../components/Configurator";

export const generateMetadata = meta("build", (d) => [d.build.title, d.build.lead]);

export default async function Page({ params }) {
  const { locale, dict } = await ctx(params);
  const B = dict.build;
  return (
    <>
      <PageHero eyebrow={dict.home.personal.eyebrow} title={B.title} statement={dict.home.personal.title} lead={B.lead} />
      <Section first>
        <Configurator dict={{ build: dict.build, common: dict.common, form: dict.form, racquets: dict.racquets, precision: dict.precision, gps: dict.gps }} />
        <Note>{dict.common.truth.noPrices}</Note>
      </Section>
    </>
  );
}
