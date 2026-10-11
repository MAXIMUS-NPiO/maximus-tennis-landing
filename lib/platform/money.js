/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/**
 * Money and the A / B / C calculator — SERVER-SIDE SINGLE SOURCE OF TRUTH.
 *
 * Every amount is an integer number of minor units (EUR cents) carried as a BigInt inside this
 * module and returned as a Number when it is safe, or as a decimal string when it is not. Rates are
 * basis points (10% = 1000 bps). Nothing here uses floating point for a financial total.
 *
 * The formulae are the ones of the full prompt (sections 1, 4, 9 and 12 of the baseline and
 * APP-041): A: cashNow = O; B: cashNow = O + F, deferred product credit F × b; C: G = F × a,
 * U = min(G, O), T = max(O − G, 0), cashNow = F + T, surplus = G − U; the principal stays F.
 *
 * ROUNDING. No rounding policy is approved by the owner (CALCULATION_EXAMPLES M07). The policy
 * below is therefore explicit, versioned and flagged as a proposal; the identifier is written into
 * every snapshot so that a later decision changes nothing already issued.
 */

export const CURRENCY = "EUR";
export const RATE_BASIS = 10000n;

export const ROUNDING_POLICY = Object.freeze({
  id: "half-up-cents-v1",
  description: "product of cents × bps divided by 10000, rounded half up to the nearest cent",
  status: "proposed_not_approved",
});

/** The example rates of the confirmed Feste reference. They are NOT a general policy (APP-041). */
export const EXAMPLE_RATES = Object.freeze({
  id: "feste-example-2026-10-08",
  C_upfrontCreditBps: 1000,
  B_deferredCreditBps: 2000,
  status: "confirmed_example_generalized_policy_inactive",
});

export const MAX_SAFE_CENTS = BigInt(Number.MAX_SAFE_INTEGER);

/**
 * Accepted written form: digits, optional thousands groups separated by a space, optional decimal
 * part of one or two digits after "." or ",". Commas and dots are never read as thousands
 * separators: "1.001" is three decimals and is refused, not read as one thousand and one.
 */
const DECIMAL_RE = /^(\d+(?:[  ]\d{3})*)(?:[.,](\d+))?$/;

/**
 * Parses a user-entered amount ("6000", "6 000,50", "1250.00") into cents.
 * Returns { ok: true, cents } where cents is a BigInt, or { ok: false, code, raw }.
 * Codes: required · not_number · not_positive · too_many_decimals · unsafe_magnitude (route to
 * manual review while keeping the original text, never silently rounded — M09).
 */
export function parseAmount(raw) {
  if (raw === undefined || raw === null) return { ok: false, code: "required", raw };
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return { ok: false, code: "not_number", raw: String(raw) };
    raw = String(raw);
  }
  if (typeof raw !== "string") return { ok: false, code: "not_number", raw: String(raw) };
  const s = raw.trim();
  if (s === "") return { ok: false, code: "required", raw: s };
  if (s.startsWith("-")) return { ok: false, code: "not_positive", raw: s };
  const m = DECIMAL_RE.exec(s);
  if (!m) return { ok: false, code: "not_number", raw: s };
  if (m[2] && m[2].length > 2) return { ok: false, code: "too_many_decimals", raw: s };
  const whole = m[1].replace(/[  ]/g, "");
  const frac = (m[2] || "").padEnd(2, "0");
  let cents;
  try {
    cents = BigInt(whole) * 100n + BigInt(frac);
  } catch {
    return { ok: false, code: "not_number", raw: s };
  }
  if (cents <= 0n) return { ok: false, code: "not_positive", raw: s };
  if (cents > MAX_SAFE_CENTS) return { ok: false, code: "unsafe_magnitude", raw: s, exact: cents.toString() };
  return { ok: true, cents, raw: s };
}

export function toBig(v, name = "amount") {
  if (typeof v === "bigint") return v;
  if (typeof v === "number") {
    if (!Number.isSafeInteger(v)) throw new RangeError(`${name} must be a safe integer number of cents`);
    return BigInt(v);
  }
  if (typeof v === "string" && /^-?\d+$/.test(v)) return BigInt(v);
  throw new TypeError(`${name} must be an integer number of cents`);
}

/** cents × bps / 10000 under the explicit rounding policy. */
export function applyBps(cents, bps, policy = ROUNDING_POLICY.id) {
  const c = toBig(cents, "cents");
  const b = toBig(bps, "bps");
  if (c < 0n || b < 0n) throw new RangeError("negative values are not accepted");
  const num = c * b;
  if (policy !== "half-up-cents-v1") throw new Error(`unknown rounding policy ${policy}`);
  const q = num / RATE_BASIS;
  const r = num % RATE_BASIS;
  return r * 2n >= RATE_BASIS ? q + 1n : q;
}

/** Number when safe, decimal string otherwise (never a rounded float). */
export function out(big) {
  return big <= MAX_SAFE_CENTS && big >= -MAX_SAFE_CENTS ? Number(big) : big.toString();
}

const min = (a, b) => (a < b ? a : b);
const max = (a, b) => (a > b ? a : b);

/**
 * Calculates one option. `O` is the approved all-inclusive goods total in cents, `F` the principal
 * the customer enters (cents). Rates are bps. Returns a plain snapshot with the exact keys of
 * CALCULATION_EXAMPLES.json plus `rounding` and `option`.
 */
export function calculate({ option, O, F = 0, aBps = EXAMPLE_RATES.C_upfrontCreditBps, bBps = EXAMPLE_RATES.B_deferredCreditBps, roundingPolicy = ROUNDING_POLICY.id }) {
  const o = toBig(O, "O");
  const f = toBig(F, "F");
  if (o < 0n || f < 0n) throw new RangeError("O and F must not be negative");
  const base = { option, currency: CURRENCY, O_cents: out(o), rounding: roundingPolicy };
  if (option === "A") {
    return { ...base, F_cents: 0, cashNow_cents: out(o), goodsPaidWithCash_cents: out(o), principal_cents: 0, creditNow_cents: 0, deferredProductCredit_cents: 0, principalDueAtOneYear_cents: 0, secondCreditAtOneYear_cents: 0, cashReturn720000Allowed: false };
  }
  if (option === "B") {
    if (f === 0n) throw new RangeError("option B requires a positive F");
    const deferred = applyBps(f, bBps, roundingPolicy);
    return {
      ...base, F_cents: out(f), b_bps: Number(bBps),
      cashNow_cents: out(o + f), goodsPaidWithCash_cents: out(o), principal_cents: out(f), creditNow_cents: 0,
      deferredProductCredit_cents: out(deferred), principalDueAtOneYear_cents: out(f), secondCreditAtOneYear_cents: 0,
      cashReturn720000Allowed: false,
    };
  }
  if (option === "C") {
    if (f === 0n) throw new RangeError("option C requires a positive F");
    const G = applyBps(f, aBps, roundingPolicy);
    const U = min(G, o);
    const T = max(o - G, 0n);
    const surplus = G - U;
    return {
      ...base, F_cents: out(f), a_bps: Number(aBps),
      G_cents: out(G), U_cents: out(U), T_cents: out(T), cashNow_cents: out(f + T), goodsPaidWithCash_cents: out(T),
      principal_cents: out(f), creditNow_cents: out(U), surplus_cents: out(surplus), deferredProductCredit_cents: 0,
      principalDueAtOneYear_cents: out(f), secondCreditAtOneYear_cents: 0,
      surplusPolicyRequired: surplus > 0n, livePaymentAllowedWithoutSurplusPolicy: false, cashSurplusPayoutPromised: false,
    };
  }
  throw new RangeError(`unknown option ${option}`);
}

/** The three quotations of one proposal, always in the order A, B, C. */
export function offerTriplet({ O, F, aBps, bBps, roundingPolicy }) {
  const A = calculate({ option: "A", O, roundingPolicy });
  const hasF = F !== undefined && F !== null && toBig(F, "F") > 0n;
  const B = hasF ? calculate({ option: "B", O, F, bBps, roundingPolicy }) : { option: "B", currency: CURRENCY, O_cents: A.O_cents, requiresPrincipal: true };
  const C = hasF ? calculate({ option: "C", O, F, aBps, roundingPolicy }) : { option: "C", currency: CURRENCY, O_cents: A.O_cents, requiresPrincipal: true };
  return { order: ["A", "B", "C"], A, B, C, rates: { aBps: Number(aBps ?? EXAMPLE_RATES.C_upfrontCreditBps), bBps: Number(bBps ?? EXAMPLE_RATES.B_deferredCreditBps), ratesId: EXAMPLE_RATES.id, ratesStatus: EXAMPLE_RATES.status } };
}

/** "6 600,00 EUR" style formatting for documents and the cabinet; locale decides the separators. */
export function formatCents(cents, locale = "en", currency = CURRENCY) {
  const big = toBig(cents, "cents");
  const neg = big < 0n;
  const abs = neg ? -big : big;
  const whole = (abs / 100n).toString();
  const frac = (abs % 100n).toString().padStart(2, "0");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, locale === "en" ? "," : " ");
  const dec = locale === "en" ? "." : ",";
  return `${neg ? "−" : ""}${currency} ${grouped}${dec}${frac}`;
}

/** Sum of an array of cent values (numbers or strings) as a Number/string pair. */
export function sumCents(values) {
  let total = 0n;
  for (const v of values) total += toBig(v, "value");
  return out(total);
}

/** Multiplies a unit price by a quantity without overflow surprises. */
export function timesQuantity(unitCents, quantity) {
  if (!Number.isInteger(quantity) || quantity < 1) throw new RangeError("quantity must be a positive integer");
  return out(toBig(unitCents, "unitCents") * BigInt(quantity));
}
