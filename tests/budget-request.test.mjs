/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { validateRequest } from '../lib/intake/schema.js';
import { createMemoryStore } from '../lib/intake/store.js';
import { acceptRequest } from '../lib/intake/service.js';
import { buildMessage, buildTelegramText } from '../lib/intake/notify.js';
import { acceptOrder } from '../lib/commerce/service.js';
import { budgetRequestCopy } from '../content/budget-request-copy.js';
import { locales } from '../lib/i18n.js';
const config = { series: 'spot', catalogueVersion: 3, mode: 'listed', weight: 500, lengthMode: 'standard', lengthIn: 27.9, grip: 'L7', setType: 'individual', sets: '1', use: 'coaching' };
const payload = budgetRequest => ({ purpose: 'config', locale: 'ru', config, fields: { name: 'Test', email: 'test@example.invalid', country: 'AE', role: 'coach' }, consent: true, ...(budgetRequest === undefined ? {} : { budgetRequest }), idempotencyKey: crypto.randomUUID(), elapsedMs: 2500 });
const budget = { amount: '00250,50', currency: 'USD', deliveryWishes: 'Local collection', personalizationWishes: 'Initials after artwork review' };
test('optional budget preserves exact decimal text, separate wishes and authoritative full configuration identity', () => {
  const r = validateRequest({ ...payload(budget), config: { ...config, configurationKey: 'forged' } });
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.deepEqual(r.value.budgetRequest, { ...budget, amount: '250.50', status: 'quote_requested', configurationKey: 'spot-500-L27.9-L7' });
  assert.equal(r.value.config.configurationKey, 'spot-500-L27.9-L7');
  assert.equal(r.value.price, undefined);
  assert.equal(r.value.payment, undefined);
  assert.equal(validateRequest(payload()).value.budgetRequest, undefined);
  assert.equal(validateRequest(payload({ amount: '', currency: '', deliveryWishes: '', personalizationWishes: '' })).value.budgetRequest, undefined);
  const wishes = validateRequest(payload({ deliveryWishes: 'Please quote delivery' }));
  assert.equal(wishes.ok, true); assert.equal(wishes.value.budgetRequest.amount, undefined);
  const custom = validateRequest({ ...payload(budget), config: { ...config, lengthMode: 'custom', customLengthIn: '28,125' } });
  assert.equal(custom.ok, true); assert.equal(custom.value.budgetRequest.configurationKey, null); assert.equal(custom.value.config.customLengthIn, 28.125);
});
test('budget rejects malformed values, unsupported currencies and client financial claims', () => {
  for (const amount of [250, null, true, {}, [], '', '0', '0.00', '-1', '+1', '1e2', '12.345', '.50', '1,234.00', '1'.repeat(19)]) {
    assert.equal(validateRequest(payload({ amount, currency: 'USD' })).ok, false, JSON.stringify(amount));
  }
  for (const extra of [{ currency: 'XXX', amount: '1' }, { amount: '1' }, { status: 'approved' }, { approved: true }, { payment: 'paid' }, { configurationKey: 'forged' }, { deliveryWishes: 'x'.repeat(2001) }, { personalizationWishes: 'x\u0000y' }]) assert.equal(validateRequest(payload(extra)).ok, false, JSON.stringify(extra));
  assert.equal(validateRequest({ ...payload(budget), purpose: 'general', fields: { ...payload().fields, message: 'Hello' } }).ok, false);
  assert.equal(validateRequest(payload({ amount: '9007199254740992.99', currency: 'USD' })).value.budgetRequest.amount, '9007199254740992.99');
});
test('durable intake and notification serialization preserve budget; changes cannot be deduplicated away', async () => {
  const store = createMemoryStore(), cfg = { store, notifier: null, minElapsedMs: 1500, salt: 'test', rateLimit: { max: 20, windowSeconds: 60 } };
  const p = payload(budget);
  const first = await acceptRequest(p, { ip: '127.0.0.1', config: cfg });
  assert.equal(first.http, 201);
  const repeated = await acceptRequest(p, { ip: '127.0.0.1', config: cfg }); assert.equal(repeated.body.request_id, first.body.request_id);
  const saved = JSON.parse(JSON.stringify((await store.getLead(first.body.request_id)).record));
  assert.equal(saved.budgetRequest.amount, '250.50'); assert.equal(saved.budgetRequest.status, 'quote_requested');
  for (const text of [buildMessage(saved).text, buildTelegramText(saved)]) {
    for (const expected of ['250.50', 'USD', 'spot-500-L27.9-L7', 'Local collection', 'Initials after artwork review', 'individual quote request only']) assert.ok(text.includes(expected), expected);
  }
  const changed = await acceptRequest({ ...p, budgetRequest: { ...budget, amount: '300' } }, { ip: '127.0.0.1', config: cfg });
  assert.equal(changed.http, 201); assert.notEqual(changed.body.request_id, first.body.request_id);
  const order = await acceptOrder({ ...p, plan: 'A' }, { store: {}, accessSecret: 'x'.repeat(32) }); assert.equal(order.http, 400);
});
test('all 48 locales have budget prompts without a public example price', () => {
  assert.equal(locales.length, 48);
  for (const locale of locales) {
    const copy = budgetRequestCopy(locale);
    for (const field of ['title', 'amount', 'currency', 'deliveryWishes', 'personalizationWishes', 'note']) assert.ok(copy[field]?.length, `${locale}/${field}`);
    assert.equal(Object.values(copy).some(text => /250|Texas/i.test(text)), false);
  }
});
