/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/**
 * SERVER ONLY. Trusted owner authorization for the USD 1 payment control.
 *
 * The owner is named by protected deployment configuration (the owner's account e-mail), never by
 * a browser value, a query parameter or an e-mail typed into a form. A verified, active portal
 * account whose normalised e-mail equals that configuration is the only account that can hold a
 * control authorization. Each authorization is one-use (the order service claims it uniquely) and
 * is stored verbatim per series, so an issued order's authorization hash stays byte-stable. A new
 * series opens only when the previous one is spent: no order, an expired grant, a reserved attempt
 * past its local deadline, a verified capture/refund, or a review hold. At most one control attempt
 * is open per owner at any time.
 */
import { normalizeEmail } from '../platform/identity';
import { hashPayload, sha256 } from '../platform/ids';
import { auditWrites, mergeCommits } from '../platform/audit';
import { badRequest, forbidden, unavailable } from '../platform/errors';
import { TENNIS_CONTROL_SCOPE, TENNIS_CONTROL_TYPES, tennisControlAuthorizationKey } from './tennis-control-order';
import { TENNIS_CONTROL_PROOF_TYPE } from './tennis-control-proof';

export const TENNIS_CONTROL_GRANT_TYPES = Object.freeze({ head: 'tennisControlGrantHead', series: 'tennisControlGrant' });
export const TENNIS_CONTROL_TERMS = Object.freeze({
  version: 'control-usd1-2026-10-12',
  text: 'Control payment — USD 1.00. This payment checks the connection between maximus.tennis and the bank payment gateway. No product, service or delivery is included, and this payment does not join or fund any investment or bonus program. Any refund is a separate action of the account holder.',
});
const GRANT_TTL_MS = 24 * 60 * 60 * 1000;
const USER = /^usr_[0-9A-HJKMNP-TV-Z]{20}$/;
const REFERENCE = /^tcg_(usr_[0-9A-HJKMNP-TV-Z]{20})_([1-9]\d{0,8})$/;
const TERMINAL_PROOF = new Set(['captured', 'partially_refunded', 'refunded', 'review_required']);
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}$/;
const iso = at => new Date(at).toISOString();
const freeze = value => { if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; };

export function createTennisControlAuthorizer({ store, ownerEmail, now = () => Date.now(), grantTtlMs = GRANT_TTL_MS, terms = TENNIS_CONTROL_TERMS } = {}) {
  if (typeof window !== 'undefined' || !store || !['get', 'getUnique', 'commit'].every(key => typeof store[key] === 'function') || typeof now !== 'function') throw unavailable('control_authorizer_dependencies_required');
  const email = normalizeEmail(ownerEmail);
  if (!EMAIL.test(email) || typeof terms?.version !== 'string' || !/^[A-Za-z0-9._-]{1,200}$/.test(terms.version) || typeof terms.text !== 'string' || terms.text.length < 20 || terms.text.length > 16000 || !Number.isSafeInteger(grantTtlMs) || grantTtlMs < 60000 || grantTtlMs > 7 * 24 * 60 * 60 * 1000) throw unavailable('control_authorizer_unconfigured');
  const emailHash = sha256(email);

  /** The account must be active, a tenant member and the configured owner; nothing else grants it. */
  async function owner(ctx) {
    if (!ctx || ctx.emailVerified !== true || ctx.organizationId !== TENNIS_CONTROL_SCOPE.organizationId || !USER.test(ctx.userId || '')) throw forbidden('control_verified_owner_required');
    const [user, membership, bound] = await Promise.all([store.get('user', ctx.userId), store.get('portalMembership', `${TENNIS_CONTROL_SCOPE.organizationId}_${ctx.userId}`), store.getUnique('user_email', email)]);
    if (user?.doc.id !== ctx.userId || user.doc.status !== 'active' || membership?.doc.userId !== ctx.userId || membership.doc.organizationId !== TENNIS_CONTROL_SCOPE.organizationId) throw forbidden('control_verified_owner_required');
    if (bound !== ctx.userId || normalizeEmail(user.doc.emailNormalized) !== email) throw forbidden('control_owner_mismatch');
    return ctx.userId;
  }
  async function isOwner(ctx) {
    try { await owner(ctx); return true; } catch (error) { if (error?.status === 403) return false; throw error; }
  }
  const reference = (user, series) => `tcg_${user}_${series}`;
  function authorizationFor(user, series, at) {
    const identity = sha256(`${user}:${TENNIS_CONTROL_SCOPE.hash}:${series}`);
    return { status: 'verified', kind: 'payment_control_authorization', purpose: TENNIS_CONTROL_SCOPE.kind, mode: 'live', test: false, mock: false,
      authenticationBasis: 'independently_verified_owner_authorization', authorizationId: `tca_${identity.slice(0, 32)}`, evidenceId: `tce_${identity.slice(32, 64)}`,
      scopeHash: TENNIS_CONTROL_SCOPE.hash, projectId: TENNIS_CONTROL_SCOPE.projectId, organizationId: TENNIS_CONTROL_SCOPE.organizationId, ownerUserId: user,
      currency: TENNIS_CONTROL_SCOPE.currency, totalMinor: TENNIS_CONTROL_SCOPE.totalMinor, fulfillment: TENNIS_CONTROL_SCOPE.fulfillment,
      termsVersion: terms.version, termsText: terms.text, verifiedAt: iso(at), expiresAt: iso(at + grantTtlMs) };
  }
  function checkSeries(row, user, series) {
    const d = row?.doc;
    if (!d || d.id !== `${user}:${series}` || d.ownerUserId !== user || d.series !== series || !d.authorization || d.authorization.ownerUserId !== user || d.authorization.scopeHash !== TENNIS_CONTROL_SCOPE.hash || typeof d.evidence?.emailHash !== 'string' || d.authorizationHash !== hashPayload(d.authorization)) throw unavailable('control_grant_integrity_failed');
    return d;
  }
  /** Series state without writes: which order (if any) holds it and whether it is spent. */
  async function seriesState(user, head) {
    const series = head?.doc.series;
    if (!head) return { series: 0, authorization: null, orderId: null, spent: true, expired: true };
    const grant = checkSeries(await store.get(TENNIS_CONTROL_GRANT_TYPES.series, `${user}:${series}`), user, series);
    // A series opened under a different owner configuration no longer binds anything: it is spent.
    if (grant.evidence.emailHash !== emailHash) return { series, authorization: null, orderId: null, spent: true, expired: true };
    const expired = Date.parse(grant.authorization.expiresAt) <= now();
    const orderId = await store.getUnique('tennis_control_authorization', tennisControlAuthorizationKey(grant.authorization.authorizationId));
    if (!orderId) return { series, authorization: grant.authorization, orderId: null, spent: expired, expired };
    const [attempt, proof] = await Promise.all([store.get(TENNIS_CONTROL_TYPES.attempt, orderId), store.get(TENNIS_CONTROL_PROOF_TYPE, orderId)]);
    const proofStatus = proof?.doc?.status || null, attemptStatus = attempt?.doc?.status || null;
    const deadlinePassed = attempt ? Date.parse(attempt.doc.localSessionDeadline) <= now() : expired;
    const spent = TERMINAL_PROOF.has(proofStatus) || attemptStatus === 'review_required' || deadlinePassed;
    return { series, authorization: grant.authorization, orderId, spent, expired };
  }

  /** Read-only view for the owner's account page: no series is opened by looking. */
  async function inspect(ctx) {
    if (!(await isOwner(ctx))) return freeze({ owner: false, series: 0, orderId: null, canOpen: false, terms: { version: terms.version, text: terms.text } });
    const state = await seriesState(ctx.userId, await store.get(TENNIS_CONTROL_GRANT_TYPES.head, ctx.userId));
    return freeze({ owner: true, series: state.series, orderId: state.orderId, canOpen: state.spent, terms: { version: terms.version, text: terms.text } });
  }

  /** Returns the open series' reference, opening the next series only when the current one is spent. */
  async function resolveAuthorizationReference(ctx) {
    const user = await owner(ctx);
    for (let retry = 0; retry < 6; retry++) {
      const head = await store.get(TENNIS_CONTROL_GRANT_TYPES.head, user);
      const state = await seriesState(user, head);
      if (!state.spent) return reference(user, state.series);
      const at = now(), series = state.series + 1, authorization = authorizationFor(user, series, at);
      const doc = { id: `${user}:${series}`, ownerUserId: user, series, authorization, authorizationHash: hashPayload(authorization), evidence: { basis: 'deployment_owner_email_binding', emailHash }, openedAt: iso(at), previousOrderId: state.orderId };
      try {
        await store.commit(mergeCommits({ writes: [
          { type: TENNIS_CONTROL_GRANT_TYPES.series, id: doc.id, expectedVersion: -1, doc },
          { type: TENNIS_CONTROL_GRANT_TYPES.head, id: user, expectedVersion: head ? head.version : -1, doc: { id: user, ownerUserId: user, series, openedAt: iso(at) } },
        ] }, auditWrites({ now: at, actor: { userId: user }, action: 'control.authorization_opened', objectType: 'control_grant', objectId: doc.id, meta: { series } })));
        await owner(ctx);
        return reference(user, series);
      } catch (error) {
        if (!['version_conflict', 'unique_conflict'].includes(error?.code)) throw unavailable('control_grant_save_unconfirmed');
      }
    }
    throw unavailable('control_grant_busy');
  }

  /** Byte-stable per-series authorization; the order service compares its hash on every use. */
  async function resolveAuthorization(value) {
    const match = typeof value === 'string' ? REFERENCE.exec(value) : null;
    if (!match) throw badRequest('control_authorization_reference_invalid');
    const user = match[1], series = Number(match[2]);
    const grant = checkSeries(await store.get(TENNIS_CONTROL_GRANT_TYPES.series, `${user}:${series}`), user, series);
    const [account, bound] = await Promise.all([store.get('user', user), store.getUnique('user_email', email)]);
    // A changed owner configuration or account e-mail revokes the authority behind every series.
    if (grant.evidence.emailHash !== emailHash || account?.doc.status !== 'active' || bound !== user || normalizeEmail(account.doc.emailNormalized) !== email) throw forbidden('control_owner_mismatch');
    return structuredClone(grant.authorization);
  }
  return Object.freeze({ inspect, isOwner, resolveAuthorizationReference, resolveAuthorization, emailHash });
}
