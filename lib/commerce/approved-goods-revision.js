/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/**
 * SERVER ONLY. Detached immutable goods revisions; intentionally not wired into any runtime.
 * The injected authority supplies the complete independently approved snapshot and quotation
 * number. This module neither prices goods nor approves a request, rewrites a commerce order,
 * promotes a TEST quotation, records payment readiness, or contacts a provider.
 * References are resolved by trusted server dependencies, never accepted as approval payloads.
 * Prerequisite: the source request already contains the final agreed technical specification.
 * A changed configuration/specification needs a separate request; this is not a request editor.
 */
import { approvedGoodsContract, approvedGoodsSnapshotContract } from '../platform/native-bindings';
import { hashPayload } from '../platform/ids';
import { auditWrites, mergeCommits } from '../platform/audit';
import { conflict, forbidden, notFound, unavailable } from '../platform/errors';

export const APPROVED_GOODS_TYPES = Object.freeze({ revision: 'approvedGoodsRevision', acceptance: 'approvedGoodsAcceptance' });
const opaque = value => typeof value === 'string' && value.length > 0 && value.length <= 200 && !/[\u0000-\u001f\u007f]/.test(value);
const termsText = value => typeof value === 'string' && value.length > 0 && value.length <= 16000 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
const actualProof = value => value && value.test !== true && value.mock !== true && value.mode !== 'test';
const digest = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const iso = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(Date.parse(value)).toISOString() === value;
const frozen = value => {
  for (const child of Object.values(value)) if (child && typeof child === 'object') frozen(child);
  return Object.freeze(value);
};
const copy = value => frozen(structuredClone(value));
const fingerprint = value => hashPayload(Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'fingerprint')));
// Every request field except these new commercial approval fields must survive unchanged.
const requestBasis = snapshot => Object.fromEntries(Object.entries(snapshot).filter(([key]) => !['createdAt', 'customerUserId', 'offer', 'quotation', 'fulfillment', 'terms'].includes(key)));

/** Scope is private contract data, not evidence of an enabled merchant or checkout renderer. */
export function approvedGoodsRevisionScope(raw) {
  if (raw?.projectId !== 'tennis' || raw?.organizationId !== 'maximus-tennis' || !/^[A-Z]{3}$/.test(raw?.currency || '') || !opaque(raw?.sellerLegalName)) throw unavailable('goods_revision_scope_required');
  const scope = { projectId: raw.projectId, organizationId: raw.organizationId, currency: raw.currency, sellerLegalName: raw.sellerLegalName };
  return copy({ ...scope, hash: hashPayload(scope) });
}

export function createApprovedGoodsRevisionProducer({ store, scope: rawScope, loadCommerceOrder,
  resolveApprovedRevision, resolveAcceptedRevision, now = () => Date.now(), production = process.env.NODE_ENV === 'production' } = {}) {
  if (typeof window !== 'undefined' || !store || !['get', 'getUnique', 'commit'].every(key => typeof store[key] === 'function') || (production && store.kind !== 'upstash') || typeof loadCommerceOrder !== 'function' || typeof resolveApprovedRevision !== 'function') throw unavailable('goods_revision_dependencies_required');
  const scope = approvedGoodsRevisionScope(rawScope);
  const revisionId = authorizationId => `agr_${hashPayload([scope.hash, authorizationId])}`;
  const quotationScope = number => hashPayload([scope.organizationId, number]);
  const acceptanceId = id => `aga_${hashPayload([scope.hash, id])}`;
  const reference = value => { if (!opaque(value)) throw forbidden('goods_revision_reference_required'); return value; };
  async function resolve(resolver, ref) {
    if (typeof resolver !== 'function') throw unavailable('goods_revision_acceptance_verifier_required');
    try { return structuredClone(await resolver(reference(ref))); }
    catch (error) {
      if (error?.code === 'goods_revision_reference_required') throw error;
      throw unavailable('goods_revision_verifier_unavailable');
    }
  }
  async function sourceOrder(orderId, customerUserId, expectedHash) {
    if (!/^MX-ORD-[0-9a-f]{32}$/.test(orderId || '') || !/^usr_[0-9A-HJKMNP-TV-Z]{20}$/.test(customerUserId || '') || !digest(expectedHash)) throw forbidden('goods_revision_owner_required');
    const [source, portal, unique, user, membership] = await Promise.all([
      loadCommerceOrder(orderId), store.get('portalOrder', orderId), store.getUnique('portal_order_owner', `${scope.projectId}:${orderId}`),
      store.get('user', customerUserId), store.get('portalMembership', `${scope.organizationId}_${customerUserId}`),
    ]);
    const p = portal?.doc, s = source?.snapshot;
    if (!source || source.id !== orderId || s?.schema !== 1 || s.projectId !== scope.projectId || s.plan !== 'A' || (s.customerUserId && s.customerUserId !== customerUserId) || source.invoice?.test === true || source.invoice?.number?.startsWith('TEST-') || !p || p.id !== orderId || p.projectId !== scope.projectId || p.organizationId !== scope.organizationId || p.customerUserId !== customerUserId || p.ownershipProof !== 'verified_session_and_order_capability' || unique !== customerUserId || user?.doc.id !== customerUserId || user.doc.status !== 'active' || membership?.doc.userId !== customerUserId || membership.doc.organizationId !== scope.organizationId) throw forbidden('goods_revision_owner_required');
    if (hashPayload(s) !== expectedHash) throw conflict('goods_revision_source_changed');
    return structuredClone(source);
  }
  function validateSnapshot(snapshot, orderId) {
    try {
      const goods = approvedGoodsSnapshotContract({ id: orderId, snapshot }, scope, now());
      const o = snapshot.offer, q = snapshot.quotation;
      if (!opaque(q.number) || !opaque(o.evidence) || !opaque(o.termsVersion) || !termsText(o.termsText) || q.termsText !== o.termsText || !opaque(o.deliveryTerms) || q.deliveryTerms !== o.deliveryTerms || !o.seller?.address || hashPayload(q.seller) !== hashPayload(o.seller) || hashPayload(q.buyer) !== hashPayload(snapshot.contact) || snapshot.terms?.accepted !== false || snapshot.terms.version !== o.termsVersion || snapshot.terms.text !== o.termsText || Object.keys(snapshot.terms).some(key => !['version', 'text', 'accepted'].includes(key))) throw Error();
      return goods;
    } catch { throw forbidden('goods_revision_approved_snapshot_required'); }
  }
  function authorization(a) {
    if (!actualProof(a) || a.status !== 'verified' || a.kind !== 'approved_goods_revision' || a.scopeHash !== scope.hash || !opaque(a.authorizationId) || !opaque(a.evidenceId) || !digest(a.sourceSnapshotHash) || !digest(a.approvedSnapshotHash) || !iso(a.verifiedAt) || !iso(a.expiresAt) || Date.parse(a.verifiedAt) > now() || Date.parse(a.expiresAt) <= now() || Date.parse(a.expiresAt) <= Date.parse(a.verifiedAt)) throw forbidden('goods_revision_verified_authorization_required');
    if (!a.snapshot || hashPayload(a.snapshot) !== a.approvedSnapshotHash) throw conflict('goods_revision_approval_changed');
    if (a.snapshot.createdAt !== a.verifiedAt || Date.parse(a.snapshot.offer?.expiresAt) <= now()) throw forbidden('goods_revision_authorization_expired');
  }
  async function checkedRevision(id) {
    if (!/^agr_[0-9a-f]{64}$/.test(id || '')) throw notFound('goods_revision_not_found');
    const row = await store.get(APPROVED_GOODS_TYPES.revision, id), d = row?.doc;
    if (!d) throw notFound('goods_revision_not_found');
    if (row.version !== 1 || d.id !== id || d.id !== revisionId(d.authorizationId) || d.schema !== 1 || d.scopeHash !== scope.hash || d.status !== 'awaiting_acceptance' || d.projectId !== scope.projectId || d.organizationId !== scope.organizationId || d.fingerprint !== fingerprint(d) || hashPayload(d.snapshot) !== d.snapshotHash || !iso(d.verifiedAt) || !iso(d.authorizationExpiresAt) || d.snapshot.createdAt !== d.verifiedAt || !opaque(d.evidenceId) || await store.getUnique('approved_goods_quotation', quotationScope(d.snapshot.quotation?.number)) !== id || await store.getUnique('approved_goods_authorization', hashPayload([scope.hash, d.authorizationId])) !== id) throw conflict('goods_revision_integrity_failed');
    validateSnapshot(d.snapshot, d.orderId);
    return d;
  }
  async function read(id) {
    const d = await checkedRevision(id);
    await sourceOrder(d.orderId, d.customerUserId, d.sourceSnapshotHash);
    return copy(d);
  }
  async function issue(approvalReference) {
    const a = await resolve(resolveApprovedRevision, approvalReference);
    authorization(a);
    const source = await sourceOrder(a.orderId, a.customerUserId, a.sourceSnapshotHash);
    if (hashPayload(requestBasis(a.snapshot)) !== hashPayload(requestBasis(source.snapshot)) || a.snapshot.customerUserId !== a.customerUserId || Date.parse(a.snapshot.createdAt) < Date.parse(source.snapshot.createdAt)) throw conflict('goods_revision_request_changed');
    // Existing quotations remain untouched; every independently issued revision has its own number.
    if (source.snapshot.quotation?.number === a.snapshot.quotation?.number) throw conflict('goods_revision_new_quotation_required');
    validateSnapshot(a.snapshot, a.orderId);
    const id = revisionId(a.authorizationId);
    const d = { schema: 1, id, status: 'awaiting_acceptance', scopeHash: scope.hash, projectId: scope.projectId, organizationId: scope.organizationId,
      orderId: a.orderId, customerUserId: a.customerUserId, authorizationId: a.authorizationId, evidenceId: a.evidenceId,
      verifiedAt: a.verifiedAt, authorizationExpiresAt: a.expiresAt, sourceSnapshotHash: a.sourceSnapshotHash,
      snapshotHash: a.approvedSnapshotHash, snapshot: a.snapshot };
    d.fingerprint = fingerprint(d);
    const result = async duplicate => {
      const saved = await checkedRevision(id);
      if (saved.fingerprint !== d.fingerprint) throw conflict('goods_revision_authorization_conflict');
      await sourceOrder(a.orderId, a.customerUserId, a.sourceSnapshotHash);
      authorization(a);
      return copy({ duplicate, revision: saved });
    };
    if (await store.get(APPROVED_GOODS_TYPES.revision, id)) return result(true);
    await sourceOrder(a.orderId, a.customerUserId, a.sourceSnapshotHash);
    authorization(a);
    try {
      // One atomic commit claims the authorization and quotation number with the immutable record.
      await store.commit(mergeCommits({ writes: [{ type: APPROVED_GOODS_TYPES.revision, id, expectedVersion: -1, doc: d }], uniques: [
        { name: 'approved_goods_authorization', value: hashPayload([scope.hash, a.authorizationId]), owner: id },
        { name: 'approved_goods_quotation', value: quotationScope(a.snapshot.quotation.number), owner: id },
      ] }, auditWrites({ now: now(), actor: { kind: 'approved_goods_verifier' }, action: 'commerce.goods_revision_issued', objectType: 'order', objectId: d.orderId,
        afterVersion: 1, meta: { revisionId: id, projectId: scope.projectId, snapshotHash: d.snapshotHash } })));
    } catch (error) {
      // An unknown ACK never creates a second revision. Recover only an exact committed result.
      if (await store.get(APPROVED_GOODS_TYPES.revision, id)) return result(true);
      if (['unique_conflict', 'version_conflict'].includes(error?.code)) throw conflict('goods_revision_quotation_conflict');
      throw unavailable('goods_revision_store_unavailable');
    }
    return result(false);
  }
  async function checkedAcceptance(d) {
    const id = acceptanceId(d.id), row = await store.get(APPROVED_GOODS_TYPES.acceptance, id), a = row?.doc;
    if (!a) return null;
    if (row.version !== 1 || a.id !== id || a.revisionId !== d.id || a.scopeHash !== scope.hash || a.orderId !== d.orderId || a.customerUserId !== d.customerUserId || a.snapshotHash !== d.snapshotHash || a.termsVersion !== d.snapshot.offer.termsVersion || a.fingerprint !== fingerprint(a) || !opaque(a.evidenceId) || await store.getUnique('approved_goods_acceptance_evidence', hashPayload([scope.hash, a.evidenceId])) !== id) throw conflict('goods_revision_acceptance_integrity_failed');
    try {
      const contract = approvedGoodsContract({ id: d.orderId, snapshot: d.snapshot, payment: { status: 'ready', termsVersion: a.termsVersion, termsAcceptedAt: a.acceptedAt } }, scope, now());
      if (contract.commercialApprovalHash !== a.commercialApprovalHash) throw Error();
    } catch { throw conflict('goods_revision_acceptance_integrity_failed'); }
    return a;
  }
  async function readAcceptance(id) {
    const d = await read(id);
    const a = await checkedAcceptance(d);
    return a ? copy(a) : null;
  }
  async function recordAcceptance(id, acceptanceReference) {
    const d = await read(id), proof = await resolve(resolveAcceptedRevision, acceptanceReference);
    const fresh = async () => {
      await sourceOrder(d.orderId, d.customerUserId, d.sourceSnapshotHash);
      if (Date.parse(d.authorizationExpiresAt) <= now() || Date.parse(d.snapshot.offer.expiresAt) <= now()) throw forbidden('goods_revision_authorization_expired');
    };
    await fresh();
    if (!actualProof(proof) || proof.status !== 'verified' || proof.kind !== 'goods_terms_acceptance' || proof.scopeHash !== scope.hash || proof.revisionId !== id || proof.snapshotHash !== d.snapshotHash || proof.orderId !== d.orderId || proof.customerUserId !== d.customerUserId || proof.termsVersion !== d.snapshot.offer.termsVersion || !opaque(proof.evidenceId) || !Number.isSafeInteger(proof.acceptedAt) || proof.acceptedAt < Date.parse(d.verifiedAt) || proof.acceptedAt > now() || proof.acceptedAt >= Date.parse(d.snapshot.offer.expiresAt)) throw forbidden('goods_revision_verified_acceptance_required');
    // The ready status exists only inside this validation call, backed by verified acceptance.
    // No payable commerce record is returned, written, or connected to the checkout service.
    const goods = approvedGoodsContract({ id: d.orderId, snapshot: d.snapshot, payment: { status: 'ready', termsVersion: proof.termsVersion, termsAcceptedAt: proof.acceptedAt } }, scope, now());
    const aid = acceptanceId(id), a = { id: aid, revisionId: id, scopeHash: scope.hash, orderId: d.orderId, customerUserId: d.customerUserId, snapshotHash: d.snapshotHash,
      termsVersion: proof.termsVersion, acceptedAt: proof.acceptedAt, evidenceId: proof.evidenceId, commercialApprovalHash: goods.commercialApprovalHash };
    a.fingerprint = fingerprint(a);
    const result = async duplicate => {
      const saved = await checkedAcceptance(d);
      if (!saved || saved.fingerprint !== a.fingerprint) throw conflict('goods_revision_acceptance_conflict');
      await fresh();
      return copy({ duplicate, acceptance: saved });
    };
    if (await checkedAcceptance(d)) return result(true);
    await fresh();
    try {
      await store.commit(mergeCommits({ writes: [{ type: APPROVED_GOODS_TYPES.acceptance, id: aid, expectedVersion: -1, doc: a }],
        uniques: [{ name: 'approved_goods_acceptance_evidence', value: hashPayload([scope.hash, a.evidenceId]), owner: aid }] },
      auditWrites({ now: now(), actor: { kind: 'verified_goods_customer', userId: d.customerUserId }, action: 'commerce.goods_revision_accepted', objectType: 'order', objectId: d.orderId,
        afterVersion: 1, meta: { revisionId: id, projectId: scope.projectId, snapshotHash: d.snapshotHash } })));
    } catch (error) {
      if (await store.get(APPROVED_GOODS_TYPES.acceptance, aid)) return result(true);
      if (['unique_conflict', 'version_conflict'].includes(error?.code)) throw conflict('goods_revision_acceptance_conflict');
      throw unavailable('goods_revision_store_unavailable');
    }
    return result(false);
  }
  return Object.freeze({ scope, issue, read, recordAcceptance, readAcceptance });
}
