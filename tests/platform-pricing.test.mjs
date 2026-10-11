/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/** APP-033/034; REQ-048/049/051: an individual approval is never a catalogue price. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { PRICE_BOOK_VERSIONS } from "../data/pricing.js";
import { createCatalog, createPriceResolver, resolvePrice } from "../lib/platform/catalog.js";
import { hashPayload } from "../lib/platform/ids.js";

const at = Date.parse("2026-10-10T12:00:00Z");
const line = Object.freeze({
  productKind: "racquet", series: "power", precisionLevel: "P1.5", mode: "listed",
  weight: 300, grip: "L5", country: "FR", quantity: 1,
  personalisationType: "name", engraving: "TEST ENGRAVING", targetRA: 68,
});
// Fixtures prove the binding contract; they do not import or create a real customer/order.
const context = Object.freeze({ userId: "test-customer", orderId: "test-order", configurationRevisionId: "test-revision" });
const individual = (changes = {}) => ({
  id: "test-individual-price", status: "approved", scopeType: "individual_order",
  title: "Synthetic individual approval", currency: "USD", unitCents: 47125,
  scope: { productKind: line.productKind, series: line.series, precisionLevel: line.precisionLevel,
    mode: line.mode, weight: line.weight, grip: line.grip, country: line.country,
    quantityMin: 1, quantityMax: 1, personalisationTypes: [line.personalisationType] },
  includes: ["synthetic-test-items"], taxRegime: "synthetic-test-tax", mandatoryRecipientChargeOnDelivery: false,
  validFrom: "2026-10-08T00:00:00Z", validUntil: null,
  individualOrderBinding: {
    customerUserId: context.userId, orderId: context.orderId,
    configurationRevisionId: context.configurationRevisionId, lineHash: hashPayload(line),
  },
  ...changes,
});
const resolver = (version = individual(), serverContext = context, time = at) => createPriceResolver({
  priceBookVersions: [version], now: () => time, getIndividualOrderContext: () => serverContext,
});
const unpriced = (result, reason) => {
  assert.equal(result.status, "unpriced");
  if (reason) assert.equal(result.reason, reason);
  assert.equal(Object.hasOwn(result, "unitCents"), false);
  assert.equal(Object.hasOwn(result, "totalCents"), false);
};

test("public price book contains no individual approval or quotation history", () => {
  assert.deepEqual(PRICE_BOOK_VERSIONS, []);
  unpriced(resolvePrice(line), "no_approved_price_for_scope");
});

test("client customer/order claims cannot activate an unbound synthetic individual price", () => {
  const unbound = resolver(individual({ individualOrderBinding: null }));
  unpriced(unbound({ ...line, engraving: "SYNTHETIC CLIENT", customerUserId: "synthetic-client-claim", orderId: "synthetic-order-claim", individualOrderBinding: context, authenticated: true }), "individual_order_binding_required");
  unpriced(resolvePrice({ ...line, ...context, authenticated: true }), "no_approved_price_for_scope");
});

test("only a matching authenticated server context and exact approved line resolve an individual price", () => {
  const result = resolver()(line);
  assert.equal(result.status, "priced");
  assert.equal(result.unitCents, 47125);
  assert.equal(result.totalCents, 47125);
  assert.equal(result.priceBookVersionId, "test-individual-price");
});

test("another buyer cannot reuse the same approved product and individual binding", () => {
  const resolve = resolver(individual(), { ...context, userId: "another-test-customer" });
  unpriced(resolve(line), "individual_order_scope_mismatch");
  unpriced(resolve({ ...line, customerUserId: context.userId, userId: context.userId, authenticated: true }), "individual_order_scope_mismatch");
});

test("client identities cannot substitute for a missing authenticated server context", () => {
  unpriced(resolver(individual(), null)({ ...line, ...context, customerUserId: context.userId }), "individual_order_scope_mismatch");
  const resolve = createPriceResolver({ priceBookVersions: [individual()], now: () => at });
  unpriced(resolve(line), "individual_order_scope_mismatch");
});

test("a missing or partial server price-book binding remains unpriced", () => {
  for (const binding of [null, {}, { customerUserId: context.userId }, { ...individual().individualOrderBinding, orderId: "" }, { ...individual().individualOrderBinding, lineHash: "not-a-hash" }]) {
    unpriced(resolver(individual({ individualOrderBinding: binding }))(line), "individual_order_binding_required");
  }
});

test("individual pricing cannot follow another order or configuration revision", () => {
  unpriced(resolver(individual(), { ...context, orderId: "other-test-order" })(line), "individual_order_scope_mismatch");
  unpriced(resolver(individual(), { ...context, configurationRevisionId: "other-test-revision" })(line), "individual_order_scope_mismatch");
});

test("changing engraving, stiffness or adding fields requires a fresh exact line approval", () => {
  const resolve = resolver();
  for (const changes of [{ engraving: "OTHER ENGRAVING" }, { targetRA: 69 }, { additionalOption: "different-specification" }]) {
    unpriced(resolve({ ...line, ...changes }), "individual_order_scope_mismatch");
  }
});

test("missing, non-integer and unsafe quantity never silently becomes one", () => {
  const resolve = resolver();
  for (const quantity of [undefined, null, 0, -1, 1.5, "1", true, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    unpriced(resolve({ ...line, quantity }), "quantity_positive_integer_required");
    unpriced(resolvePrice({ ...line, quantity }), "quantity_positive_integer_required");
  }
});

test("a quantity outside the individual approved scope cannot reuse its price", () => {
  unpriced(resolver()({ ...line, quantity: 2 }), "no_approved_price_for_scope");
});

test("approved expiry is enforced at its exact boundary", () => {
  const validUntil = "2026-10-10T12:00:00Z";
  assert.equal(resolver(individual({ validUntil }), context, at - 1)(line).status, "priced");
  unpriced(resolver(individual({ validUntil }), context, at)(line), "price_expired");
  unpriced(resolver(individual({ validUntil }), context, at + 1)(line), "price_expired");
});

test("future validity, malformed dates and unavailable clock fail closed", () => {
  unpriced(resolver(individual({ validFrom: "2026-10-11T00:00:00Z" }))(line), "price_not_yet_valid");
  for (const changes of [{ validFrom: "not-a-date" }, { validUntil: "not-a-date" }, { validUntil: 123 }, { validUntil: "2026-10-10T12:00:00" }, { validUntil: "2026-02-30T12:00:00Z" }, { validFrom: "2026-02-30" }]) {
    unpriced(resolver(individual(changes))(line), "price_validity_invalid");
  }
  unpriced(resolver(individual(), context, NaN)(line), "price_clock_unavailable");
  assert.equal(resolver(individual({ validUntil: null }))(line).status, "priced");
});

test("validity instants accept explicit offsets and date-only boundaries use UTC", () => {
  unpriced(resolver(individual({ validUntil: "2026-10-10T16:00:00+04:00" }))(line), "price_expired");
  assert.equal(resolver(individual({ validUntil: "2026-10-11" }), context, Date.parse("2026-10-10T23:59:59.999Z"))(line).status, "priced");
  unpriced(resolver(individual({ validUntil: "2026-10-11" }), context, Date.parse("2026-10-11T00:00:00Z"))(line), "price_expired");
});

test("a draft price cannot be activated by a matching server binding", () => {
  unpriced(resolver(individual({ status: "draft_inactive" }))(line), "only_draft_price_exists_not_approved");
  unpriced(resolvePrice({ ...line, series: "great", weight: 272 }), "no_approved_price_for_scope");
});

test("approved records without an explicit scope type do not become global prices", () => {
  unpriced(resolver(individual({ scopeType: undefined }))(line), "approved_scope_type_required");
});

test("catalogue-approved test fixture uses exact positive quantity and approved expiry", () => {
  const version = individual({ scopeType: "catalogue", scope: { ...individual().scope, quantityMax: 3 }, validUntil: "2026-10-11T00:00:00Z", individualOrderBinding: null });
  const result = resolver(version, null)({ ...line, quantity: 3 });
  assert.equal(result.status, "priced");
  assert.equal(result.totalCents, 141375);
  unpriced(resolver(version, null, Date.parse(version.validUntil))(line), "price_expired");
});

test("catalog service propagates its server clock and binding dependencies", () => {
  const catalog = createCatalog({ store: {}, now: () => at, priceBookVersions: [individual()], getIndividualOrderContext: () => context });
  assert.equal(catalog.resolvePrice(line).status, "priced");
  const defaultCatalog = createCatalog({ store: {}, now: () => at });
  unpriced(defaultCatalog.resolvePrice(line), "no_approved_price_for_scope");
});
