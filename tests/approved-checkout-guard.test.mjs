/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import test from "node:test";
import assert from "node:assert/strict";
import { approvedCheckoutSourceForGuard } from "../scripts/lib/approved-checkout-guard.mjs";
import { confidentialHits } from "../scripts/lib/guard.mjs";

test("only the seven approved transport and handoff paths mask the exact store hostname", () => {
  for (const path of [
    "lib/commerce/cscart.js", "lib/commerce/cscart-api.js", "lib/platform/commerce-ledger.js",
    "components/OrderAccount.js", "lib/platform/native-cscart.js",
    "lib/platform/native-ledger-runtime.js", "lib/platform/native-read-http.js",
  ]) {
    const source = 'const origin = "https://maximussports.ae/api/orders";';
    assert.ok(confidentialHits(source) > 0);
    const guarded = approvedCheckoutSourceForGuard(path, source);
    assert.equal(guarded, 'const origin = "https://approvedcheckout/api/orders";');
    assert.equal(confidentialHits(guarded), 0);
  }
});

test("public pages, neighboring files and noncanonical paths receive no exception", () => {
  const source = "https://maximussports.ae/api/orders";
  for (const path of ["app/page.js", "lib/platform/native-other.js", "lib/platform/native-cscart.js.bak",
    "./lib/platform/native-cscart.js", "lib/platform/../platform/native-cscart.js"]) {
    assert.equal(approvedCheckoutSourceForGuard(path, source), source);
    assert.ok(confidentialHits(approvedCheckoutSourceForGuard(path, source)) > 0);
  }
});

test("the exception preserves subdomains, lookalike domains and all surrounding content", () => {
  const path = "lib/platform/native-cscart.js";
  for (const host of ["api.maximussports.ae", "maximussports.ae.evil.example", "xmaximussports.ae",
    "maximussports.aex", "maximussports.ae-other.example"]) {
    const source = `https://${host}/api/orders`;
    assert.equal(approvedCheckoutSourceForGuard(path, source), source);
  }
  const source = "other protected content stays: https://MAXIMUSSPORTS.AE/api/orders?field=unchanged";
  assert.equal(approvedCheckoutSourceForGuard(path, source),
    "other protected content stays: https://approvedcheckout/api/orders?field=unchanged");
});
