/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import { after } from 'next/server';
import { handlePortalRequest, retryForumOutbox } from '../platform/portal';
export async function handleForum(request, action, params) {
  const result = await handlePortalRequest(request, action, params);
  if (request.method === 'POST' && result.ok) after(async () => {
    try { await retryForumOutbox({ deliverNow: true }); } catch { /* Pending durable outbox is retried by the existing protected cron. */ }
  });
  return result;
}
