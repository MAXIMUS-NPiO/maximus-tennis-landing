/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import { configurationProducts as SERIES, isTrainer, isStandardLength } from "../../data/products";
import { CONFIG_PRODUCT_IDS, GRIP_IDS, CLASS_IDS, BASIS, SET_TYPES, USES, PTYPES } from "../intake/schema";
/** Shared browser serialization/persistence boundary. No contact or engraving storage. */
const DIGITS = /^\d{1,6}$/;
const isStr = (re) => (x) => typeof x === "string" && re.test(x);

export const PERSIST = {
  catalogueVersion: (x) => x === 3,
  series: (x) => CONFIG_PRODUCT_IDS.includes(x),
  lengthMode: (x) => x === "standard" || x === "custom",
  lengthIn: (x) => isStandardLength(x),
  customLengthIn: isStr(/^\d{1,3}(?:[.,]\d{0,3})?$/),
  cls: (x) => CLASS_IDS.includes(x),
  mode: (x) => x === "listed" || x === "custom",
  weight: (x) => Number.isInteger(x) && x > 0,
  customWeight: isStr(DIGITS),
  basis: (x) => BASIS.includes(x),
  balanceReq: isStr(DIGITS),
  sw: isStr(DIGITS),
  ra: isStr(DIGITS),
  grip: (x) => GRIP_IDS.includes(x),
  ptype: (x) => PTYPES.includes(x),
  setType: (x) => SET_TYPES.includes(x),
  sets: isStr(DIGITS),
  teamSize: isStr(DIGITS),
  use: (x) => USES.includes(x),
};

export const DEFAULTS = { catalogueVersion: 3, mode: "listed", ptype: "none", setType: "individual", sets: "1", lengthMode: "standard" };

const listed = (id) => (SERIES[id] ? SERIES[id].matrix.map((p) => p.weight) : []);

export function withSeries(c, id) {
  if (c.series === id) return { c, cleared: null };
  const out = { ...c, series: id, catalogueVersion: 3 };
  let cleared = null;
  if (c.weight && !listed(id).includes(Number(c.weight))) {
    cleared = c.weight;
    delete out.weight;
  }
  if (isTrainer(id)) {
    delete out.cls;
    delete out.customWeight;
    out.mode = "listed";
  }
  // A product change needs an explicit new length choice; never carry a silent 27-inch default.
  out.lengthMode = "standard";
  delete out.lengthIn;
  delete out.customLengthIn;
  return { c: out, cleared };
}

export function toPayload(c) {
  const blank = (x) => (x === undefined || x === null || String(x).trim() === "" ? undefined : x);
  return {
    series: c.series,
    catalogueVersion: 3,
    ...(isTrainer(c.series) ? {} : { cls: c.cls }),
    lengthMode: c.lengthMode,
    ...(c.lengthMode === "custom" ? { customLengthIn: blank(c.customLengthIn) } : { lengthIn: c.lengthIn }),
    mode: c.mode,
    ...(c.mode === "listed" ? { weight: c.weight } : { customWeight: blank(c.customWeight) }),
    basis: c.mode === "custom" ? "unstrung" : blank(c.basis),
    balanceReq: blank(c.balanceReq),
    sw: blank(c.sw),
    ra: blank(c.ra),
    grip: c.grip,
    ptype: c.ptype || "none",
    ...(c.ptype && c.ptype !== "none" ? { engraving: blank(c.engraving) } : {}),
    setType: c.setType,
    sets: blank(c.sets),
    ...(c.setType === "team" ? { teamSize: blank(c.teamSize) } : {}),
    use: c.use,
    notes: blank(c.notes),
  };
}
