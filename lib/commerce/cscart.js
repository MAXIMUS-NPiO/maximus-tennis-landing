/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/** Priority backend: existing maximussports.ae CS-Cart checkout (payment_id 18).
 * Draft contract, transport injected in mock tests. No live HTTP/client credentials.
 * Both CS-Cart and the PSP must approve the route, currency, products and recipient.
 */
import crypto from 'node:crypto';
import { orderIdRE } from './access';
import { canonical, safeEqual } from '../intake/service';
const hashTechnical = x => crypto.createHash('sha256').update(canonical(x)).digest('hex');
const signature = (b, secret) => crypto.createHmac('sha256', secret).update(canonical(b)).digest('hex');
export function cscartHandoff(doc, route, secret, now = Date.now()) {
  const q = doc.snapshot.offer;
  if (!route?.approved || route.mode !== 'test' || !route.pspAgreementReference || !secret || secret.length < 32 ||
      route.project_id !== doc.snapshot.projectId || doc.snapshot.plan !== 'A' || !doc.snapshot.fulfillment?.verified || !doc.snapshot.technical?.final || !doc.snapshot.quotation || !q || q.pricingPolicy !== 'worldwide-all-inclusive-v1' || q.currency !== route.currency || q.seller.legalName !== route.seller_legal_entity ||
      route.origin !== 'https://maximussports.ae' || !route.payment_recipient || route.payment_id !== 18 ||
      !route.items?.length || !route.items.every(x => Number.isSafeInteger(x.product_id) && x.product_id > 0 && Number.isSafeInteger(x.quantity) && x.quantity > 0 && Number.isSafeInteger(x.unit_price_minor) && x.unit_price_minor > 0) ||
      route.items.reduce((n, x) => n + x.quantity * x.unit_price_minor, 0) !== q.productMinor ||
      route.configurationHash !== doc.snapshot.configurationHash || !route.return_urls.includes(route.return_url)) throw new Error('cscart_route_unapproved');
  const b = { version: 1, project_id: route.project_id, order_id: doc.id, seller_legal_entity: route.seller_legal_entity,
    payment_recipient: route.payment_recipient, amount_minor: q.totalMinor, currency: q.currency, payment_id: 18,
    items: route.items, tax_minor: q.taxMinor, shipping_minor: q.shippingMinor,
    configuration_hash: doc.snapshot.configurationHash, technical: doc.snapshot.technical, fulfillment_country: doc.snapshot.fulfillment.country, pricing_policy: q.pricingPolicy, return_url: route.return_url, notification_url: route.notification_url,
    issued_at: now, expires_at: now + 300000, nonce: crypto.randomBytes(16).toString('hex'), mode: 'test' };
  return { body: b, signature: signature(b, secret) };
}
export async function receiveCscartHandoff(session, route, secret, { claimNonce, lookupProduct, now = Date.now() }) {
  const b = session?.body;
  if (!b || !secret || secret.length < 32 || !safeEqual(session.signature || '', signature(b, secret)) ||
      b.project_id !== route.project_id || b.seller_legal_entity !== route.seller_legal_entity || b.payment_recipient !== route.payment_recipient ||
      b.pricing_policy !== 'worldwide-all-inclusive-v1' || !route.fulfillmentCountries?.includes(b.fulfillment_country) || b.currency !== route.currency || b.payment_id !== 18 || b.mode !== 'test' || !route.approved || !route.pspAgreementReference ||
      !route.return_urls.includes(b.return_url) || b.notification_url !== route.notification_url ||
      !Number.isSafeInteger(b.expires_at) || !Number.isSafeInteger(b.issued_at) || b.expires_at <= b.issued_at || b.expires_at <= now || b.issued_at > now + 30000 || b.expires_at - b.issued_at > 300000 ||
      !Array.isArray(b.items) || b.items.length !== route.items.length || canonical(b.items) !== canonical(route.items) ||
      hashTechnical(b.technical) !== route.technicalHash || b.technical?.final !== true || !orderIdRE.test(b.order_id || '') || b.amount_minor !== route.totalMinor || b.tax_minor !== route.taxMinor || b.shipping_minor !== route.shippingMinor || b.configuration_hash !== route.configurationHash || !/^[0-9a-f]{32}$/.test(b.nonce || '')) throw new Error('cscart_handoff_invalid');
  for (const item of b.items) {
    const p = await lookupProduct(item.product_id);
    if (!p?.active || p.currency !== b.currency || p.unit_price_minor !== item.unit_price_minor || p.seller_legal_entity !== b.seller_legal_entity) throw new Error('cscart_product_mismatch');
  }
  const subtotal = b.items.reduce((n, x) => n + x.quantity * x.unit_price_minor, 0);
  if (![b.amount_minor, b.tax_minor, b.shipping_minor].every(x => Number.isSafeInteger(x) && x >= 0) || b.amount_minor !== subtotal + b.tax_minor + b.shipping_minor) throw new Error('cscart_amount_mismatch');
  // Receiver MUST use durable atomic SET NX with expiry; duplicate order_id also
  // needs permanent idempotency, independent of the five-minute session lifetime.
  if (!await claimNonce(`${b.project_id}:${b.nonce}`, b.expires_at)) throw new Error('cscart_replay');
  return b;
}
export function verifyCscartOpenOrder(remote, doc, route) {
  const q = doc.snapshot.offer;
  if (remote.configuration_hash !== doc.snapshot.configurationHash || remote.source_order_id !== doc.id || remote.project_id !== route.project_id || remote.seller_legal_entity !== route.seller_legal_entity ||
      remote.payment_recipient !== route.payment_recipient || remote.payment_id !== 18 || remote.currency !== q.currency || remote.total_minor !== q.totalMinor ||
      canonical(remote.items) !== canonical(route.items) || !/^\d+$/.test(String(remote.order_id))) throw new Error('cscart_order_mismatch');
  return { externalOrderId: String(remote.order_id), status: 'pending' }; // O, P or a redirect are never PSP evidence.
}
export function createCscartMockAdapter(route, secret, transport) {
  return { mode: 'test', currency: route.currency,
    async createSession(doc) {
      const handoff = cscartHandoff(doc, route, secret);
      const remote = await transport.createOpenOrder(handoff);
      const verified = verifyCscartOpenOrder(remote, doc, route);
      const u = new URL(remote.checkout_url);
      if (u.origin !== route.origin || u.username || u.password || u.pathname !== '/index.php' || u.searchParams.get('dispatch') !== 'checkout.checkout') throw new Error('cscart_checkout_url_invalid');
      // Browser receives an opaque handoff capability, never API/merchant secrets.
      return { externalOrderId: verified.externalOrderId, url: u.href };
    },
    async retrieve(id) { return transport.retrieveVerifiedPspOrder(id); },
    authenticate(headers) { return transport.authenticateNotification(headers); },
  };
}
