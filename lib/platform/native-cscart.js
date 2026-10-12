/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/** SERVER ONLY. Concrete CS-Cart GET order reader. payment_info/PII are never returned. */
import { createNativeReadHttp, nativeFail, nativeIntegerId, nativeMinor, nativeRecord } from './native-read-http';
import { hashPayload } from './ids';
export const NATIVE_CSCART_SCHEMA = 'cscart_order_core_v1';
export function createNativeCsCartOrderReader({ origin, apiVersion, user, key, companyId, schema, fetchImpl, timeoutMs, maxBodyBytes, signal } = {}) {
  if (origin !== 'https://maximussports.ae' || !['1.0', '2.0'].includes(apiVersion) || schema !== NATIVE_CSCART_SCHEMA) nativeFail('native_cscart_schema_unverified');
  nativeIntegerId(companyId, { zero: true });
  if (typeof user !== 'string' || user.length > 254 || !/^[^\s:@]+@[^\s:@]+\.[^\s:@]+$/.test(user) || typeof key !== 'string' || !key.length || key.length > 512 || /[^\x21-\x7e]/.test(key)) nativeFail('native_credentials_invalid');
  const get = createNativeReadHttp({ origin, authorization: `Basic ${Buffer.from(`${user}:${key}`).toString('base64')}`, fetchImpl, timeoutMs, maxBodyBytes, signal });
  const prefix = apiVersion === '2.0' ? '/api/2.0/' : '/api/';
  return Object.freeze({ async readOrder(nativeOrderId) {
    nativeIntegerId(nativeOrderId);
    const raw = await get(`${prefix}orders/${nativeOrderId}`);
    if (nativeIntegerId(raw.order_id) !== nativeOrderId || nativeIntegerId(raw.company_id, { zero: true }) !== companyId || nativeIntegerId(raw.payment_id) !== '18') nativeFail('native_cscart_order_scope_mismatch');
    if (raw.is_parent_order !== 'N' || nativeIntegerId(raw.parent_order_id, { zero: true }) !== '0') nativeFail('native_cscart_parent_order_unsupported');
    if (raw.test === true || raw.mock === true || raw.mode === 'test' || raw.liveMode === false) nativeFail('native_cscart_test_order_forbidden');
    if (typeof raw.status !== 'string' || !/^[A-Z]$/.test(raw.status)) nativeFail('native_cscart_status_invalid');
    const cashTotalMinor = nativeMinor(raw.total);
    if (cashTotalMinor === '0') nativeFail('native_amount_invalid');
    if (!nativeRecord(raw.products) || !Object.keys(raw.products).length || Object.keys(raw.products).length > 100) nativeFail('native_cscart_products_invalid');
    const items = Object.values(raw.products).map(row => {
      if (!nativeRecord(row)) nativeFail('native_cscart_products_invalid');
      const productId = nativeIntegerId(row.product_id), quantity = nativeIntegerId(row.amount);
      if (BigInt(quantity) > 10000n || (!nativeRecord(row.product_options) && !Array.isArray(row.product_options))) nativeFail('native_cscart_products_invalid');
      return { productId, quantity, optionsHash: hashPayload(row.product_options) };
    }).sort((a, b) => `${a.productId}:${a.optionsHash}`.localeCompare(`${b.productId}:${b.optionsHash}`));
    // Core order.total is in store-primary currency; mapping evidence must prove AED separately.
    return { nativeOrderId, companyId, paymentMethodId: '18', cashTotalMinor, items, status: raw.status,
      statusEvidence: 'configuration_only', providerOrderId: null, currency: null };
  } });
}
