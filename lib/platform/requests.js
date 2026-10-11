/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/**
 * Requests (applications, clarifications, change requests) with status events and responses —
 * SERVER ONLY (APP-044, APP-048, APP-049, baseline section 11).
 *
 * Types: equity_interest · ambassador · dealer · distributor · national_distributor (country
 * mandatory) · manufacturing_confirmation · quote_request · change_request · clarification ·
 * support. A request is a record under review. It never grants a share, a territory, a
 * commission, exclusivity, an appointment or any right: approval is a staff decision recorded with
 * actor, reason and version, and still grants nothing by itself.
 *
 * A request ID is returned only after the record is written. Notification of the responsible
 * person goes through the already authorised intake channel; its delivery status is kept apart
 * from the record, and a failed notification never loses a request.
 */
import { newId, newNumber } from "./ids";
import { ApiError, notFound, forbidden, conflict, validationError } from "./errors";
import { validate, text, textarea, oneOf, bool, country, any } from "./validate";
import { parseAmount, out } from "./money";
import { auditWrites, mergeCommits } from "./audit";

export const REQUEST_TYPES = ["equity_interest", "ambassador", "dealer", "distributor", "national_distributor", "manufacturing_confirmation", "quote_request", "funding_interest", "change_request", "clarification", "support"];
export const PUBLIC_REQUEST_TYPES = ["equity_interest", "ambassador", "dealer", "distributor", "national_distributor", "change_request", "clarification", "support"];
export const REQUEST_STATUS = ["draft", "submitted", "under_review", "information_requested", "approved", "declined", "withdrawn"];
export const CURRENCIES = ["EUR", "USD", "AED", "GBP", "CHF"];

const CODES = { equity_interest: "EQI", ambassador: "AMB", dealer: "DLR", distributor: "DSB", national_distributor: "NDS", manufacturing_confirmation: "MFC", quote_request: "QTR", funding_interest: "FND", change_request: "CHG", clarification: "CLR", support: "SUP" };

const FIELDS = {
  equity_interest: {
    company: text(200), companyUnknown: bool(), jurisdiction: text(100), amount: text(40, { required: true }), currency: oneOf(CURRENCIES, { required: true }),
    desiredRole: text(120), market: text(120), message: textarea(4000),
  },
  ambassador: { country: country({ required: true }), profile: text(300, { required: true }), audience: text(300), experience: textarea(2000, { required: true }), links: textarea(1000) },
  dealer: { organisation: text(160, { required: true }), territory: text(200, { required: true }), channels: textarea(2000), experience: textarea(2000, { required: true }), links: textarea(1000) },
  distributor: { organisation: text(160, { required: true }), territory: text(200, { required: true }), network: textarea(2000, { required: true }), logistics: textarea(2000), experience: textarea(2000) },
  national_distributor: { organisation: text(160, { required: true }), country: country({ required: true }), capabilities: textarea(2000, { required: true }), experience: textarea(2000) },
  change_request: { orderId: text(40, { required: true }), configurationId: text(40), description: textarea(4000, { required: true }), newFields: any() },
  clarification: { subject: text(200, { required: true }), message: textarea(4000, { required: true }), relatedId: text(40) },
  support: { subject: text(200, { required: true }), message: textarea(4000, { required: true }), relatedId: text(40) },
  manufacturing_confirmation: { configurationId: text(40, { required: true }), revisionId: text(40, { required: true }), reviewId: text(40, { required: true }), customRequest: bool() },
  quote_request: { quoteId: text(40, { required: true }), reasons: any() },
  funding_interest: { quoteId: text(40, { required: true }), option: oneOf(["B", "C"], { required: true }), principalInput: text(40, { required: true }), principalCents: any(), gateReasons: any(), preliminary: bool() },
};

/** Allowed transitions: [from] → { to: who } — who is "customer", "staff:<capability>" or "system". */
const TRANSITIONS = {
  draft: { submitted: "customer", withdrawn: "customer" },
  submitted: { under_review: "staff:requests:transition", withdrawn: "customer", information_requested: "staff:requests:transition" },
  under_review: { information_requested: "staff:requests:transition", approved: "staff:requests:decide", declined: "staff:requests:decide", withdrawn: "customer" },
  information_requested: { under_review: "customer|staff:requests:transition", withdrawn: "customer", declined: "staff:requests:decide" },
  approved: {},
  declined: {},
  withdrawn: {},
};

export function createRequests({ store, access, mailer, adminNotifier = null, now = () => Date.now(), publicBaseUrl = "https://maximus.tennis" }) {
  const iso = (ms) => new Date(ms).toISOString();

  function resource(r) {
    return { kind: "request", ownerUserId: r.ownerUserId, profileId: r.profileId || undefined, readCapability: "requests:read", writeCapability: "requests:transition" };
  }

  function publicRequest(rec, events, responses) {
    const r = rec.doc;
    return { ...r, version: rec.version, events: events ? events.map(publicEvent) : undefined, responses: responses ? responses.map(publicResponse) : undefined };
  }
  const publicEvent = (e) => ({ id: e.id, from: e.from, to: e.to, at: e.at, actorKind: e.actorKind, reason: e.customerVisibleReason || null, nextAction: e.nextAction || null });
  const publicResponse = (x) => ({ id: x.id, authorKind: x.authorKind, text: x.text, at: x.at });

  function validateFields(type, input) {
    const spec = FIELDS[type];
    if (!spec) throw validationError({ type: "invalid_choice" });
    const r = validate(spec, input);
    if (!r.ok) throw validationError(r.errors);
    const v = r.value;
    const flags = {};
    if (type === "equity_interest") {
      const a = parseAmount(v.amount);
      if (!a.ok) {
        if (a.code === "unsafe_magnitude") {
          flags.amountManualReview = true;
          v.amountCents = null;
          v.amountExact = a.exact;
        } else throw validationError({ amount: a.code });
      } else v.amountCents = out(a.cents);
      if (!v.company || v.companyUnknown) {
        v.companyStatus = "requires_clarification";
        delete v.company;
      } else v.companyStatus = "stated";
      v.issuerAssigned = false;
      v.noValuationOrSharePromised = true;
    }
    if (["ambassador", "dealer", "distributor", "national_distributor"].includes(type)) {
      v.grantsNoAppointmentTerritoryOrExclusivity = true;
    }
    return { value: v, flags };
  }

  /** Creates a request as "submitted" (or "draft" when `draft` is true). Returns the public record with its number. */
  async function create(ctx, { type, fields, locale, profileId, draft = false, source }, { correlationId } = {}) {
    if (!REQUEST_TYPES.includes(type)) throw validationError({ type: "invalid_choice" });
    if (!ctx.emailVerified && !draft) throw forbidden("email_verification_required");
    const { value, flags } = validateFields(type, fields);
    if (profileId) {
      const controlled = await access.controlledProfileIds(ctx);
      if (!controlled.has(profileId)) throw notFound();
    }
    const at = now();
    const id = newId("req");
    const number = newNumber(CODES[type], new Date(at));
    const status = draft ? "draft" : "submitted";
    const doc = {
      id, number, type, status, ownerUserId: ctx.userId, profileId: profileId || null, fields: value, flags, locale: locale || ctx.locale, consentVersion: "2026-09-21",
      source: source || "cabinet", createdAt: iso(at), updatedAt: iso(at), submittedAt: draft ? null : iso(at), decidedAt: null, decisionReason: null, assigneeUserId: null,
      notification: { status: "pending", attempts: 0, lastError: null },
    };
    const ev = eventDoc({ requestId: id, from: null, to: status, actor: { userId: ctx.userId, kind: "customer" }, at, nextAction: draft ? "complete_and_submit" : "await_review" });
    await store.commit(mergeCommits(
      {
        writes: [{ type: "request", id, doc, expectedVersion: -1 }, ev.write],
        indexes: [{ name: `requests:user:${ctx.userId}`, member: id, score: at }, { name: "requests:all", member: id, score: at }, { name: `requests:status:${status}`, member: id, score: at }, { name: `requests:type:${type}`, member: id, score: at }, ev.index, ...(status === "submitted" ? [{ name: "admin:requests:new", member: id, score: at }] : [])],
      },
      auditWrites({ now: at, actor: { userId: ctx.userId }, action: "request.created", objectType: "request", objectId: id, correlationId, afterVersion: 1, meta: { type, status } })
    ));
    if (status === "submitted") await afterSubmit(doc, ctx);
    return { ...doc, version: 1 };
  }

  function eventDoc({ requestId, from, to, actor, at, reason, customerVisibleReason, nextAction }) {
    const id = newId("rqe");
    const doc = { id, requestId, from, to, at: iso(at), actorUserId: actor.userId || null, actorKind: actor.kind || "system", reason: reason ? String(reason).slice(0, 500) : null, customerVisibleReason: customerVisibleReason ? String(customerVisibleReason).slice(0, 500) : null, nextAction: nextAction || null };
    return { write: { type: "request_event", id, doc, expectedVersion: -1 }, index: { name: `request_events:${requestId}`, member: id, score: at } };
  }

  /** Notification after the record exists: customer confirmation + responsible person. Failures are recorded, nothing else changes. */
  async function afterSubmit(doc, ctx) {
    const link = `${publicBaseUrl}/${doc.locale}/account/requests?id=${doc.id}`;
    await mailer.send({ to: ctx.email, templateKey: "request_saved", locale: doc.locale, params: { number: doc.number, link }, dedupeKey: `request_saved:${doc.id}` }).catch(() => {});
    let result = { ok: false, errorCode: "not_configured" };
    if (adminNotifier) {
      try {
        result = await adminNotifier.send({ request_id: doc.number, created_at: doc.createdAt, purpose: doc.type, locale: doc.locale, contact: { email: ctx.email }, details: doc.fields, context: { platformRequestId: doc.id, source: doc.source }, attribution: {} });
      } catch (e) {
        result = { ok: false, errorCode: (e && e.code) || "notifier_error" };
      }
    }
    const rec = await store.get("request", doc.id);
    const notification = { status: result.ok ? "sent" : result.errorCode === "not_configured" ? "not_configured" : "failed", attempts: (rec.doc.notification.attempts || 0) + 1, lastError: result.ok ? null : result.errorCode, lastAttemptAt: iso(now()) };
    await store.commit({ writes: [{ type: "request", id: doc.id, doc: { ...rec.doc, notification }, expectedVersion: rec.version }], indexes: result.ok ? [] : [{ name: "admin:requests:notification_failed", member: doc.id, score: now() }], unindexes: result.ok ? [{ name: "admin:requests:notification_failed", member: doc.id }] : [] }).catch(() => {});
  }

  async function retryNotification(ctx, id) {
    access.requireCap(ctx, "requests:read");
    const rec = await store.get("request", id);
    if (!rec) throw notFound();
    const owner = await store.get("user", rec.doc.ownerUserId);
    await afterSubmit(rec.doc, { email: owner ? owner.doc.emailDisplay : "", userId: rec.doc.ownerUserId });
    return (await store.get("request", id)).doc.notification;
  }

  async function get(ctx, id) {
    const rec = await store.get("request", id);
    if (!rec) throw notFound();
    await access.authorize(ctx, resource(rec.doc), "read");
    const evIds = await store.listIndex(`request_events:${id}`, { limit: 100, reverse: false });
    const events = (await store.getMany("request_event", evIds)).map((r) => r.doc);
    const rsIds = await store.listIndex(`request_responses:${id}`, { limit: 200, reverse: false });
    const responses = (await store.getMany("request_response", rsIds)).map((r) => r.doc);
    return publicRequest(rec, events, responses);
  }

  async function list(ctx, { status, type, limit = 50, offset = 0 } = {}) {
    const ids = await store.listIndex(`requests:user:${ctx.userId}`, { limit: 500 });
    const rows = await store.getMany("request", ids);
    const items = rows.map((r) => publicRequest(r)).filter((r) => (!status || r.status === status) && (!type || r.type === type));
    return { items: items.slice(offset, offset + limit), total: items.length };
  }

  async function transition(ctx, id, { to, reason, customerVisibleReason, ifMatch }, { correlationId } = {}) {
    const rec = await store.get("request", id);
    if (!rec) throw notFound();
    const r = rec.doc;
    const isOwner = r.ownerUserId === ctx.userId;
    const rule = (TRANSITIONS[r.status] || {})[to];
    if (!rule) {
      if (!isOwner) await access.authorize(ctx, resource(r), "read");
      throw new ApiError(409, "transition_not_allowed", { details: { from: r.status, to } });
    }
    const who = rule.split("|");
    const allowedAsCustomer = who.includes("customer") && isOwner;
    const staffRule = who.find((w) => w.startsWith("staff:"));
    const allowedAsStaff = staffRule && access.can(ctx, staffRule.slice(6));
    if (!allowedAsCustomer && !allowedAsStaff) {
      if (!isOwner && !access.can(ctx, "requests:read")) throw notFound();
      throw forbidden("transition_not_permitted");
    }
    if (allowedAsStaff && !allowedAsCustomer && (!reason || String(reason).trim().length < 3)) throw validationError({ reason: "required" });
    if (ifMatch !== undefined && Number(ifMatch) !== rec.version) throw new ApiError(409, "version_conflict", { details: { server: publicRequest(rec) } });
    const at = now();
    const next = { ...r, status: to, updatedAt: iso(at), ...(to === "submitted" ? { submittedAt: iso(at) } : {}), ...(["approved", "declined"].includes(to) ? { decidedAt: iso(at), decisionReason: String(reason || "").slice(0, 500), decidedByUserId: ctx.userId, grantsRights: false } : {}) };
    const ev = eventDoc({ requestId: id, from: r.status, to, actor: { userId: ctx.userId, kind: allowedAsCustomer ? "customer" : "staff" }, at, reason, customerVisibleReason, nextAction: to === "information_requested" ? "answer_in_cabinet" : to === "under_review" ? "await_review" : null });
    const final = ["approved", "declined", "withdrawn"].includes(to);
    await store.commit(mergeCommits(
      {
        writes: [{ type: "request", id, doc: next, expectedVersion: rec.version }, ev.write],
        indexes: [ev.index, { name: `requests:status:${to}`, member: id, score: at }, ...(to === "submitted" ? [{ name: "admin:requests:new", member: id, score: at }] : []), ...(to === "information_requested" ? [{ name: "admin:requests:awaiting_customer", member: id, score: at }] : [])],
        unindexes: [{ name: `requests:status:${r.status}`, member: id }, ...(r.status === "submitted" ? [{ name: "admin:requests:new", member: id }] : []), ...(r.status === "information_requested" ? [{ name: "admin:requests:awaiting_customer", member: id }] : [])],
      },
      auditWrites({ now: at, actor: { userId: ctx.userId, roles: ctx.opsRoles }, action: `request.${to}`, objectType: "request", objectId: id, reason, correlationId, beforeVersion: rec.version, afterVersion: rec.version + 1 })
    ));
    if (to === "submitted") await afterSubmit(next, { email: ctx.email, userId: ctx.userId });
    if (to === "information_requested" && !isOwner) {
      const owner = await store.get("user", r.ownerUserId);
      if (owner) await mailer.send({ to: owner.doc.emailDisplay, templateKey: "request_information_requested", locale: owner.doc.locale, params: { number: r.number, link: `${publicBaseUrl}/${owner.doc.locale}/account/requests?id=${id}` }, dedupeKey: `info:${id}:${at}` }).catch(() => {});
    }
    return { ...next, version: rec.version + 1, final };
  }

  async function respond(ctx, id, { text: body }, { correlationId } = {}) {
    const rec = await store.get("request", id);
    if (!rec) throw notFound();
    const isOwner = rec.doc.ownerUserId === ctx.userId;
    const isStaff = access.can(ctx, "requests:respond");
    if (!isOwner && !isStaff) throw notFound();
    const v = validate({ text: textarea(4000, { required: true }) }, { text: body });
    if (!v.ok) throw validationError(v.errors);
    if (["approved", "declined", "withdrawn"].includes(rec.doc.status)) throw conflict("request_closed");
    const at = now();
    const rid = newId("rsp");
    const doc = { id: rid, requestId: id, authorUserId: ctx.userId, authorKind: isOwner ? "customer" : "staff", text: v.value.text, at: iso(at) };
    await store.commit(mergeCommits({ writes: [{ type: "request_response", id: rid, doc, expectedVersion: -1 }], indexes: [{ name: `request_responses:${id}`, member: rid, score: at }] }, auditWrites({ now: at, actor: { userId: ctx.userId }, action: "request.response", objectType: "request", objectId: id, correlationId })));
    // A customer answer to a clarification moves the request back under review without a second step.
    if (isOwner && rec.doc.status === "information_requested") await transition(ctx, id, { to: "under_review" }, { correlationId });
    return doc;
  }

  async function updateDraft(ctx, id, { fields, ifMatch }, { correlationId } = {}) {
    const rec = await store.get("request", id);
    if (!rec || rec.doc.ownerUserId !== ctx.userId) throw notFound();
    if (rec.doc.status !== "draft") throw conflict("request_not_draft");
    if (ifMatch !== undefined && Number(ifMatch) !== rec.version) throw new ApiError(409, "version_conflict", { details: { server: publicRequest(rec) } });
    const { value, flags } = validateFields(rec.doc.type, fields);
    const at = now();
    const next = { ...rec.doc, fields: value, flags, updatedAt: iso(at) };
    await store.commit(mergeCommits({ writes: [{ type: "request", id, doc: next, expectedVersion: rec.version }] }, auditWrites({ now: at, actor: { userId: ctx.userId }, action: "request.draft_updated", objectType: "request", objectId: id, correlationId })));
    return { ...next, version: rec.version + 1 };
  }

  /* ------------------------------------------------------------ administration */

  async function adminList(ctx, { queue = "new", status, type, locale, country, assignee, limit = 50, offset = 0 } = {}) {
    access.requireCap(ctx, "requests:read");
    const name = queue === "new" ? "admin:requests:new" : queue === "awaiting_customer" ? "admin:requests:awaiting_customer" : queue === "notification_failed" ? "admin:requests:notification_failed" : status ? `requests:status:${status}` : type ? `requests:type:${type}` : "requests:all";
    const ids = await store.listIndex(name, { limit: Math.min(limit, 100) + offset, reverse: false });
    const rows = await store.getMany("request", ids);
    const items = rows.map((r) => publicRequest(r)).filter((r) => (!locale || r.locale === locale) && (!country || (r.fields.country || "") === country) && (!assignee || r.assigneeUserId === assignee) && (!type || r.type === type) && (!status || r.status === status));
    return { items: items.slice(offset, offset + limit), total: items.length, queue: name };
  }

  async function assign(ctx, id, { assigneeUserId, reason }, { correlationId } = {}) {
    access.requireCap(ctx, "requests:transition");
    const rec = await store.get("request", id);
    if (!rec) throw notFound();
    const at = now();
    await store.commit(mergeCommits({ writes: [{ type: "request", id, doc: { ...rec.doc, assigneeUserId: assigneeUserId || null, updatedAt: iso(at) }, expectedVersion: rec.version }] }, auditWrites({ now: at, actor: { userId: ctx.userId, roles: ctx.opsRoles }, action: "request.assigned", objectType: "request", objectId: id, reason, correlationId, meta: { assigneeUserId } })));
    return { assigned: true };
  }

  return { REQUEST_TYPES, PUBLIC_REQUEST_TYPES, create, get, list, transition, respond, updateDraft, retryNotification, adminList, assign, resource };
}
