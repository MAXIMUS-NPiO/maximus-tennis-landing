/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/** SERVER ONLY. Native goods receipts only. No financial-program activation or payment execution. */
import { createCommerceLedgerBridge, COMMERCE_LEDGER_SELLER } from './commerce-ledger';
import { createNativeBindingRegistry } from './native-bindings';
import { createNativeMpgsReader, NATIVE_MPGS_MERCHANT, NATIVE_MPGS_ORIGIN, NATIVE_MPGS_SCHEMA } from './native-mpgs';
import { createNativeCsCartOrderReader, NATIVE_CSCART_SCHEMA } from './native-cscart';
import { nativeId, nativeIntegerId, nativeLosslessJsonSupported, nativeTime } from './native-read-http';
import { hashPayload } from './ids';
import { conflict, unavailable } from './errors';

const mappingIdentifier = value => {
  if (typeof value !== 'string' || value.length < 1 || value.length > 200 || /[\u0000-\u001f\u007f]/.test(value)) throw unavailable('native_mapping_invalid');
  return value;
};
/** This is a supported server schema contract, not evidence of the current add-on's field layout. */
export function normalizeNativeMapping(raw, now = Date.now()) {
  if (!raw || raw.status !== 'verified_live_native_mapping' || raw.enabled !== true || raw.mode !== 'live' || raw.mappingMode !== 'durable_server_binding_v1' || raw.captureMode !== 'full_single') throw unavailable('native_mapping_unverified');
  if (raw.projectId !== 'tennis' || raw.organizationId !== 'maximus-tennis' || raw.source !== 'cscart_mpgs' || raw.storeOrigin !== 'https://maximussports.ae' || raw.mpgsOrigin !== NATIVE_MPGS_ORIGIN || raw.merchantId !== NATIVE_MPGS_MERCHANT || raw.paymentMethodId !== '18' || raw.currency !== 'AED' || raw.processor !== 'MPGS' || raw.sellerLegalName !== COMMERCE_LEDGER_SELLER) throw unavailable('native_mapping_scope_invalid');
  if (typeof raw.mpgsApiVersion !== 'string' || !/^[1-9]\d{0,2}$/.test(raw.mpgsApiVersion) || !['1.0', '2.0'].includes(raw.cscartApiVersion) || raw.mpgsSchema !== NATIVE_MPGS_SCHEMA || raw.cscartSchema !== NATIVE_CSCART_SCHEMA) throw unavailable('native_mapping_schema_unverified');
  nativeIntegerId(raw.companyId, { zero: true }); nativeIntegerId(raw.storefrontId, { zero: true });
  // This adapter supports CS-Cart Store Builder, where company_id is the inspected storefront.
  if (raw.companyId !== raw.storefrontId) throw unavailable('native_mapping_company_storefront_mismatch');
  const m = {};
  for (const field of ['id', 'version', 'status', 'projectId', 'organizationId', 'source', 'merchantId', 'storefrontId', 'companyId', 'paymentMethodId', 'currency', 'processor', 'sellerLegalName', 'storeOrigin', 'mpgsOrigin', 'mpgsApiVersion', 'cscartApiVersion', 'mpgsSchema', 'cscartSchema', 'mode', 'mappingMode', 'captureMode', 'liveModeEvidenceId', 'nativeMappingEvidenceId', 'customerBindingEvidenceId', 'providerSchemaEvidenceId']) m[field] = mappingIdentifier(raw[field]);
  m.enabled = true; m.verifiedAt = nativeTime(raw.verifiedAt, now);
  return Object.freeze({ ...m, hash: hashPayload(m) });
}

/** Missing gates return bridge:null. Factory never generates an evidence record or an account. */
export async function createNativeCommerceLedgerRuntime({ env = process.env, store, mapping: suppliedMapping,
  fetchImpl = globalThis.fetch, loadCommerceOrder, now = () => Date.now(), timeoutMs = 6000, maxBodyBytes, signal } = {}) {
  const missing = [], unavailableResult = () => ({ bridge: null, readiness: { ready: false, missing: [...new Set(missing)], projectId: null, source: null, mappingHash: null, financialProductEnabled: false } });
  if (env.COMMERCE_LEDGER_ENABLED !== 'true') { missing.push('server_bridge_not_enabled'); return unavailableResult(); }
  if (!store || !['get', 'getUnique', 'commit', 'listIndex', 'ping'].every(name => typeof store[name] === 'function') || (env.NODE_ENV === 'production' && store.kind === 'memory')) { missing.push('durable_store'); return unavailableResult(); }
  if (!nativeLosslessJsonSupported()) missing.push('lossless_json_runtime');
  let mapping;
  try {
    const raw = suppliedMapping || (typeof env.COMMERCE_LEDGER_MAPPING_ID === 'string' && env.COMMERCE_LEDGER_MAPPING_ID.length <= 200 ? (await store.get('nativeCommerceMapping', env.COMMERCE_LEDGER_MAPPING_ID))?.doc : null);
    mapping = normalizeNativeMapping(raw, now());
  } catch { missing.push('verified_live_native_mapping'); }
  if (!mapping) return unavailableResult();
  const evidenceFields = [['liveModeEvidenceId', 'live_route'], ['nativeMappingEvidenceId', 'native_order_mapping'], ['customerBindingEvidenceId', 'verified_customer_binding_schema'], ['providerSchemaEvidenceId', 'mpgs_retrieve_order_schema']];
  for (const [field, kind] of evidenceFields) {
    try {
      const e = (await store.get('nativeCommerceEvidence', mapping[field]))?.doc;
      if (!e || e.id !== mapping[field] || e.status !== 'verified' || e.kind !== kind || e.mappingId !== mapping.id || e.mappingVersion !== mapping.version || e.mappingHash !== mapping.hash || !['operator_configuration_inspection', 'operator_addon_source_inspection', 'operator_authenticated_provider_query'].includes(e.authenticationBasis)) throw unavailable('native_evidence_unverified');
      nativeTime(e.verifiedAt, now());
    } catch { missing.push(kind); }
  }
  if (typeof env.NATIVE_MPGS_API_PASSWORD !== 'string' || !env.NATIVE_MPGS_API_PASSWORD.length) missing.push('mpgs_server_credentials');
  if (typeof env.NATIVE_CSCART_API_USER !== 'string' || !env.NATIVE_CSCART_API_USER.length || typeof env.NATIVE_CSCART_API_KEY !== 'string' || !env.NATIVE_CSCART_API_KEY.length) missing.push('cscart_server_credentials');
  if (missing.length) return unavailableResult();
  let mpgs, native;
  try {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 10 || timeoutMs > 6000) throw unavailable('native_timeout_configuration_invalid');
    mpgs = createNativeMpgsReader({ origin: mapping.mpgsOrigin, merchantId: mapping.merchantId, apiVersion: mapping.mpgsApiVersion, schema: mapping.mpgsSchema, password: env.NATIVE_MPGS_API_PASSWORD, fetchImpl, now, timeoutMs, maxBodyBytes, signal });
    native = createNativeCsCartOrderReader({ origin: mapping.storeOrigin, apiVersion: mapping.cscartApiVersion, companyId: mapping.companyId, schema: mapping.cscartSchema, user: env.NATIVE_CSCART_API_USER, key: env.NATIVE_CSCART_API_KEY, fetchImpl, timeoutMs, maxBodyBytes, signal });
  } catch { missing.push('native_reader_configuration'); return unavailableResult(); }
  let commercialLoader = loadCommerceOrder;
  if (!commercialLoader) {
    try {
      const { resolveCommerceStore } = await import('../commerce/store');
      const commerceStore = resolveCommerceStore(env);
      if (!commerceStore) throw unavailable('native_commerce_store_unavailable');
      commercialLoader = id => commerceStore.get(id);
    } catch { missing.push('immutable_commerce_store'); return unavailableResult(); }
  }
  if (typeof commercialLoader !== 'function') { missing.push('immutable_commerce_store'); return unavailableResult(); }
  try { if (await store.ping() !== true) throw unavailable('native_store_unavailable'); } catch { missing.push('durable_store_health'); return unavailableResult(); }
  const registry = createNativeBindingRegistry({ store, mapping, readNativeOrder: id => native.readOrder(id), loadCommerceOrder: commercialLoader,
    readProviderMovement: request => mpgs.readMovement(request), now });
  const scope = Object.fromEntries(['source', 'merchantId', 'storefrontId', 'paymentMethodId', 'processor', 'currency', 'projectId', 'storeOrigin', 'sellerLegalName'].map(key => [key, mapping[key]]));
  const bridge = createCommerceLedgerBridge({ store, mapping, production: env.NODE_ENV === 'production', now,
    resolveLivePayment: async reference => {
      const ref = await registry.readReference(reference);
      const movement = await mpgs.readMovement({ providerOrderId: ref.providerOrderId, transactionId: ref.transactionId, kind: ref.kind });
      const binding = await registry.readBinding(ref.providerOrderId, { verify: false });
      if (movement.totalMinor !== binding.cashTotalMinor) throw conflict('native_provider_order_amount_mismatch');
      const eventIdentity = hashPayload([mapping.source, mapping.merchantId, movement.providerOrderId, movement.transactionId, movement.kind]);
      return { ...scope, mode: 'live', outcome: 'confirmed', providerOrderId: movement.providerOrderId,
        eventId: `mpgs_${eventIdentity}`, transactionId: `mpgs-tx_${hashPayload([movement.providerOrderId, movement.transactionId])}`, paymentId: `mpgs-order_${movement.providerOrderId}`,
        kind: movement.kind, amountMinor: movement.amountMinor, occurredAt: movement.occurredAt,
        proof: { method: 'provider_server_query', transportAuthenticated: true, liveModeVerified: true, moneyMovementConfirmed: true, movement: movement.kind,
          evidenceId: `mpgs-query_${movement.evidenceHash}`, verifiedAt: movement.verifiedAt } };
    },
    loadNativeOrder: async ({ providerOrderId, projectId, merchantId, mappingId, mappingVersion }) => {
      nativeId(providerOrderId);
      if (projectId !== mapping.projectId || merchantId !== mapping.merchantId || mappingId !== mapping.id || mappingVersion !== mapping.version) throw unavailable('native_order_scope_mismatch');
      const b = await registry.readBinding(providerOrderId);
      return { ...scope, mode: 'live', kind: 'goods', approval: 'approved', providerOrderId,
        commerceOrderId: b.commerceOrderId, immutableOrderRevisionId: b.immutableOrderRevisionId, cashTotalMinor: b.cashTotalMinor,
        principalMinor: '0', bonusMinor: '0', customerBindingRef: b.id,
        boundCustomerUserId: b.basis === 'immutable_commerce_customer' ? b.customerUserId : null };
    },
    loadCustomerBinding: async ({ providerOrderId, commerceOrderId, customerBindingRef, projectId, merchantId }) => {
      const b = await registry.readBinding(providerOrderId);
      if (b.commerceOrderId !== commerceOrderId || b.id !== customerBindingRef || b.projectId !== projectId || b.merchantId !== merchantId) throw unavailable('native_customer_scope_mismatch');
      return { id: b.id, status: b.status, source: b.source, commerceOrderId, providerOrderId,
        projectId: b.projectId, organizationId: b.organizationId, merchantId: b.merchantId,
        customerUserId: b.customerUserId, basis: b.basis, evidenceId: b.evidenceId };
    },
  });
  const readiness = { ready: true, missing: [], projectId: mapping.projectId, source: mapping.source, mappingHash: mapping.hash, financialProductEnabled: false };
  const { createNativePoller } = await import('./native-poller');
  const poller = createNativePoller({ store, scope: readiness, now, signal,
    listBindings: options => registry.listBindings(options),
    discoverMovements: async ({ binding }) => {
      const b = await registry.readBinding(binding?.providerOrderId);
      if (binding.id !== b.id || binding.mappingHash !== mapping.hash || binding.projectId !== mapping.projectId || binding.fingerprint !== b.fingerprint) throw conflict('native_poll_binding_scope_mismatch');
      const movements = await mpgs.discoverMovements({ providerOrderId: b.providerOrderId });
      if (movements.some(movement => movement.totalMinor !== b.cashTotalMinor)) throw conflict('native_provider_order_amount_mismatch');
      return movements;
    },
    registerMovement: request => registry.registerQueriedMovement(request),
  });
  return { bridge, readiness, poller };
}
