/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { acceptOrder, hash } from '../lib/commerce/service.js';
import { createMemoryCommerceStore } from '../lib/commerce/store.js';
import { canonical } from '../lib/intake/service.js';
import { validateConfig, validateRequest } from '../lib/intake/schema.js';
import { normalizePurchaseRequest } from '../lib/commerce/purchase-intent.js';

const now = Date.parse('2026-10-11T00:00:00Z');
const configuration = { series: 'great', cls: 'P1.5', mode: 'listed', weight: 272, grip: 'L3', setType: 'individual', sets: 1, use: 'play', ptype: 'none' };
const payload = (over = {}) => ({ purpose: 'config', locale: 'en', fields: { name: 'Synthetic client', email: 'test@example.invalid', role: 'player', country: 'Test country' }, config: { ...configuration }, technical: { measurement_basis: 'unstrung', balance: { choice: 'request', requested: 332, customer_confirmed: true }, frame_stiffness: { choice: 'request', requested: 64, customer_confirmed: true } }, paymentPreference: 'payment_link', consent: true, plan: 'A', idempotencyKey: crypto.randomUUID(), elapsedMs: 3000, hp: '', ...over });
const options = () => ({ store: createMemoryCommerceStore(), accessSecret: 'FIXTURE-ONLY-PURCHASE-INTENT-CAPABILITY-SECRET', now, projectId: 'tennis' });
const interest = (over = {}) => ({ purchaseIntent: 'goods_with_program_interest', ...over });
const legacyMaterial = p => ({ ...validateRequest(p).value, locale: 'en', plan: p.plan, projectId: 'tennis', customerUserId: null, technical: { measurement_basis: 'unstrung', balance: { choice: 'request', requested: 332, accepted_proposed: null, customer_confirmed: true }, frame_stiffness: { choice: 'request', requested: 64, accepted_proposed: null, customer_confirmed: true } }, paymentPreference: 'payment_link' });

test('ordinary purchase defaults explicitly, without a program request or new financial state', async () => {
  const config = options(), p = payload();
  const first = await acceptOrder(p, config);
  const same = await acceptOrder({ ...p, purchaseIntent: 'goods_only' }, config);
  assert.equal(first.http, 201); assert.equal(same.http, 200);
  assert.equal(same.body.request_id, first.body.request_id);
  const saved = await config.store.get(first.body.request_id);
  assert.equal(saved.snapshot.purchaseIntent, 'goods_only');
  assert.equal(saved.snapshot.programRequest, undefined);
  assert.equal(saved.snapshot.accountTerms, null); assert.equal(saved.snapshot.financing, null);
  assert.equal(saved.payment.status, 'awaiting_quote'); assert.equal(saved.invoice, null);
  assert.equal(first.body.order.accounts, null);
});

test('program interest without a principal requests terms without enrollment or fabricated amount', async () => {
  const config = options(), result = await acceptOrder(payload(interest()), config);
  assert.equal(result.http, 201);
  const doc = await config.store.get(result.body.request_id);
  assert.deepEqual(doc.snapshot.programRequest, { status: 'terms_requested' });
  assert.deepEqual(result.body.order.snapshot.programRequest, { status: 'terms_requested' });
  assert.equal(doc.snapshot.accountTerms, null); assert.equal(doc.snapshot.financing, null);
  assert.equal(doc.snapshot.terms.accepted, false); assert.equal(result.body.order.accounts, null);
  assert.equal(result.body.order.invoice, null);
  assert.deepEqual(doc.events.map(e => e.type), ['accepted']);
});

test('principal is canonical exact minor-unit text for each request currency', async () => {
  for (const currency of ['EUR', 'AED', 'USD']) {
    const result = await acceptOrder(payload(interest({ programRequest: { principal: ' 001 234,50 ', currency } })), options());
    assert.equal(result.http, 201);
    assert.deepEqual(result.body.order.snapshot.programRequest, { status: 'terms_requested', requestedPrincipalMinor: '123450', currency });
  }
});

test('huge exact positive principal remains a terms request, with no arbitrary business maximum', async () => {
  const config = options();
  const result = await acceptOrder(payload(interest({ programRequest: { principal: '9007199254740992.99', currency: 'EUR' } })), config);
  assert.equal(result.http, 201);
  assert.deepEqual(result.body.order.snapshot.programRequest, { status: 'terms_requested', requestedPrincipalMinor: '900719925474099299', currency: 'EUR' });
  assert.equal((await config.store.get(result.body.request_id)).snapshot.accountTerms, null);
});

test('unknown or incorrectly typed purchase intent is rejected before persistence', async () => {
  for (const purchaseIntent of [null, undefined, '', 'investment', 'GOODS_ONLY', true, 0, [], {}]) {
    const config = options(); let creates = 0;
    config.store.create = async () => { creates++; throw new Error('must not create'); };
    const result = await acceptOrder(payload({ purchaseIntent }), config);
    assert.equal(result.http, 400); assert.equal(result.body.errors.purchaseIntent, 'invalid_choice');
    assert.equal(creates, 0);
  }
});

test('malformed, partial and unknown-field program requests are rejected', async () => {
  for (const programRequest of [null, undefined, [], '6000', {}, { principal: '1' }, { currency: 'EUR' }, { principal: '1', currency: 'EUR', rateBps: 2000 }, { principal: '1', currency: 'EUR', termsAccepted: true }, { principal: '1', currency: 'EUR', enrolled: true }, { status: 'approved', requestedPrincipalMinor: '100', currency: 'EUR' }]) {
    const result = await acceptOrder(payload(interest({ programRequest })), options());
    assert.equal(result.http, 400); assert.equal(result.body.errors.programRequest, 'invalid');
  }
});

test('principal rejects non-text, zero, signs, excessive decimals and ambiguous or exponent forms', async () => {
  for (const principal of [6000, 0.1, Number.MAX_SAFE_INTEGER, null, false, {}, [], '', '0', '0.00', '-1', '+1', '1.001', '1e3', '1,234.00', '.50', '12 34']) {
    const result = await acceptOrder(payload(interest({ programRequest: { principal, currency: 'EUR' } })), options());
    assert.equal(result.http, 400, String(principal));
    assert.ok(result.body.errors['programRequest.principal']);
  }
});

test('unsupported currencies and client financial approvals are rejected', async () => {
  for (const currency of ['eur', 'GBP', '', null, 1, {}]) {
    const result = await acceptOrder(payload(interest({ programRequest: { principal: '1', currency } })), options());
    assert.equal(result.http, 400); assert.equal(result.body.errors['programRequest.currency'], 'invalid_choice');
  }
  for (const claim of ['rateBps', 'termsAccepted', 'enrolled', 'approved', 'programApproved', 'approvedBy', 'programTerms', 'accountTerms', 'financing']) {
    const result = await acceptOrder(payload({ ...interest(), [claim]: true }), options());
    assert.equal(result.http, 400); assert.equal(result.body.errors[claim], 'invalid');
  }
});

test('goods-only cannot carry program amounts and legacy B/C cannot acquire new purchase fields', async () => {
  for (const purchaseIntent of [undefined, 'goods_only']) {
    const p = payload({ programRequest: { principal: '1', currency: 'EUR' } });
    if (purchaseIntent !== undefined) p.purchaseIntent = purchaseIntent;
    assert.equal((await acceptOrder(p, options())).http, 400);
  }
  for (const plan of ['B', 'C']) {
    for (const over of [{ purchaseIntent: 'goods_only' }, interest(), { programRequest: { principal: '1', currency: 'EUR' } }]) {
      assert.equal((await acceptOrder(payload({ plan, ...over }), options())).http, 400);
    }
    const config = options(), p = payload({ plan }), old = await acceptOrder(p, config);
    assert.equal(old.http, 201); assert.equal(old.body.order.payment.status, 'blocked');
    const saved = await config.store.get(old.body.request_id);
    assert.equal(Object.hasOwn(saved.snapshot, 'purchaseIntent'), false); assert.equal(Object.hasOwn(saved.snapshot, 'programRequest'), false);
    assert.equal(saved.snapshot.inputHash, hash(canonical(legacyMaterial(p))));
    assert.equal(saved.snapshot.accountTerms.principalMinor, 600000);
    assert.equal(old.body.order.snapshot.accountTerms, undefined); assert.equal(old.body.order.accounts, null);
  }
});

test('idempotency binds intent, optional principal and currency without mutating the original order', async () => {
  for (const [base, changed] of [[{}, interest()], [interest(), interest({ programRequest: { principal: '1', currency: 'EUR' } })], [interest({ programRequest: { principal: '1', currency: 'EUR' } }), interest({ programRequest: { principal: '2', currency: 'EUR' } })], [interest({ programRequest: { principal: '1', currency: 'EUR' } }), interest({ programRequest: { principal: '1', currency: 'USD' } })]]) {
    const config = options(), p = payload(base), first = await acceptOrder(p, config);
    const original = await config.store.get(first.body.request_id);
    assert.equal((await acceptOrder({ ...p, ...changed }, config)).http, 409);
    assert.deepEqual(await config.store.get(first.body.request_id), original);
  }
});

test('semantically equal amount spellings deduplicate to the same immutable request', async () => {
  const config = options(), p = payload(interest({ programRequest: { principal: '1.00', currency: 'AED' } }));
  const first = await acceptOrder(p, config);
  const again = await acceptOrder({ ...p, programRequest: { principal: '001,0', currency: 'AED' } }, config);
  assert.equal(first.http, 201); assert.equal(again.http, 200); assert.equal(again.body.request_id, first.body.request_id);
  const original = await config.store.get(first.body.request_id);
  for (const change of [{ purchaseIntent: 'goods_only' }, { programRequest: { status: 'approved', requestedPrincipalMinor: '100', currency: 'AED' } }]) {
    await assert.rejects(config.store.swap(original, { ...original, snapshot: { ...original.snapshot, ...change } }), /immutable_snapshot/);
  }
  assert.deepEqual(await config.store.get(first.body.request_id), original);
});

test('a program request never adds its principal to the independent goods quotation or payment total', async () => {
  const offer = { configurationHash: hash(canonical(validateConfig(configuration).value)), approved: true, expiresAt: '2027-10-11T00:00:00Z', currency: 'EUR', productMinor: 12000, taxMinor: 1000, shippingMinor: 2000, totalMinor: 15000, seller: { legalName: 'TEST SELLER', address: 'TEST ADDRESS' }, technicalApproval: { approved: true, balanceMm: 332, frameRA: 64, measurementBasis: 'unstrung', evidence: 'TEST ENGINEERING' }, bankDetails: { approved: true, evidence: 'TEST BANK', currency: 'EUR', bankName: 'TEST BANK', accountName: 'TEST SELLER', accountNumber: 'TEST-NOT-PAYABLE', swift: 'TEST-NOT-PAYABLE' }, termsVersion: 'test-terms', termsText: 'TEST GOODS TERMS', deliveryTerms: 'TEST DELIVERY', evidence: 'SYNTHETIC ONLY', pricingPolicy: 'worldwide-all-inclusive-v1', fulfillableCountries: ['Test country'] };
  for (const over of [{}, interest({ programRequest: { principal: '123456.78', currency: 'USD' } })]) {
    const result = await acceptOrder(payload(over), { ...options(), offers: [offer] });
    assert.equal(result.http, 201); assert.equal(result.body.order.payment.status, 'ready');
    assert.equal(result.body.order.snapshot.offer.totalMinor, 15000);
    assert.equal(result.body.order.snapshot.quotation.totalMinor, 15000);
    assert.equal(result.body.order.snapshot.quotation.currency, 'EUR');
    assert.equal(result.body.order.snapshot.terms.accepted, false);
    assert.equal(result.body.order.snapshot.accountTerms, undefined); assert.equal(result.body.order.snapshot.financing, undefined);
    assert.equal(result.body.order.accounts, null); assert.equal(result.body.order.invoice, null);
    assert.equal(result.body.order.snapshot.programRequest?.rateBps, undefined);
    assert.equal(result.body.order.snapshot.programRequest?.termsAccepted, undefined);
    assert.equal(result.body.order.snapshot.programRequest?.enrolled, undefined);
  }
});

test('shared validator retains omissions for legacy request hashing and exposes only sanitized fields', () => {
  assert.deepEqual(normalizePurchaseRequest({}).value, {});
  assert.deepEqual(normalizePurchaseRequest({}, { defaultIntent: true }).value, { purchaseIntent: 'goods_only' });
  assert.equal(normalizePurchaseRequest(interest(), { allowed: false }).ok, false);
  assert.equal(normalizePurchaseRequest({ ...interest(), plan: 'B' }).ok, false);
  assert.deepEqual(normalizePurchaseRequest(interest({ programRequest: { principal: '0.01', currency: 'EUR' } })).value, { purchaseIntent: 'goods_with_program_interest', programRequest: { status: 'terms_requested', requestedPrincipalMinor: '1', currency: 'EUR' } });
});

test('pre-choice A orders remain replayable only as the identical ordinary purchase', async () => {
  const p = payload(), seedConfig = options(), seed = await acceptOrder(p, seedConfig);
  const legacy = await seedConfig.store.get(seed.body.request_id);
  delete legacy.snapshot.purchaseIntent;
  legacy.snapshot.inputHash = hash(canonical(legacyMaterial(p)));
  const config = options();
  await config.store.create(hash(`tennis|${p.idempotencyKey}`), legacy);
  const original = await config.store.get(legacy.id);
  for (const over of [{}, { purchaseIntent: 'goods_only' }]) {
    const same = await acceptOrder({ ...p, ...over }, config);
    assert.equal(same.http, 200); assert.equal(same.body.request_id, legacy.id);
  }
  assert.equal((await acceptOrder({ ...p, ...interest() }, config)).http, 409);
  assert.equal((await acceptOrder({ ...p, fields: { ...p.fields, name: 'Changed owner' } }, config)).http, 409);
  assert.deepEqual(await config.store.get(legacy.id), original);
});
