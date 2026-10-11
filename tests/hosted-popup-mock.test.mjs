/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createHostedMock } from './browser/hosted-mock.mjs';
import { acceptOrder, checkout, hash } from '../lib/commerce/service.js';
import { canonical } from '../lib/intake/service.js';
import { validateConfig } from '../lib/intake/schema.js';
import { createMemoryCommerceStore } from '../lib/commerce/store.js';
async function fixture() {
  const store = createMemoryCommerceStore(), config = { series: 'great', cls: 'P1.5', mode: 'listed', weight: 272, grip: 'L3', setType: 'individual', sets: 1, use: 'play', ptype: 'none' };
  const offer = { configurationHash: hash(canonical(validateConfig(config).value)), approved: true, expiresAt: '2027-10-09T12:00:00Z', currency: 'EUR', productMinor: 60000, taxMinor: 0, shippingMinor: 0, totalMinor: 60000, seller: { legalName: 'MOCK SELLER', address: 'MOCK' }, technicalApproval: { approved: true, balanceMm: 332, frameRA: 64, measurementBasis: 'unstrung', evidence: 'MOCK' }, bankDetails: { approved: true, evidence: 'MOCK', currency: 'EUR', bankName: 'MOCK', accountName: 'MOCK', accountNumber: 'MOCK-NOT-PAYABLE', swift: 'MOCK-NOT-PAYABLE' }, termsVersion: 'MOCK-v1', termsText: 'MOCK', deliveryTerms: 'MOCK', evidence: 'MOCK', pricingPolicy: 'worldwide-all-inclusive-v1', fulfillableCountries: ['Mock country'] };
  const p = { purpose: 'config', locale: 'en', fields: { name: 'Mock', email: 'mock@example.invalid', role: 'player', country: 'Mock country' }, config, consent: true, plan: 'A', technical: { measurement_basis: 'unstrung', balance: { choice: 'request', requested: 332, customer_confirmed: true }, frame_stiffness: { choice: 'request', requested: 64, customer_confirmed: true } }, paymentPreference: 'payment_link', idempotencyKey: crypto.randomUUID(), elapsedMs: 3000, hp: '' };
  const a = await acceptOrder(p, { store, accessSecret: 'MOCK-NOT-A-CREDENTIAL-12345678901234567', offers: [offer] });
  const id = a.body.request_id, hosted = createHostedMock({ store, origin: 'http://127.0.0.1:12345' });
  await checkout(await store.get(id), { store, gateway: hosted.gateway, termsVersion: 'MOCK-v1' });
  const sessionId = (await store.get(id)).payment.session.sessionId;
  return { store, id, hosted, sessionId };
}
test('mock hosted capture concurrent/repeated requests create one verified invoice', async () => {
  const x = await fixture(), results = await Promise.all(Array.from({ length: 12 }, () => x.hosted.capture(x.sessionId)));
  assert.ok(results.every(r => r.http === 200)); assert.equal(x.hosted.stats().captureOperations, 1);
  const before = await x.store.get(x.id); assert.equal(before.payment.status, 'paid'); assert.ok(before.invoice);
  await x.hosted.capture(x.sessionId); assert.deepEqual((await x.store.get(x.id)).invoice, before.invoice);
  assert.equal(before.events.filter(e => e.type === 'payment_paid').length, 1);
});
test('mock hosted cancellation and expiry block capture without paid/invoice', async () => {
  for (const state of ['cancelled', 'expired']) {
    const x = await fixture();
    if (state === 'cancelled') { assert.equal(x.hosted.cancel(x.sessionId).http, 200); assert.equal(x.hosted.cancel(x.sessionId).http, 200); }
    else x.hosted.expire(x.sessionId);
    const result = await x.hosted.capture(x.sessionId); assert.equal(result.body.status, state); assert.ok(result.http >= 400);
    const doc = await x.store.get(x.id); assert.equal(doc.payment.status, 'pending'); assert.equal(doc.invoice, null); assert.equal(x.hosted.stats().captureOperations, 0);
  }
});
test('mock hosted sessions are bound to order; redirect/bootstrap never changes payment', async () => {
  const x = await fixture(), doc = await x.store.get(x.id);
  assert.match(x.hosted.bootstrap(doc), /location.replace/); assert.equal((await x.hosted.capture('invented-session')).http, 404);
  assert.equal((await x.store.get(x.id)).invoice, null); assert.equal(x.hosted.stats().captureOperations, 0);
  assert.match(x.hosted.html(x.sessionId).html, /LOCAL MOCK ONLY/);
});
