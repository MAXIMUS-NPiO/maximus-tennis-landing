/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/** Public source contains no customer-specific approvals or draft quotation history.
 * Authorised private price books may be supplied through the server-only resolver dependency.
 * No published record is a default price or an approval of an individual order.
 */
export const PRICE_BOOK_VERSIONS = Object.freeze([]);

export const QUOTE_VALIDITY_POLICY = Object.freeze({ status: "not_approved", days: null, note: "Validity is confirmed in writing per quotation until the owner approves a general policy." });

/** The confirmed lead-time statement of the owner (working days, after all start conditions). */
export const LEAD_TIME = Object.freeze({
  workingDaysMin: 90,
  workingDaysMax: 120,
  startConditions: ["final written specification", "artwork approval", "order agreement", "verified cleared payment"],
  calendar: "approved production calendar — not supplied; no delivery date is promised until the start date is known",
});
