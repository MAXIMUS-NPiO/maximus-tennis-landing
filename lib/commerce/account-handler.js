/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/** Framework-independent route handler used by the actual account route and security tests. */
import { publicOrder, retryMail } from './service';
import { accountDoc, json, payload } from './http';
export async function handleAccount(request, cfg) {
  if (!cfg.enabled) return json(503, { status: 'order_flow_disabled' });
  try {
    const p = await payload(request), doc = await accountDoc(request, cfg, p);
    if (!doc) return json(401, { status: 'unauthorized' });
    if (p.retryMail && !cfg.mailer) return json(503, { status: 'customer_mail_disabled' });
    const current = p.retryMail ? await retryMail(cfg.store, doc.id, p.retryMail, Date.now(), p.retryKey) : doc;
    return json(200, { order: publicOrder(current) });
  } catch { return json(503, { status: 'unavailable' }); }
}
