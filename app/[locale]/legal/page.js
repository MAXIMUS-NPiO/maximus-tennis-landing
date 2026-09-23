import { ctx, meta } from "../../../lib/page";
import { entities } from "../../../data/site";
import { PageHero, Section, Kickers } from "../../../components/Ui";

export const generateMetadata = meta("legal", (d) => [d.legal.title, d.legal.lead]);

export default async function Page({ params }) {
  const { locale, dict } = await ctx(params);
  const Lg = dict.legal, lb = Lg.labels;
  const Row = ({ k, v }) => v ? <div><span className="muted">{k}: </span>{v}</div> : null;
  return (
    <>
      <PageHero eyebrow={dict.nav.legal} title={Lg.title} lead={Lg.lead} />
      <Section first>
        <div className="grid-2">
          <div className="card"><p className="eyebrow">{Lg.entities.institutional.role}</p><h3>{entities.institutional.name}</h3><p>{Lg.entities.institutional.p}</p><div className="legal-block"><Row k={lb.licence} v={entities.institutional.licence} /><Row k={lb.registration} v={entities.institutional.registration} /><Row k={lb.jurisdiction} v={entities.institutional.jurisdiction} /><Row k={lb.email} v={entities.institutional.email} /></div></div>
          <div className="card"><p className="eyebrow">{Lg.entities.equipment.role}</p><h3>{entities.equipment.name}</h3><p>{Lg.entities.equipment.p}</p><div className="legal-block"><Row k={lb.licence} v={entities.equipment.licence} /><Row k={lb.vat} v={entities.equipment.vatTrn} /><Row k={lb.address} v={entities.equipment.address} /></div></div>
          <div className="card"><p className="eyebrow">{Lg.entities.ip.role}</p><h3>{entities.ip.name}</h3><p>{Lg.entities.ip.p}</p><div className="legal-block"><Row k={lb.licence} v={entities.ip.licence} /><Row k={lb.jurisdiction} v={entities.ip.jurisdiction} /></div></div>
          <div className="card"><p className="eyebrow">{Lg.entities.stewardship.role}</p><h3>{entities.stewardship}</h3><p>{Lg.entities.stewardship.p}</p><hr /><p className="eyebrow">{Lg.entities.control.role}</p><h3>{entities.control}</h3><p>{Lg.entities.control.p}</p></div>
        </div>
      </Section>
      <Section band="band-2" title={Lg.boundaryTitle}><Kickers items={Lg.boundary} /></Section>
    </>
  );
}
