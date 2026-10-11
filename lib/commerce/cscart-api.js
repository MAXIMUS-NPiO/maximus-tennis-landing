/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/** Read-only native CS-Cart API metadata. This is not a payment adapter.
 * Credentials are supplied by an operator at runtime; never load configuration
 * files, expose raw responses, or query orders/customers/payment transactions.
 */
export const CS_CART_ORIGIN = 'https://maximussports.ae';
const PAYMENT_ID = 18;
const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_MAX_BODY_BYTES = 262144;
const ERROR_CODES = new Set(['cscart_id_invalid', 'cscart_limit_invalid', 'cscart_response_invalid',
  'cscart_content_type_invalid', 'cscart_body_too_large', 'cscart_json_invalid', 'cscart_origin_forbidden',
  'cscart_api_version_invalid', 'cscart_credentials_missing_or_invalid', 'cscart_product_ids_required',
  'cscart_product_ids_invalid', 'cscart_transport_unavailable', 'cscart_product_forbidden', 'cscart_timeout',
  'cscart_redirect_forbidden', 'cscart_response_origin_invalid', 'cscart_http_error', 'cscart_network_error',
  'cscart_payment_response_invalid', 'cscart_store_response_invalid', 'cscart_product_response_invalid',
  'cscart_option_product_mismatch', 'cscart_variant_option_mismatch', 'cscart_currency_invalid',
  'cscart_cli_arguments_invalid', 'cscart_inspection_failed']);

export class CsCartReadError extends Error {
  constructor(code, status = undefined) {
    const safeCode = ERROR_CODES.has(code) ? code : 'cscart_inspection_failed';
    super(safeCode);
    this.name = 'CsCartReadError';
    this.code = safeCode;
    if (Number.isInteger(status) && status >= 100 && status <= 599) this.status = status;
  }
}
const fail = (code, status) => { throw new CsCartReadError(code, status); };
const record = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const own = (x, k) => record(x) && Object.hasOwn(x, k) ? x[k] : undefined;
function id(value, allowZero = false) {
  const s = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value;
  if (typeof s !== 'string' || !/^(0|[1-9][0-9]{0,14})$/.test(s)) fail('cscart_id_invalid');
  const n = Number(s);
  if (!Number.isSafeInteger(n) || n < (allowZero ? 0 : 1)) fail('cscart_id_invalid');
  return n;
}
function limit(value, fallback, min, max) {
  const v = value === undefined ? fallback : value;
  if (!Number.isSafeInteger(v) || v < min || v > max) fail('cscart_limit_invalid');
  return v;
}
function enumValue(value, values) { return values.includes(value) ? value : null; }
function currency(value) { return typeof value === 'string' && /^[A-Z]{3}$/.test(value) ? value : null; }
function decimal(value) {
  // Preserve the store's decimal representation; never convert to an amount in
  // a different currency or round it into a payable price here.
  return typeof value === 'string' && /^-?(?:0|[1-9][0-9]{0,11})(?:\.[0-9]{1,6})?$/.test(value) ? value : null;
}
function storefrontMatches(value) {
  if (typeof value !== 'string' || value.length > 1024) return false;
  try {
    const u = new URL(value.includes('://') ? value : `https://${value}`);
    return u.origin === CS_CART_ORIGIN && !u.username && !u.password && !u.search && !u.hash && u.pathname === '/';
  } catch { return false; }
}
function records(value, maximum) {
  let list;
  if (Array.isArray(value)) list = value;
  else if (record(value) && Object.keys(value).every(k => /^(0|[1-9][0-9]*)$/.test(k))) list = Object.values(value);
  else fail('cscart_response_invalid');
  if (list.length > maximum || !list.every(record)) fail('cscart_response_invalid');
  return list;
}
async function boundedJson(response, maxBytes, signal) {
  if (!response?.headers || typeof response.headers.get !== 'function' || !response.body?.getReader) fail('cscart_response_invalid');
  const type = response.headers.get('content-type') || '';
  if (!/^application\/(?:json|[a-z0-9!#$&^_.+-]+\+json)(?:\s*;|\s*$)/i.test(type)) fail('cscart_content_type_invalid');
  const declared = response.headers.get('content-length');
  if (declared && /^\d+$/.test(declared) && Number(declared) > maxBytes) fail('cscart_body_too_large');
  const reader = response.body.getReader();
  const cancel = () => { try { Promise.resolve(reader.cancel()).catch(() => {}); } catch { /* Redacted. */ } };
  signal.addEventListener('abort', cancel, { once: true });
  const parts = [];
  let length = 0;
  let finished = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) { finished = true; break; }
      if (!(value instanceof Uint8Array)) fail('cscart_response_invalid');
      length += value.byteLength;
      if (length > maxBytes) fail('cscart_body_too_large');
      parts.push(value);
    }
    let result;
    try { result = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(parts, length))); }
    catch { fail('cscart_json_invalid'); }
    if (!record(result) && !Array.isArray(result)) fail('cscart_response_invalid');
    return result;
  } finally {
    signal.removeEventListener('abort', cancel);
    if (!finished) cancel();
    try { reader.releaseLock(); } catch { /* The deadline can abort an outstanding read. */ }
  }
}

export function createCsCartReadClient({ user, key, storeId, productIds, origin = CS_CART_ORIGIN,
  apiVersion = '2.0', timeoutMs, maxBodyBytes, fetchImpl = globalThis.fetch } = {}) {
  // Strict literal allowlist also rejects credentials, paths, alternate ports,
  // fragments, query strings and otherwise equivalent but unexpected URLs.
  if (origin !== CS_CART_ORIGIN) fail('cscart_origin_forbidden');
  if (!['1.0', '2.0'].includes(apiVersion)) fail('cscart_api_version_invalid');
  if (typeof user !== 'string' || user.length > 254 || !/^[^\s:@]+@[^\s:@]+\.[^\s:@]+$/.test(user) ||
      typeof key !== 'string' || !key.length || key.length > 512 || /[^\x21-\x7e]/.test(key)) fail('cscart_credentials_missing_or_invalid');
  const selectedStoreId = id(storeId);
  if (!Array.isArray(productIds) || !productIds.length || productIds.length > 10) fail('cscart_product_ids_required');
  const selectedProducts = new Set(productIds.map(x => id(x)));
  if (selectedProducts.size !== productIds.length) fail('cscart_product_ids_invalid');
  const timeout = limit(timeoutMs, DEFAULT_TIMEOUT_MS, 10, 30000);
  const bodyLimit = limit(maxBodyBytes, DEFAULT_MAX_BODY_BYTES, 64, 1048576);
  if (typeof fetchImpl !== 'function') fail('cscart_transport_unavailable');
  const basicToken = Buffer.from(`${user}:${key}`, 'utf8').toString('base64');
  const protectedValues = [user, key, `${user}:${key}`, basicToken, `Basic ${basicToken}`]
    .flatMap(v => [v, encodeURIComponent(v)]).sort((a, b) => b.length - a.length);
  const safeText = value => {
    if (typeof value !== 'string') return null;
    let s = value;
    for (const secret of protectedValues) s = s.split(secret).join('[redacted]');
    return s.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').slice(0, 200);
  };
  const safeCurrency = value => {
    const c = currency(value);
    return c && !protectedValues.includes(c) ? c : null;
  };
  const requireProduct = value => {
    const n = id(value);
    if (!selectedProducts.has(n)) fail('cscart_product_forbidden');
    return n;
  };
  const prefix = apiVersion === '2.0' ? '/api/2.0/' : '/api/';
  async function get(route) {
    // No caller-controlled path, method, query or header can reach this function.
    const url = `${CS_CART_ORIGIN}${prefix}${route}`;
    const controller = new AbortController();
    let timer;
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new CsCartReadError('cscart_timeout')); }, timeout);
    });
    let response;
    try {
      return await Promise.race([deadline, (async () => {
        response = await fetchImpl(url, { method: 'GET', headers: { Accept: 'application/json', Authorization: `Basic ${basicToken}` },
          signal: controller.signal, redirect: 'manual', credentials: 'omit', cache: 'no-store' });
        if (response?.redirected || (response?.status >= 300 && response.status <= 399)) fail('cscart_redirect_forbidden');
        if (response?.url && response.url !== url) fail('cscart_response_origin_invalid');
        if (response?.status !== 200) fail('cscart_http_error', response?.status);
        return await boundedJson(response, bodyLimit, controller.signal);
      })()]);
    } catch (error) {
      if (error instanceof CsCartReadError) throw error;
      // Deliberately do not preserve error.message, response text, headers or
      // cause: any of them can contain the authorization or processor secrets.
      fail('cscart_network_error');
    } finally {
      clearTimeout(timer);
      controller.abort();
      if (response?.body && !response.body.locked) {
        try { Promise.resolve(response.body.cancel()).catch(() => {}); } catch { /* Closed response. */ }
      }
    }
  }
  return Object.freeze({
    origin: CS_CART_ORIGIN,
    apiVersion,
    selectedStoreId,
    selectedProductIds: Object.freeze([...selectedProducts]),
    async readPayment18() {
      const p = await get(`payments/${PAYMENT_ID}`);
      if (!record(p) || id(own(p, 'payment_id')) !== PAYMENT_ID || !enumValue(own(p, 'status'), ['A', 'D', 'H'])) fail('cscart_payment_response_invalid');
      // currency is the sole allowlisted processor parameter. Never return the
      // processor_params object or merchant IDs, API passwords, hosts or keys.
      const configuredCurrency = safeCurrency(own(own(p, 'processor_params'), 'currency'));
      return { paymentId: PAYMENT_ID, name: safeText(own(p, 'payment')), status: p.status,
        companyId: own(p, 'company_id') === undefined ? null : id(p.company_id, true),
        processorName: safeText(own(p, 'processor')), processorId: own(p, 'processor_id') === undefined ? null : id(p.processor_id, true),
        processorType: enumValue(own(p, 'processor_type'), ['C', 'P']), configuredCurrency,
        currencySource: configuredCurrency ? 'processor_params.currency' : 'not_reported',
        paymentEvidence: 'configuration_only' };
    },
    async readStore() {
      const s = await get(`stores/${selectedStoreId}`);
      if (!record(s) || id(own(s, 'company_id')) !== selectedStoreId) fail('cscart_store_response_invalid');
      return { companyId: selectedStoreId, name: safeText(own(s, 'company')),
        status: enumValue(own(s, 'status'), ['A', 'D', 'H']),
        storefrontMatchesOrigin: storefrontMatches(own(s, 'secure_storefront')) || storefrontMatches(own(s, 'storefront')),
        primaryCurrency: null, currencySource: 'stores_api_does_not_document_primary_currency' };
    },
    async readProduct(productId) {
      const selectedId = requireProduct(productId);
      const p = await get(`products/${selectedId}`);
      if (!record(p) || id(own(p, 'product_id')) !== selectedId || !enumValue(own(p, 'status'), ['A', 'D', 'H'])) fail('cscart_product_response_invalid');
      return { productId: selectedId, companyId: own(p, 'company_id') === undefined ? null : id(p.company_id, true),
        name: safeText(own(p, 'product')), code: safeText(own(p, 'product_code')), status: p.status,
        basePrice: decimal(own(p, 'price')), priceBasis: 'store_primary_currency',
        reportedCurrency: safeCurrency(own(p, 'currency')), optionsType: enumValue(own(p, 'options_type'), ['S', 'P']),
        exceptionsType: enumValue(own(p, 'exceptions_type'), ['A', 'F']) };
    },
    async readProductOptions(productId) {
      const selectedId = requireProduct(productId);
      const raw = await get(`options?product_id=${selectedId}`);
      const collection = record(raw) && Object.hasOwn(raw, 'options') ? raw.options : raw;
      return records(collection, 200).map(o => {
        const optionId = id(own(o, 'option_id'));
        const associatedProductId = id(own(o, 'product_id'), true);
        if (associatedProductId !== 0 && associatedProductId !== selectedId) fail('cscart_option_product_mismatch');
        const variants = records(own(o, 'variants') ?? [], 500).map(v => {
          if (id(own(v, 'option_id')) !== optionId) fail('cscart_variant_option_mismatch');
          return { variantId: id(own(v, 'variant_id')), name: safeText(own(v, 'variant_name')),
            modifier: decimal(own(v, 'modifier')), modifierType: enumValue(own(v, 'modifier_type'), ['A', 'P']) };
        });
        return { optionId, productId: associatedProductId, companyId: own(o, 'company_id') === undefined ? null : id(o.company_id, true),
          name: safeText(own(o, 'option_name')), type: enumValue(own(o, 'option_type'), ['S', 'R', 'C', 'I', 'T', 'F']),
          status: enumValue(own(o, 'status'), ['A', 'D']), required: enumValue(own(o, 'required'), ['Y', 'N']),
          inventory: enumValue(own(o, 'inventory'), ['Y', 'N']), variants };
      });
    },
  });
}

export async function inspectCsCartSelection(client, { declaredPrimaryCurrency, now = new Date() } = {}) {
  if (declaredPrimaryCurrency !== undefined && !currency(declaredPrimaryCurrency)) fail('cscart_currency_invalid');
  const payment = await client.readPayment18();
  const store = await client.readStore();
  const products = [];
  for (const productId of client.selectedProductIds) {
    products.push({ ...await client.readProduct(productId), options: await client.readProductOptions(productId) });
  }
  return { evidence: 'read_only_api_metadata', observedAt: now.toISOString(), origin: CS_CART_ORIGIN, apiVersion: client.apiVersion,
    payment, store, products, currencyMapping: { declaredPrimaryCurrency: declaredPrimaryCurrency ?? null,
      declarationEvidence: declaredPrimaryCurrency ? 'operator_declaration_not_api_verification' : 'not_supplied',
      configuredPaymentCurrency: payment.configuredCurrency, primaryCurrencyVerified: false,
      conversionVerified: false }, checks: { paymentActive: payment.status === 'A',
      processorNameMentionsMastercardOrMpgs: typeof payment.processorName === 'string' && /mastercard|mpgs/i.test(payment.processorName),
      paymentCompanyMatches: payment.companyId === 0 || payment.companyId === store.companyId,
      productsCompanyMatch: products.every(p => p.companyId === store.companyId),
      productsActive: products.every(p => p.status === 'A'), storefrontMatchesOrigin: store.storefrontMatchesOrigin },
    readyForPayments: false, readinessEvidenceMissing: ['current_checkout_authorization', 'verified_primary_currency_and_price_mapping',
      'selected_options_and_combination_validation', 'verified_psp_result_bound_to_order', 'current_live_or_test_mode'] };
}
