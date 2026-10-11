/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import { ctx, formDict } from '../../../lib/page';
import { Section, PageHero } from '../../../components/Ui';
import CustomerAccount from '../../../components/CustomerAccount';
import { accountLabels } from '../../../content/account';

export const metadata = { robots: { index: false, follow: false }, referrer: 'no-referrer' };
export default async function Page({ params }) {
  const { locale, dict } = await ctx(params);
  return <><PageHero eyebrow="MAXIMUS TENNIS" title={accountLabels[locale].title} />
    <Section first><CustomerAccount locale={locale} dict={formDict(dict, ['nav', 'build'])} /></Section></>;
}
