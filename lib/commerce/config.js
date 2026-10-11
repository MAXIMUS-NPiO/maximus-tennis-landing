/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import { resolveCommerceStore } from './store';
import { gatewaySettings, createMpgsGateway } from './gateway';
import { customerMailer } from './mail';
export function readOrderConfig(env = process.env) {
  const gateway = gatewaySettings(env);
  let publicOrigin = null;
  try {
    const url = new URL(env.PUBLIC_BASE_URL || env.NEXT_PUBLIC_SITE_URL || 'https://maximus.tennis');
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (!url.username && !url.password && (url.protocol === 'https:' || (env.NODE_ENV !== 'production' && local && url.protocol === 'http:'))) publicOrigin = url.origin;
  } catch { /* A malformed runtime address keeps order intake disabled. */ }
  return { projectId: 'tennis', publicOrigin, enabled: env.ORDER_FLOW_ENABLED === 'true' && !!publicOrigin, store: resolveCommerceStore(env), accessSecret: env.ORDER_ACCESS_SECRET,
    gateway: gateway ? createMpgsGateway({ ...gateway, accessSecret: env.ORDER_ACCESS_SECRET }) : null, merchant: gateway?.merchant, mailer: customerMailer(env),
    cronSecret: env.CRON_SECRET?.length >= 16 ? env.CRON_SECRET : null };
}
