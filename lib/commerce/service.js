/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import crypto from 'node:crypto';
import { validateRequest, IDEMPOTENCY_RE } from '../intake/schema';
import { canonical } from '../intake/service';
import { site } from '../../data/site';
import { productDataVersion } from '../../data/products';
import { commercialVersion, findOffer, financingExamples } from './catalog';
import { technicalSnapshot } from './technical';
import { formalQuotation } from './quotation';
import { accessToken, hasAccess, orderIdRE } from './access';
import { contributionSnapshot } from './accounts';
import { update } from './store';
import { verifiedPayment } from './gateway';
export const hash = s => crypto.createHash('sha256').update(s).digest('hex');
const answer = (http, body) => ({ http, body });
export const job = now => ({ status: 'pending', attempts: 0, nextAt: now, history: [] });
export async function acceptOrder(p, { store, accessSecret, offers, now = Date.now(), projectId = 'tennis', customerContext = null }) {
  if (!store || !accessSecret || accessSecret.length < 32) return answer(503, { status: 'unavailable' });
  // The verified server session supplies this context, never the form's contact fields.
  if (customerContext && (customerContext.organizationId !== 'maximus-tennis' || customerContext.emailVerified !== true || !/^usr_[0-9A-HJKMNP-TV-Z]{20}$/.test(customerContext.userId || ''))) return answer(403, { status: 'customer_context_invalid' });
  const customerUserId = customerContext?.userId || null;
  if (!p || p.purpose !== 'config' || !IDEMPOTENCY_RE.test(p.idempotencyKey || '') || p.hp || !Number.isFinite(p.elapsedMs) || p.elapsedMs < 1500 || !['A', 'B', 'C'].includes(p.plan)) return answer(400, { status: 'invalid', errors: { form: 'invalid' } });
  const v = validateRequest(p);
  if (!v.ok) return answer(400, { status: 'invalid', errors: v.errors });
  const locale = site.locales.includes(p.locale) ? p.locale : site.defaultLocale;
  if (!/^[a-z][a-z0-9_-]{0,63}$/.test(projectId)) throw new Error('invalid_server_project');
  const configurationHash = hash(canonical(v.value.config));
  const offer = p.plan === 'A' ? findOffer(configurationHash, offers, now) : null;
  const technical = technicalSnapshot(v.value.config, p.technical, offer);
  if (!technical.ok) return answer(400, { status: 'invalid', errors: technical.errors });
  if (!['bank_wire','payment_link'].includes(p.paymentPreference)) return answer(400, { status: 'invalid', errors: { paymentPreference: 'required' } });
  const inputHash = hash(canonical({ ...v.value, locale, plan: p.plan, projectId, customerUserId, technical: { measurement_basis: technical.value.measurement_basis, balance: { choice: p.technical.balance.choice, requested: technical.value.balance.requested_balance, accepted_proposed: p.technical.balance.accepted_proposed || null, customer_confirmed: true }, frame_stiffness: { choice: p.technical.frame_stiffness.choice, requested: technical.value.frame_stiffness.requested_ra, accepted_proposed: p.technical.frame_stiffness.accepted_proposed || null, customer_confirmed: true } }, paymentPreference: p.paymentPreference }));
  const id = `MX-ORD-${crypto.randomBytes(16).toString('hex')}`;
  const snapshot = { schema: 1, projectId, customerUserId, createdAt: new Date(now).toISOString(), locale, contact: v.value.contact,
    technical: technical.value, paymentPreference: p.paymentPreference, configuration: v.value.config, configurationHash, productDataVersion, commercialVersion, plan: p.plan,
    accountTerms: p.plan === 'A' ? null : contributionSnapshot({ principalMinor: 600000, currency: 'EUR', years: 1, mode: p.plan === 'B' ? 'postpaid' : 'prepaid', startDate: new Date(now).toISOString().slice(0, 10) }),
    offer, financing: p.plan === 'A' ? null : financingExamples[p.plan],
    fulfillment: { verified: !!offer && offer.fulfillableCountries.includes(v.value.contact.country), country: v.value.contact.country },
    terms: { version: offer?.termsVersion || 'request-only-2026-10-09', text: offer?.termsText || null, accepted: false },
    consent: { answerRequest: true, version: '2026-09-21' }, inputHash };
  snapshot.quotation = formalQuotation(snapshot, id);
  const doc = { id, snapshot, payment: { status: p.plan !== 'A' ? 'blocked' : offer ? (snapshot.quotation ? 'ready' : 'awaiting_technical_confirmation') : 'awaiting_quote' },
    invoice: null, mail: { confirmation: job(now) }, events: [{ at: now, type: 'accepted' }] };
  const r = await store.create(hash(`${projectId}|${customerUserId ? `${customerUserId}|` : ''}${p.idempotencyKey}`), doc);
  const saved = await store.get(r.id);
  if (!saved || saved.snapshot.inputHash !== inputHash) return answer(409, { status: 'idempotency_conflict' });
  return answer(r.created ? 201 : 200, { status: 'accepted', request_id: saved.id, duplicate: !r.created,
    order: publicOrder(saved), access_token: accessToken(saved, accessSecret) });
}
export function publicOrder(doc) {
  // Old contribution calculations are internal draft proposals. Customer balances
  // come exclusively from the verified immutable ledger, never from an unpaid order.
  const { accountTerms, financing, ...snapshot } = doc.snapshot;
  return { id: doc.id, snapshot, payment: { status: doc.payment.status }, invoice: doc.invoice,
    events: doc.events, accounts: null, mail: Object.fromEntries(Object.entries(doc.mail).map(([k, v]) => [k, { status: v.status, attempts: v.attempts, history: v.history }])) };
}
export async function authorized(store, id, token, secret, now = Date.now(), expectedProject = 'tennis') {
  if (!store || !orderIdRE.test(id || '')) return null;
  const doc = await store.get(id);
  return hasAccess(doc, token, secret, now, expectedProject) ? doc : null;
}
export async function checkout(doc, { store, gateway, termsVersion, now = Date.now(), projectId = 'tennis' }) {
  if (doc.snapshot.projectId !== projectId) return answer(403, { status: 'project_mismatch' });
  if (!gateway || gateway.mode !== 'test') return answer(503, { status: 'payments_disabled' });
  if (doc.snapshot.plan !== 'A') return answer(403, { status: 'financing_blocked' });
  if (doc.snapshot.paymentPreference === 'bank_wire') return answer(409, { status: 'wire_verification_unavailable' });
  if (!doc.snapshot.technical.final || !doc.snapshot.quotation) return answer(409, { status: 'technical_or_quotation_required' });
  const offer = doc.snapshot.offer;
  if (!doc.snapshot.fulfillment.verified) return answer(409, { status: 'fulfillment_review_required' });
  if (!offer || Date.parse(offer.expiresAt) <= now || termsVersion !== offer.termsVersion) return answer(409, { status: 'quote_or_terms_required' });
  let claimed = false;
  const owner = crypto.randomUUID();
  const d = await update(store, doc.id, d => {
    if (d.payment.status === 'pending' && d.payment.session) return null;
    // Never automatically retry an uncertain session creation: reconcile first.
    if (d.payment.status !== 'ready') return null;
    claimed = true;
    d.payment = { status: 'creating', owner, termsVersion, termsAcceptedAt: now };
    d.events.push({ at: now, type: 'checkout_requested', termsVersion }); return d;
  });
  if (d.payment.status === 'pending' && d.payment.session) return answer(200, { status: 'pending', checkout_url: d.payment.session.url });
  if (!claimed || d.payment.owner !== owner) return answer(409, { status: d.payment.status });
  try {
    const session = await gateway.createSession(d);
    await update(store, d.id, current => {
      if (current.payment.owner !== owner || current.payment.status !== 'creating') return null;
      current.payment = { ...current.payment, status: 'pending', session, nextReconcileAt: now + 60000 };
      current.events.push({ at: now, type: 'session_created' }); return current;
    });
    return answer(200, { status: 'pending', checkout_url: session.url });
  } catch {
    await update(store, d.id, current => { if (current.payment.owner !== owner || current.payment.status !== 'creating') return null;
      current.payment.status = 'review_required'; current.events.push({ at: now, type: 'checkout_uncertain' }); return current; });
    return answer(503, { status: 'review_required' });
  }
}
export async function reconcile(id, { store, gateway, merchant, now = Date.now(), projectId = 'tennis' }) {
  const doc = await store.get(id);
  if (!doc || doc.snapshot.projectId !== projectId || doc.snapshot.plan !== 'A' || !doc.snapshot.technical?.final || !doc.snapshot.quotation || doc.snapshot.paymentPreference !== 'payment_link' || !doc.snapshot.offer || !['creating', 'pending', 'review_required', 'paid', 'refunded'].includes(doc.payment.status)) throw new Error('order_not_payable');
  const evidence = verifiedPayment(await gateway.retrieve(id), doc, merchant);
  return update(store, id, d => {
    if (d.payment.status === 'refunded') return null;
    if (d.payment.status === 'paid' && !['refunded', 'review_required'].includes(evidence.status)) return null;
    if (d.payment.status === evidence.status && evidence.status !== 'pending') return null;
    d.payment.status = evidence.status;
    d.payment.nextReconcileAt = now + 300000;
    if (evidence.status !== 'pending') d.events.push({ at: now, type: `payment_${evidence.status}`, verifiedBy: 'mpgs_retrieve_order' });
    if (['refunded', 'review_required'].includes(evidence.status) && d.mail.invoice) { d.mail.invoice.status = 'held'; d.mail.invoice.history.push({ at: now, type: 'payment_review_hold' }); }
    if (evidence.status === 'paid' && d.invoice && d.mail.invoice?.status === 'held') { d.mail.invoice.status = 'pending'; d.mail.invoice.nextAt = now; }
    if (evidence.status === 'paid' && !d.invoice) {
      d.invoice = { number: `TEST-INV-${d.id.slice(7)}`, status: 'paid', test: true, issuedAt: new Date(now).toISOString(),
        orderId: d.id, projectId: d.snapshot.projectId, technical: d.snapshot.technical, seller: d.snapshot.offer.seller, buyer: d.snapshot.contact, currency: d.snapshot.offer.currency,
        totalMinor: d.snapshot.offer.totalMinor, productMinor: d.snapshot.offer.productMinor, taxMinor: d.snapshot.offer.taxMinor,
        shippingMinor: d.snapshot.offer.shippingMinor, configuration: d.snapshot.configuration, termsVersion: d.snapshot.offer.termsVersion,
        transactionId: evidence.transactionId, verifiedBy: 'mpgs_retrieve_order' };
      d.mail.invoice = job(now);
    }
    return d;
  });
}
export async function retryMail(store, id, kind, now = Date.now(), retryKey) {
  if (!IDEMPOTENCY_RE.test(retryKey || "")) throw new Error("invalid_retry_key");
  if (!['confirmation', 'invoice'].includes(kind)) throw new Error('invalid_mail');
  return update(store, id, d => {
    const j = d.mail[kind];
    if (!j || (kind === 'invoice' && (!d.invoice || d.payment.status !== 'paid')) || (j.retryKeys || []).includes(retryKey) || (j.leaseUntil && j.leaseUntil > now)) return null;
    j.retryKeys = [...(j.retryKeys || []), retryKey].slice(-100);
    j.status = 'pending'; j.nextAt = now; j.leaseUntil = 0;
    j.history.push({ at: now, type: 'manual_retry' }); return d;
  });
}
