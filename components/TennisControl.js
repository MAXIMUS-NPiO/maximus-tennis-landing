/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
"use client";
import { useEffect, useId, useRef, useState } from 'react';
import { tennisControlLabels, tennisControlStateKey } from '../content/tennis-control';
import { tennisCheckoutLabels } from '../content/tennis-checkout';
import { accountLabels } from '../content/account';
import { CONTROL_OPEN_STATES, TennisControlClientError, clearCheckoutSdkStorage, createCheckoutRenderer, createTennisControlAttempt, initiateTennisControl, loadTennisControlAccount, prepareTennisControl, readTennisControlCurrent, readTennisControlReturn, readTennisControlStatus } from '../lib/client/tennis-control';

export const TENNIS_CONTROL_BANK_CONTAINER = 'tennis-control-bank';
const POLL_MS = 10000, REQUEST_MS = 25000, MAX_FAILURES = 30;
const SESSION_ERRORS = new Set(['account_required', 'unconfigured', 'not_owner']);
const open = (order, payment, now = Date.now()) => Boolean(order) && CONTROL_OPEN_STATES.includes(payment) && order.localSessionDeadline !== null && Date.parse(order.localSessionDeadline) > now;
const when = (value, locale) => { const ms = typeof value === 'string' ? Date.parse(value) : NaN; return Number.isFinite(ms) ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(ms) : null; };

/**
 * Owner payment-control page. Only authenticated server projections are shown: the bank SDK
 * callbacks and the return from the bank page trigger a status read and never set a result.
 * The private session reaches the gateway SDK in memory only.
 */
export default function TennisControl({ locale, renderer: injectedRenderer, pollMs = POLL_MS }) {
  const P = tennisControlLabels[locale], C = tennisCheckoutLabels[locale], A = accountLabels[locale], termsId = useId();
  const [phase, setPhase] = useState('loading'), [account, setAccount] = useState(null), [view, setView] = useState(null);
  const [accepted, setAccepted] = useState(false), [busy, setBusy] = useState(true), [bank, setBank] = useState('idle');
  const [notice, setNotice] = useState(''), [returned, setReturned] = useState(false), [starting, setStarting] = useState(false);
  const sequence = useRef(0), controller = useRef(null), poll = useRef(null), container = useRef(null), renderer = useRef(injectedRenderer || null), attempts = useRef(null), mounting = useRef(false);
  if (!attempts.current) attempts.current = createTennisControlAttempt();

  const abort = () => { controller.current?.abort(); clearTimeout(poll.current); poll.current = null; };
  const request = async run => {
    const abortController = new AbortController(); controller.current = abortController;
    const timer = setTimeout(() => abortController.abort(), REQUEST_MS);
    try { return await run(abortController.signal); } finally { clearTimeout(timer); }
  };
  const fail = error => {
    const code = error instanceof TennisControlClientError ? error.code : 'unavailable';
    if (code === 'account_required') { setAccount(null); setView(null); setAccepted(false); setPhase('account_required'); }
    else if (code === 'unconfigured') { setView(null); setPhase('unconfigured'); }
    else if (code === 'not_owner') { setView(null); setPhase('not_owner'); }
    else setNotice(code);
  };
  const unmountBank = () => { renderer.current?.unmount(container.current); mounting.current = false; setBank('idle'); };

  useEffect(() => {
    const result = readTennisControlReturn(window.location);
    // Return parameters are observations only: dropped from the URL before any request is made.
    if (window.location.search || window.location.hash) window.history.replaceState(window.history.state, '', result.href);
    clearCheckoutSdkStorage(window.sessionStorage);
    if (result.returned) setReturned(true);
    renderer.current ||= createCheckoutRenderer();
    refresh();
    return () => { sequence.current++; abort(); unmountBank(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function refresh() {
    abort();
    const current = ++sequence.current;
    setBusy(true); setNotice('');
    try {
      const session = await request(signal => loadTennisControlAccount({ signal }));
      if (current !== sequence.current) return;
      const next = await request(signal => readTennisControlCurrent({ csrfToken: session.csrfToken, signal }));
      if (current !== sequence.current) return;
      setAccount(session);
      if (!next.owner) { setView(null); setPhase('not_owner'); return; }
      setView(next); setPhase('ready');
      if (open(next.order, next.payment)) { await ensureBank(session, next.order, current); if (current === sequence.current) schedule(session, next.order.id, current); }
      else if (renderer.current?.mounted && next.payment !== 'paid') unmountBank();
    } catch (error) { if (current === sequence.current) fail(error); }
    finally { if (current === sequence.current) setBusy(false); }
  }

  /** One timer chain for the open attempt; any newer action cancels it. Reads stop after repeated failures; Refresh starts them again. */
  function schedule(session, orderId, current, delay = pollMs, failures = 0) {
    clearTimeout(poll.current);
    if (failures > MAX_FAILURES) return;
    poll.current = setTimeout(() => { void readStatus(session, orderId, current, failures); }, delay);
  }
  async function readStatus(session, orderId, current, failures = 0) {
    if (current !== sequence.current) return;
    try {
      const status = await request(signal => readTennisControlStatus({ orderId }, { csrfToken: session.csrfToken, signal }));
      if (current !== sequence.current) return;
      if (open(status.order, status.payment)) {
        setView(previous => previous ? { ...previous, order: status.order, proof: status.proof, observation: status.observation, payment: status.payment } : previous);
        schedule(session, orderId, current);
        return;
      }
      // A closed attempt: the server alone says whether a new series may open.
      const next = await request(signal => readTennisControlCurrent({ csrfToken: session.csrfToken, signal }));
      if (current !== sequence.current) return;
      if (!next.owner) { unmountBank(); setView(null); setPhase('not_owner'); return; }
      setView(next);
      if (next.payment !== 'paid') unmountBank();
    } catch (error) {
      if (current !== sequence.current) return;
      if (error instanceof TennisControlClientError && SESSION_ERRORS.has(error.code)) { unmountBank(); fail(error); }
      else schedule(session, orderId, current, pollMs * 2, failures + 1);
    }
  }

  /** Issues (or re-reads) the private session of the open attempt and mounts the bank form once. */
  async function ensureBank(session, order, current) {
    if (mounting.current || renderer.current?.mounted || !container.current) return;
    mounting.current = true; setBank('loading');
    try {
      const result = await request(signal => initiateTennisControl({ orderId: order.id, locale }, { csrfToken: session.csrfToken, signal }));
      if (current !== sequence.current) { mounting.current = false; return; }
      setView(previous => previous ? { ...previous, order: result.order } : previous);
      if (!result.session) { mounting.current = false; setBank('idle'); schedule(session, order.id, current, 10); return; }
      const handler = () => { if (current === sequence.current) schedule(session, order.id, current, 10); };
      await renderer.current.mount({ sessionId: result.session.sessionId, container: container.current, handler });
      if (current !== sequence.current) { renderer.current.unmount(container.current); mounting.current = false; return; }
      setBank('mounted'); schedule(session, order.id, current);
    } catch (error) {
      mounting.current = false;
      if (current !== sequence.current) return;
      if (error instanceof TennisControlClientError && [...SESSION_ERRORS, 'currency_not_permitted', 'authorization_expired'].includes(error.code)) { setBank('idle'); fail(error); }
      else setBank('unavailable');
      if (!(error instanceof TennisControlClientError && SESSION_ERRORS.has(error.code))) schedule(session, order.id, current, 10);
    }
  }

  async function start() {
    if (busy || starting || !account || !view?.canOpen || !accepted) return;
    const current = sequence.current;
    setStarting(true); setBusy(true); setNotice(''); setReturned(false);
    try {
      const prepared = await request(signal => prepareTennisControl({ idempotencyKey: attempts.current.keyFor(view.terms.version), termsVersion: view.terms.version, termsAccepted: accepted }, { csrfToken: account.csrfToken, signal }));
      if (current !== sequence.current) return;
      setView(previous => ({ ...previous, order: prepared.order, proof: null, observation: null, payment: 'awaiting_payment', canOpen: false }));
      setAccepted(false);
      await ensureBank(account, prepared.order, current);
    } catch (error) { if (current === sequence.current) fail(error); }
    finally { if (current === sequence.current) { setStarting(false); setBusy(false); } }
  }

  const order = view?.order || null, payment = view?.payment || null;
  const stateKey = payment ? tennisControlStateKey[payment] : null;
  const canStart = phase === 'ready' && Boolean(view?.canOpen) && !open(order, payment);
  return <div className="stack-lg" aria-busy={busy}>
    {phase === 'loading' && <p role="status">{A.refresh}…</p>}
    {phase === 'account_required' && <p role="alert" className="note">{C.accountRequired}</p>}
    {phase === 'unconfigured' && <p role="alert" className="note">{C.sessionUnavailable}</p>}
    {phase === 'not_owner' && <p role="alert" className="note">{P.notOwner}</p>}
    {notice === 'currency_not_permitted' && <p role="alert" className="note red">{P.currencyNotPermitted}</p>}
    {notice && notice !== 'currency_not_permitted' && <p role="alert" className="note">{A.failed}</p>}
    {returned && <p role="status" className="note">{P.returned}</p>}
    {order && <section className="stack" aria-labelledby="tennis-control-order-title">
      <h2 className="h-3" id="tennis-control-order-title">{P.reference}</h2>
      <dl className="cfg-summary">
        <div><dt>{P.reference}</dt><dd><bdi className="mono">{order.id}</bdi></dd></div>
        <div><dt>{P.amount}</dt><dd><bdi className="mono">USD 1.00</bdi></dd></div>
        {order.localSessionDeadline && <div><dt>{P.deadline}</dt><dd><time dateTime={order.localSessionDeadline}>{when(order.localSessionDeadline, locale)}</time></dd></div>}
      </dl>
      {stateKey && <p role="status" aria-live="polite" data-payment={payment} className={payment === 'paid' ? 'note' : 'muted'}>{P[stateKey]}{view.proof?.observedAt && payment === 'paid' ? <> <time dateTime={view.proof.observedAt}>{when(view.proof.observedAt, locale)}</time></> : null}</p>}
    </section>}
    <section className="stack" aria-labelledby="tennis-control-bank-title" hidden={bank === 'idle'}>
      <h2 className="h-3" id="tennis-control-bank-title">{P.bankForm}</h2>
      {bank === 'loading' && <p role="status">{P.bankFormLoading}</p>}
      {bank === 'unavailable' && <p role="alert" className="note">{P.bankFormUnavailable}</p>}
      <div id={TENNIS_CONTROL_BANK_CONTAINER} ref={container} data-bank-form="" />
    </section>
    {canStart && view && <section className="stack" aria-labelledby="tennis-control-terms-title">
      <h2 className="h-3" id="tennis-control-terms-title">{order ? P.newAttempt : P.start}</h2>
      <p className="note" lang="en">{view.terms.text}</p>
      <label className="check" htmlFor={termsId}><input id={termsId} type="checkbox" checked={accepted} disabled={busy} onChange={event => setAccepted(event.target.checked)} /><span>{P.accept}</span></label>
      <div><button type="button" className="btn" disabled={!accepted || busy} onClick={start}>{order ? P.newAttempt : P.start}</button></div>
    </section>}
    <div className="btn-row">
      {phase !== 'loading' && <button type="button" className="btn-outline" disabled={busy} onClick={refresh}>{A.refresh}</button>}
      <a className="btn-ghost" href={`/${locale}/account`}>{A.title}</a>
    </div>
  </div>;
}

/** Account page block: the owner's current control order and its verified state; nothing for other accounts. */
export function TennisControlAccountStatus({ locale, csrfToken }) {
  const P = tennisControlLabels[locale];
  const [view, setView] = useState(null);
  useEffect(() => {
    const abortController = new AbortController();
    let active = true;
    readTennisControlCurrent({ csrfToken, signal: abortController.signal }).then(result => { if (active && result.owner) setView(result); }, () => {});
    return () => { active = false; abortController.abort(); };
  }, [csrfToken]);
  if (!view) return null;
  const stateKey = view.payment ? tennisControlStateKey[view.payment] : 'notStarted';
  return <section className="stack" aria-labelledby="account-control-title">
    <h2 className="h-3" id="account-control-title">{P.title}</h2>
    {view.order && <dl className="cfg-summary"><div><dt>{P.reference}</dt><dd><bdi className="mono">{view.order.id}</bdi></dd></div><div><dt>{P.amount}</dt><dd><bdi className="mono">USD 1.00</bdi></dd></div></dl>}
    <p role="status" data-payment={view.payment || 'not_started'}>{P[stateKey]}</p>
    <a className="btn-outline" href={`/${locale}/checkout/control`}>{P.title}</a>
  </section>;
}
