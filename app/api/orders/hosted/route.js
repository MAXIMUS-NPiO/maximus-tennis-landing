/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import { readOrderConfig } from '../../../../lib/commerce/config';
import { accountDoc, json, payload } from '../../../../lib/commerce/http';
import { hostedPage } from '../../../../lib/commerce/hosted';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request) {
  const cfg = readOrderConfig();
  if (!cfg.enabled || !cfg.gateway) return json(503, { status: 'payments_disabled' });
  try {
    const doc = await accountDoc(request, cfg, await payload(request));
    if (!doc) return json(401, { status: 'unauthorized' });
    return json(200, { html: hostedPage(doc) });
  } catch { return json(503, { status: 'hosted_unavailable' }); }
}
