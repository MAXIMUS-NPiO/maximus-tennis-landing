/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/**
 * SERVER ONLY. Direct Tennis payment verification/staging, with no default runtime or transport.
 * Reuses approvedGoodsContract and the read-only native-mpgs projection. It does not impersonate
 * CS-Cart, post to a ledger, change an order to paid, execute a refund or enable financial products.
 * All arguments are private server dependencies; no HTTP endpoint accepts an attestation here.
 */
import { approvedGoodsContract } from '../platform/native-bindings';
import { NATIVE_MPGS_SCHEMA } from '../platform/native-mpgs';
import { hashPayload } from '../platform/ids';
import { auditWrites, mergeCommits } from '../platform/audit';
import { badRequest, conflict, forbidden, notFound, unavailable } from '../platform/errors';
import { normalizeTennisCheckoutRoute, TENNIS_CHECKOUT_TYPE, TENNIS_EMBEDDED_CONTRACT } from './tennis-checkout';

export const TENNIS_RECONCILIATION_TYPES = Object.freeze({ binding: 'tennisPaymentBinding', state: 'tennisPaymentReconciliation', movement: 'tennisPaymentMovement' });
const EVIDENCE = [['featureEvidenceId', 'merchant_hosted_checkout_feature'], ['originEvidenceId', 'approved_tennis_origin'], ['sessionSchemaEvidenceId', 'mpgs_checkout_session_schema'], ['sdkEvidenceId', 'mpgs_embedded_sdk_contract'], ['threeDsEvidenceId', 'mpgs_3ds_return_behavior']];
const INTENT_FIELDS = ['id', 'routeHash', 'projectId', 'organizationId', 'orderId', 'customerUserId', 'correlation', 'providerOrderId', 'snapshotHash', 'approvalHash', 'configurationHash', 'totalMinor', 'currency', 'quantity', 'termsVersion', 'termsAcceptedAt', 'offerExpiresAt', 'locale', 'attemptedAt'];
const MOVEMENT_FIELDS = ['providerOrderId', 'transactionId', 'kind', 'amountMinor', 'currency', 'totalMinor', 'capturedMinor', 'refundedMinor', 'occurredAt', 'merchantId'];
const PROOF_FIELDS = ['status', 'authenticationBasis', 'mode', 'kind', 'approval', 'routeHash', 'intentId', 'commerceOrderId', 'customerUserId', 'providerOrderId', 'correlation', 'snapshotHash', 'approvalHash', 'configurationHash', 'totalMinor', 'currency', 'merchantId', 'termsVersion', 'termsAcceptedAt', 'evidenceId', 'verifiedAt'];
const pick = (value, fields) => Object.fromEntries(fields.map(key => [key, value[key]]));
const opaque = value => typeof value === 'string' && value.length > 0 && value.length <= 200 && !/[\u0000-\u001f\u007f]/.test(value);
const minor = value => typeof value === 'string' && /^(0|[1-9]\d{0,29})$/.test(value);
const iso = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(Date.parse(value)).toISOString() === value;
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const fingerprint = doc => hashPayload(Object.fromEntries(Object.entries(doc).filter(([key]) => key !== 'fingerprint')));
const seal = doc => ({ ...doc, fingerprint: fingerprint(doc) });
const exact = (input, keys) => { if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !keys.includes(key))) throw badRequest('tennis_reconciliation_input_invalid'); };
const economic = m => pick(m, MOVEMENT_FIELDS.filter(key => !['capturedMinor', 'refundedMinor'].includes(key)));

/**
 * resolveTrustedBinding(reference) independently authenticates the direct intent/provider/order
 * association. reader.readMovement(request) is the createNativeMpgsReader contract, not browser
 * return data. retrievalEvidenceId names separately inspected Retrieve Order schema evidence.
 * Production construction requires the existing durable stores; nothing constructs this by default.
 */
export function createTennisReconciliationService({ store, commerceStore, route: rawRoute, retrievalEvidenceId,
  resolveTrustedBinding, reader, now = () => Date.now(), production = process.env.NODE_ENV === 'production' } = {}) {
  if (typeof window !== 'undefined') throw unavailable('tennis_reconciliation_server_only');
  if (!store || !['get', 'getUnique', 'commit'].every(key => typeof store[key] === 'function') || !commerceStore || typeof commerceStore.get !== 'function' || (production && (store.kind !== 'upstash' || commerceStore.kind !== 'upstash'))) throw unavailable('tennis_reconciliation_store_required');
  const route = normalizeTennisCheckoutRoute(rawRoute, now());
  const missing = [];
  if (typeof resolveTrustedBinding !== 'function') missing.push('independent_direct_binding_resolver');
  if (typeof reader?.readMovement !== 'function') missing.push('authenticated_read_only_mpgs_reader');
  if (!opaque(retrievalEvidenceId)) missing.push('verified_retrieve_order_schema_evidence');
  const readiness = Object.freeze({ ready: !missing.length, missing: Object.freeze(missing), runtimeEnabled: false, ledgerPostingEnabled: false, financialProductEnabled: false });
  const ready = () => { if (!readiness.ready) throw unavailable('tennis_reconciliation_unconfigured'); };
  const scope = id => hashPayload([route.organizationId, route.projectId, id]);
  const providerScope = id => hashPayload([route.processor, route.merchantId, id]);
  const bindingId = intentId => `tpb_${scope(intentId)}`;
  const movementId = (providerOrderId, transactionId) => `tpm_${hashPayload([route.processor, route.merchantId, providerOrderId, transactionId])}`;
  const publicState = (d, duplicate = false) => ({ bindingId: d.id, status: d.status, capturedMinor: d.capturedMinor, refundedMinor: d.refundedMinor, pendingRefundMinor: d.pendingRefundMinor, providerRefundedMinor: d.providerRefundedMinor, unreconciledRefundMinor: d.unreconciledRefundMinor, currency: route.currency, movementCount: d.movementCount, reason: d.reason, duplicate, ledgerPosted: false });

  async function verifyRoute() {
    if (normalizeTennisCheckoutRoute((await store.get('tennisCheckoutRoute', route.id))?.doc, now()).hash !== route.hash) throw unavailable('tennis_reconciliation_route_unverified');
    for (const [field, kind] of EVIDENCE) {
      const e = (await store.get('tennisCheckoutEvidence', route[field]))?.doc;
      if (!e || e.id !== route[field] || e.status !== 'verified' || e.kind !== kind || e.routeId !== route.id || e.routeVersion !== route.version || e.routeHash !== route.hash || !['operator_configuration_inspection', 'operator_authenticated_provider_query', 'operator_documented_sdk_verification'].includes(e.authenticationBasis) || !iso(e.verifiedAt) || Date.parse(e.verifiedAt) > now()) throw unavailable('tennis_reconciliation_route_unverified');
    }
    const e = (await store.get('tennisReconciliationEvidence', retrievalEvidenceId))?.doc;
    if (!e || e.id !== retrievalEvidenceId || e.status !== 'verified' || e.kind !== 'mpgs_retrieve_order_schema' || e.authenticationBasis !== 'operator_authenticated_provider_query' || e.routeHash !== route.hash || e.merchantId !== route.merchantId || e.apiVersion !== route.apiVersion || e.schema !== NATIVE_MPGS_SCHEMA || !iso(e.verifiedAt) || Date.parse(e.verifiedAt) > now()) throw unavailable('tennis_reconciliation_retrieval_unverified');
  }

  async function verifiedIntent(intentId) {
    if (!/^tco_[A-Za-z0-9_-]{43}$/.test(intentId || '')) throw badRequest('tennis_reconciliation_intent_invalid');
    const d = (await store.get(TENNIS_CHECKOUT_TYPE, intentId))?.doc;
    if (!d) throw notFound('tennis_reconciliation_intent_not_found');
    if (d.id !== intentId || d.routeHash !== route.hash || d.projectId !== route.projectId || d.organizationId !== route.organizationId || d.currency !== route.currency || !/^MX-ORD-[0-9a-f]{32}$/.test(d.orderId || '') || !/^usr_[0-9A-HJKMNP-TV-Z]{20}$/.test(d.customerUserId || '') || !/^MT[A-Za-z0-9_-]{32}$/.test(d.providerOrderId || '') || !/^tc_[A-Za-z0-9_-]{43}$/.test(d.correlation || '') || d.identityHash !== hashPayload(pick(d, INTENT_FIELDS)) || !['creating', 'uncertain', 'ready', 'expired'].includes(d.status) || d.createAttempts !== 1 || !Number.isSafeInteger(d.attemptedAt) || d.attemptedAt > now() || d.termsAcceptedAt !== d.attemptedAt || !minor(d.totalMinor) || d.totalMinor === '0' || ![d.snapshotHash, d.approvalHash, d.configurationHash].every(digest) || !iso(d.offerExpiresAt) || await store.getUnique('tennis_checkout_order', scope(d.orderId)) !== d.id || await store.getUnique('native_checkout_commerce_order', scope(d.orderId)) !== d.id) throw conflict('tennis_reconciliation_intent_changed');
    const [commercial, portal, owner, user, member] = await Promise.all([commerceStore.get(d.orderId), store.get('portalOrder', d.orderId), store.getUnique('portal_order_owner', `${route.projectId}:${d.orderId}`), store.get('user', d.customerUserId), store.get('portalMembership', `${route.organizationId}_${d.customerUserId}`)]);
    const p = portal?.doc;
    if (!commercial || commercial.id !== d.orderId || commercial.snapshot?.schema !== 1 || commercial.snapshot.projectId !== route.projectId || commercial.snapshot.plan !== 'A' || (commercial.snapshot.customerUserId && commercial.snapshot.customerUserId !== d.customerUserId) || !p || p.id !== d.orderId || p.customerUserId !== d.customerUserId || p.projectId !== route.projectId || p.organizationId !== route.organizationId || p.ownershipProof !== 'verified_session_and_order_capability' || owner !== d.customerUserId || user?.doc.id !== d.customerUserId || user.doc.status !== 'active' || member?.doc.userId !== d.customerUserId || member.doc.organizationId !== route.organizationId) throw forbidden('tennis_reconciliation_owner_unverified');
    if (commercial.invoice?.test === true || commercial.invoice?.number?.startsWith('TEST-')) throw forbidden('tennis_reconciliation_goods_unverified');
    let goods;
    try { goods = approvedGoodsContract(commercial, route, now()); } catch { throw forbidden('tennis_reconciliation_goods_unverified'); }
    const payment = commercial.payment;
    if (hashPayload(commercial.snapshot) !== d.snapshotHash || goods.commercialApprovalHash !== d.approvalHash || goods.configurationHash !== d.configurationHash || goods.cashTotalMinor !== d.totalMinor || goods.quantity !== d.quantity) throw conflict('tennis_reconciliation_goods_changed');
    // Do not overwrite this separate commerce store. These are point-in-time evidence receipts;
    // an eventual order/ledger consumer must recheck the immutable association and current fence.
    if (payment.checkoutSource !== TENNIS_EMBEDDED_CONTRACT || payment.checkoutHandle !== d.id || payment.owner !== d.correlation || payment.providerOrderId !== d.providerOrderId || payment.termsVersion !== d.termsVersion || payment.termsAcceptedAt !== d.termsAcceptedAt || !['creating', 'pending'].includes(payment.status) || payment.session) throw conflict('tennis_reconciliation_fence_changed');
    return d;
  }

  async function readBinding(id, verify = true) {
    if (!/^tpb_[a-f0-9]{64}$/.test(id || '')) throw badRequest('tennis_reconciliation_binding_invalid');
    const d = (await store.get(TENNIS_RECONCILIATION_TYPES.binding, id))?.doc;
    if (!d) throw notFound('tennis_reconciliation_binding_not_found');
    if (d.id !== id || d.id !== bindingId(d.intent.id) || d.routeHash !== route.hash || d.retrievalEvidenceId !== retrievalEvidenceId || d.fingerprint !== fingerprint(d) || await store.getUnique('tennis_payment_provider', providerScope(d.intent.providerOrderId)) !== id || await store.getUnique('tennis_payment_order', scope(d.intent.orderId)) !== id || await store.getUnique('tennis_payment_intent', scope(d.intent.id)) !== id) throw conflict('tennis_reconciliation_binding_changed');
    if (verify && hashPayload(pick(await verifiedIntent(d.intent.id), INTENT_FIELDS)) !== hashPayload(d.intent)) throw conflict('tennis_reconciliation_binding_changed');
    return d;
  }

  async function stateFor(binding) {
    const row = await store.get(TENNIS_RECONCILIATION_TYPES.state, binding.id), d = row?.doc;
    if (!d || d.id !== binding.id || d.bindingFingerprint !== binding.fingerprint || d.fingerprint !== fingerprint(d) || !['pending', 'awaiting_capture', 'awaiting_refunds', 'captured', 'partially_refunded', 'refunded', 'review_required'].includes(d.status) || ![d.capturedMinor, d.refundedMinor, d.pendingRefundMinor, d.providerRefundedMinor, d.unreconciledRefundMinor].every(minor) || !Number.isSafeInteger(d.movementCount) || d.movementCount < 0 || d.movementCount > 1000 || (d.capturedMinor !== '0' && d.capturedMinor !== binding.intent.totalMinor) || BigInt(d.refundedMinor) > BigInt(d.capturedMinor) || BigInt(d.providerRefundedMinor) > BigInt(binding.intent.totalMinor) || BigInt(d.refundedMinor) + BigInt(d.pendingRefundMinor) + BigInt(d.unreconciledRefundMinor) !== BigInt(d.providerRefundedMinor) || (d.capturedMinor === '0' ? d.captureMovementId !== null || d.refundedMinor !== '0' : !/^tpm_[a-f0-9]{64}$/.test(d.captureMovementId || '') || d.pendingRefundMinor !== '0')) throw conflict('tennis_reconciliation_state_changed');
    return row;
  }

  /** A reference is resolved independently; it cannot carry owner, prices or provider proof. */
  async function bind(input) {
    ready(); exact(input, ['intentId', 'attestationReference']);
    if (!opaque(input.attestationReference)) throw badRequest('tennis_reconciliation_reference_invalid');
    await verifyRoute();
    const d = await verifiedIntent(input.intentId);
    let raw;
    try { raw = await resolveTrustedBinding(input.attestationReference); }
    catch { throw unavailable('tennis_reconciliation_binding_reader_unavailable'); }
    if (!raw || raw.status !== 'verified' || raw.authenticationBasis !== 'provider_server_direct_order_query' || raw.mode !== 'live' || raw.test === true || raw.mock === true || raw.kind !== 'goods' || raw.approval !== 'approved' || raw.intentId !== d.id || raw.commerceOrderId !== d.orderId || raw.customerUserId !== d.customerUserId || raw.merchantId !== route.merchantId || !opaque(raw.evidenceId) || !iso(raw.verifiedAt) || Date.parse(raw.verifiedAt) < d.attemptedAt || Date.parse(raw.verifiedAt) > now() || ['routeHash', 'providerOrderId', 'correlation', 'snapshotHash', 'approvalHash', 'configurationHash', 'totalMinor', 'currency', 'termsVersion', 'termsAcceptedAt'].some(field => raw[field] !== d[field])) throw forbidden('tennis_reconciliation_binding_unverified');
    const proof = pick(raw, PROOF_FIELDS), id = bindingId(d.id);
    // Proof freshness may change on independent re-query; economic ownership must never change.
    const identityHash = hashPayload({ routeHash: route.hash, retrievalEvidenceId, intent: pick(d, INTENT_FIELDS) });
    for (let attempt = 0; attempt < 8; attempt++) {
      await verifyRoute();
      if (hashPayload(pick(await verifiedIntent(d.id), INTENT_FIELDS)) !== hashPayload(pick(d, INTENT_FIELDS))) throw conflict('tennis_reconciliation_intent_changed');
      const existing = await store.get(TENNIS_RECONCILIATION_TYPES.binding, id);
      if (existing) {
        const binding = await readBinding(id);
        if (binding.identityHash !== identityHash) throw conflict('tennis_reconciliation_binding_changed');
        return publicState((await stateFor(binding)).doc, true);
      }
      const binding = seal({ id, routeHash: route.hash, retrievalEvidenceId, intent: pick(d, INTENT_FIELDS), identityHash, proof, createdAt: new Date(now()).toISOString() });
      const state = seal({ id, bindingFingerprint: binding.fingerprint, status: 'pending', capturedMinor: '0', refundedMinor: '0', pendingRefundMinor: '0', providerRefundedMinor: '0', unreconciledRefundMinor: '0', captureMovementId: null, movementCount: 0, lastObservation: null, reason: null });
      try {
        await store.commit(mergeCommits({ writes: [{ type: TENNIS_RECONCILIATION_TYPES.binding, id, expectedVersion: -1, doc: binding }, { type: TENNIS_RECONCILIATION_TYPES.state, id, expectedVersion: -1, doc: state }], uniques: [{ name: 'tennis_payment_provider', value: providerScope(d.providerOrderId), owner: id }, { name: 'tennis_payment_order', value: scope(d.orderId), owner: id }, { name: 'tennis_payment_intent', value: scope(d.id), owner: id }] }, auditWrites({ now: now(), actor: { kind: 'tennis_reconciliation_verifier' }, action: 'commerce.tennis_payment_bound', objectType: 'order', objectId: d.orderId, meta: { bindingId: id } })));
        return publicState(state);
      } catch (error) {
        // A lost commit acknowledgement and a parallel winner both use durable readback.
        if (await store.get(TENNIS_RECONCILIATION_TYPES.binding, id)) continue;
        if (!['version_conflict', 'unique_conflict'].includes(error.code)) throw unavailable('tennis_reconciliation_save_unconfirmed');
      }
    }
    throw conflict('tennis_reconciliation_binding_conflict');
  }

  function validateMovement(raw, binding, request) {
    const d = binding.intent;
    if (!raw || raw.providerOrderId !== d.providerOrderId || raw.transactionId !== request.transactionId || raw.kind !== request.kind || raw.merchantId !== route.merchantId || raw.currency !== d.currency || raw.totalMinor !== d.totalMinor || ![raw.amountMinor, raw.totalMinor, raw.capturedMinor, raw.refundedMinor].every(minor) || raw.amountMinor === '0' || raw.capturedMinor !== d.totalMinor || BigInt(raw.refundedMinor) > BigInt(raw.capturedMinor) || (raw.kind === 'capture' ? raw.amountMinor !== d.totalMinor : BigInt(raw.amountMinor) > BigInt(raw.refundedMinor)) || !iso(raw.occurredAt) || !iso(raw.verifiedAt) || Date.parse(raw.occurredAt) < d.attemptedAt || Date.parse(raw.occurredAt) > Date.parse(raw.verifiedAt) || Date.parse(raw.verifiedAt) > now() || raw.evidenceHash !== hashPayload(pick(raw, MOVEMENT_FIELDS))) throw conflict('tennis_reconciliation_movement_unverified');
    return { ...pick(raw, MOVEMENT_FIELDS), verifiedAt: raw.verifiedAt, evidenceHash: raw.evidenceHash };
  }

  async function review(binding, reason) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const row = await stateFor(binding);
      if (row.doc.status === 'review_required') return publicState(row.doc, true);
      const state = seal({ ...row.doc, status: 'review_required', reason });
      try {
        await store.commit(mergeCommits({ writes: [{ type: TENNIS_RECONCILIATION_TYPES.state, id: binding.id, expectedVersion: row.version, doc: state }] }, auditWrites({ now: now(), actor: { kind: 'tennis_reconciliation_verifier' }, action: 'commerce.tennis_payment_review_required', objectType: 'order', objectId: binding.intent.orderId, meta: { bindingId: binding.id, reason } })));
        return publicState(state);
      } catch (error) {
        if ((await stateFor(binding)).doc.status === 'review_required') continue;
        if (error.code !== 'version_conflict') throw unavailable('tennis_reconciliation_save_unconfirmed');
      }
    }
    throw unavailable('tennis_reconciliation_busy');
  }

  async function reconcile(input) {
    ready(); exact(input, ['bindingId', 'transactionId', 'kind']);
    // A browser cancellation is never evidence of a monetary reversal. Only authenticated
    // reader history can put this receipt into review; no cancel/void/chargeback is synthesized.
    if (!opaque(input.transactionId) || !/^[A-Za-z0-9_.:-]+$/.test(input.transactionId) || !['capture', 'refund'].includes(input.kind)) throw badRequest('tennis_reconciliation_movement_invalid');
    await verifyRoute();
    const binding = await readBinding(input.bindingId);
    let row = await stateFor(binding);
    if (row.doc.status === 'review_required') return publicState(row.doc, true);
    let raw;
    try { raw = await reader.readMovement({ providerOrderId: binding.intent.providerOrderId, transactionId: input.transactionId, kind: input.kind }); }
    catch (error) {
      if (['native_mpgs_history_requires_review', 'native_mpgs_refund_history_requires_review', 'native_mpgs_multi_capture_requires_review', 'native_mpgs_dispute_requires_review'].includes(error?.code)) {
        await verifyRoute(); await readBinding(binding.id);
        return review(binding, 'provider_history_requires_review');
      }
      throw unavailable('tennis_reconciliation_reader_unavailable');
    }
    let movement;
    try { movement = validateMovement(raw, binding, input); }
    catch {
      await verifyRoute(); await readBinding(binding.id);
      return review(binding, 'provider_movement_unverified');
    }
    const id = movementId(movement.providerOrderId, movement.transactionId), economicHash = hashPayload(economic(movement));
    for (let attempt = 0; attempt < 8; attempt++) {
      await verifyRoute(); await readBinding(binding.id);
      row = await stateFor(binding);
      if (row.doc.status === 'review_required') return publicState(row.doc, true);
      const existing = (await store.get(TENNIS_RECONCILIATION_TYPES.movement, id))?.doc;
      if (existing) {
        if (existing.id !== id || existing.bindingId !== binding.id || existing.economicHash !== economicHash || existing.fingerprint !== fingerprint(existing) || await store.getUnique('tennis_payment_transaction', id) !== binding.id) return review(binding, 'provider_transaction_changed');
      }
      if (!existing && row.doc.movementCount >= 1000) return review(binding, 'movement_limit_requires_review');
      const refundTotal = BigInt(row.doc.refundedMinor) + BigInt(row.doc.pendingRefundMinor) + (!existing && movement.kind === 'refund' ? BigInt(movement.amountMinor) : 0n);
      if (refundTotal > BigInt(movement.refundedMinor) || BigInt(movement.refundedMinor) < BigInt(row.doc.providerRefundedMinor)) return review(binding, 'provider_refund_total_changed');
      if (!existing && movement.kind === 'capture' && row.doc.captureMovementId) return review(binding, 'multiple_captures_require_review');
      const capturedMinor = movement.kind === 'capture' ? movement.amountMinor : row.doc.capturedMinor;
      const hasCapture = capturedMinor !== '0';
      const unreconciledRefundMinor = String(BigInt(movement.refundedMinor) - refundTotal);
      const status = !hasCapture ? 'awaiting_capture' : unreconciledRefundMinor !== '0' ? 'awaiting_refunds' : refundTotal === BigInt(capturedMinor) ? 'refunded' : refundTotal > 0n ? 'partially_refunded' : 'captured';
      const state = seal({ ...row.doc, status, capturedMinor, refundedMinor: hasCapture ? String(refundTotal) : '0', pendingRefundMinor: hasCapture ? '0' : String(refundTotal), providerRefundedMinor: movement.refundedMinor, unreconciledRefundMinor, captureMovementId: movement.kind === 'capture' ? id : row.doc.captureMovementId, movementCount: row.doc.movementCount + (existing ? 0 : 1), lastObservation: movement, reason: null });
      if (existing && row.doc.providerRefundedMinor === movement.refundedMinor) return publicState(row.doc, true);
      const receipt = seal({ id, bindingId: binding.id, economicHash, movement });
      try {
        await store.commit(mergeCommits({ writes: [...(existing ? [] : [{ type: TENNIS_RECONCILIATION_TYPES.movement, id, expectedVersion: -1, doc: receipt }]), { type: TENNIS_RECONCILIATION_TYPES.state, id: binding.id, expectedVersion: row.version, doc: state }], uniques: [{ name: 'tennis_payment_transaction', value: id, owner: binding.id }] }, auditWrites({ now: now(), actor: { kind: 'tennis_reconciliation_verifier' }, action: 'commerce.tennis_payment_observed', objectType: 'order', objectId: binding.intent.orderId, meta: { bindingId: binding.id, movementId: id, kind: movement.kind, evidenceHash: movement.evidenceHash, verifiedAt: movement.verifiedAt, providerRefundedMinor: movement.refundedMinor } })));
        return publicState(state, !!existing);
      } catch (error) {
        if (await store.get(TENNIS_RECONCILIATION_TYPES.movement, id)) continue;
        if (!['version_conflict', 'unique_conflict'].includes(error.code)) throw unavailable('tennis_reconciliation_save_unconfirmed');
      }
    }
    throw unavailable('tennis_reconciliation_busy');
  }

  async function readState(id) { ready(); await verifyRoute(); const binding = await readBinding(id); return publicState((await stateFor(binding)).doc); }
  return Object.freeze({ readiness, bind, reconcile, readState });
}
