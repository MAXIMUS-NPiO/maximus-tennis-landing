/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createIdentity, hashPassword } from '../lib/platform/identity.js';
import { createMemoryStore } from '../lib/platform/store.js';
import { checkoutKillSwitch, readFlags } from '../lib/platform/flags.js';

test('missing, wrong and inactive logins each perform one password KDF', async t => {
  const store = createMemoryStore(), passwordHash = hashPassword('fixture-account-password');
  await store.commit({ writes: [{ type: 'user', id: 'fixture_user', doc: { id: 'fixture_user', status: 'active', emailNormalized: 'known@example.invalid', passwordHash }, expectedVersion: -1 }], uniques: [{ name: 'user_email', value: 'known@example.invalid', owner: 'fixture_user' }] });
  const identity = createIdentity({ store, mailer: { send: async () => ({ ok: true }) } });
  const original = crypto.scryptSync;
  const spy = t.mock.method(crypto, 'scryptSync', (...args) => original(...args));
  for (const email of ['missing@example.invalid', 'known@example.invalid']) {
    spy.mock.resetCalls();
    await assert.rejects(identity.login({ email, password: 'incorrect-fixture-password' }), { code: 'invalid_credentials' });
    assert.equal(spy.mock.callCount(), 1);
  }
  const u = await store.get('user', 'fixture_user');
  await store.commit({ writes: [{ type: 'user', id: u.doc.id, doc: { ...u.doc, status: 'suspended' }, expectedVersion: u.version }] });
  spy.mock.resetCalls();
  await assert.rejects(identity.login({ email: 'known@example.invalid', password: 'fixture-account-password' }), { code: 'invalid_credentials' });
  assert.equal(spy.mock.callCount(), 1);
  assert.deepEqual(await store.listIndex('sessions:user:fixture_user'), []);
});

test('checkout stops when the kill-switch store or setting cannot be verified', async () => {
  const broken = await checkoutKillSwitch({ get: async () => { throw new Error('fixture outage'); } });
  assert.deepEqual(broken, { active: true, reason: 'verification_unavailable' });
  for (const doc of [{}, { active: 'false' }, { active: null }]) assert.equal((await checkoutKillSwitch({ get: async () => ({ doc }) })).active, true);
  assert.deepEqual(await checkoutKillSwitch({ get: async () => null }), { active: false });
  assert.equal((await checkoutKillSwitch({ get: async () => ({ doc: { active: false } }) })).active, false);
  assert.equal((await checkoutKillSwitch({ get: async () => ({ doc: { active: true } }) })).active, true);
});

test('production admin MFA remains mandatory even when an environment flag is false', () => {
  assert.equal(readFlags({ NODE_ENV: 'production', ADMIN_REQUIRE_MFA: 'false' }).adminRequireMfa, true);
  assert.equal(readFlags({ NODE_ENV: 'test' }).adminRequireMfa, false);
  assert.equal(readFlags({ NODE_ENV: 'test', ADMIN_REQUIRE_MFA: 'true' }).adminRequireMfa, true);
});
