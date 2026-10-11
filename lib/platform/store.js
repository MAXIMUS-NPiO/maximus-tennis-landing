/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/**
 * Platform document store — SERVER ONLY.
 *
 * One abstraction for every account / order / document record of the platform, with the four
 * guarantees the specification asks of a transactional store (APP-008, APP-052):
 *
 *   1. atomic multi-record commits (all writes of a commit are applied or none);
 *   2. optimistic concurrency (every document carries a version; a write names the version it
 *      expects and fails with `version_conflict` otherwise — the basis of ETag / If-Match);
 *   3. unique constraints (`uniques`: e-mail, idempotency keys, provider event IDs, bank
 *      references, ledger linkage) that are claimed inside the same commit;
 *   4. ordered indexes (sorted sets) for listing and pagination.
 *
 * Adapters: `createMemoryStore()` for tests, `createUpstashStore()` for the Upstash Redis REST
 * protocol already authorised for this project (the Lua script below makes a commit atomic on the
 * server). The existing lead intake keeps its own keys (mx:*); the platform uses the prefix mxp:.
 *
 * PostgreSQL remains the recommended long-term store (db/migrations); the same interface is
 * implemented there without changing the services. Nothing here logs record content.
 */

export class StoreError extends Error {
  constructor(code, message, details) {
    super(message || code);
    this.code = code;
    if (details) this.details = details;
  }
}

export class ConflictError extends StoreError {
  constructor(code, details) {
    super(code, code, details);
  }
}

const PREFIX = "mxp";
export const keys = {
  doc: (type, id) => `${PREFIX}:doc:${type}:${id}`,
  ver: (type, id) => `${PREFIX}:ver:${type}:${id}`,
  uniq: (name, value) => `${PREFIX}:uniq:${name}:${value}`,
  idx: (name) => `${PREFIX}:idx:${name}`,
  counter: (name) => `${PREFIX}:ctr:${name}`,
  lock: (name) => `${PREFIX}:lock:${name}`,
  blob: (id) => `${PREFIX}:blob:${id}`,
};

/**
 * Commit script. Flat argument layout (no cjson dependency):
 *   ARGV[1] = number of writes W; then W × [verKey, docKey, expected, json]
 *     expected: "" = no check, "-1" = must not exist, "n" = must currently be version n
 *   next = number of uniques U; then U × [uniqKey, owner]  — fails if the key exists with another owner
 *   next = number of index adds I; then I × [idxKey, score, member]
 *   next = number of index removals R; then R × [idxKey, member]
 *   next = number of deletions D; then D × [verKey, docKey]
 * Returns {1, v1, v2, …} with the new versions, or {0, code, key}.
 */
const COMMIT_SCRIPT = `
local i = 1
local W = tonumber(ARGV[i]); i = i + 1
local writes = {}
local function checktype(key, wanted)
  local t = redis.call('TYPE', key)
  if type(t) == 'table' then t = t.ok end
  return t == 'none' or t == wanted
end
for w = 1, W do
  local verKey, docKey, expected, json = ARGV[i], ARGV[i+1], ARGV[i+2], ARGV[i+3]
  i = i + 4
  if not checktype(verKey, 'string') or not checktype(docKey, 'string') then return {0, 'store_wrong_type', verKey} end
  local cur = redis.call('GET', verKey)
  if cur and (not tonumber(cur) or tonumber(cur) < 1 or tonumber(cur) % 1 ~= 0) then return {0, 'store_bad_version', verKey} end
  if expected == '-1' then
    if cur then return {0, 'version_conflict', verKey} end
  elseif expected ~= '' then
    if not cur or cur ~= expected then return {0, 'version_conflict', verKey} end
  end
  writes[#writes+1] = {verKey, docKey, json, cur}
end
local U = tonumber(ARGV[i]); i = i + 1
local uniques = {}
local owners = {}
for u = 1, U do
  local key, owner = ARGV[i], ARGV[i+1]
  i = i + 2
  if not checktype(key, 'string') then return {0, 'store_wrong_type', key} end
  if owners[key] and owners[key] ~= owner then return {0, 'unique_conflict', key} end
  owners[key] = owner
  local cur = redis.call('GET', key)
  if cur and cur ~= owner then return {0, 'unique_conflict', key} end
  uniques[#uniques+1] = {key, owner}
end
local I = tonumber(ARGV[i]); i = i + 1
local adds = {}
for a = 1, I do
  local score = tonumber(ARGV[i+1])
  if not score or score ~= score or score == math.huge or score == -math.huge or not checktype(ARGV[i], 'zset') then return {0, 'store_bad_index', ARGV[i]} end
  adds[#adds+1] = {ARGV[i], ARGV[i+1], ARGV[i+2]}
  i = i + 3
end
local R = tonumber(ARGV[i]); i = i + 1
local rems = {}
for r = 1, R do
  if not checktype(ARGV[i], 'zset') then return {0, 'store_wrong_type', ARGV[i]} end
  rems[#rems+1] = {ARGV[i], ARGV[i+1]}
  i = i + 2
end
local D = tonumber(ARGV[i]); i = i + 1
local dels = {}
for d = 1, D do
  dels[#dels+1] = {ARGV[i], ARGV[i+1]}
  i = i + 2
end
local out = {1}
for _, w in ipairs(writes) do
  local nextV = (tonumber(w[4]) or 0) + 1
  redis.call('SET', w[1], tostring(nextV))
  redis.call('SET', w[2], w[3])
  out[#out+1] = nextV
end
for _, u in ipairs(uniques) do redis.call('SET', u[1], u[2]) end
for _, a in ipairs(adds) do redis.call('ZADD', a[1], a[2], a[3]) end
for _, r in ipairs(rems) do redis.call('ZREM', r[1], r[2]) end
for _, d in ipairs(dels) do redis.call('DEL', d[1]); redis.call('DEL', d[2]) end
return out
`;

function normaliseCommit(c) {
  const writes = (c.writes || []).map((w) => {
    if (!w.type || !w.id) throw new StoreError("bad_write", "type and id are required");
    const expected = w.expectedVersion === undefined || w.expectedVersion === null ? "" : String(w.expectedVersion);
    if (expected !== "" && !/^(?:-1|[1-9]\d*)$/.test(expected)) throw new StoreError("bad_version");
    const json = JSON.stringify(w.doc);
    if (json === undefined) throw new StoreError("bad_document");
    return { type: w.type, id: w.id, expected, json };
  });
  const uniques = (c.uniques || []).map((u) => ({ name: u.name, value: String(u.value), owner: String(u.owner) }));
  const indexes = (c.indexes || []).map((x) => ({ name: x.name, score: Number(x.score ?? Date.now()), member: String(x.member) }));
  const unindexes = (c.unindexes || []).map((x) => ({ name: x.name, member: String(x.member) }));
  const deletes = (c.deletes || []).map((d) => ({ type: d.type, id: d.id }));
  const seenWrites = new Set();
  for (const w of writes) {
    const k = keys.doc(w.type, w.id);
    if (seenWrites.has(k)) throw new StoreError("duplicate_write");
    seenWrites.add(k);
  }
  const seenUnique = new Map();
  for (const u of uniques) {
    const k = keys.uniq(u.name, u.value);
    if (seenUnique.has(k) && seenUnique.get(k) !== u.owner) throw new ConflictError("unique_conflict", { name: u.name });
    seenUnique.set(k, u.owner);
  }
  for (const x of indexes) if (!x.name || !Number.isFinite(x.score)) throw new StoreError("bad_index");
  for (const x of [...unindexes, ...deletes]) if (!(x.name || (x.type && x.id))) throw new StoreError("bad_operation");
  return { writes, uniques, indexes, unindexes, deletes };
}

/* ------------------------------------------------------------------ memory adapter */

export function createMemoryStore() {
  const docs = new Map(); // key -> { version, json }
  const uniq = new Map(); // key -> owner
  const idx = new Map(); // name -> Map(member -> score)
  const counters = new Map();
  const locks = new Map();
  const blobs = new Map();
  const zset = (name) => {
    if (!idx.has(name)) idx.set(name, new Map());
    return idx.get(name);
  };
  return {
    kind: "memory",
    failNextCommit: null,
    async ping() {
      return true;
    },
    async get(type, id) {
      const e = docs.get(keys.doc(type, id));
      return e ? { version: e.version, doc: JSON.parse(e.json) } : null;
    },
    async getMany(type, ids) {
      const out = [];
      for (const id of ids) {
        const e = docs.get(keys.doc(type, id));
        if (e) out.push({ id, version: e.version, doc: JSON.parse(e.json) });
      }
      return out;
    },
    async commit(c) {
      if (this.failNextCommit) {
        const code = this.failNextCommit;
        this.failNextCommit = null;
        throw new StoreError(code);
      }
      const n = normaliseCommit(c);
      // validate everything first, apply nothing before the whole commit is known to succeed
      for (const w of n.writes) {
        const cur = docs.get(keys.doc(w.type, w.id));
        if (w.expected === "-1" && cur) throw new ConflictError("version_conflict", { type: w.type, id: w.id });
        if (w.expected !== "" && w.expected !== "-1" && (!cur || String(cur.version) !== w.expected)) throw new ConflictError("version_conflict", { type: w.type, id: w.id });
      }
      for (const u of n.uniques) {
        const cur = uniq.get(keys.uniq(u.name, u.value));
        if (cur !== undefined && cur !== u.owner) throw new ConflictError("unique_conflict", { name: u.name });
      }
      const versions = {};
      for (const w of n.writes) {
        const cur = docs.get(keys.doc(w.type, w.id));
        const version = (cur ? cur.version : 0) + 1;
        docs.set(keys.doc(w.type, w.id), { version, json: w.json });
        versions[`${w.type}:${w.id}`] = version;
      }
      for (const u of n.uniques) uniq.set(keys.uniq(u.name, u.value), u.owner);
      for (const a of n.indexes) zset(a.name).set(a.member, a.score);
      for (const r of n.unindexes) zset(r.name).delete(r.member);
      for (const d of n.deletes) docs.delete(keys.doc(d.type, d.id));
      return { versions };
    },
    async getUnique(name, value) {
      const v = uniq.get(keys.uniq(name, String(value)));
      return v === undefined ? null : v;
    },
    async releaseUnique(name, value) {
      uniq.delete(keys.uniq(name, String(value)));
    },
    async listIndex(name, { limit = 50, offset = 0, reverse = true, minScore = -Infinity, maxScore = Infinity } = {}) {
      const arr = [...zset(name).entries()].filter(([, s]) => s >= minScore && s <= maxScore).sort((a, b) => (reverse ? b[1] - a[1] : a[1] - b[1]) || (a[0] < b[0] ? -1 : 1));
      return arr.slice(offset, offset + limit).map(([m]) => m);
    },
    async indexSize(name) {
      return zset(name).size;
    },
    async counter(name, windowSeconds) {
      const now = Date.now();
      const e = counters.get(name);
      if (!e || e.until < now) {
        counters.set(name, { count: 1, until: now + windowSeconds * 1000 });
        return 1;
      }
      e.count += 1;
      return e.count;
    },
    async lock(name, ttlSeconds) {
      const now = Date.now();
      const until = locks.get(name);
      if (until && until > now) return false;
      locks.set(name, now + ttlSeconds * 1000);
      return true;
    },
    async unlock(name) {
      locks.delete(name);
    },
    async putBlob(id, bytes) {
      blobs.set(id, Buffer.from(bytes));
    },
    async getBlob(id) {
      return blobs.has(id) ? Buffer.from(blobs.get(id)) : null;
    },
    async deleteBlob(id) {
      blobs.delete(id);
    },
    /** Test helper: counts documents of a type. */
    async countType(type) {
      let n = 0;
      for (const k of docs.keys()) if (k.startsWith(`${PREFIX}:doc:${type}:`)) n += 1;
      return n;
    },
  };
}

/* ------------------------------------------------------------------ Upstash REST adapter */

export function createUpstashStore({ url, token, fetchImpl = fetch, timeoutMs = 6000 }) {
  const base = url.replace(/\/$/, "");
  async function request(path, body) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res;
    try {
      res = await fetchImpl(base + path, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal, cache: "no-store" });
    } catch (e) {
      throw new StoreError(e && e.name === "AbortError" ? "store_timeout" : "store_unreachable");
    } finally {
      clearTimeout(timer);
    }
    let data;
    try {
      data = await res.json();
    } catch {
      throw new StoreError("store_bad_response");
    }
    if (!res.ok) throw new StoreError("store_error", typeof data?.error === "string" ? data.error.slice(0, 200) : undefined);
    return data;
  }
  const cmd = async (...args) => {
    const data = await request("", args.map(String));
    if (data && data.error) throw new StoreError("store_error", String(data.error).slice(0, 200));
    return data.result;
  };
  const pipeline = async (commands) => {
    const data = await request("/pipeline", commands.map((c) => c.map(String)));
    if (!Array.isArray(data)) throw new StoreError("store_bad_response");
    return data.map((r) => {
      if (r && r.error) throw new StoreError("store_error", String(r.error).slice(0, 200));
      return r ? r.result : null;
    });
  };

  return {
    kind: "upstash",
    async ping() {
      return (await cmd("PING")) === "PONG";
    },
    async get(type, id) {
      const [ver, json] = await pipeline([["GET", keys.ver(type, id)], ["GET", keys.doc(type, id)]]);
      if (!json) return null;
      return { version: Number(ver) || 1, doc: JSON.parse(json) };
    },
    async getMany(type, ids) {
      if (!ids.length) return [];
      const res = await pipeline(ids.flatMap((id) => [["GET", keys.ver(type, id)], ["GET", keys.doc(type, id)]]));
      const out = [];
      ids.forEach((id, i) => {
        const json = res[i * 2 + 1];
        if (json) out.push({ id, version: Number(res[i * 2]) || 1, doc: JSON.parse(json) });
      });
      return out;
    },
    async commit(c) {
      const n = normaliseCommit(c);
      const argv = [String(n.writes.length)];
      for (const w of n.writes) argv.push(keys.ver(w.type, w.id), keys.doc(w.type, w.id), w.expected, w.json);
      argv.push(String(n.uniques.length));
      for (const u of n.uniques) argv.push(keys.uniq(u.name, u.value), u.owner);
      argv.push(String(n.indexes.length));
      for (const a of n.indexes) argv.push(keys.idx(a.name), String(a.score), a.member);
      argv.push(String(n.unindexes.length));
      for (const r of n.unindexes) argv.push(keys.idx(r.name), r.member);
      argv.push(String(n.deletes.length));
      for (const d of n.deletes) argv.push(keys.ver(d.type, d.id), keys.doc(d.type, d.id));
      const result = await cmd("EVAL", COMMIT_SCRIPT, "0", ...argv);
      if (!Array.isArray(result) || result.length < 1) throw new StoreError("store_bad_response");
      if (Number(result[0]) !== 1) throw new ConflictError(String(result[1]), { key: String(result[2] || "") });
      const versions = {};
      n.writes.forEach((w, i) => {
        versions[`${w.type}:${w.id}`] = Number(result[i + 1]);
      });
      return { versions };
    },
    async getUnique(name, value) {
      return (await cmd("GET", keys.uniq(name, String(value)))) || null;
    },
    async releaseUnique(name, value) {
      await cmd("DEL", keys.uniq(name, String(value)));
    },
    async listIndex(name, { limit = 50, offset = 0, reverse = true, minScore = "-inf", maxScore = "+inf" } = {}) {
      const lo = minScore === -Infinity ? "-inf" : String(minScore);
      const hi = maxScore === Infinity ? "+inf" : String(maxScore);
      const r = reverse
        ? await cmd("ZREVRANGEBYSCORE", keys.idx(name), hi, lo, "LIMIT", String(offset), String(limit))
        : await cmd("ZRANGEBYSCORE", keys.idx(name), lo, hi, "LIMIT", String(offset), String(limit));
      return Array.isArray(r) ? r : [];
    },
    async indexSize(name) {
      return Number(await cmd("ZCARD", keys.idx(name))) || 0;
    },
    async counter(name, windowSeconds) {
      const [count] = await pipeline([["INCR", keys.counter(name)], ["EXPIRE", keys.counter(name), String(windowSeconds * 2)]]);
      return Number(count) || 0;
    },
    async lock(name, ttlSeconds) {
      return (await cmd("SET", keys.lock(name), "1", "NX", "EX", String(ttlSeconds))) === "OK";
    },
    async unlock(name) {
      await cmd("DEL", keys.lock(name));
    },
    async putBlob(id, bytes) {
      await cmd("SET", keys.blob(id), Buffer.from(bytes).toString("base64"));
    },
    async getBlob(id) {
      const b64 = await cmd("GET", keys.blob(id));
      return b64 ? Buffer.from(String(b64), "base64") : null;
    },
    async deleteBlob(id) {
      await cmd("DEL", keys.blob(id));
    },
  };
}

/* ------------------------------------------------------------------ resolution */

let memorySingleton = null;

/**
 * The platform store for this process: the authorised Upstash database (same credentials and
 * prefix rules as the intake store), a shared in-memory store outside production when
 * PLATFORM_STORE=memory, otherwise null — every platform endpoint then answers 503 honestly.
 */
export function resolvePlatformStore(env = process.env, { readRestCredentials } = {}) {
  const creds = readRestCredentials ? readRestCredentials(env) : { url: env.KV_REST_API_URL, token: env.KV_REST_API_TOKEN };
  const { url, token } = creds;
  const local = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(url || "");
  if (url && token && (url.startsWith("https://") || local)) return createUpstashStore({ url, token });
  if (env.PLATFORM_STORE === "memory" && env.NODE_ENV !== "production") {
    memorySingleton = memorySingleton || createMemoryStore();
    return memorySingleton;
  }
  return null;
}
