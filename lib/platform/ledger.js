/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/**
 * SERVER ONLY. Append-only goods-payment journal; deliberately not wired to a public endpoint.
 * Transport verification belongs to the existing merchant adapter. This service accepts only
 * opaque references resolved by that trusted adapter, never browser-provided payment objects.
 * Funding and bonus operations require an approved, scoped program snapshot plus trusted server
 * evidence. There is no default rate, public activation, or inferred bank balance.
 */
import { hashPayload } from "./ids";
import { badRequest, conflict, forbidden, notFound, unavailable } from "./errors";

const SCHEMA = "client-journal-v1";
const AMOUNT_FIELDS = ["capturedMinor", "refundedMinor", "chargebackMinor", "netCapturedMinor", "goodsPaidMinor", "principalFundedMinor", "principalReturnedMinor", "principalReversedMinor", "principalOutstandingMinor", "bonusAccruedMinor", "bonusAvailableMinor", "bonusRedeemedMinor", "bonusExpiredMinor", "bonusAdvanceMinor", "bonusFrozenMinor"];
const CURRENCY_EXPONENTS = Object.freeze({ AED: 2, EUR: 2, USD: 2 });
const KINDS = new Set(["capture", "refund", "chargeback"]);
const PROOF_METHODS = new Set(["signed_webhook", "provider_server_query"]);
const PROGRAM_KINDS = new Set(["bonus_accrue", "bonus_release", "bonus_advance", "bonus_redeem", "bonus_expire", "principal_payout", "operator_note"]);
const TYPES = Object.freeze({ event: "ledgerEvent", journal: "ledgerJournal", payment: "ledgerPayment", account: "ledgerAccount", aggregate: "ledgerAggregate" });

function identifier(value, field) {
  if (typeof value !== "string" || value.length < 1 || value.length > 200 || /[\u0000-\u001f\u007f]/.test(value)) throw badRequest(`ledger_invalid_${field}`);
  return value;
}

function minor(value, field, { positive = false } = {}) {
  if (typeof value === "number" && Number.isSafeInteger(value)) value = String(value);
  if (typeof value !== "string" || !/^(?:0|[1-9]\d{0,29})$/.test(value)) throw badRequest(`ledger_invalid_${field}`);
  const amount = BigInt(value);
  if (positive && amount === 0n) throw badRequest(`ledger_invalid_${field}`);
  return amount.toString();
}

function timestamp(value, field) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) throw badRequest(`ledger_invalid_${field}`);
  return new Date(value).toISOString();
}

const idFor = (prefix, value) => `${prefix}_${hashPayload(value)}`;
const zeroTotals = () => Object.fromEntries(AMOUNT_FIELDS.map(field => [field, "0"]));
const signedAmount = (value, delta) => (BigInt(value) + delta).toString();
const projection = doc => Object.fromEntries(AMOUNT_FIELDS.map(field => [field, doc[field]]));
const journalHash = doc => hashPayload(Object.fromEntries(Object.entries(doc).filter(([key]) => key !== "hash")));

function eventSnapshot(value, { kinds = KINDS, methods = PROOF_METHODS, allowZero = false } = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw badRequest("ledger_event_not_verified");
  const event = {};
  for (const field of ["source", "eventId", "transactionId", "paymentId", "orderId", "customerId", "projectId", "merchantId"]) event[field] = identifier(value[field], field);
  if (!kinds.has(value.kind)) throw badRequest("ledger_invalid_kind");
  event.kind = value.kind;
  if (!Object.hasOwn(CURRENCY_EXPONENTS, value.currency)) throw badRequest("ledger_unsupported_currency");
  event.currency = value.currency;
  event.amountMinor = minor(value.amountMinor, "amount", { positive: !allowZero });
  event.occurredAt = timestamp(value.occurredAt, "occurredAt");
  if (!value.proof || !methods.has(value.proof.method)) throw badRequest("ledger_event_not_verified");
  event.proof = {
    method: value.proof.method,
    evidenceId: identifier(value.proof.evidenceId, "evidenceId"),
    verifiedAt: timestamp(value.proof.verifiedAt, "verifiedAt"),
  };
  if (value.allocations !== undefined) {
    if (!value.allocations || typeof value.allocations !== "object") throw badRequest("ledger_invalid_allocation");
    event.allocations = { goodsMinor: minor(value.allocations.goodsMinor, "goodsAllocation"), principalMinor: minor(value.allocations.principalMinor, "principalAllocation") };
  }
  return event;
}

function economicSnapshot(event) {
  // Query/event delivery time and proof references can change when the same transaction is
  // independently retrieved again. Its financial identity and allocation cannot change.
  const { eventId, occurredAt, proof, ...economic } = event;
  return economic;
}

function bindOrder(event, order) {
  if (!order || typeof order !== "object") throw notFound("ledger_order_not_found");
  for (const field of ["customerId", "projectId", "merchantId", "currency"]) {
    if (order[field] !== event[field]) throw conflict(`ledger_${field}_mismatch`);
  }
  if (order.id !== event.orderId) throw conflict("ledger_order_mismatch");
  identifier(order.revisionId, "orderRevision");
  const total = minor(order.totalMinor, "orderTotal", { positive: true });
  if (!["goods", "funding", "goods_and_funding"].includes(order.kind)) throw forbidden("ledger_order_classification_required");
  const principal = minor(order.principalMinor ?? "0", "principal");
  const bonus = minor(order.bonusMinor ?? "0", "bonus");
  if ((order.kind === "goods" && principal !== "0") || (order.kind !== "goods" && principal === "0")) throw conflict("ledger_order_classification_mismatch");
  const goods = BigInt(total) - BigInt(principal);
  if (goods < 0n || (order.kind === "funding" && goods !== 0n)) throw conflict("ledger_order_allocation_mismatch");
  // totalMinor is the immutable amount charged in cash; product-credit redemption has its own
  // journal operation and must be bound to an approved order.bonusMinor snapshot.
  if (order.status !== "approved") throw conflict("ledger_order_not_approved");
  if (event.kind === "capture" && event.amountMinor !== total) throw conflict("ledger_capture_total_mismatch");
  return { id: order.id, revisionId: order.revisionId, totalMinor: total, goodsMinor: goods.toString(), principalMinor: principal, bonusMinor: bonus, programId: order.programId || null, programVersion: order.programVersion || null, agreementId: order.agreementId || null };
}

function emptyBalance(scope) {
  return { schema: SCHEMA, ...scope, ...zeroTotals(), capturedPaymentCount: 0, journalCount: 0, headJournalId: null, headHash: null };
}

function applyTotals(doc, event, journal, at, changes = {}) {
  const amount = BigInt(event.amountMinor);
  const capture = event.kind === "capture";
  const delta = capture ? amount : KINDS.has(event.kind) ? -amount : 0n;
  const next = {
    ...doc,
    capturedMinor: signedAmount(doc.capturedMinor, capture ? amount : 0n),
    refundedMinor: signedAmount(doc.refundedMinor, event.kind === "refund" ? amount : 0n),
    chargebackMinor: signedAmount(doc.chargebackMinor, event.kind === "chargeback" ? amount : 0n),
    netCapturedMinor: signedAmount(doc.netCapturedMinor, delta),
    goodsPaidMinor: signedAmount(doc.goodsPaidMinor, changes.goodsPaidMinor ?? delta),
    capturedPaymentCount: doc.capturedPaymentCount + (capture ? 1 : 0),
    journalCount: doc.journalCount + 1,
    updatedAt: at,
  };
  for (const field of AMOUNT_FIELDS.filter(field => !["capturedMinor", "refundedMinor", "chargebackMinor", "netCapturedMinor", "goodsPaidMinor"].includes(field))) next[field] = signedAmount(doc[field] ?? "0", changes[field] ?? 0n);
  if (journal) Object.assign(next, { headJournalId: journal.id, headHash: journal.hash });
  return next;
}

/**
 * Inject these functions only in server code:
 * resolveVerifiedEvent(ref): verifies signature OR queries the approved merchant, and returns
 * the canonical evidence above. It must fail closed; a paid redirect/body flag is not proof.
 * loadOrder(id): loads an immutable approved server-order revision, not request JSON.
 * authorizeRead({ctx, projectId, customerId?, action}): derives identity/permissions from
 * an authenticated server context. No self-declared admin/customer role is accepted here.
 *
 * resolveApprovedRules: independently loads scoped legal/merchant/program approvals. Merely
 * setting a browser flag or environment rate is insufficient. resolveAuthorizedOperation loads
 * an independently approved policy job or a provider-confirmed principal return. These adapters
 * remain absent in the public portal runtime until an approved operational path is connected.
 */
export function createLedgerService({ store, resolveVerifiedEvent, loadOrder, authorizeRead, resolveApprovedRules, resolveAuthorizedOperation, now = () => Date.now(), maxRetries = 12 }) {
  if (!store || typeof store.get !== "function" || typeof store.commit !== "function") throw new TypeError("ledger store required");
  if (typeof resolveVerifiedEvent !== "function" || typeof loadOrder !== "function" || typeof authorizeRead !== "function") throw new TypeError("trusted ledger adapters required");
  if (!Number.isInteger(maxRetries) || maxRetries < 1 || maxRetries > 50) throw new TypeError("invalid ledger retries");

  async function authorize(ctx, scope, action) {
    if (!ctx || typeof ctx !== "object" || (await authorizeRead({ ctx, ...scope, action })) !== true) throw forbidden("ledger_read_forbidden");
  }

  async function approvedRules(scope, programId, version) {
    if (typeof resolveApprovedRules !== "function") throw forbidden("ledger_approved_rules_required");
    const raw = await resolveApprovedRules({ ...scope, programId, version });
    if (!raw || raw.status !== "approved" || raw.id !== programId || raw.version !== version || raw.projectId !== scope.projectId || raw.merchantId !== scope.merchantId || raw.currency !== scope.currency || !raw.legalApprovalId || !raw.merchantEligibilityApprovalId || !raw.agreementVersion || !raw.approvedByUserId) throw forbidden("ledger_approved_rules_required");
    const rules = {
      id: identifier(raw.id, "programId"), version: identifier(raw.version, "programVersion"),
      projectId: raw.projectId, merchantId: raw.merchantId, currency: raw.currency, status: "approved",
      legalApprovalId: identifier(raw.legalApprovalId, "legalApprovalId"), merchantEligibilityApprovalId: identifier(raw.merchantEligibilityApprovalId, "merchantEligibilityApprovalId"),
      agreementVersion: identifier(raw.agreementVersion, "agreementVersion"), approvedByUserId: identifier(raw.approvedByUserId, "approvedByUserId"),
      durationDays: raw.durationDays, rateBps: raw.rateBps,
      accrualConvention: identifier(raw.accrualConvention, "accrualConvention"),
      allowAdvance: raw.allowAdvance === true, allowProductRedemption: raw.allowProductRedemption === true,
      allowExpiry: raw.allowExpiry === true, allowPrincipalPayout: raw.allowPrincipalPayout === true,
      reversalPolicy: raw.reversalPolicy, allowedSources: raw.allowedSources,
      releasePolicy: raw.releasePolicy || null, expiryPolicy: raw.expiryPolicy || null,
      advanceBps: raw.advanceBps ?? null, advanceAccrualTreatment: raw.advanceAccrualTreatment || null,
      payoutBonusTreatment: raw.payoutBonusTreatment || null,
    };
    if (!Number.isInteger(rules.durationDays) || rules.durationDays < 1 || rules.durationDays > 36500 || !Number.isInteger(rules.rateBps) || rules.rateBps < 0 || rules.rateBps > 100000 || rules.reversalPolicy !== "freeze_bonus_and_review" || !Array.isArray(rules.allowedSources) || !rules.allowedSources.length || rules.allowedSources.some(source => typeof source !== "string" || source.length > 200)) throw forbidden("ledger_approved_rules_incomplete");
    if (raw.eligibleCustomerIds && (!Array.isArray(raw.eligibleCustomerIds) || !raw.eligibleCustomerIds.includes(scope.customerId))) throw forbidden("ledger_program_customer_not_eligible");
    return { ...rules, hash: hashPayload(rules) };
  }

  async function readRows(type, index) {
    const docs = [];
    let offset = 0;
    for (;;) {
      const ids = await store.listIndex(index, { limit: 100, offset, reverse: false });
      if (!ids.length) return docs;
      const rows = await store.getMany(type, ids);
      if (rows.length !== ids.length) throw unavailable("ledger_index_inconsistent");
      docs.push(...rows.map(row => row.doc));
      offset += ids.length;
      if (ids.length < 100) return docs;
    }
  }

  async function recordAlias(event, eventId, operationId, fingerprint, operation) {
    const existing = await store.get(TYPES.event, eventId);
    if (existing) {
      if (existing.doc.fingerprint !== fingerprint) throw conflict("ledger_event_conflict");
      return { duplicate: true, journalId: existing.doc.journalId };
    }
    const doc = { id: eventId, source: event.source, eventId: event.eventId, operationId, fingerprint, journalId: operation.id, proof: event.proof, recordedAt: new Date(now()).toISOString() };
    await store.commit({
      writes: [{ type: TYPES.event, id: eventId, doc, expectedVersion: -1 }],
      uniques: [{ name: "ledger_event", value: eventId, owner: operationId }],
    });
    return { duplicate: true, journalId: operation.id };
  }

  async function postVerifiedEvent(reference) {
    // There is deliberately no overload accepting a purported verified event object.
    identifier(reference, "eventReference");
    const event = eventSnapshot(await resolveVerifiedEvent(reference));
    if (Date.parse(event.proof.verifiedAt) > now() || Date.parse(event.occurredAt) > now()) throw conflict("ledger_evidence_time_invalid");
    const order = bindOrder(event, await loadOrder(event.orderId));
    const economic = economicSnapshot(event);
    const fingerprint = hashPayload(economic);
    const eventId = idFor("lev", [event.source, event.merchantId, event.eventId]);
    const operationId = idFor("ljr", [event.source, event.merchantId, event.transactionId]);
    const paymentId = idFor("lpy", [event.source, event.merchantId, event.paymentId]);
    const accountScope = { projectId: event.projectId, merchantId: event.merchantId, customerId: event.customerId, currency: event.currency };
    const aggregateScope = { projectId: event.projectId, merchantId: event.merchantId, currency: event.currency };
    const accountId = idFor("lac", accountScope);
    const aggregateId = idFor("lag", aggregateScope);
    const captureRules = event.kind === "capture" && order.principalMinor !== "0"
      ? await approvedRules(accountScope, identifier(order.programId, "programId"), identifier(order.programVersion, "programVersion")) : null;
    if (captureRules && (!order.agreementId || !captureRules.allowedSources.includes(event.source))) throw forbidden("ledger_funding_route_or_agreement_not_approved");

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const existingEvent = await store.get(TYPES.event, eventId);
      if (existingEvent) {
        if (existingEvent.doc.fingerprint !== fingerprint) throw conflict("ledger_event_conflict");
        return { duplicate: true, journalId: existingEvent.doc.journalId };
      }
      const operation = await store.get(TYPES.journal, operationId);
      if (operation) {
        if (operation.doc.fingerprint !== fingerprint) throw conflict("ledger_transaction_conflict");
        try { return await recordAlias(event, eventId, operationId, fingerprint, operation.doc); }
        catch (error) { if (error?.code === "version_conflict" || error?.code === "unique_conflict") continue; throw error; }
      }

      const [paymentRec, accountRec, aggregateRec] = await Promise.all([
        store.get(TYPES.payment, paymentId), store.get(TYPES.account, accountId), store.get(TYPES.aggregate, aggregateId),
      ]);
      const orderClaim = await store.getUnique("ledger_goods_order_capture", idFor("lor", [event.projectId, event.merchantId, event.orderId]));
      if (event.kind === "capture") {
        if (paymentRec || orderClaim) throw conflict("ledger_order_already_captured");
      } else {
        if (!paymentRec) throw conflict("ledger_capture_required");
        const prior = paymentRec.doc;
        for (const field of ["source", "paymentId", "orderId", "customerId", "projectId", "merchantId", "currency"]) {
          if (prior[field] !== event[field]) throw conflict(`ledger_${field}_mismatch`);
        }
        if (prior.orderRevisionId !== order.revisionId || prior.capturedMinor !== order.totalMinor) throw conflict("ledger_order_revision_mismatch");
        if (BigInt(prior.remainingMinor) < BigInt(event.amountMinor)) throw conflict("ledger_reversal_exceeds_capture");
      }

      const at = new Date(now()).toISOString();
      const account = accountRec?.doc || emptyBalance({ id: accountId, ...accountScope });
      const aggregate = aggregateRec?.doc || emptyBalance({ id: aggregateId, ...aggregateScope });
      const amount = event.amountMinor;
      const capture = event.kind === "capture";
      const positionId = captureRules ? idFor("lpo", [event.projectId, event.merchantId, event.orderId]) : paymentRec?.doc.programPositionId || null;
      const positionRec = positionId ? await store.get("ledgerPosition", positionId) : null;
      let allocation;
      if (capture) allocation = { goodsMinor: order.goodsMinor, principalMinor: order.principalMinor };
      else if (event.allocations) allocation = event.allocations;
      else if (paymentRec.doc.remainingMinor === amount) allocation = { goodsMinor: paymentRec.doc.goodsRemainingMinor, principalMinor: paymentRec.doc.principalRemainingMinor };
      else if (paymentRec.doc.principalRemainingMinor === "0") allocation = { goodsMinor: amount, principalMinor: "0" };
      else if (paymentRec.doc.goodsRemainingMinor === "0") allocation = { goodsMinor: "0", principalMinor: amount };
      else throw conflict("ledger_partial_reversal_allocation_required");
      if (BigInt(allocation.goodsMinor) + BigInt(allocation.principalMinor) !== BigInt(amount)) throw conflict("ledger_reversal_allocation_mismatch");
      if (!capture && (BigInt(allocation.goodsMinor) > BigInt(paymentRec.doc.goodsRemainingMinor) || BigInt(allocation.principalMinor) > BigInt(paymentRec.doc.principalRemainingMinor))) throw conflict("ledger_reversal_allocation_exceeds_balance");
      if (captureRules && positionRec) throw conflict("ledger_position_already_exists");
      if (!capture && allocation.principalMinor !== "0" && (!positionRec || BigInt(positionRec.doc.principalOutstandingMinor) < BigInt(allocation.principalMinor))) throw conflict("ledger_principal_reversal_exceeds_liability");
      const direction = capture ? 1n : -1n;
      const changes = {
        goodsPaidMinor: direction * BigInt(allocation.goodsMinor),
        principalFundedMinor: capture ? BigInt(allocation.principalMinor) : 0n,
        principalReversedMinor: capture ? 0n : BigInt(allocation.principalMinor),
        principalOutstandingMinor: direction * BigInt(allocation.principalMinor),
      };
      const frozenAccrued = !capture && allocation.principalMinor !== "0" ? positionRec.doc.bonusAccruedMinor : "0";
      const frozenAvailable = !capture && allocation.principalMinor !== "0" ? positionRec.doc.bonusAvailableMinor : "0";
      if (frozenAccrued !== "0" || frozenAvailable !== "0") Object.assign(changes, { bonusAccruedMinor: -BigInt(frozenAccrued), bonusAvailableMinor: -BigInt(frozenAvailable), bonusFrozenMinor: BigInt(frozenAccrued) + BigInt(frozenAvailable) });
      const lines = [];
      if (capture) lines.push({ account: "merchant_receivable", debitMinor: amount, creditMinor: "0" });
      for (const [accountName, allocated] of [["goods_consideration", allocation.goodsMinor], ["returnable_principal_liability", allocation.principalMinor]]) if (allocated !== "0") lines.push({ account: accountName, debitMinor: capture ? "0" : allocated, creditMinor: capture ? allocated : "0" });
      if (!capture) lines.push({ account: "merchant_receivable", debitMinor: "0", creditMinor: amount });
      if (frozenAccrued !== "0") lines.push({ account: "bonus_accrued", debitMinor: frozenAccrued, creditMinor: "0" });
      if (frozenAvailable !== "0") lines.push({ account: "bonus_available", debitMinor: frozenAvailable, creditMinor: "0" });
      const frozenTotal = BigInt(frozenAccrued) + BigInt(frozenAvailable);
      if (frozenTotal) lines.push({ account: "bonus_frozen_review", debitMinor: "0", creditMinor: frozenTotal.toString() });
      const journal = {
        id: operationId, schema: SCHEMA, sequence: account.journalCount + 1,
        previousJournalId: account.headJournalId, previousHash: account.headHash,
        ...economic, orderRevisionId: order.revisionId, fingerprint,
        occurredAt: event.occurredAt, recordedAt: at, proof: event.proof,
        programPositionId: positionId, allocations: allocation,
        // A verified merchant capture is a merchant receivable, never a bank balance or revenue.
        lines,
      };
      journal.hash = journalHash(journal);
      const payment = capture ? {
        id: paymentId, source: event.source, paymentId: event.paymentId, ...accountScope,
        orderId: event.orderId, orderRevisionId: order.revisionId,
        capturedMinor: amount, refundedMinor: "0", chargebackMinor: "0", remainingMinor: amount,
        goodsRemainingMinor: allocation.goodsMinor, principalRemainingMinor: allocation.principalMinor, programPositionId: positionId,
        captureJournalId: journal.id, status: "captured", createdAt: at, updatedAt: at,
      } : {
        ...paymentRec.doc,
        refundedMinor: signedAmount(paymentRec.doc.refundedMinor, event.kind === "refund" ? BigInt(amount) : 0n),
        chargebackMinor: signedAmount(paymentRec.doc.chargebackMinor, event.kind === "chargeback" ? BigInt(amount) : 0n),
        remainingMinor: signedAmount(paymentRec.doc.remainingMinor, -BigInt(amount)),
        goodsRemainingMinor: signedAmount(paymentRec.doc.goodsRemainingMinor, -BigInt(allocation.goodsMinor)),
        principalRemainingMinor: signedAmount(paymentRec.doc.principalRemainingMinor, -BigInt(allocation.principalMinor)),
        status: BigInt(paymentRec.doc.remainingMinor) === BigInt(amount) ? "fully_reversed" : "partially_reversed",
        updatedAt: at,
      };
      const receipt = { id: eventId, source: event.source, eventId: event.eventId, operationId, fingerprint, journalId: journal.id, proof: event.proof, recordedAt: at };
      const commit = {
        writes: [
          { type: TYPES.event, id: eventId, doc: receipt, expectedVersion: -1 },
          { type: TYPES.journal, id: journal.id, doc: journal, expectedVersion: -1 },
          { type: TYPES.payment, id: paymentId, doc: payment, expectedVersion: paymentRec?.version ?? -1 },
          { type: TYPES.account, id: accountId, doc: applyTotals(account, event, journal, at, changes), expectedVersion: accountRec?.version ?? -1 },
          { type: TYPES.aggregate, id: aggregateId, doc: applyTotals(aggregate, event, null, at, changes), expectedVersion: aggregateRec?.version ?? -1 },
        ],
        uniques: [
          { name: "ledger_event", value: eventId, owner: operationId },
          { name: "ledger_transaction", value: operationId, owner: operationId },
          ...(capture ? [{ name: "ledger_goods_order_capture", value: idFor("lor", [event.projectId, event.merchantId, event.orderId]), owner: operationId }] : []),
        ],
        indexes: [
          { name: `ledger:journal:${accountId}`, member: journal.id, score: journal.sequence },
          { name: `ledger:accounts:${event.projectId}:${event.customerId}`, member: accountId, score: 0 },
          { name: `ledger:accounts:${event.projectId}`, member: accountId, score: 0 },
          { name: `ledger:aggregates:${event.projectId}`, member: aggregateId, score: 0 },
        ],
      };
      if (positionId) {
        const position = capture ? {
          id: positionId, ...accountScope, accountId, aggregateId, paymentRecordId: paymentId, orderId: order.id,
          programId: captureRules.id, rulesVersion: captureRules.version, rulesSnapshot: captureRules,
          agreementId: order.agreementId, ...zeroTotals(), principalFundedMinor: allocation.principalMinor,
          principalOutstandingMinor: allocation.principalMinor, durationDays: captureRules.durationDays, rateBps: captureRules.rateBps,
          startsAt: event.occurredAt, maturesAt: new Date(Date.parse(event.occurredAt) + captureRules.durationDays * 86400000).toISOString(),
          accruedThrough: event.occurredAt, advanceUnrecoveredMinor: "0",
          accrualBasisStartedAt: event.occurredAt, accrualBasisPrincipalMinor: allocation.principalMinor, accrualBasisGrossPostedMinor: "0",
          status: "active", frozen: false, createdAt: at, updatedAt: at,
        } : { ...positionRec.doc, principalReversedMinor: signedAmount(positionRec.doc.principalReversedMinor, BigInt(allocation.principalMinor)), principalOutstandingMinor: signedAmount(positionRec.doc.principalOutstandingMinor, -BigInt(allocation.principalMinor)), updatedAt: at,
          ...(allocation.principalMinor !== "0" ? { status: "reversal_review", frozen: true, bonusAccruedMinor: "0", bonusAvailableMinor: "0", bonusFrozenMinor: signedAmount(positionRec.doc.bonusFrozenMinor, frozenTotal) } : {}),
        };
        commit.writes.push({ type: "ledgerPosition", id: positionId, doc: position, expectedVersion: positionRec?.version ?? -1 });
        commit.indexes.push({ name: `ledger:programs:${accountId}`, member: positionId, score: Date.parse(position.startsAt) }, { name: `ledger:programs:${aggregateId}`, member: positionId, score: Date.parse(position.startsAt) });
      }
      try {
        await store.commit(commit);
        return { duplicate: false, journalId: journal.id };
      } catch (error) {
        if (error?.code === "version_conflict" || error?.code === "unique_conflict") continue;
        throw error;
      }
    }
    throw unavailable("ledger_busy");
  }

  async function postProgramOperation(reference) {
    identifier(reference, "operationReference");
    if (typeof resolveAuthorizedOperation !== "function") throw unavailable("ledger_program_operations_unavailable");
    const raw = await resolveAuthorizedOperation(reference);
    const event = eventSnapshot(raw, { kinds: PROGRAM_KINDS, methods: new Set([...PROOF_METHODS, "approved_policy_operation", "authorized_operator"]), allowZero: raw?.kind === "bonus_accrue" || raw?.kind === "operator_note" });
    if (Date.parse(event.proof.verifiedAt) > now()) throw conflict("ledger_evidence_time_invalid");
    const positionId = identifier(raw.positionId, "positionId");
    const eventId = idFor("lev", [event.source, event.merchantId, event.eventId]);
    const operationId = idFor("ljr", [event.source, event.merchantId, event.transactionId]);
    const baseEconomic = economicSnapshot(event);
    const policy = { rulesHash: identifier(raw.rulesHash, "rulesHash"), policyOperationId: identifier(raw.policyOperationId, "policyOperationId") };
    if (event.kind === "bonus_accrue") {
      policy.periodStart = timestamp(raw.periodStart, "periodStart");
      policy.periodEnd = timestamp(raw.periodEnd, "periodEnd");
    }
    if (event.kind === "bonus_redeem") policy.goodsOrderId = identifier(raw.goodsOrderId, "goodsOrderId");
    if (event.kind === "operator_note") {
      policy.actorUserId = identifier(raw.actorUserId, "actorUserId");
      policy.relatedJournalId = identifier(raw.relatedJournalId, "relatedJournalId");
      if (typeof raw.reason !== "string" || raw.reason.trim().length < 3 || raw.reason.length > 500) throw badRequest("ledger_correction_reason_required");
      policy.reason = raw.reason.trim();
      if (event.amountMinor !== "0" || event.proof.method !== "authorized_operator") throw forbidden("ledger_note_cannot_create_money");
    } else if (event.kind === "principal_payout") {
      if (!PROOF_METHODS.has(event.proof.method)) throw forbidden("ledger_verified_payout_required");
    } else if (event.proof.method !== "approved_policy_operation") throw forbidden("ledger_approved_policy_evidence_required");
    const economic = { ...baseEconomic, positionId, policy };
    const fingerprint = hashPayload(economic);

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const existing = await store.get(TYPES.event, eventId);
      if (existing) {
        if (existing.doc.fingerprint !== fingerprint) throw conflict("ledger_event_conflict");
        return { duplicate: true, journalId: existing.doc.journalId };
      }
      const priorOperation = await store.get(TYPES.journal, operationId);
      if (priorOperation) {
        if (priorOperation.doc.fingerprint !== fingerprint) throw conflict("ledger_transaction_conflict");
        try { return await recordAlias(event, eventId, operationId, fingerprint, priorOperation.doc); }
        catch (error) { if (error?.code === "version_conflict" || error?.code === "unique_conflict") continue; throw error; }
      }
      const positionRec = await store.get("ledgerPosition", positionId);
      if (!positionRec) throw notFound("ledger_position_not_found");
      const position = positionRec.doc;
      for (const field of ["projectId", "customerId", "merchantId", "currency", "orderId"]) if (position[field] !== event[field]) throw conflict(`ledger_${field}_mismatch`);
      const [accountRec, aggregateRec, paymentRec] = await Promise.all([store.get(TYPES.account, position.accountId), store.get(TYPES.aggregate, position.aggregateId), store.get(TYPES.payment, position.paymentRecordId)]);
      if (!accountRec || !aggregateRec || !paymentRec || paymentRec.doc.paymentId !== event.paymentId) throw conflict("ledger_position_linkage_invalid");
      const rules = await approvedRules(position, position.programId, position.rulesVersion);
      if (rules.hash !== position.rulesSnapshot.hash || policy.rulesHash !== rules.hash) throw conflict("ledger_program_rules_changed");
      if (position.frozen && event.kind !== "operator_note") throw conflict("ledger_program_frozen");
      if (Date.parse(event.occurredAt) > now() || Date.parse(event.occurredAt) < Date.parse(position.startsAt)) throw conflict("ledger_program_operation_time_invalid");
      const amount = BigInt(event.amountMinor);
      const nextPosition = { ...position, updatedAt: new Date(now()).toISOString() };
      const changes = { goodsPaidMinor: 0n };
      const lines = [];
      const debit = (account, value) => lines.push({ account, debitMinor: value.toString(), creditMinor: "0" });
      const credit = (account, value) => lines.push({ account, debitMinor: "0", creditMinor: value.toString() });
      const halfUp = (numerator, denominator) => numerator / denominator + (numerator % denominator * 2n >= denominator ? 1n : 0n);
      const uniques = [{ name: "ledger_policy_operation", value: idFor("lpol", [positionId, policy.policyOperationId]), owner: operationId }];
      if (await store.getUnique("ledger_policy_operation", uniques[0].value)) throw conflict("ledger_policy_operation_already_used");
      let paymentUpdate = null;
      let bonusOrderClaim = null;
      if (event.kind === "bonus_accrue") {
        if (rules.accrualConvention !== "actual_365_simple_half_up_minor_v1") throw forbidden("ledger_accrual_convention_not_supported");
        const start = Date.parse(policy.periodStart), end = Date.parse(policy.periodEnd);
        if (policy.periodStart !== position.accruedThrough || end <= start || end > now() || end > Date.parse(position.maturesAt) || end > Date.parse(event.occurredAt)) throw conflict("ledger_accrual_period_invalid");
        // Round the cumulative entitlement at a constant-principal epoch, then subtract already
        // posted entitlement. Splitting one period into repeated jobs cannot create extra cents.
        const cumulativeGross = halfUp(BigInt(position.accrualBasisPrincipalMinor) * BigInt(rules.rateBps) * BigInt(end - Date.parse(position.accrualBasisStartedAt)), 10000n * 365n * 86400000n);
        const gross = cumulativeGross - BigInt(position.accrualBasisGrossPostedMinor);
        const offset = BigInt(position.advanceUnrecoveredMinor) < gross ? BigInt(position.advanceUnrecoveredMinor) : gross;
        if (amount !== gross - offset) throw conflict("ledger_accrual_amount_mismatch");
        nextPosition.advanceUnrecoveredMinor = (BigInt(position.advanceUnrecoveredMinor) - offset).toString();
        nextPosition.accruedThrough = policy.periodEnd;
        nextPosition.accrualBasisGrossPostedMinor = cumulativeGross.toString();
        nextPosition.bonusAccruedMinor = signedAmount(position.bonusAccruedMinor, amount);
        changes.bonusAccruedMinor = amount;
        debit("bonus_policy_cost", amount); credit("bonus_accrued", amount);
      } else if (event.kind === "bonus_release") {
        if (!["on_accrual", "at_maturity"].includes(rules.releasePolicy) || (rules.releasePolicy === "at_maturity" && Date.parse(event.occurredAt) < Date.parse(position.maturesAt))) throw forbidden("ledger_release_policy_not_satisfied");
        if (amount > BigInt(position.bonusAccruedMinor)) throw conflict("ledger_bonus_insufficient");
        changes.bonusAccruedMinor = -amount; changes.bonusAvailableMinor = amount;
        nextPosition.bonusAccruedMinor = signedAmount(position.bonusAccruedMinor, -amount); nextPosition.bonusAvailableMinor = signedAmount(position.bonusAvailableMinor, amount);
        debit("bonus_accrued", amount); credit("bonus_available", amount);
      } else if (event.kind === "bonus_advance") {
        if (!rules.allowAdvance || !Number.isInteger(rules.advanceBps) || rules.advanceBps < 0 || rules.advanceBps > 100000 || !["offset_future_accrual", "independent_product_credit"].includes(rules.advanceAccrualTreatment)) throw forbidden("ledger_advance_policy_not_approved");
        if (position.bonusAdvanceMinor !== "0") throw conflict("ledger_advance_already_posted");
        if (amount !== halfUp(BigInt(position.principalFundedMinor) * BigInt(rules.advanceBps), 10000n)) throw conflict("ledger_advance_amount_mismatch");
        nextPosition.bonusAdvanceMinor = amount.toString(); nextPosition.bonusAvailableMinor = signedAmount(position.bonusAvailableMinor, amount);
        if (rules.advanceAccrualTreatment === "offset_future_accrual") nextPosition.advanceUnrecoveredMinor = amount.toString();
        changes.bonusAdvanceMinor = amount; changes.bonusAvailableMinor = amount;
        debit("bonus_policy_cost", amount); credit("bonus_available", amount);
      } else if (event.kind === "bonus_redeem") {
        if (!rules.allowProductRedemption || amount > BigInt(position.bonusAvailableMinor)) throw conflict("ledger_bonus_insufficient_or_redemption_disabled");
        const goodsOrder = await loadOrder(policy.goodsOrderId);
        if (!goodsOrder || goodsOrder.kind !== "goods" || goodsOrder.status !== "approved" || goodsOrder.customerId !== event.customerId || goodsOrder.projectId !== event.projectId || goodsOrder.merchantId !== event.merchantId || goodsOrder.currency !== event.currency || minor(goodsOrder.bonusMinor, "goodsBonus") !== amount.toString()) throw conflict("ledger_redemption_order_mismatch");
        identifier(goodsOrder.revisionId, "orderRevision");
        policy.goodsOrderRevisionId = goodsOrder.revisionId;
        nextPosition.bonusAvailableMinor = signedAmount(position.bonusAvailableMinor, -amount); nextPosition.bonusRedeemedMinor = signedAmount(position.bonusRedeemedMinor, amount);
        changes.bonusAvailableMinor = -amount; changes.bonusRedeemedMinor = amount; changes.goodsPaidMinor = amount;
        debit("bonus_available", amount); credit("goods_consideration", amount);
        bonusOrderClaim = idFor("lbo", [event.projectId, event.merchantId, goodsOrder.id]);
        if (await store.getUnique("ledger_bonus_order", bonusOrderClaim)) throw conflict("ledger_bonus_order_already_used");
        uniques.push({ name: "ledger_bonus_order", value: bonusOrderClaim, owner: operationId });
      } else if (event.kind === "bonus_expire") {
        if (!rules.allowExpiry || rules.expiryPolicy !== "approved_operation_after_maturity" || Date.parse(event.occurredAt) < Date.parse(position.maturesAt) || amount > BigInt(position.bonusAvailableMinor)) throw forbidden("ledger_expiry_policy_not_satisfied");
        nextPosition.bonusAvailableMinor = signedAmount(position.bonusAvailableMinor, -amount); nextPosition.bonusExpiredMinor = signedAmount(position.bonusExpiredMinor, amount);
        changes.bonusAvailableMinor = -amount; changes.bonusExpiredMinor = amount;
        debit("bonus_available", amount); credit("bonus_policy_cost", amount);
      } else if (event.kind === "principal_payout") {
        if (!rules.allowPrincipalPayout || !["freeze_unearned_bonus", "retain_bonus_under_approved_terms"].includes(rules.payoutBonusTreatment) || !rules.allowedSources.includes(event.source) || amount > BigInt(position.principalOutstandingMinor) || amount > BigInt(paymentRec.doc.principalRemainingMinor)) throw forbidden("ledger_principal_payout_not_allowed");
        // Rate periods must be closed at the return instant before changing their principal basis.
        if (rules.rateBps !== 0 && position.accruedThrough !== event.occurredAt) throw conflict("ledger_accrual_required_before_payout");
        nextPosition.principalOutstandingMinor = signedAmount(position.principalOutstandingMinor, -amount); nextPosition.principalReturnedMinor = signedAmount(position.principalReturnedMinor, amount);
        nextPosition.accrualBasisStartedAt = event.occurredAt; nextPosition.accrualBasisPrincipalMinor = nextPosition.principalOutstandingMinor; nextPosition.accrualBasisGrossPostedMinor = "0";
        if (nextPosition.principalOutstandingMinor === "0") nextPosition.status = "principal_returned";
        changes.principalOutstandingMinor = -amount; changes.principalReturnedMinor = amount;
        paymentUpdate = { ...paymentRec.doc, principalRemainingMinor: signedAmount(paymentRec.doc.principalRemainingMinor, -amount), remainingMinor: signedAmount(paymentRec.doc.remainingMinor, -amount), updatedAt: nextPosition.updatedAt };
        debit("returnable_principal_liability", amount); credit("verified_principal_payout", amount);
        if (rules.payoutBonusTreatment === "freeze_unearned_bonus" && nextPosition.advanceUnrecoveredMinor !== "0") {
          const accrued = BigInt(position.bonusAccruedMinor), available = BigInt(position.bonusAvailableMinor);
          nextPosition.bonusAccruedMinor = "0"; nextPosition.bonusAvailableMinor = "0"; nextPosition.bonusFrozenMinor = signedAmount(position.bonusFrozenMinor, accrued + available);
          nextPosition.frozen = true; nextPosition.status = "payout_bonus_review";
          changes.bonusAccruedMinor = -accrued; changes.bonusAvailableMinor = -available; changes.bonusFrozenMinor = accrued + available;
          debit("bonus_accrued", accrued); debit("bonus_available", available); credit("bonus_frozen_review", accrued + available);
        }
      } else {
        const related = await store.get(TYPES.journal, policy.relatedJournalId);
        if (!related || related.doc.customerId !== event.customerId || related.doc.projectId !== event.projectId || related.doc.currency !== event.currency || related.doc.merchantId !== event.merchantId) throw conflict("ledger_correction_link_invalid");
        // Corrections are traceable notes; financial changes require the verified reversal/payout
        // or approved policy operation above. An administrator cannot fabricate money here.
      }
      const at = nextPosition.updatedAt;
      const journal = { id: operationId, schema: SCHEMA, sequence: accountRec.doc.journalCount + 1, previousJournalId: accountRec.doc.headJournalId, previousHash: accountRec.doc.headHash, ...economic, fingerprint, occurredAt: event.occurredAt, recordedAt: at, proof: event.proof, lines };
      journal.hash = journalHash(journal);
      const receipt = { id: eventId, source: event.source, eventId: event.eventId, operationId, fingerprint, journalId: journal.id, proof: event.proof, recordedAt: at };
      const commit = {
        writes: [
          { type: TYPES.event, id: eventId, doc: receipt, expectedVersion: -1 }, { type: TYPES.journal, id: operationId, doc: journal, expectedVersion: -1 },
          { type: TYPES.account, id: position.accountId, doc: applyTotals(accountRec.doc, event, journal, at, changes), expectedVersion: accountRec.version },
          { type: TYPES.aggregate, id: position.aggregateId, doc: applyTotals(aggregateRec.doc, event, null, at, changes), expectedVersion: aggregateRec.version },
          { type: "ledgerPosition", id: positionId, doc: nextPosition, expectedVersion: positionRec.version },
          ...(paymentUpdate ? [{ type: TYPES.payment, id: paymentRec.doc.id, doc: paymentUpdate, expectedVersion: paymentRec.version }] : []),
        ],
        uniques: [...uniques, { name: "ledger_event", value: eventId, owner: operationId }, { name: "ledger_transaction", value: operationId, owner: operationId }],
        indexes: [{ name: `ledger:journal:${position.accountId}`, member: operationId, score: journal.sequence }],
      };
      try { await store.commit(commit); return { duplicate: false, journalId: operationId }; }
      catch (error) {
        if (error?.code === "unique_conflict" && await store.getUnique("ledger_policy_operation", idFor("lpol", [positionId, policy.policyOperationId]))) throw conflict("ledger_policy_operation_already_used");
        if (error?.code === "unique_conflict" && bonusOrderClaim && await store.getUnique("ledger_bonus_order", bonusOrderClaim)) throw conflict("ledger_bonus_order_already_used");
        if (error?.code === "version_conflict" || error?.code === "unique_conflict") continue;
        throw error;
      }
    }
    throw unavailable("ledger_busy");
  }

  function summaryRow(doc, programs = []) {
    const programStatus = !programs.length ? "not_enabled" : programs.some(position => position.frozen) ? "frozen" : programs.some(position => position.status === "active") ? "active" : "closed";
    return {
      projectId: doc.projectId, merchantId: doc.merchantId, currency: doc.currency,
      minorUnitExponent: CURRENCY_EXPONENTS[doc.currency],
      ...(doc.customerId ? { customerId: doc.customerId } : {}),
      ...projection(doc), capturedPaymentCount: doc.capturedPaymentCount, journalCount: doc.journalCount,
      myDeposit: { status: programStatus, returnablePrincipalMinor: doc.principalOutstandingMinor, principalReturnedMinor: doc.principalReturnedMinor, principalReversedMinor: doc.principalReversedMinor, programs: programs.map(position => ({ id: position.id, programId: position.programId, rulesVersion: position.rulesVersion, customerId: position.customerId, currency: position.currency, durationDays: position.durationDays, rateBps: position.rateBps, startsAt: position.startsAt, maturesAt: position.maturesAt, status: position.status, frozen: position.frozen, principalOutstandingMinor: position.principalOutstandingMinor })) },
      myBonus: { status: programStatus, accruedMinor: doc.bonusAccruedMinor, availableMinor: doc.bonusAvailableMinor, redeemedMinor: doc.bonusRedeemedMinor, expiredMinor: doc.bonusExpiredMinor, advanceMinor: doc.bonusAdvanceMinor, frozenMinor: doc.bonusFrozenMinor },
      bankBalanceMinor: null, bankBalanceStatus: "requires_independent_statement_reconciliation",
      updatedAt: doc.updatedAt,
    };
  }

  async function withPrograms(rows) {
    return Promise.all(rows.map(async row => summaryRow(row, await readRows("ledgerPosition", `ledger:programs:${row.id}`))));
  }

  async function readClientSummary({ ctx, projectId, customerId }) {
    identifier(projectId, "projectId"); identifier(customerId, "customerId");
    await authorize(ctx, { projectId, customerId }, "client_summary");
    const rows = await readRows(TYPES.account, `ledger:accounts:${projectId}:${customerId}`);
    if (rows.some(row => row.projectId !== projectId || row.customerId !== customerId)) throw unavailable("ledger_index_inconsistent");
    return { currencies: await withPrograms(rows), financePostingEnabled: false, bonusPostingEnabled: false };
  }

  async function readAdminSummary({ ctx, projectId }) {
    identifier(projectId, "projectId");
    await authorize(ctx, { projectId }, "admin_summary");
    const aggregates = await readRows(TYPES.aggregate, `ledger:aggregates:${projectId}`);
    if (aggregates.some(row => row.projectId !== projectId)) throw unavailable("ledger_index_inconsistent");
    return { currencies: await withPrograms(aggregates), financePostingEnabled: false, bonusPostingEnabled: false };
  }

  function pagination(limit, offset) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0) throw badRequest("ledger_invalid_pagination");
  }

  async function readClientJournal({ ctx, projectId, customerId, limit = 50, offset = 0 }) {
    identifier(projectId, "projectId"); identifier(customerId, "customerId"); pagination(limit, offset);
    await authorize(ctx, { projectId, customerId }, "client_journal");
    const accounts = await readRows(TYPES.account, `ledger:accounts:${projectId}:${customerId}`);
    if (accounts.some(row => row.projectId !== projectId || row.customerId !== customerId)) throw unavailable("ledger_index_inconsistent");
    const entries = (await Promise.all(accounts.map(account => readRows(TYPES.journal, `ledger:journal:${account.id}`)))).flat();
    if (entries.some(entry => entry.projectId !== projectId || entry.customerId !== customerId)) throw unavailable("ledger_index_inconsistent");
    entries.sort((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt) || b.id.localeCompare(a.id));
    return { items: entries.slice(offset, offset + limit), nextOffset: entries.length > offset + limit ? offset + limit : null };
  }

  async function readAdminClients({ ctx, projectId, limit = 50, offset = 0 }) {
    identifier(projectId, "projectId"); pagination(limit, offset);
    await authorize(ctx, { projectId }, "admin_clients");
    const ids = await store.listIndex(`ledger:accounts:${projectId}`, { limit: limit + 1, offset, reverse: false });
    const rows = await store.getMany(TYPES.account, ids.slice(0, limit));
    if (rows.length !== Math.min(limit, ids.length) || rows.some(row => row.doc.projectId !== projectId)) throw unavailable("ledger_index_inconsistent");
    return { items: await withPrograms(rows.map(row => row.doc)), nextOffset: ids.length > limit ? offset + limit : null };
  }

  async function verifyClientJournal({ ctx, projectId, customerId }) {
    identifier(projectId, "projectId"); identifier(customerId, "customerId");
    await authorize(ctx, { projectId, customerId }, "client_journal");
    const rows = await readRows(TYPES.account, `ledger:accounts:${projectId}:${customerId}`);
    let checkedEntries = 0;
    for (const row of rows) {
      if (row.projectId !== projectId || row.customerId !== customerId) throw unavailable("ledger_index_inconsistent");
      const entries = await readRows(TYPES.journal, `ledger:journal:${row.id}`);
      let previousHash = null;
      let previousId = null;
      const rebuilt = zeroTotals();
      const add = (field, value) => { rebuilt[field] = signedAmount(rebuilt[field], value); };
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const balanced = entry.lines.reduce((sum, line) => sum + BigInt(line.debitMinor) - BigInt(line.creditMinor), 0n) === 0n;
        if (entry.sequence !== i + 1 || entry.previousHash !== previousHash || entry.previousJournalId !== previousId || entry.hash !== journalHash(entry) || !balanced || entry.projectId !== projectId || entry.customerId !== customerId || entry.currency !== row.currency || entry.merchantId !== row.merchantId) throw conflict("ledger_journal_integrity_failed");
        previousHash = entry.hash; previousId = entry.id; checkedEntries++;
        if (entry.kind === "capture") { add("capturedMinor", BigInt(entry.amountMinor)); add("principalFundedMinor", BigInt(entry.allocations.principalMinor)); }
        if (entry.kind === "refund") add("refundedMinor", BigInt(entry.amountMinor));
        if (entry.kind === "chargeback") add("chargebackMinor", BigInt(entry.amountMinor));
        if (entry.kind === "refund" || entry.kind === "chargeback") add("principalReversedMinor", BigInt(entry.allocations.principalMinor));
        for (const line of entry.lines) {
          const change = BigInt(line.creditMinor) - BigInt(line.debitMinor);
          const field = { goods_consideration: "goodsPaidMinor", returnable_principal_liability: "principalOutstandingMinor", bonus_accrued: "bonusAccruedMinor", bonus_available: "bonusAvailableMinor", bonus_frozen_review: "bonusFrozenMinor" }[line.account];
          if (field) add(field, change);
        }
        for (const [kind, field] of [["principal_payout", "principalReturnedMinor"], ["bonus_redeem", "bonusRedeemedMinor"], ["bonus_expire", "bonusExpiredMinor"], ["bonus_advance", "bonusAdvanceMinor"]]) if (entry.kind === kind) add(field, BigInt(entry.amountMinor));
      }
      rebuilt.netCapturedMinor = (BigInt(rebuilt.capturedMinor) - BigInt(rebuilt.refundedMinor) - BigInt(rebuilt.chargebackMinor)).toString();
      if (AMOUNT_FIELDS.some(field => rebuilt[field] !== row[field]) || entries.filter(entry => entry.kind === "capture").length !== row.capturedPaymentCount) throw conflict("ledger_projection_integrity_failed");
      if (entries.length !== row.journalCount || previousHash !== row.headHash || previousId !== row.headJournalId) throw conflict("ledger_journal_integrity_failed");
    }
    return { verified: true, accounts: rows.length, checkedEntries };
  }

  async function inspectFinancialReadiness({ ctx, projectId, customerId }) {
    identifier(projectId, "projectId"); identifier(customerId, "customerId");
    await authorize(ctx, { projectId, customerId }, "finance_readiness");
    const rules = typeof resolveApprovedRules === "function" ? await resolveApprovedRules({ projectId, customerId }) : null;
    const approved = !!(rules && rules.status === "approved" && rules.legalApprovalId && rules.merchantEligibilityApprovalId && rules.version && rules.projectId === projectId);
    // Approved rules alone cannot enable a not-yet-implemented financial posting engine.
    return { enabled: false, rulesApproved: approved, reason: approved ? "public_financial_product_not_activated" : "approved_legal_merchant_and_program_rules_required" };
  }

  return Object.freeze({ postVerifiedEvent, postProgramOperation, readClientSummary, readClientJournal, readAdminSummary, readAdminClients, verifyClientJournal, inspectFinancialReadiness });
}
