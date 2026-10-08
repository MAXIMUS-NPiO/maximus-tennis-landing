/**
 * Family Plan — the calculation module.
 *
 * Transferred from the verified MAXIMUS Baby Tennis Family Plan (version 15) as specified in the
 * Founder's implementation brief of 7 October 2026. The arithmetic below is the brief's contract,
 * term for term. Nothing here estimates a child's ability, a career, a sporting result, a saving
 * or a medical effect: it turns the family's own inputs into sessions, hours, ball contacts and
 * cost. Every money figure comes from a number the family typed in.
 *
 * Pure and framework-free: the page, the tests and any future server use share this one module.
 * Values travel as the raw strings the fields hold, so an empty field is a missing value and is
 * never silently read as 0 (the defect of Number('') in the source).
 *
 * Adaptations of the transfer, each covered by its own test and declared in the release notes:
 *  - session length is shown exactly (45 min = 0.75 h, not 0.8 h);
 *  - the months field is required: empty is an error, an explicit 0 is valid;
 *  - player-sessions per year and per period are shown, as the Founder asked;
 *  - the whole plan is saved and restored as one versioned record.
 */

export const SCENARIOS = ["now", "planned", "wish"];
export const CURRENCIES = ["USD", "EUR", "GBP", "RUB"];
export const HORIZONS = [1, 2, 3, 4, 5, 10];
export const DURATION_PRESETS = [30, 45, 60, 75, 90];
export const QUOTE_SOURCE_MAX = 200;

/** Scenario fields: P players, C cost of one session of one player, F sessions a month,
 *  D minutes per session, B ball contacts per player per session. */
export const SCENARIO_FIELDS = ["players", "cost", "sessions", "minutes", "contacts"];
export const EXTRA_FIELDS = ["equipment", "clothing", "renewal", "court", "travel"];
export const ONE_OFF_EXTRAS = ["equipment", "clothing", "renewal"];
export const MONTHLY_EXTRAS = ["court", "travel"];

const blankScenario = () => ({ players: "0", cost: "0", sessions: "0", minutes: "0", contacts: "0" });

/** Defaults of version 15: USD, the planned scenario, zero everywhere, first step. */
export function defaultPlan() {
  return {
    currency: "USD",
    scenarios: { now: blankScenario(), planned: blankScenario(), wish: blankScenario() },
    start: "0",
    end: "0",
    selected: "planned",
    months: "0",
    extras: { equipment: "0", clothing: "0", renewal: "0", court: "0", travel: "0" },
    quoteSource: "",
    quoteDate: "",
    step: 0,
  };
}

// ---------------------------------------------------------------------------------------------
// Parsing. Integers are whole non-negative numbers written with digits only; minutes may carry a
// decimal part, written with a point or a comma. Anything else is rejected with a reason.
// ---------------------------------------------------------------------------------------------

const INT_RE = /^\d+$/;
const DEC_RE = /^\d+(?:[.,]\d+)?$/;

function parseInt0(raw) {
  const s = String(raw ?? "").trim();
  if (s === "") return { error: "required" };
  if (s.startsWith("-")) return { error: "negative" };
  if (!INT_RE.test(s)) return { error: DEC_RE.test(s) ? "integer" : "number" };
  const n = Number(s);
  if (!Number.isSafeInteger(n)) return { error: "tooLarge" };
  return { value: n };
}

function parseDecimal(raw) {
  const s = String(raw ?? "").trim();
  if (s === "") return { error: "required" };
  if (s.startsWith("-")) return { error: "negative" };
  if (!DEC_RE.test(s)) return { error: "number" };
  const n = Number(s.replace(",", "."));
  if (!Number.isFinite(n)) return { error: "tooLarge" };
  return { value: n };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validates the whole plan — every scenario, including the ones not selected, because an error
 * anywhere blocks the result. Returns parsed numbers, or the list of fields to correct.
 */
export function parsePlan(raw) {
  const errors = [];
  const add = (path, code) => errors.push({ path, code });
  const take = (path, r) => {
    if (r.error) { add(path, r.error); return null; }
    return r.value;
  };

  const currency = CURRENCIES.includes(raw?.currency) ? raw.currency : null;
  if (!currency) add("currency", "currency");
  const selected = SCENARIOS.includes(raw?.selected) ? raw.selected : null;
  if (!selected) add("selected", "scenario");

  const scenarios = {};
  for (const id of SCENARIOS) {
    const s = raw?.scenarios?.[id] || {};
    scenarios[id] = {
      players: take(`scenarios.${id}.players`, parseInt0(s.players)),
      cost: take(`scenarios.${id}.cost`, parseInt0(s.cost)),
      sessions: take(`scenarios.${id}.sessions`, parseInt0(s.sessions)),
      minutes: take(`scenarios.${id}.minutes`, parseDecimal(s.minutes)),
      contacts: take(`scenarios.${id}.contacts`, parseInt0(s.contacts)),
    };
  }

  const start = take("start", parseInt0(raw?.start));
  const end = take("end", parseInt0(raw?.end));
  if (start !== null && end !== null && end < start) add("end", "endBeforeStart");
  const months = take("months", parseInt0(raw?.months));

  const extras = {};
  for (const k of EXTRA_FIELDS) extras[k] = take(`extras.${k}`, parseInt0(raw?.extras?.[k]));

  const quoteSource = String(raw?.quoteSource ?? "");
  if (quoteSource.length > QUOTE_SOURCE_MAX) add("quoteSource", "tooLong");
  const quoteDate = String(raw?.quoteDate ?? "");
  if (quoteDate && !DATE_RE.test(quoteDate)) add("quoteDate", "date");

  if (errors.length) return { ok: false, errors };
  return { ok: true, errors: [], values: { currency, selected, scenarios, start, end, months, extras, quoteSource, quoteDate } };
}

// ---------------------------------------------------------------------------------------------
// Arithmetic — the contract of §6 of the brief. No intermediate rounding.
// ---------------------------------------------------------------------------------------------

/** One scenario over Y years. Unit costs depend only on C, D and B, never on P or F. */
export function scenarioOver(s, years) {
  const playerSessions = s.players * s.sessions * 12 * years;
  return {
    playerSessions,
    trainingCost: playerSessions * s.cost,
    contacts: playerSessions * s.contacts,
    playerHours: (playerSessions * s.minutes) / 60,
    costPerContact: s.contacts > 0 ? s.cost / s.contacts : null,
    costPerHour: s.minutes > 0 ? (s.cost * 60) / s.minutes : null,
  };
}

/** The six horizons. Active years are capped by the age span; ages never touch the final M. */
export function longTermPlan(annualTrainingCost, start, end) {
  const ageSpan = end - start;
  return HORIZONS.map((horizon) => {
    const activeYears = Math.min(horizon, ageSpan);
    return { horizon, activeYears, cost: annualTrainingCost * activeYears };
  });
}

/** The final calculation for the selected scenario over M months. Extras are for the family
 *  as a whole and are never multiplied by the number of players. One-off items are charged once,
 *  even when M is 0 — the behaviour of the source, kept and explained on the page. */
export function finalCalculation(s, months, extras) {
  const oneOffCosts = extras.equipment + extras.clothing + extras.renewal;
  const monthlyExtraCosts = extras.court + extras.travel;
  const extraCosts = oneOffCosts + months * monthlyExtraCosts;
  const playerSessions = s.players * s.sessions * months;
  const trainingCost = playerSessions * s.cost;
  return {
    months,
    oneOffCosts,
    monthlyExtraCosts,
    extraCosts,
    playerSessions,
    trainingCost,
    total: trainingCost + extraCosts,
    playerHours: (playerSessions * s.minutes) / 60,
    contacts: playerSessions * s.contacts,
  };
}

/** Every integer result must stay a safe integer and every fraction finite; otherwise the page
 *  reports that the numbers are too large instead of printing a plausible rounded figure. */
function representable(obj) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === null) continue;
    if (typeof v === "object") { if (!representable(v)) return false; continue; }
    if (typeof v !== "number" || !Number.isFinite(v)) return false;
    const fractional = k === "playerHours" || k === "costPerContact" || k === "costPerHour";
    if (!fractional && !Number.isSafeInteger(v)) return false;
  }
  return true;
}

/** The whole plan in one call: what the page renders and what the tests check. */
export function computePlan(raw) {
  const parsed = parsePlan(raw);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };
  const v = parsed.values;
  const annual = {};
  const longTerm = {};
  for (const id of SCENARIOS) {
    annual[id] = scenarioOver(v.scenarios[id], 1);
    longTerm[id] = longTermPlan(annual[id].trainingCost, v.start, v.end);
  }
  const final = finalCalculation(v.scenarios[v.selected], v.months, v.extras);
  const result = { ok: true, errors: [], values: v, annual, longTerm, final };
  if (!representable({ annual, longTerm, final })) {
    return { ok: false, errors: [{ path: "result", code: "tooLarge" }] };
  }
  return result;
}

// ---------------------------------------------------------------------------------------------
// Display. Arithmetic never uses these: they only format what the module has already computed.
// Latin digits in every language, as on the rest of the site; separators follow the language.
// ---------------------------------------------------------------------------------------------

const nf = (locale, opts) => new Intl.NumberFormat(locale, { numberingSystem: "latn", ...opts });

/** Annual and long-term money: whole units, no fraction. */
export function money(locale, currency, value) {
  return nf(locale, { style: "currency", currency, maximumFractionDigits: 0, minimumFractionDigits: 0 }).format(value);
}

/** Final money: at most two decimals. */
export function moneyFinal(locale, currency, value) {
  return nf(locale, { style: "currency", currency, maximumFractionDigits: 2, minimumFractionDigits: 0 }).format(value);
}

/** Unit prices: two to four decimals; a positive price below the last shown digit is written as
 *  "less than 0.0001" rather than as a false zero. Returns { text, below } so the page can word it. */
export function unitPrice(locale, currency, value) {
  if (value === null) return null;
  if (value > 0 && value < 0.0001) {
    return { below: true, text: nf(locale, { style: "currency", currency, minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(0.0001) };
  }
  return { below: false, text: nf(locale, { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(value) };
}

/** Plain counts (sessions, contacts). */
export function count(locale, value) {
  return nf(locale, { maximumFractionDigits: 0 }).format(value);
}

/** Hours of play: up to one decimal in the annual table, up to two in the final calculation. */
export function hours(locale, value, maxDigits = 1) {
  return nf(locale, { maximumFractionDigits: maxDigits }).format(value);
}

/**
 * Length of one session in hours, exact where it can be: 45 min is 0.75 h and 75 min is 1.25 h.
 * When D/60 has more than four decimals the shown figure is rounded, and the page marks it as
 * approximate. Returns { text, approx }.
 */
export function sessionHours(locale, minutes) {
  const h = minutes / 60;
  const rounded = Math.round(h * 10000) / 10000;
  return { text: nf(locale, { maximumFractionDigits: 4 }).format(rounded), approx: Math.abs(rounded - h) > 1e-12 };
}

// ---------------------------------------------------------------------------------------------
// Saving on this device. One versioned record under a maximus.tennis key; a record that fails
// any check is not applied in part and is not replaced by zeros.
// ---------------------------------------------------------------------------------------------

export const STORAGE_KEY = "maximus.tennis.familyPlan";
export const STORAGE_VERSION = 1;

/** The record that is written: the whole plan, as the fields hold it, plus the current step. */
export function serialise(plan) {
  return JSON.stringify({ v: STORAGE_VERSION, plan });
}

/**
 * Reads a saved record. Returns { status: "none" } when nothing is saved, { status: "ok", plan }
 * when the record is complete and valid, and { status: "invalid" } otherwise — corrupt JSON, an
 * unknown version, a missing field or a value the calculator would reject.
 */
export function restore(text) {
  if (text === null || text === undefined || text === "") return { status: "none" };
  let data;
  try { data = JSON.parse(text); } catch { return { status: "invalid" }; }
  if (!data || data.v !== STORAGE_VERSION || typeof data.plan !== "object" || data.plan === null) return { status: "invalid" };
  const p = data.plan;
  const str = (x) => typeof x === "string";
  if (!str(p.currency) || !str(p.selected) || !str(p.start) || !str(p.end) || !str(p.months)) return { status: "invalid" };
  if (!str(p.quoteSource) || !str(p.quoteDate)) return { status: "invalid" };
  for (const id of SCENARIOS) {
    const s = p.scenarios?.[id];
    if (!s) return { status: "invalid" };
    for (const f of SCENARIO_FIELDS) if (!str(s[f])) return { status: "invalid" };
  }
  for (const k of EXTRA_FIELDS) if (!str(p.extras?.[k])) return { status: "invalid" };
  if (!Number.isInteger(p.step) || p.step < 0 || p.step > 3) return { status: "invalid" };
  if (!parsePlan(p).ok) return { status: "invalid" };
  const plan = {
    currency: p.currency,
    scenarios: Object.fromEntries(SCENARIOS.map((id) => [id, Object.fromEntries(SCENARIO_FIELDS.map((f) => [f, p.scenarios[id][f]]))])),
    start: p.start, end: p.end, selected: p.selected, months: p.months,
    extras: Object.fromEntries(EXTRA_FIELDS.map((k) => [k, p.extras[k]])),
    quoteSource: p.quoteSource, quoteDate: p.quoteDate, step: p.step,
  };
  return { status: "ok", plan };
}

/**
 * The working copy kept for this browser tab, so that switching language does not lose what the
 * family is typing. Unlike a saved plan it may hold a value the calculator rejects — a half-typed
 * number is still the family's input — so only its shape is checked; the calculator then shows the
 * same field errors it would show for typed input. It lives in sessionStorage and ends with the tab.
 */
export const DRAFT_KEY = "maximus.tennis.familyPlan.draft";

export function restoreDraft(text) {
  if (text === null || text === undefined || text === "") return { status: "none" };
  let data;
  try { data = JSON.parse(text); } catch { return { status: "invalid" }; }
  if (!data || data.v !== STORAGE_VERSION || typeof data.plan !== "object" || data.plan === null) return { status: "invalid" };
  const p = data.plan;
  const str = (x) => typeof x === "string" && x.length <= 400;
  if (!["currency", "selected", "start", "end", "months", "quoteSource", "quoteDate"].every((k) => str(p[k]))) return { status: "invalid" };
  for (const id of SCENARIOS) for (const f of SCENARIO_FIELDS) if (!str(p.scenarios?.[id]?.[f])) return { status: "invalid" };
  for (const k of EXTRA_FIELDS) if (!str(p.extras?.[k])) return { status: "invalid" };
  if (!Number.isInteger(p.step) || p.step < 0 || p.step > 3) return { status: "invalid" };
  return {
    status: "ok",
    plan: {
      currency: p.currency,
      scenarios: Object.fromEntries(SCENARIOS.map((id) => [id, Object.fromEntries(SCENARIO_FIELDS.map((f) => [f, p.scenarios[id][f]]))])),
      start: p.start, end: p.end, selected: p.selected, months: p.months,
      extras: Object.fromEntries(EXTRA_FIELDS.map((k) => [k, p.extras[k]])),
      quoteSource: p.quoteSource, quoteDate: p.quoteDate, step: p.step,
    },
  };
}
