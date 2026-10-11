/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../lib/platform/store.js';
import { hashPayload } from '../lib/platform/ids.js';
import { conflict, unavailable } from '../lib/platform/errors.js';
import { createNativePoller, NATIVE_POLL_TYPES } from '../lib/platform/native-poller.js';
import { createCommerceLedgerBridge, COMMERCE_LEDGER_SELLER } from '../lib/platform/commerce-ledger.js';
import { createLedgerWorker } from '../lib/platform/ledger-worker.js';
import { createLedgerService } from '../lib/platform/ledger.js';

const AT = '2026-10-11T00:00:00.000Z';
const scope = { mappingHash: hashPayload('synthetic-poll-verified-mapping'), source: 'cscart_mpgs', projectId: 'tennis' };
const scheduleId = (s, providerOrderId) => `npb_${hashPayload({ scope: s, providerOrderId })}`;
const outboxId = (s, reference) => `npr_${hashPayload({ scope: s, reference })}`;
function binding(providerOrderId = 'synthetic-provider-order', s = scope) {
  return { id: `nb_${hashPayload([s.mappingHash, providerOrderId])}`, mappingHash: s.mappingHash, projectId: s.projectId,
    providerOrderId, status: 'verified', source: 'server_account_binding', fingerprint: hashPayload({ syntheticImmutableBinding: providerOrderId }) };
}
function fixture({ store = createMemoryStore(), records = [binding()], scope: selectedScope = scope } = {}) {
  let clock = Date.parse(AT);
  const queries = [], registrations = [], enqueues = [], pages = [], verified = new Map(), deliveries = new Map();
  const movements = new Map(records.map(row => [row.providerOrderId, [{ transactionId: 'synthetic-capture', kind: 'capture' }]]));
  const failures = new Set();
  const args = { store, scope: selectedScope, now: () => clock,
    listBindings: async ({ offset, limit, signal }) => {
      assert.equal(signal.aborted, false); pages.push(offset);
      const items = records.slice(offset, offset + limit);
      return { items: structuredClone(items), nextOffset: offset + items.length < records.length ? offset + items.length : null };
    },
    discoverMovements: async ({ binding: selected, signal }) => {
      assert.equal(signal.aborted, false); queries.push(selected.providerOrderId);
      if (failures.has(selected.providerOrderId)) throw unavailable('synthetic_provider_outage');
      assert.equal(selected.fingerprint, records.find(row => row.providerOrderId === selected.providerOrderId)?.fingerprint);
      return structuredClone(movements.get(selected.providerOrderId) || []);
    },
    registerMovement: async ({ binding: selected, transactionId, kind, signal }) => {
      assert.equal(signal.aborted, false);
      registrations.push({ providerOrderId: selected.providerOrderId, transactionId, kind });
      const eventReference = `np_${hashPayload([selectedScope.mappingHash, selected.providerOrderId, transactionId, kind])}`;
      verified.set(eventReference, { providerOrderId: selected.providerOrderId, transactionId, kind });
      return { eventReference, duplicate: verified.has(eventReference) };
    },
  };
  const enqueueReference = async reference => {
    assert.equal(typeof reference, 'string'); assert.equal(verified.has(reference), true, 'native verifier persists reference before delivery');
    const row = await store.get(NATIVE_POLL_TYPES.reference, outboxId(selectedScope, reference));
    assert.equal(row?.doc.status, 'processing', 'outbox is durable before worker handoff');
    enqueues.push(reference);
    const deliveryId = `ldv_${hashPayload({ scope: selectedScope, reference })}`;
    const duplicate = deliveries.has(reference); deliveries.set(reference, deliveryId);
    return { deliveryId, status: 'pending', duplicate };
  };
  const make = extra => createNativePoller({ ...args, ...extra });
  return { store, scope: selectedScope, records, movements, failures, queries, registrations, verified, deliveries, enqueues, pages,
    args, make, enqueueReference, now: args.now, advance: ms => { clock += ms; }, poll: (options = {}, extra = {}) => make(extra).pollOnce({ enqueueReference, ...options }) };
}
const noMoney = async f => {
  assert.equal(await f.store.countType('ledgerJournal'), 0);
  assert.equal(await f.store.countType('ledgerProgram'), 0);
};

test('poller requires scoped trusted adapters and durable production store', () => {
  const f = fixture();
  for (const extra of [{ scope: { ...scope, mappingHash: '' } }, { listBindings: null }, { discoverMovements: null }, { registerMovement: null }, { production: true }, { intervalMs: 999 }, { maxAttempts: 0 }, { leaseMs: 1000 }]) assert.throws(() => f.make(extra));
  assert.equal(f.queries.length, 0); assert.equal(f.enqueues.length, 0);
});

test('arbitrary IDs, foreign projects, unverified records and email-based bindings cannot be polled', async () => {
  const valid = binding(), bad = [
    { ...binding('synthetic-foreign-project'), projectId: 'baby' },
    { ...binding('synthetic-unverified'), status: 'pending' },
    { ...binding('synthetic-email'), source: 'client_email' },
    { ...binding('synthetic-other-map'), mappingHash: hashPayload('other') },
    { ...binding('synthetic-guessed'), id: `nb_${'0'.repeat(64)}` },
    { ...binding('synthetic-no-fingerprint'), fingerprint: undefined },
    { providerOrderId: 'owner-supplied-order-id', paid: true, customerEmail: 'not-a-binding@example.invalid' },
  ];
  const f = fixture({ records: [...bad, valid] });
  const result = await f.poll(); assert.equal(result.reviewRequired, bad.length); assert.equal(result.bindingsChecked, 1);
  assert.deepEqual(f.queries, [valid.providerOrderId]); assert.equal(await f.store.countType(NATIVE_POLL_TYPES.binding), 1); await noMoney(f);
});

test('native pending order does not create a receipt and repeated early polls respect due time', async () => {
  const f = fixture(); f.movements.set(f.records[0].providerOrderId, []);
  const result = await f.poll(); assert.equal(result.bindingsChecked, 1); assert.equal(result.movementsDiscovered, 0); assert.equal(result.referencesQueued, 0);
  assert.equal((await f.poll()).bindingsChecked, 0); assert.equal(f.queries.length, 1);
  f.advance(60000); assert.equal((await f.poll()).bindingsChecked, 1); await noMoney(f);
});

test('only transaction ID and kind pass into independent verification; amounts and customer claims are ignored', async () => {
  const f = fixture(); f.movements.set(f.records[0].providerOrderId, [{ transactionId: 'synthetic-capture', kind: 'capture', amountMinor: '9999999', customerId: 'guessed', paid: true, program: '20percent' }]);
  const result = await f.poll(); assert.equal(result.referencesQueued, 1);
  assert.deepEqual(f.registrations, [{ providerOrderId: f.records[0].providerOrderId, transactionId: 'synthetic-capture', kind: 'capture' }]);
  const doc = (await f.store.get(NATIVE_POLL_TYPES.binding, scheduleId(scope, f.records[0].providerOrderId))).doc;
  assert.equal(JSON.stringify(doc).includes('customer'), false); assert.equal(JSON.stringify(doc).includes('9999999'), false); await noMoney(f);
});

test('durable append-only cursor advances bounded pages and all earlier due bindings get a turn', async () => {
  const records = Array.from({ length: 22 }, (_, n) => binding(`synthetic-order-${n}`));
  const f = fixture({ records }); records.forEach(row => f.movements.set(row.providerOrderId, []));
  for (let n = 0; n < records.length; n++) await f.poll();
  assert.deepEqual(f.pages.slice(0, 4), [0, 10, 20, 0]);
  assert.equal(f.queries.length, records.length); assert.equal(new Set(f.queries).size, records.length);
  assert.equal(await f.store.countType(NATIVE_POLL_TYPES.binding), records.length); await noMoney(f);
});

test('provider outage backs off instead of starving another due binding; restart resumes safely', async () => {
  const f = fixture({ records: [binding('synthetic-order-a'), binding('synthetic-order-b')] });
  const first = [...f.records].sort((a, b) => scheduleId(scope, a.providerOrderId).localeCompare(scheduleId(scope, b.providerOrderId)))[0];
  f.failures.add(first.providerOrderId);
  assert.equal((await f.poll()).deferred, 1);
  const good = await f.poll(); assert.equal(good.referencesQueued, 1); assert.equal(new Set(f.queries).size, 2);
  assert.equal((await f.poll()).bindingsChecked, 0); f.failures.clear(); f.advance(1000);
  assert.equal((await f.poll()).referencesQueued, 1); assert.equal(f.deliveries.size, 2); await noMoney(f);
});

test('discovery registration failure creates no queue or money and enters durable review after bounded retries', async () => {
  const f = fixture(); const registerMovement = async () => { throw Error('synthetic PAN secret response must not survive'); };
  for (const delay of [1000, 2000, 4000, 8000, 16000]) { await f.poll({}, { registerMovement }); f.advance(delay); }
  const row = await f.store.get(NATIVE_POLL_TYPES.binding, scheduleId(scope, f.records[0].providerOrderId));
  assert.equal(row.doc.status, 'review_required'); assert.equal(row.doc.attempts, 5); assert.equal(row.doc.nextAttemptAt, null);
  assert.equal((await f.poll()).bindingsChecked, 0); assert.equal(f.enqueues.length, 0);
  assert.equal(JSON.stringify(row).includes('PAN'), false); assert.equal(await f.store.countType(NATIVE_POLL_TYPES.reference), 0); await noMoney(f);
});

test('queue outage preserves verified reference in outbox and reconstructed poller retries once', async () => {
  const f = fixture(); let fail = true;
  const enqueueReference = async reference => { if (fail) throw unavailable('synthetic_queue_unavailable'); return f.enqueueReference(reference); };
  assert.equal((await f.poll({ enqueueReference })).deferred, 1); assert.equal(f.verified.size, 1); assert.equal(f.deliveries.size, 0);
  const ref = [...f.verified.keys()][0], row = await f.store.get(NATIVE_POLL_TYPES.reference, outboxId(scope, ref));
  assert.equal(row.doc.status, 'pending'); assert.equal(row.doc.nextAttemptAt, f.now() + 1000);
  assert.equal((await f.poll({ enqueueReference })).referencesQueued, 0);
  fail = false; f.advance(1000); assert.equal((await f.poll({ enqueueReference })).referencesQueued, 1);
  assert.equal(f.queries.length, 1); assert.equal(f.deliveries.size, 1); await noMoney(f);
});

test('lost outbox completion acknowledgement replays the same worker delivery ID without double posting', async () => {
  const f = fixture(); const commit = f.store.commit.bind(f.store); let fail = true;
  f.store.commit = async c => {
    if (fail && c.writes?.some(row => row.type === NATIVE_POLL_TYPES.reference && row.doc.status === 'completed')) { fail = false; throw unavailable('synthetic_completion_failure'); }
    return commit(c);
  };
  const first = await f.poll(); assert.equal(first.deferred, 1); assert.equal(f.deliveries.size, 1);
  f.advance(1000); assert.equal((await f.poll()).referencesQueued, 1);
  assert.equal(f.enqueues.length, 2); assert.equal(f.deliveries.size, 1);
  f.advance(60000); await f.poll(); assert.equal(f.enqueues.length, 2); await noMoney(f);
});

test('concurrent schedulers lease a binding and its outbox with CAS', async () => {
  const f = fixture();
  const results = await Promise.all([f.poll(), f.poll(), f.poll()]);
  assert.equal(results.reduce((n, row) => n + row.bindingsChecked, 0), 1);
  assert.equal(results.reduce((n, row) => n + row.referencesQueued, 0), 1);
  assert.equal(f.queries.length, 1); assert.equal(f.deliveries.size, 1); await noMoney(f);
});

test('duplicate captures/refunds remain stable opaque references across later scans', async () => {
  const f = fixture(); f.movements.set(f.records[0].providerOrderId, [{ transactionId: 'synthetic-capture', kind: 'capture' }, { transactionId: 'synthetic-capture', kind: 'capture' }, { transactionId: 'synthetic-refund', kind: 'refund' }]);
  const first = await f.poll(); assert.equal(first.movementsDiscovered, 2); assert.equal(first.referencesQueued, 2);
  f.advance(60000); const later = await f.poll(); assert.equal(later.movementsDiscovered, 2); assert.equal(later.referencesQueued, 0);
  assert.equal(f.deliveries.size, 2); assert.equal(await f.store.countType(NATIVE_POLL_TYPES.reference), 2); await noMoney(f);
});

test('overlarge batches, unsafe movement types and foreign provider orders fail before delivery', async () => {
  for (const movements of [Array.from({ length: 21 }, (_, n) => ({ transactionId: `synthetic-${n}`, kind: 'capture' })), [{ transactionId: 'synthetic', kind: 'authorization' }], [{ transactionId: 'synthetic', kind: 'capture', providerOrderId: 'another-order' }], [{ transactionId: '../request', kind: 'capture' }]]) {
    const f = fixture(); f.movements.set(f.records[0].providerOrderId, movements);
    const result = await f.poll(); assert.equal(result.referencesQueued, 0); assert.equal(f.enqueues.length, 0); await noMoney(f);
  }
});

test('mapping changes isolate cursor, due state and references without reusing another project binding', async () => {
  const f = fixture(); await f.poll();
  const otherScope = { ...scope, projectId: 'baby', mappingHash: hashPayload('synthetic-other-mapping') };
  const foreign = fixture({ store: f.store, records: [], scope: otherScope });
  const result = await foreign.poll(); assert.equal(result.bindingsChecked, 0); assert.equal(result.referencesQueued, 0); assert.equal(foreign.queries.length, 0);
  assert.equal(await f.store.countType(NATIVE_POLL_TYPES.cursor), 2); await noMoney(f);
});

test('invalid/stale index members are quarantined, so a healthy due order is reached next', async () => {
  const f = fixture(); await f.poll(); f.advance(60000);
  const scopeHash = hashPayload(scope), index = `native-poll:bindings-due:${scopeHash}`;
  await f.store.commit({ indexes: [{ name: index, member: 'invalid-index-member', score: 0 }] });
  assert.equal((await f.poll()).reviewRequired, 1);
  assert.equal((await f.poll()).bindingsChecked, 1); assert.equal(await f.store.countType('nativePollIndexIssue'), 1); await noMoney(f);
});

test('a stale early score on a future binding is repaired instead of starving a new due order', async () => {
  const f = fixture(); f.movements.set(f.records[0].providerOrderId, []); await f.poll();
  const id = scheduleId(scope, f.records[0].providerOrderId), index = `native-poll:bindings-due:${hashPayload(scope)}`;
  await f.store.commit({ indexes: [{ name: index, member: id, score: 0 }] });
  const healthy = binding('synthetic-new-healthy-order'); f.records.push(healthy); f.movements.set(healthy.providerOrderId, []);
  assert.equal((await f.poll()).bindingsChecked, 1);
  assert.equal((await f.poll()).bindingsChecked, 0);
  assert.deepEqual(f.queries, [f.records[0].providerOrderId, healthy.providerOrderId]); await noMoney(f);
});

test('twenty stale future outbox scores cannot permanently block a fresh verified reference', async () => {
  const f = fixture();
  f.movements.set(f.records[0].providerOrderId, Array.from({ length: 20 }, (_, n) => ({ transactionId: `synthetic-tx-${n}`, kind: 'capture' })));
  assert.equal((await f.poll()).referencesQueued, 20); f.advance(60000);
  const index = `native-poll:references-due:${hashPayload(scope)}`;
  for (const reference of f.verified.keys()) {
    const id = outboxId(scope, reference), row = await f.store.get(NATIVE_POLL_TYPES.reference, id);
    await f.store.commit({ writes: [{ type: NATIVE_POLL_TYPES.reference, id, expectedVersion: row.version, doc: { ...row.doc, status: 'pending', nextAttemptAt: f.now() + 60000 } }], indexes: [{ name: index, member: id, score: 0 }] });
  }
  f.movements.set(f.records[0].providerOrderId, [{ transactionId: 'synthetic-fresh-tx', kind: 'refund' }]);
  assert.equal((await f.poll()).referencesQueued, 0);
  assert.equal((await f.poll()).referencesQueued, 1);
  assert.equal(f.deliveries.size, 21); await noMoney(f);
});

test('rediscovery restores lost pending memberships without reviving terminal review cases', async () => {
  const f = fixture(); let fail = true;
  const enqueueReference = async ref => { if (fail) throw unavailable('synthetic_queue_outage'); return f.enqueueReference(ref); };
  await f.poll({ enqueueReference });
  const id = scheduleId(scope, f.records[0].providerOrderId), ref = [...f.verified.keys()][0], outbox = outboxId(scope, ref);
  await f.store.commit({ unindexes: [
    { name: `native-poll:bindings-due:${hashPayload(scope)}`, member: id },
    { name: `native-poll:references-due:${hashPayload(scope)}`, member: outbox },
  ] });
  f.advance(60000); fail = false;
  assert.equal((await f.poll({ enqueueReference })).referencesQueued, 1);
  assert.equal(f.registrations.length, 1, 'already durable movement skips another provider registration');
  const reviewed = await f.store.get(NATIVE_POLL_TYPES.binding, id);
  await f.store.commit({ writes: [{ type: NATIVE_POLL_TYPES.binding, id, expectedVersion: reviewed.version, doc: { ...reviewed.doc, status: 'review_required', nextAttemptAt: null, leaseOwner: null, leaseUntil: 0 } }], unindexes: [{ name: `native-poll:bindings-due:${hashPayload(scope)}`, member: id }] });
  f.advance(60000); assert.equal((await f.poll()).bindingsChecked, 0); await noMoney(f);
});

test('a deadline-interrupted movement scan resumes beyond earlier captures to reach later refunds', async () => {
  const f = fixture();
  f.movements.set(f.records[0].providerOrderId, [
    { transactionId: 'a-synthetic-capture', kind: 'capture' },
    { transactionId: 'b-synthetic-refund', kind: 'refund' },
    { transactionId: 'c-synthetic-refund', kind: 'refund' },
  ]);
  const registerMovement = async args => { f.advance(10); return f.args.registerMovement(args); };
  await f.poll({ deadlineAt: f.now() + 15 }, { registerMovement });
  const id = scheduleId(scope, f.records[0].providerOrderId);
  assert.equal((await f.store.get(NATIVE_POLL_TYPES.binding, id)).doc.movementCursor, 1);
  f.advance(60000); await f.poll({ deadlineAt: f.now() + 15 }, { registerMovement });
  assert.equal((await f.store.get(NATIVE_POLL_TYPES.binding, id)).doc.movementCursor, 2);
  f.advance(60000); await f.poll({ deadlineAt: f.now() + 15 }, { registerMovement });
  assert.equal(await f.store.countType(NATIVE_POLL_TYPES.reference), 3); assert.equal(f.deliveries.size, 3);
  assert.ok(f.registrations.some(row => row.transactionId === 'c-synthetic-refund')); await noMoney(f);
});

test('useful partial scans may take more than five invocations without abandoning a later refund', async () => {
  const f = fixture();
  f.movements.set(f.records[0].providerOrderId, Array.from({ length: 8 }, (_, n) => ({ transactionId: `synthetic-progress-${n}`, kind: n === 7 ? 'refund' : 'capture' })));
  const registerMovement = async args => { f.advance(10); return f.args.registerMovement(args); };
  for (let n = 0; n < 8; n++) { await f.poll({ deadlineAt: f.now() + 15 }, { registerMovement }); f.advance(60000); }
  const row = await f.store.get(NATIVE_POLL_TYPES.binding, scheduleId(scope, f.records[0].providerOrderId));
  assert.equal(row.doc.status, 'pending'); assert.equal(row.doc.failures, 0);
  assert.equal(await f.store.countType(NATIVE_POLL_TYPES.reference), 8); assert.equal(f.deliveries.size, 8);
  assert.ok(f.registrations.some(row => row.transactionId === 'synthetic-progress-7' && row.kind === 'refund')); await noMoney(f);
});

test('a capture sorts before lexically earlier refunds and is durably registered in a bounded partial scan', async () => {
  const f = fixture(); f.movements.set(f.records[0].providerOrderId, [{ transactionId: 'a-synthetic-refund', kind: 'refund' }, { transactionId: 'z-synthetic-capture', kind: 'capture' }]);
  const registerMovement = async args => { f.advance(10); return f.args.registerMovement(args); };
  await f.poll({ deadlineAt: f.now() + 15 }, { registerMovement });
  assert.equal(f.registrations[0].transactionId, 'z-synthetic-capture');
  assert.equal(await f.store.countType(NATIVE_POLL_TYPES.reference), 1);
  const ref = [...f.verified.entries()].find(([, movement]) => movement.kind === 'capture')[0];
  assert.ok(await f.store.get(NATIVE_POLL_TYPES.reference, outboxId(scope, ref))); await noMoney(f);
  f.advance(60000); await f.poll({ deadlineAt: f.now() + 15 }, { registerMovement });
  assert.equal(f.deliveries.size, 2); assert.equal(await f.store.countType(NATIVE_POLL_TYPES.reference), 2);
});

test('an already sent atomic store write may acknowledge after deadline without starting later work', async () => {
  const f = fixture(); const commit = f.store.commit.bind(f.store); let calls = 0;
  f.store.commit = async value => { calls++; await new Promise(resolve => setTimeout(resolve, 80)); return commit(value); };
  const result = await f.poll({ deadlineAt: f.now() + 35 });
  assert.ok(result.deferred >= 1); assert.equal(await f.store.countType(NATIVE_POLL_TYPES.cursor), 0);
  await new Promise(resolve => setTimeout(resolve, 90));
  assert.equal(calls, 1); assert.equal(await f.store.countType(NATIVE_POLL_TYPES.cursor), 1);
  assert.equal(f.pages.length, 0); assert.equal(f.queries.length, 0); assert.equal(f.enqueues.length, 0); await noMoney(f);
});

test('ambiguous worker handoff acknowledgement preserves outbox lease and safely deduplicates recovery', async () => {
  const f = fixture(); await f.poll({ enqueueReference: async () => { throw unavailable('synthetic_queue_outage'); } }); f.advance(1000);
  const enqueueReference = async reference => {
    const row = await f.store.get(NATIVE_POLL_TYPES.reference, outboxId(scope, reference));
    assert.equal(row.doc.status, 'processing');
    const deliveryId = `ldv_${hashPayload({ scope, reference })}`;
    // Simulate a request sent before expiry whose atomic receiver acknowledgement arrives later.
    await new Promise(resolve => setTimeout(resolve, 80));
    f.deliveries.set(reference, deliveryId); f.enqueues.push(reference);
    return { deliveryId, status: 'pending' };
  };
  await f.poll({ enqueueReference, deadlineAt: f.now() + 35 });
  assert.equal(f.deliveries.size, 0); await new Promise(resolve => setTimeout(resolve, 90));
  assert.equal(f.deliveries.size, 1);
  const reference = [...f.deliveries.keys()][0];
  assert.equal((await f.store.get(NATIVE_POLL_TYPES.reference, outboxId(scope, reference))).doc.status, 'processing');
  f.advance(60000); assert.equal((await f.poll()).referencesQueued, 1); assert.equal(f.deliveries.size, 1);
  assert.equal((await f.store.get(NATIVE_POLL_TYPES.reference, outboxId(scope, reference))).doc.status, 'completed'); await noMoney(f);
});

test('shared deadline aborts a nonsettling discovery and no late reference or money appears', async () => {
  const f = fixture(); let resolveDiscovery;
  const discoverMovements = () => new Promise(resolve => { resolveDiscovery = resolve; });
  const started = Date.now();
  const result = await f.poll({ deadlineAt: f.now() + 35 }, { discoverMovements });
  assert.ok(Date.now() - started < 1000); assert.ok(result.deferred >= 1); assert.equal(f.enqueues.length, 0);
  resolveDiscovery([{ transactionId: 'synthetic-late', kind: 'capture' }]); await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(f.registrations.length, 0); assert.equal(await f.store.countType(NATIVE_POLL_TYPES.reference), 0); await noMoney(f);
});

test('exhausted crash leases enter review without endlessly calling the provider', async () => {
  const f = fixture(); f.movements.set(f.records[0].providerOrderId, []); await f.poll();
  const id = scheduleId(scope, f.records[0].providerOrderId), row = await f.store.get(NATIVE_POLL_TYPES.binding, id);
  await f.store.commit({ writes: [{ type: NATIVE_POLL_TYPES.binding, id, expectedVersion: row.version, doc: { ...row.doc, status: 'processing', attempts: 5, failures: 5, leaseOwner: 'synthetic-crashed-worker', leaseUntil: f.now(), nextAttemptAt: f.now() } }], indexes: [{ name: `native-poll:bindings-due:${hashPayload(scope)}`, member: id, score: f.now() }] });
  assert.equal((await f.poll()).reviewRequired, 1); assert.equal(f.queries.length, 1); await noMoney(f);
});

test('capture and refund discovery reaches actual verified worker/ledger exactly once with no financial allocation', async () => {
  const f = fixture(); const CUSTOMER = `usr_${'0'.repeat(19)}1`, ORDER = `MX-ORD-${'a'.repeat(32)}`;
  const mapping = { id: 'synthetic-inspected-poll-mapping', version: 'synthetic-v1', enabled: true, status: 'verified_live_native_mapping', projectId: 'tennis', organizationId: 'maximus-tennis', source: 'cscart_mpgs', merchantId: 'synthetic-merchant', storefrontId: 'synthetic-storefront', paymentMethodId: '18', storeOrigin: 'https://maximussports.ae', processor: 'MPGS', sellerLegalName: COMMERCE_LEDGER_SELLER, currency: 'AED', verifiedAt: AT, liveModeEvidenceId: 'synthetic-live-inspection', nativeMappingEvidenceId: 'synthetic-field-inspection', customerBindingEvidenceId: 'synthetic-owner-inspection' };
  const common = Object.fromEntries(['source', 'projectId', 'merchantId', 'storefrontId', 'paymentMethodId', 'storeOrigin', 'processor', 'sellerLegalName', 'currency'].map(key => [key, mapping[key]]));
  const native = { ...common, mode: 'live', providerOrderId: f.records[0].providerOrderId, commerceOrderId: ORDER, immutableOrderRevisionId: 'synthetic-approved-revision', approval: 'approved', kind: 'goods', cashTotalMinor: '12345', principalMinor: '0', bonusMinor: '0', customerBindingRef: f.records[0].id, boundCustomerUserId: CUSTOMER };
  const bound = { id: native.customerBindingRef, status: 'verified', source: 'server_account_binding', commerceOrderId: ORDER, providerOrderId: native.providerOrderId, projectId: 'tennis', organizationId: 'maximus-tennis', merchantId: mapping.merchantId, customerUserId: CUSTOMER, basis: 'immutable_commerce_customer', evidenceId: 'synthetic-owner-proof' };
  const bridge = createCommerceLedgerBridge({ store: f.store, mapping, now: f.now,
    resolveLivePayment: async reference => {
      const movement = f.verified.get(reference); if (!movement) throw conflict('unknown_native_reference');
      return { ...common, ...movement, mode: 'live', outcome: 'confirmed', paymentId: 'synthetic-goods-payment', eventId: reference, amountMinor: movement.kind === 'capture' ? '12345' : '2345', occurredAt: AT,
        proof: { method: 'provider_server_query', transportAuthenticated: true, liveModeVerified: true, moneyMovementConfirmed: true, movement: movement.kind, evidenceId: 'synthetic-query-evidence', verifiedAt: AT } };
    }, loadNativeOrder: async () => native, loadCustomerBinding: async () => bound });
  const worker = createLedgerWorker({ store: f.store, bridge, scope, now: f.now });
  const reader = createLedgerService({ store: f.store, now: f.now, authorizeRead: async ({ ctx, customerId }) => ctx?.userId === customerId, resolveVerifiedEvent: async () => null, loadOrder: async () => null });
  f.movements.set(f.records[0].providerOrderId, [{ transactionId: 'synthetic-refund', kind: 'refund' }, { transactionId: 'synthetic-capture', kind: 'capture' }]);
  assert.equal((await f.poll({ enqueueReference: worker.receiveReference })).referencesQueued, 2);
  assert.equal(await f.store.countType('ledgerJournal'), 0, 'discovery/queueing is never the receipt');
  await worker.runDue(); f.advance(1000); await worker.runDue();
  const account = (await reader.readClientSummary({ ctx: { userId: CUSTOMER }, projectId: 'tennis', customerId: CUSTOMER })).currencies[0];
  assert.equal(account.capturedMinor, '12345'); assert.equal(account.refundedMinor, '2345'); assert.equal(account.netCapturedMinor, '10000');
  assert.equal(account.bankBalanceMinor, null); assert.equal(account.principalOutstandingMinor, '0'); assert.equal(account.bonusAvailableMinor, '0');
  f.advance(60000); await f.poll({ enqueueReference: worker.receiveReference }); await worker.runDue();
  assert.equal(await f.store.countType('ledgerJournal'), 2); assert.equal(await f.store.countType('ledgerProgram'), 0);
  assert.equal((await reader.verifyClientJournal({ ctx: { userId: CUSTOMER }, projectId: 'tennis', customerId: CUSTOMER })).checkedEntries, 2);
});
