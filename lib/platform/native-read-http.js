/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/** SERVER ONLY. Fixed-origin authenticated GET. No writes, cookies, redirect following or raw errors. */
import { unavailable } from './errors';

export const nativeRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const nativeFail = code => { throw unavailable(code); };
const HTTP_CODES = new Set(['native_read_timeout', 'native_read_aborted', 'native_redirect_forbidden', 'native_response_origin_invalid',
  'native_read_http_error', 'native_content_type_invalid', 'native_body_too_large', 'native_response_invalid', 'native_json_invalid']);
export function nativeLosslessJsonSupported() {
  let supported = false;
  JSON.parse('1', (_key, value, context) => { supported = value === 1 && context?.source === '1'; return value; });
  return supported;
}
export function nativeId(value) {
  // Supported safe subset of MPGS's documented 1..40-character order/transaction identifiers.
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(value)) nativeFail('native_identifier_invalid');
  return value;
}
export function nativeIntegerId(value, { zero = false } = {}) {
  if (typeof value === 'number' && Number.isSafeInteger(value)) value = String(value);
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,14})$/.test(value) || (!zero && value === '0')) nativeFail('native_identifier_invalid');
  return value;
}
export function nativeMinor(value) {
  // JSON numbers are deliberately refused: financial decimal precision must survive transport.
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,25})(?:\.\d{1,2})?$/.test(value)) nativeFail('native_amount_invalid');
  const [whole, fraction = ''] = value.split('.');
  return String(BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0')));
}
export function nativeTime(value, now) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) || !Number.isFinite(Date.parse(value)) || Date.parse(value) > now) nativeFail('native_time_invalid');
  const iso = new Date(value).toISOString();
  if (iso.slice(0, 19) !== value.slice(0, 19)) nativeFail('native_time_invalid');
  return iso;
}
export function createNativeReadHttp({ origin, authorization, fetchImpl = globalThis.fetch, timeoutMs = 10000, maxBodyBytes = 262144, signal }) {
  if (!['https://ap-gateway.mastercard.com', 'https://maximussports.ae'].includes(origin)) nativeFail('native_origin_forbidden');
  if (typeof authorization !== 'string' || !/^Basic [A-Za-z0-9+/]+={0,2}$/.test(authorization)) nativeFail('native_credentials_invalid');
  if (typeof fetchImpl !== 'function' || !Number.isSafeInteger(timeoutMs) || timeoutMs < 10 || timeoutMs > 30000 || !Number.isSafeInteger(maxBodyBytes) || maxBodyBytes < 64 || maxBodyBytes > 1048576) nativeFail('native_transport_configuration_invalid');
  /**
   * `accept` (optional) lists additional HTTP statuses whose JSON body is returned instead of
   * failing, as `{ status, data }`. Without it the historical contract holds: 200 only, body only.
   */
  return async function get(path, { accept } = {}) {
    if (signal?.aborted) nativeFail('native_read_aborted');
    if (typeof path !== 'string' || !/^\/api\/[A-Za-z0-9_./-]+$/.test(path) || path.includes('..')) nativeFail('native_route_forbidden');
    const accepted = accept === undefined ? null : accept;
    if (accepted !== null && (!Array.isArray(accepted) || accepted.some(code => !Number.isInteger(code) || code < 400 || code > 499))) nativeFail('native_transport_configuration_invalid');
    const url = origin + path;
    const controller = new AbortController();
    let timer, response, reader, rejectDeadline;
    const cancel = () => {
      try { if (reader) Promise.resolve(reader.cancel()).catch(() => {}); else if (response?.body && !response.body.locked) Promise.resolve(response.body.cancel()).catch(() => {}); } catch { /* Never preserve transport content. */ }
    };
    const abort = () => { controller.abort(); cancel(); rejectDeadline(unavailable('native_read_aborted')); };
    const deadline = new Promise((_, reject) => { rejectDeadline = reject; timer = setTimeout(() => { controller.abort(); cancel(); reject(unavailable('native_read_timeout')); }, timeoutMs); });
    signal?.addEventListener('abort', abort, { once: true });
    try {
      return await Promise.race([deadline, (async () => {
        response = await fetchImpl(url, { method: 'GET', headers: { Accept: 'application/json', Authorization: authorization }, signal: controller.signal, redirect: 'manual', cache: 'no-store', credentials: 'omit' });
        if (controller.signal.aborted) { cancel(); nativeFail('native_read_aborted'); }
        if (response?.redirected || (response?.status >= 300 && response.status <= 399)) nativeFail('native_redirect_forbidden');
        if (response?.url && response.url !== url) nativeFail('native_response_origin_invalid');
        const classified = response?.status !== 200 && accepted !== null && accepted.includes(response?.status);
        if (response?.status !== 200 && !classified) nativeFail('native_read_http_error');
        if (!/^application\/(?:json|[a-z0-9!#$&^_.+-]+\+json)(?:\s*;|\s*$)/i.test(response.headers?.get('content-type') || '')) nativeFail('native_content_type_invalid');
        const length = response.headers.get('content-length');
        if (length && (!/^\d+$/.test(length) || Number(length) > maxBodyBytes)) nativeFail('native_body_too_large');
        if (!response.body?.getReader) nativeFail('native_response_invalid');
        reader = response.body.getReader();
        const parts = []; let bytes = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (controller.signal.aborted) nativeFail('native_read_timeout');
          if (done) break;
          if (!(value instanceof Uint8Array)) nativeFail('native_response_invalid');
          bytes += value.byteLength;
          if (bytes > maxBodyBytes) nativeFail('native_body_too_large');
          parts.push(value);
        }
        let data;
        try { data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(parts, bytes)), (_key, value, context) => {
          if (typeof value !== 'number') return value;
          if (typeof context?.source !== 'string') nativeFail('native_decimal_transport_unavailable');
          return context.source; // Original decimal token, including integers larger than Number.MAX_SAFE_INTEGER.
        }); } catch { nativeFail('native_json_invalid'); }
        if (!nativeRecord(data)) nativeFail('native_response_invalid');
        return accepted === null ? data : { status: response.status, data };
      })()]);
    } catch (error) {
      // Only locally generated codes survive. Fetch errors may contain Authorization, PAN or body.
      if (error?.status === 503 && HTTP_CODES.has(error.code)) nativeFail(error.code);
      nativeFail('native_read_network_error');
    } finally {
      clearTimeout(timer); signal?.removeEventListener('abort', abort); controller.abort(); cancel();
      try { reader?.releaseLock(); } catch { /* Outstanding read is already aborted. */ }
    }
  };
}
