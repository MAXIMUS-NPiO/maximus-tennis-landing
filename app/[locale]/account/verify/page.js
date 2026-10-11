/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import { ctx, formDict } from '../../../../lib/page';
import { Section, PageHero } from '../../../../components/Ui';
import CustomerAccount from '../../../../components/CustomerAccount';
import { accountLabels } from '../../../../content/account';

// Never read a verification token in this server page or redeem it on GET.
// The client strips the fragment/legacy query and waits for explicit confirmation.
export const metadata = { robots: { index: false, follow: false }, referrer: 'no-referrer' };
export default async function Page({ params }) {
  const { locale, dict } = await ctx(params);
  return <><PageHero eyebrow="MAXIMUS TENNIS" title={accountLabels[locale].verify} />
    <Section first narrow><CustomerAccount locale={locale} dict={formDict(dict, ['nav'])} verify /></Section></>;
}
