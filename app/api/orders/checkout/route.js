/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import { readOrderConfig } from '../../../../lib/commerce/config';
import { checkout } from '../../../../lib/commerce/service';
import { accountDoc, json, payload } from '../../../../lib/commerce/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request) {
  const cfg = readOrderConfig();
  if (!cfg.enabled) return json(503, { status: 'order_flow_disabled' });
  try {
    const p = await payload(request), doc = await accountDoc(request, cfg, p);
    if (!doc) return json(401, { status: 'unauthorized' });
    const r = await checkout(doc, { ...cfg, termsVersion: p.termsVersion }); return json(r.http, r.body);
  } catch { return json(503, { status: 'unavailable' }); }
}
