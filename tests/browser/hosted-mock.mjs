/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/** Local test fixture only. No external gateway, credentials or customer transport. */
import { randomBytes } from 'node:crypto';
import { reconcile } from '../../lib/commerce/service.js';
const encode = value => JSON.stringify(value).replace(/</g, '\\u003c');
export function createHostedMock({ store, origin, now = Date.now, ttlMs = 60000 }) {
  const sessions = new Map(), inflight = new Map();
  let captureOperations = 0, createdSessions = 0;
  const reply = (http, status, extra = {}) => ({ http, body: { status, ...extra } });
  const gateway = {
    mode: 'test',
    async createSession(doc) {
      const sessionId = `SESSION_MOCK_${randomBytes(16).toString('hex')}`;
      sessions.set(sessionId, { orderId: doc.id, expiresAt: now() + ttlMs, state: 'open' }); createdSessions++;
      return { sessionId, url: `${origin}/mock/hosted?session=${sessionId}` };
    },
    async retrieve(orderId) {
      const doc = await store.get(orderId);
      if (!doc) return { status: 'PENDING' };
      const session = sessions.get(doc.payment.session?.sessionId);
      if (!session || session.orderId !== doc.id || session.state !== 'captured') return { id: doc.id, status: 'PENDING' };
      const q = doc.snapshot.offer, amount = (q.totalMinor / 100).toFixed(2);
      return { result: 'SUCCESS', id: doc.id, merchant: 'TESTmock', currency: q.currency, amount, totalCapturedAmount: amount, totalRefundedAmount: '0', status: 'CAPTURED', transaction: [{ result: 'SUCCESS', response: { gatewayCode: 'APPROVED' }, transaction: { type: 'PAYMENT', id: `MOCK-${doc.id}`, amount, currency: q.currency } }] };
    },
  };
  return {
    gateway,
    stats: () => ({ captureOperations, createdSessions }),
    expire(sessionId) { const s = sessions.get(sessionId); if (s) s.expiresAt = now() - 1; },
    async capture(sessionId) {
      const s = sessions.get(sessionId);
      if (!s) return reply(404, 'unknown_session');
      if (inflight.has(sessionId)) return inflight.get(sessionId);
      const doc = await store.get(s.orderId);
      if (!doc || doc.payment.session?.sessionId !== sessionId) return reply(409, 'session_order_mismatch');
      if (s.state === 'captured' && doc.invoice) return reply(200, 'captured', { duplicate: true });
      if (s.expiresAt <= now()) return reply(410, 'expired');
      if (s.state === 'cancelled') return reply(409, 'cancelled');
      // Claim before any awaited capture work; every repeat joins this same operation.
      if (inflight.has(sessionId)) return inflight.get(sessionId);
      const pending = (async () => {
        captureOperations++; s.state = 'captured';
        await reconcile(s.orderId, { store, gateway, merchant: 'TESTmock' });
        return reply(200, 'captured');
      })();
      inflight.set(sessionId, pending);
      try { return await pending; } finally { inflight.delete(sessionId); }
    },
    cancel(sessionId) {
      const s = sessions.get(sessionId);
      if (!s) return reply(404, 'unknown_session');
      if (inflight.has(sessionId) || s.state === 'captured') return reply(409, 'already_captured');
      if (s.expiresAt <= now()) return reply(410, 'expired');
      s.state = 'cancelled'; return reply(200, 'cancelled');
    },
    bootstrap(doc) {
      const url = `${origin}/mock/hosted?session=${doc.payment.session.sessionId}`;
      // A real hosted checkout navigates to its own document. Do not attach fetch
      // handlers to the inherited initial document.write popup in this mock.
      return `<!doctype html><meta charset="utf-8"><title>LOCAL MOCK redirect</title><script>location.replace(${encode(url)});</script>`;
    },
    html(sessionId) {
      const s = sessions.get(sessionId);
      if (!s || s.expiresAt <= now()) return { http: s ? 410 : 404, html: '<!doctype html><meta charset="utf-8"><p role="status">MOCK expired</p>' };
      return { http: 200, html: `<!doctype html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>LOCAL MOCK CHECKOUT</title></head><body><p>LOCAL MOCK ONLY — no payment</p><button id="capture">MOCK capture</button><button id="cancel">MOCK cancel</button><p id="status" role="status">MOCK open</p><script>
const sessionId=${encode(sessionId)},capture=document.getElementById('capture'),cancel=document.getElementById('cancel'),output=document.getElementById('status');let busy=false;
async function act(action){if(busy)return;busy=true;capture.disabled=true;cancel.disabled=true;try{const r=await fetch('/mock/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId})});const d=await r.json();output.textContent='MOCK '+d.status;}catch{output.textContent='MOCK error';}finally{busy=false;}}
capture.onclick=()=>act('capture');cancel.onclick=()=>act('cancel');
</script></body></html>` };
    },
  };
}
