/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
"use client";
import { useEffect, useId, useRef, useState } from 'react';
import { tennisCheckoutLabels } from '../content/tennis-checkout';
import { accountLabels } from '../content/account';
import OrderAccount from './OrderAccount';
import { canRequestTennisCheckout, createTennisCheckoutAttempt, loadTennisCheckout, readTennisCheckoutFragment, requestTennisCheckout } from '../lib/client/tennis-checkout';

/** This page never derives paid state from a browser return or embeds an unverified SDK. */
export default function TennisCheckout({ dict, locale }) {
  const P = tennisCheckoutLabels[locale], A = accountLabels[locale], termsId = useId();
  const [orderId, setOrderId] = useState(null), [order, setOrder] = useState(null), [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [terms, setTerms] = useState(false), [error, setError] = useState('');
  const [checkoutState, setCheckoutState] = useState(null);
  const attempts = useRef(null), controller = useRef(null), sequence = useRef(0), submitted = useRef(false);
  if (!attempts.current) attempts.current = createTennisCheckoutAttempt();

  useEffect(() => {
    const target = readTennisCheckoutFragment(window.location.hash);
    // Capabilities never enter request URLs, persistent storage or rendered output.
    if (window.location.hash) window.history.replaceState(window.history.state, '', `${window.location.pathname}${target ? `#order=${target.orderId}` : ''}`);
    if (target) setOrderId(target.orderId);
    else { setError('account_required'); setLoading(false); }
    return () => { sequence.current++; controller.current?.abort(); };
  }, []);

  const refresh = async id => {
    if (!id || submitted.current) return;
    controller.current?.abort();
    const current = ++sequence.current, abort = new AbortController(); controller.current = abort;
    const timer = setTimeout(() => abort.abort(), 20000);
    setLoading(true); setTerms(false); setError(''); setCheckoutState(null); setSession(null); setOrder(null);
    try {
      const result = await loadTennisCheckout(id, { signal: abort.signal });
      if (current !== sequence.current || abort.signal.aborted) return;
      setOrder(result.order); setSession(result.session);
    } catch (cause) {
      if (current === sequence.current && !abort.signal.aborted) setError(cause.code === 'account_required' ? 'account_required' : 'session_unavailable');
    } finally { clearTimeout(timer); if (current === sequence.current) { setLoading(false); if (abort.signal.aborted) setError('session_unavailable'); } }
  };
  useEffect(() => { if (orderId) refresh(orderId); }, [orderId]); // eslint-disable-line react-hooks/exhaustive-deps

  const prepare = async () => {
    if (submitted.current || checkoutState || !order || !session || !terms || !canRequestTennisCheckout(order)) return;
    submitted.current = true; setBusy(true); setError(''); setCheckoutState('creating');
    const current = sequence.current, abort = new AbortController(); controller.current = abort;
    const timer = setTimeout(() => abort.abort(), 20000);
    try {
      const result = await requestTennisCheckout({ orderId: order.id, locale, termsVersion: order.snapshot.offer.termsVersion,
        idempotencyKey: attempts.current.keyFor({ orderId: order.id, termsVersion: order.snapshot.offer.termsVersion }), csrfToken: session.csrfToken, termsAccepted: terms }, { signal: abort.signal });
      if (current !== sequence.current || abort.signal.aborted) return;
      // The exact official embedded API signature and this merchant's domain/3DS feature
      // evidence are not yet available. Do not guess a method, load a script, redirect,
      // expose the session in markup, or turn a prepared session into payment evidence.
      // Retain only a coarse state. Handles and embedded descriptors are not needed
      // while the verified renderer is absent and are never placed in React state.
      setCheckoutState(result.status === 'ready' ? 'renderer_unavailable' : result.status);
    } catch (cause) {
      if (current === sequence.current && !abort.signal.aborted) {
        if (cause.code === 'account_required') { setError('account_required'); setCheckoutState(null); }
        else setCheckoutState('uncertain'); // A lost response is not evidence that creation failed.
      }
    } finally {
      clearTimeout(timer); submitted.current = false;
      if (current === sequence.current) { setBusy(false); if (abort.signal.aborted) setCheckoutState('uncertain'); }
    }
  };

  const eligible = order && canRequestTennisCheckout(order);
  const stateLabel = { creating: 'checkoutCreating', uncertain: 'checkoutUncertain', review_required: 'checkoutReviewRequired', expired: 'checkoutExpired', renderer_unavailable: 'sessionUnavailable' }[checkoutState];
  return <div className="stack-lg" aria-busy={loading || busy}>
    <p className="muted">{P.steps}</p>
    {loading && <p role="status">{A.refresh}…</p>}
    {error === 'account_required' && <p role="alert" className="note">{P.accountRequired}</p>}
    {error === 'session_unavailable' && <p role="alert" className="note">{P.sessionUnavailable}</p>}
    {order && <>
      <OrderAccount dict={dict} locale={locale} initial={{ requestId: order.id, order }} allowCheckout={false} />
      <section className="stack" aria-labelledby="tennis-payment-title">
        <h2 className="h-3" id="tennis-payment-title">{P.checkoutOnSite}</h2>
        <p className="note">{P.sessionUnavailable}</p>
        {stateLabel && <p role="status" aria-live="polite">{P[stateLabel]}</p>}
        {eligible && <>
          <label htmlFor={termsId}><input id={termsId} type="checkbox" checked={terms} disabled={busy || Boolean(checkoutState)} onChange={event => setTerms(event.target.checked)} /> {P.termsReview}</label>
          <div><button type="button" className="btn" disabled={!terms || busy || loading || Boolean(checkoutState)} onClick={prepare}>{P.continueCheckout}</button></div>
        </>}
      </section>
    </>}
    <div className="btn-row">
      {orderId && <button type="button" className="btn-outline" disabled={busy || loading} onClick={() => refresh(orderId)}>{A.refresh}</button>}
      <a className="btn-ghost" href={`/${locale}/account`}>{A.title}</a>
      <a className="btn-ghost" href={`/${locale}/build`}>{P.configure}</a>
    </div>
  </div>;
}
