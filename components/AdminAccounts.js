/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
"use client";
import { useEffect, useRef, useState } from 'react';
import { accountLabels, accountOperationLabels, accountProgramLabels } from '../content/account';
import { AccountLedger, accountRequest, accountErrorText, formatLedgerAmount } from './CustomerAccount';

/** Server-authenticated totals, per merchant and currency. The net receipt is provided
 * by the ledger; this view does not calculate a bank balance or infer missing amounts.
 */
export function AdminLedgerSummary({ summary, locale }) {
  const T = accountLabels[locale], operations = accountOperationLabels[locale];
  const currencies = Array.isArray(summary?.currencies) ? summary.currencies : null;
  if (!currencies) return <p className="note">{T.noData}</p>;
  if (!currencies.length) return <p>{T.empty}</p>;
  const netLabel = `${operations.capture} − ${operations.refund} − ${operations.chargeback}`;
  const value = (row, amount) => formatLedgerAmount(amount, row.currency, row.minorUnitExponent, locale) || T.noData;
  return <div className="spec-wrap"><table className="spec">
    <caption className="muted">{T.adminTitle} · {T.amount}</caption>
    <thead><tr><th scope="col">{T.reference}</th><th scope="col">{operations.capture}</th>
      <th scope="col">{operations.refund}</th><th scope="col">{netLabel}</th>
      <th scope="col">MyBonus · {operations.bonus_redeem}</th><th scope="col">MyDeposit · {T.returnablePrincipal}</th></tr></thead>
    <tbody>{currencies.map((row, index) => <tr key={`${row.customerId || ''}:${row.merchantId}:${row.currency}:${index}`}>
      <td data-label={T.reference}><bdi>{row.merchantId}</bdi> · <bdi>{row.currency}</bdi></td>
      <td className="num" data-label={operations.capture}><bdi>{value(row, row.capturedMinor)}</bdi></td>
      <td className="num" data-label={operations.refund}><bdi>{value(row, row.refundedMinor)}</bdi></td>
      <td className="num" data-label={netLabel}><bdi>{value(row, row.netCapturedMinor)}</bdi></td>
      <td className="num" data-label={`MyBonus · ${operations.bonus_redeem}`}><bdi>{value(row, row.myBonus?.redeemedMinor)}</bdi></td>
      <td className="num" data-label={`MyDeposit · ${T.returnablePrincipal}`}><bdi>{value(row, row.myDeposit?.returnablePrincipalMinor)}</bdi></td>
    </tr>)}</tbody>
  </table></div>;
}

/** One basis point is exactly one hundredth of a percent. No monetary or rate float. */
export function formatProgramRate(rateBps, locale) {
  if (!Number.isSafeInteger(rateBps) || rateBps < 0) return null;
  try {
    const rate = BigInt(rateBps), formatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
    const separator = new Intl.NumberFormat(locale).formatToParts(1.1).find(part => part.type === 'decimal')?.value;
    if (!separator) return null;
    const digits = Array.from({ length: 10 }, (_, digit) => formatter.format(BigInt(digit)));
    const fraction = (rate % 100n).toString().padStart(2, '0').replace(/\d/g, digit => digits[Number(digit)]);
    return `${formatter.format(rate / 100n)}${separator}${fraction}%`;
  } catch { return null; }
}

/** Detail exists only for the selected, server-authorised client. Terms and balances
 * are recorded facts; the UI neither creates a program nor forecasts future cash flow.
 */
export function AdminProgramDetails({ summary, locale, dict }) {
  const T = accountLabels[locale], P = accountProgramLabels[locale], operations = accountOperationLabels[locale];
  const currencies = Array.isArray(summary?.currencies) ? summary.currencies : null;
  if (!currencies) return <p className="note">{T.noData}</p>;
  if (!currencies.length) return <p>{T.empty}</p>;
  const value = (row, amount) => formatLedgerAmount(amount, row.currency, row.minorUnitExponent, locale) || T.noData;
  const date = supplied => {
    if (typeof supplied !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(supplied)) return T.noData;
    const ms = Date.parse(supplied);
    if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 19) !== supplied.slice(0, 19)) return T.noData;
    return <time dateTime={supplied}>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(ms)}</time>;
  };
  const status = supplied => {
    if (supplied === 'active') return dict.common.statuses.current;
    if (supplied === 'reversal_review') return `${dict.common.labels.review} · ${operations.refund} / ${operations.chargeback}`;
    if (supplied === 'principal_returned') return operations.principal_payout;
    if (supplied === 'payout_bonus_review') return `${dict.common.labels.review} · ${operations.principal_payout} · MyBonus`;
    return T.noData;
  };
  const reversedLabel = `${operations.refund} / ${operations.chargeback}`;
  return <div className="stack-lg">{currencies.map((row, index) => {
    const programs = Array.isArray(row.myDeposit?.programs) ? row.myDeposit.programs : null;
    return <section className="stack" key={`${row.merchantId}:${row.currency}:${index}`}>
      <h3 className="h-3">MyDeposit · MyBonus · <bdi>{row.currency}</bdi></h3>
      <div className="grid-2">
        <dl className="cfg-summary">
          <div><dt>MyDeposit · {operations.principal_payout}</dt><dd><bdi>{value(row, row.myDeposit?.principalReturnedMinor)}</bdi></dd></div>
          <div><dt>MyDeposit · {reversedLabel}</dt><dd><bdi>{value(row, row.myDeposit?.principalReversedMinor)}</bdi></dd></div>
        </dl>
        <dl className="cfg-summary">
          <div><dt>{operations.bonus_accrue}</dt><dd><bdi>{value(row, row.myBonus?.accruedMinor)}</bdi></dd></div>
          <div><dt>{operations.bonus_advance}</dt><dd><bdi>{value(row, row.myBonus?.advanceMinor)}</bdi></dd></div>
          <div><dt>{operations.bonus_expire}</dt><dd><bdi>{value(row, row.myBonus?.expiredMinor)}</bdi></dd></div>
          <div><dt>MyBonus · {P.frozen}</dt><dd><bdi>{value(row, row.myBonus?.frozenMinor)}</bdi></dd></div>
        </dl>
      </div>
      {!programs ? <p className="note">{T.noData}</p> : !programs.length ? <p>{row.myDeposit?.status === 'not_enabled' ? T.notEnabled : T.empty}</p> : <div className="spec-wrap"><table className="spec">
        <caption className="muted">MyDeposit · {T.customerId}</caption>
        <thead><tr><th scope="col">{T.date}</th><th scope="col">{P.maturityDate}</th><th scope="col">{P.durationDays}</th>
          <th scope="col">{P.annualSimpleRate}</th><th scope="col">{dict.common.labels.status}</th><th scope="col">{P.frozen}</th><th scope="col">{T.returnablePrincipal}</th></tr></thead>
        <tbody>{programs.map((program, programIndex) => <tr key={program.id || programIndex}>
          <td data-label={T.date}>{date(program.startsAt)}</td><td data-label={P.maturityDate}>{date(program.maturesAt)}</td>
          <td className="num" data-label={P.durationDays}><bdi>{Number.isSafeInteger(program.durationDays) && program.durationDays > 0 ? new Intl.NumberFormat(locale).format(program.durationDays) : T.noData}</bdi></td>
          <td className="num" data-label={P.annualSimpleRate}><bdi>{formatProgramRate(program.rateBps, locale) || T.noData}</bdi></td>
          <td data-label={dict.common.labels.status}>{status(program.status)}</td>
          <td data-label={P.frozen}>{program.frozen === true ? dict.common.labels.yes : program.frozen === false ? dict.common.labels.no : T.noData}</td>
          <td className="num" data-label={T.returnablePrincipal}><bdi>{value(row, program.principalOutstandingMinor)}</bdi></td>
        </tr>)}</tbody>
      </table></div>}
    </section>;
  })}</div>;
}

/** Read-only operational ledger. A visible menu is never an access grant: every admin
 * response must pass the server's real capability, project and MFA checks.
 */
export default function AdminAccounts({ locale, dict }) {
  const T = accountLabels[locale];
  const [session, setSession] = useState(null);
  const [state, setState] = useState('loading');
  const [data, setData] = useState(null);
  const [customerId, setCustomerId] = useState('');
  const [loadedCustomerId, setLoadedCustomerId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mfaBusy, setMfaBusy] = useState(false);
  const [enrollment, setEnrollment] = useState(null);
  const [mfaNotice, setMfaNotice] = useState('');
  const sequence = useRef(0);
  const controller = useRef(null);

  const refreshSession = async () => {
    const current = ++sequence.current;
    controller.current?.abort(); const request = new AbortController(); controller.current = request;
    setSession(null); setData(null); setEnrollment(null); setMfaNotice(''); setState('loading'); setError(''); setBusy(false); setMfaBusy(false);
    try {
      const response = await accountRequest('/api/accounts/session', { signal: request.signal });
      if (current !== sequence.current || request.signal.aborted) return;
      if (!response.user?.id) throw new Error('invalid_session');
      setSession(response); setState(response.canReadAdminLedger === true ? 'ready' : 'forbidden');
    } catch (failure) {
      if (current !== sequence.current || request.signal.aborted) return;
      setState(failure.status === 401 ? 'guest' : 'unavailable');
      if (failure.status !== 401) setError(accountErrorText(failure, T));
    }
  };

  const load = async (selected = '', offset = 0) => {
    if (!session || state !== 'ready' || !Number.isSafeInteger(offset) || offset < 0) return;
    const current = ++sequence.current;
    controller.current?.abort(); const request = new AbortController(); controller.current = request;
    setBusy(true); setError('');
    if (!offset) setData(null);
    const query = new URLSearchParams();
    if (selected) query.set('customerId', selected);
    if (offset) query.set('offset', String(offset));
    try {
      const response = await accountRequest(`/api/ledger/admin${query.size ? '?' + query.toString() : ''}`, { signal: request.signal });
      if (!Array.isArray(response.summary?.currencies) || !Array.isArray((selected ? response.journal : response.clients)?.items)) throw new Error('invalid_ledger');
      if (current !== sequence.current || request.signal.aborted) return;
      setLoadedCustomerId(selected);
      setData(previous => {
        if (!offset || !previous) return response;
        const key = selected ? 'journal' : 'clients';
        return { ...response, [key]: { ...response[key], items: [...previous[key].items, ...response[key].items] } };
      });
    } catch (failure) {
      if (current !== sequence.current || request.signal.aborted) return;
      setData(null); setError(accountErrorText(failure, T));
      if (failure.status === 401) { setSession(null); setEnrollment(null); setMfaBusy(false); setState('guest'); }
      if (failure.code === 'mfa_required' || (failure.status === 503 && /mfa/.test(failure.code))) setState('mfa');
      else if (failure.status === 403) setState('forbidden');
    } finally { if (current === sequence.current && !request.signal.aborted) setBusy(false); }
  };
  useEffect(() => {
    refreshSession();
    return () => { sequence.current++; controller.current?.abort(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (session && state === 'ready') load(); }, [session, state]); // eslint-disable-line react-hooks/exhaustive-deps

  const mfa = async (event, action) => {
    event.preventDefault();
    if (mfaBusy || busy || !session?.csrfToken) return;
    const form = event.currentTarget, fields = new FormData(form);
    const body = action === 'enroll' ? { password: String(fields.get('password') || '') } : {
      code: String(fields.get('code') || ''), ...(action === 'confirm' ? { enrollmentId: enrollment?.enrollmentId } : {}),
    };
    if (action === 'confirm' && !enrollment?.enrollmentId) return;
    const current = ++sequence.current;
    controller.current?.abort(); const request = new AbortController(); controller.current = request;
    setMfaBusy(true); setMfaNotice(''); setError('');
    if (form.elements.password) form.elements.password.value = '';
    try {
      const response = await accountRequest(`/api/accounts/mfa/${action}`, { method: 'POST', body,
        csrfToken: session.csrfToken, signal: request.signal });
      if (current !== sequence.current || request.signal.aborted) return;
      if (action === 'enroll') {
        if (typeof response.enrollmentId !== 'string' || !response.enrollmentId ||
          typeof response.secret !== 'string' || !/^[A-Z2-7]+=*$/.test(response.secret) ||
          typeof response.otpauthUri !== 'string' || !response.otpauthUri.startsWith('otpauth://totp/') ||
          typeof response.expiresAt !== 'string' || !Number.isFinite(Date.parse(response.expiresAt))) throw new Error('enrollment_unconfirmed');
        // Generated setup material lives only in React memory, never storage, links or QR services.
        setEnrollment({ enrollmentId: response.enrollmentId, secret: response.secret, otpauthUri: response.otpauthUri, expiresAt: response.expiresAt });
      } else {
        if (typeof response.csrfToken !== 'string' || !response.csrfToken || response.mfaLevel !== 'totp') throw new Error('mfa_unconfirmed');
        form.reset(); setEnrollment(null);
        setSession(previous => ({ ...previous, csrfToken: response.csrfToken, mfaLevel: response.mfaLevel }));
        setMfaBusy(false);
        // Load the rotated HttpOnly session before the admin ledger is requested again.
        await refreshSession(); setMfaNotice(T.mfaVerified);
      }
    } catch (failure) {
      if (current !== sequence.current || request.signal.aborted) return;
      setError(accountErrorText(failure, T));
      if (failure.status === 401) { setSession(null); setData(null); setEnrollment(null); setState('guest'); }
    } finally { if (current === sequence.current && !request.signal.aborted) setMfaBusy(false); }
  };
  const copySetup = async () => {
    if (!enrollment?.secret || mfaBusy) return;
    const current = sequence.current;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard_unavailable');
      await navigator.clipboard.writeText(enrollment.secret);
      if (current === sequence.current) setMfaNotice(dict.common.labels.copied);
    } catch { if (current === sequence.current) setError(T.failed); }
  };

  const clients = data?.clients?.items;
  const nextOffset = loadedCustomerId ? data?.journal?.nextOffset : data?.clients?.nextOffset;
  return <section className="stack-lg" aria-labelledby="admin-accounts-title" aria-busy={state === 'loading' || busy}>
    <h2 className="h-3" id="admin-accounts-title">{T.adminTitle}</h2>
    {error && <p role="alert" className="note">{error}</p>}
    {mfaNotice && <p role="status" className="note">{mfaNotice}</p>}
    {state === 'loading' && <p role="status">{T.refresh}…</p>}
    {state === 'forbidden' && <p className="note">{T.adminOnly}</p>}
    {state === 'guest' && <a className="btn" href={`/${locale}/account`}>{T.login}</a>}
    {(state === 'forbidden' || state === 'unavailable' || state === 'mfa') && <div className="btn-row">
      <button type="button" className="btn-outline" disabled={mfaBusy} onClick={refreshSession}>{T.refresh}</button>
      <a href={`/${locale}/account`}>{T.title}</a>
    </div>}
    {session?.canReadAdminLedger === true && <details className="expander" open={state === 'mfa' ? true : undefined}>
      <summary>{T.mfa}</summary>
      <div className="stack-lg">
        <form className="form narrow" onSubmit={event => mfa(event, 'verify')}>
          <div className="field"><label htmlFor="admin-mfa-verify-code">{T.mfaCode}</label>
            <input id="admin-mfa-verify-code" name="code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required disabled={busy || mfaBusy} /></div>
          <div><button className="btn-outline" type="submit" disabled={busy || mfaBusy}>{T.mfaConfirm}</button></div>
        </form>
        <details className="expander"><summary>{T.mfaEnroll}</summary>
          <form className="form narrow" onSubmit={event => mfa(event, 'enroll')}>
            <div className="field"><label htmlFor="admin-mfa-enroll-password">{T.password}</label>
              <input id="admin-mfa-enroll-password" name="password" type="password" autoComplete="current-password" required maxLength={1024} disabled={busy || mfaBusy} /></div>
            <div><button className="btn-outline" type="submit" disabled={busy || mfaBusy}>{T.mfaEnroll}</button></div>
          </form>
        </details>
        {enrollment && <div className="stack">
          <dl className="cfg-summary"><div><dt>{T.mfaSecret}</dt><dd><code style={{ overflowWrap: 'anywhere' }}>{enrollment.secret}</code></dd></div>
            <div><dt>{T.mfaUri}</dt><dd><code style={{ overflowWrap: 'anywhere' }}>{enrollment.otpauthUri}</code></dd></div>
            <div><dt>{T.date}</dt><dd><time dateTime={enrollment.expiresAt}>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(Date.parse(enrollment.expiresAt))}</time></dd></div></dl>
          <div><button type="button" className="btn-ghost" disabled={mfaBusy} onClick={copySetup}>{T.mfaCopy}</button></div>
          <form className="form narrow" onSubmit={event => mfa(event, 'confirm')}>
            <div className="field"><label htmlFor="admin-mfa-confirm-code">{T.mfaCode}</label>
              <input id="admin-mfa-confirm-code" name="code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required disabled={busy || mfaBusy} /></div>
            <div><button className="btn" type="submit" disabled={busy || mfaBusy}>{T.mfaConfirm}</button></div>
          </form>
        </div>}
      </div>
    </details>}
    {state === 'ready' && <>
      <form className="form narrow" onSubmit={event => { event.preventDefault(); load(customerId.trim()); }}>
        <div className="field"><label htmlFor="admin-customer-id">{T.customerId} · {dict.common.labels.optional}</label>
          <input id="admin-customer-id" name="customerId" value={customerId} onChange={event => setCustomerId(event.target.value)} maxLength={200} autoComplete="off" spellCheck={false} /></div>
        <div className="btn-row"><button type="submit" className="btn" disabled={busy || mfaBusy}>{T.refresh}</button>
          <button type="button" className="btn-outline" disabled={busy || mfaBusy} onClick={() => { setCustomerId(''); load(); }}>{T.adminTitle}</button></div>
      </form>
      {busy && <p role="status">{T.refresh}…</p>}
      {data && <>
        {loadedCustomerId && <dl className="cfg-summary">
          {data.customer?.displayName && <div><dt>{dict.form.fields.name}</dt><dd>{data.customer.displayName}</dd></div>}
          <div><dt>{T.customerId}</dt><dd><bdi>{data.customer?.id || loadedCustomerId}</bdi></dd></div>
        </dl>}
        <AdminLedgerSummary summary={data.summary} locale={locale} />
        {loadedCustomerId && <AdminProgramDetails summary={data.summary} locale={locale} dict={dict} />}
        <AccountLedger summary={data.summary} journal={data.journal} locale={locale} dict={dict} showHistory={Boolean(loadedCustomerId)} showEvidence idPrefix="admin-ledger" />
        {!loadedCustomerId && <section className="stack" aria-labelledby="admin-clients-title">
          <h3 className="h-3" id="admin-clients-title">{T.adminTitle}</h3>
          {!clients?.length ? <p>{T.empty}</p> : <ul className="kicker-list">{clients.map((client, index) => <li key={`${client.customerId}:${client.merchantId}:${client.currency}:${index}`}>
            <button className="linkbtn" type="button" disabled={busy || mfaBusy} onClick={() => { setCustomerId(client.customerId); load(client.customerId); }}>
              <bdi>{client.customerId}</bdi> · <bdi>{client.currency}</bdi>
            </button>
          </li>)}</ul>}
        </section>}
        {Number.isSafeInteger(nextOffset) && nextOffset > 0 && <div><button type="button" className="btn-outline" disabled={busy || mfaBusy} onClick={() => load(loadedCustomerId, nextOffset)}>{T.more}</button></div>}
      </>}
    </>}
  </section>;
}
