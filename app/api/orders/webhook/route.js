/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import { readOrderConfig } from '../../../../lib/commerce/config';
import { orderIdRE } from '../../../../lib/commerce/access';
import { reconcile } from '../../../../lib/commerce/service';
import { json, payload } from '../../../../lib/commerce/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request) {
  const cfg = readOrderConfig();
  if (!cfg.enabled || !cfg.gateway || !cfg.store) return json(503, { status: 'payments_disabled' });
  if (!cfg.gateway.authenticate(request.headers)) return json(401, { status: 'unauthorized' });
  try {
    const p = await payload(request);
    const id = p.order?.id;
    if (!orderIdRE.test(id || '')) return json(400, { status: 'invalid' });
    // Notification is a wake-up only. Amount/status supplied by caller are discarded.
    await reconcile(id, cfg); return json(200, { status: 'verified' });
  } catch { return json(503, { status: 'verification_failed' }); }
}
