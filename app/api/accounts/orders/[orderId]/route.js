/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import { handlePortalRequest } from "../../../../../lib/platform/portal";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request, { params }) {
  const { orderId } = await params;
  return handlePortalRequest(request, "order-detail", { orderId });
}
