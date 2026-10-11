/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTennisControlOrderService, TENNIS_CONTROL_SCOPE, TENNIS_CONTROL_TYPES, TENNIS_CONTROL_SESSION_CONTRACT } from '../lib/commerce/tennis-control-order.js';
import { createMemoryStore, createUpstashStore } from '../lib/platform/store.js';
import { hashPayload } from '../lib/platform/ids.js';
import { startTestRedis, startBridge } from './redis-rest-bridge.mjs';

const AT = Date.parse('2026-10-11T12:00:00.000Z');
const USER = `usr_${'0'.repeat(19)}1`, OTHER = `usr_${'0'.repeat(19)}2`;
const clone = value => structuredClone(value);
function session(attempt, at = AT) {
  return { contract: TENNIS_CONTROL_SESSION_CONTRACT, sessionId: 'SESSIONsyntheticPrivateControl123', providerOrderId: attempt.providerOrderId,
    currency: 'USD', totalMinor: '100', correlation: attempt.correlation, verifiedAt: new Date(at).toISOString(), localSessionDeadline: attempt.localSessionDeadline };
}
/** Fake verifier and provider only: these fixtures do not establish real authority or bank support. */
async function fixture(store = createMemoryStore()) {
  let at = AT;
  const ctx = { userId: USER, organizationId: 'maximus-tennis', emailVerified: true };
  const authorization = { status: 'verified', kind: 'payment_control_authorization', purpose: 'payment_control', mode: 'live', test: false, mock: false,
    authenticationBasis: 'independently_verified_owner_authorization', authorizationId: 'synthetic-owner-permission', evidenceId: 'synthetic-permission-evidence', scopeHash: TENNIS_CONTROL_SCOPE.hash,
    projectId: 'tennis', organizationId: 'maximus-tennis', ownerUserId: USER, currency: 'USD', totalMinor: '100', fulfillment: 'none',
    termsVersion: 'synthetic-control-terms-v1', termsText: 'Synthetic one-time USD 1 payment control. No goods, delivery, investment or bonus.', verifiedAt: new Date(AT - 1000).toISOString(), expiresAt: new Date(AT + 3600000).toISOString() };
  const state = { authorization, authorizations: 0, calls: [], onAuthorization: null, onInitiate: null, throwInitiate: false, receiptChange: null };
  await store.commit({ writes: [USER, OTHER].flatMap(user => [
    { type: 'user', id: user, expectedVersion: -1, doc: { id: user, status: 'active' } },
    { type: 'portalMembership', id: `maximus-tennis_${user}`, expectedVersion: -1, doc: { id: `maximus-tennis_${user}`, organizationId: 'maximus-tennis', userId: user } },
  ]) });
  const deps = { store, now: () => at, production: false,
    resolveAuthorization: async reference => { assert.equal(typeof reference, 'string'); state.authorizations++; await state.onAuthorization?.(); return clone(state.authorization); },
    initiateSession: async ({ attempt }) => {
      const record = await store.get(TENNIS_CONTROL_TYPES.attempt, attempt.orderId);
      assert.equal(record.doc.createAttempts, 1); assert.equal(record.doc.status, 'creating');
      state.calls.push(clone(attempt)); await state.onInitiate?.();
      if (state.throwInitiate) throw Error('synthetic-private-provider-password');
      const receipt = session(attempt, at); state.receiptChange?.(receipt); return receipt;
    },
  };
  const service = createTennisControlOrderService(deps);
  const input = { ctx, authorizationReference: 'synthetic-private-authorization-reference', idempotencyKey: 'synthetic-idem-0001', termsVersion: authorization.termsVersion };
  const issued = async () => (await service.issue(input)).order;
  const own = id => ({ ctx, orderId: id });
  const suspend = async () => { const row = await store.get('user', USER); await store.commit({ writes: [{ type: 'user', id: USER, expectedVersion: row.version, doc: { ...row.doc, status: 'suspended' } }] }); };
  return { store, ctx, authorization, state, deps, service, input, issued, own, suspend, setTime: value => { at = value; } };
}
const isPrivateFree = value => {
  const raw = JSON.stringify(value);
  for (const field of ['sessionId', 'providerOrderId', 'correlation', 'authorization', 'evidenceId', 'scopeHash', 'snapshotHash', 'successIndicator', 'sessionVersion', 'password', 'card', 'pan']) assert.equal(raw.includes(`"${field}"`), false, field);
  for (const marker of ['SESSIONsynthetic', 'synthetic-permission-evidence', 'synthetic-private', 'TEST-']) assert.equal(raw.includes(marker), false, marker);
  assert.equal(value.paymentVerified, false); assert.equal(value.rendererReady, false);
};

test('factory has no default authorizer/provider or production memory and fixed USD scope', async () => {
  const f = await fixture();
  assert.throws(() => createTennisControlOrderService({ ...f.deps, resolveAuthorization: undefined }), { code: 'control_dependencies_required' });
  assert.throws(() => createTennisControlOrderService({ ...f.deps, production: true }), { code: 'control_dependencies_required' });
  const service = createTennisControlOrderService({ ...f.deps, initiateSession: undefined });
  assert.deepEqual(service.readiness, { runtimeEnabled: false, rendererEnabled: false, financialProductEnabled: false, initiationConfigured: false });
  const order = await f.issued();
  await assert.rejects(service.initiate(f.own(order.id)), { code: 'control_initiation_unconfigured' });
  assert.equal((await service.readOwnRecord(f.own(order.id))).attempt, null);
  assert.equal(TENNIS_CONTROL_SCOPE.currency, 'USD'); assert.equal(TENNIS_CONTROL_SCOPE.totalMinor, '100');
});

test('issues a frozen owner-bound control order without commerce goods, fulfilment or financial effects', async () => {
  const f = await fixture(), order = await f.issued(), record = await f.service.readOwnRecord(f.own(order.id));
  assert.match(order.id, /^MX-CTL-[0-9a-f]{32}$/);
  assert.equal(order.kind, 'payment_control'); assert.equal(order.totalMinor, '100'); assert.equal(order.currency, 'USD'); assert.equal(order.fulfillment, 'none'); assert.equal(order.status, 'issued');
  assert.equal(record.order.ownerUserId, USER); assert.equal(record.order.terms.acceptedAt, AT); assert.equal(record.attempt, null); assert.equal(record.session, null);
  assert.equal((await f.store.get(TENNIS_CONTROL_TYPES.order, order.id)).version, 1);
  assert.equal(await f.store.get('portalOrder', order.id), null);
  for (const field of ['plan', 'offer', 'quotation', 'configuration', 'technical', 'invoice', 'mail', 'principalMinor', 'bonusMinor', 'payment']) assert.equal(Object.hasOwn(record.order, field), false);
  assert.equal((await f.store.listIndex('audit:all')).length, 1); assert.equal(f.state.calls.length, 0);
  isPrivateFree(order); assert.throws(() => { record.order.totalMinor = '99'; }, TypeError);
});

test('active but foreign owner, guest, tenant mismatch, inactive user and missing membership cannot issue or read', async () => {
  for (const ctx of [{}, { userId: USER, organizationId: 'maximus-tennis', emailVerified: false }, { userId: USER, organizationId: 'other', emailVerified: true }, { userId: OTHER, organizationId: 'maximus-tennis', emailVerified: true }]) {
    const f = await fixture(); await assert.rejects(f.service.issue({ ...f.input, ctx })); assert.equal(f.state.calls.length, 0);
  }
  const f = await fixture(), order = await f.issued();
  await assert.rejects(f.service.getOwn({ ctx: { ...f.ctx, userId: OTHER }, orderId: order.id }), { code: 'control_order_not_found' });
  await assert.rejects(f.service.getOwn(f.own(`MX-ORD-${'1'.repeat(32)}`)), { code: 'control_order_not_found' });
  await f.suspend(); await assert.rejects(f.service.reserveAttempt(f.own(order.id)), { code: 'control_verified_owner_required' });
  const other = await fixture(); await other.store.commit({ deletes: [{ type: 'portalMembership', id: `maximus-tennis_${USER}` }] });
  await assert.rejects(other.issued(), { code: 'control_verified_owner_required' });
});

test('caller amount, currency, identity, approval, goods and provider overrides are rejected', async () => {
  for (const [field, value] of [['totalMinor', '1'], ['currency', 'AED'], ['ownerUserId', OTHER], ['authorization', {}], ['kind', 'goods'], ['plan', 'A'], ['providerOrderId', 'MCbad'], ['fulfillment', 'verified']]) {
    const f = await fixture(); await assert.rejects(f.service.issue({ ...f.input, [field]: value }), { code: 'control_input_invalid' });
    assert.equal(f.state.authorizations, 0); assert.equal(f.state.calls.length, 0);
  }
});

test('independent authorization is exact owner/scope/terms/amount/currency/nonTEST/expiry', async () => {
  for (const change of [
    a => { a.ownerUserId = OTHER; }, a => { a.scopeHash = 'a'.repeat(64); }, a => { a.currency = 'AED'; }, a => { a.totalMinor = '99'; }, a => { a.totalMinor = 100; },
    a => { a.purpose = 'goods'; }, a => { a.kind = 'goods'; }, a => { a.fulfillment = 'delivery'; }, a => { a.status = 'claimed'; }, a => { a.mode = 'test'; }, a => { a.test = true; }, a => { delete a.test; }, a => { a.mock = true; },
    a => { a.authenticationBasis = 'browser_return'; }, a => { a.authorizationId = 'TEST-CONTROL'; }, a => { a.evidenceId = 'TEST-APPROVAL'; },
    a => { a.expiresAt = new Date(AT).toISOString(); }, a => { a.verifiedAt = new Date(AT + 1).toISOString(); },
  ]) {
    const f = await fixture(); change(f.authorization);
    await assert.rejects(f.issued(), { code: 'control_authorization_required' });
    assert.equal((await f.store.listIndex('audit:all')).length, 0); assert.equal(f.state.calls.length, 0);
  }
  const f = await fixture(); await assert.rejects(f.service.issue({ ...f.input, termsVersion: 'other-terms' }), { code: 'control_terms_mismatch' });
});

test('concurrent issuance and new idempotency keys preserve one unique authorization and order', async () => {
  const f = await fixture(), results = await Promise.all(Array.from({ length: 12 }, () => f.service.issue(f.input)));
  assert.equal(results.filter(result => !result.duplicate).length, 1); assert.equal(new Set(results.map(result => result.order.id)).size, 1);
  const order = results[0].order;
  const replay = await f.service.issue({ ...f.input, idempotencyKey: 'synthetic-another-key' });
  assert.equal(replay.duplicate, true); assert.equal(replay.order.id, order.id);
  const restarted = createTennisControlOrderService(f.deps);
  assert.equal((await restarted.issue(f.input)).order.id, order.id);
  f.authorization.authorizationId = 'synthetic-second-permission';
  await assert.rejects(restarted.issue({ ...f.input, idempotencyKey: 'synthetic-another-key' }), { code: 'control_idempotency_conflict' });
  assert.equal(f.state.calls.length, 0);
});

test('changed authorization or conditions cannot reuse an issued authorization identity', async () => {
  const f = await fixture(), order = await f.issued();
  f.authorization.termsText = 'Changed independently supplied terms.';
  await assert.rejects(f.issued(), { code: 'control_authorization_conflict' });
  await assert.rejects(f.service.initiate(f.own(order.id)), { code: 'control_authorization_changed' });
  assert.equal((await f.service.readOwnRecord(f.own(order.id))).attempt, null); assert.equal(f.state.calls.length, 0);
});

test('concurrent initiations reserve once and return public metadata without implying payment or renderer readiness', async () => {
  const f = await fixture(), order = await f.issued();
  const results = await Promise.all(Array.from({ length: 12 }, () => f.service.initiate(f.own(order.id))));
  assert.equal(f.state.calls.length, 1);
  for (const result of results) isPrivateFree(result);
  const current = await f.service.getOwn(f.own(order.id)); assert.equal(current.status, 'session_created'); isPrivateFree(current);
  const record = await f.service.readOwnRecord(f.own(order.id));
  assert.equal(record.attempt.createAttempts, 1); assert.equal(record.session.receipt.sessionId, 'SESSIONsyntheticPrivateControl123');
  assert.equal(record.attempt.localSessionDeadline, new Date(AT + 15 * 60000).toISOString());
  assert.equal((await f.store.listIndex('audit:all')).length, 3);
  const restarted = createTennisControlOrderService(f.deps);
  await restarted.initiate(f.own(order.id)); await restarted.issue({ ...f.input, idempotencyKey: 'synthetic-new-init-key' }); await restarted.initiate(f.own(order.id));
  assert.equal(f.state.calls.length, 1);
});

test('separate reservation grants one private permit and has no provider side effect', async () => {
  const f = await fixture(), order = await f.issued();
  const replies = await Promise.all(Array.from({ length: 10 }, () => f.service.reserveAttempt(f.own(order.id))));
  assert.equal(replies.filter(result => result.reserved).length, 1);
  assert.equal(replies.filter(result => !result.reserved).every(result => result.attempt === null), true);
  const permit = replies.find(result => result.reserved).attempt;
  assert.match(permit.providerOrderId, /^MC[0-9a-f]{32}$/); assert.match(permit.correlation, /^tcc_[A-Za-z0-9_-]{43}$/);
  assert.equal(permit.currency, 'USD'); assert.equal(permit.totalMinor, '100'); assert.equal(f.state.calls.length, 0);
  await f.service.initiate(f.own(order.id)); assert.equal(f.state.calls.length, 0);
});

test('lost issuance ACK recovers same durable order without duplicate issuance audit', async () => {
  const f = await fixture(), commit = f.store.commit.bind(f.store); let lost = false;
  f.store.commit = async c => { await commit(c); if (!lost && c.writes?.some(w => w.type === TENNIS_CONTROL_TYPES.order)) { lost = true; throw Error('synthetic-ack-private-secret'); } };
  const result = await f.service.issue(f.input); assert.equal(result.duplicate, true);
  assert.equal((await f.store.listIndex('audit:all')).length, 1);
  assert.equal((await createTennisControlOrderService(f.deps).issue(f.input)).order.id, result.order.id);
});

test('lost reservation ACK never grants a permit or initiates on replay or restart', async () => {
  const f = await fixture(), order = await f.issued(), commit = f.store.commit.bind(f.store); let lost = false;
  f.store.commit = async c => { await commit(c); if (!lost && c.writes?.some(w => w.type === TENNIS_CONTROL_TYPES.attempt)) { lost = true; throw Error('synthetic-private-reservation-secret'); } };
  const result = await f.service.initiate(f.own(order.id));
  assert.equal(result.status, 'creating'); assert.equal(f.state.calls.length, 0);
  const restarted = createTennisControlOrderService(f.deps);
  await restarted.initiate(f.own(order.id)); assert.equal((await restarted.reserveAttempt(f.own(order.id))).reserved, false);
  assert.equal(f.state.calls.length, 0); assert.equal((await f.store.listIndex('audit:all')).length, 2);
});

test('unknown external response stays uncertain and never resends even when transport later works', async () => {
  const f = await fixture(), order = await f.issued(); f.state.throwInitiate = true;
  const result = await f.service.initiate(f.own(order.id)); assert.equal(result.status, 'uncertain'); isPrivateFree(result);
  f.state.throwInitiate = false;
  const restarted = createTennisControlOrderService(f.deps);
  assert.equal((await restarted.initiate(f.own(order.id))).status, 'uncertain'); assert.equal(f.state.calls.length, 1);
  const record = await restarted.readOwnRecord(f.own(order.id)); assert.equal(record.session, null);
  assert.equal(JSON.stringify(record).includes('synthetic-private-provider-password'), false);
});

test('session-save ACK loss reads committed metadata and never initiates a replacement session', async () => {
  const f = await fixture(), order = await f.issued(), commit = f.store.commit.bind(f.store);
  f.store.commit = async c => { await commit(c); if (c.writes?.some(w => w.type === TENNIS_CONTROL_TYPES.session)) throw Error('synthetic-save-ack-secret'); };
  const result = await f.service.initiate(f.own(order.id)); assert.equal(result.status, 'session_created'); isPrivateFree(result);
  const restarted = createTennisControlOrderService(f.deps);
  await restarted.initiate(f.own(order.id)); assert.equal(f.state.calls.length, 1); assert.equal((await f.store.listIndex('audit:all')).length, 3);
});

test('authorization expiry and revocation after issue prevent any reservation or initiation', async () => {
  for (const revoke of [f => { f.setTime(AT + 3600000); }, f => { f.authorization.status = 'revoked'; }]) {
    const f = await fixture(), order = await f.issued(); revoke(f);
    await assert.rejects(f.service.initiate(f.own(order.id)));
    assert.equal((await f.service.readOwnRecord(f.own(order.id))).attempt, null); assert.equal(f.state.calls.length, 0);
  }
});

test('authorization changes during awaited pre-initiation verification cannot reach provider', async () => {
  const f = await fixture(), order = await f.issued();
  f.state.onAuthorization = () => { if (f.state.authorizations === 5) f.authorization.termsText = 'Changed during final permission check.'; };
  await assert.rejects(f.service.initiate(f.own(order.id)), { code: 'control_authorization_changed' });
  assert.equal(f.state.calls.length, 0);
  assert.equal((await f.service.readOwnRecord(f.own(order.id))).attempt.createAttempts, 1);
});

test('current owner and local deadline are rechecked after asynchronous authorization', async () => {
  for (const revoke of [f => f.suspend(), f => { f.setTime(AT + 3600000); }]) {
    const f = await fixture(), order = await f.issued(); f.state.onAuthorization = () => revoke(f);
    await assert.rejects(f.service.initiate(f.own(order.id))); assert.equal(f.state.calls.length, 0);
  }
});

test('concurrent uncertainty while final authorization awaits blocks the reserved external call', async () => {
  const f = await fixture(), order = await f.issued();
  f.state.onAuthorization = async () => {
    if (f.state.authorizations === 5) {
      const record = await f.service.readOwnRecord(f.own(order.id));
      await f.service.markUncertain({ ...f.own(order.id), correlation: record.attempt.correlation, reason: 'request_aborted' });
    }
  };
  assert.equal((await f.service.initiate(f.own(order.id))).status, 'uncertain'); assert.equal(f.state.calls.length, 0);
});

test('expired historical private records stay readable for independently verified late captures', async () => {
  const f = await fixture(), order = await f.issued(); await f.service.initiate(f.own(order.id));
  f.setTime(AT + 7200000); f.authorization.status = 'revoked';
  const record = await f.service.readOwnRecord(f.own(order.id));
  assert.equal(record.attempt.providerOrderId, f.state.calls[0].providerOrderId); assert.equal(record.session.receipt.sessionId, 'SESSIONsyntheticPrivateControl123');
  assert.equal((await f.service.getOwn(f.own(order.id))).status, 'expired');
  await f.service.initiate(f.own(order.id)); assert.equal(f.state.calls.length, 1);
});

test('session receipt rejects owner/correlation/order/amount/currency/time/TEST/private extras', async () => {
  for (const change of [
    r => { r.providerOrderId = `MC${'f'.repeat(32)}`; }, r => { r.correlation = `tcc_${'x'.repeat(43)}`; }, r => { r.currency = 'AED'; }, r => { r.totalMinor = '101'; },
    r => { r.sessionId = 'TEST-SESSION'; }, r => { r.contract = 'embedded'; }, r => { r.test = true; }, r => { r.mock = true; },
    r => { r.pan = 'synthetic-never-persist'; }, r => { r.password = 'synthetic-never-persist'; }, r => { r.successIndicator = 'unnecessary-sensitive-data'; },
    r => { r.verifiedAt = new Date(AT - 1).toISOString(); }, r => { r.verifiedAt = new Date(AT + 1).toISOString(); }, r => { r.localSessionDeadline = new Date(AT + 7200000).toISOString(); },
  ]) {
    const f = await fixture(), order = await f.issued(), permit = (await f.service.reserveAttempt(f.own(order.id))).attempt;
    const receipt = session(permit); change(receipt);
    await assert.rejects(f.service.recordSession({ ...f.own(order.id), correlation: permit.correlation, receipt }), { code: 'control_session_receipt_invalid' });
    assert.equal((await f.service.readOwnRecord(f.own(order.id))).session, null); assert.equal(f.state.calls.length, 0);
  }
  const f = await fixture(), order = await f.issued(), permit = (await f.service.reserveAttempt(f.own(order.id))).attempt;
  f.setTime(Date.parse(permit.localSessionDeadline));
  await assert.rejects(f.service.recordSession({ ...f.own(order.id), correlation: permit.correlation, receipt: session(permit, Date.parse(permit.localSessionDeadline)) }), { code: 'control_session_receipt_invalid' });
});

test('untrusted adapter fields cannot persist or leak and unknown outcome never becomes paid', async () => {
  const f = await fixture(), order = await f.issued(); f.state.receiptChange = r => { r.card = 'synthetic-card-private'; };
  const result = await f.service.initiate(f.own(order.id)); assert.equal(result.status, 'uncertain'); isPrivateFree(result);
  const record = await f.service.readOwnRecord(f.own(order.id)); assert.equal(record.session, null); assert.equal(record.attempt.reason, 'session_receipt_unverified');
  const audits = await Promise.all((await f.store.listIndex('audit:all')).map(id => f.store.get('audit', id)));
  assert.equal(JSON.stringify([...audits, record]).includes('synthetic-card-private'), false);
});

test('failed reservation before commit can retry safely but an acknowledged external attempt cannot', async () => {
  const f = await fixture(), order = await f.issued(); f.store.failNextCommit = 'store_unavailable';
  await assert.rejects(f.service.initiate(f.own(order.id)), { code: 'control_reservation_unconfirmed' });
  assert.equal((await f.service.readOwnRecord(f.own(order.id))).attempt, null); assert.equal(f.state.calls.length, 0);
  await f.service.initiate(f.own(order.id)); assert.equal(f.state.calls.length, 1);
  await f.service.initiate(f.own(order.id)); assert.equal(f.state.calls.length, 1);
});

test('issued snapshot rewrites or removed ownership/authorization/provider unique links fail closed', async () => {
  for (const change of [
    async (f, r) => { const row = await f.store.get(TENNIS_CONTROL_TYPES.order, r.order.id); await f.store.commit({ writes: [{ type: TENNIS_CONTROL_TYPES.order, id: row.doc.id, expectedVersion: row.version, doc: row.doc }] }); },
    (f, r) => f.store.releaseUnique('tennis_control_owner', r.order.id),
    (f, r) => f.store.releaseUnique('tennis_control_authorization', hashPayload(['maximus-tennis', r.order.authorization.id])),
    (f, r) => f.store.releaseUnique('tennis_control_provider', hashPayload(['MPGS', '300281', r.attempt.providerOrderId])),
  ]) {
    const f = await fixture(), order = await f.issued(); await f.service.initiate(f.own(order.id));
    const record = await f.service.readOwnRecord(f.own(order.id)); await change(f, record);
    await assert.rejects(f.service.readOwnRecord(f.own(order.id))); assert.equal(f.state.calls.length, 1);
  }
});

test('aborted owner request consumes no initial attempt and never submits a payment', async () => {
  const f = await fixture(), order = await f.issued(), controller = new AbortController(); controller.abort();
  await assert.rejects(f.service.initiate({ ...f.own(order.id), signal: controller.signal }), { code: 'control_request_aborted' });
  assert.equal((await f.service.readOwnRecord(f.own(order.id))).attempt, null); assert.equal(f.state.calls.length, 0);
});

test('real Redis one-attempt identity survives service/store recreation without a second initiation', async t => {
  let redis, bridge;
  try { redis = await startTestRedis(6417); bridge = await startBridge({ redisPort: 6417, token: 'synthetic-control-order-test' }); }
  catch (error) {
    bridge?.close(); await redis?.close();
    if (process.env.INTAKE_REQUIRE_REDIS === '1' || !['ENOENT', 'EACCES', 'EPERM'].includes(error.code)) throw error;
    return t.skip(`native Redis unavailable: ${error.code}`);
  }
  try {
    const options = { url: bridge.url, token: 'synthetic-control-order-test' }, f = await fixture(createUpstashStore(options));
    const order = await f.issued(); await Promise.all(Array.from({ length: 8 }, () => f.service.initiate(f.own(order.id))));
    assert.equal(f.state.calls.length, 1);
    const restarted = createTennisControlOrderService({ ...f.deps, store: createUpstashStore(options) });
    const record = await restarted.readOwnRecord(f.own(order.id)); assert.equal(record.attempt.providerOrderId, f.state.calls[0].providerOrderId);
    await restarted.initiate(f.own(order.id)); assert.equal(f.state.calls.length, 1);
  } finally { bridge?.close(); await redis?.close(); }
});
