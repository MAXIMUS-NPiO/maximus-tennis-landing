import Link from "next/link";
import { ctx, meta } from "../../../lib/page";
import { href } from "../../../lib/paths";
import { PageHero, Section, Note } from "../../../components/Ui";

export const generateMetadata = meta("partnerships", (d) => [d.partnerships.title, d.partnerships.lead]);
const KEYS = ["coaches", "clubs", "distribution", "strategic", "institutional"];

export default async function Page({ params }) {
  const { locale, dict } = await ctx(params);
  const P = dict.partnerships;
  return (
    <>
      <PageHero eyebrow={dict.nav.groups.partnerships} title={P.title} lead={P.lead} />
      <Section first>
        <div className="grid-3">{KEYS.map((k) => <Link key={k} href={href(locale, k)} className="card card-link"><h3>{P.routes[k].title}</h3><p>{P.routes[k].lead}</p><span className="arrow">{P.routes[k].cta} →</span></Link>)}</div>
      </Section>
      <Section band="band-2" title={P.commercialTitle}><div className="chain">{P.commercial.map((c) => <span key={c}>{c}</span>)}</div><Note>{P.boundary}</Note></Section>
      <Section band="band-1" title={P.disclosureTitle}>
        <div className="grid-3">{Object.values(P.disclosure).map((d) => <div key={d.h} className="card"><h3>{d.h}</h3><p>{d.p}</p></div>)}</div>
      </Section>
    </>
  );
}
