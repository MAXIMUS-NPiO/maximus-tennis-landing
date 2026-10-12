/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import { handleTennisCheckoutRequest } from '../../../../../../lib/commerce/tennis-checkout-http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export async function POST(request, { params }) {
  const { orderId } = await params;
  return handleTennisCheckoutRequest(request, orderId);
}
