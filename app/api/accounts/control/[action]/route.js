/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import { handleTennisControlRequest } from '../../../../../lib/commerce/tennis-control-http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
/** Owner payment control: prepare | initiate | status | current | readiness (verified session + CSRF). */
export async function POST(request, { params }) {
  const { action } = await params;
  return handleTennisControlRequest(request, action);
}
