/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import { ctx, formDict } from '../../../lib/page';
import { pageMeta } from '../../../lib/metadata';
import { PageHero, Section, Note } from '../../../components/Ui';
import ForumDashboard from '../../../components/ForumDashboard';
import { forumCopy } from '../../../content/forum-copy';
export async function generateMetadata({params}) {
  const {locale} = await params, F = forumCopy(locale);
  return {...pageMeta(locale,'/forum',F.title,F.lead),robots:{index:false,follow:false}};
}
export default async function Page({params}) {
  const {locale,dict} = await ctx(params), F = forumCopy(locale);
  return <><PageHero eyebrow={dict.nav.groups.partnerships} title={F.title} lead={F.lead}/>
    <Section first><div className="stack"><Note>{F.proposal}</Note><p>{F.infrastructure}</p></div></Section>
    <Section band="band-2" title={F.dashboard}><ForumDashboard locale={locale} dict={formDict(dict)}/></Section>
    <Section title={F.pendingModules}><p>{F.unavailableModules}</p></Section>
  </>;
}
