/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/**
 * Payment control against a real redis-server (append-only persistence) through the Upstash
 * REST bridge: the same Lua commit path production uses. Covers restart persistence of the
 * order/attempt/session, repeated requests, webhook delivery and redelivery, and the one-session
 * guarantee that protects against a second charge. Gateway and reader are synthetic fixtures;
 * no bank request, card or money is involved. INTAKE_REQUIRE_REDIS=1 makes Redis mandatory.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { startTestRedis, startBridge } from './redis-rest-bridge.mjs';
import { createUpstashStore } from '../lib/platform/store.js';
import { createTennisControlRuntime } from '../lib/commerce/tennis-control-runtime.js';
import { createTennisControlAuthorizer, TENNIS_CONTROL_TERMS } from '../lib/commerce/tennis-control-authorizer.js';
import { TENNIS_CONTROL_SESSION_CONTRACT, TENNIS_CONTROL_TYPES } from '../lib/commerce/tennis-control-order.js';
import { TENNIS_CONTROL_PROOF_TYPE } from '../lib/commerce/tennis-control-proof.js';
import { handleTennisControlWebhook, TENNIS_CONTROL_WEBHOOK_TYPE } from '../lib/commerce/tennis-control-webhook.js';
import { hashPayload } from '../lib/platform/ids.js';

const PORT = 6418, TOKEN = 'synthetic-control-redis-local-only', SECRET = 'R'.repeat(32);
const AT = Date.parse('2026-10-13T06:00:00.000Z'), USER = `usr_${'0'.repeat(19)}7`, OWNER_EMAIL = 'redis-owner@example.invalid';
const ENV = { TENNIS_CONTROL_ENABLED: 'true', PORTAL_ENABLED: 'true', PORTAL_RUNTIME_VERIFIED: 'true', NATIVE_MPGS_API_PASSWORD: 'synthetic', TENNIS_CONTROL_OWNER_EMAIL: OWNER_EMAIL, MPGS_NOTIFICATION_SECRET: SECRET };
const ctx = { userId: USER, emailVerified: true, organizationId: 'maximus-tennis' };

/** Synthetic gateway: counts INITIATE_CHECKOUT calls; the reader reports what `state` says. */
function gateway(state, now) {
  const adapter = { merchantId: '300281',
    async inquire() { state.inquiries++; return { contract: 'mpgs_payment_options_inquiry_100_v1', merchantId: '300281', cardPayments: true, currencies: ['AED', 'USD'], threeDSecureSchemes: ['SECURE_CODE'], usdPermitted: true, observedAt: new Date(now()).toISOString() }; },
    async initiate({ attempt }) { state.posts.push(attempt.providerOrderId); return { contract: TENNIS_CONTROL_SESSION_CONTRACT, sessionId: `SESSIONsyntheticRedis${String(state.posts.length).padStart(8, '0')}`, providerOrderId: attempt.providerOrderId, currency: 'USD', totalMinor: '100', correlation: attempt.correlation, verifiedAt: new Date(now()).toISOString(), localSessionDeadline: attempt.localSessionDeadline }; } };
  const reader = {
    async discoverMovements(q) {
      state.reads++; if (!state.captured) return [];
      const fields = ['providerOrderId', 'transactionId', 'kind', 'amountMinor', 'currency', 'totalMinor', 'capturedMinor', 'refundedMinor', 'occurredAt', 'merchantId'];
      const m = { providerOrderId: q.providerOrderId, transactionId: 'capture_1', kind: 'capture', amountMinor: '100', currency: 'USD', totalMinor: '100', capturedMinor: '100', refundedMinor: '0', occurredAt: new Date(AT).toISOString(), merchantId: '300281', verifiedAt: new Date(now()).toISOString() };
      return [{ ...m, evidenceHash: hashPayload(Object.fromEntries(fields.map(key => [key, m[key]]))) }];
    },
    async readSummary({ providerOrderId }) { return state.captured ? { present: true, providerOrderId, observedAt: new Date(now()).toISOString(), orderStatus: 'CAPTURED', currencyMatches: true, amountMatches: true, capturedMinor: '100', transactionCount: 1, lastTransaction: { type: 'PAYMENT', result: 'SUCCESS', gatewayCode: 'APPROVED' } } : { present: false, providerOrderId, observedAt: new Date(now()).toISOString(), validationType: 'INVALID' }; },
  };
  return { adapter, reader };
}
const runtimeFor = (store, state, now) => createTennisControlRuntime({ store, authorizer: createTennisControlAuthorizer({ store, ownerEmail: OWNER_EMAIL, now }), ...gateway(state, now), now, production: false, authenticateCustomer: async () => ctx, webhookConfigured: true });
const hook = (body, headers) => new Request('https://maximus.tennis/api/control/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Notification-Secret': SECRET, 'X-Notification-ID': 'redis-notif-1', 'X-Notification-Attempt': '1', ...headers }, body: JSON.stringify(body) });

test('real Redis: control order, one session and proof survive a server restart; repeats, webhook redelivery and a second charge are contained', { timeout: 60000 }, async t => {
  let redis, bridge, directory;
  try { redis = await startTestRedis(PORT, { persist: true, timeoutMs: 5000 }); directory = redis.directory; bridge = await startBridge({ redisPort: PORT, token: TOKEN }); }
  catch (error) {
    bridge?.close(); await redis?.close();
    if (process.env.INTAKE_REQUIRE_REDIS === '1' || !['ENOENT', 'EACCES', 'EPERM'].includes(error.code)) throw error;
    return t.skip(`native Redis unavailable: ${error.code}`);
  }
  let at = AT; const now = () => at, state = { posts: [], reads: 0, inquiries: 0, captured: false, tasks: [] };
  try {
    const store = createUpstashStore({ url: bridge.url, token: TOKEN });
    assert.equal(await store.ping(), true);
    await store.commit({ writes: [{ type: 'user', id: USER, expectedVersion: -1, doc: { id: USER, status: 'active', emailNormalized: OWNER_EMAIL } }, { type: 'portalMembership', id: `maximus-tennis_${USER}`, expectedVersion: -1, doc: { userId: USER, organizationId: 'maximus-tennis' } }], uniques: [{ name: 'user_email', value: OWNER_EMAIL, owner: USER }] });
    const first = runtimeFor(store, state, now).service;

    // Repeated preparation with new idempotency keys reuses the one open order.
    const prepared = await first.prepare({ ctx, idempotencyKey: 'redis-idem-one', termsVersion: TENNIS_CONTROL_TERMS.version });
    const again = await first.prepare({ ctx, idempotencyKey: 'redis-idem-two', termsVersion: TENNIS_CONTROL_TERMS.version });
    assert.equal(prepared.duplicate, false); assert.equal(again.duplicate, true); assert.equal(again.order.id, prepared.order.id);
    const orderId = prepared.order.id;

    // Concurrent initiations reserve one attempt and create exactly one gateway session.
    const initiated = await Promise.all(Array.from({ length: 5 }, () => first.initiate({ ctx, orderId, locale: 'ru' })));
    assert.equal(state.posts.length, 1);
    const sessions = initiated.map(r => r.session?.sessionId).filter(Boolean);
    assert.ok(sessions.length >= 1); assert.equal(new Set(sessions).size, 1);
    // Losers of the race observe the reserved attempt while the winner's session is being saved; none creates another.
    assert.ok(initiated.every(r => ['creating', 'session_created'].includes(r.order.status)));
    const settled = await first.initiate({ ctx, orderId, locale: 'ru' });
    assert.equal(settled.order.status, 'session_created'); assert.equal(settled.session.sessionId, sessions[0]); assert.equal(state.posts.length, 1);
    const before = await first.status({ ctx, orderId });
    assert.equal(before.payment, 'awaiting_payment'); assert.equal(before.proof.status, 'pending');
    const attemptRow = await store.get(TENNIS_CONTROL_TYPES.attempt, orderId);
    assert.equal(attemptRow.doc.providerOrderId, state.posts[0]);

    // Graceful stop and restart on the same append-only directory: a fresh process must see the same records.
    bridge.close(); await redis.close({ keepDirectory: true });
    redis = await startTestRedis(PORT, { persist: true, directory, timeoutMs: 5000 });
    bridge = await startBridge({ redisPort: PORT, token: TOKEN });
    const restarted = createUpstashStore({ url: bridge.url, token: TOKEN });
    assert.equal((await restarted.get(TENNIS_CONTROL_TYPES.attempt, orderId)).doc.providerOrderId, state.posts[0]);
    const second = runtimeFor(restarted, state, now).service;
    const view = await second.current({ ctx });
    assert.equal(view.owner, true); assert.equal(view.order.id, orderId); assert.equal(view.canOpen, false); assert.equal(view.payment, 'awaiting_payment');
    // The rebuilt runtime hands back the same private session; it never sends a second INITIATE_CHECKOUT.
    const resumed = await second.initiate({ ctx, orderId, locale: 'ru' });
    assert.equal(resumed.session.sessionId, sessions[0]); assert.equal(state.posts.length, 1);
    // A new preparation while the attempt is open still returns that order, never a second attempt.
    const third = await second.prepare({ ctx, idempotencyKey: 'redis-idem-three', termsVersion: TENNIS_CONTROL_TERMS.version });
    assert.equal(third.duplicate, true); assert.equal(third.order.id, orderId);

    // Webhook before any capture: authenticated, recorded, acknowledged; the body cannot pay the order.
    const deps = { runtimeFactory: async () => ({ service: second, authenticateCustomer: async () => ctx }), env: ENV, now, schedule: task => { state.tasks.push(task()); } };
    const providerOrderId = state.posts[0];
    const body = { result: 'SUCCESS', order: { id: providerOrderId, amount: 1.00, currency: 'USD', status: 'CAPTURED' }, transaction: { id: 'capture_1', type: 'PAYMENT', amount: 1.00, currency: 'USD' }, response: { gatewayCode: 'APPROVED' } };
    const delivered = await handleTennisControlWebhook(hook(body), deps); assert.equal(delivered.status, 200);
    await Promise.all(state.tasks); state.tasks = [];
    assert.equal((await restarted.get(TENNIS_CONTROL_PROOF_TYPE, orderId)).doc.status, 'pending');
    assert.equal((await second.status({ ctx, orderId })).payment, 'awaiting_payment');
    // Wrong secret: refused before the body is read; nothing recorded.
    assert.equal((await handleTennisControlWebhook(hook(body, { 'X-Notification-Secret': 'X'.repeat(32) }), deps)).status, 401);

    // The gateway now shows an approved USD 1.00 capture: a redelivery of the same notification is one record with two deliveries.
    state.captured = true; at += 60000;
    const redelivered = await handleTennisControlWebhook(hook(body, { 'X-Notification-Attempt': '2' }), deps); assert.equal(redelivered.status, 200);
    await Promise.all(state.tasks); state.tasks = [];
    const events = await restarted.listIndex(`control:webhooks:${orderId}`, { limit: 10 });
    assert.equal(events.length, 1);
    const event = (await restarted.get(TENNIS_CONTROL_WEBHOOK_TYPE, events[0])).doc;
    assert.equal(event.deliveries.length, 2); assert.equal(event.redelivered, true); assert.equal(event.mismatch, false);
    const proof = (await restarted.get(TENNIS_CONTROL_PROOF_TYPE, orderId)).doc;
    assert.equal(proof.status, 'captured'); assert.equal(proof.capturedMinor, '100');
    const paid = await second.status({ ctx, orderId });
    assert.equal(paid.payment, 'paid'); assert.equal(paid.proof.status, 'captured');
    const version = (await restarted.get(TENNIS_CONTROL_PROOF_TYPE, orderId)).version;
    await second.status({ ctx, orderId }); await second.status({ ctx, orderId });
    assert.equal((await restarted.get(TENNIS_CONTROL_PROOF_TYPE, orderId)).version, version, 'idempotent proof');

    // A declared amount outside the scope is flagged for review in the webhook record but changes nothing.
    const flagged = await handleTennisControlWebhook(hook({ ...body, order: { ...body.order, amount: 2.00 } }, { 'X-Notification-ID': 'redis-notif-2' }), deps);
    assert.deepEqual(await flagged.json().then(r => r.reviewFlagged), true);
    await Promise.all(state.tasks); state.tasks = [];
    assert.equal((await second.status({ ctx, orderId })).payment, 'paid');

    // After the restart and the capture, the session was still created exactly once.
    assert.equal(state.posts.length, 1);
    const after = await second.current({ ctx });
    assert.equal(after.payment, 'paid'); assert.equal(after.canOpen, true, 'a paid control order spends its series');
  } finally {
    bridge?.close(); await redis?.close();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});
