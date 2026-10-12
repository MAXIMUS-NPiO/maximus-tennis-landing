/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import { handleNativeCheckoutLinkRequest } from "../../../../../../lib/platform/native-checkout-link-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(request, { params }) {
  return handleNativeCheckoutLinkRequest(request, (await params).orderId);
}
