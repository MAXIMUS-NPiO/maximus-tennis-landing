/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/** Calculation-only Contribution / Bonus Account. Never a cash interest promise.
 * Principal, locked, available and spent are separate. No withdrawals/early exit rules.
 */
const integer = x => Number.isSafeInteger(x) && x >= 0;
export function contributionSnapshot({ principalMinor, currency, years, mode, startDate }) {
  if (!integer(principalMinor) || principalMinor <= 0 || !/^[A-Z]{3}$/.test(currency) || !integer(years) || years < 1 || years > 50 || !['prepaid', 'postpaid'].includes(mode) || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !Number.isFinite(Date.parse(`${startDate}T00:00:00Z`))) throw new Error('invalid_contribution');
  const rateBasisPoints = mode === 'postpaid' ? 2000 : 1000;
  // Simple annual rate, never compounded. Reject sub-cent rather than silently round.
  const annualMinor = principalMinor * rateBasisPoints / 10000;
  const totalBonusMinor = annualMinor * years;
  if (!integer(annualMinor) || !integer(totalBonusMinor)) throw new Error('fractional_or_unsafe_bonus');
  const schedule = [];
  const start = new Date(`${startDate}T00:00:00Z`);
  if (start.toISOString().slice(0, 10) !== startDate) throw new Error('invalid_contribution_date');
  for (let year = 1; year <= years; year++) {
    const targetYear = start.getUTCFullYear() + year;
    const month = start.getUTCMonth();
    const maxDay = new Date(Date.UTC(targetYear, month + 1, 0)).getUTCDate();
    schedule.push({ year, date: new Date(Date.UTC(targetYear, month, Math.min(start.getUTCDate(), maxDay))).toISOString().slice(0, 10), unlockMinor: mode === 'postpaid' ? annualMinor : 0 });
  }
  return Object.freeze({ version: 'contribution-draft-2026-10-09', mode, principalMinor, currency, years, startDate,
    rateBasisPoints, annualMinor, totalBonusMinor, schedule: Object.freeze(schedule.map(Object.freeze)), status: 'calculation_only', withdrawals: null, earlyTermination: null });
}
export function accountBalances(snapshot, { asOf, spentMinor = 0 } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf || '') || !Number.isFinite(Date.parse(`${asOf}T00:00:00Z`)) || new Date(`${asOf}T00:00:00Z`).toISOString().slice(0,10) !== asOf || !integer(spentMinor)) throw new Error('invalid_balance');
  const unlocked = asOf < snapshot.startDate ? 0 : snapshot.mode === 'prepaid' ? snapshot.totalBonusMinor : snapshot.schedule.filter(x => x.date <= asOf).reduce((n, x) => n + x.unlockMinor, 0);
  if (spentMinor > unlocked) throw new Error('bonus_overspend');
  return { contribution: { principal: snapshot.principalMinor }, bonus: { locked: snapshot.totalBonusMinor - unlocked, available: unlocked - spentMinor, spent: spentMinor }, currency: snapshot.currency, calculationOnly: true };
}
