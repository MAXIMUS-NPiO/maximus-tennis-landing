/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
// The owner authorised this existing store on 10 October 2026. Only these server transports and
// the validated checkout handoff may reference its exact hostname; all other guard rules remain.
const checkoutFiles = new Set([
  "lib/commerce/cscart.js",
  "lib/commerce/cscart-api.js",
  "lib/platform/commerce-ledger.js",
  "components/OrderAccount.js",
  "lib/platform/native-cscart.js",
  "lib/platform/native-ledger-runtime.js",
  "lib/platform/native-read-http.js",
]);
const approvedCheckoutHost = /(?<![A-Za-z0-9.-])maximussports\.ae(?![A-Za-z0-9.-])/gi;

export function approvedCheckoutSourceForGuard(relativePath, text) {
  return checkoutFiles.has(relativePath) ? text.replace(approvedCheckoutHost, "approvedcheckout") : text;
}
