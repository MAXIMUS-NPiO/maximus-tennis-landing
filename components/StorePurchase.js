/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import { site } from "../data/site";
import { Section, Note } from "./Ui";
import { tennisCheckoutLabels } from "../content/tennis-checkout";
import { href } from "../lib/paths";

/** Custom configuration and checkout stay on maximus.tennis. */
export default function StorePurchase({ locale }) {
  if (!site.locales.includes(locale)) return null;
  const C = tennisCheckoutLabels[locale];
  return (
    <Section id="purchase" title={C.customPurchase} narrow center>
      <div style={{ textAlign: "center" }}>
        <p className="mono muted">{C.steps}</p>
        <p className="lead">{C.checkoutOnSite}</p>
        <p>{C.goodsOnly}</p>
        <p>{C.goodsAndProgram}</p>
        <Note>{C.programPending}</Note>
        <div className="btn-row">
          <a className="btn" data-tennis-checkout="configuration" href={`${href(locale, 'build')}?from=custom`} style={{ whiteSpace: "normal", maxWidth: "100%", textAlign: "center" }}>
            {C.configure} <span aria-hidden="true">→</span>
          </a>
        </div>
        <p className="muted small">{C.sessionUnavailable}</p>
      </div>
    </Section>
  );
}
