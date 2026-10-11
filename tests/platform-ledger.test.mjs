/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryStore } from "../lib/platform/store.js";
import { createLedgerService } from "../lib/platform/ledger.js";

const START = "2026-01-01T00:00:00.000Z";
const END = "2027-01-01T00:00:00.000Z";
const ctx = { userId: "customer-one", verified: true };
const admin = { userId: "test-operator", admin: true, verified: true };

function fixture({ rulesEnabled = true, rulesOverrides = {}, now = Date.parse(END) } = {}) {
  const store = createMemoryStore();
  const events = new Map(), operations = new Map(), orders = new Map();
  const rules = {
    id: "synthetic-program", version: "approved-test-v1", status: "approved", projectId: "tennis",
    merchantId: "test-existing-merchant", currency: "AED", legalApprovalId: "synthetic-legal-evidence",
    merchantEligibilityApprovalId: "synthetic-merchant-evidence", agreementVersion: "synthetic-agreement-v1",
    approvedByUserId: "synthetic-approver", durationDays: 365, rateBps: 1200,
    accrualConvention: "actual_365_simple_half_up_minor_v1", reversalPolicy: "freeze_bonus_and_review",
    allowedSources: ["cscart", "verified_bank"], allowAdvance: true, advanceBps: 500,
    advanceAccrualTreatment: "offset_future_accrual", allowProductRedemption: true,
    allowExpiry: true, expiryPolicy: "approved_operation_after_maturity", releasePolicy: "on_accrual",
    allowPrincipalPayout: true, payoutBonusTreatment: "freeze_unearned_bonus", ...rulesOverrides,
  };
  const dependencies = {
    store, now: () => now,
    resolveVerifiedEvent: async ref => structuredClone(events.get(ref)),
    resolveAuthorizedOperation: async ref => structuredClone(operations.get(ref)),
    loadOrder: async id => structuredClone(orders.get(id)),
    authorizeRead: async ({ ctx: actor, customerId, action }) => actor?.verified === true && (action.startsWith("admin_") ? actor.admin === true : actor.admin === true || actor.userId === customerId),
    resolveApprovedRules: async () => rulesEnabled ? structuredClone(rules) : null,
  };
  const ledger = createLedgerService(dependencies);
  function order(id = "order-one", extra = {}) {
    const value = { id, revisionId: `${id}-revision-1`, customerId: "customer-one", projectId: "tennis", merchantId: "test-existing-merchant", currency: "AED", totalMinor: "10000", kind: "goods", status: "approved", ...extra };
    orders.set(id, value); return value;
  }
  function event(ref, extra = {}) {
    const value = { source: "cscart", eventId: `event-${ref}`, transactionId: `transaction-${ref}`, paymentId: "payment-one", orderId: "order-one", customerId: "customer-one", projectId: "tennis", merchantId: "test-existing-merchant", currency: "AED", kind: "capture", amountMinor: "10000", occurredAt: START, proof: { method: "provider_server_query", evidenceId: `verified-evidence-${ref}`, verifiedAt: END }, ...extra };
    events.set(ref, value); return value;
  }
  async function fund({ principalMinor = "1000000" } = {}) {
    order("order-one", { kind: "funding", totalMinor: principalMinor, principalMinor, programId: rules.id, programVersion: rules.version, agreementId: "synthetic-client-agreement" });
    event("fund", { amountMinor: principalMinor });
    const result = await ledger.postVerifiedEvent("fund");
    return (await store.get("ledgerPosition", (await store.get("ledgerJournal", result.journalId)).doc.programPositionId)).doc;
  }
  async function operation(ref, kind, amountMinor, extra = {}) {
    const journals = await ledger.readClientJournal({ ctx, projectId: "tennis", customerId: "customer-one" });
    const capture = journals.items.find(entry => entry.kind === "capture");
    const position = (await store.get("ledgerPosition", capture.programPositionId)).doc;
    const value = { source: "approved_policy", eventId: `policy-event-${ref}`, transactionId: `policy-transaction-${ref}`, paymentId: "payment-one", orderId: "order-one", customerId: "customer-one", projectId: "tennis", merchantId: "test-existing-merchant", currency: "AED", kind, amountMinor, occurredAt: END, proof: { method: "approved_policy_operation", evidenceId: `approved-policy-${ref}`, verifiedAt: END }, positionId: position.id, rulesHash: position.rulesSnapshot.hash, policyOperationId: `policy-case-${ref}`, ...extra };
    operations.set(ref, value); return value;
  }
  const client = () => ledger.readClientSummary({ ctx, projectId: "tennis", customerId: "customer-one" });
  return { store, ledger, dependencies, events, operations, orders, rules, order, event, fund, operation, client };
}

test("ledger requires trusted adapters and rejects browser verification claims", async () => {
  const f = fixture(); f.order();
  assert.throws(() => createLedgerService({ store: f.store }), /trusted ledger adapters required/);
  await assert.rejects(f.ledger.postVerifiedEvent({ verified: true, amountMinor: "10000" }), { code: "ledger_invalid_eventReference" });
  f.event("fake", { proof: { method: "browser_redirect", evidenceId: "fake", verifiedAt: END }, verified: true });
  await assert.rejects(f.ledger.postVerifiedEvent("fake"), { code: "ledger_event_not_verified" });
  assert.equal(await f.store.countType("ledgerJournal"), 0);
});

test("capture binds customer/project/merchant/currency/amount to immutable order", async () => {
  for (const [field, value, code] of [
    ["customerId", "other", "ledger_customerId_mismatch"], ["projectId", "baby", "ledger_projectId_mismatch"],
    ["merchantId", "other", "ledger_merchantId_mismatch"], ["currency", "USD", "ledger_currency_mismatch"],
    ["amountMinor", "9999", "ledger_capture_total_mismatch"],
  ]) {
    const f = fixture(); f.order(); f.event("capture", { [field]: value });
    await assert.rejects(f.ledger.postVerifiedEvent("capture"), { code });
    assert.equal(await f.store.countType("ledgerJournal"), 0);
  }
});

test("parallel deliveries and process reconstruction persist exactly one capture", async () => {
  const f = fixture(); f.order(); f.event("capture");
  const results = await Promise.all(Array.from({ length: 10 }, () => f.ledger.postVerifiedEvent("capture")));
  assert.equal(results.filter(result => !result.duplicate).length, 1);
  const secondProcess = createLedgerService(f.dependencies);
  assert.equal((await secondProcess.postVerifiedEvent("capture")).duplicate, true);
  const summary = await f.client();
  assert.equal(summary.currencies[0].capturedMinor, "10000");
  assert.equal(summary.currencies[0].capturedPaymentCount, 1);
  assert.equal(summary.currencies[0].bankBalanceMinor, null);
  assert.equal(await f.store.countType("ledgerJournal"), 1);
  assert.deepEqual(await f.ledger.verifyClientJournal({ ctx, projectId: "tennis", customerId: "customer-one" }), { verified: true, accounts: 1, checkedEntries: 1 });
});

test("economic transaction dedup survives new event IDs and rejects conflicting payloads", async () => {
  const f = fixture(); f.order(); const original = f.event("one");
  await f.ledger.postVerifiedEvent("one");
  f.events.set("alias", { ...original, eventId: "different-event", proof: { ...original.proof, evidenceId: "new-query-evidence" } });
  assert.equal((await f.ledger.postVerifiedEvent("alias")).duplicate, true);
  assert.equal(await f.store.countType("ledgerJournal"), 1);
  f.events.set("conflict", { ...original, eventId: "conflicting-event", kind: "refund", amountMinor: "1" });
  await assert.rejects(f.ledger.postVerifiedEvent("conflict"), { code: "ledger_transaction_conflict" });
});

test("store failure leaves journal, receipts, projections and financial position untouched", async () => {
  const f = fixture(); f.store.failNextCommit = "store_unavailable";
  await assert.rejects(f.fund(), { code: "store_unavailable" });
  for (const type of ["ledgerJournal", "ledgerEvent", "ledgerPayment", "ledgerAccount", "ledgerAggregate", "ledgerPosition"]) assert.equal(await f.store.countType(type), 0);
  await f.ledger.postVerifiedEvent("fund");
  assert.equal(await f.store.countType("ledgerPosition"), 1);
});

test("partial refunds and chargebacks are bounded and do not overwrite capture", async () => {
  const f = fixture(); f.order(); f.event("capture");
  const capture = await f.ledger.postVerifiedEvent("capture");
  const before = (await f.store.get("ledgerJournal", capture.journalId));
  f.event("refund", { kind: "refund", amountMinor: "3000" });
  await Promise.all(Array.from({ length: 5 }, () => f.ledger.postVerifiedEvent("refund")));
  f.event("chargeback", { kind: "chargeback", amountMinor: "7000" });
  await f.ledger.postVerifiedEvent("chargeback");
  const row = (await f.client()).currencies[0];
  assert.equal(row.refundedMinor, "3000"); assert.equal(row.chargebackMinor, "7000"); assert.equal(row.goodsPaidMinor, "0");
  assert.deepEqual(await f.store.get("ledgerJournal", capture.journalId), before);
  f.event("too-much", { kind: "refund", amountMinor: "1" });
  await assert.rejects(f.ledger.postVerifiedEvent("too-much"), { code: "ledger_reversal_exceeds_capture" });
  assert.equal((await f.ledger.verifyClientJournal({ ctx, projectId: "tennis", customerId: "customer-one" })).checkedEntries, 3);
});

test("different payment IDs cannot capture one approved order twice", async () => {
  const f = fixture(); f.order(); f.event("first"); f.event("second", { paymentId: "payment-two" });
  const results = await Promise.allSettled([f.ledger.postVerifiedEvent("first"), f.ledger.postVerifiedEvent("second")]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal((await f.client()).currencies[0].capturedMinor, "10000");
});

test("read authorization prevents foreign customer and client-to-admin access", async () => {
  const f = fixture(); f.order(); f.event("capture"); await f.ledger.postVerifiedEvent("capture");
  for (const method of ["readClientSummary", "readClientJournal", "verifyClientJournal"]) await assert.rejects(f.ledger[method]({ ctx: { userId: "other", verified: true }, projectId: "tennis", customerId: "customer-one" }), { code: "ledger_read_forbidden" });
  await assert.rejects(f.ledger.readAdminSummary({ ctx, projectId: "tennis" }), { code: "ledger_read_forbidden" });
  assert.equal((await f.ledger.readAdminClients({ ctx: admin, projectId: "tennis" })).items[0].customerId, "customer-one");
});

test("currency and project projections remain separate without invented FX or bank balance", async () => {
  const f = fixture(); f.order(); f.event("aed"); await f.ledger.postVerifiedEvent("aed");
  f.order("usd-order", { currency: "USD", totalMinor: "5000" });
  f.event("usd", { orderId: "usd-order", paymentId: "usd-payment", currency: "USD", amountMinor: "5000" }); await f.ledger.postVerifiedEvent("usd");
  f.order("baby-order", { projectId: "baby", totalMinor: "3000" });
  f.event("baby", { orderId: "baby-order", paymentId: "baby-payment", projectId: "baby", amountMinor: "3000" }); await f.ledger.postVerifiedEvent("baby");
  const rows = (await f.ledger.readAdminSummary({ ctx: admin, projectId: "tennis" })).currencies;
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(row => [row.currency, row.capturedMinor]).sort(), [["AED", "10000"], ["USD", "5000"]]);
  assert.ok(rows.every(row => row.bankBalanceMinor === null));
});

test("funding fails closed without approved legal, merchant and program rules", async () => {
  for (const options of [{ rulesEnabled: false }, { rulesOverrides: { status: "proposed" } }, { rulesOverrides: { merchantEligibilityApprovalId: null } }, { rulesOverrides: { projectId: "wrong-project" } }]) {
    const f = fixture(options);
    await assert.rejects(f.fund(), { code: "ledger_approved_rules_required" });
    assert.equal(await f.store.countType("ledgerJournal"), 0);
    assert.equal((await f.ledger.inspectFinancialReadiness({ ctx, projectId: "tennis", customerId: "customer-one" })).enabled, false);
  }
});

test("approved synthetic funding records returnable liability separately from goods", async () => {
  const f = fixture(); const position = await f.fund();
  const row = (await f.client()).currencies[0];
  assert.equal(row.goodsPaidMinor, "0"); assert.equal(row.capturedMinor, "1000000");
  assert.equal(row.myDeposit.returnablePrincipalMinor, "1000000");
  assert.equal(row.myDeposit.programs[0].rateBps, 1200); assert.equal(row.myDeposit.programs[0].durationDays, 365);
  assert.equal(row.myBonus.availableMinor, "0"); assert.equal(position.rulesSnapshot.status, "approved");
});

test("advance offsets approved accrual, release and product redemption with persistent replay safety", async () => {
  const f = fixture(); await f.fund();
  await f.operation("advance", "bonus_advance", "50000"); await f.ledger.postProgramOperation("advance");
  await f.operation("accrue", "bonus_accrue", "70000", { periodStart: START, periodEnd: END }); await f.ledger.postProgramOperation("accrue");
  await f.operation("release", "bonus_release", "70000"); await f.ledger.postProgramOperation("release");
  f.order("bonus-goods", { totalMinor: "0", bonusMinor: "60000" });
  await f.operation("redeem", "bonus_redeem", "60000", { goodsOrderId: "bonus-goods" });
  await Promise.all(Array.from({ length: 8 }, () => f.ledger.postProgramOperation("redeem")));
  const row = (await f.client()).currencies[0];
  assert.equal(row.myBonus.advanceMinor, "50000"); assert.equal(row.myBonus.accruedMinor, "0");
  assert.equal(row.myBonus.availableMinor, "60000"); assert.equal(row.myBonus.redeemedMinor, "60000");
  assert.equal(row.myDeposit.returnablePrincipalMinor, "1000000"); assert.equal(row.goodsPaidMinor, "60000");
  assert.equal((await f.ledger.verifyClientJournal({ ctx, projectId: "tennis", customerId: "customer-one" })).checkedEntries, 5);
});

test("cumulative accrual rounding cannot create cents by splitting a period", async () => {
  const split = fixture(), whole = fixture();
  await split.fund({ principalMinor: "33333" }); await whole.fund({ principalMinor: "33333" });
  const middle = "2026-07-01T00:00:00.000Z";
  const elapsed = BigInt(Date.parse(middle) - Date.parse(START));
  const denominator = 10000n * 365n * 86400000n;
  const numerator = 33333n * 1200n * elapsed;
  const first = numerator / denominator + (numerator % denominator * 2n >= denominator ? 1n : 0n);
  await split.operation("part-one", "bonus_accrue", first.toString(), { periodStart: START, periodEnd: middle }); await split.ledger.postProgramOperation("part-one");
  await split.operation("part-two", "bonus_accrue", (4000n - first).toString(), { periodStart: middle, periodEnd: END }); await split.ledger.postProgramOperation("part-two");
  await whole.operation("whole", "bonus_accrue", "4000", { periodStart: START, periodEnd: END }); await whole.ledger.postProgramOperation("whole");
  assert.equal((await split.client()).currencies[0].myBonus.accruedMinor, (await whole.client()).currencies[0].myBonus.accruedMinor);
});

test("incorrect rate result, overlapping period and unapproved rate change are rejected", async () => {
  const f = fixture(); await f.fund();
  await f.operation("wrong", "bonus_accrue", "200000", { periodStart: START, periodEnd: END });
  await assert.rejects(f.ledger.postProgramOperation("wrong"), { code: "ledger_accrual_amount_mismatch" });
  await f.operation("good", "bonus_accrue", "120000", { periodStart: START, periodEnd: END }); await f.ledger.postProgramOperation("good");
  await f.operation("overlap", "bonus_accrue", "120000", { periodStart: START, periodEnd: END });
  await assert.rejects(f.ledger.postProgramOperation("overlap"), { code: "ledger_accrual_period_invalid" });
  f.rules.rateBps = 2000;
  await f.operation("changed", "bonus_release", "1");
  await assert.rejects(f.ledger.postProgramOperation("changed"), { code: "ledger_program_rules_changed" });
});

test("principal chargeback freezes bonuses once and blocks subsequent rewards", async () => {
  const f = fixture(); await f.fund();
  await f.operation("advance", "bonus_advance", "50000"); await f.ledger.postProgramOperation("advance");
  const chargeback = f.event("chargeback", { kind: "chargeback", amountMinor: "1000000" });
  await f.ledger.postVerifiedEvent("chargeback");
  f.events.set("redelivery", { ...chargeback, eventId: "new-event-same-chargeback" }); await f.ledger.postVerifiedEvent("redelivery");
  const row = (await f.client()).currencies[0];
  assert.equal(row.myDeposit.returnablePrincipalMinor, "0"); assert.equal(row.myDeposit.principalReversedMinor, "1000000");
  assert.equal(row.myBonus.availableMinor, "0"); assert.equal(row.myBonus.frozenMinor, "50000");
  assert.equal(row.myDeposit.programs[0].status, "reversal_review");
  await f.operation("more", "bonus_advance", "50000");
  await assert.rejects(f.ledger.postProgramOperation("more"), { code: "ledger_program_frozen" });
});

test("mixed-order partial reversal requires explicit verified allocation", async () => {
  const f = fixture(); f.order("order-one", { kind: "goods_and_funding", totalMinor: "1010000", principalMinor: "1000000", programId: f.rules.id, programVersion: f.rules.version, agreementId: "synthetic-agreement" });
  f.event("capture", { amountMinor: "1010000" }); await f.ledger.postVerifiedEvent("capture");
  f.event("ambiguous", { kind: "refund", amountMinor: "5000" });
  await assert.rejects(f.ledger.postVerifiedEvent("ambiguous"), { code: "ledger_partial_reversal_allocation_required" });
  f.event("goods-refund", { kind: "refund", amountMinor: "5000", allocations: { goodsMinor: "5000", principalMinor: "0" } }); await f.ledger.postVerifiedEvent("goods-refund");
  assert.equal((await f.client()).currencies[0].goodsPaidMinor, "5000");
  assert.equal((await f.client()).currencies[0].myDeposit.returnablePrincipalMinor, "1000000");
});

test("verified principal payout reduces obligation without spending or duplicating bonus", async () => {
  const f = fixture(); await f.fund();
  await f.operation("accrue", "bonus_accrue", "120000", { periodStart: START, periodEnd: END }); await f.ledger.postProgramOperation("accrue");
  const payout = await f.operation("payout", "principal_payout", "1000000", { source: "verified_bank", proof: { method: "provider_server_query", evidenceId: "synthetic-bank-transfer-confirmation", verifiedAt: END } });
  await f.ledger.postProgramOperation("payout");
  f.operations.set("payout-alias", { ...payout, eventId: "new-event-same-payout" });
  assert.equal((await f.ledger.postProgramOperation("payout-alias")).duplicate, true);
  const row = (await f.client()).currencies[0];
  assert.equal(row.myDeposit.principalReturnedMinor, "1000000"); assert.equal(row.myDeposit.returnablePrincipalMinor, "0");
  assert.equal(row.myBonus.accruedMinor, "120000"); assert.equal(row.bankBalanceMinor, null);
});

test("expiry follows explicit rules; operator correction is an immutable money-free note", async () => {
  const f = fixture(); await f.fund();
  await f.operation("advance", "bonus_advance", "50000"); const advance = await f.ledger.postProgramOperation("advance");
  await f.operation("expire", "bonus_expire", "10000"); await f.ledger.postProgramOperation("expire");
  await f.operation("note", "operator_note", "0", { actorUserId: "test-operator", relatedJournalId: advance.journalId, reason: "Verified correction case: original record retained", proof: { method: "authorized_operator", evidenceId: "approved-case-evidence", verifiedAt: END } });
  await f.ledger.postProgramOperation("note");
  assert.equal((await f.client()).currencies[0].myBonus.expiredMinor, "10000");
  assert.equal((await f.client()).currencies[0].myBonus.availableMinor, "40000");
  assert.equal((await f.ledger.verifyClientJournal({ ctx, projectId: "tennis", customerId: "customer-one" })).checkedEntries, 4);
});

test("journal mutation is detected and returned objects cannot change persisted entries", async () => {
  const f = fixture(); f.order(); f.event("capture"); const result = await f.ledger.postVerifiedEvent("capture");
  const journal = await f.ledger.readClientJournal({ ctx, projectId: "tennis", customerId: "customer-one" });
  journal.items[0].amountMinor = "999999";
  assert.equal((await f.store.get("ledgerJournal", result.journalId)).doc.amountMinor, "10000");
  const prior = await f.store.get("ledgerJournal", result.journalId);
  await f.store.commit({ writes: [{ type: "ledgerJournal", id: result.journalId, expectedVersion: prior.version, doc: { ...prior.doc, amountMinor: "999999" } }] });
  await assert.rejects(f.ledger.verifyClientJournal({ ctx, projectId: "tennis", customerId: "customer-one" }), { code: "ledger_journal_integrity_failed" });
});

test("parallel redemptions cannot overdraw available credit", async () => {
  const f = fixture(); await f.fund();
  await f.operation("advance", "bonus_advance", "50000"); await f.ledger.postProgramOperation("advance");
  for (const id of ["goods-one", "goods-two"]) f.order(id, { totalMinor: "0", bonusMinor: "40000" });
  await f.operation("redeem-one", "bonus_redeem", "40000", { goodsOrderId: "goods-one" });
  await f.operation("redeem-two", "bonus_redeem", "40000", { goodsOrderId: "goods-two" });
  const results = await Promise.allSettled([f.ledger.postProgramOperation("redeem-one"), f.ledger.postProgramOperation("redeem-two")]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal((await f.client()).currencies[0].myBonus.availableMinor, "10000");
  assert.equal((await f.client()).currencies[0].myBonus.redeemedMinor, "40000");
});

test("same policy case and same goods order cannot be used under new transaction IDs", async () => {
  const f = fixture(); await f.fund();
  await f.operation("advance", "bonus_advance", "50000"); await f.ledger.postProgramOperation("advance");
  f.order("bonus-goods", { totalMinor: "0", bonusMinor: "10000" });
  const first = await f.operation("redeem-first", "bonus_redeem", "10000", { goodsOrderId: "bonus-goods" });
  await f.ledger.postProgramOperation("redeem-first");
  await f.operation("same-case", "bonus_redeem", "10000", { goodsOrderId: "bonus-goods", policyOperationId: first.policyOperationId });
  await assert.rejects(f.ledger.postProgramOperation("same-case"), { code: "ledger_policy_operation_already_used" });
  await f.operation("same-order", "bonus_redeem", "10000", { goodsOrderId: "bonus-goods" });
  await assert.rejects(f.ledger.postProgramOperation("same-order"), { code: "ledger_bonus_order_already_used" });
  assert.equal((await f.client()).currencies[0].myBonus.redeemedMinor, "10000");
});

test("principal payout and advance remain disabled unless explicitly approved", async () => {
  const f = fixture({ rulesOverrides: { allowAdvance: false, allowPrincipalPayout: false, rateBps: 0 } }); await f.fund();
  await f.operation("advance", "bonus_advance", "50000");
  await assert.rejects(f.ledger.postProgramOperation("advance"), { code: "ledger_advance_policy_not_approved" });
  await f.operation("payout", "principal_payout", "1", { source: "verified_bank", proof: { method: "provider_server_query", evidenceId: "test-bank-event", verifiedAt: END } });
  await assert.rejects(f.ledger.postProgramOperation("payout"), { code: "ledger_principal_payout_not_allowed" });
});

test("projection tampering is detected independently from immutable journal hashes", async () => {
  const f = fixture(); f.order(); f.event("capture"); await f.ledger.postVerifiedEvent("capture");
  const id = (await f.store.listIndex("ledger:accounts:tennis:customer-one"))[0];
  const row = await f.store.get("ledgerAccount", id);
  await f.store.commit({ writes: [{ type: "ledgerAccount", id, expectedVersion: row.version, doc: { ...row.doc, capturedMinor: "999999" } }] });
  await assert.rejects(f.ledger.verifyClientJournal({ ctx, projectId: "tennis", customerId: "customer-one" }), { code: "ledger_projection_integrity_failed" });
});
