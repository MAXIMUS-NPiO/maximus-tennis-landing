/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/** Private forum applications. Existing platform transactions + existing intake notification queue.
 * No event seeding, payments, marketing enrollment, client-supplied ownership or memory runtime.
 */
import { ORGANIZATION } from '../platform/access';
import { newId, newNumber, sha256, canonical } from '../platform/ids';
import { auditWrites, mergeCommits } from '../platform/audit';
import { badRequest, conflict, forbidden, notFound, unavailable, validationError, tooMany } from '../platform/errors';
import { validateRequest, IDEMPOTENCY_RE } from '../intake/schema';
import { afterAccept } from '../intake/service';

const PROJECT = 'tennis';
const PENDING = 'forum:notify:pending';
const ID_RE = /^frm_[0-9A-HJKMNP-TV-Z]{20}$/;
const clone = value => JSON.parse(JSON.stringify(value));
const scope = (doc, customer) => doc?.organizationId === ORGANIZATION && doc.projectId === PROJECT && doc.ownerUserId === customer.userId;
const ownerIndex = userId => `forum:applications:${ORGANIZATION}:${PROJECT}:${userId}`;
const cleanMessage = value => typeof value === 'string' && value.trim() && value.trim().length <= 4000 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value) ? value.trim() : null;
const pick = (value, keys) => Object.fromEntries(keys.filter(key => value?.[key] !== undefined).map(key => [key, value[key]]));

/** Explicit participant projection; operational/internal notes never leave the server. */
export function publicApplication(doc) {
  const invitation = doc.invitation && ['issued', 'revoked'].includes(doc.invitation.status) ? {
    id: doc.invitation.id, version: doc.invitation.version, status: doc.invitation.status,
    subject: doc.invitation.subject, body: doc.invitation.body, issuedAt: doc.invitation.issuedAt,
    expiresAt: doc.invitation.expiresAt || null,
  } : null;
  return clone({ id: doc.id, reference: doc.reference, createdAt: doc.createdAt, updatedAt: doc.updatedAt,
    contact: pick(doc.contact, ['name','email','role','country','organisation','message']),
    details: pick(doc.details, ['residenceCity','preferredMeetingCity','travelCities','attendees','forumInterests','hosting']), status: doc.status,
    history: (doc.history || []).map(({ at, kind, status }) => ({ at, kind, ...(status ? { status } : {}) })),
    messages: (doc.messages || []).filter(m => ['participant', 'coordinator'].includes(m.author) && m.visibility === 'participant')
      .map(({ id, at, author, body }) => ({ id, at, author, body })),
    invitation, attendance: doc.attendance ? { invitationId: doc.attendance.invitationId, invitationVersion: doc.attendance.invitationVersion, at: doc.attendance.at, attendees: doc.attendance.attendees } : null,
  });
}

export function createForumService({ store, intake, now = () => Date.now() }) {
  function requireCustomer(customer) {
    if (!customer?.userId || customer.organizationId !== ORGANIZATION || !customer.emailVerified || !customer.email) throw forbidden('email_verification_required');
  }
  async function owned(customer, id) {
    requireCustomer(customer);
    if (typeof id !== 'string' || !ID_RE.test(id)) throw notFound();
    const row = await store.get('forumApplication', id);
    if (!row || row.doc.id !== id || !scope(row.doc, customer)) throw notFound();
    return row;
  }
  function keyFor(customer, action, key, payload) {
    if (typeof key !== 'string' || !IDEMPOTENCY_RE.test(key)) throw badRequest('invalid_idempotency_key');
    return { id: sha256(`${ORGANIZATION}|${PROJECT}|${customer.userId}|${action}|${key}`), hash: sha256(canonical(payload)) };
  }
  async function existing(customer, key) {
    const prior = await store.get('forumIdempotency', key.id);
    if (!prior) return null;
    if (!scope(prior.doc, customer) || prior.doc.hash !== key.hash) throw conflict('idempotency_conflict');
    const row = await owned(customer, prior.doc.applicationId);
    return publicApplication(row.doc);
  }
  function mutation(customer, key, doc, expectedVersion, action, notification) {
    const at = now();
    const tenant = { organizationId: ORGANIZATION, projectId: PROJECT, ownerUserId: customer.userId };
    const part = {
      writes: [
        { type: 'forumApplication', id: doc.id, doc, expectedVersion },
        { type: 'forumIdempotency', id: key.id, doc: { ...tenant, hash: key.hash, applicationId: doc.id }, expectedVersion: -1 },
      ],
      indexes: [{ name: ownerIndex(customer.userId), member: doc.id, score: Date.parse(doc.createdAt) }],
    };
    if (notification) {
      const id = `fnt_${key.id}`;
      part.writes.push({ type: 'forumNotification', id, expectedVersion: -1, doc: {
        ...tenant, id, applicationId: doc.id, state: 'pending', createdAt: new Date(at).toISOString(),
        record: { schema: 1, request_id: newNumber('FOR', new Date(at)), created_at: new Date(at).toISOString(),
          purpose: 'forum', locale: doc.locale, contact: { ...doc.contact, message: notification }, details: doc.details,
          context: { page: `/${doc.locale}/forum`, forumApplicationId: doc.id, applicationReference: doc.reference },
          consent: { answer_request: true, marketing: false, text_version: 'forum-2026-10-13' }, payload_hash: key.hash },
      } });
      part.indexes.push({ name: PENDING, member: id, score: at });
    }
    return mergeCommits(part, auditWrites({ now: at, actor: { userId: customer.userId }, action, objectType: 'forumApplication', objectId: doc.id, beforeVersion: expectedVersion < 0 ? undefined : expectedVersion, afterVersion: expectedVersion < 0 ? 1 : expectedVersion + 1 }));
  }
  async function commit(customer, key, change, doc) {
    const count = await store.counter(`forum:${sha256(customer.userId)}:${Math.floor(now() / 600000)}`, 600);
    if (count > 30) throw tooMany(600);
    try { await store.commit(change); }
    catch (err) {
      if (['version_conflict', 'unique_conflict'].includes(err?.code)) {
        const duplicate = await existing(customer, key);
        if (duplicate) return { application: duplicate, duplicate: true };
      }
      throw err;
    }
    return { application: publicApplication(doc), duplicate: false };
  }
  async function create(customer, payload) {
    requireCustomer(customer);
    if (payload?.purpose !== 'forum') throw badRequest('invalid_purpose');
    if (payload.hp || !Number.isFinite(payload.elapsedMs) || payload.elapsedMs < 1500) throw badRequest('invalid_submission');
    const parsed = validateRequest(payload);
    if (!parsed.ok) throw validationError(parsed.errors);
    if (parsed.value.contact.email.toLowerCase() !== customer.email.toLowerCase()) throw validationError({ email: 'invalid' });
    const value = parsed.value;
    value.contact.email = customer.email;
    const key = keyFor(customer, 'create', payload.idempotencyKey, value);
    const duplicate = await existing(customer, key);
    if (duplicate) return { application: duplicate, duplicate: true };
    const at = new Date(now()).toISOString();
    const doc = { id: newId('frm'), reference: newNumber('FOR', new Date(now())), organizationId: ORGANIZATION, projectId: PROJECT,
      ownerUserId: customer.userId, locale: value.locale, contact: value.contact, details: value.details, createdAt: at, updatedAt: at,
      status: 'submitted', consent: { answer_request: true, marketing: false, text_version: 'forum-2026-10-13' },
      history: [{ at, kind: 'status', status: 'submitted' }], messages: [], invitation: null, attendance: null };
    return commit(customer, key, mutation(customer, key, doc, -1, 'forum.submitted', `Forum expression of interest ${doc.reference}. No event booking or ticket.\n${value.contact.message || ''}`), doc);
  }
  async function list(customer, offset = 0) {
    requireCustomer(customer);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000) throw badRequest('invalid_pagination');
    const ids = await store.listIndex(ownerIndex(customer.userId), { limit: 21, offset });
    const rows = await store.getMany('forumApplication', ids);
    if (rows.length !== ids.length || rows.some(row => !scope(row.doc, customer))) throw unavailable('forum_index_invalid');
    return { items: rows.slice(0, 20).map(({ doc }) => publicApplication(doc)), nextOffset: rows.length > 20 ? offset + 20 : null };
  }
  async function get(customer, id) { return { application: publicApplication((await owned(customer, id)).doc) }; }
  async function message(customer, id, body) {
    const row = await owned(customer, id);
    const text = cleanMessage(body?.message);
    if (!text) throw validationError({ message: 'invalid' });
    const key = keyFor(customer, `message:${id}`, body.idempotencyKey, { message: text });
    const duplicate = await existing(customer, key);
    if (duplicate) return { application: duplicate, duplicate: true };
    if (row.doc.messages.length >= 100 || row.doc.history.length >= 200) throw conflict('correspondence_limit');
    const at = new Date(now()).toISOString();
    const doc = { ...row.doc, updatedAt: at, messages: [...row.doc.messages, { id: newId('fms'), at, author: 'participant', visibility: 'participant', body: text }], history: [...row.doc.history, { at, kind: 'message' }] };
    return commit(customer, key, mutation(customer, key, doc, row.version, 'forum.message_submitted', `${doc.reference}: participant correspondence\n${text}`), doc);
  }
  async function attendance(customer, id, body) {
    const row = await owned(customer, id);
    const key = keyFor(customer, `attendance:${id}`, body?.idempotencyKey, { invitationId: body?.invitationId, invitationVersion: body?.invitationVersion });
    const duplicate = await existing(customer, key);
    if (duplicate) return { application: duplicate, duplicate: true };
    const inv = row.doc.invitation;
    const expiration = inv?.expiresAt ? Date.parse(inv.expiresAt) : null;
    if (!inv || row.doc.status !== 'invited' || inv.status !== 'issued' || inv.id !== body.invitationId || !Number.isSafeInteger(inv.version) || inv.version < 1 || inv.version !== body.invitationVersion || (expiration !== null && (!Number.isFinite(expiration) || expiration <= now()))) throw conflict('invitation_not_active');
    if (row.doc.history.length >= 200) throw conflict('history_limit');
    const at = new Date(now()).toISOString();
    const doc = { ...row.doc, status: 'attendance_confirmed', updatedAt: at,
      attendance: { invitationId: inv.id, invitationVersion: inv.version, at, attendees: row.doc.details.attendees },
      history: [...row.doc.history, { at, kind: 'status', status: 'attendance_confirmed' }] };
    return commit(customer, key, mutation(customer, key, doc, row.version, 'forum.attendance_confirmed', `${doc.reference}: attendance confirmed for existing invitation ${inv.id}, version ${inv.version}.`), doc);
  }
  /** Transfer pending notifications idempotently to the approved intake queue. "Queued" never means delivered. */
  async function flushNotifications({ limit = 1, deliverNow = false } = {}) {
    if (!intake?.store || !intake.notifier) return { transferred: 0, unavailable: true };
    const ids = await store.listIndex(PENDING, { limit, reverse: false });
    let transferred = 0;
    for (const id of ids) {
      const row = await store.get('forumNotification', id);
      if (!row || row.doc.organizationId !== ORGANIZATION || row.doc.projectId !== PROJECT || row.doc.state !== 'pending') continue;
      const parent = await store.get('forumApplication', row.doc.applicationId);
      if (!parent || parent.doc.ownerUserId !== row.doc.ownerUserId || parent.doc.organizationId !== ORGANIZATION || parent.doc.projectId !== PROJECT) continue;
      const queued = await intake.store.createLead({ idemHash: sha256(`forum-notification|${id}`), requestId: row.doc.record.request_id, record: row.doc.record, persistentIdempotency: true });
      await store.commit({ writes: [{ type: 'forumNotification', id, expectedVersion: row.version, doc: { ...row.doc, state: 'transferred', leadId: queued.requestId } }], unindexes: [{ name: PENDING, member: id }] });
      transferred++;
      if (deliverNow) await afterAccept(intake, queued.requestId, queued.created, { quickRetryMs: 0 });
    }
    return { transferred };
  }
  return { create, list, get, message, attendance, flushNotifications };
}
