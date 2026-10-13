/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import { catalogueCounts, nationalPackage } from "../data/products";
import { Section, Cta, Note } from "./Ui";
import { GripRow } from "./Product";

/** Proposed reference collection per country; calculations come from the shared product model. */
export default function NationalPackage({ locale, dict }) {
  const N = dict.nationalPackage, L = dict.common.labels, P = nationalPackage;
  const number = (value) => new Intl.NumberFormat(locale).format(value);
  const gripCombinations = `${N.variants} × ${L.grip}`;
  return (
    <Section id="national-package" title={N.title} lead={N.lead}>
      <p>{N.inclusion}</p>
      <div className="stack" style={{ marginTop: 24 }} data-national-package={P.id} data-variants={catalogueCounts.totalRequestedVariants} data-grip-combinations={P.combinations} data-units-per-country={P.unitsPerCountry}>
        <p className="mono">{N.variants}: <bdi>{number(catalogueCounts.playingVariants)} + {number(catalogueCounts.trainerVariants)} = {number(catalogueCounts.totalRequestedVariants)}</bdi></p>
        <p className="mono">{L.quantity}: <bdi>{number(catalogueCounts.totalRequestedVariants)} × {P.gripCount} × {P.copiesPerCombination} = {number(P.unitsPerCountry)}</bdi></p>
        <div className="spec-wrap" tabIndex={0}>
          <table className="spec">
            <caption className="small muted">{N.title}</caption>
            <thead><tr><th scope="col">{L.series}</th><th scope="col" className="num">{N.variants}</th><th scope="col" className="num">{gripCombinations}</th><th scope="col" className="num">{L.quantity}</th></tr></thead>
            <tbody>
              {P.families.map((family) => (
                <tr key={family.id} data-national-family={family.id}>
                  <th scope="row" className="row-head">{family.name}</th>
                  <td className="num" data-label={N.variants}><bdi>{family.weightPoints} × {family.lengths} = {number(family.variants)}</bdi></td>
                  <td className="num" data-label={gripCombinations}>{number(family.gripCombinations)}</td>
                  <td className="num" data-label={L.quantity}>{number(family.units)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><th scope="row">{L.quantity}</th><td className="num">{number(catalogueCounts.totalRequestedVariants)}</td><td className="num">{number(P.combinations)}</td><td className="num">{number(P.unitsPerCountry)}</td></tr></tfoot>
          </table>
        </div>
        <h3 className="h-3">{dict.sst.columns.grips} · L0–L7</h3>
        <GripRow dict={dict} />
        <p className="small muted">{dict.home.carbon.scaleCaption}</p>
        <p>{N.scope}</p>
        <p>{N.referenceLifecycle}</p>
        <p>{N.personalExample}</p>
        <p>{N.customBatches}</p>
        <p>{N.proShop}</p>
        <Note>{N.boundary}</Note>
        <div className="btn-row"><Cta locale={locale} to="distribution" label={dict.nav.distribution} kind="btn-outline" track="national_package_distribution" /></div>
      </div>
    </Section>
  );
}
