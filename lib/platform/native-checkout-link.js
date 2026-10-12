/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/** SERVER ONLY. A reserved correlation is not a payment, native order or live attestation. */
import { hashPayload, randomToken } from './ids';
import { auditWrites, mergeCommits } from './audit';
import { approvedGoodsContract, createNativeBindingRegistry, NATIVE_BINDING_TYPES } from './native-bindings';
import { normalizeNativeMapping } from './native-ledger-runtime';
import { badRequest, conflict, forbidden, notFound, unavailable } from './errors';

export const NATIVE_CHECKOUT_INTENT_TYPE = 'nativeCheckoutIntent';
const STATES = new Set(['prepared', 'publishing', 'uncertain', 'bound', 'expired', 'review_required']);
const AUTHENTICATED = new Set(['native_server_signature', 'server_authenticated_addon_query', 'server_authenticated_native_api_mapping']);
const LEASE_MS = 30000;
const orderId = value => {
  if (typeof value !== 'string' || !/^MX-ORD-[0-9a-f]{32}$/.test(value)) throw badRequest('native_checkout_order_invalid');
  return value;
};
const opaque = value => typeof value === 'string' && value.length > 0 && value.length <= 200 && !/[\u0000-\u001f\u007f]/.test(value);
const inputKeys = (input, allowed) => {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !allowed.includes(key))) throw badRequest('native_checkout_input_invalid');
};
const identityFields = d => Object.fromEntries(['id', 'mappingHash', 'projectId', 'organizationId', 'commerceOrderId', 'customerUserId', 'correlation', 'commerceSnapshotHash', 'commercialApprovalHash', 'configurationHash', 'cashTotalMinor', 'currency', 'quantity', 'createdAt', 'expiresAt'].map(key => [key, d[key]]));
const projection = d => ({ intentId: d.id, status: d.status, expiresAt: d.expiresAt, bindingReady: d.status === 'bound' });

/**
 * All functions are server dependencies, never deserialised request fields.
 * authorizeOrder must validate the supplied order capability and server-authenticated ctx.
 * resolvePublishedIntent must independently authenticate the native correlation result.
 * No default publisher/resolver, transport, environment activation or schedule is supplied.
 */
export function createNativeCheckoutLinkService({ store, mapping: suppliedMapping, authorizeOrder, loadCommerceOrder,
  readNativeOrder, publishNativeIntent, resolvePublishedIntent, now = () => Date.now(), production = process.env.NODE_ENV === 'production' } = {}) {
  if (!store || !['get', 'getUnique', 'commit'].every(key => typeof store[key] === 'function') || (production && store.kind === 'memory') || typeof authorizeOrder !== 'function' || typeof loadCommerceOrder !== 'function' || typeof readNativeOrder !== 'function') throw unavailable('native_checkout_runtime_unavailable');
  const mapping = normalizeNativeMapping(suppliedMapping, now());
  const missing = [];
  if (typeof publishNativeIntent !== 'function') missing.push('authenticated_native_publisher');
  if (typeof resolvePublishedIntent !== 'function') missing.push('authenticated_native_correlation_resolver');
  const readiness = Object.freeze({ ready: missing.length === 0, missing: Object.freeze(missing), mappingHash: mapping.hash, projectId: mapping.projectId, source: mapping.source, financialProductEnabled: false });
  const ready = () => { if (!readiness.ready) throw unavailable('native_checkout_publisher_unconfigured'); };
  const idFor = id => `nci_${hashPayload([mapping.hash, id])}`;
  const orderUnique = id => hashPayload([mapping.hash, id]);
  const pinnedOrderUnique = id => hashPayload([mapping.organizationId, mapping.projectId, id]);
  const idempotencyUnique = (customer, key) => hashPayload([mapping.hash, customer, key]);
  async function verifiedRuntime() {
    try {
      const actual = normalizeNativeMapping((await store.get('nativeCommerceMapping', mapping.id))?.doc, now());
      if (actual.hash !== mapping.hash) throw unavailable('native_checkout_mapping_unverified');
      for (const [field, kind] of [['liveModeEvidenceId', 'live_route'], ['nativeMappingEvidenceId', 'native_order_mapping'], ['customerBindingEvidenceId', 'verified_customer_binding_schema'], ['providerSchemaEvidenceId', 'mpgs_retrieve_order_schema']]) {
        const e = (await store.get('nativeCommerceEvidence', mapping[field]))?.doc;
        const at = Date.parse(e?.verifiedAt);
        if (!e || e.id !== mapping[field] || e.kind !== kind || e.status !== 'verified' || e.mappingId !== mapping.id || e.mappingVersion !== mapping.version || e.mappingHash !== mapping.hash || !['operator_configuration_inspection', 'operator_addon_source_inspection', 'operator_authenticated_provider_query'].includes(e.authenticationBasis) || !Number.isFinite(at) || at > now() || new Date(at).toISOString() !== e.verifiedAt) throw unavailable('native_checkout_mapping_unverified');
      }
    } catch { throw unavailable('native_checkout_mapping_unverified'); }
  }

  function context(ctx) {
    if (!ctx || ctx.emailVerified !== true || ctx.organizationId !== mapping.organizationId || typeof ctx.userId !== 'string' || !/^usr_[0-9A-HJKMNP-TV-Z]{20}$/.test(ctx.userId)) throw forbidden('native_checkout_verified_customer_required');
    return ctx.userId;
  }
  async function ownedOrder(id, customerUserId) {
    const [commercial, owner, uniqueOwner, user, membership] = await Promise.all([
      loadCommerceOrder(id), store.get('portalOrder', id), store.getUnique('portal_order_owner', `${mapping.projectId}:${id}`),
      store.get('user', customerUserId), store.get('portalMembership', `${mapping.organizationId}_${customerUserId}`),
    ]);
    const p = owner?.doc;
    if (!p || p.id !== id || p.customerUserId !== customerUserId || p.organizationId !== mapping.organizationId || p.projectId !== mapping.projectId || p.ownershipProof !== 'verified_session_and_order_capability' || uniqueOwner !== customerUserId || user?.doc.id !== customerUserId || user.doc.status !== 'active' || membership?.doc.userId !== customerUserId || membership.doc.organizationId !== mapping.organizationId) throw forbidden('native_checkout_order_owner_required');
    if (!commercial || commercial.id !== id || commercial.snapshot?.schema !== 1 || commercial.snapshot.projectId !== mapping.projectId || commercial.snapshot.plan !== 'A' || commercial.invoice?.test === true || commercial.invoice?.number?.startsWith('TEST-') || (commercial.snapshot.customerUserId && commercial.snapshot.customerUserId !== customerUserId)) throw forbidden('native_actual_commerce_order_required');
    let goods;
    try { goods = approvedGoodsContract(commercial, mapping, now()); }
    catch { throw forbidden('native_approved_goods_contract_required'); }
    return { commercial, goods, commerceSnapshotHash: hashPayload(commercial.snapshot) };
  }
  function exactSnapshot(d, owned) {
    if (d.commerceSnapshotHash !== owned.commerceSnapshotHash || d.commercialApprovalHash !== owned.goods.commercialApprovalHash || d.cashTotalMinor !== owned.goods.cashTotalMinor || d.configurationHash !== owned.goods.configurationHash || d.quantity !== owned.goods.quantity) throw conflict('native_checkout_snapshot_changed');
  }
  function freshPayable(owned) {
    if (owned.commercial.payment.status !== 'ready' || owned.commercial.payment.session) throw conflict('native_checkout_order_not_ready');
    if (Date.parse(owned.commercial.snapshot.offer.expiresAt) <= now()) throw conflict('native_checkout_offer_expired');
  }
  async function intent(id) {
    if (typeof id !== 'string' || !/^nci_[0-9a-f]{64}$/.test(id)) throw notFound('native_checkout_intent_not_found');
    const row = await store.get(NATIVE_CHECKOUT_INTENT_TYPE, id), d = row?.doc;
    if (!d) throw notFound('native_checkout_intent_not_found');
    if (d.id !== id || id !== idFor(d.commerceOrderId) || d.mappingHash !== mapping.hash || d.projectId !== mapping.projectId || d.organizationId !== mapping.organizationId || d.currency !== mapping.currency || !STATES.has(d.status) || !/^ncc_[A-Za-z0-9_-]{43}$/.test(d.correlation || '') || d.identityHash !== hashPayload(identityFields(d)) || await store.getUnique('native_checkout_order', orderUnique(d.commerceOrderId)) !== id || await store.getUnique('native_checkout_commerce_order', pinnedOrderUnique(d.commerceOrderId)) !== id || await store.getUnique('native_checkout_correlation', hashPayload([mapping.hash, d.correlation])) !== id) throw conflict('native_checkout_intent_integrity_failed');
    const attempted = d.publishAttempts === 1 && Number.isSafeInteger(d.attemptedAt) && d.attemptedAt >= d.createdAt && d.attemptedAt <= now();
    if (!Number.isSafeInteger(d.createdAt) || d.createdAt < 0 || d.createdAt > now() || !Number.isFinite(Date.parse(d.expiresAt)) || (d.status === 'prepared' && (d.publishAttempts !== 0 || d.attemptedAt !== undefined || d.lease !== undefined || d.leaseUntil !== undefined)) || (['publishing', 'uncertain', 'bound'].includes(d.status) && !attempted) || (['expired', 'review_required'].includes(d.status) && !(d.publishAttempts === 0 || attempted)) || (d.status === 'publishing' && (!/^[A-Za-z0-9_-]{32}$/.test(d.lease || '') || !Number.isSafeInteger(d.leaseUntil) || d.leaseUntil !== d.attemptedAt + LEASE_MS)) || (d.publishAttempts === 1 && d.status !== 'publishing' && (d.lease !== null || d.leaseUntil !== 0))) throw conflict('native_checkout_intent_integrity_failed');
    orderId(d.commerceOrderId);
    if (d.status === 'bound') {
      const raw = (await store.get(NATIVE_BINDING_TYPES.binding, d.bindingId))?.doc;
      if (!raw) throw conflict('native_checkout_intent_integrity_failed');
      const registry = createNativeBindingRegistry({ store, mapping, now, readNativeOrder, loadCommerceOrder });
      const b = await registry.readBinding(raw.providerOrderId, { verify: false });
      if (!/^nb_[0-9a-f]{64}$/.test(d.bindingId || '') || !b || b.id !== d.bindingId || b.commerceOrderId !== d.commerceOrderId || b.customerUserId !== d.customerUserId || b.mappingHash !== mapping.hash || b.commerceSnapshotHash !== d.commerceSnapshotHash || b.commercialApprovalHash !== d.commercialApprovalHash || await store.getUnique('native_commerce_order', orderUnique(d.commerceOrderId)) !== d.bindingId) throw conflict('native_checkout_intent_integrity_failed');
    }
    return row;
  }
  async function transition(row, change, action) {
    const doc = { ...row.doc, ...change, updatedAt: now() };
    await store.commit(mergeCommits({ writes: [{ type: NATIVE_CHECKOUT_INTENT_TYPE, id: doc.id, expectedVersion: row.version, doc }] },
      auditWrites({ now: now(), actor: { kind: 'native_checkout_service' }, action, objectType: 'order', objectId: doc.commerceOrderId, meta: { projectId: mapping.projectId, intentId: doc.id, status: doc.status } })));
    return (await intent(doc.id)).doc;
  }
  async function prepare(input) {
    ready(); inputKeys(input, ['ctx', 'orderId', 'accessToken', 'idempotencyKey']); await verifiedRuntime();
    const customerUserId = context(input.ctx), id = orderId(input.orderId);
    if (!opaque(input.accessToken) || typeof input.idempotencyKey !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(input.idempotencyKey)) throw badRequest('native_checkout_input_invalid');
    const authorized = await authorizeOrder({ ctx: input.ctx, orderId: id, accessToken: input.accessToken });
    const owned = await ownedOrder(id, customerUserId);
    if (!authorized || authorized.id !== id || hashPayload(authorized.snapshot) !== owned.commerceSnapshotHash || hashPayload({ termsVersion: authorized.payment?.termsVersion, termsAcceptedAt: authorized.payment?.termsAcceptedAt }) !== hashPayload({ termsVersion: owned.commercial.payment.termsVersion, termsAcceptedAt: owned.commercial.payment.termsAcceptedAt })) throw forbidden('native_checkout_authorized_snapshot_required');
    const intentId = idFor(id), idem = idempotencyUnique(customerUserId, input.idempotencyKey);
    const pinned = await store.getUnique('native_checkout_commerce_order', pinnedOrderUnique(id));
    if (pinned && pinned !== intentId) throw conflict('native_checkout_mapping_pinned');
    const previous = await store.getUnique('native_checkout_idempotency', idem);
    if (previous && previous !== intentId) throw conflict('native_checkout_idempotency_conflict');
    const existing = await store.get(NATIVE_CHECKOUT_INTENT_TYPE, intentId);
    if (existing) {
      const d = (await intent(intentId)).doc;
      if (d.customerUserId !== customerUserId) throw forbidden('native_checkout_order_owner_required');
      exactSnapshot(d, owned);
      await store.commit({ uniques: [{ name: 'native_checkout_idempotency', value: idem, owner: intentId }] });
      return projection(d);
    }
    freshPayable(owned);
    if (await store.getUnique('native_commerce_order', orderUnique(id))) throw conflict('native_checkout_order_already_bound');
    const d = { id: intentId, mappingHash: mapping.hash, projectId: mapping.projectId, organizationId: mapping.organizationId, commerceOrderId: id, customerUserId,
      correlation: `ncc_${randomToken(32)}`, commerceSnapshotHash: owned.commerceSnapshotHash, commercialApprovalHash: owned.goods.commercialApprovalHash,
      configurationHash: owned.goods.configurationHash, cashTotalMinor: owned.goods.cashTotalMinor, currency: mapping.currency, quantity: owned.goods.quantity,
      createdAt: now(), expiresAt: owned.commercial.snapshot.offer.expiresAt, status: 'prepared', publishAttempts: 0 };
    d.identityHash = hashPayload(identityFields(d));
    try {
      await store.commit(mergeCommits({ writes: [{ type: NATIVE_CHECKOUT_INTENT_TYPE, id: intentId, expectedVersion: -1, doc: d }], uniques: [
        { name: 'native_checkout_order', value: orderUnique(id), owner: intentId }, { name: 'native_checkout_correlation', value: hashPayload([mapping.hash, d.correlation]), owner: intentId },
        { name: 'native_checkout_commerce_order', value: pinnedOrderUnique(id), owner: intentId },
        { name: 'native_checkout_idempotency', value: idem, owner: intentId },
      ] }, auditWrites({ now: now(), actor: { userId: customerUserId }, action: 'commerce.native_checkout_reserved', objectType: 'order', objectId: id, meta: { projectId: mapping.projectId, intentId } })));
      return projection(d);
    } catch {
      // An atomic commit may have succeeded before its acknowledgement was lost.
      const claimed = await store.getUnique('native_checkout_idempotency', idem);
      if (claimed && claimed !== intentId) throw conflict('native_checkout_idempotency_conflict');
      const mappingPin = await store.getUnique('native_checkout_commerce_order', pinnedOrderUnique(id));
      if (mappingPin && mappingPin !== intentId) throw conflict('native_checkout_mapping_pinned');
      const winner = await store.get(NATIVE_CHECKOUT_INTENT_TYPE, intentId);
      if (winner) {
        const saved = (await intent(intentId)).doc;
        if (saved.customerUserId === customerUserId && saved.identityHash === hashPayload(identityFields(saved))) {
          exactSnapshot(saved, owned);
          await store.commit({ uniques: [{ name: 'native_checkout_idempotency', value: idem, owner: intentId }] });
          return projection(saved);
        }
      }
      throw unavailable('native_checkout_store_unavailable');
    }
  }
  async function readStatus(input) {
    ready(); inputKeys(input, ['ctx', 'intentId']); await verifiedRuntime();
    const customer = context(input.ctx), row = await intent(input.intentId);
    if (row.doc.customerUserId !== customer) throw notFound('native_checkout_intent_not_found');
    exactSnapshot(row.doc, await ownedOrder(row.doc.commerceOrderId, customer));
    if (row.doc.status === 'bound') {
      const b = (await store.get(NATIVE_BINDING_TYPES.binding, row.doc.bindingId)).doc;
      const registry = createNativeBindingRegistry({ store, mapping, now, readNativeOrder, loadCommerceOrder });
      await registry.readBinding(b.providerOrderId);
    }
    return projection(row.doc);
  }
  async function publish(input) {
    ready(); inputKeys(input, ['intentId']); await verifiedRuntime();
    let row = await intent(input.intentId);
    if (row.doc.status !== 'prepared') return projection(row.doc);
    const owned = await ownedOrder(row.doc.commerceOrderId, row.doc.customerUserId);
    exactSnapshot(row.doc, owned);
    try { freshPayable(owned); }
    catch (error) {
      return projection(await transition(row, { status: error.code === 'native_checkout_offer_expired' ? 'expired' : 'review_required', reason: error.code }, 'commerce.native_checkout_blocked'));
    }
    if (await store.getUnique('native_commerce_order', orderUnique(row.doc.commerceOrderId))) return projection(await transition(row, { status: 'review_required', reason: 'native_order_already_bound' }, 'commerce.native_checkout_blocked'));
    const attemptAt = now(), lease = randomToken(24);
    try {
      await transition(row, { status: 'publishing', publishAttempts: 1, attemptedAt: attemptAt, leaseUntil: attemptAt + LEASE_MS, lease }, 'commerce.native_checkout_publish_reserved');
    } catch (error) {
      // Even an acknowledged-lost reservation MUST NOT cause a publisher call.
      // Only the process that received a successful CAS acknowledgement may create.
      if (error?.code === 'version_conflict') return projection((await intent(input.intentId)).doc);
      throw unavailable('native_checkout_publish_reservation_unavailable');
    }
    row = await intent(input.intentId);
    if (row.doc.status !== 'publishing' || row.doc.lease !== lease) return projection(row.doc);
    if (row.doc.leaseUntil <= now()) return projection(row.doc);
    // A delayed CAS/reader must not publish after expiry or loss of the verified owner.
    try {
      const currentOwner = await ownedOrder(row.doc.commerceOrderId, row.doc.customerUserId);
      exactSnapshot(row.doc, currentOwner); freshPayable(currentOwner);
      await verifiedRuntime();
      row = await intent(input.intentId);
      if (row.doc.status !== 'publishing' || row.doc.lease !== lease || row.doc.leaseUntil <= now()) return projection(row.doc);
      // No awaited operation between the final clock/state check and publisher invocation.
      freshPayable(currentOwner);
    } catch {
      return projection(await transition(row, { status: 'review_required', lease: null, leaseUntil: 0, reason: 'native_checkout_pre_publish_recheck_failed' }, 'commerce.native_checkout_blocked'));
    }
    let result;
    try { result = await publishNativeIntent({ intent: structuredClone(identityFields(row.doc)) }); }
    catch { result = { status: 'uncertain' }; }
    const current = await intent(input.intentId);
    if (current.doc.status !== 'publishing' || current.doc.lease !== lease) return projection(current.doc);
    const rejected = result?.status === 'rejected';
    const attestationReference = result?.status === 'accepted' && opaque(result.attestationReference) ? result.attestationReference : undefined;
    try {
      await transition(current, { status: rejected ? 'review_required' : 'uncertain', lease: null, leaseUntil: 0, ...(attestationReference ? { attestationReference } : {}), reason: rejected ? 'native_publish_rejected' : 'native_result_unresolved' }, 'commerce.native_checkout_publish_outcome');
    } catch { throw unavailable('native_checkout_publish_outcome_unavailable'); }
    return rejected ? projection((await intent(input.intentId)).doc) : recover(input);
  }
  async function recover(input) {
    ready(); inputKeys(input, ['intentId']); await verifiedRuntime();
    let row = await intent(input.intentId);
    if (!['publishing', 'uncertain'].includes(row.doc.status) || (row.doc.status === 'publishing' && row.doc.leaseUntil > now())) return projection(row.doc);
    const owned = await ownedOrder(row.doc.commerceOrderId, row.doc.customerUserId);
    exactSnapshot(row.doc, owned);
    // No offer freshness requirement here: recover an existing attempt, never create again.
    let a;
    try { a = structuredClone(await resolvePublishedIntent({ intentId: row.doc.id, correlation: row.doc.correlation, ...(row.doc.attestationReference ? { attestationReference: row.doc.attestationReference } : {}) })); }
    catch {
      return projection(await transition(row, { status: 'uncertain', lease: null, leaseUntil: 0, reason: 'native_resolver_unavailable' }, 'commerce.native_checkout_recovery_deferred'));
    }
    if (!a || ['pending', 'not_found'].includes(a.status)) return projection(await transition(row, { status: 'uncertain', lease: null, leaseUntil: 0, reason: 'native_result_unresolved' }, 'commerce.native_checkout_recovery_deferred'));
    const proofAt = Date.parse(a.verifiedAt);
    if (a.status !== 'verified' || !AUTHENTICATED.has(a.authenticationBasis) || a.intentId !== row.doc.id || a.correlation !== row.doc.correlation || a.commerceOrderId !== row.doc.commerceOrderId || a.customerUserId !== row.doc.customerUserId || a.mappingHash !== mapping.hash || a.cashTotalMinor !== row.doc.cashTotalMinor || !Number.isFinite(proofAt) || proofAt < row.doc.attemptedAt || proofAt > now() || new Date(proofAt).toISOString() !== a.verifiedAt) return projection(await transition(row, { status: 'review_required', lease: null, leaseUntil: 0, reason: 'native_correlation_proof_invalid' }, 'commerce.native_checkout_recovery_review'));
    let binding;
    try {
      await verifiedRuntime();
      row = await intent(input.intentId);
      if (!['publishing', 'uncertain'].includes(row.doc.status)) return projection(row.doc);
      const claim = row;
      // Native GET awaits cannot let a stale recovery make a terminal review pollable.
      // Binding, append-only index and this exact active intent guard commit together.
      const bindingStore = { ...store, async commit(commit) {
        if (!commit.writes?.some(write => write.type === NATIVE_BINDING_TYPES.binding)) return store.commit(commit);
        return store.commit(mergeCommits(commit, { writes: [{ type: NATIVE_CHECKOUT_INTENT_TYPE, id: claim.doc.id, expectedVersion: claim.version, doc: claim.doc }] }));
      } };
      const registry = createNativeBindingRegistry({ store: bindingStore, mapping, now, readNativeOrder, loadCommerceOrder,
        resolveTrustedBinding: async reference => reference === claim.doc.correlation ? a : null });
      binding = await registry.persistVerifiedBinding(row.doc.correlation);
      const saved = await registry.readBinding(a.providerOrderId);
      if (saved.id !== binding.bindingId || saved.commerceOrderId !== row.doc.commerceOrderId || saved.customerUserId !== row.doc.customerUserId || saved.commerceSnapshotHash !== row.doc.commerceSnapshotHash || saved.commercialApprovalHash !== row.doc.commercialApprovalHash) throw conflict('native_checkout_binding_mismatch');
    } catch (error) {
      // Transport/ack loss remains recoverable; invalid scope/proof requires review.
      const review = error?.status === 403 || error?.status === 409;
      row = await intent(input.intentId);
      if (!['publishing', 'uncertain'].includes(row.doc.status)) return projection(row.doc);
      return projection(await transition(row, { status: review ? 'review_required' : 'uncertain', lease: null, leaseUntil: 0, reason: review ? 'native_binding_review_required' : 'native_binding_store_unavailable' }, 'commerce.native_checkout_recovery_deferred'));
    }
    row = await intent(input.intentId);
    if (['bound', 'review_required', 'expired'].includes(row.doc.status)) return projection(row.doc);
    try {
      return projection(await transition(row, { status: 'bound', bindingId: binding.bindingId, lease: null, leaseUntil: 0, reason: null, boundAt: now() }, 'commerce.native_checkout_bound'));
    } catch {
      const saved = await intent(input.intentId);
      if (saved.doc.status === 'bound' && saved.doc.bindingId === binding.bindingId) return projection(saved.doc);
      throw unavailable('native_checkout_binding_acknowledgement_unavailable');
    }
  }
  return Object.freeze({ readiness, prepare, publish, recover, readStatus });
}
