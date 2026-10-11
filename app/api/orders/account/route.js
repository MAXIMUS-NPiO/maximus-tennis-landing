/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import { readOrderConfig } from '../../../../lib/commerce/config';
import { handleAccount } from '../../../../lib/commerce/account-handler';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function POST(request) { return handleAccount(request, readOrderConfig()); }
