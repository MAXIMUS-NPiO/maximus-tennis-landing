/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import { after } from 'next/server';
import { handleTennisControlWebhook } from '../../../../lib/commerce/tennis-control-webhook';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
/** MPGS webhook (X-Notification-Secret). Acknowledged at once; verification runs after the response. */
export const POST = request => handleTennisControlWebhook(request, { schedule: task => after(task) });
