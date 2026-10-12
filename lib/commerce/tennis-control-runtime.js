/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/** SERVER ONLY. Prepared control-order/read-only assembly; no live checkout, SDK or session POST. */
import { badRequest, forbidden, unavailable } from '../platform/errors';
import { getVerifiedPortalOrderContext } from '../platform/portal';
import { createTennisControlOrderService } from './tennis-control-order';
import { createTennisControlProofService } from './tennis-control-proof';

export const TENNIS_CONTROL_RUNTIME_CONTRACT = 'tennis_control_preparation_v1';
const exact = (input, fields) => {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !fields.includes(key))) throw badRequest('control_input_invalid');
};

/** Environment flags alone never install a grant, merchant evidence, reader or renderer. */
export async function resolveTennisControlRuntime() {
  return { service: null, authenticateCustomer: getVerifiedPortalOrderContext };
}

/**
 * Explicit trusted dependencies only. The reference resolver binds a verified account to an
 * existing authorization; it must not infer authority from a browser value or an email match.
 * Preparing an order is not initiating payment. There is deliberately no initiate operation.
 */
export function createTennisControlRuntime({ store, resolveAuthorization, resolveAuthorizationReference,
  reader, authenticateCustomer, now = () => Date.now(), production = process.env.NODE_ENV === 'production' } = {}) {
  if (typeof window !== 'undefined' || typeof resolveAuthorizationReference !== 'function' || typeof authenticateCustomer !== 'function' || typeof now !== 'function') throw unavailable('control_runtime_dependencies_required');
  const orders = createTennisControlOrderService({ store, resolveAuthorization, now, production });
  const proof = createTennisControlProofService({ store, orders, reader, now, production });
  const readiness = Object.freeze({ contract: TENNIS_CONTROL_RUNTIME_CONTRACT, preparationReady: true, observationReady: true,
    runtimeEnabled: false, initiationAvailable: false, rendererReady: false, financialProductEnabled: false });
  async function prepare(input) {
    exact(input, ['ctx', 'idempotencyKey', 'termsVersion', 'signal']);
    if (input.signal?.aborted) throw badRequest('control_request_aborted');
    const ctx = input.ctx;
    if (!ctx || ctx.emailVerified !== true || ctx.organizationId !== 'maximus-tennis' || !/^usr_[0-9A-HJKMNP-TV-Z]{20}$/.test(ctx.userId || '')) throw forbidden('control_verified_owner_required');
    // The order service independently rereads the active user, membership and exact grant.
    let reference;
    try { reference = await resolveAuthorizationReference(ctx && { userId: ctx.userId, organizationId: ctx.organizationId, emailVerified: ctx.emailVerified }); }
    catch { throw unavailable('control_authorizer_unavailable'); }
    if (input.signal?.aborted) throw badRequest('control_request_aborted');
    const result = await orders.issue({ ctx, authorizationReference: reference, idempotencyKey: input.idempotencyKey, termsVersion: input.termsVersion });
    return { duplicate: result.duplicate, order: result.order, proof: null };
  }
  async function status(input) {
    exact(input, ['ctx', 'orderId']);
    const record = await orders.readOwnRecord(input);
    // An unreserved order has no provider ID. Never discover arbitrary merchant orders.
    const observation = record.attempt ? await proof.inspect(input) : null;
    const order = await orders.getOwn(input); // Owner/account may have been revoked during I/O.
    return { order, proof: observation };
  }
  return Object.freeze({ service: Object.freeze({ readiness, prepare, status }), authenticateCustomer });
}
