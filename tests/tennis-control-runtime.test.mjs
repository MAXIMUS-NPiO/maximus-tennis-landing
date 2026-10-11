/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTennisControlRuntime, resolveTennisControlRuntime } from '../lib/commerce/tennis-control-runtime.js';
import { createTennisControlOrderService, TENNIS_CONTROL_SCOPE, TENNIS_CONTROL_TYPES } from '../lib/commerce/tennis-control-order.js';
import { createMemoryStore } from '../lib/platform/store.js';
import { hashPayload } from '../lib/platform/ids.js';

const AT = Date.parse('2026-10-11T12:00:00.000Z'), USER = `usr_${'0'.repeat(19)}1`, OTHER = `usr_${'0'.repeat(19)}2`;
/** Entirely synthetic authority and provider; no current merchant capability is asserted. */
async function fixture() {
  const store = createMemoryStore(); let at = AT;
  const ctx = { userId: USER, emailVerified: true, organizationId: 'maximus-tennis' };
  const grant = { status: 'verified', kind: 'payment_control_authorization', purpose: 'payment_control', mode: 'live', test: false,
    authenticationBasis: 'independently_verified_owner_authorization', authorizationId: 'synthetic-runtime-grant', evidenceId: 'synthetic-runtime-proof', scopeHash: TENNIS_CONTROL_SCOPE.hash,
    projectId: 'tennis', organizationId: 'maximus-tennis', ownerUserId: USER, currency: 'USD', totalMinor: '100', fulfillment: 'none',
    termsVersion: 'synthetic-runtime-terms', termsText: 'USD 1.00 control only. No goods, delivery or investment.', verifiedAt: new Date(AT - 1000).toISOString(), expiresAt: new Date(AT + 3600000).toISOString() };
  await store.commit({ writes: [USER, OTHER].flatMap(id => [{ type: 'user', id, expectedVersion: -1, doc: { id, status: 'active' } }, { type: 'portalMembership', id: `maximus-tennis_${id}`, expectedVersion: -1, doc: { userId: id, organizationId: 'maximus-tennis' } }]) });
  const state = { references: [], queries: [], onRead: null, captured: false, refund: '0' };
  const deps = { store, production: false, now: () => at, authenticateCustomer: async () => ctx,
    resolveAuthorizationReference: async context => { state.references.push(context); return 'synthetic-private-reference'; },
    resolveAuthorization: async ref => { assert.equal(ref, 'synthetic-private-reference'); return structuredClone(grant); },
    reader: { async discoverMovements(q) {
      state.queries.push(q); await state.onRead?.();
      if (!state.captured) return [];
      const fields = ['providerOrderId', 'transactionId', 'kind', 'amountMinor', 'currency', 'totalMinor', 'capturedMinor', 'refundedMinor', 'occurredAt', 'merchantId'];
      return [['capture', 'capture_1', '100'], ...(state.refund === '0' ? [] : [['refund', 'refund_1', state.refund]])].map(([kind, transactionId, amountMinor]) => {
        const m = { providerOrderId: q.providerOrderId, transactionId, kind, amountMinor, currency: 'USD', totalMinor: '100', capturedMinor: '100', refundedMinor: state.refund, occurredAt: new Date(AT).toISOString(), merchantId: '300281', verifiedAt: new Date(at).toISOString() };
        return { ...m, evidenceHash: hashPayload(Object.fromEntries(fields.map(key => [key, m[key]]))) };
      });
    } },
  };
  const make = () => createTennisControlRuntime(deps);
  const input = { ctx, idempotencyKey: 'synthetic-runtime-idem', termsVersion: grant.termsVersion };
  const reserve = async order => createTennisControlOrderService(deps).reserveAttempt({ ctx, orderId: order.id });
  const suspend = async () => { const row = await store.get('user', USER); await store.commit({ writes: [{ type: 'user', id: USER, expectedVersion: row.version, doc: { ...row.doc, status: 'suspended' } }] }); };
  return { store, ctx, grant, state, deps, make, input, reserve, suspend, advance: n => { at += n; } };
}

test('control runtime default stays null and assembly requires explicit trusted dependencies', async () => {
  assert.equal((await resolveTennisControlRuntime({ PORTAL_ENABLED: 'true', TENNIS_CONTROL_ENABLED: 'true', NATIVE_MPGS_API_PASSWORD: 'unused' })).service, null);
  const f = await fixture();
  for (const key of ['store', 'resolveAuthorization', 'resolveAuthorizationReference', 'reader', 'authenticateCustomer']) assert.throws(() => createTennisControlRuntime({ ...f.deps, [key]: undefined }));
  assert.throws(() => createTennisControlRuntime({ ...f.deps, production: true }));
  const runtime = f.make();
  assert.equal(runtime.service.readiness.runtimeEnabled, false); assert.equal(runtime.service.readiness.rendererReady, false); assert.equal(runtime.service.readiness.initiationAvailable, false);
  for (const key of ['initiate', 'orders', 'reserveAttempt', 'recordSession', 'refund']) assert.equal(runtime.service[key], undefined);
});

test('preparation uses a server reference and issues one USD1 order without reserving a bank attempt', async () => {
  const f = await fixture(), first = await f.make().service.prepare(f.input), repeated = await f.make().service.prepare({ ...f.input, idempotencyKey: 'synthetic-second-key' });
  assert.equal(first.order.id, repeated.order.id); assert.equal(first.duplicate, false); assert.equal(repeated.duplicate, true);
  assert.equal(first.order.currency, 'USD'); assert.equal(first.order.totalMinor, '100'); assert.equal(first.order.status, 'issued'); assert.equal(first.proof, null);
  assert.equal(await f.store.get(TENNIS_CONTROL_TYPES.attempt, first.order.id), null); assert.equal(f.state.queries.length, 0);
  assert.deepEqual(f.state.references[0], f.ctx);
  for (const field of ['sessionId', 'providerOrderId', 'authorizationReference', 'ownerUserId', 'snapshotHash']) assert.equal(JSON.stringify(first).includes(`"${field}"`), false);
});

test('runtime rejects caller financial, identity, receipt, reference and callback overrides', async () => {
  const f = await fixture(), runtime = f.make();
  for (const [key, value] of [['authorizationReference', 'foreign'], ['currency', 'AED'], ['totalMinor', '1'], ['ownerUserId', OTHER], ['sessionId', 'SESSIONprivate'], ['resultIndicator', 'SUCCESS']]) await assert.rejects(runtime.service.prepare({ ...f.input, [key]: value }), { code: 'control_input_invalid' });
  assert.equal(f.state.references.length, 0);
  const { order } = await runtime.service.prepare(f.input);
  await assert.rejects(runtime.service.status({ ctx: f.ctx, orderId: order.id, providerOrderId: 'arbitrary' }), { code: 'control_input_invalid' });
  assert.equal(f.state.queries.length, 0);
});

test('status of an unreserved order makes no provider read and gives no bank-ready claim', async () => {
  const f = await fixture(), runtime = f.make(), { order } = await runtime.service.prepare(f.input);
  const result = await runtime.service.status({ ctx: f.ctx, orderId: order.id });
  assert.equal(result.order.status, 'issued'); assert.equal(result.proof, null); assert.equal(f.state.queries.length, 0);
  assert.equal(result.order.paymentVerified, false); assert.equal(result.order.rendererReady, false);
});

test('reserved status reads only the durable bound provider and safely observes capture and refund', async () => {
  const f = await fixture(), { order } = await f.make().service.prepare(f.input), permit = await f.reserve(order), input = { ctx: f.ctx, orderId: order.id };
  let result = await f.make().service.status(input); assert.equal(result.proof.status, 'pending');
  assert.deepEqual(f.state.queries[0], { providerOrderId: permit.attempt.providerOrderId, limit: 20 });
  f.state.captured = true; result = await f.make().service.status(input); assert.equal(result.proof.status, 'captured');
  f.state.refund = '100'; result = await f.make().service.status(input); assert.equal(result.proof.status, 'refunded'); assert.equal(result.proof.ledgerPosted, false);
  assert.equal(result.order.paymentVerified, false); assert.equal(result.order.rendererReady, false);
  assert.equal((await f.store.get(TENNIS_CONTROL_TYPES.attempt, order.id)).doc.createAttempts, 1);
});

test('foreign owner and account revocation are checked before the reader and again after I/O', async () => {
  const f = await fixture(), { order } = await f.make().service.prepare(f.input); await f.reserve(order);
  await assert.rejects(f.make().service.status({ ctx: { ...f.ctx, userId: OTHER }, orderId: order.id }), { code: 'control_order_not_found' }); assert.equal(f.state.queries.length, 0);
  f.state.onRead = f.suspend;
  await assert.rejects(f.make().service.status({ ctx: f.ctx, orderId: order.id }), { code: 'control_verified_owner_required' });
  assert.equal(await f.store.get('tennisControlPaymentProof', order.id), null);
});

test('historical status remains inspectable after grant expiry without granting another attempt', async () => {
  const f = await fixture(), { order } = await f.make().service.prepare(f.input); await f.reserve(order);
  f.advance(7200000); f.grant.status = 'revoked'; f.state.captured = true;
  const result = await f.make().service.status({ ctx: f.ctx, orderId: order.id });
  assert.equal(result.order.status, 'expired'); assert.equal(result.proof.status, 'captured');
  await assert.rejects(f.make().service.prepare({ ...f.input, idempotencyKey: 'another-after-expiry' }), { code: 'control_authorization_required' });
});

test('aborted preparation and failed trusted authorization do not issue orders or leak errors', async () => {
  const f = await fixture(), signal = AbortSignal.abort();
  await assert.rejects(f.make().service.prepare({ ...f.input, signal }), { code: 'control_request_aborted' }); assert.equal(f.state.references.length, 0);
  const controller = new AbortController(); f.deps.resolveAuthorizationReference = async () => { controller.abort(); return 'synthetic-private-reference'; };
  await assert.rejects(f.make().service.prepare({ ...f.input, signal: controller.signal }), { code: 'control_request_aborted' });
  f.deps.resolveAuthorizationReference = async () => { throw new Error('secret-key https://private.example.invalid/session'); };
  await assert.rejects(f.make().service.prepare(f.input), { code: 'control_authorizer_unavailable', message: 'control_authorizer_unavailable' });
  assert.equal((await f.store.listIndex('audit:all')).length, 0);
});

test('lost order commit ACK and reconstructed runtime still resolve the same order', async () => {
  const f = await fixture(), original = f.store.commit.bind(f.store); let dropped = false;
  f.store.commit = async commit => { const result = await original(commit); if (!dropped && commit.writes?.some(w => w.type === TENNIS_CONTROL_TYPES.order)) { dropped = true; throw Error('lost-private-ack'); } return result; };
  const first = await f.make().service.prepare(f.input), next = await f.make().service.prepare(f.input);
  assert.equal(first.order.id, next.order.id); assert.equal(first.duplicate, true); assert.equal((await f.store.listIndex('audit:all')).length, 1);
  assert.equal(f.state.queries.length, 0);
});
