/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/** SERVER ONLY. Authenticated control-payment observations; no payment/refund execution or ledger. */
import { hashPayload } from '../platform/ids';
import { auditWrites, mergeCommits } from '../platform/audit';
import { badRequest, conflict, unavailable } from '../platform/errors';
import { TENNIS_CONTROL_SCOPE } from './tennis-control-order';
import { NATIVE_MPGS_MERCHANT, MPGS_MERCHANT_ID } from '../platform/native-mpgs';

export const TENNIS_CONTROL_PROOF_TYPE = 'tennisControlPaymentProof';
const FIELDS = ['providerOrderId', 'transactionId', 'kind', 'amountMinor', 'currency', 'totalMinor', 'capturedMinor', 'refundedMinor', 'occurredAt', 'merchantId'];
const pick = (d, keys) => Object.fromEntries(keys.map(k => [k, d[k]]));
const economic = d => pick(d, FIELDS.filter(k => !['capturedMinor', 'refundedMinor'].includes(k)));
const fingerprint = d => hashPayload(Object.fromEntries(Object.entries(d).filter(([k]) => k !== 'fingerprint')));
const seal = d => ({ ...d, fingerprint: fingerprint(d) });
const iso = t => typeof t === 'string' && Number.isFinite(Date.parse(t)) && new Date(Date.parse(t)).toISOString() === t;
const minor = n => typeof n === 'string' && /^(0|[1-9]\d{0,2})$/.test(n) && BigInt(n) <= 100n;
// Authenticated gateway evidence that contradicts the control scope (wrong currency/total/merchant,
// partial captures, unparseable financial fields) is a sticky review hold, never a transport retry.
const REVIEW_ERRORS = new Set(['native_mpgs_history_requires_review', 'native_mpgs_refund_history_requires_review', 'native_mpgs_dispute_requires_review', 'native_mpgs_multi_capture_requires_review',
  'native_mpgs_order_mismatch', 'native_mpgs_totals_invalid', 'native_mpgs_movement_unconfirmed', 'native_mpgs_movement_amount_invalid', 'native_mpgs_transaction_missing_or_ambiguous', 'native_mpgs_discovery_requires_review', 'native_amount_invalid', 'native_time_invalid']);

/** orders is the private control-order service; callers cannot supply owner/provider/payment facts. */
export function createTennisControlProofService({ store, orders, reader, merchantId = NATIVE_MPGS_MERCHANT, now = () => Date.now(), production = process.env.NODE_ENV === 'production' } = {}) {
  if (typeof window !== 'undefined' || !store || !['get', 'getUnique', 'commit'].every(k => typeof store[k] === 'function') || typeof orders?.readOwnRecord !== 'function' || typeof reader?.discoverMovements !== 'function' || (production && store.kind !== 'upstash') || typeof merchantId !== 'string' || !MPGS_MERCHANT_ID.test(merchantId)) throw unavailable('control_proof_runtime_unavailable');
  const publicProof = (d, duplicate = false) => ({ orderId: d.id, status: d.status, currency: 'USD', totalMinor: '100', capturedMinor: d.capturedMinor, refundedMinor: d.refundedMinor, movementCount: d.movements.length, observedAt: d.observedAt, reason: d.reason, duplicate, ledgerPosted: false });
  async function binding(input) {
    const { order: o, attempt: a } = await orders.readOwnRecord(input);
    if (!o || !a || o.id !== input.orderId || !/^MX-CTL-[a-f0-9]{32}$/.test(o.id) || o.scopeHash !== TENNIS_CONTROL_SCOPE.hash || a.scopeHash !== o.scopeHash || o.kind !== 'payment_control' || a.kind !== o.kind || o.currency !== 'USD' || a.currency !== 'USD' || o.totalMinor !== '100' || a.totalMinor !== '100' || o.fulfillment !== 'none' || a.orderId !== o.id || a.ownerUserId !== o.ownerUserId || a.snapshotHash !== o.snapshotHash || !/^[a-f0-9]{64}$/.test(o.snapshotHash || '') || !/^[a-f0-9]{64}$/.test(a.identityHash || '') || !/^MC[a-f0-9]{32}$/.test(a.providerOrderId || '') || a.createAttempts !== 1 || !Number.isSafeInteger(a.attemptedAt) || a.attemptedAt < 0 || a.attemptedAt > now()) throw conflict('control_proof_binding_invalid');
    return { id: o.id, ownerUserId: o.ownerUserId, providerOrderId: a.providerOrderId, attemptedAt: a.attemptedAt, hash: hashPayload([o.id, o.ownerUserId, o.snapshotHash, a.identityHash]) };
  }
  function observation(raw, b) {
    if (!Array.isArray(raw) || raw.length > 20) throw conflict('control_proof_observation_invalid');
    const ids = new Set();
    const movements = raw.map(m => {
      if (!m || m.providerOrderId !== b.providerOrderId || m.merchantId !== merchantId || m.currency !== 'USD' || m.totalMinor !== '100' || m.capturedMinor !== '100' || !['capture', 'refund'].includes(m.kind) || !/^[A-Za-z0-9_-]{1,40}$/.test(m.transactionId || '') || !minor(m.amountMinor) || m.amountMinor === '0' || !minor(m.refundedMinor) || (m.kind === 'capture' && m.amountMinor !== '100') || !iso(m.occurredAt) || !iso(m.verifiedAt) || Date.parse(m.occurredAt) < b.attemptedAt || Date.parse(m.verifiedAt) < Date.parse(m.occurredAt) || Date.parse(m.verifiedAt) > now() || m.evidenceHash !== hashPayload(pick(m, FIELDS)) || ids.has(m.transactionId)) throw conflict('control_proof_observation_invalid');
      ids.add(m.transactionId);
      return { ...pick(m, FIELDS), verifiedAt: m.verifiedAt, evidenceHash: m.evidenceHash };
    }).sort((a, b) => a.transactionId.localeCompare(b.transactionId));
    if (!movements.length) return { movements, status: 'pending', capturedMinor: '0', refundedMinor: '0' };
    const captured = movements.filter(m => m.kind === 'capture');
    const refunded = movements.filter(m => m.kind === 'refund').reduce((n, m) => n + BigInt(m.amountMinor), 0n);
    if (captured.length !== 1 || refunded > 100n || movements.some(m => BigInt(m.refundedMinor) !== refunded)) throw conflict('control_proof_observation_incomplete');
    return { movements, status: refunded === 100n ? 'refunded' : refunded ? 'partially_refunded' : 'captured', capturedMinor: '100', refundedMinor: String(refunded) };
  }
  async function rowFor(b) {
    const row = await store.get(TENNIS_CONTROL_PROOF_TYPE, b.id), d = row?.doc;
    if (d && (d.id !== b.id || d.bindingHash !== b.hash || d.fingerprint !== fingerprint(d) || !['pending', 'captured', 'partially_refunded', 'refunded', 'review_required'].includes(d.status) || !Array.isArray(d.movements) || !minor(d.capturedMinor) || !minor(d.refundedMinor) || BigInt(d.refundedMinor) > BigInt(d.capturedMinor))) throw conflict('control_proof_state_changed');
    return row;
  }
  async function inspect(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => !['ctx', 'orderId'].includes(k))) throw badRequest('control_proof_input_invalid');
    const b = await binding(input);
    let baseline = await rowFor(b);
    let current, reason = null;
    async function readObservation() {
      current = undefined;
      try { current = observation(await reader.discoverMovements({ providerOrderId: b.providerOrderId, limit: 20 }), b); }
      catch (error) {
        if (REVIEW_ERRORS.has(error?.code)) reason = 'provider_history_requires_review';
        else if (error?.code === 'control_proof_observation_invalid' || error?.code === 'control_proof_observation_incomplete') reason = 'provider_observation_requires_review';
        else throw unavailable('control_proof_reader_unavailable');
      }
    }
    await readObservation();
    for (let retry = 0; retry < 8; retry++) {
      if ((await binding(input)).hash !== b.hash) throw conflict('control_proof_binding_changed');
      const row = await rowFor(b), previous = row?.doc;
      if (previous?.status === 'review_required') return publicProof(previous, true);
      // A response begun before another verifier's durable commit may be stale even when it
      // arrives later. Read again against that version before diagnosing a history regression.
      // Authenticated unsupported/invalid monetary evidence still requires sticky review.
      if (!reason && (row?.version ?? -1) !== (baseline?.version ?? -1)) {
        baseline = row;
        await readObservation();
        continue;
      }
      if (previous && current) {
        const newer = new Map(current.movements.map(m => [m.transactionId, m]));
        if (BigInt(current.capturedMinor) < BigInt(previous.capturedMinor) || BigInt(current.refundedMinor) < BigInt(previous.refundedMinor) || previous.movements.some(m => !newer.has(m.transactionId) || hashPayload(economic(m)) !== hashPayload(economic(newer.get(m.transactionId))))) reason = 'provider_history_changed';
        if (!reason && hashPayload(previous.movements.map(economic)) === hashPayload(current.movements.map(economic))) return publicProof(previous, true);
      }
      const state = seal({ id: b.id, bindingHash: b.hash, ...(reason ? { movements: previous?.movements || [], capturedMinor: previous?.capturedMinor || '0', refundedMinor: previous?.refundedMinor || '0', status: 'review_required' } : current), observedAt: new Date(now()).toISOString(), reason });
      try {
        await store.commit(mergeCommits({ writes: [{ type: TENNIS_CONTROL_PROOF_TYPE, id: b.id, expectedVersion: row?.version ?? -1, doc: state }], uniques: [{ name: 'tennis_control_proof_provider', value: hashPayload([merchantId, b.providerOrderId]), owner: b.id }] }, auditWrites({ now: now(), actor: { kind: 'tennis_control_verifier' }, action: 'commerce.control_payment_observed', objectType: 'control_payment', objectId: b.id, meta: { status: state.status, currency: 'USD', capturedMinor: state.capturedMinor, refundedMinor: state.refundedMinor } })));
        if ((await binding(input)).hash !== b.hash) throw conflict('control_proof_binding_changed');
        return publicProof(state);
      } catch (error) {
        const saved = (await rowFor(b))?.doc;
        if (saved?.fingerprint === state.fingerprint) {
          if ((await binding(input)).hash !== b.hash) throw conflict('control_proof_binding_changed');
          return publicProof(saved, true);
        }
        if (error?.code !== 'version_conflict') throw unavailable('control_proof_save_unconfirmed');
      }
    }
    throw unavailable('control_proof_busy');
  }
  return Object.freeze({ inspect, readiness: Object.freeze({ prepared: true, runtimeEnabled: false, ledgerPostingEnabled: false }) });
}
