/**
 * Shared request schema — used by the browser (render + pre-validation) and by the server
 * (authoritative validation). Pure JavaScript, no Node-only imports.
 *
 * Every accepted field is declared here with its type, limits and allowed values.
 * Anything not declared is dropped. Error codes are stable strings translated in content/*.js.
 */
import { series as SERIES, grips, precisionClasses } from "../../data/products";

export const PURPOSES = [
  "selection", "fitting", "technical", "config", "gps", "product", "coach", "club", "distribution",
  "brand", "family", "institutional", "strategic", "owner", "network", "general",
];

export const ROLES = ["player", "parent", "coach", "club", "retailer", "distributor", "brand", "investor", "institution", "other"];
export const LEVELS = ["beginner", "developing", "intermediate", "advanced", "competitive", "professional"];
export const OBJECTIVES = ["control", "power", "spin", "comfort", "manoeuvrability", "development", "competition", "training", "team", "personal"];
export const INTERESTS = ["training", "fitting", "identity", "programmes", "brand", "supply", "team", "personalisation", "development", "service", "network"];
export const AGE_BANDS = ["u10", "u14", "u18", "adult"];
export const YES_NO = ["yes", "no", "unknown"];
export const STRATEGIC_AREAS = ["engineering", "configuration", "manufacturing", "routes", "ip", "expansion"];
export const OWNER_TYPES = ["setup", "service", "records", "other"];
export const SPORTS = ["tennis", "padel", "pickleball", "squash", "badminton", "other"];
export const STYLES = ["baseline", "allcourt", "attacking", "defensive", "coach", "unknown"];
export const GPS_ROLES = ["player", "parent", "coach", "club", "other"];
export const BASIS = ["unstrung", "strung", "unknown"];
export const SET_TYPES = ["individual", "pair", "triple", "team"];
export const USES = ["play", "competition", "coaching", "team", "retail", "other"];
export const PTYPES = ["none", "name", "initials", "number", "academy", "team"];
export const SERIES_IDS = Object.keys(SERIES);
export const GRIP_IDS = grips.map((g) => g.id);
export const CLASS_IDS = precisionClasses.map((c) => c.id);

/** Racquets per set for each set type (team size is supplied by the requester). */
export const SET_SIZE = { individual: 1, pair: 2, triple: 3 };

/**
 * Input sanity bounds for requested numeric targets. These reject impossible input only;
 * they are NOT statements of production capability — feasibility is assessed in technical review.
 */
export const TARGET_BOUNDS = {
  customWeight: [100, 600],
  balanceReq: [200, 450],
  sw: [150, 500],
  ra: [30, 90],
  sets: [1, 9999],
  teamSize: [4, 99],
  players: [1, 100000],
  quantity: [1, 100000],
};

const t = (max, o = {}) => ({ type: "text", max, ...o });
const ta = (max, o = {}) => ({ type: "textarea", max, ...o });
const en = (values, o = {}) => ({ type: "enum", values, ...o });
const multi = (values, max, o = {}) => ({ type: "multi", values, max, ...o });
const int = (key, o = {}) => ({ type: "int", min: TARGET_BOUNDS[key][0], max: TARGET_BOUNDS[key][1], ...o });

/** Fields common to every request. */
export const COMMON = {
  name: t(120, { required: true, autocomplete: "name" }),
  email: { type: "email", max: 254, required: true, autocomplete: "email" },
  role: en(ROLES, { required: true }),
  country: t(80, { required: true, min: 2, autocomplete: "country-name" }),
  organisation: t(160, { autocomplete: "organization" }),
  message: ta(4000),
};

const ORG_REQUIRED = new Set(["club", "distribution", "institutional", "strategic"]);
const MESSAGE_REQUIRED = new Set(["general"]);

/** Purpose-specific fields, in display order. */
export const EXTRA = {
  selection: {
    level: en(LEVELS, { required: true }),
    objectives: multi(OBJECTIVES, 3),
    currentRacquet: t(200),
    grip: en([...GRIP_IDS, "unknown"]),
    coachInvolved: en(YES_NO),
  },
  fitting: { city: t(120), coachInvolved: en(YES_NO), timing: t(120) },
  technical: {
    targets: ta(2000, { required: true }),
    limits: ta(2000),
    use: t(300, { required: true }),
    tradeoffs: ta(2000),
    basis: en(BASIS),
  },
  product: { seriesInterest: en(SERIES_IDS), quantity: int("quantity") },
  coach: { players: int("players"), interests: multi(INTERESTS, INTERESTS.length) },
  club: { players: int("players"), interests: multi(INTERESTS, INTERESTS.length) },
  distribution: { territory: t(200, { required: true }), channels: ta(2000) },
  brand: { audience: t(300), proposal: ta(2000, { required: true }) },
  family: {
    goal: ta(1000, { required: true }),
    level: en(LEVELS),
    coachInvolved: en(YES_NO),
    ageBand: en(AGE_BANDS),
  },
  institutional: { scope: ta(2000, { required: true }) },
  strategic: { interestArea: en(STRATEGIC_AREAS) },
  owner: { productRef: t(120), requestType: en(OWNER_TYPES) },
  network: { seeking: ta(2000, { required: true }) },
  general: {},
  gps: {},
  config: {},
};

export function fieldsFor(purpose) {
  const common = { ...COMMON };
  common.organisation = { ...common.organisation, required: ORG_REQUIRED.has(purpose) };
  common.message = { ...common.message, required: MESSAGE_REQUIRED.has(purpose) };
  return { common, extra: EXTRA[purpose] || {} };
}

/* ------------------------------------------------------------------ validators */

const EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const LINEBREAK_RE = /[\r\n\u2028\u2029]/;
const LATIN_ENGRAVING_RE = /^[A-Za-z0-9 .'\-]+$/;

function isBlank(v) {
  return v === undefined || v === null || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);
}

/** Strict integer parsing: whole numbers only, no signs, no decimals, no exponent. */
export function parseStrictInt(raw) {
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return { error: "not_number" };
    if (!Number.isInteger(raw)) return { error: "decimal_not_supported" };
    return { value: raw };
  }
  if (typeof raw !== "string") return { error: "not_number" };
  const s = raw.trim();
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    return Number.isSafeInteger(n) ? { value: n } : { error: "out_of_range" };
  }
  if (/^-?\d*[.,]\d+$/.test(s)) return { error: "decimal_not_supported" };
  if (/^-\d+$/.test(s)) return { error: "out_of_range" };
  return { error: "not_number" };
}

function checkField(spec, raw) {
  if (isBlank(raw)) return spec.required ? { error: "required" } : { value: undefined };
  switch (spec.type) {
    case "text":
    case "textarea": {
      if (typeof raw !== "string") return { error: "invalid" };
      const v = spec.type === "text" ? raw.trim() : raw.replace(/\r\n/g, "\n").trim();
      if (CONTROL_RE.test(v)) return { error: "invalid" };
      if (spec.type === "text" && LINEBREAK_RE.test(v)) return { error: "invalid" };
      if (v.length > spec.max) return { error: "too_long" };
      if (spec.min && v.length < spec.min) return { error: "too_short" };
      return { value: v };
    }
    case "email": {
      if (typeof raw !== "string") return { error: "invalid_email" };
      const v = raw.trim();
      if (v.length > spec.max || !EMAIL_RE.test(v)) return { error: "invalid_email" };
      return { value: v };
    }
    case "enum": {
      if (typeof raw !== "string" || !spec.values.includes(raw)) return { error: "invalid_choice" };
      return { value: raw };
    }
    case "multi": {
      if (!Array.isArray(raw)) return { error: "invalid_choice" };
      const uniq = [...new Set(raw)];
      if (uniq.some((x) => typeof x !== "string" || !spec.values.includes(x))) return { error: "invalid_choice" };
      if (uniq.length > spec.max) return { error: "too_many" };
      return { value: uniq };
    }
    case "int": {
      const p = parseStrictInt(raw);
      if (p.error) return p;
      if (p.value < spec.min || p.value > spec.max) return { error: "out_of_range" };
      return { value: p.value };
    }
    default:
      return { error: "invalid" };
  }
}

function checkGroup(specs, input, out, errors, prefix = "") {
  for (const [key, spec] of Object.entries(specs)) {
    const r = checkField(spec, input ? input[key] : undefined);
    if (r.error) errors[prefix + key] = r.error;
    else if (r.value !== undefined) out[key] = r.value;
  }
}

/* ------------------------------------------------------------------ configuration */

export function totalRacquets(cfg) {
  if (!cfg || !cfg.setType || !cfg.sets) return null;
  if (cfg.setType === "team") return cfg.teamSize ? cfg.sets * cfg.teamSize : null;
  return cfg.sets * SET_SIZE[cfg.setType];
}

/**
 * Validates a racquet configuration request. Listed weights must belong to the exact matrix of
 * the selected series; a custom weight is a requested target in whole grams.
 */
export function validateConfig(input) {
  const errors = {};
  const out = {};
  const c = input && typeof input === "object" ? input : {};
  const spec = {
    series: en(SERIES_IDS, { required: true }),
    cls: en(CLASS_IDS, { required: true }),
    mode: en(["listed", "custom"], { required: true }),
    grip: en(GRIP_IDS, { required: true }),
    basis: en(BASIS),
    ptype: en(PTYPES),
    setType: en(SET_TYPES, { required: true }),
    use: en(USES, { required: true }),
    notes: ta(2000),
  };
  checkGroup(spec, c, out, errors, "config.");
  const s = out.series ? SERIES[out.series] : null;

  if (out.mode === "listed") {
    const r = checkField({ type: "int", min: 1, max: 100000, required: true }, c.weight);
    if (r.error) errors["config.weight"] = r.error;
    else if (s && !s.matrix.some((p) => p.weight === r.value)) errors["config.weight"] = "not_in_matrix";
    else out.weight = r.value;
  } else if (out.mode === "custom") {
    const r = checkField(int("customWeight", { required: true }), c.customWeight);
    if (r.error) errors["config.customWeight"] = r.error;
    else out.customWeight = r.value;
  }

  for (const key of ["balanceReq", "sw", "ra"]) {
    const r = checkField(int(key), c[key]);
    if (r.error) errors[`config.${key}`] = r.error;
    else if (r.value !== undefined) out[key] = r.value;
  }
  const requestedTargets = out.mode === "custom" || out.balanceReq || out.sw || out.ra;
  if (requestedTargets && !out.basis) errors["config.basis"] = "required";

  const ptype = out.ptype || "none";
  out.ptype = ptype;
  if (ptype !== "none") {
    const r = checkField(t(24, { required: true }), c.engraving);
    if (r.error) errors["config.engraving"] = r.error;
    else {
      out.engraving = r.value;
      out.engravingArtworkReview = !LATIN_ENGRAVING_RE.test(r.value);
    }
  }

  const sets = checkField(int("sets", { required: true }), c.sets);
  if (sets.error) errors["config.sets"] = sets.error;
  else out.sets = sets.value;
  if (out.setType === "team") {
    const ts = checkField(int("teamSize", { required: true }), c.teamSize);
    if (ts.error) errors["config.teamSize"] = ts.error;
    else out.teamSize = ts.value;
  }
  const total = totalRacquets(out);
  if (total !== null) {
    if (total > TARGET_BOUNDS.quantity[1]) errors["config.sets"] = "out_of_range";
    else out.racquetsTotal = total;
  }
  return { ok: Object.keys(errors).length === 0, value: out, errors };
}

/* ------------------------------------------------------------------ GPS profile */

export const GPS_RULES_VERSION = "gps-direction-v2";

/** Declared playing-direction mapping — tennis only. Other sports never receive a tennis series. */
export function gpsDirections(profile) {
  if (!profile || profile.sport !== "tennis") return [];
  const objectives = profile.objectives || [];
  return SERIES_IDS.filter((id) => objectives.includes(SERIES[id].direction));
}

export function validateGpsProfile(input) {
  const errors = {};
  const out = {};
  const spec = {
    role: en(GPS_ROLES, { required: true }),
    sport: en(SPORTS, { required: true }),
    experience: en(LEVELS, { required: true }),
    objectives: multi(OBJECTIVES, 3, { required: true }),
    style: en(STYLES),
    equipment: t(200),
    grip: en(GRIP_IDS),
    preference: t(200),
    coach: en(YES_NO, { required: true }),
    ageBand: en(AGE_BANDS),
  };
  checkGroup(spec, input || {}, out, errors, "profile.");
  if (out.ageBand && out.role !== "parent") delete out.ageBand;
  out.directions = gpsDirections(out);
  out.rulesVersion = GPS_RULES_VERSION;
  return { ok: Object.keys(errors).length === 0, value: out, errors };
}

/* ------------------------------------------------------------------ attribution */

export const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
export const CLICK_ID_KEYS = ["gclid", "gbraid", "wbraid", "fbclid", "msclkid", "ttclid"];
const UTM_RE = /^[\p{L}\p{N} ._~+\-:/|%()]{1,100}$/u;
const CLICK_RE = /^[A-Za-z0-9_\-.]{1,200}$/;
const PATH_RE = /^\/[A-Za-z0-9/_\-]{0,199}$/;

export function sanitizeAttribution(input) {
  const out = {};
  if (!input || typeof input !== "object") return out;
  if (typeof input.landing_path === "string" && PATH_RE.test(input.landing_path)) out.landing_path = input.landing_path;
  if (typeof input.locale === "string" && ["en", "ru", "zh"].includes(input.locale)) out.locale = input.locale;
  for (const k of UTM_KEYS) if (typeof input[k] === "string" && UTM_RE.test(input[k])) out[k] = input[k];
  for (const k of CLICK_ID_KEYS) if (typeof input[k] === "string" && CLICK_RE.test(input[k])) out[k] = input[k];
  return out;
}

/* ------------------------------------------------------------------ full request */

export const IDEMPOTENCY_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validates a complete request payload:
 * { purpose, locale, fields: { ...common, ...extra }, config?, profile?, consent: true }
 */
export function validateRequest(payload) {
  const errors = {};
  const value = {};
  const p = payload && typeof payload === "object" ? payload : {};
  if (!PURPOSES.includes(p.purpose)) return { ok: false, errors: { purpose: "invalid_choice" }, value };
  value.purpose = p.purpose;
  value.locale = ["en", "ru", "zh"].includes(p.locale) ? p.locale : "en";

  const { common, extra } = fieldsFor(p.purpose);
  const fields = p.fields && typeof p.fields === "object" ? p.fields : {};
  const contact = {};
  checkGroup(common, fields, contact, errors);
  const details = {};
  checkGroup(extra, fields, details, errors);
  value.contact = contact;
  value.details = details;

  if (p.purpose === "config") {
    const r = validateConfig(p.config);
    Object.assign(errors, r.errors);
    value.config = r.value;
  }
  if (p.purpose === "gps") {
    const r = validateGpsProfile(p.profile);
    Object.assign(errors, r.errors);
    value.profile = r.value;
  }
  if (p.consent !== true) errors.consent = "consent_required";
  return { ok: Object.keys(errors).length === 0, value, errors };
}
