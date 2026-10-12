/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fixture, AT, ORDER, USER, OTHER_USER, EVIDENCE, loseAcknowledgement } from './tennis-reconciliation-fixture.mjs';
import { createTennisReconciliationService, TENNIS_RECONCILIATION_TYPES as T } from '../lib/commerce/tennis-reconciliation.js';
import { createNativeMpgsReader, NATIVE_MPGS_SCHEMA } from '../lib/platform/native-mpgs.js';
import { resolveTennisCheckoutRuntime } from '../lib/commerce/tennis-checkout-http.js';
import { hashPayload } from '../lib/platform/ids.js';

const capture = (service, bindingId, transactionId = 'synthetic-capture') => service.reconcile({ bindingId, transactionId, kind: 'capture' });
const refund = (service, bindingId, transactionId = 'synthetic-refund') => service.reconcile({ bindingId, transactionId, kind: 'refund' });

test('direct verified receipts reuse exact checkout/owner contract without native orders, ledger or paid mutation', async () => {
  const f = await fixture(), before = await f.commerceStore.get(ORDER), binding = await f.bind(), result = await capture(f.service, binding.bindingId);
  assert.equal(result.status, 'captured'); assert.equal(result.capturedMinor, '12345'); assert.equal(result.refundedMinor, '0'); assert.equal(result.ledgerPosted, false);
  assert.equal(f.calls.read, 1); assert.equal(await f.store.countType(T.movement), 1); assert.equal(await f.store.countType('ledgerJournal'), 0);
  assert.deepEqual(await f.commerceStore.get(ORDER), before); assert.equal((await resolveTennisCheckoutRuntime()).service, null);
  const row = await f.store.get(T.binding, binding.bindingId);
  assert.equal(row.doc.intent.customerUserId, USER); assert.equal(row.doc.intent.orderId, ORDER);
  assert.equal(JSON.stringify(row).includes('sessionId'), false); assert.equal(JSON.stringify(row).includes('nativeOrderId'), false);
  const id = `tpm_${hashPayload(['MPGS', '300281', f.intent.providerOrderId, 'synthetic-capture'])}`;
  const receipt = await f.store.get(T.movement, id);
  assert.equal(JSON.stringify(receipt).includes('MUST-NOT-BE-STORED'), false);
  assert.equal(JSON.stringify(await f.store.get(T.state, binding.bindingId)).includes('MUST-NOT-BE-STORED'), false);
});

test('unconfigured readers/resolvers/evidence, browser and production memory cannot reconcile', async () => {
  const f = await fixture();
  for (const missing of ['resolveTrustedBinding', 'reader', 'retrievalEvidenceId']) {
    const service = createTennisReconciliationService({ ...f.deps, [missing]: undefined });
    assert.equal(service.readiness.ready, false); await assert.rejects(service.bind(f.bindInput), { code: 'tennis_reconciliation_unconfigured' });
  }
  assert.throws(() => createTennisReconciliationService({ ...f.deps, production: true }), { code: 'tennis_reconciliation_store_required' });
  globalThis.window = {};
  try { assert.throws(() => createTennisReconciliationService(f.deps), { code: 'tennis_reconciliation_server_only' }); } finally { delete globalThis.window; }
  assert.equal(f.calls.read, 0); assert.equal(await f.store.countType(T.binding), 0);
});

test('public-like extra claims and cancellation cannot provide authority or monetary movement', async () => {
  const f = await fixture();
  await assert.rejects(f.service.bind({ ...f.bindInput, owner: USER }), { code: 'tennis_reconciliation_input_invalid' });
  const b = await f.bind();
  for (const kind of ['cancelled', 'void', 'chargeback']) await assert.rejects(f.service.reconcile({ bindingId: b.bindingId, transactionId: 'synthetic', kind }), { code: 'tennis_reconciliation_movement_invalid' });
  await assert.rejects(f.service.reconcile({ bindingId: b.bindingId, transactionId: 'synthetic', kind: 'capture', amountMinor: '12345' }), { code: 'tennis_reconciliation_input_invalid' });
  assert.equal((await f.service.readState(b.bindingId)).status, 'pending'); assert.equal(f.calls.read, 0);
});

test('independent direct association rejects every mismatched owner/route/goods/terms field', async () => {
  for (const [key, value] of [['customerUserId', OTHER_USER], ['commerceOrderId', `MX-ORD-${'f'.repeat(32)}`], ['intentId', `tco_${'a'.repeat(43)}`], ['providerOrderId', 'MTother'], ['correlation', 'other'], ['mode', 'test'], ['test', true], ['mock', true], ['authenticationBasis', 'browser_return'], ['kind', 'deposit'], ['approval', 'pending'], ['routeHash', 'other'], ['snapshotHash', 'other'], ['approvalHash', 'other'], ['configurationHash', 'other'], ['totalMinor', '12346'], ['currency', 'USD'], ['merchantId', 'other'], ['termsVersion', 'other'], ['termsAcceptedAt', AT - 1], ['verifiedAt', new Date(AT - 1).toISOString()]]) {
    const f = await fixture(); f.state.proofChange = p => { p[key] = value; };
    await assert.rejects(f.bind(), { code: 'tennis_reconciliation_binding_unverified' }, key); assert.equal(await f.store.countType(T.binding), 0, key); assert.equal(f.calls.read, 0);
  }
});

test('current owner, active account, tenant membership, accepted terms and fence remain mandatory', async () => {
  for (const mutate of [f => f.change('portalOrder', ORDER, { customerUserId: OTHER_USER }), f => f.change('portalOrder', ORDER, { ownershipProof: 'email_claim' }), f => f.change('user', USER, { status: 'disabled' }), f => f.change('portalMembership', `maximus-tennis_${USER}`, { organizationId: 'other' }), f => f.store.releaseUnique('portal_order_owner', `tennis:${ORDER}`), f => f.changeOrder(d => { d.payment.termsVersion = 'other'; }), f => f.changeOrder(d => { d.payment.owner = 'other'; }), f => f.changeOrder(d => { d.payment.providerOrderId = 'other'; }), f => f.changeOrder(d => { d.payment.status = 'paid'; }), f => f.changeOrder(d => { d.invoice = { number: 'TEST-SYNTHETIC', test: true }; })]) {
    const f = await fixture(), b = await f.bind(); await mutate(f);
    await assert.rejects(capture(f.service, b.bindingId)); assert.equal(f.calls.read, 0); assert.equal(await f.store.countType(T.movement), 0);
  }
});

test('snapshot and accepted approval are revalidated even when changes look commercially valid', async () => {
  const f = await fixture(), b = await f.bind();
  const changed = await f.commerceStore.get(ORDER); changed.snapshot.offer.totalMinor = 12346; changed.snapshot.offer.productMinor = 12001; changed.snapshot.quotation.totalMinor = 12346; changed.snapshot.quotation.items[0].unitPriceMinor = 12346; changed.snapshot.quotation.items[0].lineTotalMinor = 12346;
  const service = createTennisReconciliationService({ ...f.deps, commerceStore: { ...f.commerceStore, get: async () => changed } });
  await assert.rejects(capture(service, b.bindingId), { code: 'tennis_reconciliation_goods_changed' }); assert.equal(f.calls.read, 0);
  changed.snapshot.customerUserId = OTHER_USER;
  await assert.rejects(capture(service, b.bindingId), { code: 'tennis_reconciliation_owner_unverified' });
});

test('route and separate inspected retrieval schema evidence remain revocable', async () => {
  for (const [field] of EVIDENCE) {
    const f = await fixture(), b = await f.bind(); await f.change('tennisCheckoutEvidence', f.route[field], { status: 'revoked' });
    await assert.rejects(capture(f.service, b.bindingId), { code: 'tennis_reconciliation_route_unverified' }); assert.equal(f.calls.read, 0);
  }
  for (const fields of [{ status: 'revoked' }, { schema: 'guessed' }, { apiVersion: '1' }, { merchantId: 'other' }, { authenticationBasis: 'browser_return' }]) {
    const f = await fixture(); await f.change('tennisReconciliationEvidence', f.deps.retrievalEvidenceId, fields);
    await assert.rejects(f.bind(), { code: 'tennis_reconciliation_retrieval_unverified' }); assert.equal(f.calls.bind, 0);
  }
});

test('revocation during the provider await fails before writing any movement', async () => {
  for (const mutate of [f => f.change('portalOrder', ORDER, { customerUserId: OTHER_USER }), f => f.change('tennisCheckoutEvidence', f.route.sdkEvidenceId, { status: 'revoked' }), f => f.changeOrder(d => { d.payment.owner = 'foreign'; })]) {
    const f = await fixture(), b = await f.bind(); f.state.beforeRead = () => mutate(f);
    await assert.rejects(capture(f.service, b.bindingId)); assert.equal(f.calls.read, 1); assert.equal(await f.store.countType(T.movement), 0);
  }
});

test('parallel binding and duplicate transaction delivery create one binding and one receipt', async () => {
  const f = await fixture(), bindings = await Promise.all(Array.from({ length: 8 }, () => f.bind()));
  assert.equal(new Set(bindings.map(b => b.bindingId)).size, 1); assert.equal(await f.store.countType(T.binding), 1);
  const results = await Promise.all(Array.from({ length: 8 }, () => capture(f.service, bindings[0].bindingId)));
  assert.ok(results.every(r => r.status === 'captured' && r.movementCount === 1)); assert.equal(results.filter(r => !r.duplicate).length, 1); assert.equal(await f.store.countType(T.movement), 1);
});

test('wrong owner/provider amount/currency/time projections never stage a receipt', async () => {
  for (const [key, value] of [['providerOrderId', 'foreign'], ['transactionId', 'foreign'], ['kind', 'refund'], ['merchantId', 'foreign'], ['amountMinor', '12344'], ['amountMinor', '12346'], ['currency', 'USD'], ['totalMinor', '12346'], ['capturedMinor', '12344'], ['refundedMinor', '12346'], ['occurredAt', new Date(AT - 1).toISOString()]]) {
    const f = await fixture(), b = await f.bind(); f.state.movementChange = p => { p[key] = value; };
    const result = await capture(f.service, b.bindingId); assert.equal(result.status, 'review_required', key); assert.equal(result.reason, 'provider_movement_unverified'); assert.equal(await f.store.countType(T.movement), 0);
  }
});

test('receipt evidence digest is checked and raw errors never enter state or error responses', async () => {
  const f = await fixture(), b = await f.bind();
  const changed = createTennisReconciliationService({ ...f.deps, reader: { readMovement: async input => ({ ...await f.deps.reader.readMovement(input), evidenceHash: 'bad' }) } });
  assert.equal((await capture(changed, b.bindingId)).status, 'review_required');
  const g = await fixture(), binding = await g.bind(); g.state.readerError = Error('private-bank-password');
  await assert.rejects(capture(g.service, binding.bindingId), e => e.code === 'tennis_reconciliation_reader_unavailable' && !String(e).includes('private-bank-password'));
  assert.equal((await g.service.readState(binding.bindingId)).status, 'pending'); assert.equal(await g.store.countType(T.movement), 0);
  const h = await fixture(), broken = createTennisReconciliationService({ ...h.deps, resolveTrustedBinding: async () => { throw Error('private-binding-credential'); } });
  await assert.rejects(broken.bind(h.bindInput), e => e.code === 'tennis_reconciliation_binding_reader_unavailable' && !String(e).includes('private-binding-credential'));
  assert.equal(await h.store.countType(T.binding), 0);
});

test('refunds arriving before capture stay unapplied and promote exactly once when capture arrives', async () => {
  const f = await fixture(), b = await f.bind(); f.state.refundTotal = '345';
  const first = await refund(f.service, b.bindingId); assert.equal(first.status, 'awaiting_capture'); assert.equal(first.capturedMinor, '0'); assert.equal(first.refundedMinor, '0'); assert.equal(first.pendingRefundMinor, '345');
  const result = await capture(f.service, b.bindingId); assert.equal(result.status, 'partially_refunded'); assert.equal(result.refundedMinor, '345'); assert.equal(result.pendingRefundMinor, '0');
  const again = await refund(f.service, b.bindingId); assert.equal(again.refundedMinor, '345'); assert.equal(again.movementCount, 2); assert.equal(again.duplicate, true);
});

test('provider aggregate with missing refund transactions never projects an unrefunded capture', async () => {
  const f = await fixture(), b = await f.bind(); f.state.refundTotal = '345';
  const observed = await capture(f.service, b.bindingId); assert.equal(observed.status, 'awaiting_refunds'); assert.equal(observed.unreconciledRefundMinor, '345'); assert.equal(observed.refundedMinor, '0');
  const result = await refund(f.service, b.bindingId); assert.equal(result.status, 'partially_refunded'); assert.equal(result.unreconciledRefundMinor, '0'); assert.equal(result.refundedMinor, '345');
});

test('duplicate capture updates new cumulative refund evidence without double counting or leaking source fields', async () => {
  const f = await fixture(), b = await f.bind(); await capture(f.service, b.bindingId); f.state.refundTotal = '345';
  const repeated = await capture(f.service, b.bindingId); assert.equal(repeated.status, 'awaiting_refunds'); assert.equal(repeated.movementCount, 1); assert.equal(repeated.duplicate, true);
  const saved = (await f.store.get(T.state, b.bindingId)).doc;
  assert.equal(saved.lastObservation.refundedMinor, '345'); assert.equal(saved.lastObservation.evidenceHash.length, 64); assert.equal(saved.lastObservation.sessionId, undefined);
  const restarted = createTennisReconciliationService(f.deps); assert.equal((await restarted.readState(b.bindingId)).unreconciledRefundMinor, '345');
  assert.equal((await refund(restarted, b.bindingId)).status, 'partially_refunded');
});

test('parallel distinct partial refunds are summed once, full refund is exact, excess requires review', async () => {
  const f = await fixture(), b = await f.bind(); await capture(f.service, b.bindingId); f.state.refundTotal = '12345'; f.state.amounts.r1 = '12000'; f.state.amounts.r2 = '345';
  await Promise.all([refund(f.service, b.bindingId, 'r1'), refund(f.service, b.bindingId, 'r2')]);
  const result = await f.service.readState(b.bindingId); assert.equal(result.status, 'refunded'); assert.equal(result.refundedMinor, '12345'); assert.equal(result.movementCount, 3);
  f.state.amounts.r3 = '1'; const excess = await refund(f.service, b.bindingId, 'r3'); assert.equal(excess.status, 'review_required'); assert.equal(excess.refundedMinor, '12345'); assert.equal(excess.movementCount, 3);
});

test('a changed transaction, second capture or decreasing aggregate is conservative sticky review', async () => {
  const f = await fixture(), b = await f.bind(); await capture(f.service, b.bindingId);
  assert.equal((await capture(f.service, b.bindingId, 'second-capture')).reason, 'multiple_captures_require_review');
  const g = await fixture(), c = await g.bind(); g.state.refundTotal = '345'; await capture(g.service, c.bindingId); g.state.refundTotal = '0';
  assert.equal((await capture(g.service, c.bindingId)).reason, 'provider_refund_total_changed');
  g.state.refundTotal = '345'; assert.equal((await refund(g.service, c.bindingId)).status, 'review_required');
  const h = await fixture(), d = await h.bind(); h.state.refundTotal = '345'; await refund(h.service, d.bindingId); h.state.amounts['synthetic-refund'] = '344';
  assert.equal((await refund(h.service, d.bindingId)).reason, 'provider_transaction_changed');
});

test('lost binding and receipt commit acknowledgements recover from the durable records', async () => {
  for (const type of [T.binding, T.movement]) {
    const f = await fixture(), lost = loseAcknowledgement(f.store, p => p.writes?.some(w => w.type === type));
    const service = createTennisReconciliationService({ ...f.deps, store: lost }), b = await service.bind(f.bindInput);
    const result = await capture(service, b.bindingId); assert.equal(result.status, 'captured'); assert.equal(result.movementCount, 1);
    const reopened = createTennisReconciliationService(f.deps); assert.equal((await capture(reopened, b.bindingId)).movementCount, 1); assert.equal(await f.store.countType(T.movement), 1);
  }
});

test('lost ACK on duplicate observation aggregate update reads back exact completeness state', async () => {
  const f = await fixture(), b = await f.bind(); await capture(f.service, b.bindingId); f.state.refundTotal = '345';
  const lost = loseAcknowledgement(f.store, p => p.writes?.some(w => w.type === T.state && w.doc.providerRefundedMinor === '345'));
  const result = await capture(createTennisReconciliationService({ ...f.deps, store: lost }), b.bindingId);
  assert.equal(result.status, 'awaiting_refunds'); assert.equal(result.unreconciledRefundMinor, '345'); assert.equal(result.movementCount, 1);
});

function nativeOrder(providerOrderId, voidType = null) {
  const transaction = (id, type, amount) => ({ result: 'SUCCESS', response: { gatewayCode: 'APPROVED' }, merchant: '300281', order: { id: providerOrderId, currency: 'AED', amount: '123.45' }, transaction: { id, type, amount, currency: 'AED' }, timeOfRecord: new Date(AT + 1000).toISOString() });
  return { result: 'SUCCESS', id: providerOrderId, merchant: '300281', currency: 'AED', amount: '123.45', totalCapturedAmount: '123.45', totalRefundedAmount: '0.00', transaction: [transaction('synthetic-capture', 'PAYMENT', '123.45'), ...(voidType ? [transaction('synthetic-void', voidType, '123.45')] : [])] };
}

test('real native MPGS reader projection composes through synthetic GET only and reviews monetary voids', async () => {
  for (const voidType of [null, 'VOID_PAYMENT', 'VOID_CAPTURE', 'VOID_REFUND', 'CHARGEBACK', 'FUNDING']) {
    const f = await fixture(), b = await f.bind(); let calls = 0;
    const reader = createNativeMpgsReader({ origin: f.route.gatewayOrigin, merchantId: f.route.merchantId, apiVersion: f.route.apiVersion, schema: NATIVE_MPGS_SCHEMA, password: 'SYNTHETIC-NON-CREDENTIAL', now: f.deps.now,
      fetchImpl: async (url, init) => { calls++; assert.equal(init.method, 'GET'); assert.match(String(url), new RegExp(`/order/${f.intent.providerOrderId}$`)); return new Response(JSON.stringify(nativeOrder(f.intent.providerOrderId, voidType)), { status: 200, headers: { 'Content-Type': 'application/json' } }); } });
    const service = createTennisReconciliationService({ ...f.deps, reader }), result = await capture(service, b.bindingId);
    assert.equal(result.status, voidType ? 'review_required' : 'captured', voidType); assert.equal(calls, 1); assert.equal(await f.store.countType(T.movement), voidType ? 0 : 1);
    if (voidType) { assert.equal(result.reason, 'provider_history_requires_review'); assert.equal((await capture(f.service, b.bindingId)).status, 'review_required'); assert.equal(f.calls.read, 0); }
  }
});

test('confirmed capture history followed by cancellation/void is review only and never invents a refund', async () => {
  const f = await fixture(), b = await f.bind(); await capture(f.service, b.bindingId);
  f.state.readerError = Object.assign(Error('private source'), { code: 'native_mpgs_history_requires_review' });
  const result = await capture(f.service, b.bindingId); assert.equal(result.status, 'review_required'); assert.equal(result.capturedMinor, '12345'); assert.equal(result.refundedMinor, '0'); assert.equal(result.movementCount, 1);
});

test('separate Node processes reconstruct binding, ACK-loss capture and refund from persisted fixture records', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tennis-reconciliation-restart-')), file = join(directory, 'synthetic-store.json');
  const run = promisify(execFile), cwd = new URL('..', import.meta.url).pathname;
  const prelude = `import {fixture,fileFixtureStores,loseAcknowledgement} from './tests/tennis-reconciliation-fixture.mjs'; import {createTennisReconciliationService,TENNIS_RECONCILIATION_TYPES as T} from './lib/commerce/tennis-reconciliation.js'; const f=await fixture(fileFixtureStores(${JSON.stringify(file)}));`;
  try {
    const first = await run(process.execPath, ['--no-warnings', '--import', './tests/register.mjs', '--input-type=module', '-e', prelude + `const lost=loseAcknowledgement(f.store,p=>p.writes?.some(w=>w.type===T.movement)); const s=createTennisReconciliationService({...f.deps,store:lost});const b=await s.bind(f.bindInput); const r=await s.reconcile({bindingId:b.bindingId,transactionId:'synthetic-capture',kind:'capture'});process.stdout.write(JSON.stringify({pid:process.pid,result:r}));`], { cwd, env: { PATH: process.env.PATH, NODE_ENV: 'test' } });
    const a = JSON.parse(first.stdout); assert.equal(a.result.status, 'captured');
    const second = await run(process.execPath, ['--no-warnings', '--import', './tests/register.mjs', '--input-type=module', '-e', prelude + `const b=await f.bind(); const duplicate=await f.service.reconcile({bindingId:b.bindingId,transactionId:'synthetic-capture',kind:'capture'});f.state.refundTotal='345';const r=await f.service.reconcile({bindingId:b.bindingId,transactionId:'synthetic-refund',kind:'refund'});process.stdout.write(JSON.stringify({pid:process.pid,result:r,duplicate,creates:f.calls.create}));`], { cwd, env: { PATH: process.env.PATH, NODE_ENV: 'test' } });
    const b = JSON.parse(second.stdout); assert.notEqual(a.pid, b.pid); assert.equal(b.duplicate.duplicate, true); assert.equal(b.duplicate.movementCount, 1); assert.equal(b.result.status, 'partially_refunded'); assert.equal(b.result.refundedMinor, '345'); assert.equal(b.result.movementCount, 2); assert.equal(b.creates, 0);
    const saved = JSON.parse(await readFile(file, 'utf8')); assert.equal(Object.keys(saved.docs).filter(key => key.startsWith(T.movement + ':')).length, 2);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
