/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/** SERVER ONLY. Discover movements of prior verified goods bindings; never create a payment. */
import { hashPayload, newId } from './ids';
import { auditWrites, mergeCommits } from './audit';
import { badRequest, conflict, unavailable } from './errors';
import { nativeId } from './native-read-http';

export const NATIVE_POLL_TYPES = Object.freeze({ cursor: 'nativePollCursor', binding: 'nativePollBinding', reference: 'nativePollReference' });
const HASH = /^[0-9a-f]{64}$/;
const integer = value => Number.isSafeInteger(value) && value >= 0;
const referenceValue = value => {
  if (typeof value !== 'string' || !value || value.length > 200 || value.trim() !== value || /[\u0000-\u001f\u007f]/.test(value) || /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(value)) throw conflict('native_poll_reference_invalid');
  return value;
};
const deadlineError = () => unavailable('native_poll_deadline');
const stats = () => ({ bindingsChecked: 0, movementsDiscovered: 0, referencesQueued: 0, deferred: 0, reviewRequired: 0 });

/** Adapters are trusted server functions. Neither this module nor its routes accept a customer order ID. */
export function createNativePoller({ store, scope, listBindings, discoverMovements, registerMovement,
  now = () => Date.now(), signal: runtimeSignal, production = false, intervalMs = 60000,
  leaseMs = 60000, retryBaseMs = 1000, retryMaxMs = 300000, maxAttempts = 5, maxCasAttempts = 8 } = {}) {
  if (!store || !['get', 'getUnique', 'commit', 'listIndex'].every(name => typeof store[name] === 'function') || (production && store.kind === 'memory')) throw unavailable('native_poll_durable_store_required');
  if (!HASH.test(scope?.mappingHash || '') || !/^[a-z][a-z0-9_-]{0,63}$/.test(scope?.projectId || '') || typeof scope?.source !== 'string' || !scope.source || scope.source.length > 200 || /[\u0000-\u001f\u007f]/.test(scope.source) || ![listBindings, discoverMovements, registerMovement].every(value => typeof value === 'function')) throw unavailable('native_poll_scope_unverified');
  if (!integer(intervalMs) || intervalMs < 60000 || intervalMs > 86400000 || !integer(leaseMs) || leaseMs < 45000 || leaseMs > 300000 || !integer(retryBaseMs) || retryBaseMs < 1000 || !integer(retryMaxMs) || retryMaxMs < retryBaseMs || retryMaxMs > 86400000 || !Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10 || !Number.isInteger(maxCasAttempts) || maxCasAttempts < 1 || maxCasAttempts > 20) throw new TypeError('invalid native polling settings');
  const scoped = Object.freeze({ mappingHash: scope.mappingHash, source: scope.source, projectId: scope.projectId });
  const scopeHash = hashPayload(scoped), cursorId = `npc_${scopeHash}`;
  const bindingIndex = `native-poll:bindings-due:${scopeHash}`, referenceIndex = `native-poll:references-due:${scopeHash}`;
  const bindingId = providerOrderId => `npb_${hashPayload({ scope: scoped, providerOrderId })}`;
  const referenceId = reference => `npr_${hashPayload({ scope: scoped, reference })}`;
  const audit = (id, action, at, extra = {}) => auditWrites({ now: at, actor: { kind: 'native_read_only_poller' }, action, objectType: 'nativePoll', objectId: id, meta: { scopeHash, ...extra } });
  const sameScope = doc => doc?.scopeHash === scopeHash && hashPayload(doc.scope) === scopeHash;
  const retryDelay = attempts => Math.min(retryMaxMs, retryBaseMs * 2 ** Math.min(attempts - 1, 30));
  const validState = doc => ['pending', 'processing', 'completed', 'review_required'].includes(doc?.status) && integer(doc.attempts) && integer(doc.failures) && integer(doc.leaseUntil) && (['completed', 'review_required'].includes(doc.status)
    ? doc.nextAttemptAt === null && doc.leaseOwner === null && doc.leaseUntil === 0
    : integer(doc.nextAttemptAt) && (doc.status === 'pending' ? doc.leaseOwner === null && doc.leaseUntil === 0 : typeof doc.leaseOwner === 'string' && !!doc.leaseOwner && doc.nextAttemptAt === doc.leaseUntil));
  function checkBinding(doc, id) {
    return sameScope(doc) && doc.id === id && id === bindingId(doc.binding?.providerOrderId) && validState(doc) && doc.status !== 'completed' && integer(doc.movementCursor) && doc.movementCursor <= 20 && HASH.test(doc.binding?.fingerprint || '') && doc.binding.id === `nb_${hashPayload([scoped.mappingHash, doc.binding.providerOrderId])}` && doc.binding.mappingHash === scoped.mappingHash && doc.binding.projectId === scoped.projectId && doc.binding.status === 'verified' && doc.binding.source === 'server_account_binding' && doc.identityHash === hashPayload(doc.binding);
  }
  function checkReference(doc, id) {
    try { return sameScope(doc) && doc.id === id && id === referenceId(referenceValue(doc.reference)) && validState(doc) && /^npb_[0-9a-f]{64}$/.test(doc.bindingId || '') && HASH.test(doc.movementHash || '') && doc.identityHash === hashPayload({ scope: scoped, reference: doc.reference, bindingId: doc.bindingId, movementHash: doc.movementHash }); }
    catch { return false; }
  }
  function minimalBinding(value) {
    nativeId(value?.providerOrderId);
    if (value.status !== 'verified' || value.source !== 'server_account_binding' || value.mappingHash !== scoped.mappingHash || value.projectId !== scoped.projectId || !HASH.test(value.fingerprint || '') || value.id !== `nb_${hashPayload([scoped.mappingHash, value.providerOrderId])}`) throw conflict('native_poll_binding_unverified');
    return Object.fromEntries(['id', 'providerOrderId', 'mappingHash', 'projectId', 'status', 'source', 'fingerprint'].map(key => [key, value[key]]));
  }

  async function pollOnce({ limit = 1, deadlineAt = now() + 45000, signal, enqueueReference } = {}) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 5 || !integer(deadlineAt) || deadlineAt <= now() || deadlineAt - now() > 45000) throw badRequest('native_poll_budget_invalid');
    if (typeof enqueueReference !== 'function') throw unavailable('native_poll_delivery_unconfigured');
    const result = stats(), controller = new AbortController();
    const abort = () => controller.abort();
    for (const source of [runtimeSignal, signal]) { if (source?.aborted) abort(); else source?.addEventListener('abort', abort, { once: true }); }
    const timer = setTimeout(abort, Math.max(1, deadlineAt - now()));
    const stopped = () => controller.signal.aborted || now() >= deadlineAt;
    function call(operation) {
      if (stopped()) return Promise.reject(deadlineError());
      return new Promise((resolve, reject) => {
        const aborted = () => reject(deadlineError());
        controller.signal.addEventListener('abort', aborted, { once: true });
        Promise.resolve().then(() => { if (stopped()) throw deadlineError(); return operation(); })
          .then(value => stopped() ? reject(deadlineError()) : resolve(value), reject)
          .finally(() => controller.signal.removeEventListener('abort', aborted));
      });
    }
    const get = (type, id) => call(() => store.get(type, id));
    const unique = (name, value) => call(() => store.getUnique(name, value));
    const commit = data => call(() => store.commit(data));
    const list = async (name, options) => {
      const members = await call(() => store.listIndex(name, options));
      if (!Array.isArray(members) || members.length > options.limit || members.some(member => typeof member !== 'string' || member.length > 200)) throw unavailable('native_poll_index_response_invalid');
      return members;
    };
    const adapterArgs = { deadlineAt, signal: controller.signal };

    async function ingestBindings() {
      const owner = newId('np_cursor_lease');
      let claimed;
      for (let attempt = 0; attempt < maxCasAttempts; attempt++) {
        const current = await get(NATIVE_POLL_TYPES.cursor, cursorId), d = current?.doc;
        if (d && (!sameScope(d) || d.id !== cursorId || !integer(d.offset) || !integer(d.leaseUntil))) throw conflict('native_poll_cursor_integrity_failed');
        if (d?.leaseUntil > now()) return;
        const doc = { id: cursorId, scope: scoped, scopeHash, offset: d?.offset || 0, leaseOwner: owner, leaseUntil: now() + leaseMs };
        try { await commit({ writes: [{ type: NATIVE_POLL_TYPES.cursor, id: cursorId, expectedVersion: current?.version ?? -1, doc }] }); claimed = doc; break; }
        catch (error) { if (error?.code === 'version_conflict') continue; throw error; }
      }
      if (!claimed) throw unavailable('native_poll_cursor_busy');
      try {
        const page = await call(() => listBindings({ offset: claimed.offset, limit: 10, ...adapterArgs }));
        if (!page || !Array.isArray(page.items) || page.items.length > 10 || (page.nextOffset !== null && (!integer(page.nextOffset) || !page.items.length || page.nextOffset !== claimed.offset + page.items.length))) throw conflict('native_poll_binding_page_invalid');
        const writes = [], indexes = [], seen = new Set();
        for (let position = 0; position < page.items.length; position++) {
          const raw = page.items[position];
          let binding;
          try { binding = minimalBinding(raw); } catch {
            const issueId = `npi_${hashPayload([scopeHash, 'binding-page', claimed.offset, position, typeof raw?.id === 'string' ? raw.id : null])}`;
            if (!await get('nativePollIndexIssue', issueId)) {
              writes.push({ type: 'nativePollIndexIssue', id: issueId, expectedVersion: -1, doc: { id: issueId, scope: scoped, scopeHash, reason: 'unverified_binding_page_member', detectedAt: new Date(now()).toISOString() } });
              result.reviewRequired++;
            }
            continue;
          }
          const id = bindingId(binding.providerOrderId);
          if (seen.has(id)) continue; seen.add(id);
          const existing = await get(NATIVE_POLL_TYPES.binding, id);
          if (existing) {
            if (!checkBinding(existing.doc, id) || existing.doc.identityHash !== hashPayload(binding)) result.reviewRequired++;
            else if (['pending', 'processing'].includes(existing.doc.status)) {
              // Restore a lost membership without changing a concurrent lease or reviving review.
              writes.push({ type: NATIVE_POLL_TYPES.binding, id, expectedVersion: existing.version, doc: existing.doc });
              indexes.push({ name: bindingIndex, member: id, score: existing.doc.nextAttemptAt });
            }
            continue;
          }
          const at = now();
          writes.push({ type: NATIVE_POLL_TYPES.binding, id, expectedVersion: -1, doc: { id, scope: scoped, scopeHash, binding, identityHash: hashPayload(binding), status: 'pending', attempts: 0, failures: 0, movementCursor: 0, nextAttemptAt: at, leaseOwner: null, leaseUntil: 0, lastFailureKind: null, lastCheckedAt: null } });
          indexes.push({ name: bindingIndex, member: id, score: at });
        }
        const current = await get(NATIVE_POLL_TYPES.cursor, cursorId);
        if (!current || current.doc.leaseOwner !== owner) throw unavailable('native_poll_cursor_lease_lost');
        writes.push({ type: NATIVE_POLL_TYPES.cursor, id: cursorId, expectedVersion: current.version, doc: { ...current.doc, offset: page.nextOffset ?? 0, leaseOwner: null, leaseUntil: 0 } });
        await commit({ writes, indexes });
      } catch (error) {
        // A failed page never advances the cursor. An expired lease resumes the same page.
        if (!stopped()) {
          const current = await get(NATIVE_POLL_TYPES.cursor, cursorId);
          if (current?.doc.leaseOwner === owner) try { await commit({ writes: [{ type: NATIVE_POLL_TYPES.cursor, id: cursorId, expectedVersion: current.version, doc: { ...current.doc, leaseOwner: null, leaseUntil: 0 } }] }); } catch { /* CAS winner will resume. */ }
        }
        throw error;
      }
    }

    async function quarantineIndex(type, name, id, reason, observed) {
      // Scoped repair cannot alter another scope's document. Guard absence/current version atomically.
      const guard = observed && sameScope(observed.doc) ? { writes: [{ type, id, expectedVersion: observed.version, doc: observed.doc }] }
        : !observed ? { writes: [{ type, id, expectedVersion: -1, doc: { absenceGuard: true } }], deletes: [{ type, id }] } : {};
      const issueId = `npi_${hashPayload([scopeHash, name, id, reason])}`, existing = await get('nativePollIndexIssue', issueId);
      await commit(mergeCommits(guard, { unindexes: [{ name, member: id }] }, existing ? {} : { writes: [{ type: 'nativePollIndexIssue', id: issueId, expectedVersion: -1, doc: { id: issueId, scope: scoped, scopeHash, memberHash: hashPayload(id), reason, detectedAt: new Date(now()).toISOString() } }] }));
      result.reviewRequired++;
    }
    async function claim(type, id, name, validate) {
      const owner = newId('np_lease');
      for (let attempt = 0; attempt < maxCasAttempts; attempt++) {
        const current = await get(type, id);
        if (!current || !validate(current.doc, id)) { await quarantineIndex(type, name, id, !current ? 'missing_document' : 'identity_or_state_invalid', current); return null; }
        if (['completed', 'review_required'].includes(current.doc.status)) { await quarantineIndex(type, name, id, 'stale_terminal_index', current); return null; }
        if (current.doc.nextAttemptAt > now() || (current.doc.status === 'processing' && current.doc.leaseUntil > now())) {
          // A stale earlier index score must not monopolise a bounded batch indefinitely.
          try {
            await commit({ writes: [{ type, id, expectedVersion: current.version, doc: current.doc }], indexes: [{ name, member: id, score: current.doc.nextAttemptAt }] });
            return null;
          } catch (error) { if (error?.code === 'version_conflict') continue; throw error; }
        }
        if (current.doc.failures >= maxAttempts) {
          try {
            await commit(mergeCommits({ writes: [{ type, id, expectedVersion: current.version, doc: { ...current.doc, status: 'review_required', nextAttemptAt: null, leaseOwner: null, leaseUntil: 0, lastFailureKind: 'attempts_exhausted' } }], unindexes: [{ name, member: id }] }, audit(id, 'commerce.native_poll_review_required', now())));
            result.reviewRequired++; return null;
          } catch (error) { if (error?.code === 'version_conflict') continue; throw error; }
        }
        const leaseUntil = now() + leaseMs;
        const doc = { ...current.doc, status: 'processing', leaseOwner: owner, leaseUntil, nextAttemptAt: leaseUntil, attempts: current.doc.attempts + 1, failures: current.doc.failures + 1 };
        try { await commit({ writes: [{ type, id, expectedVersion: current.version, doc }], indexes: [{ name, member: id, score: leaseUntil }] }); return { doc, owner }; }
        catch (error) { if (error?.code === 'version_conflict') continue; throw error; }
      }
      throw unavailable('native_poll_claim_busy');
    }
    async function finish(type, id, name, owner, { failure, complete = false } = {}) {
      if (stopped()) return false;
      for (let attempt = 0; attempt < maxCasAttempts; attempt++) {
        const current = await get(type, id);
        if (!current || current.doc.leaseOwner !== owner) return false;
        const at = now(), failures = failure ? Math.max(1, current.doc.failures) : 0;
        const review = !!failure && (failures >= maxAttempts || [400, 403, 404, 409, 422].includes(failure?.status));
        const terminal = review || complete;
        const nextAttemptAt = terminal ? null : at + (failure ? retryDelay(failures) : intervalMs);
        const doc = { ...current.doc, status: review ? 'review_required' : complete ? 'completed' : 'pending', failures, nextAttemptAt, leaseOwner: null, leaseUntil: 0, lastFailureKind: failure ? 'read_or_delivery_unavailable' : null, lastCheckedAt: new Date(at).toISOString() };
        try {
          await commit(mergeCommits({ writes: [{ type, id, expectedVersion: current.version, doc }], ...(terminal ? { unindexes: [{ name, member: id }] } : { indexes: [{ name, member: id, score: nextAttemptAt }] }) }, audit(id, review ? 'commerce.native_poll_review_required' : failure ? 'commerce.native_poll_deferred' : complete ? 'commerce.native_poll_reference_delivered' : 'commerce.native_order_polled', at)));
          if (review) result.reviewRequired++;
          return true;
        } catch (error) { if (error?.code === 'version_conflict') continue; throw error; }
      }
      throw unavailable('native_poll_completion_busy');
    }
    async function persistOutbox(binding, movement, reference) {
      referenceValue(reference);
      const id = referenceId(reference), boundId = bindingId(binding.providerOrderId), movementHash = hashPayload({ providerOrderId: binding.providerOrderId, transactionId: movement.transactionId, kind: movement.kind });
      const identityHash = hashPayload({ scope: scoped, reference, bindingId: boundId, movementHash });
      for (let attempt = 0; attempt < maxCasAttempts; attempt++) {
        const existing = await get(NATIVE_POLL_TYPES.reference, id);
        if (existing) {
          if (!checkReference(existing.doc, id) || existing.doc.identityHash !== identityHash) throw conflict('native_poll_reference_conflict');
          try {
            await commit({ writes: [{ type: NATIVE_POLL_TYPES.reference, id, expectedVersion: existing.version, doc: existing.doc }], uniques: [{ name: 'native_poll_movement', value: hashPayload([scopeHash, movementHash]), owner: id }], ...(['pending', 'processing'].includes(existing.doc.status) ? { indexes: [{ name: referenceIndex, member: id, score: existing.doc.nextAttemptAt }] } : {}) });
            return;
          } catch (error) { if (error?.code === 'version_conflict') continue; throw error; }
        }
        const at = now();
        try {
          await commit(mergeCommits({ writes: [{ type: NATIVE_POLL_TYPES.reference, id, expectedVersion: -1, doc: { id, scope: scoped, scopeHash, reference, bindingId: boundId, movementHash, identityHash, status: 'pending', attempts: 0, failures: 0, nextAttemptAt: at, leaseOwner: null, leaseUntil: 0, lastFailureKind: null, lastCheckedAt: null } }], uniques: [{ name: 'native_poll_movement', value: hashPayload([scopeHash, movementHash]), owner: id }], indexes: [{ name: referenceIndex, member: id, score: at }] }, audit(id, 'commerce.native_poll_reference_discovered', at)));
          return;
        } catch (error) { if (error?.code === 'version_conflict') continue; throw error; }
      }
      throw unavailable('native_poll_outbox_busy');
    }
    async function restoreKnownMovement(binding, movement) {
      const movementHash = hashPayload({ providerOrderId: binding.providerOrderId, transactionId: movement.transactionId, kind: movement.kind });
      const id = await unique('native_poll_movement', hashPayload([scopeHash, movementHash]));
      if (!id) return false;
      for (let attempt = 0; attempt < maxCasAttempts; attempt++) {
        const existing = await get(NATIVE_POLL_TYPES.reference, id);
        if (!existing || !checkReference(existing.doc, id) || existing.doc.bindingId !== bindingId(binding.providerOrderId) || existing.doc.movementHash !== movementHash) throw conflict('native_poll_movement_identity_failed');
        if (!['pending', 'processing'].includes(existing.doc.status)) return true;
        try {
          await commit({ writes: [{ type: NATIVE_POLL_TYPES.reference, id, expectedVersion: existing.version, doc: existing.doc }], indexes: [{ name: referenceIndex, member: id, score: existing.doc.nextAttemptAt }] });
          return true;
        } catch (error) { if (error?.code === 'version_conflict') continue; throw error; }
      }
      throw unavailable('native_poll_movement_restore_busy');
    }
    async function advanceMovementCursor(id, owner, cursor) {
      for (let attempt = 0; attempt < maxCasAttempts; attempt++) {
        const current = await get(NATIVE_POLL_TYPES.binding, id);
        if (!current || !checkBinding(current.doc, id) || current.doc.leaseOwner !== owner) throw unavailable('native_poll_binding_lease_lost');
        try {
          // Confirmed durable progress is not a failed attempt. Large partial scans can need
          // more than five invocations; an outage before any progress remains bounded.
          await commit({ writes: [{ type: NATIVE_POLL_TYPES.binding, id, expectedVersion: current.version, doc: { ...current.doc, movementCursor: cursor, failures: 0 } }] }); return;
        } catch (error) { if (error?.code === 'version_conflict') continue; throw error; }
      }
      throw unavailable('native_poll_movement_cursor_busy');
    }
    let deliveryAttempts = 0;
    async function flushOutbox() {
      const remaining = 20 - deliveryAttempts;
      if (remaining < 1 || stopped()) return;
      const ids = await list(referenceIndex, { limit: remaining, reverse: false, maxScore: now() });
      for (const id of ids) {
        if (stopped()) break;
        deliveryAttempts++;
        const claimed = await claim(NATIVE_POLL_TYPES.reference, id, referenceIndex, checkReference);
        if (!claimed) continue;
        try {
          // Only an opaque reference enters the existing independently verifying worker.
          const received = await call(() => enqueueReference(claimed.doc.reference));
          if (!/^ldv_[0-9a-f]{64}$/.test(received?.deliveryId || '') || !['pending', 'processing', 'completed', 'review_required'].includes(received.status)) throw unavailable('native_poll_delivery_handoff_invalid');
          if (await finish(NATIVE_POLL_TYPES.reference, id, referenceIndex, claimed.owner, { complete: true })) result.referencesQueued++;
        } catch (error) { result.deferred++; await finish(NATIVE_POLL_TYPES.reference, id, referenceIndex, claimed.owner, { failure: error }); }
      }
    }
    try {
      await flushOutbox();
      try { await ingestBindings(); } catch { result.deferred++; }
      if (!stopped()) {
        const ids = await list(bindingIndex, { limit, reverse: false, maxScore: now() });
        for (const id of ids) {
          if (stopped()) break;
          const claimed = await claim(NATIVE_POLL_TYPES.binding, id, bindingIndex, checkBinding);
          if (!claimed) continue;
          result.bindingsChecked++;
          try {
            const binding = structuredClone(claimed.doc.binding);
            const movements = await call(() => discoverMovements({ binding, ...adapterArgs }));
            if (!Array.isArray(movements) || movements.length > 20) throw conflict('native_poll_movements_invalid');
            const seen = new Set(), candidates = [];
            for (const movement of movements) {
              nativeId(movement?.transactionId);
              if (!['capture', 'refund'].includes(movement.kind) || (movement.providerOrderId !== undefined && movement.providerOrderId !== binding.providerOrderId)) throw conflict('native_poll_movement_scope_invalid');
              const key = hashPayload([movement.transactionId, movement.kind]);
              if (seen.has(key)) continue; seen.add(key); candidates.push({ transactionId: movement.transactionId, kind: movement.kind });
            }
            // Make the complete goods capture durable before its dependent refunds even when
            // provider transaction identifiers happen to sort in the opposite order.
            candidates.sort((a, b) => (a.kind === 'capture' ? 0 : 1) - (b.kind === 'capture' ? 0 : 1) || a.transactionId.localeCompare(b.transactionId));
            const start = candidates.length ? claimed.doc.movementCursor % candidates.length : 0;
            for (let position = 0; position < candidates.length; position++) {
              const index = (start + position) % candidates.length, movement = candidates[index]; result.movementsDiscovered++;
              if (!await restoreKnownMovement(binding, movement)) {
                // Independently read MPGS again only for a new movement, before durable registration.
                const registered = await call(() => registerMovement({ binding, transactionId: movement.transactionId, kind: movement.kind, ...adapterArgs }));
                await persistOutbox(binding, movement, registered?.eventReference);
              }
              // Partial scans resume beyond completed movements, including after a deadline/crash.
              await advanceMovementCursor(id, claimed.owner, (index + 1) % candidates.length);
            }
            await finish(NATIVE_POLL_TYPES.binding, id, bindingIndex, claimed.owner);
          } catch (error) { result.deferred++; await finish(NATIVE_POLL_TYPES.binding, id, bindingIndex, claimed.owner, { failure: error }); }
        }
      }
      await flushOutbox();
      return result;
    } catch (error) {
      if (stopped()) { result.deferred++; return result; }
      throw error;
    } finally {
      clearTimeout(timer); controller.abort();
      for (const source of [runtimeSignal, signal]) source?.removeEventListener('abort', abort);
    }
  }
  return Object.freeze({ pollOnce });
}
