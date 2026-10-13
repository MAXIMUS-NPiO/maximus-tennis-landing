/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMemoryStore } from '../lib/platform/store.js';
import { hashPayload } from '../lib/platform/ids.js';
import { forbidden } from '../lib/platform/errors.js';
import { TENNIS_CONTROL_SCOPE, createTennisControlOrderService } from '../lib/commerce/tennis-control-order.js';
import { createTennisControlProofService, TENNIS_CONTROL_PROOF_TYPE } from '../lib/commerce/tennis-control-proof.js';
import { createTennisControlMpgsAdapter } from '../lib/platform/tennis-control-mpgs.js';
import { createTennisControlMpgsReader, NATIVE_MPGS_ORIGIN, NATIVE_MPGS_MERCHANT, NATIVE_MPGS_SCHEMA } from '../lib/platform/native-mpgs.js';

const at = Date.parse('2026-10-11T05:00:00.000Z');
const orderId = `MX-CTL-${'1'.repeat(32)}`, ownerUserId = `usr_${'A'.repeat(20)}`, providerOrderId = `MC${'2'.repeat(32)}`;
const input = { ctx: { userId: ownerUserId }, orderId };
const fields = ['providerOrderId', 'transactionId', 'kind', 'amountMinor', 'currency', 'totalMinor', 'capturedMinor', 'refundedMinor', 'occurredAt', 'merchantId'];
function movement(overrides = {}) {
  const m = { providerOrderId, transactionId: 'capture_1', kind: 'capture', amountMinor: '100', currency: 'USD', totalMinor: '100', capturedMinor: '100', refundedMinor: '0', occurredAt: new Date(at - 1000).toISOString(), merchantId: '300281', verifiedAt: new Date(at).toISOString(), ...overrides };
  m.evidenceHash = hashPayload(Object.fromEntries(fields.map(k => [k, m[k]])));
  return m;
}
function fixture({ store = createMemoryStore() } = {}) {
  const snapshotHash = hashPayload('control-snapshot'), identityHash = hashPayload('control-attempt');
  const record = { order: { id: orderId, ownerUserId, scopeHash: TENNIS_CONTROL_SCOPE.hash, kind: 'payment_control', currency: 'USD', totalMinor: '100', fulfillment: 'none', snapshotHash }, attempt: { orderId, ownerUserId, providerOrderId, scopeHash: TENNIS_CONTROL_SCOPE.hash, kind: 'payment_control', currency: 'USD', totalMinor: '100', snapshotHash, identityHash, createAttempts: 1, attemptedAt: at - 2000 } };
  let ownerActive = true, calls = 0, read = async () => [movement()];
  const orders = { async readOwnRecord(arg) { if (!ownerActive || arg.ctx?.userId !== ownerUserId || arg.orderId !== orderId) throw forbidden('owner_required'); return structuredClone(record); } };
  const reader = { async discoverMovements(request) { calls++; assert.deepEqual(request, { providerOrderId, limit: 20 }); return read(); } };
  const make = () => createTennisControlProofService({ store, orders, reader, now: () => at, production: false });
  return { store, record, make, setRead: fn => { read = fn; }, revoke: () => { ownerActive = false; }, calls: () => calls };
}
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
const fullyRefunded = () => [movement({ refundedMinor: '100' }), movement({ kind: 'refund', transactionId: 'refund_1', amountMinor: '100', refundedMinor: '100' })];

test('control capture proof confirms only exact USD1 server movement and emits no goods/ledger/session fields', async () => {
  const f = fixture(), result = await f.make().inspect(input);
  assert.equal(result.status, 'captured'); assert.equal(result.capturedMinor, '100'); assert.equal(result.ledgerPosted, false);
  assert.equal(result.currency, 'USD');
  for (const forbiddenKey of ['sessionId', 'providerOrderId', 'ownerUserId', 'invoice', 'balance', 'principal', 'bonus']) assert.ok(!Object.hasOwn(result, forbiddenKey));
  assert.equal((await f.store.get(TENNIS_CONTROL_PROOF_TYPE, orderId)).doc.movements.length, 1);
});
test('control proof repeats, concurrent queries and reconstructed service do not duplicate receipts', async () => {
  const f = fixture();
  const results = await Promise.all(Array.from({ length: 6 }, () => f.make().inspect(input)));
  assert.ok(results.every(r => r.status === 'captured' && r.movementCount === 1));
  const saved = await f.store.get(TENNIS_CONTROL_PROOF_TYPE, orderId);
  assert.equal(saved.version, 1); assert.equal((await f.make().inspect(input)).duplicate, true);
});
for (const seeded of [false, true]) test(`older concurrent capture response cannot poison newer refund${seeded ? ', including a lost refund ACK and reconstructed service' : ' from an absent proof'}`, async () => {
  const base = createMemoryStore(); let dropped = false;
  const store = { ...base, async commit(c) {
    const result = await base.commit(c);
    if (seeded && !dropped && c.writes?.some(w => w.type === TENNIS_CONTROL_PROOF_TYPE && w.doc.status === 'refunded')) { dropped = true; throw new Error('lost_refund_ack'); }
    return result;
  } };
  const f = fixture({ store });
  if (seeded) await f.make().inspect(input);
  const started = deferred(), release = deferred(); let reads = 0;
  f.setRead(async () => { if (++reads === 1) { started.resolve(); await release.promise; return [movement()]; } return fullyRefunded(); });
  const older = f.make().inspect(input);
  await started.promise;
  const newer = await f.make().inspect(input);
  assert.equal(newer.status, 'refunded');
  if (seeded) { assert.equal(dropped, true); assert.equal(newer.duplicate, true); }
  release.resolve();
  const late = await older;
  assert.equal(late.status, 'refunded'); assert.equal(late.refundedMinor, '100'); assert.equal(late.reason, null);
  assert.equal(reads, 3); // The older query is re-read after observing the competing durable version.
  const saved = await base.get(TENNIS_CONTROL_PROOF_TYPE, orderId);
  assert.equal(saved.version, seeded ? 2 : 1);
  const restarted = await f.make().inspect(input);
  assert.equal(restarted.status, 'refunded'); assert.equal(restarted.duplicate, true);
  assert.equal((await base.get(TENNIS_CONTROL_PROOF_TYPE, orderId)).version, saved.version);
});
test('CAS conflict after reading the baseline also refreshes a superseded provider snapshot', async () => {
  const base = createMemoryStore(), committing = deferred(), release = deferred(); let held = false;
  const store = { ...base, async commit(c) {
    if (!held && c.writes?.some(w => w.type === TENNIS_CONTROL_PROOF_TYPE && w.doc.status === 'captured')) { held = true; committing.resolve(); await release.promise; }
    return base.commit(c);
  } };
  const f = fixture({ store }); let reads = 0;
  f.setRead(async () => ++reads === 1 ? [movement()] : fullyRefunded());
  const older = f.make().inspect(input);
  await committing.promise;
  assert.equal((await f.make().inspect(input)).status, 'refunded');
  release.resolve();
  assert.equal((await older).status, 'refunded'); assert.equal(reads, 3);
  assert.equal((await base.get(TENNIS_CONTROL_PROOF_TYPE, orderId)).version, 1);
});
test('a newly started observation that loses a committed refund still causes sticky review', async () => {
  const f = fixture(); f.setRead(async () => fullyRefunded());
  assert.equal((await f.make().inspect(input)).status, 'refunded');
  f.setRead(async () => [movement()]);
  const regressed = await f.make().inspect(input);
  assert.equal(regressed.status, 'review_required'); assert.equal(regressed.reason, 'provider_history_changed');
  assert.equal(regressed.refundedMinor, '100');
  f.setRead(async () => fullyRefunded());
  assert.equal((await f.make().inspect(input)).status, 'review_required');
});
test('concurrent supported progress cannot discard authenticated unsupported monetary evidence', async () => {
  const f = fixture(), started = deferred(), release = deferred(); let reads = 0;
  f.setRead(async () => {
    if (++reads === 1) { started.resolve(); await release.promise; throw Object.assign(new Error('private provider history'), { code: 'native_mpgs_dispute_requires_review' }); }
    return fullyRefunded();
  });
  const disputed = f.make().inspect(input);
  await started.promise;
  assert.equal((await f.make().inspect(input)).status, 'refunded');
  release.resolve();
  const result = await disputed;
  assert.equal(result.status, 'review_required'); assert.equal(result.reason, 'provider_history_requires_review');
  assert.equal(result.refundedMinor, '100'); assert.equal(reads, 2);
  assert.equal((await f.make().inspect(input)).status, 'review_required');
});
test('control proof recovers a lost durable commit ACK without another payment operation', async () => {
  const base = createMemoryStore(); let dropped = false;
  const store = { ...base, async commit(c) { const result = await base.commit(c); if (!dropped && c.writes?.some(w => w.type === TENNIS_CONTROL_PROOF_TYPE)) { dropped = true; throw new Error('lost_ack'); } return result; } };
  const f = fixture({ store }), first = await f.make().inspect(input);
  assert.equal(first.status, 'captured'); assert.equal(first.duplicate, true);
  assert.equal((await f.make().inspect(input)).movementCount, 1); assert.equal((await base.get(TENNIS_CONTROL_PROOF_TYPE, orderId)).version, 1);
});
test('authorization-only / no captured movement remains pending; browser callbacks are refused', async () => {
  const f = fixture(); f.setRead(async () => []);
  assert.equal((await f.make().inspect(input)).status, 'pending');
  for (const extra of [{ resultIndicator: 'SUCCESS' }, { status: 'paid' }, { kind: 'cancel' }, { providerOrderId: 'foreign' }]) await assert.rejects(f.make().inspect({ ...input, ...extra }), { code: 'control_proof_input_invalid' });
});
test('foreign owner and ownership revocation during provider query cannot read or save proof', async () => {
  const f = fixture();
  await assert.rejects(f.make().inspect({ ...input, ctx: { userId: 'foreign' } }), { code: 'owner_required' }); assert.equal(f.calls(), 0);
  f.setRead(async () => { f.revoke(); return [movement()]; });
  await assert.rejects(f.make().inspect(input), { code: 'owner_required' }); assert.equal(await f.store.get(TENNIS_CONTROL_PROOF_TYPE, orderId), null);
});
test('wrong provider, merchant, amount, currency, authorization movement or absent fields never confirm capture', async () => {
  for (const change of [{ providerOrderId: 'foreign' }, { merchantId: 'foreign' }, { amountMinor: '99' }, { totalMinor: '101' }, { currency: 'AED' }, { currency: undefined }, { amountMinor: undefined }, { kind: 'authorization' }, { capturedMinor: '0' }, { occurredAt: new Date(at - 3000).toISOString() }, { verifiedAt: new Date(at + 1).toISOString() }]) {
    const f = fixture(); f.setRead(async () => [movement(change)]);
    const result = await f.make().inspect(input); assert.equal(result.status, 'review_required'); assert.equal(result.capturedMinor, '0');
  }
});
test('complete refund history updates capture proof without creating a refund; duplicates remain idempotent', async () => {
  const f = fixture(); await f.make().inspect(input);
  f.setRead(async () => [movement({ refundedMinor: '40' }), movement({ kind: 'refund', transactionId: 'refund_1', amountMinor: '40', refundedMinor: '40' })]);
  const partial = await f.make().inspect(input); assert.equal(partial.status, 'partially_refunded'); assert.equal(partial.refundedMinor, '40');
  assert.equal((await f.make().inspect(input)).duplicate, true);
  f.setRead(async () => [movement({ refundedMinor: '100' }), movement({ kind: 'refund', transactionId: 'refund_1', amountMinor: '40', refundedMinor: '100' }), movement({ kind: 'refund', transactionId: 'refund_2', amountMinor: '60', refundedMinor: '100' })]);
  const full = await f.make().inspect(input); assert.equal(full.status, 'refunded'); assert.equal(full.movementCount, 3);
});
test('missing refunds, decreasing totals, duplicate transaction IDs and changed history require sticky review', async () => {
  const examples = [[movement({ refundedMinor: '40' })], [movement(), movement()], [movement({ kind: 'refund', transactionId: 'refund_1', amountMinor: '40', refundedMinor: '40' })]];
  for (const raw of examples) { const f = fixture(); f.setRead(async () => raw); assert.equal((await f.make().inspect(input)).status, 'review_required'); f.setRead(async () => [movement()]); assert.equal((await f.make().inspect(input)).status, 'review_required'); }
  const f = fixture(); await f.make().inspect(input); f.setRead(async () => []);
  assert.equal((await f.make().inspect(input)).status, 'review_required');
});
test('authenticated monetary-void/dispute history requires review, transport failures leak no provider content', async () => {
  for (const code of ['native_mpgs_history_requires_review', 'native_mpgs_dispute_requires_review']) { const f = fixture(); f.setRead(async () => { throw Object.assign(new Error('private raw content'), { code }); }); assert.equal((await f.make().inspect(input)).status, 'review_required'); }
  const f = fixture(); f.setRead(async () => { throw new Error('Authorization: secret PAN must not escape'); });
  await assert.rejects(f.make().inspect(input), e => e.code === 'control_proof_reader_unavailable' && !e.message.includes('secret'));
  assert.equal(await f.store.get(TENNIS_CONTROL_PROOF_TYPE, orderId), null);
});
test('production rejects memory store and immutable binding changes fail closed', async () => {
  const f = fixture(); assert.throws(() => createTennisControlProofService({ store: f.store, orders: { readOwnRecord() {} }, reader: { discoverMovements() {} }, production: true }), { code: 'control_proof_runtime_unavailable' });
  f.record.attempt.totalMinor = '500000'; await assert.rejects(f.make().inspect(input), { code: 'control_proof_binding_invalid' }); assert.equal(f.calls(), 0);
});

test('synthetic integration: immutable owner control → one source-derived session → strict USD capture/refund', async () => {
  const store = createMemoryStore(); let clock = at, posts = 0, gets = 0, totalRefunded = '0.00';
  const ctx = { userId: ownerUserId, emailVerified: true, organizationId: 'maximus-tennis' };
  await store.commit({ writes: [{ type: 'user', id: ownerUserId, expectedVersion: -1, doc: { id: ownerUserId, status: 'active' } }, { type: 'portalMembership', id: `maximus-tennis_${ownerUserId}`, expectedVersion: -1, doc: { userId: ownerUserId, organizationId: 'maximus-tennis' } }] });
  const grant = { status: 'verified', kind: 'payment_control_authorization', purpose: 'payment_control', mode: 'live', test: false, authenticationBasis: 'independently_verified_owner_authorization', authorizationId: 'synthetic-control-grant', evidenceId: 'synthetic-owner-proof', scopeHash: TENNIS_CONTROL_SCOPE.hash, projectId: 'tennis', organizationId: 'maximus-tennis', ownerUserId, currency: 'USD', totalMinor: '100', fulfillment: 'none', termsVersion: 'control-usd1-v1', termsText: 'USD 1.00 payment control, no goods, delivery or investment.', verifiedAt: new Date(at - 1000).toISOString(), expiresAt: new Date(at + 3600000).toISOString() };
  let bankOrder;
  const adapter = createTennisControlMpgsAdapter({ password: 'synthetic-not-a-bank-key', merchantName: 'MAXIMUS', now: () => clock, fetchImpl: async (_url, request) => {
    posts++; const body = JSON.parse(request.body); assert.equal(body.apiOperation, 'INITIATE_CHECKOUT'); assert.equal(body.interaction.operation, 'PURCHASE'); assert.equal(body.order.amount, '1.00'); assert.equal(body.order.currency, 'USD'); assert.equal(body.interaction.returnUrl, 'https://maximus.tennis/en/checkout/control'); bankOrder = body.order.id;
    return new Response(JSON.stringify({ result: 'SUCCESS', session: { id: 'SESSIONsyntheticControl12345' } }), { status: 201, headers: { 'Content-Type': 'application/json' } });
  } });
  const options = { store, now: () => clock, production: false, resolveAuthorization: async () => structuredClone(grant), initiateSession: adapter.initiate };
  const orders = createTennisControlOrderService(options);
  const issued = await orders.issue({ ctx, authorizationReference: 'synthetic-owner-ref', idempotencyKey: 'control-idem-123', termsVersion: grant.termsVersion });
  const ref = { ctx, orderId: issued.order.id };
  const session = await orders.initiate({ ...ref, locale: 'en' }); assert.equal(session.status, 'session_created'); assert.equal(session.paymentVerified, false); assert.equal(session.rendererReady, false);
  await createTennisControlOrderService(options).initiate({ ...ref, locale: 'en' }); assert.equal(posts, 1);
  clock += 2000;
  const reader = createTennisControlMpgsReader({ origin: NATIVE_MPGS_ORIGIN, merchantId: NATIVE_MPGS_MERCHANT, apiVersion: '100', schema: NATIVE_MPGS_SCHEMA, password: 'synthetic-not-a-bank-key', now: () => clock, fetchImpl: async (url, request) => {
    gets++; assert.equal(request.method, 'GET'); assert.ok(url.endsWith('/order/' + bankOrder));
    const row = (type, id, amount) => ({ result: 'SUCCESS', response: { gatewayCode: 'APPROVED' }, merchant: NATIVE_MPGS_MERCHANT, order: { id: bankOrder, currency: 'USD', amount: '1.00' }, transaction: { id, type, amount, currency: 'USD' }, timeOfRecord: new Date(at + 1000).toISOString() });
    const raw = { result: 'SUCCESS', id: bankOrder, merchant: NATIVE_MPGS_MERCHANT, currency: 'USD', amount: '1.00', totalCapturedAmount: '1.00', totalRefundedAmount: totalRefunded, transaction: [row('PAYMENT', 'capture1', '1.00'), ...(totalRefunded === '1.00' ? [row('REFUND', 'refund1', '1.00')] : [])] };
    return new Response(JSON.stringify(raw), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } });
  const proofs = createTennisControlProofService({ store, orders, reader, now: () => clock, production: false });
  assert.equal((await proofs.inspect(ref)).status, 'captured');
  totalRefunded = '1.00'; assert.equal((await proofs.inspect(ref)).status, 'refunded');
  clock = at + 7200000; // Historic reconciliation remains available after both local and grant expiry.
  assert.equal((await proofs.inspect(ref)).status, 'refunded'); assert.equal(posts, 1); assert.equal(gets, 3);
  assert.equal((await orders.getOwn(ref)).paymentVerified, false); // Control receipt never rewrites goods/ledger state.
});

test('separate Node processes preserve an uncertain control attempt and capture/refund proof without another session', () => {
  // File snapshots are a TEST fixture, not evidence of Redis durability, fsync or failover.
  const dir = mkdtempSync(join(tmpdir(), 'tennis-control-restart-'));
  const script = `
    import assert from 'node:assert/strict';
    import { fileFixtureStores } from './tests/tennis-reconciliation-fixture.mjs';
    import { createTennisControlOrderService, TENNIS_CONTROL_SCOPE } from './lib/commerce/tennis-control-order.js';
    import { createTennisControlProofService } from './lib/commerce/tennis-control-proof.js';
    import { hashPayload } from './lib/platform/ids.js';
    const [stage, path] = process.argv.slice(1), {store} = fileFixtureStores(path);
    const at = Date.parse('2026-10-11T05:00:00.000Z'), user = 'usr_' + 'A'.repeat(20);
    const ctx = { userId:user,emailVerified:true,organizationId:'maximus-tennis' };
    const grant = {status:'verified',kind:'payment_control_authorization',purpose:'payment_control',mode:'live',test:false,authenticationBasis:'independently_verified_owner_authorization',authorizationId:'synthetic-restart-grant',evidenceId:'synthetic-restart-proof',scopeHash:TENNIS_CONTROL_SCOPE.hash,projectId:'tennis',organizationId:'maximus-tennis',ownerUserId:user,currency:'USD',totalMinor:'100',fulfillment:'none',termsVersion:'control-v1',termsText:'USD 1 control without goods or investment.',verifiedAt:new Date(at-1000).toISOString(),expiresAt:new Date(at+3600000).toISOString()};
    if(stage==='init') await store.commit({writes:[{type:'user',id:user,expectedVersion:-1,doc:{id:user,status:'active'}},{type:'portalMembership',id:'maximus-tennis_'+user,expectedVersion:-1,doc:{userId:user,organizationId:'maximus-tennis'}}]});
    const orders=createTennisControlOrderService({store,production:false,now:()=>stage==='init'?at:at+2000,resolveAuthorization:async()=>grant,initiateSession:async()=>{
      const old=await store.get('testOnlyControlCalls','calls');
      await store.commit({writes:[{type:'testOnlyControlCalls',id:'calls',expectedVersion:old?.version??-1,doc:{count:(old?.doc.count||0)+1}}]});
      throw Error('synthetic lost session ACK');
    }});
    const issued=await orders.issue({ctx,authorizationReference:'synthetic-ref',idempotencyKey:'restart-key-'+stage,termsVersion:'control-v1'});
    const input={ctx,orderId:issued.order.id};
    await orders.initiate(input);
    assert.equal((await store.get('testOnlyControlCalls','calls')).doc.count,1);
    const {attempt}=await orders.readOwnRecord(input);
    if(stage!=='init'){
      const refunded=stage==='refund'?'100':'0';
      const make=(kind,transactionId,amountMinor)=>{const m={providerOrderId:attempt.providerOrderId,transactionId,kind,amountMinor,currency:'USD',totalMinor:'100',capturedMinor:'100',refundedMinor:refunded,occurredAt:new Date(at+1000).toISOString(),merchantId:'300281'};return {...m,verifiedAt:new Date(at+2000).toISOString(),evidenceHash:hashPayload(m)};};
      const reader={discoverMovements:async()=>[make('capture','capture1','100'),...(stage==='refund'?[make('refund','refund1','100')]:[])]};
      const proof=await createTennisControlProofService({store,orders,reader,now:()=>at+2000,production:false}).inspect(input);
      assert.equal(proof.status,stage==='refund'?'refunded':'captured');
    }
    console.log(JSON.stringify({orderId:issued.order.id,providerOrderId:attempt.providerOrderId,status:attempt.status,calls:(await store.get('testOnlyControlCalls','calls')).doc.count}));
  `;
  try {
    const results = ['init', 'capture', 'refund'].map(stage => JSON.parse(execFileSync(process.execPath, ['--no-warnings', '--import', './tests/register.mjs', '--input-type=module', '--eval', script, stage, join(dir, 'state.json')], { cwd: new URL('..', import.meta.url), encoding: 'utf8', timeout: 15000 })));
    assert.equal(new Set(results.map(r => r.orderId)).size, 1); assert.equal(new Set(results.map(r => r.providerOrderId)).size, 1);
    assert.ok(results.every(r => r.calls === 1 && r.status === 'uncertain'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
