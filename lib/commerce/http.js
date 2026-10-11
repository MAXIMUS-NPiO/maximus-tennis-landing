/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import { authorized } from './service';
export const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer' } });
export async function payload(request) {
  if (!(request.headers.get('content-type') || '').startsWith('application/json')) throw new Error('invalid_content_type');
  if (Number(request.headers.get('content-length') || 0) > 32768) throw new Error('body_too_large');
  const text = await request.text();
  if (Buffer.byteLength(text) > 32768) throw new Error('body_too_large');
  return JSON.parse(text);
}
export async function accountDoc(request, cfg, body) {
  const auth = request.headers.get('authorization') || '';
  return authorized(cfg.store, body.orderId, auth.startsWith('Bearer ') ? auth.slice(7) : '', cfg.accessSecret, Date.now(), cfg.projectId || 'tennis');
}
