/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/** SERVER ONLY. Commercial approvals are separate from engineering product data.
 * Empty deliberately: individual agreements are not catalogue prices.
 * Each approved offer must bind the complete normalized configuration, seller,
 * tax/shipping totals, delivery terms, expiry and evidence before checkout.
 */
export const commercialVersion = '2026-10-09-draft-1';
export const approvedOffers = Object.freeze([]);
export const financingExamples = Object.freeze({
  B: { currency: 'EUR', productMinor: 60000, financingMinor: 600000, proposedPrincipalReturnMinor: 600000, proposedBonusAccountMinor: 120000, months: 12 },
  C: { currency: 'EUR', financingMinor: 600000, proposedAdvancePurchaseBonusMinor: 60000, proposedPrincipalReturnMinor: 600000, months: 12 },
});
// Examples are requirements for contract review, neither cash interest nor guarantees.
export function findOffer(configurationHash, offers = approvedOffers, now = Date.now()) {
  const o = offers.find(x => x.configurationHash === configurationHash && x.approved === true && Date.parse(x.expiresAt) > now);
  if (!o || !/^[A-Z]{3}$/.test(o.currency) || !Number.isSafeInteger(o.totalMinor) || o.totalMinor <= 0 ||
      ![o.productMinor, o.taxMinor, o.shippingMinor].every(x => Number.isSafeInteger(x) && x >= 0) ||
      o.totalMinor !== o.productMinor + o.taxMinor + o.shippingMinor ||
      o.pricingPolicy !== 'worldwide-all-inclusive-v1' || !Array.isArray(o.fulfillableCountries) || !o.fulfillableCountries.length || !o.seller?.legalName || !o.seller?.address || !o.termsVersion || !o.termsText || !o.deliveryTerms || !o.evidence) return null;
  return JSON.parse(JSON.stringify(o));
}
