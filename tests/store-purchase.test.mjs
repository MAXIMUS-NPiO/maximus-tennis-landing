/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { storeProduct9444 as product, storeProductSourceForGuard, storePurchaseHtmlForGuard } from "../data/store-products.js";
import { site, routes } from "../data/site.js";
import { storePurchaseLabels } from "../content/store-purchase.js";
import { confidentialHits } from "../scripts/lib/guard.mjs";
import { sweetSpotTrainer, series } from "../data/products.js";
import { readFileSync } from "node:fs";

test("the approved purchasable SKU remains a separate base-price store record", () => {
  assert.equal(product.productId, 9444); assert.equal(product.sku, "V50-300G");
  assert.equal(product.currency, "AED"); assert.equal(product.productPriceMinor, 150000);
  assert.equal(product.sellerLegalName, "MAXIMUS SPORTS EQUIPMENT TRADING LLC");
  assert.deepEqual(product.specs, { weightG: 300, headSizeSqIn: 50, balanceMm: 325, stringPattern: "12 × 14", grips: ["L2", "L3", "L4"] });
  assert.deepEqual(product.defaultSetup, { stringing: "unstrung", overgrip: "none", cover: "none" });
  assert.deepEqual(product.optionGroups, ["grip", "stringing", "strings", "overgrip", "cover"]);
  assert.ok(Object.isFrozen(product) && Object.isFrozen(product.specs) && Object.isFrozen(product.specs.grips));
  assert.equal(product.totalMinor, undefined); assert.equal(product.shippingMinor, undefined); assert.equal(product.taxMinor, undefined);
  assert.equal(sweetSpotTrainer.grips, "L0–L7"); assert.equal(sweetSpotTrainer.precisionClassesApply, false);
  assert.equal(series.power.headSizeSqIn, 98); assert.equal(series.spin.headSizeSqIn, 100);
});

test("all 48 locales provide every store disclosure and a buying label", () => {
  assert.equal(site.locales.length, 48);
  assert.deepEqual(Object.keys(storePurchaseLabels).sort(), [...site.locales].sort());
  const keys = ["buy", "priceLabel", "gripsLabel", "setup", "total", "checkout", "sellerLabel"].sort();
  for (const locale of site.locales) {
    assert.deepEqual(Object.keys(storePurchaseLabels[locale]).sort(), keys);
    for (const value of Object.values(storePurchaseLabels[locale])) assert.ok(typeof value === "string" && value.trim().length > 0, locale);
    assert.ok(storePurchaseLabels[locale].buy.includes("MAXIMUS SPORTS"), locale);
    assert.ok(storePurchaseLabels[locale].checkout.includes("MAXIMUS SPORTS"), locale);
  }
  assert.match(storePurchaseLabels.en.total, /options.*delivery.*tax/i);
  assert.doesNotMatch(storePurchaseLabels.en.total, /free|included|all-inclusive/i);
});

test("source guard exception accepts only the exact approved URL in the single approved data file", () => {
  const text = JSON.stringify({ url: product.url });
  assert.equal(confidentialHits(text), 1);
  assert.equal(confidentialHits(storeProductSourceForGuard("data/store-products.js", text)), 0);
  for (const path of ["components/StorePurchase.js", "content/store-purchase.js", "data/other.js", "/data/store-products.js", "data/store-products.js/evil"]) {
    assert.equal(storeProductSourceForGuard(path, text), text);
    assert.equal(confidentialHits(storeProductSourceForGuard(path, text)), 1);
  }
});

test("rendered guard exception covers only 48 known SST routes and their exact Next payload URL", () => {
  const html = `<a data-store-product="9444" href="${product.url}">Buy</a><script>self.__next_f.push([1,${JSON.stringify(JSON.stringify({ href: product.url }))}])</script>`;
  for (const locale of site.locales) {
    const masked = storePurchaseHtmlForGuard(`/${locale}${routes.sst}`, html);
    assert.equal(confidentialHits(masked), 0, locale);
    assert.equal(masked.includes(product.url), false);
  }
  for (const path of ["/en/build", "/en", "/unknown/training/sweet-spot-trainer", "/en/training/sweet-spot-trainer/other", "/en/training/sweet-spot-trainer?x=1"]) {
    assert.equal(storePurchaseHtmlForGuard(path, html), html, path);
  }
});

test("the approved URL exception cannot hide other URLs, changed targets or other guarded text", () => {
  const changed = [product.url + "?payment=1", product.url + "#purchase", product.url + "/other",
    product.url.replace("maximussports.ae", "sub.maximussports.ae"),
    product.url.replace("maximussports.ae", "maximussports.ae.evil"),
    product.url.replace("maximussports.ae", "another.example.invalid"),
    product.url.replace("300g-", "285g-")];
  for (const url of changed) {
    const text = `<a href="${url}">Buy</a>`;
    assert.equal(storePurchaseHtmlForGuard("/en/training/sweet-spot-trainer", text), text);
    assert.equal(storeProductSourceForGuard("data/store-products.js", text), text);
  }
  const other = `<a href="https://maximussports.ae/not-the-approved-product">Other</a>`;
  const mixed = `<a href="${product.url}">Buy</a>${other}`;
  const masked = storePurchaseHtmlForGuard("/en/training/sweet-spot-trainer", mixed);
  assert.ok(masked.endsWith(other)); assert.equal(confidentialHits(masked), 1);
});

test("the product action is a native store link and does not call local order/payment/ledger services", () => {
  const component = readFileSync(new URL("../components/StorePurchase.js", import.meta.url), "utf8");
  assert.match(component, /<a[^>]*href=\{product\.url\}/);
  assert.match(component, /T\.priceLabel/); assert.match(component, /T\.total/); assert.match(component, /T\.checkout/);
  assert.doesNotMatch(component, /fetch\(|\/api\/|sessionToken|accessToken|createOrder|paid|funding|financing|ledger\./i);
});
