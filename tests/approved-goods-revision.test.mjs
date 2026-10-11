/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { approvedGoodsRevisionScope, createApprovedGoodsRevisionProducer, APPROVED_GOODS_TYPES } from '../lib/commerce/approved-goods-revision.js';
import { approvedGoodsContract, approvedGoodsSnapshotContract } from '../lib/platform/native-bindings.js';
import { createMemoryStore, createUpstashStore } from '../lib/platform/store.js';
import { hashPayload } from '../lib/platform/ids.js';
import { approvedOffers } from '../lib/commerce/catalog.js';
import { startBridge, startTestRedis } from './redis-rest-bridge.mjs';

const AT = Date.parse('2026-10-11T12:00:00.000Z');
const USER = `usr_${'0'.repeat(19)}1`, OTHER_USER = `usr_${'0'.repeat(19)}2`;
const ORDER = `MX-ORD-${'7'.repeat(32)}`;
const scope = approvedGoodsRevisionScope({ projectId: 'tennis', organizationId: 'maximus-tennis', currency: 'AED', sellerLegalName: 'SYNTHETIC SELLER — NOT LIVE' });
const clone = value => structuredClone(value);

/** Synthetic authority fixtures only. No real approval, current price, bank SDK or provider. */
async function fixture(store = createMemoryStore()) {
  let at = AT, providerCalls = 0;
  const configuration = { series: 'synthetic-fixture', racquetsTotal: 2 }, technical = { final: true, measurement_basis: 'synthetic-final' };
  const source = { id: ORDER, snapshot: { schema: 1, projectId: 'tennis', customerUserId: USER, plan: 'A', locale: 'ru', createdAt: new Date(AT - 10000).toISOString(),
    configuration, configurationHash: hashPayload(configuration), technical, contact: { country: 'AE', email: 'synthetic@example.invalid' }, paymentPreference: 'payment_link',
    offer: null, quotation: { number: 'TEST-QUOTE-ORIGINAL', test: true }, fulfillment: { verified: false, country: 'AE' }, terms: { accepted: true, version: 'old-terms', text: 'old text' } },
    payment: { status: 'ready', termsVersion: 'old-terms', termsAcceptedAt: AT - 10000 }, invoice: null, mail: {}, events: [] };
  const offer = { approved: true, evidence: 'synthetic-price-approval', currency: 'AED', totalMinor: '24690', productMinor: '24000', taxMinor: '690', shippingMinor: '0',
    seller: { legalName: scope.sellerLegalName, address: 'Synthetic address' }, configurationHash: hashPayload(configuration), fulfillableCountries: ['AE'],
    termsVersion: 'synthetic-approved-terms', termsText: 'Synthetic terms only.', deliveryTerms: 'Synthetic delivery terms.', expiresAt: new Date(AT + 7200000).toISOString() };
  const snapshot = { ...clone(source.snapshot), createdAt: new Date(AT).toISOString(), offer, fulfillment: { verified: true, country: 'AE' },
    terms: { version: offer.termsVersion, text: offer.termsText, accepted: false },
    quotation: { number: 'SYNTHETIC-INDEPENDENT-QUOTE-1', test: false, status: 'quotation', orderId: ORDER, projectId: 'tennis', issuedAt: new Date(AT).toISOString(), expiresAt: offer.expiresAt,
      currency: 'AED', totalMinor: offer.totalMinor, seller: offer.seller, buyer: source.snapshot.contact, termsVersion: offer.termsVersion, termsText: offer.termsText, deliveryTerms: offer.deliveryTerms,
      items: [{ quantity: 2, configuration, technical, unitPriceMinor: '12345', lineTotalMinor: offer.totalMinor }] } };
  const approval = { status: 'verified', kind: 'approved_goods_revision', scopeHash: scope.hash, authorizationId: 'synthetic-authorization-1', evidenceId: 'synthetic-approval-evidence-1',
    orderId: ORDER, customerUserId: USER, sourceSnapshotHash: hashPayload(source.snapshot), approvedSnapshotHash: hashPayload(snapshot), verifiedAt: new Date(AT).toISOString(), expiresAt: new Date(AT + 3600000).toISOString(), snapshot: clone(snapshot) };
  const state = { approval, acceptance: null, onLoad: null, onApproval: null, onAcceptance: null };
  await store.commit({ writes: [
    { type: 'user', id: USER, expectedVersion: -1, doc: { id: USER, status: 'active' } },
    { type: 'portalMembership', id: `maximus-tennis_${USER}`, expectedVersion: -1, doc: { id: `maximus-tennis_${USER}`, userId: USER, organizationId: 'maximus-tennis' } },
    { type: 'portalOrder', id: ORDER, expectedVersion: -1, doc: { id: ORDER, projectId: 'tennis', organizationId: 'maximus-tennis', customerUserId: USER, ownershipProof: 'verified_session_and_order_capability' } },
  ], uniques: [{ name: 'portal_order_owner', value: `tennis:${ORDER}`, owner: USER }] });
  const deps = { store, scope, now: () => at, loadCommerceOrder: async () => { await state.onLoad?.(); return clone(source); },
    resolveApprovedRevision: async reference => { assert.equal(typeof reference, 'string'); await state.onApproval?.(); return clone(state.approval); },
    resolveAcceptedRevision: async reference => { assert.equal(typeof reference, 'string'); await state.onAcceptance?.(); return clone(state.acceptance); },
    createAuthenticatedSession: () => { providerCalls++; assert.fail('provider must never be called'); },
    readProviderMovement: () => { providerCalls++; assert.fail('provider must never be called'); },
  };
  const producer = createApprovedGoodsRevisionProducer(deps);
  const refresh = () => { approval.approvedSnapshotHash = hashPayload(approval.snapshot); };
  const accept = revision => { state.acceptance = { status: 'verified', kind: 'goods_terms_acceptance', scopeHash: scope.hash, revisionId: revision.id, snapshotHash: revision.snapshotHash,
    orderId: ORDER, customerUserId: USER, termsVersion: revision.snapshot.offer.termsVersion, evidenceId: `synthetic-acceptance-${revision.id}`, acceptedAt: at }; };
  return { store, deps, producer, source, approval, state, refresh, accept, setTime: value => { at = value; }, get providerCalls() { return providerCalls; } };
}

test('requires private injected approval resolver and never infers an approval from request data', async () => {
  const f = await fixture();
  assert.throws(() => createApprovedGoodsRevisionProducer({ ...f.deps, resolveApprovedRevision: undefined }), { code: 'goods_revision_dependencies_required' });
  assert.throws(() => createApprovedGoodsRevisionProducer({ ...f.deps, production: true }), { code: 'goods_revision_dependencies_required' });
  await assert.rejects(f.producer.issue(f.approval), { code: 'goods_revision_reference_required' });
  f.state.approval = null;
  await assert.rejects(f.producer.issue('synthetic-ref'), { code: 'goods_revision_verified_authorization_required' });
  assert.deepEqual(approvedOffers, []);
  assert.equal(f.providerCalls, 0);
});

test('new immutable unaccepted revision preserves original TEST document and old acceptance', async () => {
  const f = await fixture(), before = clone(f.source);
  const result = await f.producer.issue('synthetic-ref'), r = result.revision;
  assert.equal(result.duplicate, false);
  assert.equal(r.status, 'awaiting_acceptance');
  assert.equal(r.snapshot.terms.accepted, false);
  assert.equal(r.payment, undefined);
  assert.equal(r.invoice, undefined);
  assert.equal(await f.producer.readAcceptance(r.id), null);
  assert.deepEqual(f.source, before);
  assert.notEqual(r.snapshot.quotation.number, f.source.snapshot.quotation.number);
  assert.throws(() => { r.snapshot.offer.totalMinor = '1'; }, TypeError);
  assert.throws(() => approvedGoodsContract({ id: ORDER, snapshot: r.snapshot }, scope, AT), { code: 'native_approved_goods_contract_required' });
  assert.equal(approvedGoodsSnapshotContract({ id: ORDER, snapshot: r.snapshot }, scope, AT).cashTotalMinor, '24690');
  assert.equal((await f.store.get(APPROVED_GOODS_TYPES.revision, r.id)).version, 1);
  assert.equal((await f.store.listIndex(`audit:order:${ORDER}`)).length, 1);
  assert.equal(f.providerCalls, 0);
});

test('legacy request without immutable user may bind only the verified durable portal owner', async () => {
  const f = await fixture(); delete f.source.snapshot.customerUserId;
  f.approval.sourceSnapshotHash = hashPayload(f.source.snapshot);
  const r = (await f.producer.issue('synthetic-ref')).revision;
  assert.equal(r.customerUserId, USER); assert.equal(r.snapshot.customerUserId, USER);
  f.approval.customerUserId = OTHER_USER;
  await assert.rejects(f.producer.issue('synthetic-ref'), { code: 'goods_revision_owner_required' });
});

test('supports long multiline legal terms without shortening or accepting them', async () => {
  const f = await fixture(), text = 'Synthetic clause with a newline.\n'.repeat(250);
  f.approval.snapshot.offer.termsText = text; f.approval.snapshot.quotation.termsText = text; f.approval.snapshot.terms.text = text; f.refresh();
  assert.equal((await f.producer.issue('synthetic-ref')).revision.snapshot.terms.text, text);
});

test('rejects unverified, expired or future authorizations and TEST quotations', async () => {
  for (const change of [
    a => { a.test = true; }, a => { a.mock = true; }, a => { a.mode = 'test'; }, a => { a.status = 'approved'; }, a => { a.scopeHash = '0'.repeat(64); }, a => { a.expiresAt = new Date(AT).toISOString(); },
    a => { a.verifiedAt = new Date(AT + 1).toISOString(); }, a => { a.snapshot.quotation.test = true; }, a => { a.snapshot.quotation.number = 'TEST-RENAMED'; },
    a => { a.snapshot.terms.accepted = true; }, a => { a.snapshot.terms.acceptedAt = AT - 1; },
  ]) {
    const f = await fixture(); change(f.approval); f.refresh();
    await assert.rejects(f.producer.issue('synthetic-ref'));
    assert.equal((await f.store.listIndex(`audit:order:${ORDER}`)).length, 0);
  }
});

test('amount, currency, configuration, technical and client changes cannot escape approval and source hashes', async () => {
  for (const change of [
    a => { a.snapshot.offer.totalMinor = '24691'; }, a => { a.snapshot.quotation.totalMinor = '24692'; },
    a => { a.snapshot.offer.currency = 'USD'; }, a => { a.snapshot.quotation.currency = 'USD'; },
    a => { a.snapshot.configuration.racquetsTotal = 3; }, a => { a.snapshot.technical.final = false; },
    a => { a.snapshot.contact.email = 'other@example.invalid'; }, a => { a.snapshot.customerUserId = OTHER_USER; },
  ]) {
    const f = await fixture(); change(f.approval);
    await assert.rejects(f.producer.issue('synthetic-ref'), { code: 'goods_revision_approval_changed' });
    f.refresh(); await assert.rejects(f.producer.issue('synthetic-ref'));
    assert.equal(f.providerCalls, 0);
  }
});

test('producer cannot finalize an unresolved technical request while issuing commercial approval', async () => {
  const f = await fixture(); f.source.snapshot.technical.final = false;
  f.approval.sourceSnapshotHash = hashPayload(f.source.snapshot);
  await assert.rejects(f.producer.issue('synthetic-ref'), { code: 'goods_revision_request_changed' });
  f.approval.snapshot.technical.final = false; f.refresh();
  await assert.rejects(f.producer.issue('synthetic-ref'), { code: 'goods_revision_approved_snapshot_required' });
});

test('same authorization cannot be reused for a different otherwise valid amount or quotation', async () => {
  const f = await fixture(); await f.producer.issue('synthetic-ref');
  f.approval.snapshot.offer.totalMinor = '25000'; f.approval.snapshot.offer.productMinor = '24310';
  f.approval.snapshot.quotation.totalMinor = '25000'; f.approval.snapshot.quotation.items[0].lineTotalMinor = '25000'; f.approval.snapshot.quotation.items[0].unitPriceMinor = '12500'; f.refresh();
  await assert.rejects(f.producer.issue('synthetic-ref'), { code: 'goods_revision_authorization_conflict' });
});

test('expiry during awaited source read leaves no issuance or audit', async () => {
  const f = await fixture(); f.state.onLoad = () => { f.setTime(AT + 3600000); };
  await assert.rejects(f.producer.issue('synthetic-ref'), { code: 'goods_revision_verified_authorization_required' });
  assert.equal((await f.store.listIndex(`audit:order:${ORDER}`)).length, 0);
});

test('owner revocation during awaited approval or acceptance stops persistence', async () => {
  for (const operation of ['issue', 'accept']) {
    const f = await fixture();
    const revoke = async () => { const user = await f.store.get('user', USER); await f.store.commit({ writes: [{ type: 'user', id: USER, expectedVersion: user.version, doc: { ...user.doc, status: 'suspended' } }] }); };
    if (operation === 'issue') {
      f.state.onApproval = revoke;
      await assert.rejects(f.producer.issue('synthetic-ref'), { code: 'goods_revision_owner_required' });
    } else {
      const r = (await f.producer.issue('synthetic-ref')).revision; f.accept(r); f.state.onAcceptance = revoke;
      await assert.rejects(f.producer.recordAcceptance(r.id, 'synthetic-acceptance-ref'), { code: 'goods_revision_owner_required' });
      assert.equal((await f.store.listIndex(`audit:order:${ORDER}`)).length, 1);
    }
  }
});

test('concurrent idempotent issuance writes one revision, number claim and audit across producer restart', async () => {
  const f = await fixture(), results = await Promise.all(Array.from({ length: 12 }, () => f.producer.issue('synthetic-ref')));
  assert.equal(results.filter(r => !r.duplicate).length, 1);
  assert.equal(new Set(results.map(r => r.revision.id)).size, 1);
  assert.equal((await f.store.listIndex(`audit:order:${ORDER}`)).length, 1);
  const restarted = createApprovedGoodsRevisionProducer({ ...f.deps });
  assert.deepEqual(await restarted.read(results[0].revision.id), results[0].revision);
  assert.equal((await restarted.issue('synthetic-ref')).duplicate, true);
  f.approval.authorizationId = 'synthetic-other-authorization';
  await assert.rejects(restarted.issue('synthetic-ref'), { code: 'goods_revision_quotation_conflict' });
  assert.equal((await f.store.listIndex(`audit:order:${ORDER}`)).length, 1);
});

test('changed independently approved conditions receive new revision and do not inherit acceptance', async () => {
  const f = await fixture(), first = (await f.producer.issue('synthetic-ref')).revision;
  f.accept(first);
  const firstAcceptance = (await f.producer.recordAcceptance(first.id, 'synthetic-acceptance-ref')).acceptance;
  assert.equal((await f.producer.recordAcceptance(first.id, 'synthetic-acceptance-ref')).duplicate, true);
  f.approval.authorizationId = 'synthetic-authorization-2'; f.approval.evidenceId = 'synthetic-approval-evidence-2'; f.approval.snapshot.quotation.number = 'SYNTHETIC-INDEPENDENT-QUOTE-2';
  f.approval.snapshot.offer.termsVersion = 'new-terms'; f.approval.snapshot.quotation.termsVersion = 'new-terms'; f.approval.snapshot.terms.version = 'new-terms'; f.refresh();
  const second = (await f.producer.issue('synthetic-ref')).revision;
  assert.notEqual(second.id, first.id); assert.equal(second.snapshot.terms.accepted, false);
  assert.equal(await f.producer.readAcceptance(second.id), null);
  await assert.rejects(f.producer.recordAcceptance(second.id, 'old-acceptance-ref'), { code: 'goods_revision_verified_acceptance_required' });
  f.accept(second);
  const secondAcceptance = (await f.producer.recordAcceptance(second.id, 'new-acceptance-ref')).acceptance;
  assert.notEqual(secondAcceptance.commercialApprovalHash, firstAcceptance.commercialApprovalHash);
  assert.deepEqual(await f.producer.read(first.id), first);
  assert.equal(f.source.snapshot.quotation.test, true); assert.equal(f.providerCalls, 0);
});

test('acceptance is bound to exact revision, owner, terms, snapshot and verified time', async () => {
  for (const change of [a => { a.test = true; }, a => { a.mock = true; }, a => { a.mode = 'test'; }, a => { a.customerUserId = OTHER_USER; }, a => { a.termsVersion = 'old-terms'; }, a => { a.snapshotHash = '0'.repeat(64); }, a => { a.acceptedAt = AT - 1; }, a => { a.acceptedAt = AT + 1; }, a => { a.status = 'claimed'; }]) {
    const f = await fixture(), r = (await f.producer.issue('synthetic-ref')).revision;
    f.accept(r); change(f.state.acceptance);
    await assert.rejects(f.producer.recordAcceptance(r.id, 'synthetic-acceptance-ref'), { code: 'goods_revision_verified_acceptance_required' });
    assert.equal(await f.producer.readAcceptance(r.id), null);
  }
  const f = await fixture(), r = (await f.producer.issue('synthetic-ref')).revision; f.accept(r); f.setTime(AT + 3600000);
  await assert.rejects(f.producer.recordAcceptance(r.id, 'synthetic-acceptance-ref'), { code: 'goods_revision_authorization_expired' });
});

test('lost commit ACK recovers exact revision and acceptance without duplicate audits', async () => {
  const f = await fixture(), commit = f.store.commit.bind(f.store);
  f.store.commit = async c => { await commit(c); throw Error('synthetic-private-transport-secret'); };
  const r = (await f.producer.issue('synthetic-ref')).revision; f.accept(r);
  assert.equal((await f.producer.recordAcceptance(r.id, 'synthetic-acceptance-ref')).duplicate, true);
  assert.equal((await f.store.listIndex(`audit:order:${ORDER}`)).length, 2);
  const restarted = createApprovedGoodsRevisionProducer(f.deps);
  assert.deepEqual(await restarted.read(r.id), r);
  assert.equal((await restarted.readAcceptance(r.id)).snapshotHash, r.snapshotHash);
  assert.equal(f.providerCalls, 0);
});

test('failed commit does not leave claims or audit and retry uses the same revision identity', async () => {
  const f = await fixture(); f.store.failNextCommit = 'store_unavailable';
  await assert.rejects(f.producer.issue('synthetic-ref'), { code: 'goods_revision_store_unavailable' });
  assert.equal((await f.store.listIndex(`audit:order:${ORDER}`)).length, 0);
  assert.equal((await f.producer.issue('synthetic-ref')).duplicate, false);
});

test('revision or source changes fail closed, including storage rewrites with recomputed fingerprint', async () => {
  const f = await fixture(), r = (await f.producer.issue('synthetic-ref')).revision;
  f.source.snapshot.contact.email = 'changed@example.invalid';
  await assert.rejects(f.producer.read(r.id), { code: 'goods_revision_source_changed' });
  f.source.snapshot.contact.email = 'synthetic@example.invalid';
  const row = await f.store.get(APPROVED_GOODS_TYPES.revision, r.id);
  await f.store.commit({ writes: [{ type: APPROVED_GOODS_TYPES.revision, id: r.id, expectedVersion: row.version, doc: row.doc }] });
  await assert.rejects(f.producer.read(r.id), { code: 'goods_revision_integrity_failed' });
});

test('Redis adapter reconstructs revision and acceptance after service/store restart', async t => {
  let redis, bridge;
  try { redis = await startTestRedis(6415); bridge = await startBridge({ redisPort: 6415, token: 'synthetic-goods-revision-test' }); }
  catch (error) {
    bridge?.close(); await redis?.close();
    if (process.env.INTAKE_REQUIRE_REDIS === '1' || !['ENOENT', 'EACCES', 'EPERM'].includes(error.code)) throw error;
    return t.skip(`native Redis unavailable: ${error.code}`);
  }
  try {
    const options = { url: bridge.url, token: 'synthetic-goods-revision-test' };
    const f = await fixture(createUpstashStore(options));
    const results = await Promise.all(Array.from({ length: 8 }, () => f.producer.issue('synthetic-ref'))), r = results[0].revision;
    assert.equal(results.filter(x => !x.duplicate).length, 1);
    f.accept(r); await f.producer.recordAcceptance(r.id, 'synthetic-acceptance-ref');
    const restarted = createApprovedGoodsRevisionProducer({ ...f.deps, store: createUpstashStore(options) });
    assert.deepEqual(await restarted.read(r.id), r);
    assert.equal((await restarted.issue('synthetic-ref')).duplicate, true);
    assert.equal((await restarted.recordAcceptance(r.id, 'synthetic-acceptance-ref')).duplicate, true);
    assert.equal((await f.store.listIndex(`audit:order:${ORDER}`)).length, 2);
    assert.equal(f.providerCalls, 0);
  } finally { bridge?.close(); await redis?.close(); }
});
