/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/**
 * SERVER ONLY. Durable delivery from an independently verified LIVE merchant payment to the
 * customer ledger. No native CS-Cart/MPGS field mapping or network adapter is assumed here.
 * This module has no public endpoint, payment execution, financial activation or test fallback.
 */
import { createLedgerService } from "./ledger";
import { hashPayload, newId } from "./ids";
import { auditWrites, mergeCommits } from "./audit";
import { badRequest, conflict, forbidden, notFound, unavailable } from "./errors";

export const COMMERCE_LEDGER_SELLER = "MAXIMUS SPORTS EQUIPMENT TRADING LLC";
const STORE_ORIGIN = "https://maximussports.ae";
const KINDS = new Set(["capture", "refund", "chargeback"]);
const PROOFS = new Set(["provider_server_query", "signed_webhook"]);
const TYPES = Object.freeze({ inbox: "commerceLedgerInbox", work: "commerceLedgerWork", order: "commerceLedgerOrder", retry: "commerceLedgerRetryApproval" });
const idFor = (prefix, values) => `${prefix}_${hashPayload(values)}`;
const sellerName = value => typeof value === "string" ? value.toUpperCase().replace(/\./g, "").replace(/\s+/g, " ").trim() : "";

function identifier(value, field) {
  if (typeof value !== "string" || value.length < 1 || value.length > 200 || /[\u0000-\u001f\u007f]/.test(value)) throw badRequest(`commerce_ledger_invalid_${field}`);
  return value;
}
function amount(value, field, positive = true) {
  if (typeof value === "number" && Number.isSafeInteger(value)) value = String(value);
  if (typeof value !== "string" || !/^(?:0|[1-9]\d{0,29})$/.test(value) || (positive && value === "0")) throw badRequest(`commerce_ledger_invalid_${field}`);
  return value;
}
function time(value, field) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) throw badRequest(`commerce_ledger_invalid_${field}`);
  return new Date(value).toISOString();
}
function mappingSnapshot(raw, now) {
  if (!raw || raw.status !== "verified_live_native_mapping" || raw.enabled !== true) throw unavailable("commerce_ledger_native_mapping_unconfigured");
  const mapping = {};
  for (const field of ["id", "version", "projectId", "organizationId", "source", "merchantId", "storefrontId", "paymentMethodId", "liveModeEvidenceId", "nativeMappingEvidenceId", "customerBindingEvidenceId"]) mapping[field] = identifier(raw[field], field);
  if (!/^[a-z][a-z0-9_-]{0,63}$/.test(mapping.projectId) || /(?:^|[_-])(test|mock)(?:[_-]|$)/i.test(mapping.source)) throw unavailable("commerce_ledger_native_mapping_unconfigured");
  if (mapping.projectId === "tennis" && mapping.organizationId !== "maximus-tennis") throw unavailable("commerce_ledger_native_mapping_unconfigured");
  if (raw.storeOrigin !== STORE_ORIGIN || raw.processor !== "MPGS" || sellerName(raw.sellerLegalName) !== COMMERCE_LEDGER_SELLER || !["AED", "EUR", "USD"].includes(raw.currency)) throw unavailable("commerce_ledger_native_mapping_unconfigured");
  mapping.storeOrigin = raw.storeOrigin; mapping.processor = raw.processor; mapping.sellerLegalName = COMMERCE_LEDGER_SELLER; mapping.currency = raw.currency;
  mapping.verifiedAt = time(raw.verifiedAt, "mappingVerifiedAt");
  if (Date.parse(mapping.verifiedAt) > now) throw unavailable("commerce_ledger_native_mapping_unconfigured");
  return Object.freeze({ ...mapping, hash: hashPayload(mapping) });
}

/** Read-only setup report. A flag alone cannot supply the missing inspected native adapters. */
export function commerceLedgerReadiness({ env = {}, mapping, store, resolveLivePayment, loadNativeOrder, loadCustomerBinding, now = Date.now() } = {}) {
  const missing = [];
  if (env.COMMERCE_LEDGER_ENABLED !== "true") missing.push("server_bridge_not_enabled");
  let verifiedMapping = null;
  try { verifiedMapping = mappingSnapshot(mapping, now); } catch { missing.push("verified_live_native_mapping"); }
  if (!store || (env.NODE_ENV === "production" && store.kind === "memory")) missing.push("durable_store");
  for (const [name, fn] of [["live_payment_verifier", resolveLivePayment], ["native_order_loader", loadNativeOrder], ["verified_customer_binding_loader", loadCustomerBinding]]) if (typeof fn !== "function") missing.push(name);
  return { ready: missing.length === 0, configured: !!verifiedMapping, missing, projectId: verifiedMapping?.projectId || null, sellerLegalName: COMMERCE_LEDGER_SELLER, financialProductEnabled: false };
}

/** Runtime deliberately needs inspected adapters; there is no automatic test/reconcile mapping. */
export function resolveCommerceLedgerRuntime(env = process.env, deps = {}) {
  const readiness = commerceLedgerReadiness({ env, ...deps, now: deps.now ? deps.now() : Date.now() });
  if (!readiness.ready) throw unavailable(readiness.missing.includes("verified_live_native_mapping") ? "commerce_ledger_native_mapping_unconfigured" : "commerce_ledger_unavailable");
  return createCommerceLedgerBridge({ ...deps, production: env.NODE_ENV === "production" });
}

function evidenceSnapshot(raw, mapping, now) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw forbidden("commerce_ledger_live_evidence_required");
  if (raw.mode !== "live" || raw.test === true || raw.mock === true || raw.invoice?.test === true || raw.outcome !== "confirmed" || !KINDS.has(raw.kind)) throw forbidden("commerce_ledger_live_evidence_required");
  for (const field of ["source", "merchantId", "storefrontId", "paymentMethodId", "processor", "currency", "projectId"]) if (raw[field] !== mapping[field]) throw conflict(`commerce_ledger_${field}_mismatch`);
  if (sellerName(raw.sellerLegalName) !== mapping.sellerLegalName || raw.storeOrigin !== mapping.storeOrigin) throw conflict("commerce_ledger_seller_mismatch");
  const proof = raw.proof;
  if (!proof || !PROOFS.has(proof.method) || proof.transportAuthenticated !== true || proof.liveModeVerified !== true || proof.moneyMovementConfirmed !== true || proof.movement !== raw.kind) throw forbidden("commerce_ledger_live_evidence_required");
  const verifiedAt = time(proof.verifiedAt, "evidenceVerifiedAt");
  const occurredAt = time(raw.occurredAt, "occurredAt");
  if (Date.parse(verifiedAt) > now || Date.parse(occurredAt) > now) throw conflict("commerce_ledger_evidence_time_invalid");
  return {
    source: mapping.source, eventId: identifier(raw.eventId, "eventId"), transactionId: identifier(raw.transactionId, "transactionId"),
    paymentId: identifier(raw.paymentId, "paymentId"), providerOrderId: identifier(raw.providerOrderId, "providerOrderId"),
    kind: raw.kind, amountMinor: amount(raw.amountMinor, "amount"), currency: mapping.currency,
    merchantId: mapping.merchantId, projectId: mapping.projectId, occurredAt,
    proof: { method: proof.method, evidenceId: identifier(proof.evidenceId, "evidenceId"), verifiedAt },
  };
}

function orderSnapshot(raw, binding, event, mapping) {
  if (!raw || raw.mode !== "live" || raw.test === true || raw.mock === true || raw.invoice?.test === true || raw.invoice?.number?.startsWith("TEST-") || raw.invoiceNumber?.startsWith("TEST-") || raw.kind !== "goods" || raw.approval !== "approved") throw forbidden("commerce_ledger_actual_goods_order_required");
  if (raw.providerOrderId !== event.providerOrderId) throw conflict("commerce_ledger_native_order_mismatch");
  for (const field of ["source", "merchantId", "storefrontId", "paymentMethodId", "processor", "projectId", "currency"]) if (raw[field] !== mapping[field]) throw conflict(`commerce_ledger_order_${field}_mismatch`);
  if (raw.storeOrigin !== mapping.storeOrigin || sellerName(raw.sellerLegalName) !== mapping.sellerLegalName) throw conflict("commerce_ledger_order_seller_mismatch");
  if (!/^MX-ORD-[0-9a-f]{32}$/.test(raw.commerceOrderId || "")) throw conflict("commerce_ledger_bound_commerce_order_required");
  const totalMinor = amount(raw.cashTotalMinor, "orderTotal");
  if ((event.kind === "capture" && event.amountMinor !== totalMinor) || BigInt(event.amountMinor) > BigInt(totalMinor)) throw conflict("commerce_ledger_order_amount_mismatch");
  if (amount(raw.principalMinor ?? "0", "principal", false) !== "0" || amount(raw.bonusMinor ?? "0", "bonus", false) !== "0") throw forbidden("commerce_ledger_financial_allocation_not_enabled");
  const bindingRef = identifier(raw.customerBindingRef, "customerBindingRef");
  if (!binding || binding.status !== "verified" || binding.source !== "server_account_binding" || binding.id !== bindingRef || binding.commerceOrderId !== raw.commerceOrderId || binding.providerOrderId !== event.providerOrderId || binding.projectId !== mapping.projectId || binding.organizationId !== mapping.organizationId || binding.merchantId !== mapping.merchantId || !/^usr_[0-9A-HJKMNP-TV-Z]{20}$/.test(binding.customerUserId || "")) throw forbidden("commerce_ledger_verified_customer_binding_required");
  if (raw.boundCustomerUserId && raw.boundCustomerUserId !== binding.customerUserId) throw conflict("commerce_ledger_customer_mismatch");
  if (!raw.boundCustomerUserId && binding.basis !== "durable_unique_portal_order_owner") throw forbidden("commerce_ledger_durable_guest_binding_required");
  const order = { id: raw.commerceOrderId, revisionId: identifier(raw.immutableOrderRevisionId, "orderRevision"), customerId: binding.customerUserId, projectId: mapping.projectId, merchantId: mapping.merchantId, currency: mapping.currency, totalMinor, kind: "goods", status: "approved", principalMinor: "0", bonusMinor: "0" };
  const nativeLink = { providerOrderId: event.providerOrderId, customerBindingId: bindingRef, customerBindingEvidenceId: identifier(binding.evidenceId, "customerBindingEvidenceId"), sellerLegalName: mapping.sellerLegalName, storeOrigin: mapping.storeOrigin, storefrontId: mapping.storefrontId, paymentMethodId: mapping.paymentMethodId, processor: mapping.processor };
  return { order, nativeLink };
}

const economicSnapshot = event => Object.fromEntries(Object.entries(event).filter(([key]) => !["eventId", "occurredAt", "proof"].includes(key)));
const failureCode = error => /^[a-z][a-z0-9_]{1,80}$/.test(error?.code || "") ? error.code : "commerce_ledger_processing_failed";

/**
 * All adapters are trusted server dependencies, not browser bodies:
 * resolveLivePayment(ref): authenticated provider query/verified webhook + approved live route.
 * loadNativeOrder(scope): independently load the actual immutable merchant/commerce order link.
 * loadCustomerBinding(scope): independently load verified durable account/order ownership.
 * Unknown native fields remain a setup blocker; no status P => captured inference is permitted.
 */
export function createCommerceLedgerBridge({ store, mapping: rawMapping, resolveLivePayment, loadNativeOrder, loadCustomerBinding, resolveAuthorizedRetry, now = () => Date.now(), production = false, leaseMs = 30000, maxRetries = 12, maxProcessingAttempts = 5, retryBaseMs = 1000, retryMaxMs = 300000 }) {
  if (!store || typeof store.get !== "function" || typeof store.commit !== "function" || (production && store.kind === "memory")) throw unavailable("commerce_ledger_durable_store_required");
  if (![resolveLivePayment, loadNativeOrder, loadCustomerBinding].every(fn => typeof fn === "function")) throw unavailable("commerce_ledger_native_adapters_unconfigured");
  if (!Number.isSafeInteger(leaseMs) || leaseMs < 1000 || leaseMs > 300000 || !Number.isInteger(maxRetries) || maxRetries < 1 || maxRetries > 50) throw new TypeError("invalid commerce ledger retry settings");
  if (!Number.isInteger(maxProcessingAttempts) || maxProcessingAttempts < 1 || maxProcessingAttempts > 20 || !Number.isSafeInteger(retryBaseMs) || retryBaseMs < 1000 || !Number.isSafeInteger(retryMaxMs) || retryMaxMs < retryBaseMs || retryMaxMs > 86400000) throw new TypeError("invalid commerce ledger backoff settings");
  const mapping = mappingSnapshot(rawMapping, now());
  const pendingIndex = `commerce-ledger:pending:${mapping.hash}`;
  const reviewIndex = `commerce-ledger:review:${mapping.hash}`;
  const workIdFor = event => idFor("clw", [event.source, event.merchantId, event.transactionId]);

  function checkWork(work, id) {
    if (!work || work.id !== id || work.mappingHash !== mapping.hash || work.id !== workIdFor(work.event) || work.fingerprint !== hashPayload({ economic: economicSnapshot(work.event), order: work.order, nativeLink: work.nativeLink, mappingHash: mapping.hash })) throw conflict("commerce_ledger_work_integrity_failed");
  }
  function validWorkState(doc) {
    if (!["pending", "processing", "completed", "review_required"].includes(doc.status) || !Number.isSafeInteger(doc.attempts) || doc.attempts < 0 || !Number.isSafeInteger(doc.retryCycleAttempts) || doc.retryCycleAttempts < 0 || doc.retryCycleAttempts > doc.attempts || !Number.isSafeInteger(doc.leaseUntil) || doc.leaseUntil < 0) return false;
    if (["completed", "review_required"].includes(doc.status)) return doc.nextAttemptAt === null && doc.leaseOwner === null && doc.leaseUntil === 0;
    if (!Number.isSafeInteger(doc.nextAttemptAt) || doc.nextAttemptAt < 0) return false;
    return doc.status === "pending" ? doc.leaseOwner === null && doc.leaseUntil === 0 : typeof doc.leaseOwner === "string" && doc.leaseOwner.length > 0 && doc.nextAttemptAt === doc.leaseUntil;
  }

  const ledger = createLedgerService({
    store, now, authorizeRead: async () => false,
    resolveVerifiedEvent: async workId => {
      const row = await store.get(TYPES.work, workId);
      if (!row) throw notFound("commerce_ledger_work_not_found");
      checkWork(row.doc, workId);
      return row.doc.event;
    },
    loadOrder: async orderId => {
      const row = await store.get(TYPES.order, orderId);
      if (!row || row.doc.mappingHash !== mapping.hash) return null;
      return row.doc.order;
    },
  });

  async function enqueueReference(reference) {
    identifier(reference, "opaqueReference");
    const observed = evidenceSnapshot(await resolveLivePayment(reference), mapping, now());
    const native = await loadNativeOrder({ providerOrderId: observed.providerOrderId, projectId: mapping.projectId, merchantId: mapping.merchantId, mappingId: mapping.id, mappingVersion: mapping.version });
    const binding = await loadCustomerBinding({ nativeOrder: native, providerOrderId: observed.providerOrderId, commerceOrderId: native?.commerceOrderId, customerBindingRef: native?.customerBindingRef, projectId: mapping.projectId, merchantId: mapping.merchantId });
    const { order, nativeLink } = orderSnapshot(native, binding, observed, mapping);
    const { providerOrderId, ...movement } = observed;
    const event = { ...movement, orderId: order.id, customerId: order.customerId };
    const workId = workIdFor(event);
    const inboxId = idFor("cli", [event.source, event.merchantId, event.eventId]);
    const fingerprint = hashPayload({ economic: economicSnapshot(event), order, nativeLink, mappingHash: mapping.hash });

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const [inboxRec, workRec, orderRec] = await Promise.all([store.get(TYPES.inbox, inboxId), store.get(TYPES.work, workId), store.get(TYPES.order, order.id)]);
      if (inboxRec && (inboxRec.doc.workId !== workId || inboxRec.doc.fingerprint !== fingerprint)) throw conflict("commerce_ledger_event_conflict");
      if (workRec && workRec.doc.fingerprint !== fingerprint) throw conflict("commerce_ledger_transaction_conflict");
      if (orderRec && (orderRec.doc.mappingHash !== mapping.hash || hashPayload(orderRec.doc.order) !== hashPayload(order) || hashPayload(orderRec.doc.nativeLink) !== hashPayload(nativeLink))) throw conflict("commerce_ledger_order_link_conflict");
      const nativeOwner = await store.getUnique("commerce_ledger_native_order", idFor("cln", [mapping.source, mapping.merchantId, providerOrderId]));
      const commerceOwner = await store.getUnique("commerce_ledger_commerce_order", idFor("clo", [mapping.source, mapping.merchantId, order.id]));
      if ((nativeOwner && nativeOwner !== order.id) || (commerceOwner && commerceOwner !== providerOrderId)) throw conflict("commerce_ledger_order_link_conflict");
      if (inboxRec && workRec) return { workId, inboxId, duplicate: true, status: workRec.doc.status };
      const at = now();
      const iso = new Date(at).toISOString();
      const writes = [{ type: TYPES.inbox, id: inboxId, expectedVersion: -1, doc: { id: inboxId, source: event.source, merchantId: event.merchantId, eventId: event.eventId, workId, fingerprint, proof: event.proof, receivedAt: iso, mappingHash: mapping.hash } }];
      if (!workRec) writes.push({ type: TYPES.work, id: workId, expectedVersion: -1, doc: { id: workId, mappingHash: mapping.hash, fingerprint, event, order, nativeLink, status: "pending", attempts: 0, retryCycleAttempts: 0, nextAttemptAt: at, reviewRequiredAt: null, createdAt: iso, updatedAt: iso, leaseOwner: null, leaseUntil: 0, ledgerJournalId: null, completedAt: null, lastErrorCode: null } });
      if (!orderRec) writes.push({ type: TYPES.order, id: order.id, expectedVersion: -1, doc: { id: order.id, mappingHash: mapping.hash, order, nativeLink, createdAt: iso } });
      const indexes = [{ name: `commerce-ledger:inbox:${workId}`, member: inboxId, score: at }];
      if (!workRec) indexes.push({ name: pendingIndex, member: workId, score: at });
      try {
        await store.commit(mergeCommits({ writes,
          uniques: [
            { name: "commerce_ledger_event", value: inboxId, owner: workId },
            { name: "commerce_ledger_transaction", value: workId, owner: workId },
            { name: "commerce_ledger_native_order", value: idFor("cln", [mapping.source, mapping.merchantId, providerOrderId]), owner: order.id },
            { name: "commerce_ledger_commerce_order", value: idFor("clo", [mapping.source, mapping.merchantId, order.id]), owner: providerOrderId },
          ], indexes,
        }, auditWrites({ now: at, actor: { kind: "merchant_verifier" }, action: "commerce.ledger_enqueued", objectType: "order", objectId: order.id, meta: { workId, inboxId, projectId: mapping.projectId, kind: event.kind, mappingId: mapping.id, mappingVersion: mapping.version } })));
        return { workId, inboxId, duplicate: !!workRec, status: workRec?.doc.status || "pending" };
      } catch (error) {
        if (error?.code === "version_conflict" || error?.code === "unique_conflict") continue;
        throw error;
      }
    }
    throw unavailable("commerce_ledger_enqueue_busy");
  }

  function reviewCommit(current, id, code, at) {
    const iso = new Date(at).toISOString();
    return mergeCommits({
      writes: [{ type: TYPES.work, id, expectedVersion: current.version, doc: { ...current.doc, status: "review_required", leaseOwner: null, leaseUntil: 0, nextAttemptAt: null, reviewRequiredAt: iso, lastErrorCode: code, updatedAt: iso } }],
      unindexes: [{ name: pendingIndex, member: id }], indexes: [{ name: reviewIndex, member: id, score: at }],
    }, auditWrites({ now: at, actor: { kind: "ledger_worker" }, action: "commerce.ledger_review_required", objectType: "commerceLedgerWork", objectId: id, meta: { workId: id, projectId: mapping.projectId, attempts: current.doc.attempts, code } }));
  }

  async function releaseFailedWork(id, owner, error) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const current = await store.get(TYPES.work, id);
        if (!current || current.doc.status === "completed" || current.doc.leaseOwner !== owner) return;
        const at = now(), code = failureCode(error);
        if (current.doc.retryCycleAttempts >= maxProcessingAttempts) await store.commit(reviewCommit(current, id, code, at));
        else {
          const nextAttemptAt = at + Math.min(retryMaxMs, retryBaseMs * 2 ** (current.doc.retryCycleAttempts - 1));
          await store.commit(mergeCommits({ writes: [{ type: TYPES.work, id, expectedVersion: current.version, doc: { ...current.doc, status: "pending", leaseOwner: null, leaseUntil: 0, nextAttemptAt, lastErrorCode: code, updatedAt: new Date(at).toISOString() } }], indexes: [{ name: pendingIndex, member: id, score: nextAttemptAt }] },
            auditWrites({ now: at, actor: { kind: "ledger_worker" }, action: "commerce.ledger_retry_scheduled", objectType: "commerceLedgerWork", objectId: id, meta: { workId: id, nextAttemptAt, attempts: current.doc.attempts, code } })));
        }
        return;
      } catch (failure) {
        if (failure?.code === "version_conflict") continue;
        return; // A failed release retains the durable lease/index score until it expires.
      }
    }
  }

  async function processWork(workId) {
    if (typeof workId !== "string" || !/^clw_[a-f0-9]{64}$/.test(workId)) throw badRequest("commerce_ledger_invalid_workId");
    const owner = newId("cllease");
    let claimed = null;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const current = await store.get(TYPES.work, workId);
      if (!current) throw notFound("commerce_ledger_work_not_found");
      if (current.doc.mappingHash !== mapping.hash) throw conflict("commerce_ledger_work_integrity_failed");
      try { checkWork(current.doc, workId); }
      catch (error) {
        if (current.doc.status !== "review_required") {
          try { await store.commit(reviewCommit(current, workId, failureCode(error), now())); }
          catch (failure) { if (failure?.code === "version_conflict") continue; throw failure; }
        }
        throw error;
      }
      if (!validWorkState(current.doc)) {
        try { await store.commit(reviewCommit(current, workId, "commerce_ledger_invalid_work_state", now())); }
        catch (error) { if (error?.code === "version_conflict") continue; throw error; }
        throw conflict("commerce_ledger_invalid_work_state");
      }
      if (current.doc.status === "completed") return { status: "completed", workId, ledgerJournalId: current.doc.ledgerJournalId, duplicate: true };
      if (current.doc.status === "processing" && current.doc.leaseUntil > now()) throw unavailable("commerce_ledger_worker_busy");
      if (current.doc.status === "review_required") throw conflict("commerce_ledger_review_required");
      if (!["pending", "processing"].includes(current.doc.status)) throw conflict("commerce_ledger_invalid_work_state");
      if (current.doc.retryCycleAttempts >= maxProcessingAttempts) {
        try { await store.commit(reviewCommit(current, workId, "commerce_ledger_attempts_exhausted", now())); }
        catch (error) { if (error?.code === "version_conflict") continue; throw error; }
        throw conflict("commerce_ledger_review_required");
      }
      if (current.doc.nextAttemptAt > now()) throw unavailable("commerce_ledger_retry_not_due");
      const at = now(), leaseUntil = at + leaseMs;
      const doc = { ...current.doc, status: "processing", leaseOwner: owner, leaseUntil, nextAttemptAt: leaseUntil, attempts: current.doc.attempts + 1, retryCycleAttempts: current.doc.retryCycleAttempts + 1, updatedAt: new Date(at).toISOString() };
      try { await store.commit({ writes: [{ type: TYPES.work, id: workId, expectedVersion: current.version, doc }], indexes: [{ name: pendingIndex, member: workId, score: leaseUntil }] }); claimed = doc; break; }
      catch (error) { if (error?.code === "version_conflict") continue; throw error; }
    }
    if (!claimed) throw unavailable("commerce_ledger_worker_busy");
    try {
      const posted = await ledger.postVerifiedEvent(workId);
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        const current = await store.get(TYPES.work, workId);
        if (!current) throw conflict("commerce_ledger_work_integrity_failed");
        checkWork(current.doc, workId);
        if (current.doc.status === "completed") return { status: "completed", workId, ledgerJournalId: current.doc.ledgerJournalId, duplicate: true };
        if (current.doc.leaseOwner !== owner) throw unavailable("commerce_ledger_lease_lost");
        const at = now();
        const doc = { ...current.doc, status: "completed", leaseOwner: null, leaseUntil: 0, nextAttemptAt: null, ledgerJournalId: posted.journalId, completedAt: new Date(at).toISOString(), updatedAt: new Date(at).toISOString(), lastErrorCode: null };
        try {
          await store.commit(mergeCommits({ writes: [{ type: TYPES.work, id: workId, expectedVersion: current.version, doc }], unindexes: [{ name: pendingIndex, member: workId }] },
            auditWrites({ now: at, actor: { kind: "ledger_worker" }, action: "commerce.ledger_completed", objectType: "order", objectId: current.doc.order.id, meta: { workId, ledgerJournalId: posted.journalId, projectId: mapping.projectId, duplicate: posted.duplicate } })));
          return { status: "completed", workId, ledgerJournalId: posted.journalId, duplicate: posted.duplicate };
        } catch (error) { if (error?.code === "version_conflict") continue; throw error; }
      }
      throw unavailable("commerce_ledger_completion_busy");
    } catch (error) {
      await releaseFailedWork(workId, owner, error);
      throw error;
    }
  }

  async function consumeReference(reference) {
    const enqueued = await enqueueReference(reference);
    return processWork(enqueued.workId);
  }
  async function retryPending({ limit = 25 } = {}) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw badRequest("commerce_ledger_invalid_limit");
    // The sorted score is a durable due time (or active lease expiry), not original enqueue age.
    const ids = await store.listIndex(pendingIndex, { limit, reverse: false, maxScore: now() });
    const results = [];
    for (const id of ids) {
      try { results.push(await processWork(id)); }
      catch (error) {
        const current = await store.get(TYPES.work, id);
        results.push({ workId: id, status: current?.doc.status || "pending", retryable: current?.doc.status !== "review_required", nextAttemptAt: current?.doc.nextAttemptAt ?? null, code: failureCode(error) });
      }
    }
    return { items: results };
  }
  async function readWorkStatus(workId) {
    if (typeof workId !== "string" || !/^clw_[a-f0-9]{64}$/.test(workId)) throw badRequest("commerce_ledger_invalid_workId");
    const row = await store.get(TYPES.work, workId);
    if (!row) throw notFound("commerce_ledger_work_not_found");
    checkWork(row.doc, workId);
    const doc = row.doc;
    return { workId, status: doc.status, attempts: doc.attempts, retryCycleAttempts: doc.retryCycleAttempts, nextAttemptAt: doc.nextAttemptAt, reviewRequiredAt: doc.reviewRequiredAt, ledgerJournalId: doc.ledgerJournalId, completedAt: doc.completedAt, lastErrorCode: doc.lastErrorCode };
  }

  /** Server operator-only: independently approved exact work/fingerprint case; never raw claims. */
  async function requeueReviewedWork(reference) {
    identifier(reference, "retryReference");
    if (typeof resolveAuthorizedRetry !== "function") throw unavailable("commerce_ledger_operator_retry_unconfigured");
    const raw = await resolveAuthorizedRetry(reference), at = now();
    if (!raw || raw.status !== "approved" || raw.capability !== "ledger:retry" || !/^clw_[a-f0-9]{64}$/.test(raw.workId || "") || raw.mappingHash !== mapping.hash || !/^[a-f0-9]{64}$/.test(raw.fingerprint || "") || !/^usr_[0-9A-HJKMNP-TV-Z]{20}$/.test(raw.actorUserId || "") || raw.proof?.method !== "authorized_operator") throw forbidden("commerce_ledger_operator_retry_approval_required");
    const verifiedAt = time(raw.proof.verifiedAt, "retryVerifiedAt"), expiresAt = time(raw.expiresAt, "retryExpiresAt");
    if (Date.parse(verifiedAt) > at || Date.parse(expiresAt) <= at) throw forbidden("commerce_ledger_operator_retry_approval_required");
    const approval = { id: identifier(raw.id, "retryApprovalId"), workId: raw.workId, fingerprint: raw.fingerprint, mappingHash: mapping.hash, actorUserId: raw.actorUserId, caseId: identifier(raw.caseId, "retryCaseId"), evidenceId: identifier(raw.proof.evidenceId, "retryEvidenceId"), verifiedAt, expiresAt };
    const approvalId = idFor("clr", [approval.id]), approvalHash = hashPayload(approval);
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const [existing, current] = await Promise.all([store.get(TYPES.retry, approvalId), store.get(TYPES.work, approval.workId)]);
      if (!current) throw notFound("commerce_ledger_work_not_found");
      checkWork(current.doc, approval.workId);
      if (current.doc.fingerprint !== approval.fingerprint) throw conflict("commerce_ledger_retry_work_mismatch");
      if (existing) {
        if (existing.doc.approvalHash !== approvalHash) throw conflict("commerce_ledger_retry_approval_conflict");
        return { workId: approval.workId, status: current.doc.status, duplicate: true };
      }
      if (current.doc.status !== "review_required") throw conflict("commerce_ledger_review_required_before_operator_retry");
      const retryAt = now();
      if (Date.parse(expiresAt) <= retryAt) throw forbidden("commerce_ledger_operator_retry_approval_required");
      try {
        await store.commit(mergeCommits({
          writes: [{ type: TYPES.retry, id: approvalId, expectedVersion: -1, doc: { ...approval, id: approvalId, approvalReferenceId: approval.id, approvalHash, consumedAt: new Date(retryAt).toISOString() } },
            { type: TYPES.work, id: approval.workId, expectedVersion: current.version, doc: { ...current.doc, status: "pending", retryCycleAttempts: 0, nextAttemptAt: retryAt, leaseOwner: null, leaseUntil: 0, reviewRequiredAt: null, lastOperatorRetryApprovalId: approvalId, updatedAt: new Date(retryAt).toISOString() } }],
          uniques: [{ name: "commerce_ledger_retry_approval", value: approvalId, owner: approval.workId }],
          unindexes: [{ name: reviewIndex, member: approval.workId }], indexes: [{ name: pendingIndex, member: approval.workId, score: retryAt }],
        }, auditWrites({ now: retryAt, actor: { kind: "operator", userId: approval.actorUserId }, action: "commerce.ledger_operator_retry_approved", objectType: "commerceLedgerWork", objectId: approval.workId, meta: { workId: approval.workId, approvalId, caseId: approval.caseId, evidenceId: approval.evidenceId, attempts: current.doc.attempts } })));
        return { workId: approval.workId, status: "pending", duplicate: false };
      } catch (error) { if (error?.code === "version_conflict" || error?.code === "unique_conflict") continue; throw error; }
    }
    throw unavailable("commerce_ledger_operator_retry_busy");
  }
  return Object.freeze({ enqueueReference, consumeReference, processWork, retryPending, readWorkStatus, requeueReviewedWork, mappingId: mapping.id, mappingVersion: mapping.version });
}
