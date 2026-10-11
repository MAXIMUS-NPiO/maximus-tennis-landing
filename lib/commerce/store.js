/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/** Durable CAS documents: snapshot, status, event log and outbox change atomically.
 * Preflight both in JavaScript and Lua: Redis cannot roll back a failed script.
 */
import { readRestCredentials } from '../intake/store';

const ID_RE = /^MX-ORD-[0-9a-f]{32}$/;
const IDEM_RE = /^[0-9a-f]{64}$/;
const PROJECT_RE = /^[a-z][a-z0-9_-]{0,63}$/;
const NEVER_DUE = 8640000000000000;
const pending = 'mx:commerce:pending';
const key = id => 'mx:commerce:order:' + id;
const bad = code => { throw new Error(code); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function jsonValue(value, ancestors = new Set(), depth = 0) {
  if (depth > 64) bad('commerce_bad_document');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) bad('commerce_bad_document');
    return value;
  }
  if (typeof value !== 'object' || ancestors.has(value)) bad('commerce_bad_document');
  const prototype = Object.getPrototypeOf(value);
  if ((!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) || Object.getOwnPropertySymbols(value).length) bad('commerce_bad_document');
  ancestors.add(value);
  let normalized;
  if (Array.isArray(value)) {
    if (Object.keys(value).some(k => !/^(0|[1-9]\d*)$/.test(k) || Number(k) >= value.length)) bad('commerce_bad_document');
    normalized = [];
    for (let i = 0; i < value.length; i++) {
      if (!Object.hasOwn(value, i)) bad('commerce_bad_document');
      normalized.push(jsonValue(value[i], ancestors, depth + 1));
    }
  } else {
    normalized = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, jsonValue(v, ancestors, depth + 1)]));
  }
  ancestors.delete(value);
  return normalized;
}
function id(value) {
  if (typeof value !== 'string' || !ID_RE.test(value)) bad('commerce_bad_id');
  return value;
}
function score(value) {
  if (!Number.isSafeInteger(value) || value < 0) bad('commerce_bad_due');
  return value;
}
function query(now, limit) {
  score(now);
  if (!Number.isSafeInteger(limit) || limit < 0 || limit > 1000) bad('commerce_bad_limit');
}
export function nextDue(doc) {
  if (!object(doc.mail) || !object(doc.payment)) bad('commerce_bad_document');
  const times = [];
  for (const job of Object.values(doc.mail)) {
    if (!object(job) || typeof job.status !== 'string') bad('commerce_bad_document');
    for (const field of ['leaseUntil', 'nextAt']) if (job[field] !== undefined) score(job[field]);
    if (['pending', 'retry', 'sending'].includes(job.status)) times.push(job.leaseUntil || job.nextAt || 0);
  }
  if (doc.payment.nextReconcileAt !== undefined) score(doc.payment.nextReconcileAt);
  if (doc.payment.status === 'pending') times.push(doc.payment.nextReconcileAt || 0);
  return score(times.length ? Math.min(...times) : NEVER_DUE);
}
function document(input) {
  const doc = jsonValue(input);
  if (!object(doc) || !object(doc.snapshot) || doc.snapshot.schema !== 1 || typeof doc.snapshot.projectId !== 'string' || !PROJECT_RE.test(doc.snapshot.projectId) ||
      !object(doc.payment) || typeof doc.payment.status !== 'string' || !Array.isArray(doc.events) ||
      !Object.hasOwn(doc, 'invoice') || (doc.invoice !== null && !object(doc.invoice))) bad('commerce_bad_document');
  id(doc.id);
  const due = nextDue(doc);
  return { doc, due, json: JSON.stringify(doc) };
}
function equal(a, b) {
  if (a === b) return true;
  if (!object(a) && !Array.isArray(a)) return false;
  if ((!object(b) && !Array.isArray(b)) || Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(k => Object.hasOwn(b, k) && equal(a[k], b[k]));
}
function immutable(before, after) {
  if (before.id !== after.id || !equal(before.snapshot, after.snapshot) || (before.invoice !== null && !equal(before.invoice, after.invoice))) bad('immutable_snapshot');
}

const PREFLIGHT = `
local function checktype(key, wanted)
  local kind = redis.call('TYPE', key)
  if type(kind) == 'table' then kind = kind.ok end
  return kind == 'none' or kind == wanted
end
local function valid_id(id)
  return type(id) == 'string' and #id == 39 and string.match(id, '^MX%-ORD%-[0-9a-f]+$') ~= nil
end
local function finite(value)
  return type(value) == 'number' and value == value and value ~= math.huge and value ~= -math.huge
end
local function valid_score(value)
  return finite(value) and value >= 0 and value <= 9007199254740991 and value % 1 == 0
end
local function valid_json(value, depth)
  if depth > 64 then return false end
  if type(value) == 'number' then return finite(value) end
  if type(value) == 'table' then
    for _, child in pairs(value) do if not valid_json(child, depth + 1) then return false end end
  end
  return true
end
local function valid_doc(doc, id)
  return type(doc) == 'table' and valid_id(doc.id) and doc.id == id and
    type(doc.snapshot) == 'table' and doc.snapshot.schema == 1 and
    type(doc.snapshot.projectId) == 'string' and #doc.snapshot.projectId <= 64 and
    string.match(doc.snapshot.projectId, '^[a-z][a-z0-9_-]*$') ~= nil and
    type(doc.mail) == 'table' and type(doc.payment) == 'table' and type(doc.payment.status) == 'string' and
    type(doc.events) == 'table' and (doc.invoice == cjson.null or type(doc.invoice) == 'table') and valid_json(doc, 0)
end
local function due(doc)
  local result = 8640000000000000
  for _, job in pairs(doc.mail) do
    if type(job) ~= 'table' or type(job.status) ~= 'string' then return nil end
    if job.leaseUntil ~= nil and not valid_score(job.leaseUntil) then return nil end
    if job.nextAt ~= nil and not valid_score(job.nextAt) then return nil end
    if job.status == 'pending' or job.status == 'retry' or job.status == 'sending' then
      local next_at = job.leaseUntil
      if next_at == nil or next_at == 0 then next_at = job.nextAt or 0 end
      result = math.min(result, next_at)
    end
  end
  if doc.payment.nextReconcileAt ~= nil and not valid_score(doc.payment.nextReconcileAt) then return nil end
  if doc.payment.status == 'pending' then result = math.min(result, doc.payment.nextReconcileAt or 0) end
  return result
end
local function equal(a, b)
  if type(a) ~= type(b) then return false end
  if type(a) ~= 'table' then return a == b end
  for k, v in pairs(a) do if not equal(v, b[k]) then return false end end
  for k, _ in pairs(b) do if a[k] == nil then return false end end
  return true
end
`;
export const CREATE = PREFLIGHT + `
if #KEYS ~= 3 or #ARGV ~= 3 then return redis.error_reply('commerce_bad_arguments') end
local id = ARGV[1]
local due_score = tonumber(ARGV[3])
local ok, doc = pcall(cjson.decode, ARGV[2])
if not valid_id(id) or KEYS[2] ~= 'mx:commerce:order:' .. id or KEYS[3] ~= 'mx:commerce:pending' or
  #KEYS[1] ~= 81 or not string.match(KEYS[1], '^mx:commerce:idem:[0-9a-f]+$') or
  not valid_score(due_score) or not ok or not valid_doc(doc, id) or due(doc) ~= due_score then
  return redis.error_reply('commerce_bad_document')
end
if not checktype(KEYS[1], 'string') or not checktype(KEYS[2], 'string') or not checktype(KEYS[3], 'zset') then
  return redis.error_reply('commerce_wrong_type')
end
local old = redis.call('GET', KEYS[1])
if old then
  if not valid_id(old) then return redis.error_reply('commerce_bad_idempotency') end
  return {0, old}
end
if redis.call('EXISTS', KEYS[2]) == 1 then return {-1, ''} end
redis.call('SET', KEYS[1], id)
redis.call('SET', KEYS[2], ARGV[2])
redis.call('ZADD', KEYS[3], ARGV[3], id)
return {1, id}`;
export const CAS = PREFLIGHT + `
if #KEYS ~= 2 or #ARGV ~= 4 then return redis.error_reply('commerce_bad_arguments') end
local id = ARGV[4]
local due_score = tonumber(ARGV[3])
local ok_before, before = pcall(cjson.decode, ARGV[1])
local ok_after, after = pcall(cjson.decode, ARGV[2])
if not valid_id(id) or KEYS[1] ~= 'mx:commerce:order:' .. id or KEYS[2] ~= 'mx:commerce:pending' or
  not valid_score(due_score) or not ok_before or not ok_after or not valid_doc(before, id) or not valid_doc(after, id) or
  due(before) == nil or due(after) ~= due_score then return redis.error_reply('commerce_bad_document') end
if not checktype(KEYS[1], 'string') or not checktype(KEYS[2], 'zset') then return redis.error_reply('commerce_wrong_type') end
local old = redis.call('GET', KEYS[1])
if old ~= ARGV[1] then return 0 end
if before.id ~= after.id or not equal(before.snapshot, after.snapshot) or
  (before.invoice ~= cjson.null and not equal(before.invoice, after.invoice)) then return -1 end
redis.call('SET', KEYS[1], ARGV[2])
redis.call('ZADD', KEYS[2], ARGV[3], id)
return 1`;

export function createCommerceStore({ url, token, fetchImpl = fetch }) {
  async function cmd(...args) {
    const res = await fetchImpl(url.replace(/\/$/, ''), { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(args.map(String)), cache: 'no-store', signal: AbortSignal.timeout(6000) });
    const d = await res.json();
    if (!res.ok || d.error) throw new Error('commerce_store_unavailable');
    return d.result;
  }
  return {
    async create(idem, input) {
      if (typeof idem !== 'string' || !IDEM_RE.test(idem)) bad('commerce_bad_idempotency');
      const n = document(input);
      const r = await cmd('EVAL', CREATE, 3, 'mx:commerce:idem:' + idem, key(n.doc.id), pending, n.doc.id, n.json, n.due);
      if (!Array.isArray(r) || ![0, 1].includes(Number(r[0])) || typeof r[1] !== 'string' || !ID_RE.test(r[1])) throw new Error('commerce_create_conflict');
      return { created: Number(r[0]) === 1, id: r[1] };
    },
    async get(value) {
      id(value);
      const raw = await cmd('GET', key(value));
      if (!raw) return null;
      const n = document(JSON.parse(raw));
      if (n.doc.id !== value) bad('commerce_bad_id');
      return n.doc;
    },
    async swap(beforeInput, afterInput) {
      const before = document(beforeInput), after = document(afterInput);
      immutable(before.doc, after.doc);
      const r = Number(await cmd('EVAL', CAS, 2, key(before.doc.id), pending, before.json, after.json, after.due, before.doc.id));
      if (r < 0) throw new Error('immutable_snapshot');
      if (![0, 1].includes(r)) bad('commerce_bad_response');
      return r === 1;
    },
    async due(now, limit = 20) {
      query(now, limit);
      const result = await cmd('ZRANGEBYSCORE', pending, '-inf', now, 'LIMIT', 0, limit);
      if (!Array.isArray(result) || result.some(value => typeof value !== 'string' || !ID_RE.test(value))) bad('commerce_bad_response');
      return result;
    },
  };
}
export function resolveCommerceStore(env = process.env) {
  const { url, token } = readRestCredentials(env);
  return url?.startsWith('https://') && token ? createCommerceStore({ url, token }) : null;
}
export function createMemoryCommerceStore() {
  const docs = new Map(), idem = new Map();
  return {
    async create(hash, input) {
      if (typeof hash !== 'string' || !IDEM_RE.test(hash)) bad('commerce_bad_idempotency');
      const n = document(input);
      if (idem.has(hash)) return { created: false, id: idem.get(hash) };
      if (docs.has(n.doc.id)) throw new Error('commerce_create_conflict');
      docs.set(n.doc.id, n.json);
      idem.set(hash, n.doc.id);
      return { created: true, id: n.doc.id };
    },
    async get(value) { id(value); return docs.has(value) ? JSON.parse(docs.get(value)) : null; },
    async swap(beforeInput, afterInput) {
      const before = document(beforeInput), after = document(afterInput);
      immutable(before.doc, after.doc);
      if (docs.get(before.doc.id) !== before.json) return false;
      docs.set(before.doc.id, after.json);
      return true;
    },
    async due(now, limit = 20) {
      query(now, limit);
      return [...docs.values()].map(JSON.parse).filter(d => nextDue(d) <= now).sort((a, b) => nextDue(a) - nextDue(b) || a.id.localeCompare(b.id)).slice(0, limit).map(d => d.id);
    },
  };
}
export async function update(store, id, transform) {
  for (let i = 0; i < 8; i++) {
    const before = await store.get(id);
    if (!before) throw new Error('not_found');
    const after = transform(structuredClone(before));
    if (!after) return before;
    if (await store.swap(before, after)) return after;
  }
  throw new Error('concurrent_update');
}
