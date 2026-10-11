/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/**
 * Idempotency keys (APP-052). A key is bound to the subject, the operation and the hash of the
 * payload: the same key with the same payload returns the stored answer (never a second record);
 * the same key with a different payload is a conflict; a key whose first attempt is still running
 * answers 409 retryable. Validity: 7 days, like the intake.
 */
import { sha256, hashPayload } from "./ids";
import { ApiError, conflict } from "./errors";

const KEY_RE = /^[A-Za-z0-9._:-]{8,128}$/;

export function createIdempotency({ store, now = () => Date.now() }) {
  async function run({ subjectId, op, key, payload }, fn) {
    if (key === undefined || key === null || key === "") {
      // No key: the operation runs once; callers that must be idempotent require a key (router decides).
      return { response: await fn(), duplicate: false };
    }
    if (typeof key !== "string" || !KEY_RE.test(key)) throw new ApiError(400, "idempotency_key_invalid");
    const id = sha256(`${subjectId}|${op}|${key}`);
    const payloadHash = hashPayload(payload === undefined ? null : payload);
    const existing = await store.get("idem", id);
    if (existing) {
      if (existing.doc.payloadHash !== payloadHash) throw conflict("idempotency_conflict");
      if (existing.doc.status === "in_progress") throw new ApiError(409, "idempotency_in_progress", { retryable: true, headers: { "Retry-After": "2" } });
      return { response: existing.doc.response, duplicate: true };
    }
    const at = now();
    try {
      await store.commit({ writes: [{ type: "idem", id, doc: { id, subjectId, op, payloadHash, status: "in_progress", createdAt: new Date(at).toISOString(), response: null }, expectedVersion: -1 }], uniques: [{ name: "idem", value: id, owner: id }], indexes: [{ name: "idem:all", member: id, score: at }] });
    } catch (e) {
      if (e && (e.code === "version_conflict" || e.code === "unique_conflict")) throw new ApiError(409, "idempotency_in_progress", { retryable: true, headers: { "Retry-After": "2" } });
      throw e;
    }
    let response;
    try {
      response = await fn();
    } catch (e) {
      const rec = await store.get("idem", id);
      if (rec) await store.commit({ deletes: [{ type: "idem", id }], unindexes: [{ name: "idem:all", member: id }] }).catch(() => {});
      await store.releaseUnique("idem", id).catch(() => {});
      throw e;
    }
    const rec = await store.get("idem", id);
    await store.commit({ writes: [{ type: "idem", id, doc: { ...rec.doc, status: "done", response, completedAt: new Date(now()).toISOString() }, expectedVersion: rec.version }] });
    return { response, duplicate: false };
  }
  return { run };
}
