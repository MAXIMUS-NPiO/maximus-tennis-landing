/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/** Reusable MAXIMUS VEGAS server-to-server contract draft. No network/payment routing.
 * Registry is deployed on the service, never supplied by a browser. Future service: one VEGAS legal entity, recipient and merchant across owned
 * projects. project_id is accounting/status routing, never a sub-merchant.
 */
import crypto from 'node:crypto';
import { orderIdRE } from './access';
import { canonical, safeEqual } from '../intake/service';
const sign = (body, secret) => crypto.createHmac('sha256', secret).update(canonical(body)).digest('hex');
export function buildVegasSession(order, project, secret, now = Date.now()) {
  if (project?.project_id !== order.snapshot.projectId || !project?.approved || !secret || secret.length < 32 || order.snapshot.plan !== 'A' || !order.snapshot.offer || !project.pspAgreementReference) throw new Error('vegas_route_unapproved');
  const q = order.snapshot.offer;
  if (q.seller.legalName !== project.seller_legal_entity || !project.currencies.includes(q.currency) || !project.payment_recipient) throw new Error('vegas_recipient_mismatch');
  const returnUrl = project.return_urls.find(u => u === `${project.origin}/${order.snapshot.locale}/orders`);
  if (!returnUrl || !returnUrl.startsWith('https://') || !project.notification_url?.startsWith('https://')) throw new Error('vegas_url_unapproved');
  const body = { schema: 1, project_id: project.project_id, order_id: order.id, seller_legal_entity: project.seller_legal_entity,
    payment_recipient: project.payment_recipient, amount_minor: q.totalMinor, currency: q.currency,
    snapshot_hash: crypto.createHash('sha256').update(canonical(order.snapshot)).digest('hex'),
    return_url: returnUrl, notification_url: project.notification_url, issued_at: now, expires_at: now + 300000,
    nonce: crypto.randomBytes(16).toString('hex'), mode: 'disabled' };
  return { body, signature: sign(body, secret) };
}
export function verifyVegasSession(session, registry, secret, now = Date.now(), serviceIdentity) {
  const b = session?.body, p = registry?.[b?.project_id];
  // All owned projects share ONE VEGAS seller/recipient/merchant. Reject mixed registries.
  if (!serviceIdentity?.seller_legal_entity || !serviceIdentity.payment_recipient || !serviceIdentity.merchant_account ||
      Object.values(registry || {}).some(x => x.seller_legal_entity !== serviceIdentity.seller_legal_entity || x.payment_recipient !== serviceIdentity.payment_recipient || x.merchant_account !== serviceIdentity.merchant_account)) throw new Error('vegas_single_entity_required');
  if (!b || !p?.approved || !p.pspAgreementReference || !secret || secret.length < 32 ||
      !safeEqual(session.signature || '', sign(b, secret)) || !Number.isSafeInteger(b.issued_at) || !Number.isSafeInteger(b.expires_at) ||
      b.issued_at > now + 30000 || b.expires_at <= b.issued_at || !orderIdRE.test(b.order_id || '') || !/^[0-9a-f]{32}$/.test(b.nonce || '') || b.expires_at <= now || b.expires_at - b.issued_at > 300000 ||
      b.seller_legal_entity !== p.seller_legal_entity || b.payment_recipient !== p.payment_recipient ||
      !p.currencies.includes(b.currency) || !Number.isSafeInteger(b.amount_minor) || b.amount_minor <= 0 ||
      !p.return_urls.includes(b.return_url) || b.notification_url !== p.notification_url || b.mode !== 'disabled') throw new Error('vegas_session_invalid');
  return b;
}
// Before any future dispatch: durable nonce claim, project-specific key, PSP capture
// reconciliation and signed callbacks with event_id + original order/snapshot hash.
