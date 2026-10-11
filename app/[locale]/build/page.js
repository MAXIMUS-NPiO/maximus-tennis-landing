/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import { ctx, meta, formDict } from "../../../lib/page";
import { PageHero, Section } from "../../../components/Ui";
import Configurator from "../../../components/Configurator";
import { ModelRights } from "../../../components/Authorship";
import { tennisCheckoutLabels } from "../../../content/tennis-checkout";

export const generateMetadata = meta("build", (d) => [d.build.title, d.build.lead]);

export default async function Page({ params }) {
  const { locale, dict } = await ctx(params);
  const B = dict.build;
  return (
    <>
      <PageHero eyebrow={dict.home.personal.eyebrow} title={B.title} statement={dict.home.personal.title} lead={B.lead} />
      <Section first>
        <p className="eyebrow">{tennisCheckoutLabels[locale].checkoutOnSite}</p>
        <p className="mono muted">{tennisCheckoutLabels[locale].steps}</p>
        <Configurator orderFlowEnabled={process.env.ORDER_FLOW_ENABLED === "true"} locale={locale} dict={formDict(dict, ["build", "racquets", "precision"])} />
        <ModelRights dict={dict} />
      </Section>
    </>
  );
}
