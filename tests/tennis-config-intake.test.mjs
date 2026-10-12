/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { validateRequest } from '../lib/intake/schema.js';
import { acceptRequest, canonical } from '../lib/intake/service.js';
import { createMemoryStore } from '../lib/intake/store.js';

const at = Date.parse('2026-10-11T00:00:00Z');
const payload = (over = {}) => ({ purpose: 'config', locale: 'en', fields: { name: 'Synthetic client', email: 'test@example.invalid', role: 'player', country: 'Test country' }, config: { series: 'great', cls: 'P1.5', mode: 'listed', weight: 272, grip: 'L3', setType: 'individual', sets: 1, use: 'play', ptype: 'none' }, consent: true, idempotencyKey: crypto.randomUUID(), elapsedMs: 3000, hp: '', ...over });
const setup = () => {
  const store = createMemoryStore();
  return { store, options: { ip: '192.0.2.50', now: at, config: { store, notifier: null, salt: 'TEST-ONLY-RATE-SALT', minElapsedMs: 1500, rateLimit: { max: 100, windowSeconds: 600 } } } };
};
const interest = (over = {}) => ({ purchaseIntent: 'goods_with_program_interest', ...over });
const digest = v => crypto.createHash('sha256').update(canonical(v)).digest('hex');

test('legacy configurator intake keeps the exact pre-change payload hash and omitted fields', async () => {
  const { store, options } = setup(), p = payload(), normalized = validateRequest(p).value;
  const result = await acceptRequest(p, options);
  assert.equal(result.http, 201);
  const record = (await store.getLead(result.requestId)).record;
  assert.equal(Object.hasOwn(record, 'purchaseIntent'), false); assert.equal(Object.hasOwn(record, 'programRequest'), false);
  assert.equal(record.payload_hash, digest({ purpose: normalized.purpose, contact: normalized.contact, details: normalized.details, config: normalized.config, profile: null }));
  const again = await acceptRequest(p, options);
  assert.equal(again.http, 200); assert.equal(again.requestId, result.requestId); assert.equal(await store.countLeads(), 1);
});

test('fallback intake persists explicit goods-only choice without inventing a program amount', async () => {
  const { store, options } = setup();
  const result = await acceptRequest(payload({ purchaseIntent: 'goods_only' }), options);
  assert.equal(result.http, 201);
  const record = (await store.getLead(result.requestId)).record;
  assert.equal(record.purchaseIntent, 'goods_only'); assert.equal(record.programRequest, undefined);
  assert.equal(record.accountTerms, undefined); assert.equal(record.financing, undefined);
});

test('fallback intake preserves terms-only and exact amount requests in separate canonical fields', async () => {
  const { store, options } = setup();
  for (const [over, expected] of [[interest(), { status: 'terms_requested' }], [interest({ programRequest: { principal: '6 543,21', currency: 'AED' } }), { status: 'terms_requested', requestedPrincipalMinor: '654321', currency: 'AED' }], [interest({ programRequest: { principal: '9007199254740992.99', currency: 'USD' } }), { status: 'terms_requested', requestedPrincipalMinor: '900719925474099299', currency: 'USD' }]]) {
    const result = await acceptRequest(payload(over), options);
    assert.equal(result.http, 201);
    const record = (await store.getLead(result.requestId)).record;
    assert.equal(record.purchaseIntent, 'goods_with_program_interest'); assert.deepEqual(record.programRequest, expected);
    assert.equal(record.programRequest.rateBps, undefined); assert.equal(record.programRequest.enrolled, undefined);
    assert.equal(record.accountTerms, undefined); assert.equal(record.financing, undefined); assert.equal(record.accounts, undefined);
  }
});

test('fallback lead hash binds intent, optional principal and currency under its existing content-scoped idempotency', async () => {
  const { store, options } = setup(), p = payload();
  const ordinary = await acceptRequest(p, options);
  const selected = await acceptRequest({ ...p, ...interest() }, options);
  const amount = await acceptRequest({ ...p, ...interest({ programRequest: { principal: '1', currency: 'EUR' } }) }, options);
  const changedAmount = await acceptRequest({ ...p, ...interest({ programRequest: { principal: '2', currency: 'EUR' } }) }, options);
  const changedCurrency = await acceptRequest({ ...p, ...interest({ programRequest: { principal: '1', currency: 'USD' } }) }, options);
  const results = [ordinary, selected, amount, changedAmount, changedCurrency];
  assert.ok(results.every(r => r.http === 201));
  assert.equal(new Set(results.map(r => r.requestId)).size, 5);
  const records = await Promise.all(results.map(async r => (await store.getLead(r.requestId)).record));
  assert.equal(new Set(records.map(r => r.payload_hash)).size, 5);
  const again = await acceptRequest({ ...p, ...interest({ programRequest: { principal: '001,00', currency: 'EUR' } }) }, options);
  assert.equal(again.http, 200); assert.equal(again.requestId, amount.requestId); assert.equal(await store.countLeads(), 5);
});

test('invalid enum, cross-plan and financial tampering fail before lead storage or rate-limit side effects', async () => {
  const { store, options } = setup(); let rateCalls = 0;
  store.rateLimit = async () => { rateCalls++; throw new Error('invalid request must not reach persistence'); };
  for (const over of [{ purchaseIntent: null }, { purchaseIntent: 'investment' }, { programRequest: { principal: '1', currency: 'EUR' } }, { ...interest(), plan: 'B' }, { ...interest(), plan: 'C' }, interest({ rateBps: 2000 }), interest({ enrolled: true }), interest({ termsAccepted: true }), interest({ programRequest: { principal: '1', currency: 'EUR', approved: true } }), interest({ programRequest: { status: 'approved', requestedPrincipalMinor: '100', currency: 'EUR' } })]) {
    const result = await acceptRequest(payload(over), options);
    assert.equal(result.http, 400); assert.equal(result.body.status, 'invalid');
  }
  assert.equal(rateCalls, 0); assert.equal(await store.countLeads(), 0);
});

test('fallback and order validation share exact decimal and currency rejection', async () => {
  const { store, options } = setup();
  for (const programRequest of [null, [], {}, { principal: '1' }, { currency: 'EUR' }, { principal: 100, currency: 'EUR' }, { principal: '0', currency: 'EUR' }, { principal: '-1', currency: 'EUR' }, { principal: '1.001', currency: 'EUR' }, { principal: '1e3', currency: 'EUR' }, { principal: '1', currency: 'GBP' }]) {
    assert.equal((await acceptRequest(payload(interest({ programRequest })), options)).http, 400);
  }
  assert.equal(await store.countLeads(), 0);
});

test('purchase/program claims on unrelated lead purposes are rejected rather than silently dropped', async () => {
  const { store, options } = setup();
  for (const purpose of ['selection', 'product', 'general', 'updates']) {
    for (const over of [{ purchaseIntent: 'goods_only' }, interest(), { programRequest: { principal: '1', currency: 'EUR' } }]) {
      const p = payload({ purpose, fields: { ...payload().fields, level: 'beginner', message: 'Synthetic request' }, ...over });
      const result = await acceptRequest(p, options);
      assert.equal(result.http, 400); assert.equal(result.body.errors.purchaseIntent, 'invalid');
    }
  }
  assert.equal(await store.countLeads(), 0);
});

test('mutating a returned memory lead cannot turn a request into approved terms', async () => {
  const { store, options } = setup();
  const result = await acceptRequest(payload(interest({ programRequest: { principal: '12.34', currency: 'EUR' } })), options);
  const view = await store.getLead(result.requestId);
  view.record.programRequest.status = 'approved'; view.record.programRequest.requestedPrincipalMinor = '999999';
  assert.deepEqual((await store.getLead(result.requestId)).record.programRequest, { status: 'terms_requested', requestedPrincipalMinor: '1234', currency: 'EUR' });
});
