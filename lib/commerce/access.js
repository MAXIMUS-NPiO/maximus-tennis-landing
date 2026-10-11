/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import crypto from 'node:crypto';
import { safeEqual } from '../intake/service';
export const orderIdRE = /^MX-ORD-[0-9a-f]{32}$/;
export function accessToken(doc, secret) {
  if (!secret || secret.length < 32) throw new Error('access_not_configured');
  const expires = Date.parse(doc.snapshot.createdAt) + 7 * 86400000;
  return `${expires}.${crypto.createHmac('sha256', secret).update(`${doc.snapshot.projectId}.${doc.id}.${doc.accessVersion || 0}.${expires}`).digest('hex')}`;
}
export function hasAccess(doc, token, secret, now = Date.now(), expectedProject = 'tennis') {
  return doc?.snapshot?.projectId === expectedProject && !!doc && typeof token === 'string' && /^[0-9]{13}\.[0-9a-f]{64}$/.test(token) && Number(token.split('.')[0]) > now && !!secret && secret.length >= 32 && safeEqual(token, accessToken(doc, secret));
}
