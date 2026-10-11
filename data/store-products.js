/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import { site, routes } from "./site.js";

/** Owner-approved existing store SKU. This does not map performance configurations or finance. */
export const storeProduct9444 = Object.freeze({
  productId: 9444,
  sku: "V50-300G",
  name: "300g MAXIMUS POWER & SPIN",
  url: "https://maximussports.ae/tennis/racquets/maximus/300g-maximus-power-and-spin-tennis-racket.html",
  currency: "AED",
  productPriceMinor: 150000,
  sellerLegalName: "MAXIMUS SPORTS EQUIPMENT TRADING LLC",
  specs: Object.freeze({ weightG: 300, headSizeSqIn: 50, balanceMm: 325, stringPattern: "12 × 14", grips: Object.freeze(["L2", "L3", "L4"]) }),
  optionGroups: Object.freeze(["grip", "stringing", "strings", "overgrip", "cover"]),
  defaultSetup: Object.freeze({ stringing: "unstrung", overgrip: "none", cover: "none" }),
});

const escapedProductUrl = storeProduct9444.url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const exactProductUrl = new RegExp(`(?<![A-Za-z0-9])${escapedProductUrl}(?![A-Za-z0-9/?#._%&=+-])`, "g");
const maskExactProductUrl = (text) => text.replace(exactProductUrl, "approvedstoreproduct");

/** The owner authorised one public product link, only in this fixed source record. */
export function storeProductSourceForGuard(filePath, text) {
  return filePath === "data/store-products.js" ? maskExactProductUrl(text) : text;
}

/** Exact approved URL on the 48 SST routes, including its duplicate in Next's render payload. */
export function storePurchaseHtmlForGuard(path, html) {
  if (!site.locales.some((locale) => path === `/${locale}${routes.sst}`)) return html;
  return maskExactProductUrl(html);
}
