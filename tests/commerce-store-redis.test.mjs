/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/** Native Lua transaction regressions. INTAKE_REQUIRE_REDIS=1 makes Redis mandatory. */
import { describe, test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { CREATE, CAS, createCommerceStore } from '../lib/commerce/store.js';
import { startTestRedis, startBridge, RedisConn } from './redis-rest-bridge.mjs';

const port = 6392, token = 'commerce-local-test-only';
const orderId = n => 'MX-ORD-' + n.toString(16).padStart(32, '0');
const hash = 'a'.repeat(64), idem = 'mx:commerce:idem:' + hash;
const orderKey = id => 'mx:commerce:order:' + id;
const pending = 'mx:commerce:pending';
const document = (n = 1) => ({
  id: orderId(n), snapshot: { schema: 1, projectId: 'tennis', configuration: { series: 'great' } },
  payment: { status: 'ready' }, invoice: null,
  mail: { confirmation: { status: 'pending', nextAt: 10, history: [] } }, events: [],
});

describe('commerce store on native Redis', () => {
  let redis, conn, bridge, store, unavailable;
  before(async () => {
    try {
      redis = await startTestRedis(port);
      conn = new RedisConn(port); await conn.ready;
      bridge = await startBridge({ redisPort: port, token });
      store = createCommerceStore({ url: bridge.url, token });
    } catch (error) {
      bridge?.close(); conn?.close(); await redis?.close();
      if (process.env.INTAKE_REQUIRE_REDIS === '1' || !['ENOENT', 'EACCES', 'EPERM'].includes(error.code)) throw error;
      unavailable = 'native Redis unavailable: ' + error.code;
    }
  });
  after(async () => { bridge?.close(); conn?.close(); await redis?.close(); });
  beforeEach(async () => { if (!unavailable) await command('FLUSHDB'); });
  async function command(...args) {
    const reply = await conn.send(args);
    if (reply?.__error) throw new Error(reply.__error);
    return reply;
  }
  async function state() {
    const result = [];
    for (const key of (await command('KEYS', '*')).sort()) {
      const type = await command('TYPE', key);
      const value = type === 'string' ? await command('GET', key)
        : type === 'list' ? await command('LRANGE', key, 0, -1)
        : await command('ZRANGE', key, 0, -1, 'WITHSCORES');
      result.push([key, type, value]);
    }
    return result;
  }
  function native(name, run) {
    test(name, async t => { if (unavailable) return t.skip(unavailable); await run(); });
  }
  const createArgs = doc => ['EVAL', CREATE, 3, idem, orderKey(doc.id), pending, doc.id, JSON.stringify(doc), 10];
  const casArgs = (before, afterDoc) => ['EVAL', CAS, 2, orderKey(before.id), pending, JSON.stringify(before), JSON.stringify(afterDoc), 10, before.id];

  native('CREATE rejects bad scores, JSON, schema, IDs and key types without any partial writes', async () => {
    const bad = [
      args => { args[8] = 'NaN'; }, args => { args[8] = '-1'; }, args => { args[8] = '1.5'; },
      args => { args[8] = '9007199254740992'; }, args => { args[8] = '9'; },
      args => { args[7] = '{'; },
      args => { const doc = document(); doc.snapshot.schema = 2; args[7] = JSON.stringify(doc); },
      args => { const doc = document(2); args[7] = JSON.stringify(doc); },
      args => { const doc = document(); doc.mail.confirmation.nextAt = '10'; args[7] = JSON.stringify(doc); },
      args => { args[4] = 'mx:commerce:order:elsewhere'; },
      args => { args[3] = 'mx:commerce:idem:invalid'; },
    ];
    for (const change of bad) {
      const args = createArgs(document()); change(args);
      await assert.rejects(command(...args), /commerce_bad_document/);
      assert.deepEqual(await state(), []);
    }
    for (const key of [idem, orderKey(orderId(1)), pending]) {
      await command('FLUSHDB'); await command('RPUSH', key, 'untouched');
      const before = await state();
      await assert.rejects(command(...createArgs(document())), /commerce_wrong_type/);
      assert.deepEqual(await state(), before);
    }
  });

  native('CAS rejects malformed documents/scores and wrong key types before changing order or queue', async () => {
    const bad = [
      args => { args[7] = 'NaN'; }, args => { args[7] = '9'; },
      args => { args[6] = '{'; }, args => { args[5] = '{'; },
      args => { const doc = document(); doc.snapshot.schema = 2; args[6] = JSON.stringify(doc); },
      args => { args[6] = JSON.stringify(document(2)); },
      args => { const doc = document(); doc.mail.confirmation.nextAt = -1; args[6] = JSON.stringify(doc); },
      args => { args[3] = 'mx:commerce:order:elsewhere'; },
    ];
    for (const change of bad) {
      await command('FLUSHDB'); await command(...createArgs(document()));
      const args = casArgs(document(), document()); change(args);
      const before = await state();
      await assert.rejects(command(...args), /commerce_bad_document/);
      assert.deepEqual(await state(), before);
    }
    for (const key of [orderKey(orderId(1)), pending]) {
      await command('FLUSHDB'); await command(...createArgs(document()));
      await command('DEL', key); await command('RPUSH', key, 'untouched');
      const before = await state();
      await assert.rejects(command(...casArgs(document(), document())), /commerce_wrong_type/);
      assert.deepEqual(await state(), before);
    }
  });

  native('raw CAS protects snapshots and existing invoices; stale CAS cannot overwrite events', async () => {
    const before = document(); before.invoice = { number: 'TEST-INVOICE', totalMinor: 60000 };
    await command(...createArgs(before));
    for (const change of [
      doc => { doc.snapshot.configuration.series = 'spin'; },
      doc => { doc.invoice.totalMinor = 1; },
      doc => { doc.invoice = null; },
    ]) {
      const changed = structuredClone(before); change(changed);
      const original = await state();
      assert.equal(await command(...casArgs(before, changed)), -1);
      assert.deepEqual(await state(), original);
    }
    const changed = structuredClone(before); changed.events.push({ type: 'accepted' });
    assert.equal(await command(...casArgs(before, changed)), 1);
    const original = await state();
    assert.equal(await command(...casArgs(before, before)), 0);
    assert.deepEqual(await state(), original);
  });

  native('REST adapter concurrent duplicate submissions create one document and one due entry', async () => {
    const replies = await Promise.all(Array.from({ length: 12 }, (_, i) => store.create(hash, document(i + 1))));
    assert.equal(replies.filter(reply => reply.created).length, 1);
    assert.equal(new Set(replies.map(reply => reply.id)).size, 1);
    const id = replies[0].id;
    assert.equal(await command('GET', idem), id);
    assert.deepEqual(await command('KEYS', 'mx:commerce:order:*'), [orderKey(id)]);
    assert.deepEqual(await command('ZRANGE', pending, 0, -1, 'WITHSCORES'), [id, '10']);
    assert.deepEqual(await store.due(10), [id]);
    assert.deepEqual(await store.get(id), document(parseInt(id.slice(-2), 16)));
  });

  native('REST adapter stale CAS has one winner; invoice, event and outbox are committed together', async () => {
    await store.create(hash, document());
    const before = await store.get(orderId(1));
    const candidates = [20, 30].map(nextAt => {
      const doc = structuredClone(before);
      doc.events.push({ type: 'claimed', nextAt }); doc.mail.confirmation.nextAt = nextAt;
      return doc;
    });
    const replies = await Promise.all(candidates.map(doc => store.swap(before, doc)));
    assert.equal(replies.filter(Boolean).length, 1);
    const winner = candidates[replies.indexOf(true)];
    assert.deepEqual(await store.get(before.id), winner);
    assert.equal(await command('ZSCORE', pending, before.id), String(winner.mail.confirmation.nextAt));
    const paid = structuredClone(winner);
    paid.payment.status = 'paid'; paid.invoice = { number: 'TEST-INVOICE', totalMinor: 60000 };
    paid.events.push({ type: 'paid' }); paid.mail.confirmation.status = 'sent';
    paid.mail.invoice = { status: 'pending', nextAt: 12, history: [] };
    assert.equal(await store.swap(winner, paid), true);
    assert.deepEqual(await store.get(before.id), paid);
    assert.deepEqual(await store.due(11), []);
    assert.deepEqual(await store.due(12), [before.id]);
    const invalid = structuredClone(paid); invalid.invoice.totalMinor = 1;
    await assert.rejects(store.swap(paid, invalid), /immutable_snapshot/);
    assert.deepEqual(await store.get(before.id), paid);
    assert.equal(await command('ZSCORE', pending, before.id), '12');
  });
});
