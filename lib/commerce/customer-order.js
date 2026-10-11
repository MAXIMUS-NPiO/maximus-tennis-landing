/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/** Connect public order intake to verified accounts without trusting form identity claims. */
import { acceptOrder } from './service';
import { getPortalOrderContext, linkAcceptedOrderToCustomer } from '../platform/portal';
import { forbidden } from '../platform/errors';

export async function acceptCustomerOrder(request, input, config, {
  getCustomerContext = getPortalOrderContext,
  linkCustomerOrder = linkAcceptedOrderToCustomer,
  accept = acceptOrder,
} = {}) {
  const origin = config.publicOrigin || 'https://maximus.tennis';
  if (new URL(request.url).origin !== origin || request.headers.get('origin') !== origin || request.headers.get('sec-fetch-site') === 'cross-site') throw forbidden('origin_invalid');
  const customerContext = await getCustomerContext(request);
  const result = await accept(input, { ...config, customerContext });
  if (![200, 201].includes(result.http) || result.body.status !== 'accepted' || !customerContext) return result;
  let linked = false;
  try {
    const link = await linkCustomerOrder(request, { orderId: result.body.request_id, accessToken: result.body.access_token });
    linked = link?.linked === true && link.orderId === result.body.request_id;
  } catch {
    // The order is already durable and bound to this user. Its private capability can
    // retry the separate account-store transaction without creating a second order.
  }
  return { ...result, body: { ...result.body, account_link: linked ? 'linked' : 'pending' } };
}
