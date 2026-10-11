/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/** MPGS TEST ONLY. No live mode. Browser returns are never payment evidence.
 * Contract: INITIATE_CHECKOUT + authenticated Retrieve Order. Credentials server-only.
 */
import { accessToken } from './access';
import { safeEqual } from '../intake/service';
export function gatewaySettings(env = process.env) {
  if (env.ORDER_PAYMENTS_MODE !== 'test' || env.ORDER_TEST_GATEWAY_APPROVED !== 'true' ||
      !/^TEST[A-Za-z0-9_-]+$/.test(env.MPGS_MERCHANT_ID || '') || !env.MPGS_API_PASSWORD ||
      !/^\d{2,3}$/.test(env.MPGS_API_VERSION || '') || !/^[A-Z]{3}$/.test(env.MPGS_CURRENCY || '') ||
      (env.MPGS_NOTIFICATION_SECRET || '').length !== 32 || !/^https:\/\/[^/]+$/.test(env.ORDER_PUBLIC_ORIGIN || '')) return null;
  try { if (new URL(env.ORDER_PUBLIC_ORIGIN).origin !== env.ORDER_PUBLIC_ORIGIN) return null; } catch { return null; }
  const host = env.MPGS_ORIGIN;
  if (!['https://test-gateway.mastercard.com', 'https://ap-gateway.mastercard.com'].includes(host)) return null;
  return { host, merchant: env.MPGS_MERCHANT_ID, password: env.MPGS_API_PASSWORD, version: env.MPGS_API_VERSION,
    currency: env.MPGS_CURRENCY, secret: env.MPGS_NOTIFICATION_SECRET, publicOrigin: env.ORDER_PUBLIC_ORIGIN };
}
export function createMpgsGateway(cfg, { fetchImpl = fetch } = {}) {
  if (!/^TEST[A-Za-z0-9_-]+$/.test(cfg.merchant || '') || !['https://test-gateway.mastercard.com', 'https://ap-gateway.mastercard.com'].includes(cfg.host)) throw new Error('live_gateway_refused');
  async function call(path, method = 'GET', body) {
    const res = await fetchImpl(`${cfg.host}/api/rest/version/${cfg.version}/merchant/${encodeURIComponent(cfg.merchant)}${path}`, {
      method, headers: { Authorization: `Basic ${Buffer.from(`merchant.${cfg.merchant}:${cfg.password}`).toString('base64')}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}), cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000),
    });
    const d = await res.json();
    if (!res.ok || d.result !== 'SUCCESS') throw new Error('gateway_unavailable');
    return d;
  }
  return {
    mode: 'test', currency: cfg.currency,
    authenticate(headers) { return safeEqual(headers.get('x-notification-secret') || '', cfg.secret); },
    async createSession(doc) {
      const q = doc.snapshot.offer;
      if (doc.snapshot.plan !== 'A' || q.currency !== cfg.currency) throw new Error('payment_route_unapproved');
      const returnUrl = `${cfg.publicOrigin}/${doc.snapshot.locale}/orders#order=${doc.id}&access=${accessToken(doc, cfg.accessSecret)}`;
      const d = await call('/session', 'POST', { apiOperation: 'INITIATE_CHECKOUT',
        interaction: { operation: 'PURCHASE', merchant: { name: q.seller.legalName }, returnUrl, cancelUrl: `${cfg.publicOrigin}/${doc.snapshot.locale}/orders` },
        order: { id: doc.id, currency: q.currency, amount: (q.totalMinor / 100).toFixed(2), description: 'MAXIMUS racquet order', notificationUrl: `${cfg.publicOrigin}/api/orders/webhook` },
      });
      if (!/^SESSION[A-Za-z0-9_-]{10,}$/.test(d.session?.id || '')) throw new Error('gateway_bad_session');
      return { sessionId: d.session.id, gatewayOrigin: cfg.host, url: `${cfg.publicOrigin}/${doc.snapshot.locale}/orders` };
    },
    async retrieve(id) { return call(`/order/${encodeURIComponent(id)}`); },
  };
}
function minor(amount) {
  const s = String(amount);
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(s)) return null;
  const [whole, decimals = ''] = s.split('.');
  return Number(whole) * 100 + Number(decimals.padEnd(2, '0'));
}
export function verifiedPayment(remote, doc, merchant) {
  const q = doc.snapshot.offer;
  if (!q || remote.id !== doc.id || remote.merchant !== merchant || remote.currency !== q.currency ||
      minor(remote.amount) !== q.totalMinor || !Array.isArray(remote.transaction)) throw new Error('payment_mismatch');
  const captured = minor(remote.totalCapturedAmount), refunded = minor(remote.totalRefundedAmount || 0);
  if (captured === null || refunded === null || captured > q.totalMinor || refunded > captured) throw new Error('payment_capture_mismatch');
  if (refunded > 0) return { status: 'refunded' };
  if (['DISPUTED', 'CHARGEBACK_PROCESSED'].includes(remote.status)) return { status: 'review_required' };
  const purchase = remote.transaction.find(t => ['PAYMENT', 'CAPTURE'].includes(t.transaction?.type) && t.result === 'SUCCESS' &&
    t.response?.gatewayCode === 'APPROVED' && minor(t.transaction.amount) === q.totalMinor && t.transaction.currency === q.currency && typeof t.transaction.id === 'string');
  if (remote.status === 'CAPTURED' && captured === q.totalMinor && purchase) return { status: 'paid', transactionId: purchase.transaction.id };
  if (remote.status === 'CANCELLED') return { status: 'cancelled' };
  if (remote.status === 'FAILED') return { status: 'failed' };
  return { status: 'pending' }; // AUTHORIZED is not paid.
}
