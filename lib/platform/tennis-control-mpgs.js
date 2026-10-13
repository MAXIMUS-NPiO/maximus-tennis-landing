/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/**
 * SERVER ONLY. MPGS REST API 100 for the separate USD 1 payment control: INITIATE_CHECKOUT and
 * the read-only Payment Options Inquiry. Contract source: the gateway's own API 100 reference
 * (docs/TENNIS_CONTROL_PAYMENT_READINESS.md, "SDK and API contract"). No default transport,
 * credentials, retry, embedded renderer or paid assertion. The caller must durably reserve one
 * attempt BEFORE invoking `initiate`; any unknown outcome remains uncertain and is never resent.
 */
import { badRequest, unavailable } from './errors';
import { NATIVE_MPGS_ORIGIN, NATIVE_MPGS_MERCHANT, MPGS_MERCHANT_ID } from './native-mpgs';
import { site } from '../../data/site';

export const TENNIS_CONTROL_MPGS_CONTRACT = 'mpgs_initiate_checkout_100_hosted_v1';
export const TENNIS_CONTROL_PUBLIC_ORIGIN = 'https://maximus.tennis';
export const TENNIS_CONTROL_RETURN_PATH = '/checkout/control';
/** Payer time window requested from the gateway (seconds): equals the local 15-minute attempt window. */
export const TENNIS_CONTROL_INTERACTION_TIMEOUT_SECONDS = 900;
const ATTEMPT_FIELDS = ['orderId', 'providerOrderId', 'correlation', 'currency', 'totalMinor', 'kind', 'scopeHash', 'attemptedAt', 'localSessionDeadline'];
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const iso = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(Date.parse(value)).toISOString() === value;
const exact = (value, fields) => { if (!plain(value) || Object.keys(value).some(key => !fields.includes(key))) throw badRequest('tennis_control_mpgs_input_invalid'); };
const CURRENCY = /^[A-Z]{3}$/;

/** The payer returns to the control page of the locale the attempt was started from. */
export function tennisControlReturnUrl(locale) {
  if (!site.locales.includes(locale)) throw badRequest('tennis_control_mpgs_locale_invalid');
  return `${TENNIS_CONTROL_PUBLIC_ORIGIN}/${locale}${TENNIS_CONTROL_RETURN_PATH}`;
}

function notificationLocation(value) {
  if (value === undefined || value === null) return null;
  let parsed;
  try { parsed = new globalThis.URL(value); } catch { throw unavailable('tennis_control_mpgs_notification_unconfigured'); }
  if (typeof value !== 'string' || parsed.origin !== TENNIS_CONTROL_PUBLIC_ORIGIN || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.href !== value || !/^\/api\/[a-zA-Z0-9/_-]+$/.test(parsed.pathname) || parsed.pathname.includes('//')) throw unavailable('tennis_control_mpgs_notification_unconfigured');
  return value;
}

export function createTennisControlMpgsAdapter(options = {}) {
  if (typeof window !== 'undefined') throw unavailable('tennis_control_mpgs_server_only');
  exact(options, ['fetchImpl', 'password', 'merchantName', 'merchantId', 'notificationUrl', 'now', 'timeoutMs', 'maxBodyBytes']);
  const { fetchImpl, password, merchantName, merchantId = NATIVE_MPGS_MERCHANT, now = () => Date.now(), timeoutMs = 6000, maxBodyBytes = 16384 } = options;
  if (typeof merchantName !== 'string' || merchantName.length < 1 || merchantName.length > 40 || /[^\x20-\x7e]/.test(merchantName) || merchantName.trim() !== merchantName || typeof fetchImpl !== 'function' || typeof now !== 'function' || typeof password !== 'string' || password.length < 1 || password.length > 512 || /[^\x21-\x7e]/.test(password) || typeof merchantId !== 'string' || !MPGS_MERCHANT_ID.test(merchantId) || !Number.isSafeInteger(timeoutMs) || timeoutMs < 10 || timeoutMs > 6000 || !Number.isSafeInteger(maxBodyBytes) || maxBodyBytes < 64 || maxBodyBytes > 65536) throw unavailable('tennis_control_mpgs_unconfigured');
  const notificationUrl = notificationLocation(options.notificationUrl);
  const base = `${NATIVE_MPGS_ORIGIN}/api/rest/version/100/merchant/${merchantId}`;
  const authorization = `Basic ${Buffer.from(`merchant.${merchantId}:${password}`).toString('base64')}`;

  /** Exactly one bounded POST. Errors carry local codes only; provider bodies never leak. */
  async function post(path, payload, signal, codes) {
    const url = base + path, body = JSON.stringify(payload);
    const controller = new AbortController();
    let timer, response, reader, rejectDeadline;
    const failures = new WeakSet();
    const fail = code => { const error = unavailable(code); failures.add(error); throw error; };
    const cancel = () => { try { if (reader) Promise.resolve(reader.cancel()).catch(() => {}); else if (response?.body && !response.body.locked) Promise.resolve(response.body.cancel()).catch(() => {}); } catch { /* No provider data in errors/logs. */ } };
    const abort = () => { controller.abort(); cancel(); const error = unavailable(codes.aborted); failures.add(error); rejectDeadline(error); };
    const deadline = new Promise((_, reject) => { rejectDeadline = reject; timer = setTimeout(() => { controller.abort(); cancel(); const error = unavailable(codes.timeout); failures.add(error); reject(error); }, timeoutMs); });
    signal?.addEventListener('abort', abort, { once: true });
    try {
      return await Promise.race([deadline, (async () => {
        response = await fetchImpl(url, { method: 'POST', headers: { Authorization: authorization, Accept: 'application/json', 'Content-Type': 'application/json' }, body, signal: controller.signal, redirect: 'manual', cache: 'no-store', credentials: 'omit' });
        if (controller.signal.aborted) { cancel(); fail(codes.aborted); }
        if (response?.redirected || (response?.status >= 300 && response.status <= 399)) fail('tennis_control_mpgs_redirect_forbidden');
        if (response?.url && response.url !== url) fail('tennis_control_mpgs_response_origin_invalid');
        if (![200, 201].includes(response?.status)) fail('tennis_control_mpgs_http_error');
        if (!/^application\/json(?:\s*;|\s*$)/i.test(response.headers?.get('content-type') || '')) fail('tennis_control_mpgs_content_type_invalid');
        const length = response.headers.get('content-length');
        if (length && (!/^\d+$/.test(length) || Number(length) > maxBodyBytes)) fail('tennis_control_mpgs_body_too_large');
        if (!response.body?.getReader) fail('tennis_control_mpgs_response_invalid');
        reader = response.body.getReader();
        const parts = []; let bytes = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (controller.signal.aborted) fail(codes.aborted);
          if (done) break;
          if (!(value instanceof Uint8Array)) fail('tennis_control_mpgs_response_invalid');
          bytes += value.byteLength;
          if (bytes > maxBodyBytes) fail('tennis_control_mpgs_body_too_large');
          parts.push(value);
        }
        let raw;
        try { raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(parts, bytes))); } catch { fail('tennis_control_mpgs_json_invalid'); }
        return raw;
      })()]);
    } catch (error) {
      if (failures.has(error)) throw error;
      // Fetch may include Authorization, session or raw body in its thrown message/code.
      throw unavailable(codes.uncertain);
    } finally {
      clearTimeout(timer); signal?.removeEventListener('abort', abort); controller.abort(); cancel();
      try { reader?.releaseLock(); } catch { /* A pending body read has already been aborted. */ }
    }
  }

  async function initiate(input) {
    exact(input, ['attempt', 'locale', 'signal']); exact(input.attempt, ATTEMPT_FIELDS);
    // Snapshot inputs before awaits; mutation by a caller cannot alter the private receipt.
    const attempt = structuredClone(input.attempt), signal = input.signal;
    const at = now();
    if (!Number.isSafeInteger(at) || !/^MX-CTL-[0-9a-f]{32}$/.test(attempt.orderId || '') || !/^MC[0-9a-f]{32}$/.test(attempt.providerOrderId || '') || !/^tcc_[A-Za-z0-9_-]{43}$/.test(attempt.correlation || '') || !/^[0-9a-f]{64}$/.test(attempt.scopeHash || '') || attempt.kind !== 'payment_control' || attempt.currency !== 'USD' || attempt.totalMinor !== '100' || !Number.isSafeInteger(attempt.attemptedAt) || attempt.attemptedAt > at || !iso(attempt.localSessionDeadline) || Date.parse(attempt.localSessionDeadline) <= at || Date.parse(attempt.localSessionDeadline) > attempt.attemptedAt + 900000 || (signal !== undefined && !(signal instanceof AbortSignal))) throw badRequest('tennis_control_mpgs_attempt_invalid');
    const returnUrl = tennisControlReturnUrl(input.locale);
    if (signal?.aborted) throw unavailable('tennis_control_mpgs_aborted');
    // API 100 Initiate Checkout: interaction.operation/merchant.name/returnUrl/cancelUrl/timeout/
    // timeoutUrl, order.id/amount/currency/description/notificationUrl. The embedded page is a
    // browser-side presentation choice; the session itself is presentation-neutral.
    const payload = { apiOperation: 'INITIATE_CHECKOUT',
      interaction: { operation: 'PURCHASE', returnUrl, cancelUrl: returnUrl, timeoutUrl: returnUrl, timeout: TENNIS_CONTROL_INTERACTION_TIMEOUT_SECONDS, merchant: { name: merchantName, url: TENNIS_CONTROL_PUBLIC_ORIGIN } },
      order: { id: attempt.providerOrderId, reference: attempt.providerOrderId, amount: '1.00', currency: 'USD', description: 'MAXIMUS payment verification control', ...(notificationUrl ? { notificationUrl } : {}) },
      transaction: { reference: attempt.providerOrderId } };
    const raw = await post('/session', payload, signal, { aborted: 'tennis_control_mpgs_aborted', timeout: 'tennis_control_mpgs_timeout', uncertain: 'tennis_control_mpgs_transport_uncertain' });
    if (!plain(raw) || raw.result !== 'SUCCESS' || !plain(raw.session) || !/^SESSION[A-Za-z0-9_-]{10,100}$/.test(raw.session.id || '') || raw.test === true || raw.mock === true || raw.liveMode === false || raw.mode === 'test') throw unavailable('tennis_control_mpgs_session_invalid');
    const receivedAt = now();
    if (!Number.isSafeInteger(receivedAt) || receivedAt < at || receivedAt >= Date.parse(attempt.localSessionDeadline)) throw unavailable('tennis_control_mpgs_local_attempt_expired');
    // Validated session response data: not live/currency authorization and not money proof.
    return { contract: TENNIS_CONTROL_MPGS_CONTRACT, sessionId: raw.session.id, providerOrderId: attempt.providerOrderId, currency: 'USD', totalMinor: '100', correlation: attempt.correlation, verifiedAt: new Date(receivedAt).toISOString(), localSessionDeadline: attempt.localSessionDeadline };
  }

  /**
   * Payment Options Inquiry without filters: the gateway returns every currency and 3-D Secure
   * scheme the merchant profile permits for card payments. Server-side only (it authenticates).
   * The projection is the merchant permission evidence for the control currency; it is not a
   * payment, a session or a minimum-amount statement (the API publishes no minimum amount).
   */
  async function inquire({ signal } = {}) {
    if (signal !== undefined && !(signal instanceof AbortSignal)) throw badRequest('tennis_control_mpgs_input_invalid');
    if (signal?.aborted) throw unavailable('tennis_control_mpgs_aborted');
    const raw = await post('/paymentOptionsInquiry', {}, signal, { aborted: 'tennis_control_mpgs_aborted', timeout: 'tennis_control_mpgs_timeout', uncertain: 'tennis_control_mpgs_inquiry_uncertain' });
    if (!plain(raw) || raw.result !== 'SUCCESS' || raw.merchant !== merchantId) throw unavailable('tennis_control_mpgs_inquiry_invalid');
    const card = plain(raw.paymentTypes) && plain(raw.paymentTypes.card) ? raw.paymentTypes.card : null;
    const currencies = Array.isArray(card?.currencies) ? [...new Set(card.currencies.filter(plain).map(row => row.currency).filter(value => typeof value === 'string' && CURRENCY.test(value)))].sort() : [];
    const schemes = Array.isArray(card?.['3DSecureSchemes']) ? [...new Set(card['3DSecureSchemes'].filter(plain).map(row => row.supportedScheme || row['3DSecureScheme']).filter(value => typeof value === 'string' && /^[A-Z_]{1,30}$/.test(value)))].sort() : [];
    return { contract: 'mpgs_payment_options_inquiry_100_v1', merchantId, cardPayments: card !== null, currencies, threeDSecureSchemes: schemes, usdPermitted: currencies.includes('USD'), observedAt: new Date(now()).toISOString() };
  }
  return Object.freeze({ initiate, inquire, merchantId });
}
