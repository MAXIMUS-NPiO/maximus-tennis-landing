/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/** Synthetic direct contracts only; no real prices, approvals, sessions or network requests. */
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { createMemoryStore } from '../lib/platform/store.js';
import { createMemoryCommerceStore } from '../lib/commerce/store.js';
import { createTennisCheckoutService, normalizeTennisCheckoutRoute, TENNIS_CHECKOUT_TYPE, TENNIS_EMBEDDED_CONTRACT } from '../lib/commerce/tennis-checkout.js';
import { createTennisReconciliationService } from '../lib/commerce/tennis-reconciliation.js';
import { COMMERCE_LEDGER_SELLER } from '../lib/platform/commerce-ledger.js';
import { hashPayload } from '../lib/platform/ids.js';
import { NATIVE_MPGS_SCHEMA } from '../lib/platform/native-mpgs.js';

export const AT = Date.parse('2026-10-11T00:00:00.000Z');
export const ORDER = `MX-ORD-${'e'.repeat(32)}`, USER = `usr_${'0'.repeat(19)}1`, OTHER_USER = `usr_${'0'.repeat(19)}2`;
export const EVIDENCE = [['featureEvidenceId', 'merchant_hosted_checkout_feature'], ['originEvidenceId', 'approved_tennis_origin'], ['sessionSchemaEvidenceId', 'mpgs_checkout_session_schema'], ['sdkEvidenceId', 'mpgs_embedded_sdk_contract'], ['threeDsEvidenceId', 'mpgs_3ds_return_behavior']];

// Test fixture only: synchronous file snapshots survive child exit without shared JS memory.
// This is not a production store implementation, Redis verification, or a durability substitute.
export function fileFixtureStores(path) {
  const read = () => existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : { docs: {}, uniques: {}, commerce: {} };
  const save = d => { writeFileSync(`${path}.tmp`, JSON.stringify(d)); renameSync(`${path}.tmp`, path); };
  const key = (type, id) => `${type}:${id}`;
  const error = code => Object.assign(Error(code), { code });
  const store = {
    kind: 'file-test-fixture',
    async get(type, id) { return read().docs[key(type, id)] || null; },
    async getUnique(name, value) { return read().uniques[key(name, value)] || null; },
    async countType(type) { return Object.keys(read().docs).filter(k => k.startsWith(type + ':')).length; },
    async commit({ writes = [], uniques = [] }) {
      const d = read();
      for (const w of writes) {
        const current = d.docs[key(w.type, w.id)];
        if (w.expectedVersion === -1 ? !!current : w.expectedVersion !== undefined && w.expectedVersion !== current?.version) throw error('version_conflict');
      }
      for (const u of uniques) { const current = d.uniques[key(u.name, u.value)]; if (current && current !== u.owner) throw error('unique_conflict'); }
      for (const w of writes) d.docs[key(w.type, w.id)] = { doc: w.doc, version: (d.docs[key(w.type, w.id)]?.version || 0) + 1 };
      for (const u of uniques) d.uniques[key(u.name, u.value)] = u.owner;
      save(d);
      return writes.map(w => d.docs[key(w.type, w.id)].version);
    },
  };
  const commerceStore = {
    kind: 'file-test-fixture',
    async get(id) { return read().commerce[id] || null; },
    async create(ignored, doc) { const d = read(); if (d.commerce[doc.id]) return { created: false, doc: d.commerce[doc.id] }; d.commerce[doc.id] = doc; save(d); return { created: true, doc }; },
    async swap(before, after) { const d = read(); if (JSON.stringify(d.commerce[before.id]) !== JSON.stringify(before)) return false; d.commerce[before.id] = after; save(d); return true; },
  };
  return { store, commerceStore };
}

export async function fixture({ store = createMemoryStore(), commerceStore = createMemoryCommerceStore() } = {}) {
  let at = AT;
  const now = () => at, retrievalEvidenceId = 'synthetic-retrieval-evidence';
  const route = normalizeTennisCheckoutRoute({ id: 'synthetic-direct-route', version: 'synthetic-v1', status: 'verified_live_tennis_checkout', enabled: true, mode: 'live', projectId: 'tennis', organizationId: 'maximus-tennis', processor: 'MPGS', merchantId: '300281', currency: 'AED', sellerLegalName: COMMERCE_LEDGER_SELLER, gatewayOrigin: 'https://ap-gateway.mastercard.com', publicOrigin: 'https://maximus.tennis', presentation: 'embedded', contract: TENNIS_EMBEDDED_CONTRACT, sdkVersion: '100', apiVersion: '99', verifiedAt: new Date(AT).toISOString(), ...Object.fromEntries(EVIDENCE.map(([field]) => [field, `synthetic-${field}`])) }, AT);
  const configuration = { series: 'synthetic-approved-stock', racquetsTotal: 1 }, technical = { final: true, specification: 'synthetic-final' };
  const offer = { approved: true, evidence: 'synthetic-only-approval', currency: 'AED', totalMinor: 12345, productMinor: 12000, taxMinor: 345, shippingMinor: 0, seller: { legalName: COMMERCE_LEDGER_SELLER }, configurationHash: hashPayload(configuration), fulfillableCountries: ['AE'], termsVersion: 'synthetic-terms', expiresAt: new Date(AT + 3600000).toISOString() };
  const doc = { id: ORDER, snapshot: { schema: 1, projectId: 'tennis', plan: 'A', customerUserId: USER, locale: 'ru', createdAt: new Date(AT).toISOString(), contact: { country: 'AE' }, configuration, configurationHash: hashPayload(configuration), technical, offer, fulfillment: { verified: true, country: 'AE' }, paymentPreference: 'payment_link', quotation: { number: 'SYNTHETIC-APPROVED', test: false, status: 'quotation', orderId: ORDER, projectId: 'tennis', issuedAt: new Date(AT).toISOString(), expiresAt: offer.expiresAt, currency: 'AED', totalMinor: 12345, seller: offer.seller, termsVersion: offer.termsVersion, items: [{ quantity: 1, configuration, technical, unitPriceMinor: 12345, lineTotalMinor: 12345 }] } }, payment: { status: 'ready' }, invoice: null, mail: {}, events: [] };
  if (!await store.get('tennisCheckoutRoute', route.id)) {
    const docs = [
      ['tennisCheckoutRoute', route.id, route],
      ['user', USER, { id: USER, status: 'active' }],
      ['portalMembership', `maximus-tennis_${USER}`, { id: `maximus-tennis_${USER}`, userId: USER, organizationId: 'maximus-tennis' }],
      ['portalOrder', ORDER, { id: ORDER, customerUserId: USER, projectId: 'tennis', organizationId: 'maximus-tennis', ownershipProof: 'verified_session_and_order_capability' }],
      ['tennisReconciliationEvidence', retrievalEvidenceId, { id: retrievalEvidenceId, status: 'verified', kind: 'mpgs_retrieve_order_schema', authenticationBasis: 'operator_authenticated_provider_query', routeHash: route.hash, merchantId: route.merchantId, apiVersion: route.apiVersion, schema: NATIVE_MPGS_SCHEMA, verifiedAt: new Date(AT).toISOString() }],
      ...EVIDENCE.map(([field, kind]) => ['tennisCheckoutEvidence', route[field], { id: route[field], kind, routeId: route.id, routeVersion: route.version, routeHash: route.hash, status: 'verified', verifiedAt: new Date(AT).toISOString(), authenticationBasis: 'operator_configuration_inspection' }]),
    ];
    await commerceStore.create(hashPayload(['synthetic-reconciliation', ORDER]), doc);
    await store.commit({ writes: docs.map(([type, id, doc]) => ({ type, id, doc, expectedVersion: -1 })), uniques: [{ name: 'portal_order_owner', value: `tennis:${ORDER}`, owner: USER }] });
  }
  const calls = { create: 0, bind: 0, read: 0 }, state = { refundTotal: '0', amounts: {}, proofChange: null, movementChange: null, readerError: null, beforeRead: null };
  const checkout = createTennisCheckoutService({ store, commerceStore, route, now, production: false,
    createAuthenticatedSession: async () => { calls.create++; return { status: 'accepted', reference: 'synthetic-session-ref' }; },
    resolveAuthenticatedSession: async ({ intent: d }) => ({ status: 'verified', authenticationBasis: 'provider_server_session_query', mode: 'live', routeHash: route.hash, providerOrderId: d.providerOrderId, correlation: d.correlation, merchantId: route.merchantId, apiVersion: route.apiVersion, gatewayOrigin: route.gatewayOrigin, sdkVersion: route.sdkVersion, contract: route.contract, currency: d.currency, totalMinor: d.totalMinor, snapshotHash: d.snapshotHash, termsVersion: d.termsVersion, sessionId: 'SESSIONsyntheticPrivateOnly123', evidenceId: 'synthetic-session-query', verifiedAt: new Date(AT).toISOString(), expiresAt: new Date(AT + 3600000).toISOString() }),
  });
  const result = await checkout.checkout({ ctx: { userId: USER, organizationId: 'maximus-tennis', emailVerified: true }, orderId: ORDER, idempotencyKey: 'synthetic-reconciliation', termsVersion: offer.termsVersion });
  const intent = (await store.get(TENNIS_CHECKOUT_TYPE, result.checkoutHandle)).doc;
  at = AT + 10000;
  const deps = { store, commerceStore, route, retrievalEvidenceId, now, production: false,
    resolveTrustedBinding: async () => { calls.bind++; const proof = { status: 'verified', authenticationBasis: 'provider_server_direct_order_query', mode: 'live', kind: 'goods', approval: 'approved', routeHash: route.hash, intentId: intent.id, commerceOrderId: ORDER, customerUserId: USER, providerOrderId: intent.providerOrderId, correlation: intent.correlation, snapshotHash: intent.snapshotHash, approvalHash: intent.approvalHash, configurationHash: intent.configurationHash, totalMinor: intent.totalMinor, currency: intent.currency, merchantId: route.merchantId, termsVersion: intent.termsVersion, termsAcceptedAt: intent.termsAcceptedAt, evidenceId: 'synthetic-independent-order-binding', verifiedAt: new Date(now()).toISOString() }; state.proofChange?.(proof); return proof; },
    reader: { async readMovement(request) { calls.read++; await state.beforeRead?.(); if (state.readerError) throw state.readerError; const movement = { ...request, amountMinor: state.amounts[request.transactionId] || (request.kind === 'capture' ? '12345' : '345'), currency: 'AED', totalMinor: '12345', capturedMinor: '12345', refundedMinor: state.refundTotal, occurredAt: new Date(AT + (request.kind === 'capture' ? 1000 : 2000)).toISOString(), merchantId: route.merchantId }; state.movementChange?.(movement); return { ...movement, evidenceHash: hashPayload(movement), verifiedAt: new Date(now()).toISOString(), rawCard: 'MUST-NOT-BE-STORED', sessionId: 'MUST-NOT-BE-STORED' }; } },
  };
  const service = createTennisReconciliationService(deps);
  const bindInput = { intentId: intent.id, attestationReference: 'synthetic-opaque-reference' };
  const bind = () => service.bind(bindInput);
  const change = async (type, id, fields) => { const row = await store.get(type, id); await store.commit({ writes: [{ type, id, expectedVersion: row.version, doc: { ...row.doc, ...fields } }] }); };
  const changeOrder = async update => { const before = await commerceStore.get(ORDER), after = structuredClone(before); update(after); await commerceStore.swap(before, after); };
  return { store, commerceStore, deps, route, state, calls, service, intent, bindInput, bind, change, changeOrder, setTime: value => { at = value; } };
}

export function loseAcknowledgement(store, predicate) {
  let fired = false;
  return new Proxy(store, { get(target, key) { if (key === 'commit') return async payload => { const result = await target.commit(payload); if (!fired && predicate(payload)) { fired = true; throw Error('synthetic-lost-ack'); } return result; }; return typeof target[key] === 'function' ? target[key].bind(target) : target[key]; } });
}
