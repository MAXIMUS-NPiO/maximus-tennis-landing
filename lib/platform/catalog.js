/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/**
 * Catalogue, availability and pricing resolution — SERVER ONLY (APP-033 … APP-036).
 *
 *   • The requested range is 99 performance models × 7 lengths = 693 variants, plus
 *     122 trainer weights. Grip and precision are separate dimensions, never stock counts.
 *     New length variants and trainer weights require confirmation; historical availability
 *     evidence is not inherited by a new configuration.
 *   • Availability states: made_to_order · in_stock · unavailable · requires_review, each with a
 *     source and an update time. Stock exists only where an administrator recorded it.
 *   • Price resolution walks the approved price book versions only; a miss is an explicit
 *     "unpriced" state that sends the quotation to review.
 */
import { series as SERIES, seriesList, precisionClasses, grips, sweetSpotTrainer, spotTrainer, standardLengths, isStandardLength, isTrainer, catalogueCounts, productDataVersion } from "../../data/products";
import { PRICE_BOOK_VERSIONS } from "../../data/pricing";
import { newId, hashPayload } from "./ids";
import { notFound, validationError } from "./errors";
import { auditWrites, mergeCommits } from "./audit";
import { timesQuantity } from "./money";

export const PRODUCT_KINDS = ["racquet", "sst", "spot"];

/** Deterministic SKU for a listed combination. Custom targets have no SKU (they are reviewed). */
export function skuFor({ productKind = "racquet", series, precisionLevel, weight, grip, lengthMode, lengthIn }) {
  if (lengthMode === "custom") return null;
  if (productKind === "racquet" && lengthIn != null) return null; // New geometry has a request key, not an assigned factory SKU.
  if (isTrainer(productKind) && ![270, 285, 300, 400].includes(weight)) return null;
  if (productKind === "sst") return `SST-${weight}-${grip}`;
  if (productKind === "spot") return `SPOT-${weight}-${grip}`;
  return `${String(series).toUpperCase()}-${precisionLevel}-${weight}-${grip}`;
}

export function catalogueSummary() {
  return {
    productDataVersion,
    series: seriesList.map((s) => ({ id: s.id, name: s.name, headSizeSqIn: s.headSizeSqIn, direction: s.direction, weights: s.matrix.map((p) => p.weight), lengths: standardLengths, balanceStatus: s.balanceStatus })),
    precisionClasses: precisionClasses.map((c) => ({ id: c.id, weightG: c.weightG, balanceMm: c.balanceMm, swingweightKgCm2: c.swingweightKgCm2, stiffness: c.stiffness })),
    exclusiveOption: { id: "ZERO", note: "agreed matching of instrument readings for mass; balance/swingweight only by written agreement; not a fourth class" },
    grips: grips.map((g) => g.id),
    trainers: { sst: sweetSpotTrainer.system, spot: spotTrainer.weights },
    targetRA: { min: 30, max: 90, default: null, examplesNotLimits: [67, 68, 69, 70, 71, 72, 73] },
    ...catalogueCounts,
    combinations: catalogueCounts.playingVariants * grips.length * precisionClasses.length,
    combinationDimensions: ["base model", "length", "grip", "precision class"],
    customLength: { status: "requires_technical_review", competitionEligibility: "not_confirmed" },
    combinationsAreStock: false,
  };
}

export function toleranceFor(precisionLevel) {
  const c = precisionClasses.find((x) => x.id === precisionLevel);
  if (!c) return null;
  return { weightG: c.weightG, balanceMm: c.balanceMm, swingweightKgCm2: c.swingweightKgCm2, stiffness: c.stiffness, source: "data/products.js precisionClasses" };
}

function scopeMatches(scope, line) {
  const eq = (a, b) => (Array.isArray(a) ? a.includes(b) : a === undefined || a === b);
  if (!eq(scope.productKind, line.productKind || "racquet")) return false;
  if (!eq(scope.series, line.series)) return false;
  if (!eq(scope.precisionLevel, line.precisionLevel)) return false;
  if (scope.mode && scope.mode !== line.mode) return false;
  if (scope.weight !== undefined && scope.weight !== line.weight) return false;
  if (scope.grip !== undefined && scope.grip !== line.grip) return false;
  if (scope.country !== undefined && scope.country !== line.country) return false;
  if (scope.quantityMin !== undefined && line.quantity < scope.quantityMin) return false;
  if (scope.quantityMax !== undefined && line.quantity > scope.quantityMax) return false;
  if (scope.personalisationTypes && !scope.personalisationTypes.includes(line.personalisationType || "none")) return false;
  return true;
}

function approvedTimestamp(value) {
  // Explicit UTC date boundaries or ISO instants with a timezone. Reject local-time parsing
  // and invalid calendar days that Date.parse would silently normalise (e.g. February 30).
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(?:T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) return NaN;
  const day = value.slice(0, 10);
  const midnight = Date.parse(`${day}T00:00:00Z`);
  if (!Number.isFinite(midnight) || new Date(midnight).toISOString().slice(0, 10) !== day) return NaN;
  return Date.parse(value);
}

function validityFailure(version, at) {
  if (!Number.isFinite(at)) return "price_clock_unavailable";
  for (const field of ["validFrom", "validUntil"]) {
    if (version[field] == null) continue;
    const boundary = approvedTimestamp(version[field]);
    if (!Number.isFinite(boundary)) return "price_validity_invalid";
    if (field === "validFrom" && at < boundary) return "price_not_yet_valid";
    // validUntil is an exclusive boundary; date-only boundaries are midnight UTC.
    if (field === "validUntil" && at >= boundary) return "price_expired";
  }
  return null;
}

function individualBindingFailure(version, line, getContext) {
  const binding = version.individualOrderBinding;
  const keys = ["customerUserId", "orderId", "configurationRevisionId"];
  if (!binding || keys.some((key) => typeof binding[key] !== "string" || !binding[key].trim()) || !/^[a-f0-9]{64}$/.test(binding.lineHash || "")) {
    return "individual_order_binding_required";
  }
  const context = getContext();
  // Context is obtained from the authenticated session and loaded server records, never line
  // claims. Hashing the whole approved line also binds engraving, RA and any additional fields.
  if (!context || context.userId !== binding.customerUserId || context.orderId !== binding.orderId || context.configurationRevisionId !== binding.configurationRevisionId || hashPayload(line) !== binding.lineHash) {
    return "individual_order_scope_mismatch";
  }
  return null;
}

/**
 * Server-only dependencies. getIndividualOrderContext must close over an authenticated session
 * and an authorised, loaded order/revision; do not supply request-body customer/order claims.
 * Each individual approval binds customerUserId, orderId, configurationRevisionId and the
 * hashPayload of its exact approved line. Missing binding never activates historical approvals.
 */
export function createPriceResolver({ priceBookVersions = PRICE_BOOK_VERSIONS, now = () => Date.now(), getIndividualOrderContext = () => null } = {}) {
  return function resolvePrice(line) {
    if (!line || !line.country) return { status: "unpriced", reason: "country_required" };
    if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0) return { status: "unpriced", reason: "quantity_positive_integer_required" };
    if (line.productKind === "sst" || line.productKind === "spot") return { status: "unpriced", reason: "trainer_price_not_in_p_grid" };
    if (line.mode === "custom" || line.raStatus === "out_of_range_custom_request") return { status: "review", reason: "custom_target_requires_review" };
    if (line.lengthMode === "custom" || line.lengthIn != null) return { status: "review", reason: "length_specification_requires_review" };
    const at = now();
    let blockedReason = null;
    for (const v of priceBookVersions) {
      if (v.status !== "approved" || !scopeMatches(v.scope, line)) continue;
      let reason = validityFailure(v, at);
      if (!reason) {
        if (v.scopeType === "individual_order") reason = individualBindingFailure(v, line, getIndividualOrderContext);
        else if (v.scopeType !== "catalogue") reason = "approved_scope_type_required";
      }
      if (reason) {
        blockedReason ||= reason;
        continue;
      }
      return { status: "priced", priceBookVersionId: v.id, unitCents: v.unitCents, totalCents: timesQuantity(v.unitCents, line.quantity), currency: v.currency, includes: v.includes, taxRegime: v.taxRegime, mandatoryRecipientChargeOnDelivery: v.mandatoryRecipientChargeOnDelivery };
    }
    const draft = priceBookVersions.find((v) => v.status !== "approved" && scopeMatches({ ...v.scope, country: undefined }, line));
    return { status: "unpriced", reason: blockedReason || (draft ? "only_draft_price_exists_not_approved" : "no_approved_price_for_scope") };
  };
}

/** Default resolution has no individual-order authorisation context. */
export const resolvePrice = createPriceResolver();

export function listPriceBookVersions() {
  return PRICE_BOOK_VERSIONS.map((v) => ({ id: v.id, status: v.status, title: v.title, approvalScope: v.approvalScope, scopeType: v.scopeType ?? null, currency: v.currency, scope: v.scope, unitCents: v.unitCents ?? null, proposedCents: v.proposedCents ?? null, validFrom: v.validFrom, validUntil: v.validUntil }));
}

export function createCatalog({ store, now = () => Date.now(), priceBookVersions = PRICE_BOOK_VERSIONS, getIndividualOrderContext = () => null }) {
  const iso = (ms) => new Date(ms).toISOString();
  const resolvePrice = createPriceResolver({ priceBookVersions, now, getIndividualOrderContext });

  /** Availability of one line, with its source. Stock records override the made-to-order default. */
  async function availability(line) {
    if (line.lengthMode === "custom" || (line.productKind !== "sst" && line.productKind !== "spot" && line.lengthIn != null)) {
      return { state: "requires_review", source: "requested length — technical and availability review", updatedAt: iso(now()) };
    }
    if (isTrainer(line.productKind) && ![270, 285, 300, 400].includes(line.weight)) {
      return { state: "requires_review", source: "trainer weight — availability not supplied", updatedAt: iso(now()) };
    }
    if (line.mode === "custom" || line.raStatus === "out_of_range_custom_request") {
      return { state: "requires_review", source: "custom target — technical review", updatedAt: iso(now()) };
    }
    if (line.productKind === "racquet") {
      const s = SERIES[line.series];
      if (!s || !s.matrix.some((p) => p.weight === line.weight)) return { state: "requires_review", source: "weight not in the listed matrix", updatedAt: iso(now()) };
    }
    const sku = skuFor(line);
    const stock = await store.get("stock", sku);
    if (stock && stock.doc.state) return { state: stock.doc.state, sku, available: stock.doc.available, reserved: stock.doc.reserved, source: stock.doc.source, updatedAt: stock.doc.updatedAt };
    return { state: "made_to_order", sku, source: `catalogue 3.2 p.5 — every listed combination is made to order; product data ${productDataVersion}`, updatedAt: iso(now()), leadTime: "90–120 working days after all start conditions" };
  }

  /** Administrator records stock for a SKU (source and time are mandatory). */
  async function setStock({ actor, sku, state, available, source }, { correlationId } = {}) {
    if (!["in_stock", "unavailable", "made_to_order"].includes(state)) throw validationError({ state: "invalid_choice" });
    if (state === "in_stock" && !(Number.isInteger(available) && available >= 0)) throw validationError({ available: "out_of_range" });
    if (!source) throw validationError({ source: "required" });
    const at = now();
    const cur = await store.get("stock", sku);
    const doc = { sku, state, available: state === "in_stock" ? available : 0, reserved: cur ? cur.doc.reserved || 0 : 0, source: String(source).slice(0, 200), updatedAt: iso(at), updatedBy: actor.userId };
    await store.commit(mergeCommits({ writes: [{ type: "stock", id: sku, doc, expectedVersion: cur ? cur.version : -1 }], indexes: [{ name: "stock:all", member: sku, score: at }] }, auditWrites({ now: at, actor, action: "stock.set", objectType: "stock", objectId: sku, correlationId, meta: { state, available } })));
    return doc;
  }

  /**
   * Reserves `quantity` units of an in-stock SKU for an order with a server-side TTL. Two buyers
   * racing for the last unit: the version check lets exactly one commit succeed.
   */
  async function reserve({ sku, quantity, orderId, ttlSeconds = 15 * 60 }) {
    const at = now();
    const cur = await store.get("stock", sku);
    if (!cur || cur.doc.state !== "in_stock") return { ok: false, reason: "not_in_stock" };
    const free = (cur.doc.available || 0) - (cur.doc.reserved || 0);
    if (free < quantity) return { ok: false, reason: "insufficient_stock", free };
    const id = newId("rsv");
    const reservation = { id, sku, quantity, orderId, createdAt: iso(at), expiresAt: iso(at + ttlSeconds * 1000), releasedAt: null, consumedAt: null };
    try {
      await store.commit({
        writes: [{ type: "stock", id: sku, doc: { ...cur.doc, reserved: (cur.doc.reserved || 0) + quantity, updatedAt: iso(at) }, expectedVersion: cur.version }, { type: "reservation", id, doc: reservation, expectedVersion: -1 }],
        indexes: [{ name: `reservations:sku:${sku}`, member: id, score: at }, { name: "reservations:open", member: id, score: Date.parse(reservation.expiresAt) }],
      });
    } catch (e) {
      if (e && e.code === "version_conflict") return { ok: false, reason: "contended_retry" };
      throw e;
    }
    return { ok: true, reservation };
  }

  async function release({ reservationId, consume = false }) {
    const r = await store.get("reservation", reservationId);
    if (!r || r.doc.releasedAt || r.doc.consumedAt) return { ok: false };
    const cur = await store.get("stock", r.doc.sku);
    const at = now();
    const stock = { ...cur.doc, reserved: Math.max(0, (cur.doc.reserved || 0) - r.doc.quantity), available: consume ? Math.max(0, cur.doc.available - r.doc.quantity) : cur.doc.available, updatedAt: iso(at) };
    await store.commit({
      writes: [{ type: "stock", id: r.doc.sku, doc: stock, expectedVersion: cur.version }, { type: "reservation", id: reservationId, doc: { ...r.doc, ...(consume ? { consumedAt: iso(at) } : { releasedAt: iso(at) }) }, expectedVersion: r.version }],
      unindexes: [{ name: "reservations:open", member: reservationId }],
    });
    return { ok: true };
  }

  /** Releases expired reservations (run from the scheduled job). */
  async function releaseExpired() {
    const ids = await store.listIndex("reservations:open", { limit: 100, reverse: false, maxScore: now() });
    let n = 0;
    for (const id of ids) {
      const r = await release({ reservationId: id });
      if (r.ok) n += 1;
    }
    return n;
  }

  return { catalogueSummary, skuFor, toleranceFor, resolvePrice, listPriceBookVersions, availability, setStock, reserve, release, releaseExpired };
}
