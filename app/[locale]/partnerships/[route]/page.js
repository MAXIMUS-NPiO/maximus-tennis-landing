import { notFound } from "next/navigation";
import { ctx, formDict } from "../../../../lib/page";
import { pageMeta } from "../../../../lib/metadata";
import { routes } from "../../../../data/site";
import { locales } from "../../../../lib/i18n";
import { PageHero, Section, Kickers, Note, Brief } from "../../../../components/Ui";
import LeadForm from "../../../../components/LeadForm";

const MAP = { coaches: "coaches", "clubs-academies": "clubs", distribution: "distribution", strategic: "strategic", institutional: "institutional" };
const FROM = { coaches: "coach", clubs: "club", distribution: "partner", strategic: "partner", institutional: "partner" };
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
      <PageHero eyebrow={dict.nav.groups.partnerships} title={R.title} lead={R.lead}>
        <Brief labels={dict.common.brief} brief={R.brief} />
      </PageHero>
      <Section first><Kickers items={R.points} /><Note>{dict.partnerships.boundary}</Note></Section>
      <Section id="enquiry" band="band-1" title={R.cta}>
        <div className="panel form-panel">
          <LeadForm dict={formDict(dict)} locale={locale} purpose={R.purpose} context={{ from: FROM[key] }} />
        </div>
      </Section>
    </>
  );
}
