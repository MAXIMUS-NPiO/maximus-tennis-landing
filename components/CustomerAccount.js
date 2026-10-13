/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
"use client";
import { useEffect, useRef, useState } from 'react';
import { accountLabels, accountOperationLabels } from '../content/account';
import { commerceLabels } from '../content/commerce';
import OrderAccount from './OrderAccount';
import { TennisControlAccountStatus } from './TennisControl';

/** Only public session/ledger projections enter this component. Passwords and verification
 * tokens are submitted explicitly; they never enter browser storage or link query parameters.
 */
export async function accountRequest(path, { method = 'GET', body, csrfToken, signal } = {}) {
  const headers = method === 'POST' ? { 'Content-Type': 'application/json' } : {};
  if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
  const response = await fetch(path, { method, credentials: 'same-origin', cache: 'no-store',
    mode: 'same-origin', referrerPolicy: 'no-referrer', headers, signal,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || typeof payload !== 'object') {
    const error = new Error('account_request_failed');
    error.status = response.status;
    error.code = typeof payload?.code === 'string' ? payload.code : '';
    error.fieldErrors = payload?.fieldErrors && typeof payload.fieldErrors === 'object' ? payload.fieldErrors : {};
    throw error;
  }
  return payload;
}

export function accountErrorText(error, labels) {
  if (error?.status === 503) return labels.unavailable;
  if (error?.code === 'email_verification_required') return labels.checkEmail;
  if (error?.code === 'capability_required' || error?.code === 'mfa_required') return labels.adminOnly;
  return labels.failed;
}

/** Exact decimal minor units. Number is used only for the validated currency exponent,
 * never for an amount or balance, including values greater than MAX_SAFE_INTEGER.
 */
export function formatLedgerAmount(amountMinor, currency, minorUnitExponent, locale) {
  if (typeof amountMinor !== 'string' || !/^-?\d+$/.test(amountMinor) || !/^[A-Z]{3}$/.test(currency || '') ||
      !Number.isInteger(minorUnitExponent) || minorUnitExponent < 0 || minorUnitExponent > 9) return null;
  try {
    const amount = BigInt(amountMinor);
    const magnitude = amount < 0n ? -amount : amount;
    const scale = 10n ** BigInt(minorUnitExponent);
    const formatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
    const whole = formatter.format(magnitude / scale);
    const separator = new Intl.NumberFormat(locale).formatToParts(1.1).find(part => part.type === 'decimal')?.value;
    const fraction = minorUnitExponent ? (magnitude % scale).toString().padStart(minorUnitExponent, '0') : '';
    // Localise fraction digits without ever converting the monetary value to a float.
    const digits = Array.from({ length: 10 }, (_, digit) => formatter.format(BigInt(digit)));
    const decimal = fraction.replace(/\d/g, digit => digits[Number(digit)]);
    const sign = amount < 0n ? new Intl.NumberFormat(locale).formatToParts(-1).find(part => part.type === 'minusSign')?.value || '-' : '';
    if (minorUnitExponent && !separator) return null;
    return `${sign}${whole}${minorUnitExponent ? separator + decimal : ''} ${currency}`;
  } catch { return null; }
}

function dateText(value, locale) {
  const ms = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(ms) ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(ms) : null;
}

/** This receives an already-authorised server response. No rows means no recorded ledger;
 * missing amounts never become zero, and bankBalanceMinor is deliberately not rendered.
 */
export function AccountLedger({ summary, journal, locale, dict, showHistory = true, showEvidence = false, idPrefix = 'account-ledger' }) {
  const T = accountLabels[locale];
  const currencies = Array.isArray(summary?.currencies) ? summary.currencies : null;
  if (!currencies) return <p className="note">{T.noData}</p>;
  const items = Array.isArray(journal?.items) ? journal.items : null;
  const value = (row, amount) => formatLedgerAmount(amount, row.currency, row.minorUnitExponent, locale) || T.noData;
  return <div className="stack-lg">
    <div className="grid-2">
      <section className="stack" aria-labelledby={`${idPrefix}-deposit`}>
        <h2 className="h-3" id={`${idPrefix}-deposit`}>MyDeposit</h2>
        {!currencies.length && <p>{T.empty}</p>}
        {currencies.map((row, index) => <div className="stack" key={`${row.customerId || ''}:${row.merchantId}:${row.currency}:${index}`}>
          <dl className="cfg-summary"><div><dt>{T.returnablePrincipal}</dt><dd><bdi className="mono">{value(row, row.myDeposit?.returnablePrincipalMinor)}</bdi></dd></div></dl>
          {row.myDeposit?.status === 'not_enabled' && <p className="muted">{T.notEnabled}</p>}
        </div>)}
      </section>
      <section className="stack" aria-labelledby={`${idPrefix}-bonus`}>
        <h2 className="h-3" id={`${idPrefix}-bonus`}>MyBonus</h2>
        {!currencies.length && <p>{T.empty}</p>}
        {currencies.map((row, index) => <div className="stack" key={`${row.customerId || ''}:${row.merchantId}:${row.currency}:${index}`}>
          <dl className="cfg-summary"><div><dt>{T.availableBonus}</dt><dd><bdi className="mono">{value(row, row.myBonus?.availableMinor)}</bdi></dd></div></dl>
          {row.myBonus?.status === 'not_enabled' && <p className="muted">{T.notEnabled}</p>}
        </div>)}
      </section>
    </div>
    {showHistory && <section className="stack" aria-labelledby={`${idPrefix}-history`}>
      <h2 className="h-3" id={`${idPrefix}-history`}>{T.history}</h2>
      {!items ? <p className="note">{T.noData}</p> : !items.length ? <p>{T.empty}</p> : <div className="spec-wrap">
        <table className="spec"><caption className="muted">{T.history}</caption><thead><tr>
          <th scope="col">{T.date}</th><th scope="col">{T.kind}</th><th scope="col">{T.amount}</th><th scope="col">{T.reference}</th>{showEvidence && <th scope="col">Hash</th>}
        </tr></thead><tbody>{items.map(entry => {
          const row = currencies.find(currency => currency.currency === entry.currency && currency.merchantId === entry.merchantId);
          const occurred = dateText(entry.occurredAt, locale);
          return <tr key={entry.id}>
            <td data-label={T.date}>{occurred ? <time dateTime={entry.occurredAt}>{occurred}</time> : T.noData}</td>
            <td data-label={T.kind}>{accountOperationLabels[locale]?.[entry.kind] || T.kind}</td>
            <td className="num" data-label={T.amount}><bdi>{row ? value(row, entry.amountMinor) : T.noData}</bdi></td>
            <td data-label={T.reference}><bdi>{typeof entry.orderId === 'string' ? entry.orderId : T.noData}</bdi></td>
            {showEvidence && <td data-label="Hash"><code style={{ overflowWrap: 'anywhere' }}>{/^[a-f0-9]{64}$/.test(entry.hash || '') ? entry.hash : T.noData}</code></td>}
          </tr>;
        })}</tbody></table>
      </div>}
    </section>}
  </div>;
}

function Verification({ locale, dict }) {
  const T = accountLabels[locale];
  const [token, setToken] = useState('');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    // Consume nothing on GET/mount: email security crawlers cannot redeem a token.
    // Remove fragments and legacy query tokens before any request from this component.
    const url = new URL(window.location.href);
    const supplied = new URLSearchParams(url.hash.slice(1)).get('token') || url.searchParams.get('token') || '';
    url.searchParams.delete('token'); url.hash = '';
    window.history.replaceState(window.history.state, '', url.pathname + url.search);
    if (supplied.length >= 20 && supplied.length <= 200) setToken(supplied);
    setReady(true);
  }, []);
  const submit = async event => {
    event.preventDefault(); if (!ready || busy || verified) return;
    setBusy(true); setError('');
    const submitted = token;
    try {
      const response = await accountRequest('/api/accounts/verify', { method: 'POST', body: { token: submitted } });
      if (response.verified !== true) throw new Error('verification_unconfirmed');
      setToken(''); setVerified(true);
    } catch (failure) { setError(accountErrorText(failure, T)); }
    finally { setBusy(false); }
  };
  return <section className="stack" aria-labelledby="account-verify-title">
    <h2 className="h-3" id="account-verify-title">{T.verify}</h2>
    {error && <p role="alert" className="note">{error}</p>}
    {verified ? <p role="status">{T.verified}</p> : <form className="form" onSubmit={submit} aria-busy={busy}>
      <div className="field"><label htmlFor="account-verify-token">{T.token}</label>
        <input id="account-verify-token" name="token" autoComplete="off" spellCheck={false} required minLength={20} maxLength={200}
          value={token} onChange={event => setToken(event.target.value)} disabled={!ready || busy} /></div>
      <div><button className="btn" type="submit" disabled={!ready || busy || !token}>{T.verify}</button></div>
    </form>}
    <a href={`/${locale}/account`}>{T.login}</a>
  </section>;
}

function CustomerPortal({ locale, dict }) {
  const T = accountLabels[locale];
  const [session, setSession] = useState(null);
  const [state, setState] = useState('loading');
  const [mode, setMode] = useState('login');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [ledger, setLedger] = useState(null);
  const [ledgerError, setLedgerError] = useState('');
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [orders, setOrders] = useState(null);
  const [ordersError, setOrdersError] = useState('');
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const sequence = useRef(0);
  const sessionController = useRef(null);
  const ledgerController = useRef(null);
  const ordersController = useRef(null);

  const refreshSession = async () => {
    const current = ++sequence.current;
    sessionController.current?.abort(); ledgerController.current?.abort(); ordersController.current?.abort();
    const controller = new AbortController(); sessionController.current = controller;
    setSession(null); setLedger(null); setOrders(null); setSelectedOrderId(null); setLedgerError(''); setOrdersError('');
    setLedgerLoading(false); setOrdersLoading(false); setState('loading'); setError('');
    try {
      const response = await accountRequest('/api/accounts/session', { signal: controller.signal });
      if (!response.user?.id || typeof response.csrfToken !== 'string') throw new Error('invalid_session');
      if (current !== sequence.current) return;
      setSession(response); setState('ready');
    } catch (failure) {
      if (controller.signal.aborted || current !== sequence.current) return;
      setState(failure.status === 401 ? 'guest' : 'unavailable');
      if (failure.status !== 401) setError(accountErrorText(failure, T));
    }
  };
  useEffect(() => {
    refreshSession();
    return () => { sequence.current++; sessionController.current?.abort(); ledgerController.current?.abort(); ordersController.current?.abort(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshLedger = async (offset = 0) => {
    if (!session?.user?.id) return;
    const current = sequence.current;
    ledgerController.current?.abort();
    const controller = new AbortController(); ledgerController.current = controller;
    if (!offset) setLedger(null);
    setLedgerError(''); setLedgerLoading(true);
    try {
      const response = await accountRequest(`/api/ledger/account${offset ? `?offset=${offset}` : ''}`, { signal: controller.signal });
      if (!Array.isArray(response.summary?.currencies) || !Array.isArray(response.journal?.items)) throw new Error('invalid_ledger');
      if (current !== sequence.current || controller.signal.aborted) return;
      setLedger(previous => offset && previous ? { ...response, journal: { ...response.journal, items: [...previous.journal.items, ...response.journal.items] } } : response);
    } catch (failure) {
      if (current !== sequence.current || controller.signal.aborted) return;
      if (failure.status === 401) {
        sequence.current++; ordersController.current?.abort();
        setSession(null); setLedger(null); setOrders(null); setSelectedOrderId(null); setBusy(false); setNotice(''); setLedgerLoading(false); setOrdersLoading(false); setState('guest');
      }
      setLedgerError(accountErrorText(failure, T));
    } finally { if (current === sequence.current && !controller.signal.aborted) setLedgerLoading(false); }
  };
  useEffect(() => { if (session?.user?.id) refreshLedger(); }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshOrders = async () => {
    if (!session?.user?.id || !session.user.emailVerified) return;
    const current = sequence.current;
    ordersController.current?.abort();
    const controller = new AbortController(); ordersController.current = controller;
    setOrders(null); setSelectedOrderId(null); setOrdersError(''); setOrdersLoading(true);
    try {
      const response = await accountRequest('/api/accounts/orders', { signal: controller.signal });
      if (!Array.isArray(response.items)) throw new Error('invalid_order_list');
      if (current !== sequence.current || controller.signal.aborted) return;
      setOrders(response.items);
    } catch (failure) {
      if (current !== sequence.current || controller.signal.aborted) return;
      if (failure.status === 401) {
        sequence.current++; ledgerController.current?.abort();
        setSession(null); setLedger(null); setOrders(null); setSelectedOrderId(null); setBusy(false); setNotice(''); setOrdersLoading(false); setLedgerLoading(false); setState('guest');
      }
      setOrdersError(accountErrorText(failure, T));
    } finally { if (current === sequence.current && !controller.signal.aborted) setOrdersLoading(false); }
  };
  useEffect(() => { if (session?.user?.id && session.user.emailVerified) refreshOrders(); }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  const linkOrder = async event => {
    event.preventDefault(); if (busy || !session?.csrfToken || !session.user.emailVerified) return;
    const form = event.currentTarget, fields = new FormData(form);
    const body = { orderId: String(fields.get('orderId') || '').trim(), accessToken: String(fields.get('accessToken') || '') };
    const current = sequence.current;
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await accountRequest('/api/accounts/orders/link', { method: 'POST', body, csrfToken: session.csrfToken });
      if (response.linked !== true) throw new Error('order_link_unconfirmed');
      if (current !== sequence.current) return;
      form.reset(); setNotice(T.linked); refreshOrders();
    } catch (failure) { if (current === sequence.current) setError(accountErrorText(failure, T)); }
    finally { if (current === sequence.current) setBusy(false); }
  };

  const submit = async event => {
    event.preventDefault(); if (busy || state !== 'guest') return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const body = { email: String(fields.get('email') || ''), password: String(fields.get('password') || '') };
    if (mode === 'register') Object.assign(body, { displayName: String(fields.get('displayName') || ''),
      roles: fields.getAll('roles'), locale, consents: { terms: fields.get('terms') === 'on', privacy: fields.get('privacy') === 'on', marketing: false },
      ...(fields.get('country') ? { country: String(fields.get('country')).trim().toUpperCase() } : {}) });
    if (form.elements.password) form.elements.password.value = '';
    setBusy(true); setError(''); setNotice(''); setFieldErrors({});
    const current = ++sequence.current;
    try {
      const response = await accountRequest(`/api/accounts/${mode}`, { method: 'POST', body });
      if (current !== sequence.current) return;
      if (mode === 'register') {
        if (response.accepted !== true) throw new Error('registration_unconfirmed');
        setNotice(T.checkEmail);
      } else {
        if (!response.user?.id || typeof response.csrfToken !== 'string') throw new Error('invalid_session');
        setSession(response); setState('ready'); setLedger(null);
      }
    } catch (failure) {
      if (current !== sequence.current) return;
      setError(accountErrorText(failure, T)); setFieldErrors(failure.fieldErrors || {});
      if (failure.status === 503) setState('unavailable');
    } finally { if (current === sequence.current) setBusy(false); }
  };

  const logout = async () => {
    if (busy || !session?.csrfToken) return;
    ledgerController.current?.abort(); ordersController.current?.abort(); const current = ++sequence.current;
    setBusy(true); setError(''); setLedger(null); setOrders(null); setSelectedOrderId(null); setLedgerError(''); setOrdersError('');
    try {
      const response = await accountRequest('/api/accounts/logout', { method: 'POST', body: {}, csrfToken: session.csrfToken });
      if (response.revoked !== true) throw new Error('logout_unconfirmed');
      if (current === sequence.current) { setSession(null); setState('guest'); setNotice(''); }
    } catch (failure) { if (current === sequence.current) setError(accountErrorText(failure, T)); }
    finally { if (current === sequence.current) { setBusy(false); setLedgerLoading(false); setOrdersLoading(false); } }
  };
  const resend = async () => {
    if (busy || !session?.user?.email) return;
    const current = sequence.current;
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await accountRequest('/api/accounts/resend', { method: 'POST', body: { email: session.user.email } });
      if (response.accepted !== true) throw new Error('resend_unconfirmed');
      if (current === sequence.current) setNotice(T.checkEmail);
    } catch (failure) { if (current === sequence.current) setError(accountErrorText(failure, T)); }
    finally { if (current === sequence.current) setBusy(false); }
  };
  const fieldError = name => fieldErrors[name] ? <span className="err">{dict.form.errors[fieldErrors[name]] || dict.form.errors.invalid}</span> : null;
  const nextOffset = ledger?.journal?.nextOffset;
  return <section className="stack-lg" aria-labelledby="customer-account-title" aria-busy={state === 'loading' || busy}>
    <h2 className="h-3" id="customer-account-title">{T.title}</h2>
    {error && <p role="alert" className="note">{error}</p>}
    {notice && <p role="status" className="note">{notice}</p>}
    {state === 'loading' && <p role="status" className="muted">{T.refresh}…</p>}
    {state === 'unavailable' && <div><button type="button" className="btn-outline" onClick={refreshSession}>{T.refresh}</button></div>}
    {state === 'guest' && <>
      <div className="btn-row" role="group" aria-label={T.title}>
        <button className={mode === 'login' ? 'btn' : 'btn-outline'} type="button" aria-pressed={mode === 'login'} disabled={busy} onClick={() => { setMode('login'); setError(''); setFieldErrors({}); }}>{T.login}</button>
        <button className={mode === 'register' ? 'btn' : 'btn-outline'} type="button" aria-pressed={mode === 'register'} disabled={busy} onClick={() => { setMode('register'); setError(''); setFieldErrors({}); }}>{T.register}</button>
      </div>
      <form key={mode} className="form narrow" onSubmit={submit}>
        {mode === 'register' && <div className="field"><label htmlFor="account-name">{dict.form.fields.name}</label>
          <input id="account-name" name="displayName" autoComplete="name" required maxLength={120} aria-invalid={Boolean(fieldErrors.displayName)} />{fieldError('displayName')}</div>}
        <div className="field"><label htmlFor="account-email">{dict.form.fields.email}</label>
          <input id="account-email" name="email" type="email" autoComplete={mode === 'login' ? 'username' : 'email'} required maxLength={320} aria-invalid={Boolean(fieldErrors.email)} />{fieldError('email')}</div>
        <div className="field"><label htmlFor="account-password">{T.password}</label>
          <input id="account-password" name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'register' ? 10 : 1} maxLength={1024} aria-invalid={Boolean(fieldErrors.password)} />{fieldError('password')}</div>
        {mode === 'register' && <>
          <fieldset className="field" style={{ border: 0, margin: 0, padding: 0 }}><legend>{dict.form.fields.role}</legend>
            <div className="choice three">{['player','parent','coach'].map(role => <label key={role}><input type="checkbox" name="roles" value={role} /><span>{dict.form.roles[role]}</span></label>)}</div>{fieldError('roles')}</fieldset>
          <label className="check"><input name="terms" type="checkbox" required /><span>{T.agree} <a href={`/${locale}/terms`}>{dict.nav.terms}</a></span></label>
          <label className="check"><input name="privacy" type="checkbox" required /><span>{T.agree} <a href={`/${locale}/privacy`}>{dict.nav.privacy}</a></span></label>
        </>}
        <div><button className="btn" type="submit" disabled={busy}>{mode === 'register' ? T.register : T.login}</button></div>
      </form>
      <a href={`/${locale}/account/verify`}>{T.verify}</a>
    </>}
    {state === 'ready' && session && <>
      <dl className="cfg-summary"><div><dt>{dict.form.fields.name}</dt><dd>{session.user.displayName}</dd></div>
        <div><dt>{dict.form.fields.email}</dt><dd><bdi>{session.user.email}</bdi></dd></div>
        <div><dt>{T.customerId}</dt><dd><bdi className="mono">{session.user.id}</bdi></dd></div>
        <div><dt>{T.verify}</dt><dd>{session.user.emailVerified ? dict.common.labels.yes : dict.common.labels.no}</dd></div></dl>
      <div className="btn-row"><button type="button" className="btn-outline" disabled={busy || ledgerLoading || ordersLoading} onClick={() => { refreshLedger(); refreshOrders(); }}>{T.refresh}</button>
        <button type="button" className="btn-ghost" disabled={busy} onClick={logout}>{T.logout}</button>
        {session.canReadAdminLedger === true && <a href={`/${locale}/admin/accounts`} className="btn-ghost">{T.adminTitle}</a>}</div>
      {!session.user.emailVerified && <div className="stack"><p className="note">{T.checkEmail}</p>
        <div className="btn-row"><button type="button" className="btn-outline" disabled={busy} onClick={resend}>{commerceLabels[locale].retry}</button><a href={`/${locale}/account/verify`}>{T.verify}</a></div></div>}
      {ledgerLoading && <p role="status" className="muted">{T.refresh}…</p>}
      {ledgerError && <p role="alert" className="note">{ledgerError}</p>}
      {ledger ? <AccountLedger summary={ledger.summary} journal={ledger.journal} locale={locale} dict={dict} /> : <div className="grid-2">
        <section className="stack"><h2 className="h-3">MyDeposit</h2><p>{T.noData}</p></section>
        <section className="stack"><h2 className="h-3">MyBonus</h2><p>{T.noData}</p></section></div>}
      {Number.isSafeInteger(nextOffset) && nextOffset > 0 && <div><button type="button" className="btn-outline" disabled={busy || ledgerLoading} onClick={() => refreshLedger(nextOffset)}>{T.more}</button></div>}
      {session.user.emailVerified && <TennisControlAccountStatus key={session.csrfToken} locale={locale} csrfToken={session.csrfToken} />}
      <section className="stack" aria-labelledby="customer-orders-title">
        <h2 className="h-3" id="customer-orders-title">{commerceLabels[locale].account}</h2>
        {ordersLoading && <p role="status">{T.refresh}…</p>}
        {ordersError && <p role="alert" className="note">{ordersError}</p>}
        {!orders ? <p>{T.noData}</p> : !orders.length ? <p>{T.empty}</p> : <ol className="steps">
          {orders.map(order => <li key={order.orderId}><div><strong><bdi>{order.orderId}</bdi></strong>
            {dateText(order.acceptedAt, locale) && <time dateTime={order.acceptedAt}>{dateText(order.acceptedAt, locale)}</time>}
            <div><button type="button" className="linkbtn" onClick={() => setSelectedOrderId(order.orderId)} disabled={busy || ordersLoading}>{dict.common.labels.readMore}</button></div>
          </div></li>)}
        </ol>}
        {selectedOrderId && <OrderAccount key={selectedOrderId} locale={locale} dict={dict} orderId={selectedOrderId} />}
        {session.user.emailVerified && <details className="expander"><summary>{T.linkOrder}</summary>
          <form className="form narrow" onSubmit={linkOrder}>
            <div className="field"><label htmlFor="account-link-order">{T.reference}</label>
              <input id="account-link-order" name="orderId" required maxLength={200} autoComplete="off" spellCheck={false} disabled={busy} /></div>
            <div className="field"><label htmlFor="account-link-token">{T.orderAccessToken}</label>
              <input id="account-link-token" name="accessToken" type="password" required maxLength={200} autoComplete="off" disabled={busy} /></div>
            <div><button type="submit" className="btn-outline" disabled={busy}>{T.linkOrder}</button></div>
          </form>
        </details>}
      </section>
    </>}
  </section>;
}

export default function CustomerAccount({ locale, dict, verify = false }) {
  return verify ? <Verification locale={locale} dict={dict} /> : <CustomerPortal locale={locale} dict={dict} />;
}
