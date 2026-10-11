/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryStore, createUpstashStore } from "../lib/platform/store.js";
import { startTestRedis, startBridge, RedisConn } from "./redis-rest-bridge.mjs";
import { createLedgerService } from "../lib/platform/ledger.js";
import { createCommerceLedgerBridge, commerceLedgerReadiness, resolveCommerceLedgerRuntime, COMMERCE_LEDGER_SELLER } from "../lib/platform/commerce-ledger.js";

const AT = "2026-10-11T00:00:00.000Z";
const ORDER = `MX-ORD-${"a".repeat(32)}`;
const CUSTOMER = `usr_${"0".repeat(19)}1`;

function fixture({ store = createMemoryStore(), bridgeOptions = {} } = {}) {
  let clock = Date.parse(AT);
  const mapping = { id: "synthetic-inspected-mapping", version: "fixture-v1", enabled: true, status: "verified_live_native_mapping", projectId: "tennis", organizationId: "maximus-tennis", source: "cscart_mpgs", merchantId: "synthetic-existing-merchant", storefrontId: "synthetic-native-storefront", paymentMethodId: "18", storeOrigin: "https://maximussports.ae", processor: "MPGS", sellerLegalName: COMMERCE_LEDGER_SELLER, currency: "AED", verifiedAt: AT, liveModeEvidenceId: "synthetic-live-inspection", nativeMappingEvidenceId: "synthetic-native-field-inspection", customerBindingEvidenceId: "synthetic-customer-link-inspection" };
  const common = { source: mapping.source, projectId: mapping.projectId, merchantId: mapping.merchantId, storefrontId: mapping.storefrontId, paymentMethodId: mapping.paymentMethodId, processor: mapping.processor, currency: mapping.currency, storeOrigin: mapping.storeOrigin, sellerLegalName: mapping.sellerLegalName };
  const events = new Map();
  const native = { ...common, mode: "live", providerOrderId: "native-order-101", commerceOrderId: ORDER, immutableOrderRevisionId: "approved-order-revision-v1", approval: "approved", kind: "goods", cashTotalMinor: "12345", principalMinor: "0", bonusMinor: "0", customerBindingRef: "durable-binding-one", boundCustomerUserId: CUSTOMER };
  const binding = { id: native.customerBindingRef, status: "verified", source: "server_account_binding", commerceOrderId: ORDER, providerOrderId: native.providerOrderId, projectId: mapping.projectId, organizationId: mapping.organizationId, merchantId: mapping.merchantId, customerUserId: CUSTOMER, basis: "immutable_commerce_customer", evidenceId: "durable-binding-record-proof" };
  const deps = { store, mapping, now: () => clock, resolveLivePayment: async ref => structuredClone(events.get(ref)), loadNativeOrder: async () => structuredClone(native), loadCustomerBinding: async () => structuredClone(binding), ...bridgeOptions };
  const bridge = createCommerceLedgerBridge(deps);
  function event(ref = "capture", extra = {}) {
    const value = { ...common, mode: "live", outcome: "confirmed", kind: "capture", providerOrderId: native.providerOrderId, paymentId: "native-payment-one", eventId: `provider-event-${ref}`, transactionId: `provider-transaction-${ref}`, amountMinor: native.cashTotalMinor, occurredAt: AT, proof: { method: "provider_server_query", transportAuthenticated: true, liveModeVerified: true, moneyMovementConfirmed: true, movement: "capture", evidenceId: `independent-query-${ref}`, verifiedAt: AT }, ...extra };
    if (!extra.proof && extra.kind) value.proof.movement = extra.kind;
    events.set(ref, value); return value;
  }
  const reader = createLedgerService({ store, now: () => clock, authorizeRead: async ({ ctx, projectId, customerId }) => ctx?.userId === customerId && projectId === mapping.projectId, resolveVerifiedEvent: async () => { throw Error("read only"); }, loadOrder: async () => null });
  const summary = () => reader.readClientSummary({ ctx: { userId: CUSTOMER }, customerId: CUSTOMER, projectId: mapping.projectId });
  return { store, mapping, native, binding, deps, bridge, reader, events, event, summary, advance: ms => { clock += ms; } };
}

test("runtime cannot activate an uninspected native bridge through a flag", async () => {
  const missing = commerceLedgerReadiness();
  assert.equal(missing.ready, false); assert.equal(missing.financialProductEnabled, false);
  assert.throws(() => resolveCommerceLedgerRuntime({ COMMERCE_LEDGER_ENABLED: "true", NODE_ENV: "production" }), { code: "commerce_ledger_native_mapping_unconfigured" });
  const f = fixture();
  assert.throws(() => resolveCommerceLedgerRuntime({ COMMERCE_LEDGER_ENABLED: "true", NODE_ENV: "production" }, f.deps), { code: "commerce_ledger_unavailable" });
  assert.throws(() => createCommerceLedgerBridge({ ...f.deps, mapping: { ...f.mapping, status: "historical_unverified" } }), { code: "commerce_ledger_native_mapping_unconfigured" });
});

test("raw browser claims, TEST/mock routes and status P alone cannot enqueue receipts", async () => {
  const f = fixture();
  await assert.rejects(f.bridge.enqueueReference({ verified: true, status: "P" }), { code: "commerce_ledger_invalid_opaqueReference" });
  for (const [id, change] of [["test", { mode: "test" }], ["mock", { mock: true }], ["invoice", { invoice: { test: true } }], ["status-p", { status: "P", outcome: undefined, proof: undefined }], ["unverified-mode", { proof: { method: "provider_server_query", moneyMovementConfirmed: true, transportAuthenticated: true, liveModeVerified: false, movement: "capture", evidenceId: "wrong", verifiedAt: AT } }]]) {
    f.event(id, change);
    await assert.rejects(f.bridge.enqueueReference(id), { code: "commerce_ledger_live_evidence_required" });
  }
  assert.equal(await f.store.countType("commerceLedgerInbox"), 0); assert.equal(await f.store.countType("ledgerJournal"), 0);
});

test("exact seller, merchant, source, project, method, storefront and currency are mandatory", async () => {
  for (const [field, value, code] of [["sellerLegalName", "OTHER SELLER", "commerce_ledger_seller_mismatch"], ["merchantId", "other", "commerce_ledger_merchantId_mismatch"], ["projectId", "baby", "commerce_ledger_projectId_mismatch"], ["currency", "USD", "commerce_ledger_currency_mismatch"], ["paymentMethodId", "16", "commerce_ledger_paymentMethodId_mismatch"], ["storefrontId", "other", "commerce_ledger_storefrontId_mismatch"], ["source", "client", "commerce_ledger_source_mismatch"]]) {
    const f = fixture(); f.event("changed", { [field]: value });
    await assert.rejects(f.bridge.enqueueReference("changed"), { code });
    assert.equal(await f.store.countType("commerceLedgerInbox"), 0);
  }
});

test("native total, immutable approval and actual goods classification bind the receipt", async () => {
  for (const [field, value, code] of [["cashTotalMinor", "12346", "commerce_ledger_order_amount_mismatch"], ["approval", "draft", "commerce_ledger_actual_goods_order_required"], ["mode", "test", "commerce_ledger_actual_goods_order_required"], ["invoice", { number: "TEST-INV-123", test: false }, "commerce_ledger_actual_goods_order_required"], ["kind", "funding", "commerce_ledger_actual_goods_order_required"], ["principalMinor", "1", "commerce_ledger_financial_allocation_not_enabled"]]) {
    const f = fixture(); f.event(); f.native[field] = value;
    await assert.rejects(f.bridge.enqueueReference("capture"), { code });
    assert.equal(await f.store.countType("ledgerJournal"), 0);
  }
});

test("verified durable customer link is required; native foreign identity and guest claims fail", async () => {
  const bad = fixture(); bad.event(); bad.binding.customerUserId = `usr_${"0".repeat(19)}2`;
  await assert.rejects(bad.bridge.enqueueReference("capture"), { code: "commerce_ledger_customer_mismatch" });
  const guest = fixture(); guest.event(); guest.native.boundCustomerUserId = null; guest.binding.basis = "email_or_client_claim";
  await assert.rejects(guest.bridge.enqueueReference("capture"), { code: "commerce_ledger_durable_guest_binding_required" });
  guest.binding.basis = "durable_unique_portal_order_owner";
  await guest.bridge.consumeReference("capture");
  assert.equal((await guest.summary()).currencies[0].capturedMinor, "12345");
  const wrong = fixture(); wrong.event(); wrong.binding.projectId = "baby";
  await assert.rejects(wrong.bridge.enqueueReference("capture"), { code: "commerce_ledger_verified_customer_binding_required" });
});

test("enqueue is atomic and processing derives actual ledger fields from durable verified work", async () => {
  const f = fixture(); f.event();
  f.store.failNextCommit = "store_unavailable";
  await assert.rejects(f.bridge.enqueueReference("capture"), { code: "store_unavailable" });
  for (const type of ["commerceLedgerInbox", "commerceLedgerWork", "commerceLedgerOrder", "ledgerJournal"]) assert.equal(await f.store.countType(type), 0);
  const received = await f.bridge.enqueueReference("capture");
  assert.equal(received.status, "pending"); assert.equal(await f.store.countType("ledgerJournal"), 0);
  const processed = await f.bridge.processWork(received.workId);
  assert.equal(processed.status, "completed"); assert.equal(processed.duplicate, false);
  assert.equal((await f.summary()).currencies[0].capturedMinor, "12345");
  assert.equal((await f.summary()).currencies[0].bankBalanceMinor, null);
  assert.equal((await f.bridge.retryPending()).items.length, 0);
});

test("parallel duplicate deliveries persist one inbox/work/journal and safely report worker contention", async () => {
  const f = fixture(); f.event();
  const received = await Promise.all(Array.from({ length: 8 }, () => f.bridge.enqueueReference("capture")));
  assert.equal(new Set(received.map(result => result.workId)).size, 1);
  const results = await Promise.allSettled(Array.from({ length: 8 }, () => f.bridge.processWork(received[0].workId)));
  assert.ok(results.some(result => result.status === "fulfilled"));
  for (const result of results.filter(result => result.status === "rejected")) assert.equal(result.reason.code, "commerce_ledger_worker_busy");
  for (const type of ["commerceLedgerInbox", "commerceLedgerWork", "ledgerJournal"]) assert.equal(await f.store.countType(type), 1);
  assert.equal((await f.summary()).currencies[0].capturedMinor, "12345");
});

test("new provider event IDs deduplicate the same economic transaction durably", async () => {
  const f = fixture(); const original = f.event();
  await f.bridge.consumeReference("capture");
  f.events.set("alias", { ...original, eventId: "alternate-provider-event", proof: { ...original.proof, evidenceId: "new-independent-query" } });
  const alias = await createCommerceLedgerBridge(f.deps).consumeReference("alias");
  assert.equal(alias.duplicate, true); assert.equal(await f.store.countType("commerceLedgerInbox"), 2);
  assert.equal(await f.store.countType("commerceLedgerWork"), 1); assert.equal(await f.store.countType("ledgerJournal"), 1);
});

test("failure after ledger commit but before work completion is recovered without a second receipt", async () => {
  const f = fixture(); f.event(); const queued = await f.bridge.enqueueReference("capture");
  const original = f.store.commit.bind(f.store); let failCompletion = true;
  f.store.commit = async commit => {
    if (failCompletion && commit.writes?.some(write => write.type === "commerceLedgerWork" && write.doc.status === "completed")) { failCompletion = false; throw Object.assign(new Error("synthetic interrupted completion"), { code: "store_unavailable" }); }
    return original(commit);
  };
  await assert.rejects(f.bridge.processWork(queued.workId), { code: "store_unavailable" });
  assert.equal(await f.store.countType("ledgerJournal"), 1);
  assert.equal((await f.bridge.readWorkStatus(queued.workId)).status, "pending");
  const nextProcess = createCommerceLedgerBridge(f.deps);
  assert.deepEqual((await nextProcess.retryPending()).items, []);
  f.advance(1000);
  const recovered = await nextProcess.retryPending();
  assert.equal(recovered.items[0].status, "completed"); assert.equal(recovered.items[0].duplicate, true);
  assert.equal((await f.summary()).currencies[0].capturedMinor, "12345"); assert.equal(await f.store.countType("ledgerJournal"), 1);
});

test("lost completion acknowledgment is also replay safe", async () => {
  const f = fixture(); f.event(); const queued = await f.bridge.enqueueReference("capture");
  const original = f.store.commit.bind(f.store); let failAck = true;
  f.store.commit = async commit => {
    const completion = failAck && commit.writes?.some(write => write.type === "commerceLedgerWork" && write.doc.status === "completed");
    const result = await original(commit);
    if (completion) { failAck = false; throw Object.assign(new Error("synthetic lost acknowledgment"), { code: "store_timeout" }); }
    return result;
  };
  await assert.rejects(f.bridge.processWork(queued.workId), { code: "store_timeout" });
  assert.equal((await f.bridge.readWorkStatus(queued.workId)).status, "completed");
  assert.equal((await f.bridge.processWork(queued.workId)).duplicate, true); assert.equal(await f.store.countType("ledgerJournal"), 1);
});

test("failed lease release survives worker restart and expires for recovery", async () => {
  const f = fixture(); f.event(); const queued = await f.bridge.enqueueReference("capture");
  const original = f.store.commit.bind(f.store); let breakStore = true;
  f.store.commit = async commit => {
    if (breakStore && (commit.writes?.some(write => write.type === "ledgerJournal") || commit.writes?.some(write => write.type === "commerceLedgerWork" && write.doc.status === "pending"))) throw Object.assign(new Error("synthetic outage"), { code: "store_unavailable" });
    return original(commit);
  };
  await assert.rejects(f.bridge.processWork(queued.workId), { code: "store_unavailable" });
  assert.equal((await f.bridge.readWorkStatus(queued.workId)).status, "processing");
  await assert.rejects(f.bridge.processWork(queued.workId), { code: "commerce_ledger_worker_busy" });
  breakStore = false; f.advance(31000);
  assert.equal((await createCommerceLedgerBridge(f.deps).retryPending()).items[0].status, "completed");
  assert.equal(await f.store.countType("ledgerJournal"), 1);
});

test("refund arriving before capture stays durable and retries after capture", async () => {
  const f = fixture(); f.event("refund", { kind: "refund", amountMinor: "2345" });
  const queued = await f.bridge.enqueueReference("refund");
  await assert.rejects(f.bridge.processWork(queued.workId), { code: "ledger_capture_required" });
  f.event(); await f.bridge.consumeReference("capture");
  f.advance(1000);
  assert.equal((await f.bridge.retryPending()).items[0].status, "completed");
  const row = (await f.summary()).currencies[0];
  assert.equal(row.capturedMinor, "12345"); assert.equal(row.refundedMinor, "2345"); assert.equal(row.netCapturedMinor, "10000");
  assert.equal((await f.reader.verifyClientJournal({ ctx: { userId: CUSTOMER }, customerId: CUSTOMER, projectId: "tennis" })).checkedEntries, 2);
});

test("conflicting event/transaction reuse and changed immutable customer/order links fail closed", async () => {
  const f = fixture(); const original = f.event(); await f.bridge.enqueueReference("capture");
  f.events.set("event-conflict", { ...original, transactionId: "different-transaction", amountMinor: "1", kind: "refund", proof: { ...original.proof, movement: "refund" } });
  await assert.rejects(f.bridge.enqueueReference("event-conflict"), { code: "commerce_ledger_event_conflict" });
  f.events.set("transaction-conflict", { ...original, eventId: "different-event", amountMinor: "1", kind: "refund", proof: { ...original.proof, movement: "refund" } });
  await assert.rejects(f.bridge.enqueueReference("transaction-conflict"), { code: "commerce_ledger_transaction_conflict" });
  f.native.immutableOrderRevisionId = "replacement-revision";
  f.event("new-transaction");
  await assert.rejects(f.bridge.enqueueReference("new-transaction"), { code: "commerce_ledger_order_link_conflict" });
});

test("one native order cannot be rebound to a second commerce order", async () => {
  const f = fixture(); f.event(); await f.bridge.enqueueReference("capture");
  const second = `MX-ORD-${"b".repeat(32)}`;
  f.native.commerceOrderId = second; f.binding.commerceOrderId = second; f.event("rebound");
  await assert.rejects(f.bridge.enqueueReference("rebound"), { code: "commerce_ledger_order_link_conflict" });
});

test("raw provider/card/secrets never enter sanitized inbox, work, order or audit records", async () => {
  const f = fixture(); f.event("capture", { authorization: "synthetic-secret-do-not-retain", card: { pan: "synthetic-card-do-not-retain" }, rawProviderBody: { apiPassword: "synthetic-secret-do-not-retain" } });
  const queued = await f.bridge.enqueueReference("capture");
  const work = await f.store.get("commerceLedgerWork", queued.workId);
  const inbox = await f.store.get("commerceLedgerInbox", queued.inboxId);
  const order = await f.store.get("commerceLedgerOrder", ORDER);
  const audit = await f.store.getMany("audit", await f.store.listIndex("audit:all"));
  const text = JSON.stringify([work.doc, inbox.doc, order.doc, audit]);
  assert.ok(!text.includes("synthetic-secret-do-not-retain")); assert.ok(!text.includes("synthetic-card-do-not-retain"));
  assert.equal(work.doc.event.authorization, undefined);
});

test("changed stored work payload is rejected before ledger posting", async () => {
  const f = fixture(); f.event(); const queued = await f.bridge.enqueueReference("capture");
  const row = await f.store.get("commerceLedgerWork", queued.workId);
  await f.store.commit({ writes: [{ type: "commerceLedgerWork", id: queued.workId, expectedVersion: row.version, doc: { ...row.doc, event: { ...row.doc.event, amountMinor: "1" } } }] });
  await assert.rejects(f.bridge.processWork(queued.workId), { code: "commerce_ledger_work_integrity_failed" });
  assert.equal(await f.store.countType("ledgerJournal"), 0);
});

test("first Tennis mapping rejects a foreign organization before recording customer receipts", async () => {
  const f = fixture();
  assert.throws(() => createCommerceLedgerBridge({ ...f.deps, mapping: { ...f.mapping, organizationId: "foreign-organization" } }), { code: "commerce_ledger_native_mapping_unconfigured" });
  f.event(); f.binding.organizationId = "foreign-organization";
  await assert.rejects(f.bridge.enqueueReference("capture"), { code: "commerce_ledger_verified_customer_binding_required" });
  assert.equal(await f.store.countType("ledgerJournal"), 0);
});

async function enqueueSeparateOrder(f, index, kind = "capture") {
  const ref = `separate-${index}-${kind}`;
  f.native.commerceOrderId = `MX-ORD-${index.toString(16).padStart(32, "0")}`;
  f.native.providerOrderId = `synthetic-native-order-${index}`;
  f.binding.commerceOrderId = f.native.commerceOrderId;
  f.binding.providerOrderId = f.native.providerOrderId;
  f.event(ref, { kind, paymentId: `synthetic-native-payment-${index}`, amountMinor: kind === "capture" ? "12345" : "100" });
  const queued = await f.bridge.enqueueReference(ref);
  f.advance(1);
  return queued;
}

test("more than limit invalid old reversals back off and cannot starve a newer valid capture", async () => {
  const f = fixture();
  const older = [];
  for (let index = 1; index <= 6; index++) older.push(await enqueueSeparateOrder(f, index, "refund"));
  const valid = await enqueueSeparateOrder(f, 7);
  for (let batch = 0; batch < 3; batch++) {
    const result = await f.bridge.retryPending({ limit: 2 });
    assert.equal(result.items.length, 2);
    assert.ok(result.items.every(item => item.status === "pending" && item.code === "ledger_capture_required" && item.nextAttemptAt > f.deps.now()));
  }
  const final = await f.bridge.retryPending({ limit: 2 });
  assert.equal(final.items.length, 1); assert.equal(final.items[0].workId, valid.workId); assert.equal(final.items[0].status, "completed");
  assert.deepEqual((await f.bridge.retryPending({ limit: 2 })).items, []);
  for (const entry of older) assert.equal((await f.bridge.readWorkStatus(entry.workId)).attempts, 1);
  assert.equal((await f.summary()).currencies[0].capturedPaymentCount, 1);
});

test("more than limit actual active worker leases do not hide a newer due capture", async () => {
  const f = fixture(), blockedOrders = new Set(), older = [];
  for (let index = 1; index <= 3; index++) {
    older.push(await enqueueSeparateOrder(f, index)); blockedOrders.add(f.native.commerceOrderId);
  }
  const originalCommit = f.store.commit.bind(f.store);
  let release, allBlocked, blocked = 0;
  const hold = new Promise(resolve => { release = resolve; });
  const entered = new Promise(resolve => { allBlocked = resolve; });
  f.store.commit = async commit => {
    if (commit.writes?.some(write => write.type === "ledgerJournal" && blockedOrders.has(write.doc.orderId))) {
      blocked++; if (blocked === 3) allBlocked(); await hold;
    }
    return originalCommit(commit);
  };
  const workers = older.map(item => f.bridge.processWork(item.workId));
  let timeout;
  try {
    await Promise.race([entered, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error("worker lease test timeout")), 5000); })]);
    const valid = await enqueueSeparateOrder(f, 4);
    const run = await f.bridge.retryPending({ limit: 1 });
    assert.equal(run.items.length, 1); assert.equal(run.items[0].workId, valid.workId); assert.equal(run.items[0].status, "completed");
    assert.deepEqual((await f.bridge.retryPending({ limit: 1 })).items, []);
    for (const item of older) assert.equal((await f.bridge.readWorkStatus(item.workId)).status, "processing");
  } finally { clearTimeout(timeout); release(); await Promise.allSettled(workers); }
  for (const item of older) assert.equal((await f.bridge.readWorkStatus(item.workId)).status, "completed");
  assert.equal((await f.summary()).currencies[0].capturedPaymentCount, 4);
});

test("exponential backoff persists across bridge reconstruction then bounded attempts require review", async () => {
  const f = fixture({ bridgeOptions: { maxProcessingAttempts: 3, retryMaxMs: 2000 } });
  f.event("refund", { kind: "refund", amountMinor: "100" });
  const queued = await f.bridge.enqueueReference("refund");
  await assert.rejects(f.bridge.processWork(queued.workId), { code: "ledger_capture_required" });
  let row = await f.bridge.readWorkStatus(queued.workId);
  assert.equal(row.nextAttemptAt, f.deps.now() + 1000); assert.equal(row.attempts, 1);
  const rebuilt = createCommerceLedgerBridge(f.deps);
  await assert.rejects(rebuilt.processWork(queued.workId), { code: "commerce_ledger_retry_not_due" });
  assert.deepEqual((await rebuilt.retryPending()).items, []);
  f.advance(1000); await rebuilt.retryPending();
  row = await rebuilt.readWorkStatus(queued.workId);
  assert.equal(row.attempts, 2); assert.equal(row.nextAttemptAt, f.deps.now() + 2000);
  f.advance(1999); assert.deepEqual((await rebuilt.retryPending()).items, []);
  f.advance(1); const result = await rebuilt.retryPending();
  assert.equal(result.items[0].status, "review_required"); assert.equal(result.items[0].retryable, false);
  row = await rebuilt.readWorkStatus(queued.workId);
  assert.equal(row.attempts, 3); assert.equal(row.nextAttemptAt, null); assert.ok(row.reviewRequiredAt);
  f.advance(86400000); assert.deepEqual((await rebuilt.retryPending()).items, []);
  await assert.rejects(rebuilt.processWork(queued.workId), { code: "commerce_ledger_review_required" });
  const work = await f.store.get("commerceLedgerWork", queued.workId);
  assert.equal((await f.store.listIndex(`commerce-ledger:review:${work.doc.mappingHash}`))[0], queued.workId);
  assert.equal(await f.store.countType("commerceLedgerInbox"), 1); assert.equal(await f.store.countType("ledgerJournal"), 0);
});

test("malformed mutable work state is durably quarantined so the next due capture can proceed", async () => {
  const f = fixture(); const old = await enqueueSeparateOrder(f, 1); const good = await enqueueSeparateOrder(f, 2);
  const rec = await f.store.get("commerceLedgerWork", old.workId);
  await f.store.commit({ writes: [{ type: "commerceLedgerWork", id: old.workId, expectedVersion: rec.version, doc: { ...rec.doc, status: "invalid_state" } }] });
  const first = await f.bridge.retryPending({ limit: 1 });
  assert.equal(first.items[0].status, "review_required"); assert.equal(first.items[0].code, "commerce_ledger_invalid_work_state");
  const next = await f.bridge.retryPending({ limit: 1 });
  assert.equal(next.items[0].workId, good.workId); assert.equal(next.items[0].status, "completed");
  const quarantined = await f.store.get("commerceLedgerWork", old.workId);
  assert.deepEqual(quarantined.doc.event, rec.doc.event); assert.equal(quarantined.doc.fingerprint, rec.doc.fingerprint);
});

test("operator retry requires exact independent approval and consumes that case only once", async () => {
  const approvals = new Map();
  const f = fixture({ bridgeOptions: { maxProcessingAttempts: 1, resolveAuthorizedRetry: async ref => structuredClone(approvals.get(ref)) } });
  f.event("refund", { kind: "refund", amountMinor: "100" });
  const queued = await f.bridge.enqueueReference("refund");
  await assert.rejects(f.bridge.processWork(queued.workId), { code: "ledger_capture_required" });
  const work = await f.store.get("commerceLedgerWork", queued.workId);
  const approval = { id: "synthetic-approved-retry-case", status: "approved", capability: "ledger:retry", workId: queued.workId, mappingHash: work.doc.mappingHash, fingerprint: work.doc.fingerprint, actorUserId: CUSTOMER, caseId: "synthetic-operator-review-case", expiresAt: "2026-10-12T00:00:00.000Z", proof: { method: "authorized_operator", evidenceId: "synthetic-server-authority", verifiedAt: AT } };
  await assert.rejects(f.bridge.requeueReviewedWork({ verified: true }), { code: "commerce_ledger_invalid_retryReference" });
  await assert.rejects(createCommerceLedgerBridge({ ...f.deps, resolveAuthorizedRetry: undefined }).requeueReviewedWork("case"), { code: "commerce_ledger_operator_retry_unconfigured" });
  approvals.set("wrong", { ...approval, fingerprint: "a".repeat(64) });
  await assert.rejects(f.bridge.requeueReviewedWork("wrong"), { code: "commerce_ledger_retry_work_mismatch" });
  approvals.set("case", approval);
  f.store.failNextCommit = "store_unavailable";
  await assert.rejects(f.bridge.requeueReviewedWork("case"), { code: "store_unavailable" });
  assert.equal((await f.bridge.readWorkStatus(queued.workId)).status, "review_required"); assert.equal(await f.store.countType("commerceLedgerRetryApproval"), 0);
  const results = await Promise.all([f.bridge.requeueReviewedWork("case"), f.bridge.requeueReviewedWork("case")]);
  assert.equal(results.filter(item => item.duplicate).length, 1);
  assert.equal(await f.store.countType("commerceLedgerRetryApproval"), 1);
  let state = await f.bridge.readWorkStatus(queued.workId);
  assert.equal(state.attempts, 1); assert.equal(state.retryCycleAttempts, 0); assert.equal(state.status, "pending");
  await f.bridge.retryPending(); // Still no original capture: a second bounded cycle goes to review.
  assert.equal((await f.bridge.requeueReviewedWork("case")).duplicate, true);
  state = await f.bridge.readWorkStatus(queued.workId);
  assert.equal(state.status, "review_required"); assert.equal(state.attempts, 2);
  const audit = await f.store.getMany("audit", await f.store.listIndex("audit:all"));
  const approved = audit.filter(row => row.doc.action === "commerce.ledger_operator_retry_approved");
  assert.equal(approved.length, 1); assert.equal(approved[0].doc.actorUserId, CUSTOMER);
  assert.equal(audit.filter(row => row.doc.action === "commerce.ledger_review_required").length, 2);
});

test("operator approval expiring during asynchronous reads cannot requeue reviewed work", async () => {
  let approval;
  const f = fixture({ bridgeOptions: { maxProcessingAttempts: 1, resolveAuthorizedRetry: async () => approval } });
  f.event("refund", { kind: "refund", amountMinor: "100" }); const queued = await f.bridge.enqueueReference("refund");
  await assert.rejects(f.bridge.processWork(queued.workId), { code: "ledger_capture_required" });
  const work = await f.store.get("commerceLedgerWork", queued.workId);
  approval = { id: "synthetic-expiring-case", status: "approved", capability: "ledger:retry", workId: queued.workId, mappingHash: work.doc.mappingHash, fingerprint: work.doc.fingerprint, actorUserId: CUSTOMER, caseId: "synthetic-case", expiresAt: new Date(f.deps.now() + 1000).toISOString(), proof: { method: "authorized_operator", evidenceId: "synthetic-approval", verifiedAt: AT } };
  const originalGet = f.store.get.bind(f.store);
  f.store.get = async (type, id) => { const row = await originalGet(type, id); if (type === "commerceLedgerRetryApproval") f.advance(1000); return row; };
  await assert.rejects(f.bridge.requeueReviewedWork("case"), { code: "commerce_ledger_operator_retry_approval_required" });
  assert.equal((await f.bridge.readWorkStatus(queued.workId)).status, "review_required"); assert.equal(await f.store.countType("commerceLedgerRetryApproval"), 0);
});

test("native Redis serializes aliases/leases and recovers post-ledger completion failure exactly once", async t => {
  // This test owns a fresh process/directory/port. It never attaches to a pre-existing Redis.
  const port = 6395, token = "commerce-ledger-local-synthetic-only";
  let redis, rest, conn;
  try {
    try {
      redis = await startTestRedis(port, { timeoutMs: 5000 });
      conn = new RedisConn(port); await conn.ready;
      rest = await startBridge({ redisPort: port, token });
    } catch (error) {
      if (process.env.INTAKE_REQUIRE_REDIS === "1" || !["ENOENT", "EACCES", "EPERM"].includes(error.code)) throw error;
      return t.skip(`native Redis unavailable: ${error.code}`);
    }
    const store = createUpstashStore({ url: rest.url, token });
    const f = fixture({ store }); const originalEvent = f.event();
    const refs = Array.from({ length: 8 }, (_, index) => {
      const ref = `native-alias-${index}`;
      f.events.set(ref, { ...originalEvent, eventId: `native-event-${index}`, proof: { ...originalEvent.proof, evidenceId: `synthetic-query-${index}` } });
      return ref;
    });
    const queued = await Promise.all(refs.map(ref => f.bridge.enqueueReference(ref)));
    assert.equal(new Set(queued.map(item => item.workId)).size, 1);
    const workId = queued[0].workId;
    const originalCommit = store.commit.bind(store);
    let reachedCompletion, allowFailure;
    const completionReached = new Promise(resolve => { reachedCompletion = resolve; });
    const failureAllowed = new Promise(resolve => { allowFailure = resolve; });
    let failCompletion = true;
    store.commit = async commit => {
      if (failCompletion && commit.writes?.some(write => write.type === "commerceLedgerWork" && write.doc.status === "completed")) {
        failCompletion = false; reachedCompletion(); await failureAllowed;
        throw Object.assign(new Error("synthetic failure after real Redis ledger commit"), { code: "store_unavailable" });
      }
      return originalCommit(commit);
    };
    const active = f.bridge.processWork(workId);
    const activeFailure = assert.rejects(active, { code: "store_unavailable" });
    let timeout;
    try {
      await Promise.race([completionReached, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error("completion test timeout")), 5000); })]);
      await assert.rejects(createCommerceLedgerBridge(f.deps).processWork(workId), { code: "commerce_ledger_worker_busy" });
    } finally { clearTimeout(timeout); allowFailure(); }
    await activeFailure;
    assert.equal((await f.bridge.readWorkStatus(workId)).status, "pending");
    const rebuilt = createCommerceLedgerBridge(f.deps);
    assert.deepEqual((await rebuilt.retryPending()).items, []);
    f.advance(1000);
    const replay = await rebuilt.retryPending();
    assert.equal(replay.items[0].status, "completed"); assert.equal(replay.items[0].duplicate, true);
    const row = (await f.summary()).currencies[0];
    assert.equal(row.capturedMinor, "12345"); assert.equal(row.capturedPaymentCount, 1);
    assert.equal((await f.reader.verifyClientJournal({ ctx: { userId: CUSTOMER }, customerId: CUSTOMER, projectId: "tennis" })).checkedEntries, 1);
    const command = async (...args) => { const result = await conn.send(args); if (result?.__error) throw new Error(result.__error); return result; };
    assert.equal((await command("KEYS", "mxp:doc:commerceLedgerInbox:*")).length, 8);
    assert.equal((await command("KEYS", "mxp:doc:commerceLedgerWork:*")).length, 1);
    assert.equal((await command("KEYS", "mxp:doc:ledgerJournal:*")).length, 1);
    assert.deepEqual((await rebuilt.retryPending()).items, []);
  } finally { rest?.close(); conn?.close(); await redis?.close(); }
});
