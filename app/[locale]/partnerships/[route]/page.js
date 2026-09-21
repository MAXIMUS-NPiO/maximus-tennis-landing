import { notFound } from "next/navigation";
import { ctx } from "../../../../lib/page";
import { pageMeta } from "../../../../lib/metadata";
import { routes } from "../../../../data/site";
import { locales } from "../../../../lib/i18n";
import { PageHero, Section, Kickers, Note } from "../../../../components/Ui";
import RequestForm from "../../../../components/RequestForm";

const MAP = { coaches: "coaches", "clubs-academies": "clubs", distribution: "distribution", strategic: "strategic", institutional: "institutional" };
export const dynamicParams = false;
export function generateStaticParams() { return locales.flatMap((locale) => Object.keys(MAP).map((route) => ({ locale, route }))); }

export async function generateMetadata({ params }) {
  const { locale, route } = await params;
  const key = MAP[route];
  if (!key) return {};
  const { dict } = await ctx(Promise.resolve({ locale }));
  return pageMeta(locale, routes[key], dict.partnerships.routes[key].title, dict.partnerships.routes[key].lead);
}

export default async function Page({ params }) {
  const { locale, route } = await params;
  const key = MAP[route];
  if (!key) notFound();
  const { dict } = await ctx(Promise.resolve({ locale }));
  const R = dict.partnerships.routes[key];
  return (
    <>
      <PageHero eyebrow={dict.nav.groups.partnerships} title={R.title} lead={R.lead} />
      <Section first><Kickers items={R.points} /><Note>{dict.partnerships.boundary}</Note></Section>
      <Section band="band-carbon" title={R.cta}><RequestForm dict={dict} fixedPurpose={R.purpose} /></Section>
    </>
  );
}
