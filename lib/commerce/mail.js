/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/** Independent customer outbox; test SMTP only, never the staff notifier/Telegram.
 * Leases use CAS owner tokens. SMTP is at-least-once; stable Message-ID assists deduplication.
 */
import crypto from 'node:crypto';
import { update } from './store';
import { nextAttemptAt } from '../intake/notify';
export function customerMailer(env = process.env, { transportFactory } = {}) {
  // Only a loopback SMTP sink is allowed in this release. Live customer email cannot be enabled.
  if (env.ORDER_CUSTOMER_MAIL_MODE !== 'test' || env.NODE_ENV === 'production' ||
      !['127.0.0.1', 'localhost'].includes(env.ORDER_SMTP_HOST) || !/^\d{1,5}$/.test(env.ORDER_SMTP_PORT || '')) return null;
  let transport;
  return { async send({ to, subject, text, messageId }) {
    if (!transport) transport = transportFactory ? transportFactory() : (await import('nodemailer')).default.createTransport({ host: env.ORDER_SMTP_HOST, port: Number(env.ORDER_SMTP_PORT), secure: false, ignoreTLS: true, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000 });
    const result = await transport.sendMail({ from: 'MAXIMUS test <no-reply@example.invalid>', to, subject, text, messageId });
    if (result.rejected?.length || !result.accepted?.length) throw new Error('customer_smtp_rejected');
    return result;
  } };
}
export function messageFor(doc, kind) {
  const title = doc.snapshot.locale === 'ru' ? 'Заявка принята' : doc.snapshot.locale === 'zh' ? '申请已收到' : 'Request received';
  const subject = kind === 'invoice' ? `[MAXIMUS TEST] ${doc.invoice.number}` : `[MAXIMUS] ${title}: ${doc.id}`;
  const text = kind === 'invoice' ? `TEST ONLY — not a tax invoice.\n${JSON.stringify(doc.invoice, null, 2)}` :
    `${title}: ${doc.id}\n${doc.snapshot.createdAt}\n${JSON.stringify(doc.snapshot.configuration, null, 2)}\nRequest only; payment and financing are not accepted.\n`;
  return { to: doc.snapshot.contact.email, subject, text, messageId: `<${doc.id}.${kind}@maximus.tennis>` };
}
export async function deliverCustomer(store, mailer, id, kind, now = Date.now()) {
  if (!mailer) return { status: 'disabled' };
  const owner = crypto.randomUUID();
  let claimed = false;
  const doc = await update(store, id, d => {
    const j = d.mail[kind];
    if (!j || j.status === 'sent' || j.status === 'failed' || j.status === 'held' || j.nextAt > now || (j.leaseUntil && j.leaseUntil > now) ||
        (kind === 'invoice' && (!d.invoice || d.payment.status !== 'paid'))) return null;
    j.status = 'sending'; j.owner = owner; j.leaseUntil = now + 60000; claimed = true; return d;
  });
  if (!claimed || doc.mail[kind].owner !== owner) return { status: 'busy_or_done' };
  let ok = false;
  try { await mailer.send(messageFor(doc, kind)); ok = true; } catch { /* no PII or provider errors logged */ }
  const saved = await update(store, id, d => {
    const j = d.mail[kind]; if (j.owner !== owner) return null;
    j.attempts++; j.leaseUntil = 0;
    const next = nextAttemptAt(j.attempts, now);
    j.status = ok ? 'sent' : next ? 'retry' : 'failed'; j.nextAt = next || 0;
    j.history.push({ at: now, type: ok ? 'sent' : 'failed', attempt: j.attempts }); return d;
  });
  return { status: saved.mail[kind].status };
}

export async function markCustomerMailDisabled(store, id, now = Date.now()) {
  return update(store, id, d => {
    for (const j of Object.values(d.mail)) {
      if (['pending','retry'].includes(j.status)) { j.status = 'disabled'; j.history.push({ at: now, type: 'delivery_disabled' }); }
    }
    return d;
  });
}
