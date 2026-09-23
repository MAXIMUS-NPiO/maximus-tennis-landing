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
    balanceStatus: "FOUNDER_CONFIRMED",
    matrixStatus: "FOUNDER_CONFIRMED",
    paramStatus: { weights: "confirmed", balance: "confirmed", swingweight: "not_provided", stiffness: "not_provided" },
    measurementBasis: { ...MEASUREMENT_BASIS, revision: "2026-09-23" },
    /**
     * 33 listed weight points, Founder instruction 23.09.2026. Weight in grams, balance in millimetres
     * from the butt. Transferred literally from the Founder's table; balances are NOT calculated here
     * and are not smoothed between neighbouring weights. Each pair also matches the value printed on the
     * approved Spin visualisation of that weight (checked file by file, 33 of 33).
     */
    matrix: pts([
      [222, 339], [229, 338], [233, 337], [236, 336], [239, 335], [243, 335], [247, 335], [250, 335],
      [253, 335], [257, 330], [260, 330], [263, 330], [267, 325], [270, 325], [273, 325], [277, 325],
      [280, 328], [283, 331], [287, 335], [290, 335], [294, 334], [297, 330], [315, 330], [320, 330],
      [325, 330], [330, 330], [333, 330], [339, 330], [347, 330], [355, 330], [360, 325], [366, 320],
      [377, 315],
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
