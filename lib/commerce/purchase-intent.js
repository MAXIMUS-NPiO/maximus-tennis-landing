/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/** Browser-safe request validation. A request for terms never approves or funds a program. */
import { parseAmount } from '../platform/money';

export const PURCHASE_INTENTS = Object.freeze(['goods_only', 'goods_with_program_interest']);
export const PROGRAM_REQUEST_CURRENCIES = Object.freeze(['EUR', 'AED', 'USD']);
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const CLAIM_FIELDS = ['rateBps', 'termsAccepted', 'enrolled', 'approved', 'programApproved', 'approvedBy', 'programTerms', 'accountTerms', 'financing'];

/** Omitted fields stay omitted for legacy lead hashes; order intake asks for the explicit default. */
export function normalizePurchaseRequest(payload, { defaultIntent = false, allowed = true } = {}) {
  const p = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  const errors = {}, value = {};
  const hasIntent = own(p, 'purchaseIntent'), hasRequest = own(p, 'programRequest');
  for (const key of CLAIM_FIELDS) if (own(p, key)) errors[key] = 'invalid';
  if (!allowed && (hasIntent || hasRequest)) {
    errors.purchaseIntent = 'invalid';
    return { ok: false, value, errors };
  }
  if ((hasIntent || hasRequest) && own(p, 'plan') && p.plan !== 'A') errors.purchaseIntent = 'invalid';
  const intent = hasIntent ? p.purchaseIntent : 'goods_only';
  if (!PURCHASE_INTENTS.includes(intent)) errors.purchaseIntent = 'invalid_choice';
  if (hasIntent || defaultIntent) value.purchaseIntent = intent;
  if (hasRequest && intent !== 'goods_with_program_interest') errors.programRequest = 'invalid';
  if (intent === 'goods_with_program_interest') {
    value.programRequest = { status: 'terms_requested' };
    if (hasRequest) {
      const request = p.programRequest;
      const plain = request && typeof request === 'object' && !Array.isArray(request)
        && [Object.prototype, null].includes(Object.getPrototypeOf(request));
      if (!plain || Object.keys(request).length !== 2 || !own(request, 'principal') || !own(request, 'currency')) {
        errors.programRequest = 'invalid';
      } else {
        // Decimal text preserves the user's exact amount before any JSON number rounding.
        const amount = typeof request.principal === 'string' ? parseAmount(request.principal) : { ok: false, code: 'not_number' };
        if (!amount.ok && amount.code !== 'unsafe_magnitude') errors['programRequest.principal'] = amount.code;
        if (!PROGRAM_REQUEST_CURRENCIES.includes(request.currency)) errors['programRequest.currency'] = 'invalid_choice';
        if ((amount.ok || amount.code === 'unsafe_magnitude') && PROGRAM_REQUEST_CURRENCIES.includes(request.currency)) {
          value.programRequest = { status: 'terms_requested', requestedPrincipalMinor: amount.ok ? amount.cents.toString() : amount.exact, currency: request.currency };
        }
      }
    }
  }
  return { ok: Object.keys(errors).length === 0, value, errors };
}
