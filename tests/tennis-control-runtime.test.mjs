/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTennisControlRuntime, buildTennisControlRuntime, resolveTennisControlRuntime, readTennisControlConfig, deriveTennisControlPayment, TENNIS_CONTROL_MERCHANT_CHECK_TYPE } from '../lib/commerce/tennis-control-runtime.js';
import { createTennisControlAuthorizer, TENNIS_CONTROL_GRANT_TYPES, TENNIS_CONTROL_TERMS } from '../lib/commerce/tennis-control-authorizer.js';
import { TENNIS_CONTROL_TYPES, TENNIS_CONTROL_SESSION_CONTRACT } from '../lib/commerce/tennis-control-order.js';
import { createMemoryStore } from '../lib/platform/store.js';
import { hashPayload } from '../lib/platform/ids.js';

const AT = Date.parse('2026-10-12T12:00:00.000Z'), USER = `usr_${'0'.repeat(19)}1`, OTHER = `usr_${'0'.repeat(19)}2`;
const OWNER_EMAIL = 'Owner.Synthetic@Example.invalid', OTHER_EMAIL = 'member@example.invalid';
/** Entirely synthetic authority, gateway and reader; no current merchant capability is asserted. */
async function fixture({ ownerEmail = OWNER_EMAIL } = {}) {
  const store = createMemoryStore(); let at = AT;
  const ctx = { userId: USER, emailVerified: true, organizationId: 'maximus-tennis' };
  const otherCtx = { userId: OTHER, emailVerified: true, organizationId: 'maximus-tennis' };
  await store.commit({ writes: [[USER, OWNER_EMAIL], [OTHER, OTHER_EMAIL]].flatMap(([id, email]) => [
    { type: 'user', id, expectedVersion: -1, doc: { id, status: 'active', emailNormalized: email.toLowerCase(), emailDisplay: email } },
    { type: 'portalMembership', id: `maximus-tennis_${id}`, expectedVersion: -1, doc: { userId: id, organizationId: 'maximus-tennis' } }]),
    uniques: [{ name: 'user_email', value: OWNER_EMAIL.toLowerCase(), owner: USER }, { name: 'user_email', value: OTHER_EMAIL, owner: OTHER }] });
  const state = { posts: [], inquiries: 0, currencies: ['AED', 'USD'], inquiryFails: false, queries: [], summaries: [], captured: false, refund: '0', gateway: null, onRead: null, throwInitiate: false };
  const adapter = {
    merchantId: '300281',
    async inquire() { state.inquiries++; if (state.inquiryFails) throw Object.assign(new Error('tennis_control_mpgs_inquiry_uncertain'), { code: 'tennis_control_mpgs_inquiry_uncertain' }); return { contract: 'mpgs_payment_options_inquiry_100_v1', merchantId: '300281', cardPayments: true, currencies: [...state.currencies], threeDSecureSchemes: ['SECURE_CODE'], usdPermitted: state.currencies.includes('USD'), observedAt: new Date(at).toISOString() }; },
    async initiate({ attempt, locale }) {
      const record = await store.get(TENNIS_CONTROL_TYPES.attempt, attempt.orderId);
      assert.equal(record.doc.status, 'creating'); assert.equal(typeof locale, 'string');
      state.posts.push({ attempt: structuredClone(attempt), locale });
      if (state.throwInitiate) throw Error('synthetic-private-provider-password');
      return { contract: TENNIS_CONTROL_SESSION_CONTRACT, sessionId: 'SESSIONsyntheticPrivateControl123', providerOrderId: attempt.providerOrderId, currency: 'USD', totalMinor: '100', correlation: attempt.correlation, verifiedAt: new Date(at).toISOString(), localSessionDeadline: attempt.localSessionDeadline };
    },
  };
  const reader = {
    async discoverMovements(q) {
      state.queries.push(q); await state.onRead?.();
      if (!state.captured) return [];
      const fields = ['providerOrderId', 'transactionId', 'kind', 'amountMinor', 'currency', 'totalMinor', 'capturedMinor', 'refundedMinor', 'occurredAt', 'merchantId'];
      return [['capture', 'capture_1', '100'], ...(state.refund === '0' ? [] : [['refund', 'refund_1', state.refund]])].map(([kind, transactionId, amountMinor]) => {
        const m = { providerOrderId: q.providerOrderId, transactionId, kind, amountMinor, currency: 'USD', totalMinor: '100', capturedMinor: '100', refundedMinor: state.refund, occurredAt: new Date(AT).toISOString(), merchantId: '300281', verifiedAt: new Date(at).toISOString() };
        return { ...m, evidenceHash: hashPayload(Object.fromEntries(fields.map(key => [key, m[key]]))) };
      });
    },
    async readSummary({ providerOrderId }) {
      state.summaries.push(providerOrderId);
      if (!state.gateway) return { present: false, providerOrderId, observedAt: new Date(at).toISOString(), validationType: 'INVALID' };
      return { present: true, providerOrderId, observedAt: new Date(at).toISOString(), currencyMatches: true, amountMatches: true, capturedMinor: state.captured ? '100' : '0', transactionCount: 1, ...state.gateway };
    },
  };
  const authorizer = createTennisControlAuthorizer({ store, ownerEmail, now: () => at });
  const deps = { store, authorizer, adapter, reader, production: false, now: () => at, authenticateCustomer: async () => ctx, webhookConfigured: false };
  const make = () => createTennisControlRuntime(deps);
  const input = { ctx, idempotencyKey: 'synthetic-runtime-idem', termsVersion: TENNIS_CONTROL_TERMS.version };
  const suspend = async () => { const row = await store.get('user', USER); await store.commit({ writes: [{ type: 'user', id: USER, expectedVersion: row.version, doc: { ...row.doc, status: 'suspended' } }] }); };
  return { store, ctx, otherCtx, state, deps, make, input, suspend, advance: n => { at += n; } };
}
const isPrivateFree = value => {
  const raw = JSON.stringify(value);
  for (const field of ['providerOrderId', 'correlation', 'authorizationReference', 'ownerUserId', 'snapshotHash', 'authorizationId', 'evidenceId', 'password', 'successIndicator']) assert.equal(raw.includes(`"${field}"`), false, field);
};

test('configuration names every missing gate and the default runtime stays null without the explicit switch', async () => {
  const base = { TENNIS_CONTROL_ENABLED: 'true', PORTAL_ENABLED: 'true', PORTAL_RUNTIME_VERIFIED: 'true', NATIVE_MPGS_API_PASSWORD: 'synthetic-password', TENNIS_CONTROL_OWNER_EMAIL: OWNER_EMAIL };
  const full = readTennisControlConfig(base);
  assert.equal(full.enabled, true); assert.deepEqual(full.missing, []); assert.equal(full.merchantId, '300281'); assert.equal(full.merchantName, 'MAXIMUS SPORTS EQUIPMENT TRADING LLC'); assert.equal(full.webhookConfigured, false); assert.equal(full.notificationUrl, null);
  assert.deepEqual(readTennisControlConfig({}).missing, ['tennis_control_not_enabled', 'portal_runtime', 'mpgs_server_credentials', 'control_owner_email']);
  assert.deepEqual(readTennisControlConfig({ ...base, TENNIS_CONTROL_MERCHANT_ID: 'bad id', TENNIS_CONTROL_MERCHANT_NAME: 'x'.repeat(41), MPGS_NOTIFICATION_SECRET: 'short' }).missing, ['merchant_id_invalid', 'merchant_name_invalid', 'notification_secret_invalid']);
  const withHook = readTennisControlConfig({ ...base, MPGS_NOTIFICATION_SECRET: 'S'.repeat(32), TENNIS_CONTROL_MERCHANT_ID: 'MERCHANT_2' });
  assert.equal(withHook.webhookConfigured, true); assert.equal(withHook.notificationUrl, 'https://maximus.tennis/api/control/webhook'); assert.equal(withHook.merchantId, 'MERCHANT_2');
  assert.equal((await resolveTennisControlRuntime()).service, null);
  assert.equal((await buildTennisControlRuntime({ ...base, TENNIS_CONTROL_ENABLED: 'false' })).service, null);
  assert.deepEqual((await buildTennisControlRuntime({ ...base, PORTAL_ENABLED: 'true', PORTAL_RUNTIME_VERIFIED: 'false' })).missing, ['portal_runtime']);
  // Enabled configuration without a durable store builds nothing, and never a memory fallback.
  assert.deepEqual((await buildTennisControlRuntime(base)).missing, ['durable_store']);
  const built = await buildTennisControlRuntime({ ...base, NODE_ENV: 'test' }, { store: createMemoryStore(), fetchImpl: async () => { throw new Error('offline'); }, authenticateCustomer: async () => null });
  assert.equal(built.service.readiness.runtimeEnabled, true); assert.equal(built.service.readiness.merchantId, '300281'); assert.equal(built.service.readiness.sdk.url, 'https://ap-gateway.mastercard.com/static/checkout/checkout.min.js');
  assert.equal((await buildTennisControlRuntime({ ...base, NODE_ENV: 'production' }, { store: createMemoryStore() })).service, null);
});

test('assembly requires explicit trusted dependencies and exposes a live readiness contract', async () => {
  const f = await fixture();
  for (const key of ['store', 'authorizer', 'adapter', 'reader', 'authenticateCustomer']) assert.throws(() => createTennisControlRuntime({ ...f.deps, [key]: undefined }), { code: 'control_runtime_dependencies_required' });
  assert.throws(() => createTennisControlRuntime({ ...f.deps, production: true }));
  const runtime = f.make();
  assert.equal(runtime.service.readiness.runtimeEnabled, true); assert.equal(runtime.service.readiness.initiationAvailable, true); assert.equal(runtime.service.readiness.financialProductEnabled, false);
  assert.equal(runtime.service.readiness.embeddedContract, 'mpgs_hosted_checkout_embedded_v1'); assert.equal(runtime.service.readiness.sdk.mount, 'showEmbeddedPage');
});

test('preparation binds the configured owner through the durable grant and issues one USD1 order', async () => {
  const f = await fixture(), first = await f.make().service.prepare(f.input), repeated = await f.make().service.prepare({ ...f.input, idempotencyKey: 'synthetic-second-key' });
  assert.equal(first.order.id, repeated.order.id); assert.equal(first.duplicate, false); assert.equal(repeated.duplicate, true);
  assert.equal(first.order.currency, 'USD'); assert.equal(first.order.totalMinor, '100'); assert.equal(first.order.status, 'issued'); assert.equal(first.order.terms.version, TENNIS_CONTROL_TERMS.version); assert.equal(first.order.terms.text, TENNIS_CONTROL_TERMS.text);
  assert.equal(await f.store.get(TENNIS_CONTROL_TYPES.attempt, first.order.id), null); assert.equal(f.state.queries.length, 0); assert.equal(f.state.posts.length, 0);
  assert.equal((await f.store.get(TENNIS_CONTROL_GRANT_TYPES.head, USER)).doc.series, 1);
  isPrivateFree(first);
  await assert.rejects(f.make().service.prepare({ ...f.input, termsVersion: 'other-terms' }), { code: 'control_terms_mismatch' });
});

test('a verified member who is not the configured owner, a guest and a suspended owner cannot prepare', async () => {
  const f = await fixture();
  await assert.rejects(f.make().service.prepare({ ...f.input, ctx: f.otherCtx }), { code: 'control_owner_mismatch' });
  for (const ctx of [{}, { userId: USER, organizationId: 'maximus-tennis', emailVerified: false }, { userId: USER, organizationId: 'other', emailVerified: true }]) await assert.rejects(f.make().service.prepare({ ...f.input, ctx }), { code: 'control_verified_owner_required' });
  await f.suspend();
  await assert.rejects(f.make().service.prepare(f.input), { code: 'control_verified_owner_required' });
  assert.equal(await f.store.get(TENNIS_CONTROL_GRANT_TYPES.head, USER), null); assert.equal(await f.store.get(TENNIS_CONTROL_GRANT_TYPES.head, OTHER), null);
  const configured = await fixture({ ownerEmail: 'someone-else@example.invalid' });
  await assert.rejects(configured.make().service.prepare(configured.input), { code: 'control_owner_mismatch' });
});

test('initiation checks the acquirer currency list once, reserves one attempt and returns the private session only to the owner', async () => {
  const f = await fixture(), { order } = await f.make().service.prepare(f.input);
  const result = await f.make().service.initiate({ ctx: f.ctx, orderId: order.id, locale: 'ru' });
  assert.equal(result.order.status, 'session_created'); assert.equal(f.state.inquiries, 1); assert.equal(f.state.posts.length, 1); assert.equal(f.state.posts[0].locale, 'ru');
  assert.deepEqual(result.session, { contract: 'mpgs_hosted_checkout_embedded_v1', serverVerified: true, sessionId: 'SESSIONsyntheticPrivateControl123', gatewayOrigin: 'https://ap-gateway.mastercard.com', sdkUrl: 'https://ap-gateway.mastercard.com/static/checkout/checkout.min.js', sdkVersion: '100', expiresAt: result.order.localSessionDeadline });
  assert.equal(Date.parse(result.order.localSessionDeadline), AT + 15 * 60 * 1000);
  const again = await f.make().service.initiate({ ctx: f.ctx, orderId: order.id, locale: 'en' });
  assert.equal(again.session.sessionId, result.session.sessionId); assert.equal(f.state.posts.length, 1); assert.equal(f.state.inquiries, 1);
  assert.equal((await f.store.get(TENNIS_CONTROL_MERCHANT_CHECK_TYPE, '300281')).doc.status, 'ok');
  await assert.rejects(f.make().service.initiate({ ctx: f.otherCtx, orderId: order.id, locale: 'en' }), { code: 'control_order_not_found' });
  f.advance(15 * 60 * 1000);
  const late = await f.make().service.initiate({ ctx: f.ctx, orderId: order.id, locale: 'en' });
  assert.equal(late.order.status, 'expired'); assert.equal(late.session, null); assert.equal(f.state.posts.length, 1);
  await assert.rejects(f.make().service.initiate({ ctx: f.ctx, orderId: order.id, locale: 'xx' }), { code: 'control_input_invalid' });
});

test('a definitive acquirer answer without USD blocks initiation before any session POST; an unavailable inquiry does not', async () => {
  const f = await fixture(); f.state.currencies = ['AED'];
  const { order } = await f.make().service.prepare(f.input);
  await assert.rejects(f.make().service.initiate({ ctx: f.ctx, orderId: order.id, locale: 'en' }), { code: 'control_currency_not_permitted' });
  assert.equal(f.state.posts.length, 0); assert.equal(await f.store.get(TENNIS_CONTROL_TYPES.attempt, order.id), null);
  const ready = await f.make().service.readinessFor({ ctx: f.ctx }); assert.equal(ready.merchant.usdPermitted, false); assert.deepEqual(ready.merchant.currencies, ['AED']);
  const g = await fixture(); g.state.inquiryFails = true;
  const issued = await g.make().service.prepare(g.input);
  const result = await g.make().service.initiate({ ctx: g.ctx, orderId: issued.order.id, locale: 'en' });
  assert.equal(result.order.status, 'session_created'); assert.equal(g.state.posts.length, 1);
  const check = await g.make().service.readinessFor({ ctx: g.ctx }); assert.equal(check.merchant.status, 'unavailable'); assert.equal(check.merchant.usdPermitted, null);
  await assert.rejects(g.make().service.readinessFor({ ctx: g.otherCtx }), { code: 'control_owner_mismatch' });
});

test('status is authenticated observation: awaiting payment, declined, authentication pending, paid and refunded', async () => {
  const f = await fixture(), { order } = await f.make().service.prepare(f.input), input = { ctx: f.ctx, orderId: order.id };
  let result = await f.make().service.status(input);
  assert.equal(result.payment, 'not_started'); assert.equal(result.proof, null); assert.equal(result.observation, null); assert.equal(f.state.queries.length, 0);
  await f.make().service.initiate({ ...input, locale: 'en' });
  result = await f.make().service.status(input);
  assert.equal(result.payment, 'awaiting_payment'); assert.equal(result.proof.status, 'pending'); assert.equal(result.observation.present, false);
  f.state.gateway = { orderStatus: 'AUTHENTICATION_INITIATED', lastTransaction: { type: 'AUTHENTICATION', result: 'PENDING', gatewayCode: 'PENDING' } };
  assert.equal((await f.make().service.status(input)).payment, 'authentication_pending');
  f.state.gateway = { orderStatus: 'FAILED', lastTransaction: { type: 'PAYMENT', result: 'FAILURE', gatewayCode: 'DECLINED' } };
  result = await f.make().service.status(input); assert.equal(result.payment, 'declined'); assert.equal(result.proof.status, 'pending');
  f.state.captured = true; f.state.gateway = { orderStatus: 'CAPTURED', lastTransaction: { type: 'PAYMENT', result: 'SUCCESS', gatewayCode: 'APPROVED' } };
  result = await f.make().service.status(input); assert.equal(result.payment, 'paid'); assert.equal(result.proof.status, 'captured'); assert.equal(result.proof.ledgerPosted, false);
  f.state.refund = '100'; result = await f.make().service.status(input); assert.equal(result.payment, 'refunded');
  isPrivateFree(result);
  // A late gateway read is still observation: the proof decides, a summary cannot mark paid.
  f.state.captured = false; f.state.refund = '0';
  const g = await fixture(); const issued = await g.make().service.prepare(g.input); await g.make().service.initiate({ ctx: g.ctx, orderId: issued.order.id, locale: 'en' });
  g.state.gateway = { orderStatus: 'CAPTURED', lastTransaction: { type: 'PAYMENT', result: 'SUCCESS', gatewayCode: 'APPROVED' } };
  assert.equal((await g.make().service.status({ ctx: g.ctx, orderId: issued.order.id })).payment, 'pending_verification');
});

test('derived payment never says paid without proof and marks scope contradictions for review', () => {
  const order = { status: 'session_created', localSessionDeadline: new Date(AT + 60000).toISOString() };
  const present = fields => ({ present: true, currencyMatches: true, amountMatches: true, orderStatus: 'CAPTURED', lastTransaction: null, ...fields });
  assert.equal(deriveTennisControlPayment({ order, proof: { status: 'pending' }, observation: present({}), now: AT }), 'pending_verification');
  assert.equal(deriveTennisControlPayment({ order, proof: { status: 'captured' }, observation: present({}), now: AT }), 'paid');
  assert.equal(deriveTennisControlPayment({ order, proof: { status: 'pending' }, observation: present({ currencyMatches: false }), now: AT }), 'review_required');
  assert.equal(deriveTennisControlPayment({ order, proof: { status: 'review_required' }, observation: null, now: AT }), 'review_required');
  assert.equal(deriveTennisControlPayment({ order, proof: { status: 'pending' }, observation: { present: false }, now: AT }), 'awaiting_payment');
  assert.equal(deriveTennisControlPayment({ order: { ...order, status: 'expired' }, proof: { status: 'pending' }, observation: { present: false }, now: AT + 120000 }), 'expired');
  assert.equal(deriveTennisControlPayment({ order: { ...order, status: 'uncertain' }, proof: { status: 'pending' }, observation: null, now: AT }), 'uncertain');
  assert.equal(deriveTennisControlPayment({ order, proof: { status: 'pending' }, observation: present({ orderStatus: 'CANCELLED' }), now: AT }), 'cancelled');
  assert.equal(deriveTennisControlPayment({ order, proof: { status: 'pending' }, observation: present({ orderStatus: 'AUTHENTICATION_UNSUCCESSFUL' }), now: AT }), 'declined');
  assert.equal(deriveTennisControlPayment({ order, proof: { status: 'pending' }, observation: present({ orderStatus: 'AUTHORIZED' }), now: AT }), 'pending');
  assert.equal(deriveTennisControlPayment({ order: { status: 'issued', localSessionDeadline: null }, proof: null, observation: null, now: AT }), 'not_started');
});

test('the account view shows the current control order and opens a new series only after the previous one is spent', async () => {
  const f = await fixture(), service = f.make().service;
  let view = await service.current({ ctx: f.ctx });
  assert.deepEqual(view, { owner: true, series: 0, canOpen: true, terms: { version: TENNIS_CONTROL_TERMS.version, text: TENNIS_CONTROL_TERMS.text }, webhookConfigured: false, order: null, proof: null, observation: null, payment: null });
  assert.deepEqual(await service.current({ ctx: f.otherCtx }), { owner: false });
  const { order } = await service.prepare(f.input);
  view = await service.current({ ctx: f.ctx }); assert.equal(view.order.id, order.id); assert.equal(view.canOpen, false); assert.equal(view.payment, 'not_started');
  const second = await service.prepare({ ...f.input, idempotencyKey: 'second-request-same-series' }); assert.equal(second.order.id, order.id); assert.equal(second.duplicate, true);
  await service.initiate({ ctx: f.ctx, orderId: order.id, locale: 'en' });
  view = await service.current({ ctx: f.ctx }); assert.equal(view.canOpen, false); assert.equal(view.payment, 'awaiting_payment');
  f.state.captured = true; f.state.gateway = { orderStatus: 'CAPTURED', lastTransaction: { type: 'PAYMENT', result: 'SUCCESS', gatewayCode: 'APPROVED' } };
  view = await service.current({ ctx: f.ctx }); assert.equal(view.payment, 'paid'); assert.equal(view.canOpen, true);
  const next = await service.prepare({ ...f.input, idempotencyKey: 'third-request-new-series' });
  assert.notEqual(next.order.id, order.id); assert.equal(next.duplicate, false); assert.equal((await f.store.get(TENNIS_CONTROL_GRANT_TYPES.head, USER)).doc.series, 2);
  assert.equal((await service.status({ ctx: f.ctx, orderId: order.id })).payment, 'paid'); // History stays inspectable.
  view = await service.current({ ctx: f.ctx }); assert.equal(view.order.id, next.order.id); assert.equal(view.payment, 'not_started');
});

test('an expired attempt spends its series; an open attempt keeps one series even across repeated preparation', async () => {
  const f = await fixture(), service = f.make().service, { order } = await service.prepare(f.input);
  await service.initiate({ ctx: f.ctx, orderId: order.id, locale: 'en' });
  assert.equal((await service.prepare({ ...f.input, idempotencyKey: 'while-open' })).order.id, order.id);
  f.advance(15 * 60 * 1000 + 1);
  const next = await service.prepare({ ...f.input, idempotencyKey: 'after-expiry' });
  assert.notEqual(next.order.id, order.id); assert.equal((await f.store.get(TENNIS_CONTROL_GRANT_TYPES.head, USER)).doc.series, 2);
  assert.equal((await service.status({ ctx: f.ctx, orderId: order.id })).order.status, 'expired');
  assert.equal(f.state.posts.length, 1);
});

test('uncertain initiation is never retried by a repeated call and reports uncertain', async () => {
  const f = await fixture(), service = f.make().service, { order } = await service.prepare(f.input);
  f.state.throwInitiate = true;
  const result = await service.initiate({ ctx: f.ctx, orderId: order.id, locale: 'en' });
  assert.equal(result.order.status, 'uncertain'); assert.equal(result.session, null);
  f.state.throwInitiate = false;
  const again = await service.initiate({ ctx: f.ctx, orderId: order.id, locale: 'en' });
  assert.equal(again.order.status, 'uncertain'); assert.equal(f.state.posts.length, 1);
  assert.equal((await service.status({ ctx: f.ctx, orderId: order.id })).payment, 'uncertain');
  assert.equal((await service.current({ ctx: f.ctx })).canOpen, false);
});

test('foreign owner and account revocation are checked before the reader and again after I/O', async () => {
  const f = await fixture(), service = f.make().service, { order } = await service.prepare(f.input); await service.initiate({ ctx: f.ctx, orderId: order.id, locale: 'en' });
  await assert.rejects(service.status({ ctx: f.otherCtx, orderId: order.id }), { code: 'control_order_not_found' }); assert.equal(f.state.queries.length, 0);
  f.state.onRead = f.suspend;
  await assert.rejects(service.status({ ctx: f.ctx, orderId: order.id }), { code: 'control_verified_owner_required' });
  assert.equal(await f.store.get('tennisControlPaymentProof', order.id), null);
});

test('authorization references stay byte-stable per series and a changed owner configuration revokes them', async () => {
  const f = await fixture();
  const reference = await f.deps.authorizer.resolveAuthorizationReference(f.ctx);
  assert.match(reference, /^tcg_usr_[0-9A-HJKMNP-TV-Z]{20}_1$/);
  const first = await f.deps.authorizer.resolveAuthorization(reference), second = await f.deps.authorizer.resolveAuthorization(reference);
  assert.deepEqual(first, second); assert.equal(first.ownerUserId, USER); assert.equal(first.currency, 'USD'); assert.equal(first.totalMinor, '100');
  assert.equal(Date.parse(first.expiresAt) - Date.parse(first.verifiedAt), 24 * 60 * 60 * 1000);
  for (const bad of ['tcg_other', `tcg_${USER}_0`, `tcg_${USER}_2`, `tcg_${OTHER}_1`, null]) await assert.rejects(f.deps.authorizer.resolveAuthorization(bad));
  const changed = createTennisControlAuthorizer({ store: f.store, ownerEmail: OTHER_EMAIL, now: f.deps.now });
  await assert.rejects(changed.resolveAuthorization(reference), { code: 'control_owner_mismatch' });
  await assert.rejects(changed.resolveAuthorizationReference(f.ctx), { code: 'control_owner_mismatch' });
  assert.throws(() => createTennisControlAuthorizer({ store: f.store, ownerEmail: 'not-an-email' }), { code: 'control_authorizer_unconfigured' });
});

test('lost order commit ACK and reconstructed runtime still resolve the same order', async () => {
  const f = await fixture(), original = f.store.commit.bind(f.store); let dropped = false;
  f.store.commit = async commit => { const result = await original(commit); if (!dropped && commit.writes?.some(w => w.type === TENNIS_CONTROL_TYPES.order)) { dropped = true; throw Error('lost-private-ack'); } return result; };
  const first = await f.make().service.prepare(f.input), next = await f.make().service.prepare(f.input);
  assert.equal(first.order.id, next.order.id); assert.equal(first.duplicate, true);
  assert.equal(f.state.queries.length, 0);
});
