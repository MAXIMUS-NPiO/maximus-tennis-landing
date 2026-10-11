/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import { ctx, formDict } from '../../../lib/page';
import { Section, PageHero } from '../../../components/Ui';
import OrderAccount from '../../../components/OrderAccount';
import { commerceLabels } from '../../../content/commerce';
export const metadata = { robots: { index: false, follow: false }, referrer: 'no-referrer' };
export default async function Page({ params }) {
  const { locale, dict } = await ctx(params);
  return <><PageHero title={commerceLabels[locale].account} lead={dict.common.truth.requestNotOrder} />
    <Section first><OrderAccount locale={locale} dict={formDict(dict, ['build'])} /></Section></>;
}
