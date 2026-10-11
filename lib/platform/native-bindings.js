/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/** SERVER ONLY. Immutable native/MX-ORD/verified-user association. No email join or public enrolment. */
import { hashPayload } from './ids';
import { auditWrites, mergeCommits } from './audit';
import { conflict, forbidden, notFound, unavailable } from './errors';
import { nativeId, nativeIntegerId, nativeTime } from './native-read-http';

export const NATIVE_BINDING_TYPES = Object.freeze({ binding: 'nativeCommerceBinding', reference: 'nativeCommerceReference' });
const orderId = value => {
  if (typeof value !== 'string' || !/^MX-ORD-[0-9a-f]{32}$/.test(value)) throw forbidden('native_commerce_order_required');
  return value;
};
const opaque = value => {
  if (typeof value !== 'string' || value.length < 1 || value.length > 200 || /[\u0000-\u001f\u007f]/.test(value)) throw forbidden('native_opaque_reference_invalid');
  return value;
};
const bindingId = (mapping, providerOrderId) => `nb_${hashPayload([mapping.hash, providerOrderId])}`;
const referenceId = (mapping, reference) => `nr_${hashPayload([mapping.hash, opaque(reference)])}`;
const userId = value => {
  if (typeof value !== 'string' || !/^usr_[0-9A-HJKMNP-TV-Z]{20}$/.test(value)) throw forbidden('native_verified_customer_required');
  return value;
};
const TRUSTED_SOURCES = new Set(['native_server_signature', 'server_authenticated_addon_query', 'server_authenticated_native_api_mapping']);
const REFERENCE_SOURCES = new Set([...TRUSTED_SOURCES, 'provider_server_query']);
const minor = value => {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) value = String(value);
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,29})$/.test(value)) throw forbidden('native_approved_goods_contract_required');
  return value;
};

/** Commercial approval only; this never establishes customer acceptance or payment readiness. */
export function approvedGoodsSnapshotContract(commercial, mapping, at) {
  const s = commercial.snapshot, q = s.quotation, o = s.offer;
  const bad = () => { throw forbidden('native_approved_goods_contract_required'); };
  if (!o || o.approved !== true || !o.evidence || o.currency !== mapping.currency || o.seller?.legalName !== mapping.sellerLegalName || s.technical?.final !== true || s.fulfillment?.verified !== true || s.paymentPreference !== 'payment_link' || !Array.isArray(o.fulfillableCountries) || !o.fulfillableCountries.includes(s.fulfillment.country) || s.contact?.country !== s.fulfillment.country) bad();
  const totalMinor = minor(o.totalMinor), components = [o.productMinor, o.taxMinor, o.shippingMinor].map(minor);
  if (totalMinor === '0' || components.reduce((sum, n) => sum + BigInt(n), 0n) !== BigInt(totalMinor)) bad();
  const configurationHash = hashPayload(s.configuration);
  if (s.configurationHash !== configurationHash || o.configurationHash !== configurationHash || !Number.isSafeInteger(s.configuration?.racquetsTotal) || s.configuration.racquetsTotal < 1 || s.configuration.racquetsTotal > 10000) bad();
  if (!q || q.test !== false || typeof q.number !== 'string' || !q.number.length || q.number.startsWith('TEST-') || q.status !== 'quotation' || q.orderId !== commercial.id || q.projectId !== mapping.projectId || q.currency !== mapping.currency || minor(q.totalMinor) !== totalMinor || q.seller?.legalName !== mapping.sellerLegalName || q.termsVersion !== o.termsVersion || !o.termsVersion || !Array.isArray(q.items) || q.items.length !== 1) bad();
  const item = q.items[0];
  if (!item || item.quantity !== s.configuration.racquetsTotal || hashPayload(item.configuration) !== configurationHash || hashPayload(item.technical) !== hashPayload(s.technical) || minor(item.lineTotalMinor) !== totalMinor || BigInt(minor(item.unitPriceMinor)) * BigInt(item.quantity) !== BigInt(totalMinor)) bad();
  const createdAt = nativeTime(s.createdAt, at);
  const expires = Date.parse(nativeTime(o.expiresAt, 8640000000000000));
  if (!Number.isFinite(expires) || expires <= Date.parse(createdAt) || q.issuedAt !== createdAt || q.expiresAt !== o.expiresAt) bad();
  return { cashTotalMinor: totalMinor, configurationHash, quantity: String(item.quantity) };
}

export function approvedGoodsContract(commercial, mapping, at) {
  const goods = approvedGoodsSnapshotContract(commercial, mapping, at);
  const s = commercial.snapshot, o = s.offer, acceptedAt = commercial.payment?.termsAcceptedAt;
  if (!Number.isSafeInteger(acceptedAt) || acceptedAt < Date.parse(s.createdAt) || acceptedAt > at || acceptedAt >= Date.parse(o.expiresAt) || commercial.payment?.termsVersion !== o.termsVersion || !['ready', 'creating', 'pending', 'review_required', 'paid', 'refunded'].includes(commercial.payment?.status)) throw forbidden('native_approved_goods_contract_required');
  return { ...goods,
    commercialApprovalHash: hashPayload({ snapshot: s, acceptedTerms: { termsVersion: o.termsVersion, termsAcceptedAt: acceptedAt } }) };
}

export function createNativeBindingRegistry({ store, mapping, readNativeOrder, loadCommerceOrder,
  resolveTrustedBinding, resolveTrustedReference, readProviderMovement, now = () => Date.now() }) {
  if (!store || !mapping?.hash || typeof readNativeOrder !== 'function' || typeof loadCommerceOrder !== 'function') throw unavailable('native_binding_runtime_unavailable');
  const nativeUnique = nativeOrderId => hashPayload([mapping.hash, nativeOrderId]);
  const commerceUnique = commerceOrderId => hashPayload([mapping.hash, commerceOrderId]);
  const bindingIndex = `native-bindings:${mapping.hash}`;

  async function ownerSnapshot(commerceOrderId) {
    orderId(commerceOrderId);
    const [commercial, owner] = await Promise.all([loadCommerceOrder(commerceOrderId), store.get('portalOrder', commerceOrderId)]);
    if (!commercial || commercial.id !== commerceOrderId || commercial.snapshot?.schema !== 1 || commercial.snapshot.projectId !== mapping.projectId || commercial.snapshot.plan !== 'A' || commercial.invoice?.test === true || commercial.invoice?.number?.startsWith('TEST-')) throw forbidden('native_actual_commerce_order_required');
    const goods = approvedGoodsContract(commercial, mapping, now());
    const p = owner?.doc;
    if (!p || p.id !== commerceOrderId || p.projectId !== mapping.projectId || p.organizationId !== mapping.organizationId || p.ownershipProof !== 'verified_session_and_order_capability') throw forbidden('native_portal_order_owner_required');
    const customerUserId = userId(p.customerUserId);
    if (commercial.snapshot.customerUserId && commercial.snapshot.customerUserId !== customerUserId) throw conflict('native_customer_mismatch');
    const [uniqueOwner, user, membership] = await Promise.all([
      store.getUnique('portal_order_owner', `${mapping.projectId}:${commerceOrderId}`),
      store.get('user', customerUserId), store.get('portalMembership', `${mapping.organizationId}_${customerUserId}`),
    ]);
    if (uniqueOwner !== customerUserId || user?.doc.id !== customerUserId || user.doc.status !== 'active' || membership?.doc.userId !== customerUserId || membership.doc.organizationId !== mapping.organizationId) throw forbidden('native_verified_customer_required');
    const snapshotHash = hashPayload(commercial.snapshot);
    return { ...goods, customerUserId, commerceSnapshotHash: snapshotHash, immutableOrderRevisionId: `snapshot_${snapshotHash}`,
      basis: commercial.snapshot.customerUserId ? 'immutable_commerce_customer' : 'durable_unique_portal_order_owner' };
  }
  async function nativeSnapshot(nativeOrderId) {
    const native = await readNativeOrder(nativeIntegerId(nativeOrderId));
    if (!native || native.nativeOrderId !== nativeOrderId || native.companyId !== mapping.companyId || native.paymentMethodId !== mapping.paymentMethodId || typeof native.cashTotalMinor !== 'string' || !/^[1-9]\d{0,29}$/.test(native.cashTotalMinor)) throw conflict('native_order_scope_mismatch');
    // A configurable CS-Cart status never establishes a capture, approval or verified ownership.
    if (!Array.isArray(native.items) || !native.items.length || native.items.length > 100) throw conflict('native_order_items_required');
    return { nativeOrderId, companyId: mapping.companyId, paymentMethodId: mapping.paymentMethodId, cashTotalMinor: native.cashTotalMinor, items: native.items };
  }
  function checkBinding(row, id) {
    const d = row?.doc;
    if (!d || d.id !== id || d.id !== bindingId(mapping, d.providerOrderId) || d.mappingHash !== mapping.hash || d.status !== 'verified' || d.source !== 'server_account_binding' || d.projectId !== mapping.projectId || d.organizationId !== mapping.organizationId || d.merchantId !== mapping.merchantId || d.currency !== mapping.currency || d.companyId !== mapping.companyId || d.paymentMethodId !== mapping.paymentMethodId || d.fingerprint !== hashPayload(Object.fromEntries(Object.entries(d).filter(([key]) => !['fingerprint', 'verifiedAt'].includes(key))))) throw conflict('native_binding_integrity_failed');
    orderId(d.commerceOrderId); userId(d.customerUserId); nativeId(d.providerOrderId); nativeIntegerId(d.nativeOrderId);
    return d;
  }
  async function readBinding(providerOrderId, { verify = true } = {}) {
    nativeId(providerOrderId);
    const id = bindingId(mapping, providerOrderId), row = await store.get(NATIVE_BINDING_TYPES.binding, id);
    if (!row) throw notFound('native_order_binding_not_found');
    const d = checkBinding(row, id);
    if (await store.getUnique('native_commerce_order', commerceUnique(d.commerceOrderId)) !== id || await store.getUnique('native_store_order', nativeUnique(d.nativeOrderId)) !== id) throw conflict('native_binding_integrity_failed');
    if (verify) {
      const [owner, native] = await Promise.all([ownerSnapshot(d.commerceOrderId), nativeSnapshot(d.nativeOrderId)]);
      if (owner.customerUserId !== d.customerUserId || owner.commerceSnapshotHash !== d.commerceSnapshotHash || owner.commercialApprovalHash !== d.commercialApprovalHash || owner.basis !== d.basis || owner.cashTotalMinor !== d.cashTotalMinor || native.cashTotalMinor !== d.cashTotalMinor || hashPayload(native.items) !== d.nativeItemsHash) throw conflict('native_binding_snapshot_changed');
    }
    return structuredClone(d);
  }

  /** Only a trusted authenticated native-addon resolver can supply the association, never a route body. */
  async function persistVerifiedBinding(attestationReference) {
    opaque(attestationReference);
    if (typeof resolveTrustedBinding !== 'function') throw unavailable('native_addon_binding_verifier_required');
    const a = await resolveTrustedBinding(attestationReference);
    if (!a || a.status !== 'verified' || !TRUSTED_SOURCES.has(a.authenticationBasis) || a.mode !== 'live' || a.kind !== 'goods' || a.approval !== 'approved' || a.mappingHash !== mapping.hash || a.companyId !== mapping.companyId || a.paymentMethodId !== mapping.paymentMethodId || a.currency !== mapping.currency || a.merchantId !== mapping.merchantId) throw forbidden('native_authenticated_addon_binding_required');
    const providerOrderId = nativeId(a.providerOrderId), nativeOrderId = nativeIntegerId(a.nativeOrderId), commerceOrderId = orderId(a.commerceOrderId);
    const evidenceId = opaque(a.evidenceId); nativeTime(a.verifiedAt, now());
    const [owner, native] = await Promise.all([ownerSnapshot(commerceOrderId), nativeSnapshot(nativeOrderId)]);
    if (a.cashTotalMinor !== native.cashTotalMinor || owner.cashTotalMinor !== native.cashTotalMinor || (a.customerUserId !== undefined && a.customerUserId !== owner.customerUserId)) throw conflict('native_addon_binding_scope_mismatch');
    if (!Array.isArray(a.itemBindings) || a.itemBindings.length !== native.items.length) throw forbidden('native_authenticated_item_mapping_required');
    const mappedItems = a.itemBindings.map(item => {
      if (item.commerceConfigurationHash !== owner.configurationHash || typeof item.optionsHash !== 'string' || !/^[0-9a-f]{64}$/.test(item.optionsHash)) throw forbidden('native_authenticated_item_mapping_required');
      return { productId: nativeIntegerId(item.nativeProductId), quantity: nativeIntegerId(item.quantity), optionsHash: item.optionsHash };
    }).sort((left, right) => `${left.productId}:${left.optionsHash}`.localeCompare(`${right.productId}:${right.optionsHash}`));
    if (hashPayload(mappedItems) !== hashPayload(native.items) || mappedItems.reduce((sum, item) => sum + BigInt(item.quantity), 0n) !== BigInt(owner.quantity)) throw conflict('native_order_items_mismatch');
    const id = bindingId(mapping, providerOrderId);
    const d = { id, mappingHash: mapping.hash, status: 'verified', source: 'server_account_binding', providerOrderId, nativeOrderId, commerceOrderId,
      projectId: mapping.projectId, organizationId: mapping.organizationId, merchantId: mapping.merchantId, companyId: mapping.companyId,
      paymentMethodId: mapping.paymentMethodId, currency: mapping.currency, cashTotalMinor: native.cashTotalMinor,
      ...owner, nativeItemsHash: hashPayload(native.items), evidenceId, authenticationBasis: a.authenticationBasis };
    const fingerprint = hashPayload(d), verifiedAt = new Date(now()).toISOString();
    const existing = await store.get(NATIVE_BINDING_TYPES.binding, id);
    if (existing) { const prior = checkBinding(existing, id); if (prior.fingerprint !== fingerprint) throw conflict('native_binding_conflict'); return { bindingId: id, duplicate: true }; }
    for (let attempt = 0; attempt < 12; attempt++) { try {
      const sequence = await store.get('nativeCommerceBindingSequence', mapping.hash);
      if (sequence && (sequence.doc.mappingHash !== mapping.hash || !Number.isSafeInteger(sequence.doc.value) || sequence.doc.value < 1 || sequence.doc.value >= Number.MAX_SAFE_INTEGER)) throw conflict('native_binding_sequence_invalid');
      const ordinal = (sequence?.doc.value || 0) + 1;
      await store.commit(mergeCommits({ writes: [{ type: NATIVE_BINDING_TYPES.binding, id, expectedVersion: -1, doc: { ...d, fingerprint, verifiedAt } }],
        uniques: [{ name: 'native_commerce_order', value: commerceUnique(commerceOrderId), owner: id }, { name: 'native_store_order', value: nativeUnique(nativeOrderId), owner: id }], indexes: [{ name: bindingIndex, member: id, score: ordinal }] },
      { writes: [{ type: 'nativeCommerceBindingSequence', id: mapping.hash, expectedVersion: sequence?.version ?? -1, doc: { id: mapping.hash, mappingHash: mapping.hash, value: ordinal } }] },
      auditWrites({ now: now(), actor: { kind: 'native_addon_verifier' }, action: 'commerce.native_order_bound', objectType: 'order', objectId: commerceOrderId, meta: { projectId: mapping.projectId, bindingId: id, mappingId: mapping.id, mappingVersion: mapping.version } })));
      return { bindingId: id, duplicate: false };
    } catch (error) {
      if (['version_conflict', 'unique_conflict'].includes(error?.code)) {
        const winner = await store.get(NATIVE_BINDING_TYPES.binding, id);
        if (winner && checkBinding(winner, id).fingerprint === fingerprint) return { bindingId: id, duplicate: true };
        if (error.code === 'version_conflict') continue;
        throw conflict('native_binding_conflict');
      }
      throw unavailable('native_binding_store_unavailable');
    } }
    throw unavailable('native_binding_store_busy');
  }
  async function persistVerifiedReference(attestationReference) {
    opaque(attestationReference);
    if (typeof resolveTrustedReference !== 'function') throw unavailable('native_addon_reference_verifier_required');
    const a = await resolveTrustedReference(attestationReference);
    if (!a || a.status !== 'verified' || !TRUSTED_SOURCES.has(a.authenticationBasis) || a.mappingHash !== mapping.hash || a.mode !== 'live' || !['capture', 'refund'].includes(a.kind)) throw forbidden('native_authenticated_reference_required');
    const eventReference = opaque(a.eventReference), providerOrderId = nativeId(a.providerOrderId), transactionId = nativeId(a.transactionId);
    const bound = await readBinding(providerOrderId);
    const id = referenceId(mapping, eventReference);
    const d = { id, mappingHash: mapping.hash, bindingId: bound.id, providerOrderId, transactionId, kind: a.kind,
      evidenceId: opaque(a.evidenceId), authenticationBasis: a.authenticationBasis, verifiedAt: nativeTime(a.verifiedAt, now()) };
    return persistReferenceRecord(id, d);
  }
  async function persistReferenceRecord(id, d) {
    const fingerprint = hashPayload(d);
    const identityHash = hashPayload({ mappingHash: d.mappingHash, bindingId: d.bindingId, providerOrderId: d.providerOrderId, transactionId: d.transactionId, kind: d.kind });
    const existing = await store.get(NATIVE_BINDING_TYPES.reference, id);
    if (existing) { if (existing.doc.identityHash !== identityHash) throw conflict('native_reference_conflict'); return { duplicate: true }; }
    try {
      await store.commit({ writes: [{ type: NATIVE_BINDING_TYPES.reference, id, expectedVersion: -1, doc: { ...d, fingerprint, identityHash } }] });
      return { duplicate: false };
    } catch (error) {
      if (error?.code === 'version_conflict' && (await store.get(NATIVE_BINDING_TYPES.reference, id))?.doc.identityHash === identityHash) return { duplicate: true };
      throw conflict('native_reference_conflict');
    }
  }
  async function readReference(eventReference) {
    const id = referenceId(mapping, eventReference), row = await store.get(NATIVE_BINDING_TYPES.reference, id), d = row?.doc;
    if (!d) throw notFound('native_event_reference_not_registered');
    if (d.id !== id || d.mappingHash !== mapping.hash || !REFERENCE_SOURCES.has(d.authenticationBasis) || !['capture', 'refund'].includes(d.kind) || d.fingerprint !== hashPayload(Object.fromEntries(Object.entries(d).filter(([key]) => !['fingerprint', 'identityHash'].includes(key)))) || d.identityHash !== hashPayload({ mappingHash: d.mappingHash, bindingId: d.bindingId, providerOrderId: d.providerOrderId, transactionId: d.transactionId, kind: d.kind }) || d.bindingId !== bindingId(mapping, d.providerOrderId)) throw conflict('native_reference_integrity_failed');
    nativeId(d.providerOrderId); nativeId(d.transactionId); nativeTime(d.verifiedAt, now());
    await readBinding(d.providerOrderId, { verify: false });
    return structuredClone(d);
  }
  async function listBindings({ offset = 0, limit = 10 } = {}) {
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 10000000 || !Number.isInteger(limit) || limit < 1 || limit > 20 || typeof store.listIndex !== 'function') throw forbidden('native_binding_page_invalid');
    const ids = await store.listIndex(bindingIndex, { offset, limit, reverse: false });
    const items = await Promise.all(ids.map(async id => {
      const row = await store.get(NATIVE_BINDING_TYPES.binding, id), d = checkBinding(row, id);
      return { id: d.id, status: d.status, source: d.source, mappingHash: d.mappingHash, projectId: d.projectId, providerOrderId: d.providerOrderId, fingerprint: d.fingerprint };
    }));
    return { items, nextOffset: ids.length === limit ? offset + ids.length : null };
  }
  /** Only authenticated provider GET can register a polling reference; caller amounts are ignored. */
  async function registerQueriedMovement({ binding, transactionId, kind }) {
    if (typeof readProviderMovement !== 'function') throw unavailable('native_provider_query_required');
    const b = await readBinding(binding?.providerOrderId);
    if (binding.id !== b.id || binding.mappingHash !== mapping.hash || binding.fingerprint !== b.fingerprint || binding.projectId !== mapping.projectId) throw conflict('native_poll_binding_scope_mismatch');
    nativeId(transactionId);
    if (!['capture', 'refund'].includes(kind)) throw forbidden('native_movement_not_supported');
    const movement = await readProviderMovement({ providerOrderId: b.providerOrderId, transactionId, kind });
    if (!movement || movement.providerOrderId !== b.providerOrderId || movement.transactionId !== transactionId || movement.kind !== kind || movement.currency !== mapping.currency || movement.merchantId !== mapping.merchantId || movement.totalMinor !== b.cashTotalMinor || !/^[0-9a-f]{64}$/.test(movement.evidenceHash || '')) throw conflict('native_provider_movement_mismatch');
    const eventReference = `np_${hashPayload([mapping.hash, b.providerOrderId, transactionId, kind])}`;
    const id = referenceId(mapping, eventReference);
    const result = await persistReferenceRecord(id, { id, mappingHash: mapping.hash, bindingId: b.id, providerOrderId: b.providerOrderId, transactionId, kind,
      evidenceId: `mpgs-query_${movement.evidenceHash}`, authenticationBasis: 'provider_server_query', verifiedAt: nativeTime(movement.verifiedAt, now()) });
    return { eventReference, ...result };
  }
  return Object.freeze({ persistVerifiedBinding, persistVerifiedReference, readBinding, readReference, listBindings, registerQueriedMovement });
}
