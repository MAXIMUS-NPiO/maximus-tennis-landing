/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import { ctx, meta } from "../../../lib/page";
import { grips } from "../../../data/products";
import { PageHero, Section, Cta, Note } from "../../../components/Ui";
import { GripRow } from "../../../components/Product";
import { GripScale } from "../../../components/Schematics";
import { GripShapes } from "../../../components/GripShape";

export const generateMetadata = meta("grip", (d) => [d.grip.title, `${d.grip.lead} ${d.gripShape.short}`]);

export default async function Page({ params }) {
  const { locale, dict } = await ctx(params);
  const G = dict.grip;
  const GS = dict.gripShape;
  return (
    <>
      <PageHero eyebrow={dict.home.carbon.eyebrow} title={G.title} statement={G.statement} lead={G.lead} />
      <Section first><GripScale caption={dict.home.carbon.scaleCaption} schematicLabel={dict.common.labels.schematic} /><div style={{ height: 24 }} /><GripRow dict={dict} /></Section>
      <Section band="band-2">
        <div className="split">
          <div className="stack"><p className="lead">{G.p1}</p><p>{G.p2}</p><p className="muted">{G.p3}</p></div>
          <div className="spec-wrap" tabIndex={0}><table className="spec"><thead><tr><th>{G.columns.size}</th><th className="num">{G.columns.nominal}</th><th>{G.columns.family}</th></tr></thead><tbody>
            {grips.map((g) => <tr key={g.id}><td className="row-head"><strong>{g.id}</strong></td><td className="num" data-label={G.columns.nominal}>{g.inches}{g.fraction}″</td><td data-label={G.columns.family}><small>{G.families}</small></td></tr>)}
          </tbody></table></div>
        </div>
      </Section>
      {/* Founder, 15 October 2026: the shape of the handle is a second, separate choice. */}
      <Section id="grip-shape" title={GS.title} lead={GS.lead}>
        <p className="statement" style={{ marginBottom: 22 }}>{GS.statement}</p>
        <GripShapes locale={locale} dict={dict} />
        <Note>{`${GS.note} ${GS.countNote}`}</Note>
        <div className="btn-row"><Cta locale={locale} to="build" query="from=grip" label={GS.cta} track="grip_shape_configure" /></div>
      </Section>
    </>
  );
}
