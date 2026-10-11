/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCommerceStore, createMemoryCommerceStore, nextDue, update } from '../lib/commerce/store.js';

const idem = 'a'.repeat(64);
const orderId = digit => 'MX-ORD-' + digit.repeat(32);
const document = (digit = '1') => ({
  id: orderId(digit),
  snapshot: { schema: 1, projectId: 'tennis', configuration: { series: 'great' } },
  payment: { status: 'ready' },
  invoice: null,
  mail: { confirmation: { status: 'pending', attempts: 0, nextAt: 10, history: [] } },
  events: [],
});
const invalidDocuments = () => {
  const cycle = document(); cycle.events.push(cycle);
  const bigint = document(); bigint.events.push({ total: 1n });
  const undefinedValue = document(); undefinedValue.snapshot.extra = undefined;
  const nonfinite = document(); nonfinite.events.push({ total: NaN });
  const dueString = document(); dueString.mail.confirmation.nextAt = '10';
  const dueNegative = document(); dueNegative.mail.confirmation.nextAt = -1;
  const dueFraction = document(); dueFraction.mail.confirmation.leaseUntil = 1.5;
  const dueOverflow = document(); dueOverflow.payment.nextReconcileAt = Number.MAX_SAFE_INTEGER + 1;
  const wrongId = document(); wrongId.id = 'order:elsewhere';
  const wrongSchema = document(); wrongSchema.snapshot.schema = 2;
  const wrongProject = document(); wrongProject.snapshot.projectId = '../baby';
  const lossyArray = document(); lossyArray.events = Array(1);
  return [cycle, bigint, undefinedValue, nonfinite, dueString, dueNegative, dueFraction, dueOverflow, wrongId, wrongSchema, wrongProject, lossyArray];
};

test('memory: invalid complete JSON/IDs/due dates cannot reserve an idempotency key or write an order', async () => {
  for (const invalid of invalidDocuments()) {
    const store = createMemoryCommerceStore();
    await assert.rejects(store.create(idem, invalid), /commerce_bad_/);
    assert.equal(await store.get(orderId('1')), null);
    assert.deepEqual(await store.due(100), []);
    assert.deepEqual(await store.create(idem, document()), { created: true, id: orderId('1') });
  }
});

test('REST: invalid create and swap payloads fail before any HTTP command', async () => {
  let calls = 0;
  const store = createCommerceStore({ url: 'https://redis.invalid', token: 'mock-only', fetchImpl: async () => { calls++; throw Error('must not fetch'); } });
  for (const invalid of invalidDocuments()) {
    await assert.rejects(store.create(idem, invalid), /commerce_bad_/);
    await assert.rejects(store.swap(document(), invalid), /commerce_bad_|immutable/);
  }
  await assert.rejects(store.create('not-a-hash', document()), /commerce_bad_idempotency/);
  await assert.rejects(store.get('not-an-order'), /commerce_bad_id/);
  await assert.rejects(store.due(Infinity), /commerce_bad_due/);
  assert.equal(calls, 0);
});

test('memory: concurrent duplicate idempotency leaves one original document and one due entry', async () => {
  const store = createMemoryCommerceStore();
  const replies = await Promise.all(Array.from({ length: 12 }, (_, i) => store.create(idem, document((i % 8 + 1).toString()))));
  assert.equal(replies.filter(r => r.created).length, 1);
  assert.equal(new Set(replies.map(r => r.id)).size, 1);
  assert.deepEqual(await store.due(100), [orderId('1')]);
  for (let i = 2; i < 9; i++) assert.equal(await store.get(orderId(i.toString())), null);
});

test('memory: stale CAS has one winner and cannot overwrite its events or outbox', async () => {
  const store = createMemoryCommerceStore();
  await store.create(idem, document());
  const before = await store.get(orderId('1'));
  const a = structuredClone(before), b = structuredClone(before);
  a.events.push({ type: 'first' }); a.mail.confirmation.nextAt = 20;
  b.events.push({ type: 'second' }); b.mail.confirmation.nextAt = 30;
  assert.deepEqual(await Promise.all([store.swap(before, a), store.swap(before, b)]), [true, false]);
  assert.deepEqual((await store.get(before.id)).events, [{ type: 'first' }]);
  assert.deepEqual(await store.due(19), []);
  assert.deepEqual(await store.due(20), [before.id]);
});

test('memory: immutable invoice/snapshot/ID and invalid outbox leave the saved order unchanged', async () => {
  const store = createMemoryCommerceStore();
  await store.create(idem, document());
  const before = await store.get(orderId('1')), paid = structuredClone(before);
  paid.payment.status = 'paid';
  paid.invoice = { number: 'TEST-INV-1', totalMinor: 60000 };
  paid.mail.invoice = { status: 'pending', nextAt: 12, attempts: 0, history: [] };
  assert.equal(await store.swap(before, paid), true);
  const invalidAfter = [
    { ...paid, id: orderId('2') },
    { ...paid, invoice: { ...paid.invoice, totalMinor: 1 } },
    { ...paid, snapshot: { ...paid.snapshot, projectId: 'baby' } },
    { ...paid, mail: { ...paid.mail, invoice: { ...paid.mail.invoice, nextAt: Infinity } } },
  ];
  for (const after of invalidAfter) {
    await assert.rejects(store.swap(paid, after), /immutable|commerce_bad_/);
    assert.deepEqual(await store.get(paid.id), paid);
    assert.equal(await store.get(orderId('2')), null);
  }
});

test('memory serializes complete JSON before commit; stored document cannot alias caller data', async () => {
  const memory = createMemoryCommerceStore(), doc = document();
  await memory.create(idem, doc);
  doc.events.push({ type: 'caller-mutation' });
  assert.deepEqual((await memory.get(doc.id)).events, []);
  const reordered = await memory.get(doc.id);
  reordered.snapshot = { configuration: reordered.snapshot.configuration, projectId: 'tennis', schema: 1 };
  assert.equal(await memory.swap(await memory.get(doc.id), reordered), true);
  const before = await memory.get(doc.id);
  const broken = structuredClone(before); broken.events.push({ unsupported: () => true });
  await assert.rejects(memory.swap(before, broken), /commerce_bad_document/);
  assert.deepEqual(await memory.get(doc.id), before);
  await update(memory, doc.id, d => { d.events.push({ type: 'atomic-update' }); return d; });
  assert.deepEqual((await memory.get(doc.id)).events, [{ type: 'atomic-update' }]);
});

test('due calculation accepts finite lease/retry dates and rejects malformed inactive jobs too', () => {
  const doc = document();
  doc.mail.confirmation.leaseUntil = 40;
  doc.payment = { status: 'pending', nextReconcileAt: 25 };
  assert.equal(nextDue(doc), 25);
  doc.mail.confirmation.status = 'sent';
  doc.mail.confirmation.nextAt = 'not-a-score';
  assert.throws(() => nextDue(doc), /commerce_bad_due/);
});
