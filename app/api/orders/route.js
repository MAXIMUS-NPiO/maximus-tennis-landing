/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import { readOrderConfig } from '../../../lib/commerce/config';
import { readConfig } from '../../../lib/intake/config';
import { clientIp, ipBucket } from '../../../lib/intake/service';
import { acceptCustomerOrder } from '../../../lib/commerce/customer-order';
import { ApiError } from '../../../lib/platform/errors';
import { json, payload } from '../../../lib/commerce/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request) {
  const cfg = readOrderConfig();
  if (!cfg.enabled) return json(503, { status: 'order_flow_disabled' });
  try {
    const p = await payload(request), intake = readConfig();
    if (!intake.store || await intake.store.rateLimit(ipBucket(intake, clientIp(request.headers), 'order', 600), 600) > 10) return json(intake.store ? 429 : 503, { status: 'unavailable' });
    const r = await acceptCustomerOrder(request, p, cfg); return json(r.http, r.body);
  } catch (error) {
    if (error instanceof ApiError) return json(error.status, { status: error.code, code: error.code });
    return json(503, { status: 'unavailable' });
  }
}
