/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import { readOrderConfig } from '../../../../lib/commerce/config';
import { safeEqual } from '../../../../lib/intake/service';
import { reconcile } from '../../../../lib/commerce/service';
import { deliverCustomer, markCustomerMailDisabled } from '../../../../lib/commerce/mail';
import { json } from '../../../../lib/commerce/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export async function GET(request) {
  const cfg = readOrderConfig();
  if (!cfg.enabled || !cfg.store || !cfg.cronSecret) return json(503, { status: 'not_configured' });
  if (!safeEqual(request.headers.get('authorization') || '', `Bearer ${cfg.cronSecret}`)) return json(401, { status: 'unauthorized' });
  let processed = 0, failed = 0;
  try {
    for (const id of await cfg.store.due(Date.now(), 4)) {
      try {
        const doc = await cfg.store.get(id);
        if (cfg.gateway && doc.payment.status === 'pending') await reconcile(id, cfg);
        if (cfg.mailer) for (const kind of Object.keys(doc.mail)) await deliverCustomer(cfg.store, cfg.mailer, id, kind);
        else await markCustomerMailDisabled(cfg.store, id);
        processed++;
      } catch { failed++; }
    }
    return json(200, { processed, failed });
  } catch { return json(503, { status: 'unavailable' }); }
}
