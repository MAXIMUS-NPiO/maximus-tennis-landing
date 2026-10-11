/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import { storeProduct9444 as product } from "../data/store-products";
import { storePurchaseLabels } from "../content/store-purchase";
import { site } from "../data/site";
import { Section, Note } from "./Ui";

/** An ordinary store product link; creates no local order, session, ledger entry or payment. */
export default function StorePurchase({ locale, dict }) {
  const T = storePurchaseLabels[locale];
  if (!T || !site.locales.includes(locale)) return null;
  const L = dict.common.labels, S = product.specs;
  const numberLocale = site.localeMeta[locale]?.htmlLang || locale;
  const price = new Intl.NumberFormat(numberLocale, { maximumFractionDigits: 0 }).format(product.productPriceMinor / 100);
  return (
    <Section id="purchase" title={product.name} narrow center>
      <div style={{ textAlign: "center" }}>
        <p className="mono"><bdi dir="ltr">{product.sku} · {S.weightG} {L.grams} · {S.headSizeSqIn} {L.sqin} · {S.stringPattern} · {S.balanceMm} {L.mm}</bdi></p>
        <p>{T.gripsLabel}: <bdi dir="ltr">{S.grips.join(" / ")}</bdi></p>
        <p className="lead">{T.priceLabel}: <bdi dir="ltr">{product.currency} {price}</bdi></p>
        <p>{T.setup}</p>
        <Note>{T.total}</Note>
        <p>{T.checkout}</p>
        <div className="btn-row">
          <a className="btn" data-store-product="9444" href={product.url} referrerPolicy="no-referrer" style={{ whiteSpace: "normal", maxWidth: "100%", textAlign: "center" }}>
            {T.buy} <span aria-hidden="true">→</span>
          </a>
        </div>
        <p className="muted small" style={{ marginTop: 20 }}>{T.sellerLabel}: <bdi dir="ltr">{product.sellerLegalName}</bdi></p>
      </div>
    </Section>
  );
}
