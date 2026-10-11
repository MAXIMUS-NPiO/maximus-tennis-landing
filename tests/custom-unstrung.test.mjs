/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { validateConfig } from '../lib/intake/schema.js';
import { canonical } from '../lib/intake/service.js';
import { technicalSnapshot } from '../lib/commerce/technical.js';
import { acceptOrder, hash } from '../lib/commerce/service.js';
import { createMemoryCommerceStore } from '../lib/commerce/store.js';
const custom = { series: 'great', cls: 'P1.5', mode: 'custom', customWeight: 301, grip: 'L3', setType: 'individual', sets: 1, use: 'play', ptype: 'none' };
const intent = () => ({ balance: { choice: 'request', requested: 340, customer_confirmed: true }, frame_stiffness: { choice: 'request', requested: 64, customer_confirmed: true } });
test('custom configuration fixes omitted basis to Unstrung; supplied Strung/unknown rejected; no stringing fields', () => {
  const r = validateConfig({ ...custom, strings: 'MOCK', tension: 25, stringingRequest: true });
  assert.equal(r.ok, true); assert.equal(r.value.basis, 'unstrung');
  for (const k of ['strings', 'tension', 'stringingRequest']) assert.equal(k in r.value, false);
  for (const basis of ['strung', 'unknown']) assert.equal(validateConfig({ ...custom, basis }).ok, false);
  const listed = validateConfig({ ...custom, mode: 'listed', weight: 272, basis: 'strung' });
  assert.equal(listed.ok, true); assert.equal(listed.value.basis, 'strung');
});
test('custom technical snapshot remains Unstrung with explicit RA/balance confirmation', () => {
  const c = validateConfig(custom).value, technicalApproval = { approved: true, evidence: 'MOCK engineering', measurementBasis: 'unstrung', balanceMm: 340, frameRA: 64 };
  const r = technicalSnapshot(c, intent(), { technicalApproval });
  assert.equal(r.ok, true); assert.equal(r.value.final, true); assert.equal(r.value.measurement_basis, 'unstrung');
  assert.equal(r.value.delivery_condition, 'unstrung'); assert.equal(r.value.balance.confirmed_balance, 340); assert.equal(r.value.frame_stiffness.confirmed_ra, 64);
  assert.equal(technicalSnapshot(c, { ...intent(), measurement_basis: 'strung' }, { technicalApproval }).ok, false);
  const noRA = intent(); noRA.frame_stiffness.customer_confirmed = false; assert.equal(technicalSnapshot(c, noRA, { technicalApproval }).ok, false);
});
test('server-approved custom quotation explicitly supplies Unstrung, never stringing/tension', async () => {
  const normalized = validateConfig(custom).value;
  const offer = { configurationHash: hash(canonical(normalized)), approved: true, expiresAt: '2027-10-09T12:00:00Z', currency: 'EUR', productMinor: 50000, taxMinor: 5000, shippingMinor: 5000, totalMinor: 60000, seller: { legalName: 'MOCK SELLER', address: 'MOCK' }, technicalApproval: { approved: true, balanceMm: 340, frameRA: 64, measurementBasis: 'unstrung', evidence: 'MOCK engineering' }, bankDetails: { approved: true, evidence: 'MOCK bank', currency: 'EUR', bankName: 'MOCK', accountName: 'MOCK SELLER', accountNumber: 'MOCK-NOT-PAYABLE', swift: 'MOCK-NOT-PAYABLE' }, termsVersion: 'MOCK-v1', termsText: 'MOCK terms', deliveryTerms: 'MOCK all-inclusive', evidence: 'MOCK', pricingPolicy: 'worldwide-all-inclusive-v1', fulfillableCountries: ['Mock country'] };
  const store = createMemoryCommerceStore();
  const p = { purpose: 'config', locale: 'en', fields: { name: 'Mock', email: 'adult@example.invalid', role: 'player', country: 'Mock country' }, config: custom, technical: intent(), paymentPreference: 'payment_link', consent: true, plan: 'A', idempotencyKey: crypto.randomUUID(), elapsedMs: 3000, hp: '' };
  const options = { store, accessSecret: 'LOCAL-MOCK-ONLY-NOT-A-CREDENTIAL-123456789', offers: [offer] };
  const r = await acceptOrder(p, options); assert.equal(r.http, 201);
  const item = r.body.order.snapshot.quotation.items[0]; assert.equal(item.deliveryCondition, 'unstrung'); assert.equal(item.configuration.basis, 'unstrung');
  assert.equal(item.technical.balance.confirmed_balance, 340); assert.equal(item.technical.frame_stiffness.confirmed_ra, 64);
  assert.equal((await acceptOrder({ ...p, technical: { ...intent(), measurement_basis: 'unstrung' } }, options)).http, 200);
  assert.equal(/stringingRequest|"tension"|"strings"/.test(JSON.stringify(item)), false);
  assert.equal(r.body.order.invoice, null);
});
