/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/** Non-binding quote preferences. This module never resolves prices or creates payments. */
export const BUDGET_CURRENCIES = Object.freeze(['USD', 'EUR', 'AED']);
const blank = v => v == null || (typeof v === 'string' && !v.trim());
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
export function normalizeBudgetRequest(payload, { allowed = false, configuration } = {}) {
  const errors = {}, value = {};
  if (!own(payload, 'budgetRequest')) return { ok: true, errors, value };
  const b = payload.budgetRequest;
  if (!allowed || !b || typeof b !== 'object' || Array.isArray(b) || Object.keys(b).some(k => !['amount', 'currency', 'deliveryWishes', 'personalizationWishes'].includes(k))) {
    return { ok: false, value, errors: { budgetRequest: 'invalid' } };
  }
  const out = {};
  if (!blank(b.amount) || !blank(b.currency)) {
    // Decimal text only: avoid JSON number rounding and never treat a proposed budget as a price.
    if (typeof b.amount !== 'string' || !/^\d{1,18}(?:[.,]\d{1,2})?$/.test(b.amount.trim())) errors['budgetRequest.amount'] = 'invalid';
    else {
      const [whole, fraction = ''] = b.amount.trim().replace(',', '.').split('.');
      const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
      if (minor <= 0n) errors['budgetRequest.amount'] = 'out_of_range';
      else out.amount = `${BigInt(whole)}.${fraction.padEnd(2, '0')}`;
    }
    if (!BUDGET_CURRENCIES.includes(b.currency)) errors['budgetRequest.currency'] = 'invalid_choice';
    else out.currency = b.currency;
  }
  for (const key of ['deliveryWishes', 'personalizationWishes']) {
    if (blank(b[key])) continue;
    if (typeof b[key] !== 'string' || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(b[key])) errors[`budgetRequest.${key}`] = 'invalid';
    else if (b[key].length > 2000) errors[`budgetRequest.${key}`] = 'too_long';
    else out[key] = b[key].replace(/\r\n/g, '\n').trim();
  }
  if (Object.keys(out).length) value.budgetRequest = { ...out, configurationKey: configuration?.configurationKey || null, status: 'quote_requested' };
  return { ok: Object.keys(errors).length === 0, errors, value };
}
