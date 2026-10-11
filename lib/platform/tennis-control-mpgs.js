/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/**
 * SERVER ONLY. Source-derived MPGS API 100 INITIATE_CHECKOUT for a separate USD 1 control.
 * No default transport, credentials, runtime wiring, retry, embedded renderer or paid assertion.
 * Source evidence and deliberate omissions: docs/MPGS_ARCHIVE_SOURCE_CONTRACT.md.
 * The caller must durably reserve one attempt BEFORE invoking this adapter. Any unknown outcome
 * remains uncertain: retrying a POST is not a recovery strategy, including after process restart.
 */
import { badRequest, unavailable } from './errors';
import { NATIVE_MPGS_ORIGIN, NATIVE_MPGS_MERCHANT } from './native-mpgs';

export const TENNIS_CONTROL_MPGS_CONTRACT = 'mpgs_initiate_checkout_100_hosted_v1';
const SESSION_URL = `${NATIVE_MPGS_ORIGIN}/api/rest/version/100/merchant/${NATIVE_MPGS_MERCHANT}/session`;
const PUBLIC_ORIGIN = 'https://maximus.tennis';
const ATTEMPT_FIELDS = ['orderId', 'providerOrderId', 'correlation', 'currency', 'totalMinor', 'kind', 'scopeHash', 'attemptedAt', 'localSessionDeadline'];
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const iso = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(Date.parse(value)).toISOString() === value;
const exact = (value, fields) => { if (!plain(value) || Object.keys(value).some(key => !fields.includes(key))) throw badRequest('tennis_control_mpgs_input_invalid'); };

function returnLocation(value) {
  let parsed;
  try { parsed = new globalThis.URL(value); } catch { throw unavailable('tennis_control_mpgs_return_unconfigured'); }
  // Origin approval is a separate runtime prerequisite. No preview wildcard or descriptor/query.
  if (typeof value !== 'string' || parsed.origin !== PUBLIC_ORIGIN || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.href !== value || !/^\/[a-zA-Z0-9/_-]*$/.test(parsed.pathname) || parsed.pathname.includes('//')) throw unavailable('tennis_control_mpgs_return_unconfigured');
  return value;
}

export function createTennisControlMpgsAdapter(options = {}) {
  if (typeof window !== 'undefined') throw unavailable('tennis_control_mpgs_server_only');
  exact(options, ['fetchImpl', 'password', 'merchantName', 'returnUrl', 'cancelUrl', 'now', 'timeoutMs', 'maxBodyBytes']);
  const { fetchImpl, password, merchantName, now = () => Date.now(), timeoutMs = 6000, maxBodyBytes = 16384 } = options;
  if (typeof merchantName !== 'string' || merchantName.length < 1 || merchantName.length > 40 || /[^\x20-\x7e]/.test(merchantName) || merchantName.trim() !== merchantName || typeof fetchImpl !== 'function' || typeof now !== 'function' || typeof password !== 'string' || password.length < 1 || password.length > 512 || /[^\x21-\x7e]/.test(password) || !Number.isSafeInteger(timeoutMs) || timeoutMs < 10 || timeoutMs > 6000 || !Number.isSafeInteger(maxBodyBytes) || maxBodyBytes < 64 || maxBodyBytes > 65536) throw unavailable('tennis_control_mpgs_unconfigured');
  const returnUrl = returnLocation(options.returnUrl), cancelUrl = returnLocation(options.cancelUrl);
  const authorization = `Basic ${Buffer.from(`merchant.${NATIVE_MPGS_MERCHANT}:${password}`).toString('base64')}`;

  async function initiate(input) {
    exact(input, ['attempt', 'signal']); exact(input.attempt, ATTEMPT_FIELDS);
    // Snapshot inputs before awaits; mutation by a caller cannot alter the private receipt.
    const attempt = structuredClone(input.attempt), signal = input.signal;
    const at = now();
    if (!Number.isSafeInteger(at) || !/^MX-CTL-[0-9a-f]{32}$/.test(attempt.orderId || '') || !/^MC[0-9a-f]{32}$/.test(attempt.providerOrderId || '') || !/^tcc_[A-Za-z0-9_-]{43}$/.test(attempt.correlation || '') || !/^[0-9a-f]{64}$/.test(attempt.scopeHash || '') || attempt.kind !== 'payment_control' || attempt.currency !== 'USD' || attempt.totalMinor !== '100' || !Number.isSafeInteger(attempt.attemptedAt) || attempt.attemptedAt > at || !iso(attempt.localSessionDeadline) || Date.parse(attempt.localSessionDeadline) <= at || Date.parse(attempt.localSessionDeadline) > attempt.attemptedAt + 900000 || (signal !== undefined && !(signal instanceof AbortSignal))) throw badRequest('tennis_control_mpgs_attempt_invalid');
    if (signal?.aborted) throw unavailable('tennis_control_mpgs_aborted');
    const body = JSON.stringify({ apiOperation: 'INITIATE_CHECKOUT', interaction: { operation: 'PURCHASE', returnUrl, cancelUrl, merchant: { name: merchantName } }, order: { id: attempt.providerOrderId, reference: attempt.providerOrderId, amount: '1.00', currency: 'USD', description: 'MAXIMUS payment verification control'  }, transaction: { reference: attempt.providerOrderId } });
    const controller = new AbortController();
    let timer, response, reader, rejectDeadline;
    const failures = new WeakSet();
    const fail = code => { const error = unavailable(code); failures.add(error); throw error; };
    const cancel = () => { try { if (reader) Promise.resolve(reader.cancel()).catch(() => {}); else if (response?.body && !response.body.locked) Promise.resolve(response.body.cancel()).catch(() => {}); } catch { /* No provider data in errors/logs. */ } };
    const abort = () => { controller.abort(); cancel(); const error = unavailable('tennis_control_mpgs_aborted'); failures.add(error); rejectDeadline(error); };
    const deadline = new Promise((_, reject) => { rejectDeadline = reject; timer = setTimeout(() => { controller.abort(); cancel(); const error = unavailable('tennis_control_mpgs_timeout'); failures.add(error); reject(error); }, timeoutMs); });
    signal?.addEventListener('abort', abort, { once: true });
    try {
      return await Promise.race([deadline, (async () => {
        // Exactly one attempt; neither errors nor redirects are resent by this adapter.
        response = await fetchImpl(SESSION_URL, { method: 'POST', headers: { Authorization: authorization, Accept: 'application/json', 'Content-Type': 'application/json' }, body, signal: controller.signal, redirect: 'manual', cache: 'no-store', credentials: 'omit' });
        if (controller.signal.aborted) { cancel(); fail('tennis_control_mpgs_aborted'); }
        if (response?.redirected || (response?.status >= 300 && response.status <= 399)) fail('tennis_control_mpgs_redirect_forbidden');
        if (response?.url && response.url !== SESSION_URL) fail('tennis_control_mpgs_response_origin_invalid');
        if (![200, 201].includes(response?.status)) fail('tennis_control_mpgs_http_error');
        if (!/^application\/json(?:\s*;|\s*$)/i.test(response.headers?.get('content-type') || '')) fail('tennis_control_mpgs_content_type_invalid');
        const length = response.headers.get('content-length');
        if (length && (!/^\d+$/.test(length) || Number(length) > maxBodyBytes)) fail('tennis_control_mpgs_body_too_large');
        if (!response.body?.getReader) fail('tennis_control_mpgs_response_invalid');
        reader = response.body.getReader();
        const parts = []; let bytes = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (controller.signal.aborted) fail('tennis_control_mpgs_aborted');
          if (done) break;
          if (!(value instanceof Uint8Array)) fail('tennis_control_mpgs_response_invalid');
          bytes += value.byteLength;
          if (bytes > maxBodyBytes) fail('tennis_control_mpgs_body_too_large');
          parts.push(value);
        }
        let raw;
        try { raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(parts, bytes))); } catch { fail('tennis_control_mpgs_json_invalid'); }
        if (!plain(raw) || raw.result !== 'SUCCESS' || !plain(raw.session) || !/^SESSION[A-Za-z0-9_-]{10,100}$/.test(raw.session.id || '') || raw.test === true || raw.mock === true || raw.liveMode === false || raw.mode === 'test') fail('tennis_control_mpgs_session_invalid');
        const receivedAt = now();
        if (!Number.isSafeInteger(receivedAt) || receivedAt < at || receivedAt >= Date.parse(attempt.localSessionDeadline)) fail('tennis_control_mpgs_local_attempt_expired');
        // This is validated session response data, not live/currency authorization or money proof.
        return { contract: TENNIS_CONTROL_MPGS_CONTRACT, sessionId: raw.session.id, providerOrderId: attempt.providerOrderId, currency: 'USD', totalMinor: '100', correlation: attempt.correlation, verifiedAt: new Date(receivedAt).toISOString(), localSessionDeadline: attempt.localSessionDeadline };
      })()]);
    } catch (error) {
      if (failures.has(error)) throw error;
      // Fetch may include Authorization, session or raw body in its thrown message/code.
      throw unavailable('tennis_control_mpgs_transport_uncertain');
    } finally {
      clearTimeout(timer); signal?.removeEventListener('abort', abort); controller.abort(); cancel();
      try { reader?.releaseLock(); } catch { /* A pending body read has already been aborted. */ }
    }
  }
  return Object.freeze({ initiate });
}
