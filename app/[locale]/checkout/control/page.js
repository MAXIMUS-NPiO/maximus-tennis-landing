/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import { ctx } from '../../../../lib/page';
import { pageMeta } from '../../../../lib/metadata';
import { PageHero, Section } from '../../../../components/Ui';
import TennisControl from '../../../../components/TennisControl';
import { tennisControlLabels } from '../../../../content/tennis-control';

/**
 * Owner payment control. Rendered per request so that the route-scoped Content Security Policy
 * nonce set by the middleware reaches the page scripts; the page itself carries no private data.
 */
export const dynamic = 'force-dynamic';
export async function generateMetadata({ params }) {
  const { locale } = await ctx(params), P = tennisControlLabels[locale];
  return { ...pageMeta(locale, '/checkout/control', P.title, P.intro), robots: { index: false, follow: false }, referrer: 'no-referrer' };
}
export default async function Page({ params }) {
  const { locale } = await ctx(params), P = tennisControlLabels[locale];
  return <><PageHero eyebrow="MAXIMUS TENNIS" title={P.title} lead={P.intro} />
    <Section first><TennisControl locale={locale} /></Section></>;
}
