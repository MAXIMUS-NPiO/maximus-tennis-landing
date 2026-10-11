/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import crypto from 'node:crypto';
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const js = s => JSON.stringify(s).replace(/</g, '\\u003c');
export function hostedPage(doc) {
  const session = doc.payment.session;
  if (doc.payment.status !== 'pending' || !/^SESSION[A-Za-z0-9_-]{10,}$/.test(session?.sessionId || '') ||
      !['https://test-gateway.mastercard.com','https://ap-gateway.mastercard.com'].includes(session.gatewayOrigin)) throw new Error('hosted_unavailable');
  const nonce = crypto.randomBytes(24).toString('base64');
  return `<!doctype html><html lang="${esc(doc.snapshot.locale)}"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta name="robots" content="noindex,nofollow"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}' ${session.gatewayOrigin}; connect-src ${session.gatewayOrigin}; frame-src ${session.gatewayOrigin}; img-src ${session.gatewayOrigin} data:; base-uri 'none'"><title>MAXIMUS TEST</title></head><body><p>TEST · ${esc(doc.id)}</p><p>${esc(doc.snapshot.offer.currency)} ${(doc.snapshot.offer.totalMinor/100).toFixed(2)}</p><button id="pay">TEST</button><p id="error" role="alert"></p><script nonce="${nonce}">function failed(){document.getElementById('error').textContent='TEST unavailable';document.getElementById('pay').disabled=true;}</script><script nonce="${nonce}" src="${session.gatewayOrigin}/static/checkout/checkout.min.js" data-error="failed"></script><script nonce="${nonce}">try{Checkout.configure({session:{id:${js(session.sessionId)}}});document.getElementById('pay').onclick=function(){this.disabled=true;try{Checkout.showPaymentPage();}catch(e){failed();}};}catch(e){failed();}</script></body></html>`;
}
