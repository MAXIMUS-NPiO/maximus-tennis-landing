/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/** SERVER ONLY. Authenticated opaque delivery references are claims until native verification. */
import { correlationId, hashPayload, newId, safeEqual } from "./ids";
import { auditWrites, mergeCommits } from "./audit";
import { ApiError, badRequest, conflict, unavailable } from "./errors";
import { resolvePlatformStore } from "./store";
import { readRestCredentials } from "../intake/store";

const TYPE = "ledgerReferenceDelivery";
const MAX_BYTES = 1024;
const HEADERS = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store, private", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };
const response = (status, body, cid, extra = {}) => new Response(JSON.stringify({ ...body, correlationId: cid }), { status, headers: { ...HEADERS, "X-Correlation-ID": cid, ...extra } });
function opaqueReference(value) {
  if (typeof value !== "string" || value.length < 1 || value.length > 200 || value.trim() !== value || /[\u0000-\u001f\u007f]/.test(value) || /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(value)) throw badRequest("invalid_event_reference");
  return value;
}
const failureKind = error => [400, 403, 404, 409, 422].includes(error?.status) ? "verification_rejected" : "verification_unavailable";
const counts = () => ({ attempted: 0, completed: 0, deferred: 0, reviewRequired: 0 });
const discoveryCounts = () => ({ bindingsChecked: 0, movementsDiscovered: 0, referencesQueued: 0, deferred: 0, reviewRequired: 0 });
function boundedDiscoveryCounts(value) {
  const result = discoveryCounts();
  for (const key of Object.keys(result)) {
    if (!Number.isInteger(value?.[key]) || value[key] < 0 || value[key] > 100) throw unavailable("ledger_discovery_result_invalid");
    result[key] = value[key];
  }
  return result;
}
function combinedWorkCounts(first, second) {
  const combined = counts();
  for (const key of Object.keys(combined)) combined[key] = first[key] + second[key];
  return combined;
}

function underDeadline(operation, { signal, deadline, now }) {
  if (signal.aborted || now() >= deadline) return Promise.reject(unavailable("ledger_worker_deadline"));
  return new Promise((resolve, reject) => {
    const aborted = () => reject(unavailable("ledger_worker_deadline"));
    signal.addEventListener("abort", aborted, { once: true });
    Promise.resolve().then(() => {
      if (signal.aborted || now() >= deadline) throw unavailable("ledger_worker_deadline");
      return operation();
    }).then(value => signal.aborted || now() >= deadline ? reject(unavailable("ledger_worker_deadline")) : resolve(value), reject)
      .finally(() => signal.removeEventListener("abort", aborted));
  });
}
function deadlineStore(store, deadlineContext) {
  const methods = new Map();
  return new Proxy(store, { get(target, key) {
    const value = Reflect.get(target, key, target);
    if (typeof value !== "function") return value;
    if (!methods.has(key)) methods.set(key, (...args) => underDeadline(() => value.apply(target, args), deadlineContext));
    return methods.get(key);
  } });
}

/** No payment amounts, customer assertions, provider URLs or financial policy are accepted here. */
export function createLedgerWorker({ store, bridge, scope, resolveAuthorizedReferenceRetry, now = () => Date.now(), production = false, leaseMs = 60000, maxAttempts = 5, retryBaseMs = 1000, retryMaxMs = 300000, maxRetries = 12 }) {
  if (!store || !["get", "commit", "listIndex"].every(method => typeof store[method] === "function") || (production && store.kind === "memory")) throw unavailable("ledger_worker_durable_store_required");
  if (!bridge || !["enqueueReference", "processWork", "retryPending"].every(method => typeof bridge[method] === "function") || !/^[a-f0-9]{64}$/.test(scope?.mappingHash || "") || !/^[a-z][a-z0-9_-]{0,63}$/.test(scope?.projectId || "") || typeof scope?.source !== "string" || !scope.source || scope.source.length > 200 || /[\u0000-\u001f\u007f]/.test(scope.source)) throw unavailable("ledger_worker_scope_unverified");
  if (!Number.isSafeInteger(leaseMs) || leaseMs < 1000 || leaseMs > 300000 || !Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 20 || !Number.isSafeInteger(retryBaseMs) || retryBaseMs < 1000 || !Number.isSafeInteger(retryMaxMs) || retryMaxMs < retryBaseMs || retryMaxMs > 86400000 || !Number.isInteger(maxRetries) || maxRetries < 1 || maxRetries > 50) throw new TypeError("invalid reference delivery retry settings");
  const scoped = Object.freeze({ mappingHash: scope.mappingHash, source: scope.source, projectId: scope.projectId });
  const scopeHash = hashPayload(scoped);
  const dueIndex = `ledger-reference:due:${scopeHash}`;
  const reviewIndex = `ledger-reference:review:${scopeHash}`;
  const deliveryId = reference => `ldv_${hashPayload({ scope: scoped, reference })}`;
  const fingerprint = reference => hashPayload({ scope: scoped, reference });

  function validIdentity(doc, id) {
    try { return doc?.scopeHash === scopeHash && hashPayload(doc.scope) === hashPayload(scoped) && doc.id === id && deliveryId(opaqueReference(doc.reference)) === id && doc.fingerprint === fingerprint(doc.reference); }
    catch { return false; }
  }
  function validState(doc) {
    if (!["pending", "processing", "completed", "review_required"].includes(doc.status) || !Number.isSafeInteger(doc.attempts) || doc.attempts < 0 || !Number.isSafeInteger(doc.retryCycleAttempts) || doc.retryCycleAttempts < 0 || doc.retryCycleAttempts > doc.attempts || !Number.isSafeInteger(doc.leaseUntil) || doc.leaseUntil < 0) return false;
    if (["completed", "review_required"].includes(doc.status)) return doc.nextAttemptAt === null && doc.leaseOwner === null && doc.leaseUntil === 0;
    if (!Number.isSafeInteger(doc.nextAttemptAt) || doc.nextAttemptAt < 0) return false;
    return doc.status === "pending" ? doc.leaseOwner === null && doc.leaseUntil === 0 : typeof doc.leaseOwner === "string" && !!doc.leaseOwner && doc.nextAttemptAt === doc.leaseUntil;
  }
  function reviewCommit(rec, id, kind, at) {
    return mergeCommits({ writes: [{ type: TYPE, id, expectedVersion: rec.version, doc: { ...rec.doc, status: "review_required", nextAttemptAt: null, leaseOwner: null, leaseUntil: 0, reviewRequiredAt: new Date(at).toISOString(), lastFailureKind: kind } }], unindexes: [{ name: dueIndex, member: id }], indexes: [{ name: reviewIndex, member: id, score: at }] },
      auditWrites({ now: at, actor: { kind: "ledger_reference_worker" }, action: "ledger.reference_review_required", objectType: TYPE, objectId: id, meta: { scopeHash, attempts: rec.doc.attempts, kind } }));
  }

  async function receiveReference(reference) {
    opaqueReference(reference);
    const id = deliveryId(reference), at = now();
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const existing = await store.get(TYPE, id);
      if (existing) {
        if (!validIdentity(existing.doc, id)) throw conflict("ledger_reference_integrity_failed");
        return { deliveryId: id, status: existing.doc.status, duplicate: true };
      }
      try {
        await store.commit(mergeCommits({ writes: [{ type: TYPE, id, expectedVersion: -1, doc: { id, scope: scoped, scopeHash, reference, fingerprint: fingerprint(reference), status: "pending", attempts: 0, retryCycleAttempts: 0, nextAttemptAt: at, leaseOwner: null, leaseUntil: 0, bridgeWorkId: null, receivedAt: new Date(at).toISOString(), completedAt: null, reviewRequiredAt: null, lastFailureKind: null } }], uniques: [{ name: "ledger_reference_delivery", value: id, owner: id }], indexes: [{ name: dueIndex, member: id, score: at }] },
          auditWrites({ now: at, actor: { kind: "authenticated_server_delivery" }, action: "ledger.reference_received", objectType: TYPE, objectId: id, meta: { scopeHash } })));
        return { deliveryId: id, status: "pending", duplicate: false };
      } catch (error) { if (error?.code === "version_conflict" || error?.code === "unique_conflict") continue; throw error; }
    }
    throw unavailable("ledger_reference_enqueue_busy");
  }

  async function releaseFailure(id, owner, error) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const rec = await store.get(TYPE, id);
        if (!rec || rec.doc.status === "completed" || rec.doc.leaseOwner !== owner) return;
        const at = now(), kind = failureKind(error);
        if (rec.doc.retryCycleAttempts >= maxAttempts) await store.commit(reviewCommit(rec, id, kind, at));
        else {
          const nextAttemptAt = at + Math.min(retryMaxMs, retryBaseMs * 2 ** (rec.doc.retryCycleAttempts - 1));
          await store.commit(mergeCommits({ writes: [{ type: TYPE, id, expectedVersion: rec.version, doc: { ...rec.doc, status: "pending", nextAttemptAt, leaseOwner: null, leaseUntil: 0, lastFailureKind: kind } }], indexes: [{ name: dueIndex, member: id, score: nextAttemptAt }] },
            auditWrites({ now: at, actor: { kind: "ledger_reference_worker" }, action: "ledger.reference_retry_scheduled", objectType: TYPE, objectId: id, meta: { scopeHash, nextAttemptAt, attempts: rec.doc.attempts, kind } })));
        }
        return;
      } catch (failure) { if (failure?.code === "version_conflict") continue; return; }
    }
  }

  async function processDelivery(id) {
    if (!/^ldv_[a-f0-9]{64}$/.test(id || "")) throw badRequest("invalid_reference_delivery_id");
    const owner = newId("ldlease");
    let claimed;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const rec = await store.get(TYPE, id);
      if (!rec || rec.doc.scopeHash !== scopeHash) throw conflict("ledger_reference_scope_mismatch");
      if (!validIdentity(rec.doc, id) || !validState(rec.doc)) {
        try { await store.commit(reviewCommit(rec, id, "delivery_integrity_failed", now())); }
        catch (error) { if (error?.code === "version_conflict") continue; throw error; }
        throw conflict("ledger_reference_integrity_failed");
      }
      if (rec.doc.status === "completed") return { status: "completed", deliveryId: id, bridgeWorkId: rec.doc.bridgeWorkId, duplicate: true };
      if (rec.doc.status === "review_required") throw conflict("ledger_reference_review_required");
      if (rec.doc.status === "processing" && rec.doc.leaseUntil > now()) throw unavailable("ledger_reference_worker_busy");
      if (rec.doc.retryCycleAttempts >= maxAttempts) {
        try { await store.commit(reviewCommit(rec, id, "attempts_exhausted", now())); }
        catch (error) { if (error?.code === "version_conflict") continue; throw error; }
        throw conflict("ledger_reference_review_required");
      }
      if (rec.doc.nextAttemptAt > now()) throw unavailable("ledger_reference_retry_not_due");
      const leaseUntil = now() + leaseMs;
      const doc = { ...rec.doc, status: "processing", attempts: rec.doc.attempts + 1, retryCycleAttempts: rec.doc.retryCycleAttempts + 1, leaseOwner: owner, leaseUntil, nextAttemptAt: leaseUntil };
      try { await store.commit({ writes: [{ type: TYPE, id, expectedVersion: rec.version, doc }], indexes: [{ name: dueIndex, member: id, score: leaseUntil }] }); claimed = doc; break; }
      catch (error) { if (error?.code === "version_conflict") continue; throw error; }
    }
    if (!claimed) throw unavailable("ledger_reference_worker_busy");
    try {
      // Independent native queries happen inside bridge.enqueueReference; only then is work trusted.
      const enqueued = await bridge.enqueueReference(claimed.reference);
      if (!/^clw_[a-f0-9]{64}$/.test(enqueued?.workId || "")) throw unavailable("ledger_reference_handoff_invalid");
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        const rec = await store.get(TYPE, id);
        if (!rec || !validIdentity(rec.doc, id)) throw conflict("ledger_reference_integrity_failed");
        if (rec.doc.status === "completed") return { status: "completed", deliveryId: id, bridgeWorkId: rec.doc.bridgeWorkId, duplicate: true };
        if (rec.doc.leaseOwner !== owner) throw unavailable("ledger_reference_lease_lost");
        const at = now();
        try {
          await store.commit(mergeCommits({ writes: [{ type: TYPE, id, expectedVersion: rec.version, doc: { ...rec.doc, status: "completed", bridgeWorkId: enqueued.workId, nextAttemptAt: null, leaseOwner: null, leaseUntil: 0, completedAt: new Date(at).toISOString(), lastFailureKind: null } }], unindexes: [{ name: dueIndex, member: id }] },
            auditWrites({ now: at, actor: { kind: "ledger_reference_worker" }, action: "ledger.reference_verified_handoff", objectType: TYPE, objectId: id, meta: { scopeHash, bridgeWorkId: enqueued.workId } })));
          return { status: "completed", deliveryId: id, bridgeWorkId: enqueued.workId, duplicate: false };
        } catch (error) { if (error?.code === "version_conflict") continue; throw error; }
      }
      throw unavailable("ledger_reference_completion_busy");
    } catch (error) { await releaseFailure(id, owner, error); throw error; }
  }

  async function deliveryFailureStatus(id) {
    const rec = await store.get(TYPE, id);
    return rec?.doc.status === "review_required" ? "review_required" : "deferred";
  }
  async function quarantineIndexMember(member, kind, observed) {
    const id = `ldi_${hashPayload({ scopeHash, member })}`, at = now();
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const existing = await store.get("ledgerReferenceIndexIssue", id);
      if (observed?.doc.scopeHash === scopeHash && ["pending", "processing"].includes(observed.doc.status)) return false;
      const guard = observed?.doc.scopeHash === scopeHash
        ? { writes: [{ type: TYPE, id: member, expectedVersion: observed.version, doc: observed.doc }] }
        : !observed ? {
          // Atomic absence guard: no placeholder survives the commit; concurrent creation conflicts.
          writes: [{ type: TYPE, id: member, expectedVersion: -1, doc: { absenceGuard: true } }], deletes: [{ type: TYPE, id: member }],
        } : {};
      const indexChange = mergeCommits(guard, { unindexes: [{ name: dueIndex, member }], indexes: [{ name: `ledger-reference:index-review:${scopeHash}`, member: id, score: at }] });
      try {
        await store.commit(existing ? indexChange : mergeCommits(indexChange, { writes: [{ type: "ledgerReferenceIndexIssue", id, expectedVersion: -1, doc: { id, scope: scoped, scopeHash, kind, deliveryId: /^ldv_[a-f0-9]{64}$/.test(member) ? member : null, memberHash: hashPayload(member), detectedAt: new Date(at).toISOString() } }] },
          auditWrites({ now: at, actor: { kind: "ledger_reference_worker" }, action: "ledger.reference_index_quarantined", objectType: "ledgerReferenceIndexIssue", objectId: id, meta: { scopeHash, kind } })));
        return true;
      } catch (error) { if (error?.code === "version_conflict") { observed = await store.get(TYPE, member); continue; } throw error; }
    }
    throw unavailable("ledger_reference_index_repair_busy");
  }
  async function deliver(reference) {
    const received = await receiveReference(reference);
    const references = counts(), journal = counts(); references.attempted = 1;
    try {
      const verified = await processDelivery(received.deliveryId); references.completed = 1;
      journal.attempted = 1;
      try { const posted = await bridge.processWork(verified.bridgeWorkId); if (posted.status === "completed") journal.completed = 1; else journal.deferred = 1; }
      catch { journal.deferred = 1; }
    } catch {
      if (await deliveryFailureStatus(received.deliveryId) === "review_required") references.reviewRequired = 1;
      else references.deferred = 1;
    }
    return { duplicate: received.duplicate, references, journal };
  }

  async function runDue({ deliveryLimit = 2, journalLimit = 4, budgetMs = 45000 } = {}) {
    if (!Number.isInteger(deliveryLimit) || deliveryLimit < 1 || deliveryLimit > 10 || !Number.isInteger(journalLimit) || journalLimit < 1 || journalLimit > 20 || !Number.isSafeInteger(budgetMs) || budgetMs < 1000 || budgetMs > 45000) throw badRequest("invalid_worker_budget");
    const deadline = now() + budgetMs, references = counts(), journal = counts();
    const ids = await store.listIndex(dueIndex, { limit: deliveryLimit, reverse: false, maxScore: now() });
    for (const id of ids) {
      if (now() >= deadline) break;
      references.attempted++;
      const current = await store.get(TYPE, id);
      if (!current || current.doc.scopeHash !== scopeHash || ["completed", "review_required"].includes(current.doc.status)) {
        const quarantined = await quarantineIndexMember(id, !current ? "missing_document" : current.doc.scopeHash !== scopeHash ? "foreign_scope_member" : "stale_terminal_member", current);
        if (quarantined) references.reviewRequired++; else references.deferred++;
        continue;
      }
      try { await processDelivery(id); references.completed++; }
      catch { if (await deliveryFailureStatus(id) === "review_required") references.reviewRequired++; else references.deferred++; }
    }
    for (let attempt = 0; attempt < journalLimit && now() < deadline; attempt++) {
      const result = await bridge.retryPending({ limit: 1 });
      if (!result.items.length) break;
      journal.attempted++;
      if (result.items[0].status === "completed") journal.completed++;
      else if (result.items[0].status === "review_required") journal.reviewRequired++;
      else journal.deferred++;
    }
    return { references, journal, budgetExhausted: now() >= deadline };
  }

  /** Server-only operator recovery. Resolver independently checks active roles/MFA and exact case. */
  async function requeueReviewedReference(reference) {
    opaqueReference(reference);
    if (typeof resolveAuthorizedReferenceRetry !== "function") throw unavailable("ledger_reference_operator_retry_unconfigured");
    const raw = await resolveAuthorizedReferenceRetry(reference), at = now();
    if (!raw || raw.status !== "approved" || raw.capability !== "ledger:retry" || raw.scopeHash !== scopeHash || !/^ldv_[a-f0-9]{64}$/.test(raw.deliveryId || "") || !/^[a-f0-9]{64}$/.test(raw.fingerprint || "") || !/^usr_[0-9A-HJKMNP-TV-Z]{20}$/.test(raw.actorUserId || "") || raw.proof?.method !== "authorized_operator" || typeof raw.id !== "string" || !raw.id || raw.id.length > 200 || typeof raw.caseId !== "string" || !raw.caseId || raw.caseId.length > 200 || typeof raw.proof.evidenceId !== "string" || !raw.proof.evidenceId || raw.proof.evidenceId.length > 200) throw new ApiError(403, "ledger_reference_operator_approval_required");
    const expiresAt = Date.parse(raw.expiresAt), verifiedAt = Date.parse(raw.proof.verifiedAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= at || !Number.isFinite(verifiedAt) || verifiedAt > at) throw new ApiError(403, "ledger_reference_operator_approval_required");
    const approval = { approvalId: raw.id, deliveryId: raw.deliveryId, scopeHash, fingerprint: raw.fingerprint, actorUserId: raw.actorUserId, caseId: raw.caseId, evidenceId: raw.proof.evidenceId, verifiedAt: new Date(verifiedAt).toISOString(), expiresAt: new Date(expiresAt).toISOString() };
    const id = `ldr_${hashPayload({ scopeHash, approvalId: approval.approvalId })}`, approvalHash = hashPayload(approval);
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const [existing, current] = await Promise.all([store.get("ledgerReferenceRetryApproval", id), store.get(TYPE, approval.deliveryId)]);
      if (!current || !validIdentity(current.doc, approval.deliveryId) || !validState(current.doc) || current.doc.fingerprint !== approval.fingerprint) throw conflict("ledger_reference_retry_case_mismatch");
      if (existing) {
        if (existing.doc.approvalHash !== approvalHash) throw conflict("ledger_reference_retry_approval_conflict");
        return { deliveryId: approval.deliveryId, status: current.doc.status, duplicate: true };
      }
      if (current.doc.status !== "review_required") throw conflict("ledger_reference_review_required_before_retry");
      const retryAt = now();
      if (expiresAt <= retryAt) throw new ApiError(403, "ledger_reference_operator_approval_required");
      try {
        await store.commit(mergeCommits({ writes: [{ type: "ledgerReferenceRetryApproval", id, expectedVersion: -1, doc: { ...approval, id, approvalHash, consumedAt: new Date(retryAt).toISOString() } },
          { type: TYPE, id: approval.deliveryId, expectedVersion: current.version, doc: { ...current.doc, status: "pending", retryCycleAttempts: 0, nextAttemptAt: retryAt, leaseOwner: null, leaseUntil: 0, reviewRequiredAt: null, lastOperatorApprovalId: id } }], uniques: [{ name: "ledger_reference_retry_approval", value: id, owner: approval.deliveryId }], unindexes: [{ name: reviewIndex, member: approval.deliveryId }], indexes: [{ name: dueIndex, member: approval.deliveryId, score: retryAt }] },
          auditWrites({ now: retryAt, actor: { kind: "operator", userId: approval.actorUserId }, action: "ledger.reference_operator_retry", objectType: TYPE, objectId: approval.deliveryId, meta: { scopeHash, caseId: approval.caseId, approvalId: id, attempts: current.doc.attempts } })));
        return { deliveryId: approval.deliveryId, status: "pending", duplicate: false };
      } catch (error) { if (error?.code === "version_conflict" || error?.code === "unique_conflict") continue; throw error; }
    }
    throw unavailable("ledger_reference_operator_retry_busy");
  }
  return Object.freeze({ receiveReference, processDelivery, deliver, runDue, requeueReviewedReference });
}

async function readReferenceBody(request, timeoutMs) {
  const type = (request.headers.get("content-type") || "").split(";", 1)[0].trim().toLowerCase();
  if (type !== "application/json") throw new ApiError(415, "unsupported_media_type");
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_BYTES)) throw new ApiError(413, "too_large");
  if (!request.body) throw badRequest("invalid_event_reference");
  const reader = request.body.getReader(), decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0, text = "", timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new ApiError(408, "body_timeout")), timeoutMs); });
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), timeout]);
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) throw new ApiError(413, "too_large");
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } catch (error) { void reader.cancel().catch(() => {}); if (error instanceof ApiError) throw error; throw badRequest("invalid_event_reference"); }
  finally { clearTimeout(timer); }
  let body;
  try { body = JSON.parse(text); } catch { throw badRequest("invalid_event_reference"); }
  if (!body || Array.isArray(body) || typeof body !== "object" || Object.keys(body).length !== 1 || !Object.hasOwn(body, "eventReference")) throw badRequest("invalid_event_reference");
  return opaqueReference(body.eventReference);
}

async function nativeRuntime(args) {
  const { createNativeCommerceLedgerRuntime } = await import("./native-ledger-runtime");
  return createNativeCommerceLedgerRuntime(args);
}

/** Production routes inject no test dependencies. Auth and disabled gates run before source access. */
export async function handleLedgerWorkerRequest(request, action, { env = process.env, runtimeFactory = nativeRuntime, store, now = () => Date.now(), bodyTimeoutMs = 5000, requestTimeoutMs = 45000 } = {}) {
  const cid = correlationId(), startedAt = now();
  const method = action === "retry" ? "GET" : action === "event-reference" ? "POST" : null;
  if (!method || request.method !== method) return response(405, { status: "method_not_allowed" }, cid, { Allow: method || "GET, POST" });
  const secret = env.CRON_SECRET;
  if (typeof secret !== "string" || secret.length < 16 || secret.length > 4096) return response(503, { status: "not_configured" }, cid);
  if (!safeEqual(request.headers.get("authorization") || "", `Bearer ${secret}`)) return response(401, { status: "unauthorized" }, cid);
  // An authenticated disabled scheduler is a successful skip, with no adapter/store construction.
  if (env.COMMERCE_LEDGER_ENABLED !== "true") return response(action === "retry" ? 200 : 503, { status: "disabled", skipped: true }, cid);
  if (!Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs < 1 || requestTimeoutMs > 45000) return response(503, { status: "unavailable" }, cid);
  const controller = new AbortController(), deadline = startedAt + requestTimeoutMs;
  const deadlineContext = { signal: controller.signal, deadline, now };
  const timer = setTimeout(() => controller.abort(), Math.max(1, deadline - now()));
  try {
    if (new URL(request.url).search || (action === "retry" && request.body)) return response(400, { status: "invalid_request" }, cid);
    const reference = action === "event-reference" ? await underDeadline(() => readReferenceBody(request, bodyTimeoutMs), deadlineContext) : null;
    const durable = store || resolvePlatformStore(env, { readRestCredentials });
    if (!durable || (env.NODE_ENV === "production" && durable.kind === "memory")) return response(503, { status: "not_configured" }, cid);
    const scopedStore = deadlineStore(durable, deadlineContext);
    const runtime = await underDeadline(() => runtimeFactory({ env, store: scopedStore, now, signal: controller.signal }), deadlineContext);
    if (runtime?.readiness?.ready !== true || !runtime.bridge) return response(503, { status: "not_configured" }, cid);
    const worker = createLedgerWorker({ store: scopedStore, bridge: runtime.bridge, scope: runtime.readiness, now, production: env.NODE_ENV === "production" });
    if (action === "retry") {
      const initialRemaining = deadline - now();
      if (initialRemaining < 1000) throw unavailable("ledger_worker_deadline");
      let discovery = discoveryCounts();
      const hasPoller = runtime.poller !== undefined && runtime.poller !== null;
      if (hasPoller && typeof runtime.poller.pollOnce !== "function") throw unavailable("ledger_discovery_unconfigured");
      // Existing durable work has priority even when source discovery repeatedly exhausts its time.
      const first = await underDeadline(() => worker.runDue({
        deliveryLimit: hasPoller ? 1 : 2, journalLimit: hasPoller ? 2 : 4,
        budgetMs: Math.min(45000, initialRemaining),
      }), deadlineContext);
      if (hasPoller) {
        let callbacks = 0, received = 0;
        try {
          discovery = boundedDiscoveryCounts(await underDeadline(() => runtime.poller.pollOnce({
            limit: 1, deadlineAt: deadline, signal: controller.signal,
            enqueueReference: async opaque => {
              if (++callbacks > 100) throw unavailable("ledger_discovery_limit_exceeded");
              const result = await underDeadline(() => worker.receiveReference(opaque), deadlineContext);
              received++;
              return result;
            },
          }), deadlineContext));
        } catch {
          // Source outage must not strand already persisted references/economic work.
          discovery = { ...discoveryCounts(), referencesQueued: received, deferred: 1 };
        }
      }
      const remaining = deadline - now();
      if (controller.signal.aborted || remaining <= 0) throw unavailable("ledger_worker_deadline");
      if (!hasPoller || remaining < 1000) return response(200, { status: "ok", discovery, ...first, budgetExhausted: first.budgetExhausted || remaining < 1000 }, cid);
      const second = await underDeadline(() => worker.runDue({ deliveryLimit: 1, journalLimit: 2, budgetMs: Math.min(45000, remaining) }), deadlineContext);
      return response(200, { status: "ok", discovery,
        references: combinedWorkCounts(first.references, second.references), journal: combinedWorkCounts(first.journal, second.journal),
        budgetExhausted: first.budgetExhausted || second.budgetExhausted,
      }, cid);
    }
    const result = await underDeadline(() => worker.deliver(reference), deadlineContext);
    return response(202, { status: "accepted", ...result }, cid);
  } catch (error) {
    if (error instanceof ApiError && [400, 408, 413, 415].includes(error.status)) return response(error.status, { status: "invalid_request" }, cid);
    return response(503, { status: "unavailable" }, cid);
  } finally { clearTimeout(timer); controller.abort(); }
}
