/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
"use client";
import { useEffect, useRef, useState } from 'react';
import { commerceLabels } from '../content/commerce';
import { accountLabels } from '../content/account';
export default function OrderAccount({ dict, locale, initial, orderId = null }) {
  const [credentials, setCredentials] = useState(initial?.accessToken ? { id: initial.requestId, token: initial.accessToken } : null);
  const [order, setOrder] = useState(initial?.order || null);
  const [accountLink, setAccountLink] = useState(initial?.accountLink || null);
  const [error, setError] = useState('');
  const [terms, setTerms] = useState(false);
  const busy = useRef(false);
  const T = commerceLabels[locale];
  const A = accountLabels[locale];
  useEffect(() => {
    if (initial || orderId) return;
    const h = new URLSearchParams(window.location.hash.slice(1));
    const id = h.get('order'), token = h.get('access');
    // Capability never enters query/access logs, browser storage or analytics.
    if (id && token) setCredentials({ id, token });
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
  const pay = async () => {
    if (!credentials || !terms || busy.current) return;
    busy.current = true;
    try {
      const d = await call('checkout', { termsVersion: order.snapshot.offer.termsVersion });
      const u = new URL(d.checkout_url, window.location.origin);
      if (u.origin === window.location.origin) {
        // MPGS test hosted page is served locally using the official Checkout script.
        const h = await call('hosted');
        const w = window.open('', '_blank');
        if (!w) throw new Error('popup_blocked');
        w.opener = null; w.document.write(h.html); w.document.close();
      } else if (u.origin === 'https://maximussports.ae') window.location.assign(u.href);
      else throw new Error('invalid_checkout');
    } catch { setError(T.disabled); } finally { busy.current = false; }
  };
  return <section className="stack" aria-labelledby="order-account-title">
    <h2 className="h-3" id="order-account-title">{T.account}</h2>
    {!order && <p>{dict.common.labels.reference}</p>}
    {error && <p role="alert" className="err">{error}</p>}
    {accountLink === 'pending' && <div className="stack"><p role="status">{A.failed}</p><button className="btn-outline" type="button" onClick={linkAccount}>{A.linkOrder}</button></div>}
    {accountLink === 'linked' && <p role="status">{A.linked}</p>}
    {order && <>
      <dl className="cfg-summary"><div><dt>{dict.common.labels.reference}</dt><dd>{order.id}</dd></div>
        <div><dt>{dict.common.labels.status}</dt><dd>{order.payment.status}</dd></div></dl>
      <dl className="cfg-summary">{Object.entries(order.snapshot.configuration).map(([k, v]) => <div key={k}><dt>{dict.build.fieldNames[k] || dict.common.labels[k] || k}</dt><dd>{String(v)}</dd></div>)}</dl>
      <p>{order.snapshot.paymentPreference==='bank_wire'?T.bankWire:T.paymentLink}</p>
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
        <label><input type="checkbox" checked={terms} onChange={e => setTerms(e.target.checked)} /> {dict.form.fields.consent}</label>
        <button className="btn" type="button" disabled={!credentials || !terms || !['ready','pending'].includes(order.payment.status)} onClick={pay}>{T.payment} · TEST</button>
      </> : <p className="note">{dict.common.truth.noPrices}</p>}
      <p className="note">{T.disabled}</p>
      <button className="btn-outline" type="button" onClick={() => refresh()}>{dict.common.labels.status}</button>
      {credentials && <a rel="noreferrer" href={`/${locale}/orders#order=${credentials.id}&access=${credentials.token}`}>{T.account}</a>}
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
