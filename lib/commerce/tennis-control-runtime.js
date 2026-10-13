/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/**
 * SERVER ONLY. Payment-control runtime: trusted owner authorization, one reserved attempt per
 * order, private session issuance to the verified owner only, and authenticated observation of
 * the gateway order. Nothing here marks an order paid from a browser value: payment evidence comes
 * exclusively from the authenticated Retrieve Order read (tennis-control-proof.js).
 *
 * Deployment configuration (server-only, never NEXT_PUBLIC_*):
 *   TENNIS_CONTROL_ENABLED=true          explicit switch for this runtime
 *   TENNIS_CONTROL_OWNER_EMAIL           the owner's verified account e-mail (trusted owner binding)
 *   NATIVE_MPGS_API_PASSWORD             the existing merchant API password (API 100, Basic auth)
 *   TENNIS_CONTROL_MERCHANT_ID           optional; defaults to the inspected store merchant
 *   TENNIS_CONTROL_MERCHANT_NAME         optional; defaults to the seller's legal name (<= 40 chars)
 *   MPGS_NOTIFICATION_SECRET             optional; the 32-character webhook secret from Merchant Administration
 *   PORTAL_ENABLED / PORTAL_RUNTIME_VERIFIED plus the KV and SMTP settings the portal already requires
 */
import { badRequest, forbidden, unavailable } from '../platform/errors';
import { getVerifiedPortalOrderContext } from '../platform/portal';
import { resolvePlatformStore } from '../platform/store';
import { readRestCredentials } from '../intake/store';
import { auditWrites, mergeCommits } from '../platform/audit';
import { COMMERCE_LEDGER_SELLER } from '../platform/commerce-ledger';
import { createTennisControlMpgsReader, NATIVE_MPGS_ORIGIN, NATIVE_MPGS_MERCHANT, NATIVE_MPGS_SCHEMA, MPGS_MERCHANT_ID } from '../platform/native-mpgs';
import { createTennisControlMpgsAdapter, TENNIS_CONTROL_PUBLIC_ORIGIN } from '../platform/tennis-control-mpgs';
import { createTennisControlOrderService, TENNIS_CONTROL_TYPES } from './tennis-control-order';
import { createTennisControlProofService } from './tennis-control-proof';
import { createTennisControlAuthorizer } from './tennis-control-authorizer';

export const TENNIS_CONTROL_RUNTIME_CONTRACT = 'tennis_control_runtime_v2';
export const TENNIS_CONTROL_EMBEDDED_CONTRACT = 'mpgs_hosted_checkout_embedded_v1';
/** Verified against the gateway's published API 100 Checkout SDK reference (unversioned URL, "100 (latest)"). */
export const TENNIS_CONTROL_SDK = Object.freeze({ url: `${NATIVE_MPGS_ORIGIN}/static/checkout/checkout.min.js`, version: '100', mount: 'showEmbeddedPage' });
export const TENNIS_CONTROL_WEBHOOK_PATH = '/api/control/webhook';
export const TENNIS_CONTROL_MERCHANT_CHECK_TYPE = 'tennisControlMerchantCheck';
export const TENNIS_CONTROL_PAYMENT_STATES = Object.freeze(['not_started', 'awaiting_payment', 'authentication_pending', 'pending', 'pending_verification', 'declined', 'cancelled', 'expired', 'uncertain', 'paid', 'partially_refunded', 'refunded', 'review_required']);
const MERCHANT_CHECK_TTL_MS = 6 * 60 * 60 * 1000;
const USER = /^usr_[0-9A-HJKMNP-TV-Z]{20}$/;
const exact = (input, fields) => {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !fields.includes(key))) throw badRequest('control_input_invalid');
};
const freeze = value => { if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; };

/** Names what is configured; values of secrets are never read into the result. */
export function readTennisControlConfig(env = process.env) {
  const missing = [];
  if (env.TENNIS_CONTROL_ENABLED !== 'true') missing.push('tennis_control_not_enabled');
  if (env.PORTAL_ENABLED !== 'true' || env.PORTAL_RUNTIME_VERIFIED !== 'true') missing.push('portal_runtime');
  const password = env.NATIVE_MPGS_API_PASSWORD;
  if (typeof password !== 'string' || password.length < 1 || password.length > 512 || /[^\x21-\x7e]/.test(password)) missing.push('mpgs_server_credentials');
  const ownerEmail = typeof env.TENNIS_CONTROL_OWNER_EMAIL === 'string' ? env.TENNIS_CONTROL_OWNER_EMAIL.trim() : '';
  if (!/^[^\s@]{1,64}@[^\s@]{1,255}$/.test(ownerEmail)) missing.push('control_owner_email');
  const merchantId = env.TENNIS_CONTROL_MERCHANT_ID === undefined || env.TENNIS_CONTROL_MERCHANT_ID === '' ? NATIVE_MPGS_MERCHANT : env.TENNIS_CONTROL_MERCHANT_ID;
  if (typeof merchantId !== 'string' || !MPGS_MERCHANT_ID.test(merchantId)) missing.push('merchant_id_invalid');
  const merchantName = env.TENNIS_CONTROL_MERCHANT_NAME === undefined || env.TENNIS_CONTROL_MERCHANT_NAME === '' ? COMMERCE_LEDGER_SELLER : env.TENNIS_CONTROL_MERCHANT_NAME;
  if (typeof merchantName !== 'string' || merchantName.length < 1 || merchantName.length > 40 || /[^\x20-\x7e]/.test(merchantName) || merchantName.trim() !== merchantName) missing.push('merchant_name_invalid');
  const secret = env.MPGS_NOTIFICATION_SECRET;
  const webhookConfigured = typeof secret === 'string' && secret.length === 32 && /^[\x21-\x7e]+$/.test(secret);
  if (secret !== undefined && secret !== '' && !webhookConfigured) missing.push('notification_secret_invalid');
  return { enabled: missing.length === 0, missing, ownerEmail, merchantId, merchantName, webhookConfigured, notificationUrl: webhookConfigured ? `${TENNIS_CONTROL_PUBLIC_ORIGIN}${TENNIS_CONTROL_WEBHOOK_PATH}` : null, password: missing.includes('mpgs_server_credentials') ? null : password, notificationSecret: webhookConfigured ? secret : null };
}

/** Owner-facing summary. Only the authenticated proof can say "paid"; everything else is observation. */
export function deriveTennisControlPayment({ order, proof, observation, now }) {
  if (proof) {
    if (proof.status === 'captured') return 'paid';
    if (proof.status === 'refunded') return 'refunded';
    if (proof.status === 'partially_refunded') return 'partially_refunded';
    if (proof.status === 'review_required') return 'review_required';
  }
  if (!order || order.status === 'issued') return 'not_started';
  if (order.status === 'review_required') return 'review_required';
  const deadlinePassed = order.localSessionDeadline !== null && Date.parse(order.localSessionDeadline) <= now;
  if (!observation) return order.status === 'uncertain' ? 'uncertain' : order.status === 'expired' ? 'expired' : 'pending';
  if (!observation.present) return order.status === 'uncertain' ? 'uncertain' : deadlinePassed ? 'expired' : 'awaiting_payment';
  if (!observation.currencyMatches || !observation.amountMatches) return 'review_required';
  const status = observation.orderStatus, last = observation.lastTransaction;
  if (status === 'CAPTURED' || status === 'PARTIALLY_REFUNDED' || status === 'REFUNDED') return 'pending_verification';
  if (status === 'FAILED' || status === 'AUTHENTICATION_UNSUCCESSFUL' || last?.result === 'FAILURE') return 'declined';
  if (status === 'CANCELLED') return 'cancelled';
  if (status.startsWith('AUTHENTICATION')) return 'authentication_pending';
  return 'pending';
}

/**
 * Explicit trusted dependencies only. `authorizer` binds the verified account to the configured
 * owner; `adapter` is the API 100 session/inquiry client; `reader` is the read-only order reader.
 */
export function createTennisControlRuntime({ store, authorizer, adapter, reader, authenticateCustomer, merchantId = NATIVE_MPGS_MERCHANT, webhookConfigured = false,
  now = () => Date.now(), production = process.env.NODE_ENV === 'production', merchantCheckTtlMs = MERCHANT_CHECK_TTL_MS } = {}) {
  if (typeof window !== 'undefined' || !store || typeof authorizer?.resolveAuthorizationReference !== 'function' || typeof authorizer.resolveAuthorization !== 'function' || typeof authorizer.inspect !== 'function' || typeof adapter?.initiate !== 'function' || typeof adapter.inquire !== 'function' || typeof reader?.readSummary !== 'function' || typeof authenticateCustomer !== 'function' || typeof now !== 'function') throw unavailable('control_runtime_dependencies_required');
  const orders = createTennisControlOrderService({ store, resolveAuthorization: authorizer.resolveAuthorization, merchantId, now, production,
    initiateSession: ({ attempt, locale, signal }) => adapter.initiate({ attempt, locale, signal }) });
  const proof = createTennisControlProofService({ store, orders, reader, merchantId, now, production });
  const readiness = freeze({ contract: TENNIS_CONTROL_RUNTIME_CONTRACT, preparationReady: true, observationReady: true, runtimeEnabled: true, initiationAvailable: true, rendererReady: true, financialProductEnabled: false, webhookConfigured, merchantId, sdk: { ...TENNIS_CONTROL_SDK }, embeddedContract: TENNIS_CONTROL_EMBEDDED_CONTRACT });

  function verifiedCtx(ctx) {
    if (!ctx || ctx.emailVerified !== true || ctx.organizationId !== 'maximus-tennis' || !USER.test(ctx.userId || '')) throw forbidden('control_verified_owner_required');
    return { userId: ctx.userId, organizationId: ctx.organizationId, emailVerified: true };
  }
  const publicCheck = d => freeze({ status: d.status, checkedAt: d.checkedAt, usdPermitted: d.status === 'ok' ? d.result.usdPermitted : null, cardPayments: d.status === 'ok' ? d.result.cardPayments : null, currencies: d.status === 'ok' ? [...d.result.currencies] : [], threeDSecureSchemes: d.status === 'ok' ? [...d.result.threeDSecureSchemes] : [] });

  /** Payment Options Inquiry, cached in the durable store. Owner-triggered, never per public request. */
  async function merchantCheck({ force = false, signal } = {}) {
    const row = await store.get(TENNIS_CONTROL_MERCHANT_CHECK_TYPE, merchantId);
    const fresh = row?.doc && Number.isFinite(Date.parse(row.doc.checkedAt)) && now() - Date.parse(row.doc.checkedAt) < merchantCheckTtlMs;
    if (row?.doc && fresh && !force && row.doc.status === 'ok') return publicCheck(row.doc);
    let doc;
    try {
      const result = await adapter.inquire({ ...(signal ? { signal } : {}) });
      if (result.merchantId !== merchantId) throw unavailable('control_merchant_inquiry_scope_invalid');
      doc = { id: merchantId, status: 'ok', checkedAt: new Date(now()).toISOString(), result: { cardPayments: result.cardPayments, currencies: result.currencies, threeDSecureSchemes: result.threeDSecureSchemes, usdPermitted: result.usdPermitted } };
    } catch { doc = { id: merchantId, status: 'unavailable', checkedAt: new Date(now()).toISOString(), result: null }; }
    try {
      await store.commit(mergeCommits({ writes: [{ type: TENNIS_CONTROL_MERCHANT_CHECK_TYPE, id: merchantId, expectedVersion: row?.version ?? -1, doc }] },
        auditWrites({ now: now(), actor: { kind: 'tennis_control_runtime' }, action: 'control.merchant_options_checked', objectType: 'merchant', objectId: merchantId, meta: { status: doc.status, usdPermitted: doc.result?.usdPermitted ?? null } })));
    } catch { /* A concurrent check already stored a result; this observation is still valid. */ }
    return publicCheck(doc);
  }

  async function prepare(input) {
    exact(input, ['ctx', 'idempotencyKey', 'termsVersion', 'signal']);
    if (input.signal?.aborted) throw badRequest('control_request_aborted');
    const ctx = verifiedCtx(input.ctx);
    // The authorizer binds the account to the configured owner; the order service rereads the grant.
    let reference;
    try { reference = await authorizer.resolveAuthorizationReference(ctx); }
    catch (error) { if (error?.status === 403) throw error; throw unavailable('control_authorizer_unavailable'); }
    if (input.signal?.aborted) throw badRequest('control_request_aborted');
    const result = await orders.issue({ ctx, authorizationReference: reference, idempotencyKey: input.idempotencyKey, termsVersion: input.termsVersion });
    return { duplicate: result.duplicate, order: result.order, proof: null };
  }

  /** Private session for the verified owner while the local attempt window is open; never in logs or markup. */
  async function sessionFor(ctx, orderId) {
    const record = await orders.readOwnRecord({ ctx, orderId });
    if (!record.attempt || !record.session || record.attempt.status !== 'session_created' || Date.parse(record.attempt.localSessionDeadline) <= now()) return null;
    return { contract: TENNIS_CONTROL_EMBEDDED_CONTRACT, serverVerified: true, sessionId: record.session.receipt.sessionId, gatewayOrigin: NATIVE_MPGS_ORIGIN, sdkUrl: TENNIS_CONTROL_SDK.url, sdkVersion: TENNIS_CONTROL_SDK.version, expiresAt: record.attempt.localSessionDeadline };
  }

  /** One reserved attempt per order; a repeated call returns the same live session or the attempt state. */
  async function initiate(input) {
    exact(input, ['ctx', 'orderId', 'locale', 'signal']);
    if (input.signal?.aborted) throw badRequest('control_request_aborted');
    const ctx = verifiedCtx(input.ctx);
    const before = await orders.readOwnRecord({ ctx, orderId: input.orderId });
    if (!before.attempt) {
      if (!(await authorizer.isOwner(ctx))) throw forbidden('control_owner_mismatch');
      // The acquirer's own permission list decides the currency. A definitive "no USD" blocks the
      // attempt; an unavailable inquiry leaves the decision to the session request itself.
      const check = await merchantCheck({ ...(input.signal ? { signal: input.signal } : {}) });
      if (check.usdPermitted === false) throw forbidden('control_currency_not_permitted');
    }
    const order = await orders.initiate({ ctx, orderId: input.orderId, locale: input.locale, ...(input.signal ? { signal: input.signal } : {}) });
    const session = order.status === 'session_created' ? await sessionFor(ctx, input.orderId) : null;
    return { order: await orders.getOwn({ ctx, orderId: input.orderId }), session };
  }

  /** Authenticated reads only; a browser return or callback never reaches this projection. */
  async function observe(ctx, orderId) {
    const record = await orders.readOwnRecord({ ctx, orderId });
    let observation = null, verified = null;
    if (record.attempt) {
      verified = await proof.inspect({ ctx, orderId });
      try {
        const w = await reader.readSummary({ providerOrderId: record.attempt.providerOrderId });
        // Provider identifiers stay server-side; only the sanitized outcome leaves this boundary.
        observation = w.present ? { present: true, observedAt: w.observedAt, orderStatus: w.orderStatus, currencyMatches: w.currencyMatches, amountMatches: w.amountMatches, transactionCount: w.transactionCount, lastTransaction: w.lastTransaction ? { ...w.lastTransaction } : null } : { present: false, observedAt: w.observedAt };
      } catch { observation = null; }
    }
    const order = await orders.getOwn({ ctx, orderId });
    return { order, proof: verified, observation, payment: deriveTennisControlPayment({ order, proof: verified, observation, now: now() }) };
  }
  async function status(input) {
    exact(input, ['ctx', 'orderId']);
    return observe(verifiedCtx(input.ctx), input.orderId);
  }

  /** Account page view: the owner's current control order, its state and whether a new one may open. */
  async function current(input) {
    exact(input, ['ctx']);
    const ctx = verifiedCtx(input.ctx);
    const view = await authorizer.inspect(ctx);
    if (!view.owner) return { owner: false };
    const base = { owner: true, series: view.series, canOpen: view.canOpen, terms: view.terms, webhookConfigured, order: null, proof: null, observation: null, payment: null };
    if (!view.orderId) return base;
    const observed = await observe(ctx, view.orderId);
    // The observation may have just stored a capture/refund proof: reread whether the series is spent.
    const after = await authorizer.inspect(ctx);
    return { ...base, canOpen: after.canOpen, series: after.series, ...observed };
  }

  async function readinessFor(input) {
    exact(input, ['ctx', 'signal']);
    const ctx = verifiedCtx(input.ctx);
    if (!(await authorizer.isOwner(ctx))) throw forbidden('control_owner_mismatch');
    const merchant = await merchantCheck({ ...(input.signal ? { signal: input.signal } : {}) });
    return { configured: true, merchant, webhookConfigured, merchantId, sdk: { ...TENNIS_CONTROL_SDK }, embeddedContract: TENNIS_CONTROL_EMBEDDED_CONTRACT, publicOrigin: TENNIS_CONTROL_PUBLIC_ORIGIN };
  }
  /**
   * Trusted server entry for the webhook receiver: verifies one control order through the same
   * authenticated reads as the owner's status call. The notification body is never an input here.
   */
  async function verify(input) {
    exact(input, ['orderId']);
    if (!/^MX-CTL-[0-9a-f]{32}$/.test(input.orderId || '')) throw badRequest('control_input_invalid');
    const row = await store.get(TENNIS_CONTROL_TYPES.order, input.orderId);
    if (!row || !USER.test(row.doc.ownerUserId || '')) throw badRequest('control_order_not_found');
    return observe({ userId: row.doc.ownerUserId, organizationId: 'maximus-tennis', emailVerified: true }, input.orderId);
  }
  const system = Object.freeze({ store, merchantId, verify });
  return Object.freeze({ service: Object.freeze({ readiness, prepare, initiate, status, current, readinessFor, merchantCheck, system }), authenticateCustomer });
}

/** Builds the runtime from protected configuration. Any missing gate returns service:null, never a fallback. */
export async function buildTennisControlRuntime(env = process.env, deps = {}) {
  const config = readTennisControlConfig(env);
  if (!config.enabled) return { service: null, authenticateCustomer: deps.authenticateCustomer || getVerifiedPortalOrderContext, missing: config.missing };
  const store = deps.store || resolvePlatformStore(env, { readRestCredentials });
  const production = env.NODE_ENV === 'production';
  if (!store || (production && store.kind !== 'upstash')) return { service: null, authenticateCustomer: deps.authenticateCustomer || getVerifiedPortalOrderContext, missing: ['durable_store'] };
  const fetchImpl = deps.fetchImpl || globalThis.fetch;
  const now = deps.now || (() => Date.now());
  const authorizer = createTennisControlAuthorizer({ store, ownerEmail: config.ownerEmail, now });
  const adapter = createTennisControlMpgsAdapter({ fetchImpl, password: config.password, merchantName: config.merchantName, merchantId: config.merchantId, ...(config.notificationUrl ? { notificationUrl: config.notificationUrl } : {}), now });
  const reader = createTennisControlMpgsReader({ origin: NATIVE_MPGS_ORIGIN, merchantId: config.merchantId, apiVersion: '100', schema: NATIVE_MPGS_SCHEMA, password: config.password, fetchImpl, now, timeoutMs: 6000 });
  return createTennisControlRuntime({ store, authorizer, adapter, reader, authenticateCustomer: deps.authenticateCustomer || getVerifiedPortalOrderContext, merchantId: config.merchantId, webhookConfigured: config.webhookConfigured, now, production });
}

// One runtime per process; a failed build is retried on the next request, never cached.
let runtimePromise = null;
export async function resolveTennisControlRuntime() {
  if (process.env.TENNIS_CONTROL_ENABLED !== 'true') return { service: null, authenticateCustomer: getVerifiedPortalOrderContext, missing: ['tennis_control_not_enabled'] };
  runtimePromise ||= buildTennisControlRuntime(process.env).then(runtime => { if (!runtime.service) runtimePromise = null; return runtime; }, error => { runtimePromise = null; throw error; });
  return runtimePromise;
}
