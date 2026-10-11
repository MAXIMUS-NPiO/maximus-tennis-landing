/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/**
 * Append-only audit trail (APP-057). Every event names the actor, the action, the object, the
 * reason, the correlation ID and the versions before and after. Passwords, PAN, tokens and
 * surplus personal data never enter an audit record: callers pass identifiers and codes only.
 * Records are written inside the same commit as the change they describe (`auditWrites`), so a
 * change without its audit line cannot exist.
 */
import { newId } from "./ids";

const FORBIDDEN_KEYS = /^(password|pass|token|secret|pan|cvv|card|authorization|cookie|refresh|access)/i;

function scrub(meta) {
  if (!meta || typeof meta !== "object") return undefined;
  const out = {};
  for (const [k, v] of Object.entries(meta)) {
    if (FORBIDDEN_KEYS.test(k)) continue;
    if (v === undefined || v === null) continue;
    out[k] = typeof v === "object" ? scrub(v) : typeof v === "string" ? v.slice(0, 200) : v;
  }
  return out;
}

/** Builds the write + index entries for one audit event, to be merged into a commit. */
export function auditWrites({ now, actor, action, objectType, objectId, reason, correlationId, beforeVersion, afterVersion, meta }) {
  const id = newId("aud");
  const doc = {
    id,
    at: new Date(now).toISOString(),
    actorUserId: actor && actor.userId ? actor.userId : null,
    actorKind: actor && actor.kind ? actor.kind : actor && actor.userId ? "user" : "system",
    actorRoles: actor && actor.roles ? actor.roles : undefined,
    action,
    objectType,
    objectId,
    reason: reason ? String(reason).slice(0, 500) : undefined,
    correlationId: correlationId || undefined,
    beforeVersion: beforeVersion ?? undefined,
    afterVersion: afterVersion ?? undefined,
    meta: scrub(meta),
  };
  return {
    writes: [{ type: "audit", id, doc, expectedVersion: -1 }],
    indexes: [
      { name: `audit:${objectType}:${objectId}`, member: id, score: now },
      { name: "audit:all", member: id, score: now },
      ...(doc.actorUserId ? [{ name: `audit:actor:${doc.actorUserId}`, member: id, score: now }] : []),
    ],
  };
}

export function mergeCommits(...parts) {
  const out = { writes: [], uniques: [], indexes: [], unindexes: [], deletes: [] };
  for (const p of parts) {
    if (!p) continue;
    for (const k of Object.keys(out)) if (p[k]) out[k].push(...p[k]);
  }
  return out;
}

export async function listAudit(store, { objectType, objectId, actorUserId, limit = 50, offset = 0 }) {
  const name = objectType && objectId ? `audit:${objectType}:${objectId}` : actorUserId ? `audit:actor:${actorUserId}` : "audit:all";
  const ids = await store.listIndex(name, { limit, offset });
  const rows = await store.getMany("audit", ids);
  return rows.map((r) => r.doc);
}
