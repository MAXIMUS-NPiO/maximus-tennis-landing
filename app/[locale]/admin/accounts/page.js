/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import { ctx, formDict } from '../../../../lib/page';
import { Section, PageHero } from '../../../../components/Ui';
import AdminAccounts from '../../../../components/AdminAccounts';
import { accountLabels } from '../../../../content/account';

export const metadata = { robots: { index: false, follow: false }, referrer: 'no-referrer' };
export default async function Page({ params }) {
  const { locale, dict } = await ctx(params);
  return <><PageHero eyebrow="MAXIMUS TENNIS" title={accountLabels[locale].adminTitle} />
    <Section first><AdminAccounts locale={locale} dict={formDict(dict, ['nav'])} /></Section></>;
}
