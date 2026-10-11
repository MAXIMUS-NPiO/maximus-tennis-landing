/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { acceptOrder, authorized } from '../lib/commerce/service.js';
import { acceptCustomerOrder } from '../lib/commerce/customer-order.js';
import { createMemoryCommerceStore } from '../lib/commerce/store.js';
import { createMemoryStore } from '../lib/platform/store.js';
import { createPortal } from '../lib/platform/portal.js';
import { newId } from '../lib/platform/ids.js';
import { readOrderConfig } from '../lib/commerce/config.js';

const origin = 'https://maximus.tennis';
const secret = 'FIXTURE-ONLY-ORDER-CAPABILITY-NOT-A-CREDENTIAL';
const at = Date.parse('2026-10-11T00:00:00Z');
const context = (userId = newId('usr')) => ({ userId, organizationId: 'maximus-tennis', emailVerified: true });
const payload = (over = {}) => ({ purpose: 'config', locale: 'en', fields: { name: 'Synthetic test client', email: 'form@example.invalid', role: 'player', country: 'Test country' }, config: { series: 'great', cls: 'P1.5', mode: 'listed', weight: 272, grip: 'L3', setType: 'individual', sets: 1, use: 'play', ptype: 'none' }, technical: { measurement_basis: 'unstrung', balance: { choice: 'request', requested: 332, customer_confirmed: true }, frame_stiffness: { choice: 'request', requested: 64, customer_confirmed: true } }, paymentPreference: 'payment_link', consent: true, plan: 'A', idempotencyKey: crypto.randomUUID(), elapsedMs: 3000, hp: '', ...over });
const req = (path = '/api/orders', body = {}, headers = {}) => new Request(origin + path, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
const options = () => ({ store: createMemoryCommerceStore(), accessSecret: secret, projectId: 'tennis', publicOrigin: origin, now: at });

test('form customer claims never bind a guest order', async () => {
  const cfg = options(), claimed = newId('usr');
  const r = await acceptOrder(payload({ customerUserId: claimed, customerContext: context(claimed) }), cfg);
  assert.equal(r.http, 201); assert.equal(r.body.order.snapshot.customerUserId, null);
});

test('verified customer is immutable and idempotency is scoped to that customer', async () => {
  const cfg = options(), p = payload(), one = context(), two = context();
  const a = await acceptOrder(p, { ...cfg, customerContext: one });
  const again = await acceptOrder(p, { ...cfg, customerContext: one });
  const b = await acceptOrder(p, { ...cfg, customerContext: two });
  assert.equal(a.http, 201); assert.equal(again.http, 200); assert.equal(b.http, 201);
  assert.equal(again.body.request_id, a.body.request_id); assert.notEqual(a.body.request_id, b.body.request_id);
  assert.equal(a.body.order.snapshot.customerUserId, one.userId); assert.equal(b.body.order.snapshot.customerUserId, two.userId);
  const doc = await cfg.store.get(a.body.request_id);
  await assert.rejects(cfg.store.swap(doc, { ...doc, snapshot: { ...doc.snapshot, customerUserId: two.userId } }), /immutable_snapshot/);
});

test('unverified, foreign-tenant or malformed server context cannot create an order', async () => {
  for (const bad of [{ ...context(), emailVerified: false }, { ...context(), organizationId: 'another-tenant' }, { ...context(), userId: 'untrusted' }]) {
    const cfg = options();
    assert.equal((await acceptOrder(payload(), { ...cfg, customerContext: bad })).http, 403);
  }
});

test('unpaid financing requests never expose simulated money as account balances', async () => {
  for (const plan of ['B', 'C']) {
    const accepted = await acceptOrder(payload({ plan }), options());
    assert.equal(accepted.http, 201); assert.equal(accepted.body.order.payment.status, 'blocked');
    assert.equal(accepted.body.order.accounts, null);
    assert.equal(accepted.body.order.snapshot.accountTerms, undefined);
    assert.equal(accepted.body.order.snapshot.financing, undefined);
    assert.equal(accepted.body.order.invoice, null);
  }
});

test('order intake rejects cross-site requests before authentication or persistence', async () => {
  const cfg = options(); let called = false;
  for (const headers of [{ Origin: 'https://attacker.example.invalid' }, { Origin: '' }, { 'Sec-Fetch-Site': 'cross-site' }]) {
    await assert.rejects(acceptCustomerOrder(req('/api/orders', {}, headers), payload(), cfg, { getCustomerContext: async () => { called = true; return null; } }), { code: 'origin_invalid' });
  }
  assert.equal(called, false);
  assert.equal(readOrderConfig({ ORDER_FLOW_ENABLED: 'true', PUBLIC_BASE_URL: 'http://attacker.example.invalid', NODE_ENV: 'production' }).enabled, false);
});

test('account link outage preserves the accepted order and retries without duplication', async () => {
  const cfg = options(), p = payload(), customer = context();
  const deps = { getCustomerContext: async () => customer, linkCustomerOrder: async () => { throw new Error('fixture store outage'); } };
  const first = await acceptCustomerOrder(req(), p, cfg, deps);
  assert.equal(first.http, 201); assert.equal(first.body.account_link, 'pending');
  assert.ok(first.body.access_token); assert.ok(await cfg.store.get(first.body.request_id));
  const second = await acceptCustomerOrder(req(), p, cfg, { ...deps, linkCustomerOrder: async (_, { orderId }) => ({ linked: true, orderId }) });
  assert.equal(second.http, 200); assert.equal(second.body.request_id, first.body.request_id); assert.equal(second.body.account_link, 'linked');
});

test('real portal session and CSRF bind order ownership, without trusting the form email', async () => {
  const cfg = options(), store = createMemoryStore(), messages = [];
  const portal = createPortal({ store, mailer: { send: async m => { messages.push(m); return { ok: true }; } }, env: { NODE_ENV: 'test' }, now: () => at,
    resolveOrderOwnership: ({ orderId, accessToken }) => authorized(cfg.store, orderId, accessToken, secret, at, 'tennis') });
  const email = 'verified-owner@example.invalid', password = 'fixture-long-password';
  assert.equal((await portal.handle(req('/api/accounts/register', { email, password, displayName: 'Synthetic owner', roles: ['player'], locale: 'en', consents: { terms: true, privacy: true, marketing: false } }), 'register')).status, 202);
  const token = new URL(messages[0].params.link).searchParams.get('token');
  assert.equal((await portal.handle(req('/api/accounts/verify', { token }), 'verify')).status, 200);
  const login = await portal.handle(req('/api/accounts/login', { email, password }), 'login');
  const session = await login.json(), cookie = login.headers.get('set-cookie').split(';')[0];
  const dependencies = { getCustomerContext: r => portal.authenticatedCustomer(r), linkCustomerOrder: (r, body) => portal.linkOrder(r, body) };
  await assert.rejects(acceptCustomerOrder(req('/api/orders', {}, { Cookie: cookie }), payload(), cfg, dependencies), { code: 'csrf_invalid' });
  const accepted = await acceptCustomerOrder(req('/api/orders', {}, { Cookie: cookie, 'X-CSRF-Token': session.csrfToken }), payload(), cfg, dependencies);
  assert.equal(accepted.body.account_link, 'linked'); assert.equal(accepted.body.order.snapshot.customerUserId, session.user.id);
  assert.equal(accepted.body.order.snapshot.contact.email, 'form@example.invalid');
  const mapping = await store.get('portalOrder', accepted.body.request_id);
  assert.equal(mapping.doc.customerUserId, session.user.id); assert.equal(mapping.doc.organizationId, 'maximus-tennis');
});
