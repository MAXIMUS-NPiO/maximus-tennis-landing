/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { accountRequest, accountErrorText } from './CustomerAccount';
import { accountLabels } from '../content/account';
import { forumCopy } from '../content/forum-copy';
import LeadForm from './LeadForm';

const API = '/api/accounts/forum';
function formDictionary(dict, F) {
  return { ...dict, common: { ...dict.common, truth: { ...dict.common.truth, requestNotOrder: F.proposal } },
    form: { ...dict.form, purposes: { ...dict.form.purposes, forum: F.title }, forumInterests: F.interests, hostingOptions: F.hostingOptions,
      fields: { ...dict.form.fields, ...Object.fromEntries(['residenceCity','country','preferredMeetingCity','travelCities','attendees','organisation','role','forumInterests','hosting','consent'].map(k => [k,F[k]])) } },
    lead: { ...dict.lead, acceptedTitle: F.saved, acceptedNext: F.proposal, after: F.proposal, consentShort: F.consent },
  };
}
function date(value, locale) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(time) : '';
}

/** Private data stays in memory and is cleared before rechecking the session. The server scopes
 * every read/mutation; account identity, CSRF and persisted application IDs are never invented. */
export default function ForumDashboard({ locale, dict }) {
  const F = forumCopy(locale), A = accountLabels[locale];
  const [session, setSession] = useState(null), [state, setState] = useState('loading');
  const [items, setItems] = useState([]), [nextOffset, setNextOffset] = useState(null);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [drafts, setDrafts] = useState({});
  const generation = useRef(0), controller = useRef(null), retries = useRef(new Map()), mutationBusy = useRef(false);
  const clear = () => { setSession(null); setItems([]); setNextOffset(null); setDrafts({}); retries.current.clear(); mutationBusy.current = false; setBusy(false); };
  const refresh = useCallback(async () => {
    const seq = ++generation.current;
    controller.current?.abort(); const control = new AbortController(); controller.current = control;
    clear(); setState('loading'); setError('');
    try {
      const auth = await accountRequest('/api/accounts/session', { signal: control.signal });
      if (seq !== generation.current || control.signal.aborted) return;
      if (!auth.user?.id || !auth.user.emailVerified || typeof auth.csrfToken !== 'string') { setState('verify'); return; }
      const data = await accountRequest(API, { signal: control.signal });
      if (seq !== generation.current || control.signal.aborted) return;
      if (data.viewerUserId !== auth.user.id) { clear(); setState('guest'); setError(F.failure); return; }
      if (!Array.isArray(data.items)) throw new Error('invalid_response');
      setSession(auth); setItems(data.items); setNextOffset(data.nextOffset); setState('ready');
    } catch (failure) {
      if (seq !== generation.current || control.signal.aborted) return;
      setState(failure.status === 401 ? 'guest' : 'unavailable');
      if (failure.status !== 401) setError(accountErrorText(failure, A));
    }
  }, [A]);
  useEffect(() => {
    refresh();
    const focus = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', focus);
    window.addEventListener('focus', focus);
    return () => { generation.current++; controller.current?.abort(); document.removeEventListener('visibilitychange', focus); window.removeEventListener('focus', focus); };
  }, [refresh]);
  async function reloadList(offset = 0) {
    const seq = generation.current;
    try {
      const data = await accountRequest(`${API}?offset=${offset}`, { signal: controller.current?.signal });
      if (seq !== generation.current) return;
      if (data.viewerUserId !== session?.user.id) { generation.current++; controller.current?.abort(); clear(); setState('guest'); setError(F.failure); return; }
      if (!Array.isArray(data.items)) throw new Error('invalid_response');
      setItems(old => offset ? [...old, ...data.items] : data.items); setNextOffset(data.nextOffset);
    } catch (failure) {
      if (seq !== generation.current) return;
      if (failure.status === 401 || failure.status === 403) { clear(); setState('guest'); }
      setError(accountErrorText(failure, A));
    }
  }
  async function mutate(application, action, body) {
    if (!session || mutationBusy.current) return;
    mutationBusy.current = true; setBusy(true); setError('');
    const seq = generation.current, signature = JSON.stringify([application.id, action, body]);
    if (!retries.current.has(signature)) retries.current.set(signature, crypto.randomUUID());
    try {
      const data = await accountRequest(`${API}/${application.id}/${action}`, { method: 'POST', csrfToken: session.csrfToken,
        signal: controller.current?.signal, body: { ...body, idempotencyKey: retries.current.get(signature) } });
      if (seq !== generation.current) return;
      if (data.application?.id !== application.id) throw new Error('invalid_response');
      if (data.viewerUserId !== session.user.id) { generation.current++; controller.current?.abort(); clear(); setState('guest'); setError(F.failure); return; }
      setItems(old => old.map(row => row.id === application.id ? data.application : row));
      if (action === 'messages') setDrafts(old => ({ ...old, [application.id]: '' }));
      retries.current.delete(signature);
    } catch (failure) {
      if (seq !== generation.current) return;
      if ([401, 403].includes(failure.status)) { clear(); setState('guest'); }
      setError(accountErrorText(failure, A));
    } finally { if (seq === generation.current) { mutationBusy.current = false; setBusy(false); } }
  }
  if (state === 'loading') return <p role="status" aria-busy="true">{F.dashboard}…</p>;
  if (state !== 'ready') return <div className="stack" data-forum-state={state}>
    <p>{F.accountRequired}</p>{state === 'verify' && <p>{A.checkEmail}</p>}
    {error && <p role="alert">{error}</p>}
    <div className="btn-row"><a className="btn" href={`/${locale}/account`}>{A.login}</a><button className="btn-outline" onClick={refresh}>{dict.lead.retry}</button></div>
  </div>;
  const fieldLabel = key => F[key] || dict.form.fields[key] || key;
  const valueText = (key, value) => Array.isArray(value) ? value.map(v => (key === 'forumInterests' ? F.interests : F.hostingOptions)[v] || v).join(', ') : String(value);
  return <div className="stack-lg" data-forum-state="ready">
    <p>{F.accountRequired} <bdi>{session.user.email}</bdi></p>
    {error && <p role="alert" className="note">{error}</p>}
    <section className="stack" aria-labelledby="forum-applications"><h2 className="h-3" id="forum-applications">{F.applications}</h2>
      {!items.length && <p>{F.noApplications}</p>}
      {items.map(application => <article className="card stack-lg" key={application.id} data-forum-application={application.id}>
        <div><h3 className="h-3">{application.reference}</h3><p className="status">{F.statuses[application.status] || dict.common.labels.notProvided}</p></div>
        <details><summary>{F.applicationDetails}</summary><dl className="cfg-summary">
          {Object.entries({ ...application.contact, ...application.details }).filter(([,v]) => v !== undefined && v !== '' && (!Array.isArray(v) || v.length)).map(([key,value]) => <div key={key}><dt>{fieldLabel(key)}</dt><dd style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{valueText(key,value)}</dd></div>)}
        </dl></details>
        <section className="stack"><h4>{F.history}</h4><ol>{application.history.map((event,i) => <li key={i}><time dateTime={event.at}>{date(event.at,locale)}</time> — {event.kind === 'message' ? F.correspondence : F.statuses[event.status] || dict.common.labels.notProvided}</li>)}</ol></section>
        <section className="stack"><h4>{F.correspondence}</h4>
          {!application.messages.length && <p>{F.noMessages}</p>}
          {application.messages.map(message => <div className="note" key={message.id}><time dateTime={message.at}>{date(message.at,locale)}</time><p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{message.body}</p></div>)}
          <form className="form" onSubmit={e => { e.preventDefault(); mutate(application,'messages',{message:drafts[application.id] || ''}); }}>
            <div className="field"><label htmlFor={`message-${application.id}`}>{F.message}</label><textarea id={`message-${application.id}`} required maxLength={4000} value={drafts[application.id] || ''} onChange={e => setDrafts(old => ({...old,[application.id]:e.target.value}))} /></div>
            <button className="btn-outline" disabled={busy} type="submit">{F.sendMessage}</button>
          </form>
        </section>
        <section className="stack"><h4>{F.invitation}</h4>
          {application.invitation?.status === 'issued' ? <><p>{application.invitation.subject}</p><p style={{ whiteSpace:'pre-wrap' }}>{application.invitation.body}</p>
            {application.attendance?.invitationId === application.invitation.id && application.attendance?.invitationVersion === application.invitation.version ? <p>{F.attendanceConfirmed}</p> : <button className="btn-outline" disabled={busy} onClick={() => mutate(application,'attendance',{invitationId:application.invitation.id,invitationVersion:application.invitation.version})}>{F.confirmAttendance}</button>}
          </> : <p>{F.noInvitation}</p>}
        </section>
      </article>)}
      {nextOffset !== null && <button className="btn-outline" onClick={() => reloadList(nextOffset)}>{A.more || F.applications}</button>}
    </section>
    <section className="stack" aria-labelledby="forum-apply"><h2 className="h-3" id="forum-apply">{F.apply}</h2>
      <LeadForm key={session.user.id} dict={formDictionary(dict,F)} locale={locale} purpose="forum" endpoint={API}
        prefill={{email:session.user.email}} lockedFields={['email']} onAccepted={() => reloadList()} submitLabel={F.apply} />
    </section>
  </div>;
}
