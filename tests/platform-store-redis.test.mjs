/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/** Real Redis exercises the production commit script, not an emulated transaction. */
import { describe, test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { createUpstashStore, keys } from '../lib/platform/store.js';
import { startTestRedis, startBridge, RedisConn } from './redis-rest-bridge.mjs';

const port = 6393, token = 'platform-local-test-only';
describe('platform transactions on native Redis', () => {
  let redis, conn, bridge, store, script, unavailable;
  before(async () => {
    try {
      redis = await startTestRedis(port);
      conn = new RedisConn(port); await conn.ready;
      bridge = await startBridge({ redisPort: port, token });
      store = createUpstashStore({ url: bridge.url, token, fetchImpl: async (url, options) => {
        const body = JSON.parse(options.body);
        if (body[0] === 'EVAL') script = body[1];
        return fetch(url, options);
      } });
      await store.commit({});
      assert.equal(typeof script, 'string');
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
  const commit = () => ({
    writes: [{ type: 'order', id: 'one', expectedVersion: -1, doc: { status: 'created' } }],
    uniques: [{ name: 'checkout', value: 'same-request', owner: 'one' }],
    indexes: [{ name: 'orders', score: 10, member: 'one' }],
  });

  native('wrong types in documents, versions, uniques and add/remove indexes cannot partly commit', async () => {
    const poisoned = [
      [keys.ver('order', 'one'), 'store_wrong_type'],
      [keys.doc('order', 'one'), 'store_wrong_type'],
      [keys.uniq('checkout', 'same-request'), 'store_wrong_type'],
      [keys.idx('orders'), 'store_bad_index'],
      [keys.idx('remove-from'), 'store_wrong_type'],
    ];
    for (const [key, code] of poisoned) {
      await command('FLUSHDB'); await command('RPUSH', key, 'untouched');
      const before = await state(), c = commit();
      c.unindexes = [{ name: 'remove-from', member: 'old' }];
      await assert.rejects(store.commit(c), error => error.code === code);
      assert.deepEqual(await state(), before);
    }
    await command('FLUSHDB'); await command('SET', keys.ver('order', 'one'), 'not-a-version');
    const before = await state();
    await assert.rejects(store.commit(commit()), error => error.code === 'store_bad_version');
    assert.deepEqual(await state(), before);
  });

  native('raw Lua nonfinite scores and conflicting unique owners leave every key untouched', async () => {
    const args = ['EVAL', script, 0, 1, keys.ver('order', 'one'), keys.doc('order', 'one'), '-1', '{"status":"created"}',
      1, keys.uniq('checkout', 'same-request'), 'one', 1, keys.idx('orders'), '10', 'one', 0, 0];
    for (const score of ['NaN', 'inf', '-inf', '1e309', 'not-a-score']) {
      const bad = [...args]; bad[13] = score;
      const reply = await command(...bad);
      assert.equal(reply[0], 0); assert.equal(reply[1], 'store_bad_index');
      assert.deepEqual(await state(), []);
    }
    const conflict = ['EVAL', script, 0, 1, keys.ver('order', 'one'), keys.doc('order', 'one'), '-1', '{}',
      2, keys.uniq('checkout', 'same-request'), 'one', keys.uniq('checkout', 'same-request'), 'other', 0, 0, 0];
    const reply = await command(...conflict);
    assert.equal(reply[0], 0); assert.equal(reply[1], 'unique_conflict');
    assert.deepEqual(await state(), []);
  });

  native('concurrent idempotency claims have one winner with one document/version/index', async () => {
    const replies = await Promise.allSettled(Array.from({ length: 12 }, (_, n) => {
      const id = 'order-' + n;
      return store.commit({
        writes: [{ type: 'order', id, expectedVersion: -1, doc: { id, status: 'created' } }],
        uniques: [{ name: 'idempotency', value: 'duplicate', owner: id }],
        indexes: [{ name: 'orders', score: n, member: id }],
      });
    }));
    assert.equal(replies.filter(reply => reply.status === 'fulfilled').length, 1);
    assert.ok(replies.filter(reply => reply.status === 'rejected').every(reply => reply.reason.code === 'unique_conflict'));
    const winner = await store.getUnique('idempotency', 'duplicate');
    assert.deepEqual(await command('KEYS', 'mxp:doc:order:*'), [keys.doc('order', winner)]);
    assert.deepEqual(await command('KEYS', 'mxp:ver:order:*'), [keys.ver('order', winner)]);
    assert.deepEqual(await store.listIndex('orders'), [winner]);
    assert.equal(await store.indexSize('orders'), 1);
    assert.deepEqual(await store.get('order', winner), { version: 1, doc: { id: winner, status: 'created' } });
  });

  native('stale multi-record CAS commits one order/event/outbox/version/index as a unit', async () => {
    await store.commit(commit());
    const candidates = ['a', 'b'].map((id, n) => ({
      writes: [
        { type: 'order', id: 'one', expectedVersion: 1, doc: { status: 'paid', event: id } },
        { type: 'event', id, expectedVersion: -1, doc: { orderId: 'one' } },
        { type: 'outbox', id, expectedVersion: -1, doc: { status: 'pending', orderId: 'one' } },
      ],
      uniques: [{ name: 'provider-event', value: id, owner: 'one' }],
      indexes: [{ name: 'outbox', score: 20 + n, member: id }],
    }));
    const replies = await Promise.allSettled(candidates.map(c => store.commit(c)));
    assert.equal(replies.filter(reply => reply.status === 'fulfilled').length, 1);
    const rejected = replies.find(reply => reply.status === 'rejected');
    assert.equal(rejected.reason.code, 'version_conflict');
    const winner = replies[0].status === 'fulfilled' ? 'a' : 'b', loser = winner === 'a' ? 'b' : 'a';
    assert.deepEqual(await store.get('order', 'one'), { version: 2, doc: { status: 'paid', event: winner } });
    assert.deepEqual(await store.get('event', winner), { version: 1, doc: { orderId: 'one' } });
    assert.deepEqual(await store.get('outbox', winner), { version: 1, doc: { status: 'pending', orderId: 'one' } });
    assert.equal(await store.get('event', loser), null); assert.equal(await store.get('outbox', loser), null);
    assert.equal(await store.getUnique('provider-event', loser), null);
    assert.deepEqual(await store.listIndex('outbox'), [winner]);
    assert.equal(await store.indexSize('outbox'), 1);
  });
});
