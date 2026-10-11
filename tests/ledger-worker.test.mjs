/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { createMemoryStore, createUpstashStore } from "../lib/platform/store.js";
import { createCommerceLedgerBridge, COMMERCE_LEDGER_SELLER } from "../lib/platform/commerce-ledger.js";
import { createLedgerWorker, handleLedgerWorkerRequest } from "../lib/platform/ledger-worker.js";
import { hashPayload } from "../lib/platform/ids.js";
import { startTestRedis, startBridge, RedisConn } from "./redis-rest-bridge.mjs";

const SECRET = "synthetic-existing-cron-secret-only";
const AT = "2026-10-11T00:00:00.000Z";
const ORDER = `MX-ORD-${"a".repeat(32)}`;
const CUSTOMER = `usr_${"0".repeat(19)}1`;
const env = { NODE_ENV: "test", CRON_SECRET: SECRET, COMMERCE_LEDGER_ENABLED: "true" };
const request = (action, body, headers = {}) => new Request(`https://fixture.invalid/api/ledger/${action}`, { method: action === "worker" ? "GET" : "POST", headers: { authorization: `Bearer ${SECRET}`, "content-type": "application/json", ...headers }, ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }) });

function fixture({ store = createMemoryStore(), movements = new Map() } = {}) {
  let clock = Date.parse(AT), queryFailure = false, queryCount = 0;
  const mapping = { id: "synthetic-worker-mapping", version: "fixture-v1", enabled: true, status: "verified_live_native_mapping", projectId: "tennis", organizationId: "maximus-tennis", source: "cscart_mpgs", merchantId: "synthetic-merchant", storefrontId: "synthetic-store", paymentMethodId: "18", storeOrigin: "https://maximussports.ae", processor: "MPGS", sellerLegalName: COMMERCE_LEDGER_SELLER, currency: "AED", verifiedAt: AT, liveModeEvidenceId: "synthetic-live-evidence", nativeMappingEvidenceId: "synthetic-native-schema", customerBindingEvidenceId: "synthetic-binding-schema" };
  const scopedFields = { source: mapping.source, projectId: mapping.projectId, merchantId: mapping.merchantId, storefrontId: mapping.storefrontId, paymentMethodId: mapping.paymentMethodId, processor: mapping.processor, currency: mapping.currency, storeOrigin: mapping.storeOrigin, sellerLegalName: mapping.sellerLegalName };
  const native = { ...scopedFields, mode: "live", providerOrderId: "synthetic-native-order", commerceOrderId: ORDER, immutableOrderRevisionId: "immutable-fixture-revision", approval: "approved", kind: "goods", cashTotalMinor: "12345", principalMinor: "0", bonusMinor: "0", customerBindingRef: "synthetic-durable-binding", boundCustomerUserId: CUSTOMER };
  const binding = { id: native.customerBindingRef, status: "verified", source: "server_account_binding", commerceOrderId: ORDER, providerOrderId: native.providerOrderId, projectId: "tennis", organizationId: "maximus-tennis", merchantId: mapping.merchantId, customerUserId: CUSTOMER, basis: "immutable_commerce_customer", evidenceId: "synthetic-binding-proof" };
  const event = { ...scopedFields, mode: "live", outcome: "confirmed", kind: "capture", eventId: "synthetic-native-event", transactionId: "synthetic-native-transaction", paymentId: "synthetic-native-payment", providerOrderId: native.providerOrderId, amountMinor: "12345", occurredAt: AT, proof: { method: "provider_server_query", transportAuthenticated: true, liveModeVerified: true, moneyMovementConfirmed: true, movement: "capture", evidenceId: "synthetic-query-proof", verifiedAt: AT } };
  const scope = { mappingHash: hashPayload({ fixtureInspectedMapping: mapping }), source: "cscart_mpgs", projectId: "tennis" };
  const now = () => clock;
  const makeBridge = (bridgeStore = store) => createCommerceLedgerBridge({ store: bridgeStore, mapping, now, resolveLivePayment: async ref => {
    queryCount++;
    const delivery = await bridgeStore.get("ledgerReferenceDelivery", `ldv_${hashPayload({ scope, reference: ref })}`);
    assert.equal(delivery?.doc.status, "processing", "reference persists before native verification");
    if (queryFailure || ref.startsWith("bad-")) throw Object.assign(new Error("synthetic-sensitive-provider-secret customer-card-proof"), { code: "synthetic_sensitive_provider_secret" });
    return structuredClone(movements.get(ref) || event);
  }, loadNativeOrder: async () => structuredClone(native), loadCustomerBinding: async () => structuredClone(binding) });
  const bridge = makeBridge();
  const readiness = { ready: true, missing: [], ...scope, financialProductEnabled: false };
  const runtimeFactory = async args => { assert.equal(args.store.kind, store.kind); return { bridge: makeBridge(args.store), readiness }; };
  const deps = { env, store, runtimeFactory, now };
  const worker = createLedgerWorker({ store, bridge, scope, now });
  return { store, bridge, scope, event, readiness, deps, worker, now, advance: ms => { clock += ms; }, failQueries: value => { queryFailure = value; }, queries: () => queryCount };
}

test("server authentication uses constant-time equality and never accepts a portal cookie or query token", async t => {
  let calls = 0;
  const original = crypto.timingSafeEqual;
  const comparison = t.mock.method(crypto, "timingSafeEqual", (...args) => original(...args));
  const factory = async () => { calls++; throw new Error("source must not be read"); };
  for (const supplied of ["", "Bearer short", `Bearer ${SECRET}suffix`]) {
    const r = await handleLedgerWorkerRequest(request("worker", undefined, { authorization: supplied, cookie: "mx_session=synthetic-admin" }), "retry", { env, runtimeFactory: factory });
    assert.equal(r.status, 401);
  }
  assert.equal(comparison.mock.callCount(), 3); assert.equal(calls, 0);
  const query = new Request(`https://fixture.invalid/api/ledger/worker?token=${SECRET}`);
  assert.equal((await handleLedgerWorkerRequest(query, "retry", { env, runtimeFactory: factory })).status, 401);
});

test("authenticated OFF cron succeeds as skipped before body, store, client or source construction", async () => {
  let calls = 0;
  const cfg = { ...env, COMMERCE_LEDGER_ENABLED: "false" };
  Object.defineProperty(cfg, "KV_REST_API_TOKEN", { get: () => { throw Error("store credential must not be accessed"); } });
  Object.defineProperty(cfg, "NATIVE_MPGS_API_PASSWORD", { get: () => { throw Error("native credential must not be accessed"); } });
  const runtimeFactory = async () => { calls++; throw Error("native factory must not run"); };
  const cron = await handleLedgerWorkerRequest(request("worker"), "retry", { env: cfg, runtimeFactory });
  assert.equal(cron.status, 200); const body = await cron.json(); assert.equal(body.status, "disabled"); assert.equal(body.skipped, true);
  const eventRequest = request("event-reference", { status: "PAID", customerId: CUSTOMER });
  assert.equal((await handleLedgerWorkerRequest(eventRequest, "event-reference", { env: cfg, runtimeFactory })).status, 503);
  assert.equal(eventRequest.bodyUsed, false); assert.equal(calls, 0);
});

test("missing secret, production memory store or native readiness cannot enqueue or query", async () => {
  const f = fixture();
  for (const cfg of [{ ...env, CRON_SECRET: undefined }, { ...env, NODE_ENV: "production" }]) {
    assert.equal((await handleLedgerWorkerRequest(request("event-reference", { eventReference: "registered-fixture-reference" }), "event-reference", { ...f.deps, env: cfg })).status, 503);
  }
  const r = await handleLedgerWorkerRequest(request("event-reference", { eventReference: "registered-fixture-reference" }), "event-reference", { ...f.deps, runtimeFactory: async () => ({ bridge: null, readiness: { ready: false, missing: ["synthetic-schema-missing"] } }) });
  assert.equal(r.status, 503); assert.equal(await f.store.countType("ledgerReferenceDelivery"), 0); assert.equal(f.queries(), 0);
  assert.equal((await r.text()).includes("synthetic-schema-missing"), false);
});

test("event endpoint rejects monetary/status/customer/program fields and arbitrary URLs before factory access", async () => {
  const f = fixture(); let factoryCalls = 0;
  const deps = { ...f.deps, runtimeFactory: async () => { factoryCalls++; throw Error("invalid body cannot reach source"); } };
  for (const body of [{ eventReference: "fixture", amountMinor: "12345" }, { eventReference: "fixture", customerId: CUSTOMER }, { eventReference: "fixture", verified: true }, { eventReference: "fixture", status: "P" }, { eventReference: "fixture", programId: "20-percent" }, { paid: true }, { eventReference: {} }, { eventReference: "https://attacker.invalid/payment" }, { eventReference: "x".repeat(201) }, [], null]) {
    assert.equal((await handleLedgerWorkerRequest(request("event-reference", JSON.stringify(body)), "event-reference", deps)).status, 400);
  }
  assert.equal(factoryCalls, 0); assert.equal(await f.store.countType("ledgerReferenceDelivery"), 0);
  const query = new Request("https://fixture.invalid/api/ledger/worker?limit=100&customerId=foreign", { headers: { authorization: `Bearer ${SECRET}` } });
  assert.equal((await handleLedgerWorkerRequest(query, "retry", deps)).status, 400);
  assert.equal((await handleLedgerWorkerRequest(request("event-reference", {}), "retry", deps)).status, 405);
});

test("streamed payload size, strict JSON media type, malformed UTF-8 and slow bodies are bounded", async () => {
  const f = fixture();
  const deps = { ...f.deps, bodyTimeoutMs: 10, runtimeFactory: async () => { throw Error("must not construct runtime"); } };
  assert.equal((await handleLedgerWorkerRequest(request("event-reference", {}, { "content-type": "application/json-extra" }), "event-reference", deps)).status, 415);
  assert.equal((await handleLedgerWorkerRequest(request("event-reference", " ".repeat(1025)), "event-reference", deps)).status, 413);
  const malformed = new Request("https://fixture.invalid/api/ledger/event-reference", { method: "POST", headers: { authorization: `Bearer ${SECRET}`, "content-type": "application/json" }, body: new Uint8Array([0xff, 0xfe]) });
  assert.equal((await handleLedgerWorkerRequest(malformed, "event-reference", deps)).status, 400);
  let canceled = false;
  const slow = new Request("https://fixture.invalid/api/ledger/event-reference", { method: "POST", headers: { authorization: `Bearer ${SECRET}`, "content-type": "application/json" }, body: new ReadableStream({ pull: () => new Promise(() => {}), cancel: () => { canceled = true; } }), duplex: "half" });
  assert.equal((await handleLedgerWorkerRequest(slow, "event-reference", deps)).status, 408); assert.equal(canceled, true);
});

test("event reference persists before native verification and responses contain only counts/correlation", async () => {
  const f = fixture();
  const r = await handleLedgerWorkerRequest(request("event-reference", { eventReference: "registered-fixture-reference" }), "event-reference", f.deps);
  assert.equal(r.status, 202); assert.match(r.headers.get("cache-control"), /no-store/);
  const body = await r.json(); assert.equal(body.status, "accepted"); assert.equal(body.references.completed, 1); assert.equal(body.journal.completed, 1);
  assert.equal(body.correlationId, r.headers.get("x-correlation-id"));
  const text = JSON.stringify(body);
  for (const forbidden of [CUSTOMER, ORDER, "registered-fixture-reference", "synthetic-native", "clw_", "ldv_", "proof", "merchant", SECRET]) assert.equal(text.includes(forbidden), false);
  assert.equal(await f.store.countType("ledgerReferenceDelivery"), 1); assert.equal(await f.store.countType("ledgerJournal"), 1);
  const repeat = await handleLedgerWorkerRequest(request("event-reference", { eventReference: "registered-fixture-reference" }), "event-reference", f.deps);
  assert.equal((await repeat.json()).duplicate, true); assert.equal(await f.store.countType("ledgerJournal"), 1);
});

test("provider outage is durable, does not spin, and a reconstructed cron recovers once", async () => {
  const f = fixture(); f.failQueries(true);
  const accepted = await handleLedgerWorkerRequest(request("event-reference", { eventReference: "registered-fixture-reference" }), "event-reference", f.deps);
  assert.equal(accepted.status, 202); const body = await accepted.json(); assert.equal(body.references.deferred, 1); assert.equal(body.journal.attempted, 0);
  assert.equal(JSON.stringify(body).includes("synthetic-sensitive"), false); assert.equal(await f.store.countType("ledgerJournal"), 0);
  const early = await handleLedgerWorkerRequest(request("worker"), "retry", f.deps);
  assert.equal((await early.json()).references.attempted, 0); assert.equal(f.queries(), 1);
  f.advance(1000); f.failQueries(false);
  const recovered = await handleLedgerWorkerRequest(request("worker"), "retry", f.deps);
  const result = await recovered.json(); assert.equal(result.references.completed, 1); assert.equal(result.journal.completed, 1);
  assert.equal(await f.store.countType("ledgerJournal"), 1);
  assert.equal((await (await handleLedgerWorkerRequest(request("worker"), "retry", f.deps)).json()).journal.attempted, 0);
});

test("handoff completion failure retains both queues and never loses or doubles verified payment", async () => {
  const f = fixture(); const commit = f.store.commit.bind(f.store); let fail = true;
  f.store.commit = async value => {
    if (fail && value.writes?.some(row => row.type === "ledgerReferenceDelivery" && row.doc.status === "completed")) { fail = false; throw Error("synthetic-sensitive-handoff-error"); }
    return commit(value);
  };
  const accepted = await handleLedgerWorkerRequest(request("event-reference", { eventReference: "registered-fixture-reference" }), "event-reference", f.deps);
  assert.equal((await accepted.json()).references.deferred, 1); assert.equal(await f.store.countType("commerceLedgerWork"), 1);
  const drain = await f.worker.runDue(); assert.equal(drain.journal.completed, 1); assert.equal(drain.references.attempted, 0);
  f.advance(1000); const retry = await f.worker.runDue(); assert.equal(retry.references.completed, 1);
  assert.equal(await f.store.countType("ledgerJournal"), 1); assert.equal(await f.store.countType("commerceLedgerInbox"), 1);
});

test("unknown reference claims never become money and escalate to retained review after bounded attempts", async () => {
  const f = fixture(); f.failQueries(true);
  const queued = await f.worker.receiveReference("registered-fixture-reference");
  for (const delay of [1000, 2000, 4000, 8000, 16000]) { await f.worker.runDue(); f.advance(delay); }
  assert.equal(f.queries(), 5); assert.equal(await f.store.countType("ledgerJournal"), 0);
  const row = await f.store.get("ledgerReferenceDelivery", queued.deliveryId);
  assert.equal(row.doc.status, "review_required"); assert.equal(row.doc.nextAttemptAt, null); assert.equal(row.doc.reference, "registered-fixture-reference");
  assert.equal((await f.worker.runDue()).references.attempted, 0);
  const replay = await f.worker.receiveReference("registered-fixture-reference"); assert.equal(replay.status, "review_required"); assert.equal(replay.duplicate, true);
  assert.equal(JSON.stringify(row.doc).includes("synthetic-sensitive-provider-secret"), false);
});

test("scope isolation protects references and due deadlines bound each batch without making journal facts", async () => {
  const f = fixture(); const queued = await f.worker.receiveReference("registered-fixture-reference");
  const foreign = createLedgerWorker({ store: f.store, bridge: f.bridge, scope: { ...f.scope, projectId: "foreign" }, now: f.now });
  await assert.rejects(foreign.processDelivery(queued.deliveryId), { code: "ledger_reference_scope_mismatch" });
  assert.equal((await f.store.get("ledgerReferenceDelivery", queued.deliveryId)).doc.status, "pending");
  const enqueue = f.bridge.enqueueReference;
  const slowBridge = { ...f.bridge, enqueueReference: async ref => { const result = await enqueue(ref); f.advance(1000); return result; } };
  const limited = createLedgerWorker({ store: f.store, bridge: slowBridge, scope: f.scope, now: f.now });
  const result = await limited.runDue({ budgetMs: 1000 }); assert.equal(result.budgetExhausted, true); assert.equal(result.references.completed, 1); assert.equal(result.journal.attempted, 0);
  assert.equal(await f.store.countType("ledgerJournal"), 0); assert.equal((await f.worker.runDue()).journal.completed, 1);
});

test("more than a batch of failing references back off before a newer valid reference", async () => {
  const f = fixture();
  for (let index = 0; index < 6; index++) { await f.worker.receiveReference(`bad-${index}`); f.advance(1); }
  await f.worker.receiveReference("registered-fixture-reference");
  for (let index = 0; index < 3; index++) {
    const run = await f.worker.runDue({ deliveryLimit: 2 }); assert.equal(run.references.deferred, 2); assert.equal(run.journal.attempted, 0);
  }
  const good = await f.worker.runDue({ deliveryLimit: 2 }); assert.equal(good.references.completed, 1); assert.equal(good.journal.completed, 1);
  assert.equal((await f.worker.runDue()).references.attempted, 0); assert.equal(f.queries(), 7);
});

test("orphan and foreign-scope index entries are quarantined without changing foreign records", async () => {
  const f = fixture(), due = `ledger-reference:due:${hashPayload(f.scope)}`;
  const missing = `ldv_${"0".repeat(64)}`, foreignId = `ldv_${"1".repeat(64)}`;
  const foreignDoc = { id: foreignId, scopeHash: "foreign", status: "pending", marker: "foreign-evidence-unchanged" };
  await f.store.commit({ writes: [{ type: "ledgerReferenceDelivery", id: foreignId, expectedVersion: -1, doc: foreignDoc }], indexes: [{ name: due, member: missing, score: f.now() - 2 }, { name: due, member: foreignId, score: f.now() - 1 }] });
  await f.worker.receiveReference("registered-fixture-reference");
  const first = await f.worker.runDue({ deliveryLimit: 2 }); assert.equal(first.references.reviewRequired, 2);
  assert.equal(await f.store.countType("ledgerReferenceIndexIssue"), 2); assert.deepEqual((await f.store.get("ledgerReferenceDelivery", foreignId)).doc, foreignDoc);
  assert.equal((await f.worker.runDue({ deliveryLimit: 2 })).journal.completed, 1);
  assert.equal((await f.store.listIndex(due)).length, 0);
});

test("reviewed references require exact server operator approval with persistent one-time requeue", async () => {
  const f = fixture(); f.failQueries(true);
  const queued = await f.worker.receiveReference("registered-fixture-reference");
  const oneAttempt = createLedgerWorker({ store: f.store, bridge: f.bridge, scope: f.scope, now: f.now, maxAttempts: 1 });
  await oneAttempt.runDue();
  const rec = await f.store.get("ledgerReferenceDelivery", queued.deliveryId);
  const approval = { id: "synthetic-operator-case-approval", status: "approved", capability: "ledger:retry", deliveryId: queued.deliveryId, scopeHash: hashPayload(f.scope), fingerprint: rec.doc.fingerprint, actorUserId: CUSTOMER, caseId: "synthetic-reference-review", expiresAt: "2026-10-12T00:00:00.000Z", proof: { method: "authorized_operator", evidenceId: "synthetic-authority-evidence", verifiedAt: AT } };
  await assert.rejects(oneAttempt.requeueReviewedReference("case"), { code: "ledger_reference_operator_retry_unconfigured" });
  let approved = approval;
  const operator = createLedgerWorker({ store: f.store, bridge: f.bridge, scope: f.scope, now: f.now, maxAttempts: 1, resolveAuthorizedReferenceRetry: async () => structuredClone(approved) });
  approved = { ...approval, fingerprint: "e".repeat(64) };
  await assert.rejects(operator.requeueReviewedReference("case"), { code: "ledger_reference_retry_case_mismatch" });
  approved = approval;
  f.store.failNextCommit = "store_unavailable";
  await assert.rejects(operator.requeueReviewedReference("case"), { code: "store_unavailable" });
  assert.equal(await f.store.countType("ledgerReferenceRetryApproval"), 0); assert.equal((await f.store.get("ledgerReferenceDelivery", queued.deliveryId)).doc.status, "review_required");
  const results = await Promise.all([operator.requeueReviewedReference("case"), operator.requeueReviewedReference("case")]);
  assert.equal(results.filter(item => item.duplicate).length, 1); assert.equal(await f.store.countType("ledgerReferenceRetryApproval"), 1);
  await operator.runDue();
  assert.equal((await operator.requeueReviewedReference("case")).duplicate, true);
  assert.equal((await f.store.get("ledgerReferenceDelivery", queued.deliveryId)).doc.attempts, 2);
  assert.equal((await f.store.get("ledgerReferenceDelivery", queued.deliveryId)).doc.status, "review_required");
  assert.equal(await f.store.countType("ledgerJournal"), 0);
  const audit = await f.store.getMany("audit", await f.store.listIndex("audit:all"));
  assert.equal(audit.filter(row => row.doc.action === "ledger.reference_operator_retry").length, 1);
});

test("index quarantine CAS cannot remove a concurrently operator-requeued delivery", async () => {
  const f = fixture(); f.failQueries(true);
  const queued = await f.worker.receiveReference("registered-fixture-reference");
  const one = createLedgerWorker({ store: f.store, bridge: f.bridge, scope: f.scope, now: f.now, maxAttempts: 1 });
  await one.runDue(); const rec = await f.store.get("ledgerReferenceDelivery", queued.deliveryId);
  const approval = { id: "synthetic-concurrent-review-approval", status: "approved", capability: "ledger:retry", deliveryId: queued.deliveryId, scopeHash: hashPayload(f.scope), fingerprint: rec.doc.fingerprint, actorUserId: CUSTOMER, caseId: "synthetic-race-review", expiresAt: "2026-10-12T00:00:00.000Z", proof: { method: "authorized_operator", evidenceId: "synthetic-race-authority", verifiedAt: AT } };
  const operator = createLedgerWorker({ store: f.store, bridge: f.bridge, scope: f.scope, now: f.now, resolveAuthorizedReferenceRetry: async () => approval });
  const due = `ledger-reference:due:${hashPayload(f.scope)}`;
  await f.store.commit({ indexes: [{ name: due, member: queued.deliveryId, score: f.now() - 1 }] });
  const commit = f.store.commit.bind(f.store); let raced = false;
  f.store.commit = async value => {
    if (!raced && value.unindexes?.some(index => index.name === due) && value.writes?.some(row => row.type === "ledgerReferenceDelivery" && row.doc.status === "review_required")) {
      raced = true; await operator.requeueReviewedReference("approved-case");
    }
    return commit(value);
  };
  const run = await f.worker.runDue(); assert.equal(run.references.deferred, 1); assert.equal(raced, true);
  assert.deepEqual(await f.store.listIndex(due), [queued.deliveryId]);
  assert.equal((await f.store.get("ledgerReferenceDelivery", queued.deliveryId)).doc.status, "pending");
  f.failQueries(false); assert.equal((await f.worker.runDue()).journal.completed, 1);
});

test("atomic absence guard cannot remove a concurrently newly received reference", async () => {
  const f = fixture(), ref = "registered-fixture-reference", id = `ldv_${hashPayload({ scope: f.scope, reference: ref })}`, due = `ledger-reference:due:${hashPayload(f.scope)}`;
  await f.store.commit({ indexes: [{ name: due, member: id, score: f.now() - 1 }] });
  const commit = f.store.commit.bind(f.store); let raced = false;
  f.store.commit = async value => {
    if (!raced && value.writes?.some(row => row.type === "ledgerReferenceDelivery" && row.doc.absenceGuard === true)) {
      raced = true; await f.worker.receiveReference(ref);
    }
    return commit(value);
  };
  assert.equal((await f.worker.runDue()).references.deferred, 1); assert.equal(raced, true);
  assert.deepEqual(await f.store.listIndex(due), [id]);
  assert.equal((await f.worker.runDue()).journal.completed, 1);
});

test("shared deadline includes runtime setup and stops a stalled store body before native queries", async () => {
  const f = fixture(); let signal, nativeQueries = 0;
  const ping = f.store.ping;
  f.store.ping = () => new Promise(() => {});
  const r = await handleLedgerWorkerRequest(request("event-reference", { eventReference: "registered-fixture-reference" }), "event-reference", { ...f.deps, requestTimeoutMs: 20, runtimeFactory: async args => { signal = args.signal; await args.store.ping(); nativeQueries++; return f.deps.runtimeFactory(args); } });
  assert.equal(r.status, 503); assert.equal(signal.aborted, true); assert.equal(nativeQueries, 0);
  assert.equal(await f.store.countType("ledgerReferenceDelivery"), 0); f.store.ping = ping;
  const lateSetup = await handleLedgerWorkerRequest(request("worker"), "retry", { ...f.deps, runtimeFactory: async args => { f.advance(44100); return f.deps.runtimeFactory(args); } });
  assert.equal(lateSetup.status, 503); assert.equal(f.queries(), 0);
});

test("slow native verification after deadline cannot start later store/journal stages; lease recovers", async () => {
  const f = fixture(); let release, stopped, lateReads = 0, postings = 0;
  const hold = new Promise(resolve => { release = resolve; });
  const verificationStopped = new Promise(resolve => { stopped = resolve; });
  const originalGet = f.store.get.bind(f.store);
  f.store.get = async (type, id) => { if (type === "syntheticNativeLateEvidence") lateReads++; return originalGet(type, id); };
  const runtimeFactory = async args => ({ readiness: f.readiness, bridge: {
    enqueueReference: async () => { try { await hold; await args.store.get("syntheticNativeLateEvidence", "fixture"); assert.fail("deadline must stop verification pipeline"); } finally { stopped(); } },
    processWork: async () => { postings++; assert.fail("deadline must stop journal pipeline"); }, retryPending: async () => ({ items: [] }),
  } });
  const r = await handleLedgerWorkerRequest(request("event-reference", { eventReference: "registered-fixture-reference" }), "event-reference", { ...f.deps, runtimeFactory, requestTimeoutMs: 50 });
  assert.equal(r.status, 503); release(); await verificationStopped;
  assert.equal(lateReads, 0); assert.equal(postings, 0); assert.equal(await f.store.countType("ledgerJournal"), 0);
  f.advance(61000); const next = await handleLedgerWorkerRequest(request("worker"), "retry", f.deps);
  const result = await next.json(); assert.equal(result.references.completed, 1); assert.equal(result.journal.completed, 1);
  assert.equal(await f.store.countType("ledgerJournal"), 1);
});

test("scheduled discovery queues only an opaque reference before independent verification and replay dedups", async () => {
  const f = fixture(); let polls = 0;
  const runtimeFactory = async args => ({ ...await f.deps.runtimeFactory(args), poller: { pollOnce: async options => {
    polls++; assert.equal(options.limit, 1); assert.equal(options.deadlineAt, f.now() + 45000); assert.equal(options.signal, args.signal);
    assert.equal(f.queries(), polls === 1 ? 0 : 1);
    await options.enqueueReference("registered-fixture-reference");
    assert.equal(await f.store.countType("ledgerReferenceDelivery"), 1);
    assert.equal(await f.store.countType("ledgerJournal"), polls === 1 ? 0 : 1);
    return { bindingsChecked: 1, movementsDiscovered: 1, referencesQueued: 1, deferred: 0, reviewRequired: 0, customerId: CUSTOMER, proof: "private-native-proof", reference: "registered-fixture-reference" };
  } } });
  for (let index = 0; index < 2; index++) {
    const r = await handleLedgerWorkerRequest(request("worker"), "retry", { ...f.deps, runtimeFactory });
    assert.equal(r.status, 200); const body = await r.json();
    assert.deepEqual(body.discovery, { bindingsChecked: 1, movementsDiscovered: 1, referencesQueued: 1, deferred: 0, reviewRequired: 0 });
    assert.equal(body.journal.completed, index === 0 ? 1 : 0);
    const text = JSON.stringify(body);
    for (const forbidden of [CUSTOMER, "proof", "private-native", "registered-fixture-reference", "ldv_", "clw_"]) assert.equal(text.includes(forbidden), false);
  }
  assert.equal(polls, 2); assert.equal(f.queries(), 1); assert.equal(await f.store.countType("ledgerJournal"), 1);
});

test("discovery outage retains queued references and drains them without exposing the source error", async () => {
  const f = fixture();
  const runtimeFactory = async args => ({ ...await f.deps.runtimeFactory(args), poller: { pollOnce: async options => {
    await options.enqueueReference("registered-fixture-reference");
    throw Error("synthetic-private-provider-proof card customer-account");
  } } });
  const r = await handleLedgerWorkerRequest(request("worker"), "retry", { ...f.deps, runtimeFactory });
  assert.equal(r.status, 200); const body = await r.json();
  assert.deepEqual(body.discovery, { bindingsChecked: 0, movementsDiscovered: 0, referencesQueued: 1, deferred: 1, reviewRequired: 0 });
  assert.equal(body.references.completed, 1); assert.equal(body.journal.completed, 1);
  assert.equal(JSON.stringify(body).includes("synthetic-private"), false); assert.equal(await f.store.countType("ledgerJournal"), 1);
});

test("event POST never invokes discovery and poller cannot enqueue a monetary or ownership object", async () => {
  const f = fixture(); let polls = 0;
  const runtimeFactory = async args => ({ ...await f.deps.runtimeFactory(args), poller: { pollOnce: async options => {
    polls++;
    await assert.rejects(options.enqueueReference({ eventReference: "registered-fixture-reference", customerId: CUSTOMER, paid: true, amountMinor: "12345" }), { code: "invalid_event_reference" });
    return { bindingsChecked: 1, movementsDiscovered: 1, referencesQueued: 0, deferred: 1, reviewRequired: 0 };
  } } });
  const cron = await handleLedgerWorkerRequest(request("worker"), "retry", { ...f.deps, runtimeFactory });
  assert.equal(cron.status, 200); assert.equal(polls, 1); assert.equal(await f.store.countType("ledgerReferenceDelivery"), 0); assert.equal(f.queries(), 0);
  const event = await handleLedgerWorkerRequest(request("event-reference", { eventReference: "registered-fixture-reference" }), "event-reference", { ...f.deps, runtimeFactory });
  assert.equal(event.status, 202); assert.equal(polls, 1); assert.equal((await event.json()).journal.completed, 1);
});

test("late discovery after the HTTP deadline cannot enqueue or start native/journal work", async () => {
  const f = fixture(); let release, stopped, lateReads = 0;
  const hold = new Promise(resolve => { release = resolve; });
  const pollStopped = new Promise(resolve => { stopped = resolve; });
  const originalGet = f.store.get.bind(f.store);
  f.store.get = async (...args) => { if (args[0] === "ledgerReferenceDelivery") lateReads++; return originalGet(...args); };
  const runtimeFactory = async args => ({ ...await f.deps.runtimeFactory(args), poller: { pollOnce: async options => {
    try { await hold; await options.enqueueReference("registered-fixture-reference"); assert.fail("expired discovery cannot enqueue"); }
    finally { assert.equal(options.signal.aborted, true); stopped(); }
  } } });
  const r = await handleLedgerWorkerRequest(request("worker"), "retry", { ...f.deps, runtimeFactory, requestTimeoutMs: 1000 });
  assert.equal(r.status, 503); release(); await pollStopped;
  assert.equal(lateReads, 0); assert.equal(f.queries(), 0); assert.equal(await f.store.countType("ledgerReferenceDelivery"), 0); assert.equal(await f.store.countType("ledgerJournal"), 0);
});

test("a repeatedly stalled discovery source cannot starve already durable journal recovery", async () => {
  const f = fixture();
  const queued = await f.worker.receiveReference("registered-fixture-reference");
  await f.worker.processDelivery(queued.deliveryId);
  assert.equal(await f.store.countType("ledgerJournal"), 0);
  let release, stopped;
  const hold = new Promise(resolve => { release = resolve; });
  const pollStopped = new Promise(resolve => { stopped = resolve; });
  const runtimeFactory = async args => ({ ...await f.deps.runtimeFactory(args), poller: { pollOnce: async () => {
    assert.equal(await f.store.countType("ledgerJournal"), 1, "durable economic work drains before the source can stall");
    try { await hold; return { bindingsChecked: 0, movementsDiscovered: 0, referencesQueued: 0, deferred: 1, reviewRequired: 0 }; }
    finally { stopped(); }
  } } });
  const r = await handleLedgerWorkerRequest(request("worker"), "retry", { ...f.deps, runtimeFactory, requestTimeoutMs: 1000 });
  assert.equal(r.status, 503); release(); await pollStopped;
  assert.equal(await f.store.countType("ledgerJournal"), 1); assert.equal(f.queries(), 1);
  const next = await handleLedgerWorkerRequest(request("worker"), "retry", f.deps);
  assert.equal(next.status, 200); assert.equal((await next.json()).journal.attempted, 0); assert.equal(await f.store.countType("ledgerJournal"), 1);
});

test("pre-discovery and post-discovery drains share the original two-reference batch limit", async () => {
  const f = fixture();
  for (let index = 0; index < 5; index++) { await f.worker.receiveReference(`registered-fixture-reference-${index}`); f.advance(1); }
  const runtimeFactory = async args => ({ ...await f.deps.runtimeFactory(args), poller: { pollOnce: async () => ({ bindingsChecked: 0, movementsDiscovered: 0, referencesQueued: 0, deferred: 0, reviewRequired: 0 }) } });
  const first = await handleLedgerWorkerRequest(request("worker"), "retry", { ...f.deps, runtimeFactory });
  assert.equal(first.status, 200); const body = await first.json();
  assert.equal(body.references.attempted, 2); assert.equal(body.references.completed, 2); assert.ok(body.journal.attempted <= 4);
  assert.equal(f.queries(), 2);
  const rows = await f.store.listIndex(`ledger-reference:due:${hashPayload(f.scope)}`); assert.equal(rows.length, 3);
  assert.equal(await f.store.countType("ledgerJournal"), 1, "distinct source aliases do not duplicate the actual economic movement");
});

test("twenty same-time movements with hash-sorted-last capture recover refunds without consuming the ordinary failure budget", async () => {
  const movements = new Map(), f = fixture({ movements });
  const references = Array.from({ length: 20 }, (_, index) => `registered-chronology-reference-${index}`)
    .sort((a, b) => hashPayload({ scope: f.scope, reference: a }).localeCompare(hashPayload({ scope: f.scope, reference: b })));
  for (let index = 0; index < references.length; index++) {
    const kind = index === references.length - 1 ? "capture" : "refund";
    movements.set(references[index], { ...structuredClone(f.event), kind, amountMinor: kind === "capture" ? "12345" : "100",
      eventId: `synthetic-chronology-event-${index}`, transactionId: `synthetic-chronology-transaction-${index}`,
      proof: { ...f.event.proof, movement: kind } });
    await f.worker.receiveReference(references[index]);
  }
  const due = await f.store.listIndex(`ledger-reference:due:${hashPayload(f.scope)}`, { reverse: false, limit: 20 });
  assert.equal(due.at(-1), `ldv_${hashPayload({ scope: f.scope, reference: references.at(-1) })}`, "the capture is last in the actual same-score index");
  const runtimeFactory = async args => ({ ...await f.deps.runtimeFactory(args), poller: { pollOnce: async () => ({ bindingsChecked: 0, movementsDiscovered: 0, referencesQueued: 0, deferred: 0, reviewRequired: 0 }) } });
  for (let day = 0; day < 30; day++) {
    const r = await handleLedgerWorkerRequest(request("worker"), "retry", { ...f.deps, runtimeFactory });
    assert.equal(r.status, 200); const body = await r.json();
    assert.ok(body.references.attempted <= 2); assert.ok(body.journal.attempted <= 4);
    assert.equal(body.journal.reviewRequired, 0, "a missing prerequisite must not exhaust the normal five-error budget");
    f.advance(86400000);
  }
  const deliveries = await f.store.getMany("ledgerReferenceDelivery", references.map(reference => `ldv_${hashPayload({ scope: f.scope, reference })}`));
  const work = await f.store.getMany("commerceLedgerWork", deliveries.map(row => row.doc.bridgeWorkId));
  assert.equal(work.length, 20); assert.ok(work.every(row => row.doc.status === "completed"));
  assert.ok(work.some(row => row.doc.captureDependencyAttempts > 5), "the regression exercised more than five prerequisite waits");
  assert.equal(await f.store.countType("ledgerJournal"), 20);
  const payment = await f.store.get("ledgerPayment", `lpy_${hashPayload([f.event.source, f.event.merchantId, f.event.paymentId])}`);
  assert.equal(payment.doc.capturedMinor, "12345"); assert.equal(payment.doc.refundedMinor, "1900"); assert.equal(payment.doc.remainingMinor, "10445");
  assert.equal(await f.store.countType("ledgerProgram"), 0);
});

test("source scheduler preserves existing lead cron and targets authenticated disabled-safe worker", async () => {
  const config = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.equal(config.framework, "nextjs");
  assert.ok(config.crons.some(row => row.path === "/api/leads/retry" && row.schedule === "0 6 * * *"));
  assert.equal(config.crons.filter(row => row.path === "/api/ledger/worker").length, 1);
  const { GET } = await import("../app/api/ledger/worker/route.js");
  const { POST } = await import("../app/api/ledger/event-reference/route.js");
  assert.equal(typeof GET, "function"); assert.equal(typeof POST, "function");
});

test("native Redis preserves concurrent opaque references through provider/handoff/journal failures", async t => {
  const port = 6396, token = "synthetic-ledger-worker-local-only"; let redis, rest, conn;
  try {
    try { redis = await startTestRedis(port, { timeoutMs: 5000 }); conn = new RedisConn(port); await conn.ready; rest = await startBridge({ redisPort: port, token }); }
    catch (error) { if (process.env.INTAKE_REQUIRE_REDIS === "1" || !["ENOENT", "EACCES", "EPERM"].includes(error.code)) throw error; return t.skip(`native Redis unavailable: ${error.code}`); }
    const store = createUpstashStore({ url: rest.url, token }), f = fixture({ store });
    f.failQueries(true);
    const results = await Promise.all(Array.from({ length: 8 }, () => handleLedgerWorkerRequest(request("event-reference", { eventReference: "registered-fixture-reference" }), "event-reference", f.deps)));
    assert.ok(results.every(result => result.status === 202)); assert.equal(f.queries(), 1);
    assert.equal((await f.worker.runDue()).references.attempted, 0);
    const commit = store.commit.bind(store); let failDelivery = true, failJournalCompletion = true;
    store.commit = async value => {
      if (failDelivery && value.writes?.some(row => row.type === "ledgerReferenceDelivery" && row.doc.status === "completed")) { failDelivery = false; throw Error("synthetic handoff interruption"); }
      if (failJournalCompletion && value.writes?.some(row => row.type === "commerceLedgerWork" && row.doc.status === "completed")) { failJournalCompletion = false; throw Error("synthetic journal acknowledgement interruption"); }
      return commit(value);
    };
    f.failQueries(false); f.advance(1000);
    const first = await f.worker.runDue(); assert.equal(first.references.deferred, 1); assert.equal(first.journal.deferred, 1);
    assert.equal((await f.worker.runDue()).references.attempted, 0);
    f.advance(2000); // Second reference failure backs off for 2s; journal retry is due after 1s.
    const rebuilt = createLedgerWorker({ store, bridge: f.bridge, scope: f.scope, now: f.now });
    const recovered = await rebuilt.runDue(); assert.equal(recovered.references.completed, 1); assert.equal(recovered.journal.completed, 1);
    const command = async (...args) => { const value = await conn.send(args); if (value?.__error) throw Error(value.__error); return value; };
    for (const type of ["ledgerReferenceDelivery", "commerceLedgerWork", "commerceLedgerInbox", "ledgerJournal", "ledgerPayment"]) assert.equal((await command("KEYS", `mxp:doc:${type}:*`)).length, 1);
    assert.equal((await rebuilt.runDue()).journal.attempted, 0);
    const orphan = `ldv_${"0".repeat(64)}`, due = `ledger-reference:due:${hashPayload(f.scope)}`;
    await store.commit({ indexes: [{ name: due, member: orphan, score: f.now() - 1 }] });
    assert.equal((await rebuilt.runDue()).references.reviewRequired, 1);
    assert.equal(await store.get("ledgerReferenceDelivery", orphan), null, "atomic absence guard leaves no placeholder in Redis");
    assert.deepEqual(await store.listIndex(due), []);
  } finally { rest?.close(); conn?.close(); await redis?.close(); }
});
