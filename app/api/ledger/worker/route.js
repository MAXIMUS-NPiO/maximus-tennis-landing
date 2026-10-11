/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import { handleLedgerWorkerRequest } from "../../../../lib/platform/ledger-worker";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const GET = request => handleLedgerWorkerRequest(request, "retry");
