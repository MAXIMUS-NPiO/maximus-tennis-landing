/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { handleTennisControlWebhook, TENNIS_CONTROL_WEBHOOK_TYPE } from '../lib/commerce/tennis-control-webhook.js';
import { createTennisControlRuntime } from '../lib/commerce/tennis-control-runtime.js';
import { createTennisControlAuthorizer, TENNIS_CONTROL_TERMS } from '../lib/commerce/tennis-control-authorizer.js';
import { TENNIS_CONTROL_SESSION_CONTRACT, TENNIS_CONTROL_TYPES } from '../lib/commerce/tennis-control-order.js';
import { TENNIS_CONTROL_PROOF_TYPE } from '../lib/commerce/tennis-control-proof.js';
import { createMemoryStore } from '../lib/platform/store.js';
import { hashPayload } from '../lib/platform/ids.js';

const AT = Date.parse('2026-10-12T12:00:00.000Z'), USER = `usr_${'0'.repeat(19)}1`, SECRET = 'S'.repeat(32), OWNER_EMAIL = 'owner@example.invalid';
const ENV = { TENNIS_CONTROL_ENABLED: 'true', PORTAL_ENABLED: 'true', PORTAL_RUNTIME_VERIFIED: 'true', NATIVE_MPGS_API_PASSWORD: 'synthetic', TENNIS_CONTROL_OWNER_EMAIL: OWNER_EMAIL, MPGS_NOTIFICATION_SECRET: SECRET };
const hook = (body, headers = {}, { method = 'POST' } = {}) => new Request('https://maximus.tennis/api/control/webhook', { method, headers: { 'Content-Type': 'application/json', 'X-Notification-Secret': SECRET, 'X-Notification-ID': 'notif-1', 'X-Notification-Attempt': '1', ...headers }, ...(method === 'POST' ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}) });

async function fixture() {
  const store = createMemoryStore(); let at = AT;
  const ctx = { userId: USER, emailVerified: true, organizationId: 'maximus-tennis' };
  await store.commit({ writes: [{ type: 'user', id: USER, expectedVersion: -1, doc: { id: USER, status: 'active', emailNormalized: OWNER_EMAIL } }, { type: 'portalMembership', id: `maximus-tennis_${USER}`, expectedVersion: -1, doc: { userId: USER, organizationId: 'maximus-tennis' } }], uniques: [{ name: 'user_email', value: OWNER_EMAIL, owner: USER }] });
  const state = { reads: 0, captured: false, gateway: null, tasks: [] };
  const adapter = { merchantId: '300281', async inquire() { return { contract: 'mpgs_payment_options_inquiry_100_v1', merchantId: '300281', cardPayments: true, currencies: ['USD'], threeDSecureSchemes: [], usdPermitted: true, observedAt: new Date(at).toISOString() }; },
    async initiate({ attempt }) { return { contract: TENNIS_CONTROL_SESSION_CONTRACT, sessionId: 'SESSIONsyntheticPrivateControl123', providerOrderId: attempt.providerOrderId, currency: 'USD', totalMinor: '100', correlation: attempt.correlation, verifiedAt: new Date(at).toISOString(), localSessionDeadline: attempt.localSessionDeadline }; } };
  const reader = { async discoverMovements(q) {
      state.reads++; if (!state.captured) return [];
      const fields = ['providerOrderId', 'transactionId', 'kind', 'amountMinor', 'currency', 'totalMinor', 'capturedMinor', 'refundedMinor', 'occurredAt', 'merchantId'];
      const m = { providerOrderId: q.providerOrderId, transactionId: 'capture_1', kind: 'capture', amountMinor: '100', currency: 'USD', totalMinor: '100', capturedMinor: '100', refundedMinor: '0', occurredAt: new Date(AT).toISOString(), merchantId: '300281', verifiedAt: new Date(at).toISOString() };
      return [{ ...m, evidenceHash: hashPayload(Object.fromEntries(fields.map(key => [key, m[key]]))) }];
    }, async readSummary({ providerOrderId }) { return { present: Boolean(state.gateway), providerOrderId, observedAt: new Date(at).toISOString(), currencyMatches: true, amountMatches: true, capturedMinor: state.captured ? '100' : '0', transactionCount: 1, ...(state.gateway || {}) }; } };
  const authorizer = createTennisControlAuthorizer({ store, ownerEmail: OWNER_EMAIL, now: () => at });
  const runtime = createTennisControlRuntime({ store, authorizer, adapter, reader, now: () => at, production: false, authenticateCustomer: async () => ctx, webhookConfigured: true });
  const { order } = await runtime.service.prepare({ ctx, idempotencyKey: 'webhook-fixture-idem', termsVersion: TENNIS_CONTROL_TERMS.version });
  await runtime.service.initiate({ ctx, orderId: order.id, locale: 'en' });
  const providerOrderId = (await store.get(TENNIS_CONTROL_TYPES.attempt, order.id)).doc.providerOrderId;
  const deps = { runtimeFactory: async () => runtime, env: ENV, now: () => at, schedule: task => { state.tasks.push(task()); } };
  const call = (body, headers, options) => handleTennisControlWebhook(hook(body, headers, options), { ...deps, ...options?.deps });
  const settle = async () => { await Promise.all(state.tasks); state.tasks = []; };
  const notification = extra => ({ result: 'SUCCESS', order: { id: providerOrderId, amount: 1.00, currency: 'USD', status: 'CAPTURED' }, transaction: { id: 'capture_1', type: 'PAYMENT', amount: 1.00, currency: 'USD' }, response: { gatewayCode: 'APPROVED' }, sourceOfFunds: { provided: { card: { number: '512345xxxxxx0008' } } }, ...extra });
  return { store, ctx, runtime, order, providerOrderId, state, deps, call, settle, notification };
}

test('an authenticated notification is recorded, acknowledged and verified through the authenticated read only', async () => {
  const f = await fixture(); f.state.captured = true; f.state.gateway = { orderStatus: 'CAPTURED', lastTransaction: { type: 'PAYMENT', result: 'SUCCESS', gatewayCode: 'APPROVED' } };
  const response = await f.call(f.notification()); const p = await response.json();
  assert.equal(response.status, 200); assert.equal(p.code, 'webhook_received'); assert.equal(p.received, true); assert.equal(p.reviewFlagged, undefined);
  assert.equal(JSON.stringify(p).includes(f.providerOrderId), false); assert.equal(response.headers.get('cache-control'), 'no-store, private');
  await f.settle();
  assert.equal(f.state.reads, 1);
  const proof = await f.store.get(TENNIS_CONTROL_PROOF_TYPE, f.order.id); assert.equal(proof.doc.status, 'captured');
  const events = await f.store.listIndex(`control:webhooks:${f.order.id}`); assert.equal(events.length, 1);
  const event = (await f.store.get(TENNIS_CONTROL_WEBHOOK_TYPE, events[0])).doc;
  assert.equal(event.orderId, f.order.id); assert.equal(event.notificationId, 'notif-1'); assert.deepEqual(event.deliveries, [{ at: new Date(AT).toISOString(), attempt: 1 }]); assert.equal(event.mismatch, false);
  assert.deepEqual(event.declared, { result: 'SUCCESS', type: 'PAYMENT', gatewayCode: 'APPROVED', orderStatus: 'CAPTURED', currency: 'USD', amountMinor: '100', mismatch: false });
  assert.equal(JSON.stringify(event).includes('0008'), false);
  assert.equal((await f.runtime.service.status({ ctx: f.ctx, orderId: f.order.id })).payment, 'paid');
});

test('the notification body cannot mark an order paid: without a verified capture the proof stays pending', async () => {
  const f = await fixture(); f.state.gateway = { orderStatus: 'FAILED', lastTransaction: { type: 'PAYMENT', result: 'FAILURE', gatewayCode: 'DECLINED' } };
  assert.equal((await f.call(f.notification())).status, 200); await f.settle();
  assert.equal((await f.store.get(TENNIS_CONTROL_PROOF_TYPE, f.order.id)).doc.status, 'pending');
  assert.equal((await f.runtime.service.status({ ctx: f.ctx, orderId: f.order.id })).payment, 'declined');
});

test('redelivery with the same notification id is idempotent: one record, appended attempts, one more verification', async () => {
  const f = await fixture();
  assert.equal((await f.call(f.notification())).status, 200);
  const again = await f.call(f.notification(), { 'X-Notification-Attempt': '2' }); assert.equal(again.status, 200); assert.equal((await again.json()).code, 'webhook_received');
  await f.settle();
  const events = await f.store.listIndex(`control:webhooks:${f.order.id}`); assert.equal(events.length, 1);
  const event = (await f.store.get(TENNIS_CONTROL_WEBHOOK_TYPE, events[0])).doc;
  // Concurrent verifications may re-read against a newer stored proof version; each one still ends in one state.
  assert.equal(event.redelivered, true); assert.deepEqual(event.deliveries.map(d => d.attempt), [1, 2]); assert.ok(f.state.reads >= 2 && f.state.reads <= 3);
  assert.equal((await f.call(f.notification(), { 'X-Notification-ID': 'notif-2' })).status, 200); await f.settle();
  assert.equal((await f.store.listIndex(`control:webhooks:${f.order.id}`)).length, 2);
  // Missing notification id falls back to the body digest, so an exact duplicate still has one record.
  for (const header of [{ 'X-Notification-ID': '' }, { 'X-Notification-ID': '' }]) assert.equal((await f.call(f.notification({ result: 'PENDING' }), header)).status, 200);
  await f.settle(); assert.equal((await f.store.listIndex(`control:webhooks:${f.order.id}`)).length, 3);
});

test('a declared amount or currency outside the control scope is flagged for review, never applied', async () => {
  const f = await fixture();
  for (const [extra, flagged] of [[{ order: { id: f.providerOrderId, amount: 100.00, currency: 'USD' } }, true], [{ order: { id: f.providerOrderId, amount: 1.00, currency: 'AED' } }, true], [{ result: 'FAILURE', order: { id: f.providerOrderId, amount: 0, currency: 'USD' }, response: { gatewayCode: 'DECLINED' } }, false], [{ transaction: { type: 'AUTHENTICATION' }, order: { id: f.providerOrderId, amount: 0, currency: 'USD' } }, false]]) {
    const response = await f.call(f.notification(extra), { 'X-Notification-ID': `mismatch-${JSON.stringify(extra).length}-${flagged}` }); const p = await response.json();
    assert.equal(response.status, 200); assert.equal(p.reviewFlagged, flagged ? true : undefined);
  }
  await f.settle();
  const events = await Promise.all((await f.store.listIndex(`control:webhooks:${f.order.id}`)).map(id => f.store.get(TENNIS_CONTROL_WEBHOOK_TYPE, id)));
  assert.deepEqual(events.map(e => e.doc.mismatch).sort(), [false, false, true, true]);
  assert.equal((await f.store.get(TENNIS_CONTROL_PROOF_TYPE, f.order.id)).doc.status, 'pending');
});

test('secret authentication precedes the body: missing, wrong and empty secrets are rejected unread', async () => {
  const f = await fixture();
  for (const headers of [{ 'X-Notification-Secret': '' }, { 'X-Notification-Secret': 'wrong' }, { 'X-Notification-Secret': SECRET.slice(0, 31) + 'x' }]) {
    const req = hook(f.notification(), headers); const response = await handleTennisControlWebhook(req, f.deps);
    assert.equal(response.status, 401); assert.equal(req.bodyUsed, false);
  }
  const unsigned = new Request('https://maximus.tennis/api/control/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f.notification()) });
  assert.equal((await handleTennisControlWebhook(unsigned, f.deps)).status, 401);
  assert.equal((await f.store.listIndex(`control:webhooks:${f.order.id}`)).length, 0); assert.equal(f.state.reads, 0);
  const get = await handleTennisControlWebhook(hook(null, {}, { method: 'GET' }), f.deps); assert.equal(get.status, 405); assert.equal(get.headers.get('allow'), 'POST');
});

test('unconfigured runtime or missing secret configuration refuses with 503 before reading anything', async () => {
  const f = await fixture();
  const req = hook(f.notification());
  assert.equal((await handleTennisControlWebhook(req, { ...f.deps, runtimeFactory: async () => ({ service: null }) })).status, 503); assert.equal(req.bodyUsed, false);
  const noSecret = await handleTennisControlWebhook(hook(f.notification()), { ...f.deps, env: { ...ENV, MPGS_NOTIFICATION_SECRET: undefined } });
  assert.equal(noSecret.status, 503); assert.equal((await noSecret.json()).code, 'webhook_unconfigured');
  assert.equal((await handleTennisControlWebhook(hook(f.notification()), f.deps)).status, 200);
});

test('unknown, foreign and malformed orders are acknowledged and ignored; malformed bodies are rejected', async () => {
  const f = await fixture();
  for (const body of [f.notification({ order: { id: `MC${'f'.repeat(32)}`, amount: 1, currency: 'USD' } }), f.notification({ order: { id: 'native-goods-123' } }), { result: 'SUCCESS' }, f.notification({ order: null })]) {
    const response = await f.call(body); const p = await response.json(); assert.equal(response.status, 200); assert.equal(p.ignored, true);
  }
  assert.equal((await f.store.listIndex(`control:webhooks:${f.order.id}`)).length, 0); assert.equal(f.state.tasks.length, 0);
  for (const [body, headers, status] of [['{bad', {}, 400], ['[]', {}, 400], ['"x"', {}, 400], [JSON.stringify(f.notification()), { 'Content-Type': 'text/plain' }, 415], [JSON.stringify(f.notification()), { 'Content-Length': '70000' }, 413]]) assert.equal((await f.call(body, headers)).status, status);
  const big = await f.call(JSON.stringify({ ...f.notification(), pad: 'x'.repeat(70000) })); assert.equal(big.status, 413);
});

test('verification failures never fail the acknowledgement and a later delivery still verifies', async () => {
  const f = await fixture();
  const failing = { ...f.runtime, service: { ...f.runtime.service, system: { ...f.runtime.service.system, verify: async () => { throw new Error('secret transport detail'); } } } };
  const response = await f.call(f.notification(), {}, { deps: { runtimeFactory: async () => failing } });
  assert.equal(response.status, 200); await f.settle();
  f.state.captured = true; f.state.gateway = { orderStatus: 'CAPTURED', lastTransaction: { type: 'PAYMENT', result: 'SUCCESS', gatewayCode: 'APPROVED' } };
  assert.equal((await f.call(f.notification(), { 'X-Notification-Attempt': '2' })).status, 200); await f.settle();
  assert.equal((await f.store.get(TENNIS_CONTROL_PROOF_TYPE, f.order.id)).doc.status, 'captured');
  // Without a scheduler the verification runs inline and still cannot break the acknowledgement.
  const inline = await handleTennisControlWebhook(hook(f.notification(), { 'X-Notification-ID': 'inline-1' }), { ...f.deps, schedule: undefined, runtimeFactory: async () => failing });
  assert.equal(inline.status, 200);
});
