/**
 * MAXIMUS product data — single numerical source for all locales.
 *
 * PRODUCT DATA VERSION: 2026-09-21 / master brief v4.0 Annex A
 *
 * Evidence-status vocabulary (internal; never rendered raw to visitors):
 *   FOUNDER_CONFIRMED   current Founder-confirmed specification
 *   MODELLED            calculated / modelled value (not an individual measurement)
 *   TARGET              approved manufacturing target
 *   NOT_PROVIDED        no reliable value available — omitted or collected as a request
 *
 * Nothing in this file is a price, stock level, delivery date, SKU or measured certificate.
 * Internal engineering formulas are deliberately NOT stored here.
 */

/** @typedef {{ weight: number, balance: number|null }} WeightPoint */

const MEASUREMENT_BASIS = {
  strungState: "NOT_PROVIDED",
  gripAndAccessoryState: "NOT_PROVIDED",
  nominalOrActual: "nominal",
  revision: "2026-09-21",
};

const pts = (pairs) => pairs.map(([weight, balance]) => ({ weight, balance }));

export const series = {
  great: {
    id: "great",
    name: "MAXIMUS GREAT SERIES",
    short: "GREAT",
    headSizeSqIn: 97,
    direction: "control",
    order: 1,
    balanceStatus: "MODELLED",
    matrixStatus: "FOUNDER_CONFIRMED",
    paramStatus: { weights: "confirmed", balance: "calculated", swingweight: "not_provided", stiffness: "not_provided" },
    measurementBasis: MEASUREMENT_BASIS,
    /** 32 listed weight points. Balances are calculated/modelled values (mm from the butt). */
    matrix: pts([
      [236, 343], [239, 342], [242, 342], [245, 341], [248, 341], [251, 340], [254, 340], [257, 339],
      [260, 339], [263, 338], [266, 338], [269, 337], [272, 337], [277, 336], [280, 336], [284, 335],
      [288, 334], [292, 334], [295, 333], [299, 333], [303, 332], [306, 331], [309, 331], [313, 330],
      [319, 329], [323, 329], [329, 328], [333, 327], [339, 326], [344, 325], [355, 323], [369, 321],
    ]),
  },
  power: {
    id: "power",
    name: "MAXIMUS POWER SERIES",
    short: "POWER",
    headSizeSqIn: 98,
    direction: "power",
    order: 2,
    balanceStatus: "MODELLED",
    matrixStatus: "FOUNDER_CONFIRMED",
    paramStatus: { weights: "confirmed", balance: "calculated", swingweight: "not_provided", stiffness: "not_provided" },
    measurementBasis: MEASUREMENT_BASIS,
    /** 33 listed weight points. Balances are calculated/modelled values (mm from the butt). */
    matrix: pts([
      [210, 347], [215, 346], [220, 345], [225, 345], [230, 344], [235, 343], [240, 342], [245, 341],
      [250, 340], [260, 339], [265, 338], [270, 337], [275, 336], [280, 336], [285, 335], [290, 334],
      [295, 333], [300, 332], [305, 332], [310, 331], [315, 330], [320, 329], [325, 328], [330, 327],
      [335, 327], [340, 326], [345, 325], [350, 324], [355, 323], [360, 323], [365, 322], [370, 321],
      [377, 320],
    ]),
  },
  spin: {
    id: "spin",
    name: "MAXIMUS SPIN SERIES",
    short: "SPIN",
    headSizeSqIn: 100,
    direction: "spin",
    order: 3,
    balanceStatus: "NOT_PROVIDED",
    /** Founder instruction 21.09.2026: SPIN keeps the status "requested weight architecture". */
    matrixStatus: "REQUESTED_ARCHITECTURE",
    paramStatus: { weights: "requested", balance: "not_provided", swingweight: "not_provided", stiffness: "not_provided" },
    measurementBasis: MEASUREMENT_BASIS,
    /** 29 weights of the requested weight architecture. Balance values: NOT PROVIDED. */
    matrix: pts([
      [239, null], [243, null], [247, null], [250, null], [253, null], [257, null], [260, null], [263, null],
      [267, null], [270, null], [273, null], [277, null], [280, null], [283, null], [287, null], [290, null],
      [294, null], [297, null], [300, null], [305, null], [310, null], [315, null], [320, null], [325, null],
      [330, null], [333, null], [339, null], [347, null], [355, null],
    ]),
  },
};

export const seriesList = Object.values(series).sort((a, b) => a.order - b.order);

/** Construction standard shared by all current performance racquets on this platform. */
export const construction = {
  structure: "fully-carbon-frame-and-handle",
  handleFormedWithFoam: false,
  gripGeometryPartOfCarbonStructure: true,
  status: "FOUNDER_CONFIRMED",
};

/** Four-parameter precision system. Stiffness values are manufacturing targets. */
export const precisionClasses = [
  {
    id: "P2.5",
    rank: 3,
    weightG: 2.5,
    balanceMm: 2.5,
    swingweightKgCm2: 2.5,
    stiffness: { kind: "target-tolerance", valueRA: 1 },
    qc: ["individual-measurement", "retained-production-records"],
    status: { tolerances: "FOUNDER_CONFIRMED", stiffness: "TARGET" },
  },
  {
    id: "P1.5",
    rank: 2,
    weightG: 1.5,
    balanceMm: 1.5,
    swingweightKgCm2: 1.5,
    stiffness: { kind: "target-tolerance", valueRA: 0.5 },
    qc: ["individual-measurement", "individual-records", "traceability"],
    status: { tolerances: "FOUNDER_CONFIRMED", stiffness: "TARGET" },
  },
  {
    id: "P0.5",
    rank: 1,
    weightG: 0.5,
    balanceMm: 0.5,
    swingweightKgCm2: 0.5,
    stiffness: { kind: "exact-declared-reading", valueRA: null },
    qc: [
      "unique-serial-identity",
      "nominal-and-actual-values",
      "individual-measurement-records",
      "batch-traceability",
      "precision-certificate",
      "matched-sets-where-implemented",
    ],
    status: { tolerances: "FOUNDER_CONFIRMED", stiffness: "TARGET" },
  },
];

export const precisionParameters = ["weight", "balance", "swingweight", "stiffness"];

/** Eight factory grip sizes. Nominal designations; raw handle dimensions and measurement protocol are separate. */
export const grips = [
  { id: "L0", inches: "4", fraction: "" },
  { id: "L1", inches: "4", fraction: "⅛" },
  { id: "L2", inches: "4", fraction: "¼" },
  { id: "L3", inches: "4", fraction: "⅜" },
  { id: "L4", inches: "4", fraction: "½" },
  { id: "L5", inches: "4", fraction: "⅝" },
  { id: "L6", inches: "4", fraction: "¾" },
  { id: "L7", inches: "4", fraction: "⅞" },
];

/** Sweet Spot Trainer — separate training category with its own production standard. */
export const sweetSpotTrainer = {
  id: "sst",
  headSizeSqIn: 50,
  lengthIn: 27,
  stringPattern: "12 × 14",
  grips: "L0–L7",
  /** Four-racquet system: weight (g) — balance (mm). Supplied values; measurement basis NOT PROVIDED. */
  system: [
    { weight: 270, balance: 330 },
    { weight: 285, balance: 325 },
    { weight: 300, balance: 325 },
    { weight: 400, balance: 320 },
  ],
  precisionClassesApply: false,
  productionTolerances: "NOT_PROVIDED",
  measurementBasis: MEASUREMENT_BASIS,
  status: "FOUNDER_CONFIRMED",
};

/** Spot Trainer — contact-point training with a small round contact target. */
export const spotTrainer = {
  id: "spot",
  targetDimensions: "NOT_PROVIDED",
  weights: [270, 285, 300, 400],
  balances: "NOT_PROVIDED",
  stringPattern: "NOT_PROVIDED",
  grips: "L0–L7",
  precisionClassesApply: false,
  status: "FOUNDER_CONFIRMED",
};

/** Approved development directions — no saleable products, no transferred tennis specifications. */
export const otherRacquetSports = ["padel", "pickleball", "squash", "badminton", "racquetball", "beachTennis"];

/** Additional technical parameters the data model supports. No values or tolerance classes exist yet. */
export const extendedParameters = [
  "twistweight",
  "torsionalBehaviour",
  "length",
  "beamProfile",
  "headGeometry",
  "stringPattern",
  "durability",
  "vibration",
];

/**
 * Parameter registry for performance series. A confirmed value is added here per series with
 * { value, unit, status: "confirmed", source, revision }. Until then every entry stays
 * NOT_PROVIDED and nothing is rendered or inferred. No public tolerance is introduced here.
 */
export const PARAMETER_KEYS = [
  "geometry", "length", "beam", "stringPattern", "twistweight", "torsionalBehaviour", "layup",
  "durability", "vibration", "gripGeometry", "cosmetics", "engraving", "serialisation",
];
export const seriesParameters = Object.fromEntries(
  ["great", "power", "spin"].map((id) => [id, Object.fromEntries(PARAMETER_KEYS.map((k) => [k, { value: null, status: "NOT_PROVIDED" }]))])
);

export const productDataVersion = "2026-09-21.B";

export function getSeries(id) {
  return series[id] || null;
}

export function listedWeights(id) {
  const s = getSeries(id);
  return s ? s.matrix.map((p) => p.weight) : [];
}

export function balanceFor(id, weight) {
  const s = getSeries(id);
  if (!s) return null;
  const p = s.matrix.find((x) => x.weight === Number(weight));
  return p ? p.balance : null;
}
