/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import { ctx, formDict } from '../../../lib/page';
import { PageHero, Section } from '../../../components/Ui';
import TennisCheckout from '../../../components/TennisCheckout';
import { tennisCheckoutLabels } from '../../../content/tennis-checkout';

export const metadata = { robots: { index: false, follow: false }, referrer: 'no-referrer' };
export default async function Page({ params }) {
  const { locale, dict } = await ctx(params), P = tennisCheckoutLabels[locale];
  return <><PageHero eyebrow="MAXIMUS TENNIS" title={P.checkoutOnSite} lead={P.customPurchase} />
    <Section first><TennisCheckout locale={locale} dict={formDict(dict, ['build'])} /></Section></>;
}
