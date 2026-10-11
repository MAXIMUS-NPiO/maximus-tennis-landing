/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/** Receiving side for LOCAL MOCK INTEGRATION ONLY. No production CS-Cart transport.
 * Registry/secrets/PSP credentials never come from the request. Order creation is
 * permanently keyed by (project_id, source order_id), separate from short nonce TTL.
 */
import crypto from 'node:crypto';
import { canonical, safeEqual } from '../../lib/intake/service';
import { receiveCscartHandoff, verifyCscartOpenOrder } from '../../lib/commerce/cscart';
import { verifiedPayment } from '../../lib/commerce/gateway';
import { orderIdRE } from '../../lib/commerce/access';
const hash = x => crypto.createHash('sha256').update(canonical(x)).digest('hex');
const signature = (x, secret) => crypto.createHmac('sha256', secret).update(canonical(x)).digest('hex');
const key = b => `${b.project_id}:${b.order_id}`;
function sourceDoc(b) { return { id: b.order_id, snapshot: { projectId: b.project_id, plan: 'A', configurationHash: b.configuration_hash, offer: { currency: b.currency, totalMinor: b.amount_minor } } }; }
export function localCscartReceiver({ mode, registry, store, transport, lookupProduct, psp, clock = Date.now }) {
  if (mode !== 'local-test' || transport?.mode !== 'local-mock' || psp?.mode !== 'local-mock') throw new Error('receiver_live_refused');
  function project(id) {
    if (!/^[a-z][a-z0-9_-]{0,63}$/.test(id || '') || !Object.hasOwn(registry, id)) throw new Error('receiver_project_invalid');
    const p = registry[id];
    if (!p.secret || p.secret.length < 32 || !p.merchant?.startsWith('TEST')) throw new Error('receiver_project_unconfigured');
    return p;
  }
  return {
    async handoff(session) {
      const b = session?.body, p = project(b?.project_id);
      if (!b || !Object.hasOwn(p.routes, b.configuration_hash || '')) throw new Error('receiver_route_unknown');
      const route = p.routes[b.configuration_hash];
      if (route.project_id !== b.project_id) throw new Error('receiver_project_mismatch');
      // Validate all fields/current product prices before touching durable replay state.
      await receiveCscartHandoff(session, route, p.secret, { now: clock(), lookupProduct: id => lookupProduct(b.project_id, id), claimNonce: async () => true });
      const fingerprint = hash(Object.fromEntries(Object.entries(b).filter(([k]) => !['nonce','issued_at','expires_at'].includes(k))));
      const claimed = await store.transaction(state => {
        for (const [nonce, expires] of Object.entries(state.nonces)) if (expires <= clock()) delete state.nonces[nonce];
        const old = state.orders[key(b)];
        if (old && old.fingerprint !== fingerprint) throw new Error('receiver_order_conflict');
        const nonce = `${b.project_id}:${b.nonce}`;
        if (state.nonces[nonce]) throw new Error('receiver_replay');
        state.nonces[nonce] = b.expires_at;
        if (old) return { created: false, record: structuredClone(old) };
        const record = { fingerprint, body: b, status: 'creating', createdAt: clock(), events: [{ type: 'handoff_accepted', at: clock() }] };
        state.orders[key(b)] = record;
        return { created: true, record: structuredClone(record) };
      });
      if (!claimed.created) {
        if (claimed.record.status !== 'open') throw new Error('receiver_review_required');
        return claimed.record.remote;
      }
      try {
        // Real transport would need a DB-unique source-order mapping in the same
        // transaction as native CS-Cart creation. It is intentionally absent here.
        const remote = await transport.createOpenOrder(b, { idempotencyKey: key(b) });
        verifyCscartOpenOrder(remote, sourceDoc(b), route);
        if (!/^[A-Za-z0-9_-]{1,80}$/.test(remote.psp_order_id || '')) throw new Error('receiver_psp_mapping_missing');
        await store.transaction(state => {
          if (Object.entries(state.orders).some(([k, r]) => k !== key(b) && r.remote && (r.pspOrderId === remote.psp_order_id || String(r.remote.order_id) === String(remote.order_id)))) throw new Error('receiver_duplicate_mapping');
          const r = state.orders[key(b)]; r.status = 'open'; r.remote = remote; r.pspOrderId = remote.psp_order_id; r.events.push({ type: 'open_order_created', at: clock() }); });
        return remote;
      } catch {
        await store.transaction(state => { const r = state.orders[key(b)]; r.status = 'review_required'; r.events.push({ type: 'creation_uncertain', at: clock() }); });
        throw new Error('receiver_review_required');
      }
    },
    async status(query, suppliedSignature) {
      const p = project(query?.project_id), now = clock();
      if (!orderIdRE.test(query?.order_id || '') || !Number.isSafeInteger(query.issued_at) || Math.abs(now - query.issued_at) > 300000 || !safeEqual(suppliedSignature || '', signature(query, p.secret))) throw new Error('receiver_status_unauthorized');
      const record = await store.transaction(state => structuredClone(state.orders[key(query)] || null));
      if (!record || !record.remote || record.status !== 'open' || typeof record.pspOrderId !== 'string') throw new Error('receiver_order_unavailable');
      // Native O or P is not payment proof. Only the server PSP adapter is queried.
      const raw = await psp.retrieve(record.pspOrderId);
      if (raw.id !== record.pspOrderId) throw new Error('receiver_psp_order_mismatch');
      const normalized = { ...raw, id: query.order_id };
      verifiedPayment(normalized, sourceDoc(record.body), p.merchant);
      return normalized;
    },
  };
}
export function signReceiverStatus(query, secret) { return signature(query, secret); }
