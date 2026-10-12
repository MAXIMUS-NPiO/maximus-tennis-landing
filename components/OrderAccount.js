/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
"use client";
import { useEffect, useRef, useState } from 'react';
import { commerceLabels } from '../content/commerce';
import { accountLabels } from '../content/account';
import { tennisCheckoutLabels } from '../content/tennis-checkout';
import { readTennisCheckoutFragment, tennisCheckoutHref, tennisPurchaseReview } from '../lib/client/tennis-checkout';
import { formatCents } from '../lib/platform/money';
export default function OrderAccount({ dict, locale, initial, orderId = null, allowCheckout = true }) {
  const [credentials, setCredentials] = useState(initial?.accessToken ? { id: initial.requestId, token: initial.accessToken } : null);
  const [order, setOrder] = useState(initial?.order || null);
  const [accountLink, setAccountLink] = useState(initial?.accountLink || null);
  const [error, setError] = useState('');
  const busy = useRef(false);
  const T = commerceLabels[locale];
  const A = accountLabels[locale];
  const P = tennisCheckoutLabels[locale];
  const purchase = tennisPurchaseReview(order?.snapshot);
  useEffect(() => {
    if (initial || orderId) return;
    const target = readTennisCheckoutFragment(window.location.hash);
    // Capability never enters query/access logs, browser storage or analytics.
    if (target?.accessToken) setCredentials({ id: target.orderId, token: target.accessToken });
    if (window.location.hash) window.history.replaceState(window.history.state, '', window.location.pathname);
  }, [initial, orderId]);
  const call = async (path, body = {}) => {
    const r = await fetch(`/api/orders/${path}`, { method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${credentials.token}` }, body: JSON.stringify({ orderId: credentials.id, ...body }) });
    const data = await r.json();
    if (!r.ok) throw new Error('unavailable');
    return data;
  };
  const refresh = async (extra = {}) => {
    if ((!credentials && !orderId) || busy.current) return;
    busy.current = true;
    try {
      let d;
      if (credentials) d = await call('account', extra);
      else {
        const response = await fetch(`/api/accounts/orders/${encodeURIComponent(orderId)}`, { credentials: 'same-origin', cache: 'no-store' });
        if (!response.ok) throw new Error('unavailable');
        d = await response.json();
      }
      setOrder(d.order); setError('');
    } catch { setError(dict.form.errors.invalid); } finally { busy.current = false; }
  };
  useEffect(() => { if (credentials || orderId) refresh(); }, [credentials, orderId]); // eslint-disable-line react-hooks/exhaustive-deps
  const linkAccount = async () => {
    if (!credentials || busy.current) return;
    busy.current = true;
    try {
      const session = await fetch('/api/accounts/session', { credentials: 'same-origin', cache: 'no-store' });
      if (!session.ok) throw new Error('unavailable');
      const account = await session.json();
      const linked = await fetch('/api/accounts/orders/link', { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': account.csrfToken }, body: JSON.stringify({ orderId: credentials.id, accessToken: credentials.token }) });
      const result = await linked.json();
      if (!linked.ok || result.linked !== true || result.orderId !== credentials.id) throw new Error('unavailable');
      setAccountLink('linked'); setError('');
    } catch { setError(A.failed); } finally { busy.current = false; }
  };
  return <section className="stack" aria-labelledby="order-account-title">
    <h2 className="h-3" id="order-account-title">{T.account}</h2>
    {!order && <p>{dict.common.labels.reference}</p>}
    {error && <p role="alert" className="err">{error}</p>}
    {credentials && accountLink !== 'linked' && <div className="stack"><p role="status">{accountLink === 'pending' ? A.failed : P.accountRequired}</p><button className="btn-outline" type="button" onClick={linkAccount}>{A.linkOrder}</button><a href={`/${locale}/account`}>{A.title}</a></div>}
    {accountLink === 'linked' && <p role="status">{A.linked}</p>}
    {order && <>
      <dl className="cfg-summary"><div><dt>{dict.common.labels.reference}</dt><dd>{order.id}</dd></div>
        <div><dt>{dict.common.labels.status}</dt><dd>{order.payment.status}</dd></div></dl>
      <dl className="cfg-summary">{Object.entries(order.snapshot.configuration).map(([k, v]) => <div key={k}><dt>{dict.build.fieldNames[k] || dict.common.labels[k] || k}</dt><dd>{String(v)}</dd></div>)}</dl>
      <p>{P[purchase.labelKey]}</p>
      {purchase.programPending && <aside className="note stack"><p>{P.programPending}</p>
        {purchase.requestedPrincipalMinor && <dl className="cfg-summary"><div><dt>{P.programPrincipal}</dt><dd><bdi>{formatCents(purchase.requestedPrincipalMinor, locale, purchase.currency)}</bdi></dd></div></dl>}
      </aside>}
      <p>{order.snapshot.paymentPreference==='bank_wire'?T.bankWire:P.checkoutOnSite}</p>
      <dl className="cfg-summary">
        <div><dt>{dict.form.fields.basis}</dt><dd>{dict.lead.basis[order.snapshot.technical.measurement_basis] || dict.common.labels.notProvided}</dd></div>
        <div><dt>{dict.common.labels.balance} · {order.snapshot.technical.final ? dict.common.statuses.confirmed : dict.common.labels.requestTarget}</dt><dd>{order.snapshot.technical.balance.confirmed_balance ?? order.snapshot.technical.balance.requested_balance ?? order.snapshot.technical.balance.proposed_balance ?? dict.common.labels.notProvided} {dict.common.labels.mm}</dd></div>
        <div><dt>{dict.common.labels.stiffness} · {order.snapshot.technical.final ? dict.common.statuses.confirmed : dict.common.labels.requestTarget}</dt><dd>{order.snapshot.technical.frame_stiffness.confirmed_ra ?? order.snapshot.technical.frame_stiffness.requested_ra ?? dict.common.labels.notProvided} RA</dd></div>
      </dl>
      {order.snapshot.quotation && <dl className="cfg-summary">
        <div><dt>{dict.common.labels.reference}</dt><dd><bdi>{order.snapshot.quotation.number}</bdi></dd></div>
        <div><dt>{T.purchase}</dt><dd>{order.snapshot.quotation.seller.legalName}</dd></div>
        <div><dt>{dict.common.labels.quantity}</dt><dd>{order.snapshot.configuration.racquetsTotal}</dd></div>
      </dl>}
      {order.snapshot.offer ? <>
        <p className="h-3">{new Intl.NumberFormat(locale, { style: 'currency', currency: order.snapshot.offer.currency }).format(order.snapshot.offer.totalMinor / 100)}</p>
        <p>{order.snapshot.offer.deliveryTerms}</p><p>{order.snapshot.offer.termsText}</p>
      </> : <p className="note">{dict.common.truth.noPrices}</p>}
      {allowCheckout && <div className="stack"><p className="note">{P.sessionUnavailable}</p><div><a className="btn" href={tennisCheckoutHref(locale, order.id)}>{P.continueCheckout}</a></div></div>}
      {allowCheckout && <button className="btn-outline" type="button" onClick={() => refresh()}>{dict.common.labels.status}</button>}
      {order.invoice && <><h3 className="h-3">{T.invoice} · TEST</h3><dl className="cfg-summary">
        <div><dt>{dict.common.labels.reference}</dt><dd><bdi>{order.invoice.number}</bdi></dd></div>
        <div><dt>{T.purchase}</dt><dd>{order.invoice.seller.legalName}</dd></div>
        <div><dt>{A.amount}</dt><dd>{new Intl.NumberFormat(locale, { style: 'currency', currency: order.invoice.currency }).format(order.invoice.totalMinor / 100)}</dd></div>
      </dl></>}
      {Object.entries(order.mail).map(([kind, m]) => <div key={kind}><p>{kind}: {m.status} · {m.attempts}</p>
        {credentials && <button type="button" className="btn-outline" onClick={() => refresh({ retryMail: kind, retryKey: crypto.randomUUID() })}>{T.retry}</button>}</div>)}
    </>}
  </section>;
}
