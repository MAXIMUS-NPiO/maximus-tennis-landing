/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/**
 * SERVER ONLY. One owner-authorized USD 1 payment-control attempt, never a goods order.
 * No default authorizer, transport, runtime, renderer, invoice, delivery or ledger integration.
 * A reserved attempt is never reissued, including after a lost acknowledgement or restart.
 * Session metadata is private server data, not capture proof or merchant-currency evidence.
 */
import crypto from 'node:crypto';
import { hashPayload, randomToken } from '../platform/ids';
import { auditWrites, mergeCommits } from '../platform/audit';
import { badRequest, conflict, forbidden, notFound, unavailable } from '../platform/errors';
import { NATIVE_MPGS_MERCHANT, MPGS_MERCHANT_ID } from '../platform/native-mpgs';
import { site } from '../../data/site';

const scope = { schema: 1, projectId: 'tennis', organizationId: 'maximus-tennis', kind: 'payment_control', currency: 'USD', totalMinor: '100', fulfillment: 'none' };
export const TENNIS_CONTROL_SCOPE = Object.freeze({ ...scope, hash: hashPayload(scope) });
export const TENNIS_CONTROL_TYPES = Object.freeze({ order: 'tennisControlOrder', attempt: 'tennisControlAttempt', session: 'tennisControlSession' });
export const TENNIS_CONTROL_SESSION_CONTRACT = 'mpgs_initiate_checkout_100_hosted_v1';
/** Unique-claim key of one authorization; shared with the trusted authorizer's read-only inspection. */
export const tennisControlAuthorizationKey = authorizationId => hashPayload([scope.organizationId, authorizationId]);
/** Unique-claim key of one provider order under one merchant; shared with the webhook receiver. */
export const tennisControlProviderKey = (merchantId, providerOrderId) => hashPayload(['MPGS', merchantId, providerOrderId]);
const LOCAL_SESSION_MS = 15 * 60 * 1000;
const ORDER = /^MX-CTL-[0-9a-f]{32}$/;
const USER = /^usr_[0-9A-HJKMNP-TV-Z]{20}$/;
const CORRELATION = /^tcc_[A-Za-z0-9_-]{43}$/;
const PROVIDER_ORDER = /^MC[0-9a-f]{32}$/;
const STATES = ['creating', 'uncertain', 'session_created', 'expired', 'review_required'];
const REASONS = ['initiation_outcome_unknown', 'request_aborted', 'session_receipt_unverified', 'session_save_unconfirmed'];
const ATTEMPT_IDENTITY = ['id', 'orderId', 'scopeHash', 'snapshotHash', 'ownerUserId', 'kind', 'currency', 'totalMinor', 'providerOrderId', 'correlation', 'attemptedAt', 'localSessionDeadline', 'createAttempts'];
const ATTEMPT_INPUT = ['orderId', 'providerOrderId', 'correlation', 'currency', 'totalMinor', 'kind', 'scopeHash', 'attemptedAt', 'localSessionDeadline'];
const AUTHORIZATION_FIELDS = ['status', 'kind', 'purpose', 'mode', 'test', 'mock', 'authenticationBasis', 'authorizationId', 'evidenceId', 'scopeHash', 'projectId', 'organizationId', 'ownerUserId', 'currency', 'totalMinor', 'fulfillment', 'termsVersion', 'termsText', 'verifiedAt', 'expiresAt'];
const RECEIPT_FIELDS = ['sessionId', 'providerOrderId', 'currency', 'totalMinor', 'correlation', 'verifiedAt', 'localSessionDeadline', 'contract'];
const opaque = value => typeof value === 'string' && value.length > 0 && value.length <= 200 && !/[\u0000-\u001f\u007f]/.test(value);
const text = value => typeof value === 'string' && value.length > 0 && value.length <= 16000 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
const iso = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(Date.parse(value)).toISOString() === value;
const pick = (value, fields) => Object.fromEntries(fields.filter(key => Object.hasOwn(value, key)).map(key => [key, value[key]]));
const fingerprint = value => hashPayload(Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'fingerprint')));
const seal = value => ({ ...value, fingerprint: fingerprint(value) });
const freeze = value => { if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; };
const copy = value => freeze(structuredClone(value));
const exact = (value, keys) => { if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) throw badRequest('control_input_invalid'); };
const digest = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);

export function createTennisControlOrderService({ store, resolveAuthorization, initiateSession, merchantId = NATIVE_MPGS_MERCHANT,
  now = () => Date.now(), production = process.env.NODE_ENV === 'production' } = {}) {
  if (typeof window !== 'undefined' || !store || !['get', 'getUnique', 'commit'].every(key => typeof store[key] === 'function') || (production && store.kind !== 'upstash') || typeof resolveAuthorization !== 'function' || (initiateSession !== undefined && typeof initiateSession !== 'function') || typeof merchantId !== 'string' || !MPGS_MERCHANT_ID.test(merchantId)) throw unavailable('control_dependencies_required');
  const authKey = tennisControlAuthorizationKey;
  const idemKey = (owner, key) => hashPayload([TENNIS_CONTROL_SCOPE.hash, owner, key]);
  const providerKey = id => tennisControlProviderKey(merchantId, id);
  const readiness = copy({ runtimeEnabled: false, rendererEnabled: false, financialProductEnabled: false, initiationConfigured: typeof initiateSession === 'function' });
  const audit = (ownerUserId, action, orderId, meta) => auditWrites({ now: now(), actor: { userId: ownerUserId }, action, objectType: 'control_order', objectId: orderId, meta });

  async function owner(ctx) {
    if (!ctx || ctx.emailVerified !== true || ctx.organizationId !== scope.organizationId || !USER.test(ctx.userId || '')) throw forbidden('control_verified_owner_required');
    const [user, membership] = await Promise.all([store.get('user', ctx.userId), store.get('portalMembership', `${scope.organizationId}_${ctx.userId}`)]);
    if (user?.doc.id !== ctx.userId || user.doc.status !== 'active' || membership?.doc.userId !== ctx.userId || membership.doc.organizationId !== scope.organizationId) throw forbidden('control_verified_owner_required');
    return ctx.userId;
  }
  function validAuthorization(a, user) {
    if (!a || a.status !== 'verified' || a.kind !== 'payment_control_authorization' || a.purpose !== scope.kind || a.mode !== 'live' || a.test !== false || a.mock === true || a.authenticationBasis !== 'independently_verified_owner_authorization' || !opaque(a.authorizationId) || a.authorizationId.startsWith('TEST-') || !opaque(a.evidenceId) || a.evidenceId.startsWith('TEST-') || a.scopeHash !== TENNIS_CONTROL_SCOPE.hash || a.projectId !== scope.projectId || a.organizationId !== scope.organizationId || a.ownerUserId !== user || a.currency !== scope.currency || a.totalMinor !== scope.totalMinor || a.fulfillment !== scope.fulfillment || !opaque(a.termsVersion) || !text(a.termsText) || !iso(a.verifiedAt) || Date.parse(a.verifiedAt) > now() || !iso(a.expiresAt) || Date.parse(a.expiresAt) <= now() || Date.parse(a.expiresAt) <= Date.parse(a.verifiedAt)) throw forbidden('control_authorization_required');
  }
  async function authorization(reference, user) {
    if (!opaque(reference)) throw badRequest('control_authorization_reference_required');
    let a;
    try { const raw = await resolveAuthorization(reference); a = raw && structuredClone(pick(raw, AUTHORIZATION_FIELDS)); }
    catch { throw unavailable('control_authorizer_unavailable'); }
    validAuthorization(a, user);
    return a;
  }
  function checkOrder(row) {
    const d = row?.doc;
    if (!d || row.version !== 1 || !ORDER.test(d.id || '') || d.schema !== 1 || d.scopeHash !== TENNIS_CONTROL_SCOPE.hash || Object.keys(scope).some(key => d[key] !== scope[key]) || !USER.test(d.ownerUserId || '') || !iso(d.createdAt) || Date.parse(d.createdAt) > now() || !opaque(d.authorization?.id) || !opaque(d.authorization.reference) || !opaque(d.authorization.evidenceId) || !digest(d.authorization.hash) || !iso(d.authorization.verifiedAt) || !iso(d.authorization.expiresAt) || Date.parse(d.authorization.verifiedAt) > Date.parse(d.createdAt) || Date.parse(d.authorization.expiresAt) <= Date.parse(d.createdAt) || !opaque(d.terms?.version) || !text(d.terms.text) || !Number.isSafeInteger(d.terms.acceptedAt) || d.terms.acceptedAt !== Date.parse(d.createdAt) || d.snapshotHash !== hashPayload(Object.fromEntries(Object.entries(d).filter(([key]) => key !== 'snapshotHash')))) throw conflict('control_order_integrity_failed');
    return d;
  }
  function checkAttempt(row, order) {
    if (!row) return null;
    const d = row.doc;
    if (!d || d.id !== order.id || d.orderId !== order.id || d.scopeHash !== order.scopeHash || d.snapshotHash !== order.snapshotHash || d.ownerUserId !== order.ownerUserId || d.kind !== scope.kind || d.currency !== scope.currency || d.totalMinor !== scope.totalMinor || !PROVIDER_ORDER.test(d.providerOrderId || '') || !CORRELATION.test(d.correlation || '') || !Number.isSafeInteger(d.attemptedAt) || d.attemptedAt < Date.parse(order.createdAt) || d.attemptedAt > now() || !iso(d.localSessionDeadline) || Date.parse(d.localSessionDeadline) !== Math.min(Date.parse(order.authorization.expiresAt), d.attemptedAt + LOCAL_SESSION_MS) || Date.parse(d.localSessionDeadline) <= d.attemptedAt || d.createAttempts !== 1 || !STATES.includes(d.status) || !(d.reason === null || REASONS.includes(d.reason)) || d.identityHash !== hashPayload(pick(d, ATTEMPT_IDENTITY)) || d.fingerprint !== fingerprint(d)) throw conflict('control_attempt_integrity_failed');
    return d;
  }
  function receipt(value, attempt) {
    try {
      exact(value, RECEIPT_FIELDS);
      if (value.contract !== TENNIS_CONTROL_SESSION_CONTRACT || !/^SESSION[A-Za-z0-9_-]{10,100}$/.test(value.sessionId || '') || value.providerOrderId !== attempt.providerOrderId || value.currency !== scope.currency || value.totalMinor !== scope.totalMinor || value.correlation !== attempt.correlation || !iso(value.verifiedAt) || Date.parse(value.verifiedAt) < attempt.attemptedAt || Date.parse(value.verifiedAt) > now() || Date.parse(value.verifiedAt) >= Date.parse(attempt.localSessionDeadline) || value.localSessionDeadline !== attempt.localSessionDeadline) throw Error();
      return structuredClone(pick(value, RECEIPT_FIELDS));
    } catch { throw forbidden('control_session_receipt_invalid'); }
  }
  /** Trusted server consumers only. Historical reads do not depend on an unexpired initiation window. */
  async function readOwnRecord(input) {
    exact(input, ['ctx', 'orderId']);
    const user = await owner(input.ctx);
    if (!ORDER.test(input.orderId || '')) throw notFound('control_order_not_found');
    const row = await store.get(TENNIS_CONTROL_TYPES.order, input.orderId);
    if (!row || row.doc.ownerUserId !== user) throw notFound('control_order_not_found');
    const order = checkOrder(row);
    if (await store.getUnique('tennis_control_authorization', authKey(order.authorization.id)) !== order.id || await store.getUnique('tennis_control_owner', order.id) !== user) throw conflict('control_order_integrity_failed');
    const [attemptRow, sessionRow] = await Promise.all([store.get(TENNIS_CONTROL_TYPES.attempt, order.id), store.get(TENNIS_CONTROL_TYPES.session, order.id)]);
    const attempt = checkAttempt(attemptRow, order), session = sessionRow?.doc || null;
    if (attempt && (await store.getUnique('tennis_control_attempt', authKey(order.authorization.id)) !== order.id || await store.getUnique('tennis_control_provider', providerKey(attempt.providerOrderId)) !== order.id)) throw conflict('control_attempt_integrity_failed');
    if (session) {
      if (!attempt || sessionRow.version !== 1 || session.id !== order.id || session.orderId !== order.id || session.correlation !== attempt.correlation || session.fingerprint !== fingerprint(session) || !['session_created', 'expired'].includes(attempt.status)) throw conflict('control_session_integrity_failed');
      receipt(session.receipt, attempt);
    } else if (attempt?.status === 'session_created') throw conflict('control_session_integrity_failed');
    await owner(input.ctx);
    return copy({ order, attempt, session });
  }
  function publicOrder(record) {
    const { order, attempt } = record;
    const deadline = attempt?.localSessionDeadline || order.authorization.expiresAt;
    const status = Date.parse(deadline) <= now() ? 'expired' : attempt?.status || 'issued';
    return copy({ id: order.id, kind: scope.kind, currency: scope.currency, totalMinor: scope.totalMinor, fulfillment: scope.fulfillment,
      terms: { version: order.terms.version, text: order.terms.text, acceptedAt: order.terms.acceptedAt }, createdAt: order.createdAt,
      status, localSessionDeadline: attempt?.localSessionDeadline || null, paymentVerified: false, rendererReady: false, financialProductEnabled: false });
  }
  async function getOwn(input) { return publicOrder(await readOwnRecord(input)); }

  async function issue(input) {
    exact(input, ['ctx', 'authorizationReference', 'idempotencyKey', 'termsVersion']);
    const user = await owner(input.ctx);
    if (typeof input.idempotencyKey !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(input.idempotencyKey) || !opaque(input.termsVersion)) throw badRequest('control_input_invalid');
    const a = await authorization(input.authorizationReference, user), approvalHash = hashPayload(a);
    if (input.termsVersion !== a.termsVersion) throw conflict('control_terms_mismatch');
    const idem = idemKey(user, input.idempotencyKey);
    for (let attempt = 0; attempt < 8; attempt++) {
      await owner(input.ctx); validAuthorization(a, user);
      const [existing, previous] = await Promise.all([store.getUnique('tennis_control_authorization', authKey(a.authorizationId)), store.getUnique('tennis_control_idempotency', idem)]);
      if (previous && previous !== existing) throw conflict('control_idempotency_conflict');
      if (existing) {
        const record = await readOwnRecord({ ctx: input.ctx, orderId: existing });
        if (record.order.authorization.hash !== approvalHash || record.order.terms.version !== input.termsVersion) throw conflict('control_authorization_conflict');
        if (!previous) {
          await owner(input.ctx); validAuthorization(a, user);
          try { await store.commit(mergeCommits({ uniques: [{ name: 'tennis_control_idempotency', value: idem, owner: existing }] }, audit(user, 'control.idempotency_linked', existing))); }
          catch (error) { if (await store.getUnique('tennis_control_idempotency', idem) !== existing) { if (error?.code === 'unique_conflict') throw conflict('control_idempotency_conflict'); throw unavailable('control_save_unconfirmed'); } }
        }
        validAuthorization(a, user);
        return copy({ duplicate: true, order: await getOwn({ ctx: input.ctx, orderId: existing }) });
      }
      const at = now(), id = `MX-CTL-${crypto.randomBytes(16).toString('hex')}`;
      const d = { ...scope, id, scopeHash: TENNIS_CONTROL_SCOPE.hash, ownerUserId: user, createdAt: new Date(at).toISOString(),
        authorization: { id: a.authorizationId, reference: input.authorizationReference, evidenceId: a.evidenceId, verifiedAt: a.verifiedAt, expiresAt: a.expiresAt, hash: approvalHash },
        terms: { version: a.termsVersion, text: a.termsText, acceptedAt: at } };
      d.snapshotHash = hashPayload(d);
      await owner(input.ctx); validAuthorization(a, user);
      try {
        await store.commit(mergeCommits({ writes: [{ type: TENNIS_CONTROL_TYPES.order, id, expectedVersion: -1, doc: d }], uniques: [
          { name: 'tennis_control_authorization', value: authKey(a.authorizationId), owner: id }, { name: 'tennis_control_owner', value: id, owner: user }, { name: 'tennis_control_idempotency', value: idem, owner: id },
        ] }, audit(user, 'control.order_issued', id, { snapshotHash: d.snapshotHash })));
        return copy({ duplicate: false, order: await getOwn({ ctx: input.ctx, orderId: id }) });
      } catch (error) {
        if (await store.getUnique('tennis_control_authorization', authKey(a.authorizationId))) continue;
        if (!['unique_conflict', 'version_conflict'].includes(error?.code)) throw unavailable('control_save_unconfirmed');
      }
    }
    throw unavailable('control_store_busy');
  }
  function initiationAllowed(record) {
    if (Date.parse(record.order.authorization.expiresAt) <= now()) throw forbidden('control_authorization_expired');
  }
  async function currentAuthorization(record, ctx) {
    initiationAllowed(record);
    const a = await authorization(record.order.authorization.reference, record.order.ownerUserId);
    await owner(ctx); validAuthorization(a, record.order.ownerUserId);
    if (hashPayload(a) !== record.order.authorization.hash) throw conflict('control_authorization_changed');
  }
  /** A private one-time permit is returned only for a successfully acknowledged reservation. */
  async function reserveAttempt(input) {
    exact(input, ['ctx', 'orderId']);
    let record = await readOwnRecord(input);
    if (record.attempt) return copy({ reserved: false, order: publicOrder(record), attempt: null });
    await currentAuthorization(record, input.ctx);
    const at = now(), id = record.order.id;
    let d = { id, orderId: id, scopeHash: TENNIS_CONTROL_SCOPE.hash, snapshotHash: record.order.snapshotHash, ownerUserId: record.order.ownerUserId,
      kind: scope.kind, currency: scope.currency, totalMinor: scope.totalMinor, providerOrderId: `MC${crypto.randomBytes(16).toString('hex')}`, correlation: `tcc_${randomToken(32)}`,
      attemptedAt: at, localSessionDeadline: new Date(Math.min(Date.parse(record.order.authorization.expiresAt), at + LOCAL_SESSION_MS)).toISOString(), createAttempts: 1, status: 'creating', reason: null };
    d.identityHash = hashPayload(pick(d, ATTEMPT_IDENTITY)); d = seal(d);
    record = await readOwnRecord(input); await currentAuthorization(record, input.ctx);
    if (record.attempt) return copy({ reserved: false, order: publicOrder(record), attempt: null });
    try {
      await store.commit(mergeCommits({ writes: [{ type: TENNIS_CONTROL_TYPES.attempt, id, expectedVersion: -1, doc: d }], uniques: [
        { name: 'tennis_control_attempt', value: authKey(record.order.authorization.id), owner: id }, { name: 'tennis_control_provider', value: providerKey(d.providerOrderId), owner: id },
      ] }, audit(record.order.ownerUserId, 'control.attempt_reserved', id, { identityHash: d.identityHash })));
    } catch (error) {
      // A durable winner after any ambiguous ACK is observable, but never grants another permit.
      const saved = await readOwnRecord(input);
      if (saved.attempt) return copy({ reserved: false, order: publicOrder(saved), attempt: null });
      throw unavailable('control_reservation_unconfirmed');
    }
    const saved = await readOwnRecord(input);
    if (saved.attempt?.identityHash !== d.identityHash || saved.attempt.status !== 'creating' || Date.parse(d.localSessionDeadline) <= now()) return copy({ reserved: false, order: publicOrder(saved), attempt: null });
    await currentAuthorization(saved, input.ctx);
    const current = await readOwnRecord(input);
    if (current.attempt?.identityHash !== d.identityHash || current.attempt.status !== 'creating' || Date.parse(d.localSessionDeadline) <= now()) return copy({ reserved: false, order: publicOrder(current), attempt: null });
    return copy({ reserved: true, order: publicOrder(current), attempt: pick(d, ATTEMPT_INPUT) });
  }
  async function markUncertain(input) {
    exact(input, ['ctx', 'orderId', 'correlation', 'reason']);
    if (!CORRELATION.test(input.correlation || '') || !REASONS.includes(input.reason)) throw badRequest('control_input_invalid');
    for (let retry = 0; retry < 8; retry++) {
      const record = await readOwnRecord({ ctx: input.ctx, orderId: input.orderId }), d = record.attempt;
      if (!d || d.correlation !== input.correlation) throw conflict('control_attempt_mismatch');
      if (d.status !== 'creating') return publicOrder(record);
      const row = await store.get(TENNIS_CONTROL_TYPES.attempt, d.id);
      if (row.doc.fingerprint !== d.fingerprint) continue;
      const state = seal({ ...d, status: Date.parse(d.localSessionDeadline) <= now() ? 'expired' : 'uncertain', reason: input.reason });
      await owner(input.ctx);
      try { await store.commit(mergeCommits({ writes: [{ type: TENNIS_CONTROL_TYPES.attempt, id: d.id, expectedVersion: row.version, doc: state }] }, audit(record.order.ownerUserId, 'control.attempt_uncertain', d.id, { reason: input.reason }))); }
      catch (error) {
        const saved = await readOwnRecord({ ctx: input.ctx, orderId: d.id });
        if (saved.attempt?.status !== 'creating') return publicOrder(saved);
        if (error?.code === 'version_conflict') continue;
        throw unavailable('control_save_unconfirmed');
      }
      return getOwn({ ctx: input.ctx, orderId: d.id });
    }
    throw unavailable('control_store_busy');
  }
  /** Trusted adapter result only. Never expose this method through a public receipt endpoint. */
  async function recordSession(input) {
    exact(input, ['ctx', 'orderId', 'correlation', 'receipt']);
    for (let retry = 0; retry < 8; retry++) {
      const record = await readOwnRecord({ ctx: input.ctx, orderId: input.orderId }), d = record.attempt;
      if (!d || d.correlation !== input.correlation) throw conflict('control_attempt_mismatch');
      const projection = receipt(input.receipt, d);
      if (record.session) {
        if (hashPayload(record.session.receipt) !== hashPayload(projection)) throw conflict('control_session_conflict');
        return publicOrder(record);
      }
      if (!['creating', 'uncertain', 'expired'].includes(d.status)) throw conflict('control_attempt_terminal');
      const row = await store.get(TENNIS_CONTROL_TYPES.attempt, d.id);
      if (row.doc.fingerprint !== d.fingerprint) continue;
      const session = seal({ id: d.id, orderId: d.id, correlation: d.correlation, receipt: projection });
      const state = seal({ ...d, status: Date.parse(d.localSessionDeadline) <= now() ? 'expired' : 'session_created', reason: null });
      await owner(input.ctx);
      try {
        await store.commit(mergeCommits({ writes: [{ type: TENNIS_CONTROL_TYPES.session, id: d.id, expectedVersion: -1, doc: session },
          { type: TENNIS_CONTROL_TYPES.attempt, id: d.id, expectedVersion: row.version, doc: state }] }, audit(record.order.ownerUserId, 'control.session_recorded', d.id)));
      } catch (error) {
        const saved = await readOwnRecord({ ctx: input.ctx, orderId: d.id });
        if (saved.session) { if (hashPayload(saved.session.receipt) !== hashPayload(projection)) throw conflict('control_session_conflict'); return publicOrder(saved); }
        if (error?.code === 'version_conflict') continue;
        throw unavailable('control_save_unconfirmed');
      }
      return getOwn({ ctx: input.ctx, orderId: d.id });
    }
    throw unavailable('control_store_busy');
  }
  /** Optional DI orchestration. Calling again only reads the original attempt; it never retries. */
  async function initiate(input) {
    exact(input, ['ctx', 'orderId', 'signal', 'locale']);
    if (typeof initiateSession !== 'function') throw unavailable('control_initiation_unconfigured');
    if (input.locale !== undefined && !site.locales.includes(input.locale)) throw badRequest('control_input_invalid');
    if (input.signal?.aborted) throw badRequest('control_request_aborted');
    const reserved = await reserveAttempt({ ctx: input.ctx, orderId: input.orderId });
    if (!reserved.reserved) return reserved.order;
    const attempt = reserved.attempt;
    const before = await readOwnRecord({ ctx: input.ctx, orderId: input.orderId });
    if (before.attempt.status !== 'creating' || before.attempt.correlation !== attempt.correlation || Date.parse(attempt.localSessionDeadline) <= now()) return publicOrder(before);
    await currentAuthorization(before, input.ctx);
    const current = await readOwnRecord({ ctx: input.ctx, orderId: input.orderId });
    if (current.attempt.status !== 'creating' || current.attempt.correlation !== attempt.correlation || Date.parse(attempt.localSessionDeadline) <= now()) return publicOrder(current);
    if (input.signal?.aborted) return markUncertain({ ctx: input.ctx, orderId: input.orderId, correlation: attempt.correlation, reason: 'request_aborted' });
    let result;
    try { result = await initiateSession({ attempt, ...(input.locale ? { locale: input.locale } : {}), ...(input.signal ? { signal: input.signal } : {}) }); }
    catch { return markUncertain({ ctx: input.ctx, orderId: input.orderId, correlation: attempt.correlation, reason: 'initiation_outcome_unknown' }); }
    try { return await recordSession({ ctx: input.ctx, orderId: input.orderId, correlation: attempt.correlation, receipt: result }); }
    catch (error) {
      await markUncertain({ ctx: input.ctx, orderId: input.orderId, correlation: attempt.correlation, reason: error?.code === 'control_session_receipt_invalid' ? 'session_receipt_unverified' : 'session_save_unconfirmed' });
      return getOwn({ ctx: input.ctx, orderId: input.orderId });
    }
  }
  return Object.freeze({ readiness, issue, getOwn, readOwnRecord, reserveAttempt, recordSession, markUncertain, initiate });
}
