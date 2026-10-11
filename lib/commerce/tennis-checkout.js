/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/** SERVER ONLY. Own-site MPGS session orchestration. No default provider transport. */
import { approvedGoodsContract } from '../platform/native-bindings';
import { COMMERCE_LEDGER_SELLER } from '../platform/commerce-ledger';
import { hashPayload, randomToken } from '../platform/ids';
import { auditWrites, mergeCommits } from '../platform/audit';
import { badRequest, conflict, forbidden, notFound, unavailable } from '../platform/errors';
import { site } from '../../data/site';

export const TENNIS_CHECKOUT_TYPE = 'tennisCheckoutIntent';
export const TENNIS_EMBEDDED_CONTRACT = 'mpgs_hosted_checkout_embedded_v1';
const ORIGIN = 'https://ap-gateway.mastercard.com', LEASE_MS = 30000;
const STATES = new Set(['creating', 'uncertain', 'ready', 'review_required', 'expired']);
const EVIDENCE = [['featureEvidenceId', 'merchant_hosted_checkout_feature'], ['originEvidenceId', 'approved_tennis_origin'], ['sessionSchemaEvidenceId', 'mpgs_checkout_session_schema'], ['sdkEvidenceId', 'mpgs_embedded_sdk_contract'], ['threeDsEvidenceId', 'mpgs_3ds_return_behavior']];
const opaque = value => typeof value === 'string' && value.length > 0 && value.length <= 200 && !/[\u0000-\u001f\u007f]/.test(value);
const iso = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(Date.parse(value)).toISOString() === value;
const identity = d => Object.fromEntries(['id', 'routeHash', 'projectId', 'organizationId', 'orderId', 'customerUserId', 'correlation', 'providerOrderId', 'snapshotHash', 'approvalHash', 'configurationHash', 'totalMinor', 'currency', 'quantity', 'termsVersion', 'termsAcceptedAt', 'offerExpiresAt', 'locale', 'attemptedAt'].map(key => [key, d[key]]));
const receipt = d => Object.fromEntries(['sessionId', 'gatewayOrigin', 'sdkVersion', 'providerExpiresAt', 'verifiedAt', 'evidenceId'].map(key => [key, d[key]]));
const exactKeys = (value, keys) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) throw badRequest('checkout_input_invalid');
};

/** Metadata is a supported private contract, never evidence that this merchant supports it. */
export function normalizeTennisCheckoutRoute(raw, at = Date.now()) {
  if (!raw || raw.status !== 'verified_live_tennis_checkout' || raw.enabled !== true || raw.mode !== 'live' || raw.projectId !== 'tennis' || raw.organizationId !== 'maximus-tennis' || raw.processor !== 'MPGS' || raw.merchantId !== '300281' || raw.currency !== 'AED' || raw.sellerLegalName !== COMMERCE_LEDGER_SELLER || raw.gatewayOrigin !== ORIGIN || raw.publicOrigin !== 'https://maximus.tennis' || raw.presentation !== 'embedded' || raw.contract !== TENNIS_EMBEDDED_CONTRACT || raw.sdkVersion !== '100' || !/^[1-9]\d{0,2}$/.test(raw.apiVersion || '') || !iso(raw.verifiedAt) || Date.parse(raw.verifiedAt) > at) throw unavailable('checkout_route_unverified');
  const fields = ['id', 'version', 'status', 'mode', 'projectId', 'organizationId', 'processor', 'merchantId', 'currency', 'sellerLegalName', 'gatewayOrigin', 'publicOrigin', 'presentation', 'contract', 'sdkVersion', 'apiVersion', 'verifiedAt', ...EVIDENCE.map(([field]) => field)];
  const d = Object.fromEntries(fields.map(field => { if (!opaque(raw[field])) throw unavailable('checkout_route_unverified'); return [field, raw[field]]; }));
  return Object.freeze({ ...d, enabled: true, hash: hashPayload({ ...d, enabled: true }) });
}

/** Provider functions return authenticated projections, not assumed raw MPGS JSON fields. */
export function createTennisCheckoutService({ store, commerceStore, route: rawRoute, createAuthenticatedSession,
  resolveAuthenticatedSession, now = () => Date.now(), providerTimeoutMs = 6000,
  production = process.env.NODE_ENV === 'production' } = {}) {
  if (!store || !['get', 'getUnique', 'commit'].every(name => typeof store[name] === 'function') || !commerceStore || !['get', 'swap'].every(name => typeof commerceStore[name] === 'function') || (production && (store.kind !== 'upstash' || commerceStore.kind !== 'upstash')) || !Number.isInteger(providerTimeoutMs) || providerTimeoutMs < 1 || providerTimeoutMs > 6000) throw unavailable('checkout_runtime_unavailable');
  const route = normalizeTennisCheckoutRoute(rawRoute, now());
  const missing = [];
  if (typeof createAuthenticatedSession !== 'function') missing.push('authenticated_session_creator');
  if (typeof resolveAuthenticatedSession !== 'function') missing.push('independent_authenticated_session_resolver');
  const readiness = Object.freeze({ ready: missing.length === 0, missing: Object.freeze(missing), financialProductEnabled: false });
  const orderScope = id => hashPayload([route.organizationId, route.projectId, id]);
  const idemScope = (user, key) => hashPayload([route.organizationId, route.projectId, user, key]);
  const ready = () => { if (!readiness.ready) throw unavailable('checkout_unconfigured'); };
  async function verifiedRoute() {
    try {
      if (normalizeTennisCheckoutRoute((await store.get('tennisCheckoutRoute', route.id))?.doc, now()).hash !== route.hash) throw unavailable('checkout_route_unverified');
      for (const [field, kind] of EVIDENCE) {
        const e = (await store.get('tennisCheckoutEvidence', route[field]))?.doc;
        if (!e || e.id !== route[field] || e.status !== 'verified' || e.kind !== kind || e.routeId !== route.id || e.routeVersion !== route.version || e.routeHash !== route.hash || !['operator_configuration_inspection', 'operator_authenticated_provider_query', 'operator_documented_sdk_verification'].includes(e.authenticationBasis) || !iso(e.verifiedAt) || Date.parse(e.verifiedAt) > now()) throw unavailable('checkout_route_unverified');
      }
    } catch { throw unavailable('checkout_route_unverified'); }
  }
  function customer(ctx) {
    if (!ctx || ctx.emailVerified !== true || ctx.organizationId !== route.organizationId || !/^usr_[0-9A-HJKMNP-TV-Z]{20}$/.test(ctx.userId || '')) throw forbidden('checkout_verified_customer_required');
    return ctx.userId;
  }
  async function ownOrder(id, user) {
    const [doc, portal, unique, account, membership] = await Promise.all([commerceStore.get(id), store.get('portalOrder', id), store.getUnique('portal_order_owner', `${route.projectId}:${id}`), store.get('user', user), store.get('portalMembership', `${route.organizationId}_${user}`)]);
    const p = portal?.doc;
    if (!doc || doc.id !== id || doc.snapshot?.schema !== 1 || doc.snapshot.projectId !== route.projectId || doc.snapshot.plan !== 'A' || (doc.snapshot.customerUserId && doc.snapshot.customerUserId !== user) || !p || p.id !== id || p.customerUserId !== user || p.projectId !== route.projectId || p.organizationId !== route.organizationId || p.ownershipProof !== 'verified_session_and_order_capability' || unique !== user || account?.doc.id !== user || account.doc.status !== 'active' || membership?.doc.userId !== user || membership.doc.organizationId !== route.organizationId) throw notFound('checkout_order_not_found');
    if (doc.invoice?.test === true || doc.invoice?.number?.startsWith('TEST-')) throw forbidden('checkout_non_test_goods_required');
    return doc;
  }
  function contract(doc, termsVersion, acceptedAt) {
    if (!opaque(termsVersion) || termsVersion !== doc.snapshot.offer?.termsVersion) throw conflict('checkout_terms_mismatch');
    const accepted = structuredClone(doc);
    // This authenticated POST accepts an existing immutable terms version at server time.
    // Acceptance is durably recorded before any provider call; no approval/price is invented.
    accepted.payment = { ...accepted.payment, termsVersion, termsAcceptedAt: acceptedAt };
    try { return approvedGoodsContract(accepted, route, now()); }
    catch { throw forbidden('checkout_non_test_goods_required'); }
  }
  function exactContract(d, doc) {
    const goods = contract(doc, d.termsVersion, d.termsAcceptedAt);
    if (d.snapshotHash !== hashPayload(doc.snapshot) || d.approvalHash !== goods.commercialApprovalHash || d.totalMinor !== goods.cashTotalMinor || d.configurationHash !== goods.configurationHash || d.quantity !== goods.quantity) throw conflict('checkout_snapshot_changed');
  }
  const fence = (d, doc) => doc.payment?.checkoutSource === TENNIS_EMBEDDED_CONTRACT && doc.payment.checkoutHandle === d.id && doc.payment.owner === d.correlation && doc.payment.providerOrderId === d.providerOrderId && doc.payment.termsVersion === d.termsVersion && doc.payment.termsAcceptedAt === d.termsAcceptedAt && ['creating', 'pending'].includes(doc.payment.status) && !doc.payment.session;
  async function intent(id) {
    if (!/^tco_[A-Za-z0-9_-]{43}$/.test(id || '')) throw notFound('checkout_not_found');
    const row = await store.get(TENNIS_CHECKOUT_TYPE, id), d = row?.doc;
    if (!d) throw notFound('checkout_not_found');
    if (d.id !== id || d.routeHash !== route.hash || d.projectId !== route.projectId || d.organizationId !== route.organizationId || d.currency !== route.currency || !/^MX-ORD-[0-9a-f]{32}$/.test(d.orderId || '') || !/^usr_[0-9A-HJKMNP-TV-Z]{20}$/.test(d.customerUserId || '') || !site.locales.includes(d.locale) || !STATES.has(d.status) || d.identityHash !== hashPayload(identity(d)) || d.createAttempts !== 1 || !Number.isSafeInteger(d.attemptedAt) || d.attemptedAt > now() || d.termsAcceptedAt !== d.attemptedAt || !iso(d.offerExpiresAt) || !/^tc_[A-Za-z0-9_-]{43}$/.test(d.correlation || '') || !/^MT[A-Za-z0-9_-]{32}$/.test(d.providerOrderId || '') || await store.getUnique('tennis_checkout_order', orderScope(d.orderId)) !== id || await store.getUnique('native_checkout_commerce_order', orderScope(d.orderId)) !== id || (d.status === 'creating' && (!/^[A-Za-z0-9_-]{32}$/.test(d.lease || '') || d.leaseUntil !== d.attemptedAt + LEASE_MS)) || (d.status !== 'creating' && (d.lease !== null || d.leaseUntil !== 0)) || (['ready', 'expired'].includes(d.status) && (d.receiptHash !== hashPayload(receipt(d)) || !/^SESSION[A-Za-z0-9_-]{10,100}$/.test(d.sessionId || '') || d.gatewayOrigin !== ORIGIN || d.sdkVersion !== route.sdkVersion || !opaque(d.evidenceId) || !iso(d.verifiedAt) || Date.parse(d.verifiedAt) < d.attemptedAt || Date.parse(d.verifiedAt) > now() || !iso(d.providerExpiresAt) || !iso(d.expiresAt) || d.expiresAt !== new Date(Math.min(Date.parse(d.providerExpiresAt), Date.parse(d.offerExpiresAt))).toISOString()))) throw conflict('checkout_intent_integrity_failed');
    return row;
  }
  function publicIntent(d) {
    const valid = d.status === 'ready' && Date.parse(d.expiresAt) > now();
    return { status: d.status === 'ready' && !valid ? 'expired' : d.status, checkoutPath: `/${d.locale}/checkout`, checkoutHandle: d.id,
      expiresAt: d.expiresAt || null, embedded: valid ? { contract: TENNIS_EMBEDDED_CONTRACT, serverVerified: true, sessionId: d.sessionId, gatewayOrigin: ORIGIN, sdkVersion: route.sdkVersion } : null };
  }
  async function publicChecked(d) {
    // Every ready projection, including concurrent winners and ACK-loss readback,
    // must reread current ownership/terms/route and the commercial pending fence.
    if (d.status === 'ready') {
      await verifiedRoute();
      const current = await ownOrder(d.orderId, d.customerUserId); exactContract(d, current);
      if (!fence(d, current) || current.payment.status !== 'pending') throw conflict('checkout_commerce_fence_changed');
    }
    return publicIntent(d);
  }
  async function transition(row, changes) {
    if (!['creating', 'uncertain'].includes(row.doc.status)) return row.doc;
    const d = { ...row.doc, ...changes };
    await store.commit(mergeCommits({ writes: [{ type: TENNIS_CHECKOUT_TYPE, id: d.id, expectedVersion: row.version, doc: d }] }, auditWrites({ now: now(), actor: { kind: 'tennis_checkout_service' }, action: 'commerce.tennis_checkout_state', objectType: 'order', objectId: d.orderId, meta: { checkoutHandle: d.id, status: d.status } })));
    return (await intent(d.id)).doc;
  }
  async function pendingTransition(id, changes) {
    const row = await intent(id);
    try { return await transition(row, changes); }
    catch (error) {
      const latest = await intent(id);
      if (latest.version !== row.version) return latest.doc;
      throw error;
    }
  }
  async function providerCall(fn, args, externalSignal) {
    const controller = new AbortController(); let timer, rejectAbort;
    const aborted = new Promise((_, reject) => { rejectAbort = reject; });
    const abort = () => { controller.abort(); rejectAbort(unavailable('checkout_provider_unavailable')); };
    if (externalSignal?.aborted) throw unavailable('checkout_provider_unavailable');
    externalSignal?.addEventListener('abort', abort, { once: true });
    const expiry = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(unavailable('checkout_provider_unavailable')); }, providerTimeoutMs); });
    try { return await Promise.race([Promise.resolve().then(() => fn({ ...args, signal: controller.signal })), expiry, aborted]); }
    finally { clearTimeout(timer); externalSignal?.removeEventListener('abort', abort); }
  }
  async function recover(row, signal) {
    if (!['creating', 'uncertain'].includes(row.doc.status) || (row.doc.status === 'creating' && row.doc.leaseUntil > now())) return publicChecked(row.doc);
    await verifiedRoute();
    const doc = await ownOrder(row.doc.orderId, row.doc.customerUserId); exactContract(row.doc, doc);
    let proof;
    try { proof = structuredClone(await providerCall(resolveAuthenticatedSession, { intent: { ...identity(row.doc), merchantId: route.merchantId, apiVersion: route.apiVersion }, reference: row.doc.providerReference }, signal)); }
    catch { proof = null; }
    row = await intent(row.doc.id);
    if (!['creating', 'uncertain'].includes(row.doc.status)) return publicChecked(row.doc);
    if (!proof || ['not_found', 'pending'].includes(proof.status)) return publicChecked(await pendingTransition(row.doc.id, { status: 'uncertain', lease: null, leaseUntil: 0, reason: 'provider_session_unresolved' }));
    const d = row.doc;
    const good = proof.status === 'verified' && proof.authenticationBasis === 'provider_server_session_query' && proof.mode === 'live' && proof.routeHash === route.hash && proof.providerOrderId === d.providerOrderId && proof.correlation === d.correlation && proof.merchantId === route.merchantId && proof.apiVersion === route.apiVersion && proof.gatewayOrigin === ORIGIN && proof.sdkVersion === route.sdkVersion && proof.contract === TENNIS_EMBEDDED_CONTRACT && proof.currency === d.currency && proof.totalMinor === d.totalMinor && proof.snapshotHash === d.snapshotHash && proof.termsVersion === d.termsVersion && /^SESSION[A-Za-z0-9_-]{10,100}$/.test(proof.sessionId || '') && opaque(proof.evidenceId) && iso(proof.verifiedAt) && Date.parse(proof.verifiedAt) >= d.attemptedAt && Date.parse(proof.verifiedAt) <= now() && iso(proof.expiresAt);
    if (!good || !fence(d, doc)) return publicChecked(await pendingTransition(d.id, { status: 'review_required', lease: null, leaseUntil: 0, reason: 'provider_session_scope_invalid' }));
    await verifiedRoute();
    const current = await ownOrder(d.orderId, d.customerUserId); exactContract(d, current);
    if (!fence(d, current)) return publicChecked(await pendingTransition(d.id, { status: 'review_required', lease: null, leaseUntil: 0, reason: 'commerce_checkout_fence_changed' }));
    const after = structuredClone(current); after.payment.status = 'pending';
    try {
      if (!await commerceStore.swap(current, after)) throw unavailable('checkout_commerce_busy');
      const saved = await commerceStore.get(d.orderId);
      if (!fence(d, saved) || saved.payment.status !== 'pending' || hashPayload(saved.snapshot) !== d.snapshotHash) throw unavailable('checkout_commerce_busy');
    } catch { return publicChecked(await pendingTransition(d.id, { status: 'uncertain', lease: null, leaseUntil: 0, reason: 'commerce_checkout_save_unconfirmed' })); }
    row = await intent(d.id);
    if (!['creating', 'uncertain'].includes(row.doc.status)) return publicChecked(row.doc);
    const expiresAt = new Date(Math.min(Date.parse(proof.expiresAt), Date.parse(d.offerExpiresAt))).toISOString();
    const verified = { sessionId: proof.sessionId, gatewayOrigin: ORIGIN, sdkVersion: route.sdkVersion, providerExpiresAt: proof.expiresAt, verifiedAt: proof.verifiedAt, evidenceId: proof.evidenceId };
    try { return publicChecked(await transition(row, { ...verified, expiresAt, receiptHash: hashPayload(verified), status: Date.parse(expiresAt) > now() ? 'ready' : 'expired', lease: null, leaseUntil: 0, reason: null })); }
    catch {
      const saved = (await intent(d.id)).doc;
      if (['ready', 'expired'].includes(saved.status) && saved.receiptHash === hashPayload(verified)) return publicChecked(saved);
      throw unavailable('checkout_session_save_unconfirmed');
    }
  }
  async function checkout(input) {
    ready(); exactKeys(input, ['ctx', 'orderId', 'idempotencyKey', 'termsVersion', 'signal']);
    if (!/^MX-ORD-[0-9a-f]{32}$/.test(input.orderId || '') || typeof input.idempotencyKey !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(input.idempotencyKey) || !opaque(input.termsVersion)) throw badRequest('checkout_input_invalid');
    const user = customer(input.ctx); await verifiedRoute();
    const doc = await ownOrder(input.orderId, user);
    const idem = idemScope(user, input.idempotencyKey), claimedId = await store.getUnique('tennis_checkout_idempotency', idem), existingId = await store.getUnique('tennis_checkout_order', orderScope(input.orderId));
    if (claimedId && claimedId !== existingId) throw conflict('checkout_idempotency_conflict');
    async function reuse(existingId) {
      const row = await intent(existingId);
      if (row.doc.customerUserId !== user || row.doc.termsVersion !== input.termsVersion) throw conflict('checkout_owner_or_terms_changed');
      exactContract(row.doc, doc);
      await store.commit({ uniques: [{ name: 'tennis_checkout_idempotency', value: idem, owner: row.doc.id }] });
      if (row.doc.status === 'ready' && (!fence(row.doc, doc) || doc.payment.status !== 'pending')) throw conflict('checkout_commerce_fence_changed');
      return recover(row, input.signal);
    }
    if (existingId) return reuse(existingId);
    const pinned = await store.getUnique('native_checkout_commerce_order', orderScope(input.orderId));
    if (pinned) {
      // A concurrent atomic direct reservation may have appeared after our first read.
      if (await store.getUnique('tennis_checkout_order', orderScope(input.orderId)) === pinned) return reuse(pinned);
      throw conflict('checkout_other_intent_exists');
    }
    if (doc.payment?.status !== 'ready' || doc.payment.session || doc.payment.checkoutHandle) throw conflict('checkout_order_not_ready');
    if (Date.parse(doc.snapshot.offer?.expiresAt) <= now()) throw conflict('checkout_offer_expired');
    const at = now(), goods = contract(doc, input.termsVersion, at), lease = randomToken(24);
    const d = { id: `tco_${randomToken(32)}`, routeHash: route.hash, projectId: route.projectId, organizationId: route.organizationId, orderId: doc.id, customerUserId: user,
      correlation: `tc_${randomToken(32)}`, providerOrderId: `MT${randomToken(24)}`, snapshotHash: hashPayload(doc.snapshot), approvalHash: goods.commercialApprovalHash, configurationHash: goods.configurationHash,
      totalMinor: goods.cashTotalMinor, currency: route.currency, quantity: goods.quantity, termsVersion: input.termsVersion, termsAcceptedAt: at, attemptedAt: at, offerExpiresAt: doc.snapshot.offer.expiresAt,
      locale: site.locales.includes(doc.snapshot.locale) ? doc.snapshot.locale : site.defaultLocale, status: 'creating', createAttempts: 1, lease, leaseUntil: at + LEASE_MS };
    d.identityHash = hashPayload(identity(d));
    try {
      await store.commit(mergeCommits({ writes: [{ type: TENNIS_CHECKOUT_TYPE, id: d.id, expectedVersion: -1, doc: d }], uniques: [{ name: 'tennis_checkout_order', value: orderScope(doc.id), owner: d.id }, { name: 'native_checkout_commerce_order', value: orderScope(doc.id), owner: d.id }, { name: 'tennis_checkout_idempotency', value: idem, owner: d.id }] }, auditWrites({ now: at, actor: { userId: user }, action: 'commerce.tennis_checkout_reserved', objectType: 'order', objectId: doc.id, meta: { checkoutHandle: d.id } })));
    } catch {
      const claimed = await store.getUnique('tennis_checkout_idempotency', idem);
      const winner = await store.getUnique('tennis_checkout_order', orderScope(doc.id));
      if (claimed && claimed !== winner) throw conflict('checkout_idempotency_conflict');
      if (winner) return publicChecked((await intent(winner)).doc); // No provider call after lost claim acknowledgement.
      throw unavailable('checkout_reservation_unconfirmed');
    }
    let fenced;
    try {
      const before = await ownOrder(doc.id, user); exactContract(d, before);
      if (before.payment.status !== 'ready' || before.payment.session || before.payment.checkoutHandle) throw conflict('checkout_order_not_ready');
      fenced = structuredClone(before);
      fenced.payment = { ...fenced.payment, status: 'creating', checkoutSource: TENNIS_EMBEDDED_CONTRACT, checkoutHandle: d.id, owner: d.correlation, providerOrderId: d.providerOrderId, termsVersion: d.termsVersion, termsAcceptedAt: at };
      if (!await commerceStore.swap(before, fenced)) throw conflict('checkout_order_not_ready');
      fenced = await ownOrder(doc.id, user); exactContract(d, fenced);
      if (!fence(d, fenced)) throw conflict('checkout_commerce_fence_changed');
      await verifiedRoute();
      fenced = await ownOrder(doc.id, user); exactContract(d, fenced);
      if (!fence(d, fenced) || fenced.payment.status !== 'creating') throw conflict('checkout_commerce_fence_changed');
      const claim = await intent(d.id);
      if (claim.doc.status !== 'creating' || claim.doc.lease !== lease || claim.doc.leaseUntil <= now()) return publicChecked(claim.doc);
      if (Date.parse(d.offerExpiresAt) <= now()) throw conflict('checkout_offer_expired');
    } catch {
      return publicChecked(await pendingTransition(d.id, { status: 'uncertain', lease: null, leaseUntil: 0, reason: 'checkout_fence_unconfirmed' }));
    }
    let result;
    try { result = await providerCall(createAuthenticatedSession, { intent: { ...identity(d), merchantId: route.merchantId, apiVersion: route.apiVersion, gatewayOrigin: ORIGIN }, order: structuredClone(fenced) }, input.signal); }
    catch { result = null; }
    let row = await intent(d.id);
    if (row.doc.status !== 'creating' || row.doc.lease !== lease) return publicChecked(row.doc);
    const reference = result?.status === 'accepted' && opaque(result.reference) ? result.reference : undefined;
    try { await transition(row, { status: result?.status === 'rejected' ? 'review_required' : 'uncertain', lease: null, leaseUntil: 0, ...(reference ? { providerReference: reference } : {}), reason: 'provider_session_not_yet_verified' }); }
    catch { throw unavailable('checkout_session_outcome_unconfirmed'); }
    row = await intent(d.id); return recover(row, input.signal);
  }
  return Object.freeze({ readiness, checkout });
}
