/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/**
 * Durable request store — SERVER ONLY.
 *
 * Production adapter: Redis over the Upstash REST protocol (Vercel Marketplace "Upstash for
 * Redis" injects KV_REST_API_URL / KV_REST_API_TOKEN; plain Upstash uses UPSTASH_REDIS_REST_*).
 * Creation is atomic and idempotent (Lua script): the idempotency key and the request record are
 * written together or not at all.
 *
 * The "memory" adapter exists for unit tests only and is refused in production builds.
 */

const IDEM_TTL_SECONDS = 7 * 24 * 3600;

const CREATE_SCRIPT = `
local created
if ARGV[4] == '0' then
  created = redis.call('SET', KEYS[1], ARGV[1], 'NX')
else
  created = redis.call('SET', KEYS[1], ARGV[1], 'NX', 'EX', ARGV[4])
end
if created then
  redis.call('SET', KEYS[2], ARGV[2])
  redis.call('ZADD', KEYS[3], ARGV[3], ARGV[1])
  redis.call('ZADD', KEYS[4], ARGV[3], ARGV[1])
  redis.call('HSET', KEYS[5], 'status', 'pending', 'attempts', '0')
  return {1, ARGV[1]}
end
return {0, redis.call('GET', KEYS[1])}
`;

// A checkpoint and its retry-queue update are one atomic operation. A completed channel
// therefore survives a worker restart even if another channel has not finished yet.
const NOTIFICATION_STATE_SCRIPT = `
redis.call('HSET', KEYS[1], unpack(ARGV, 3))
if ARGV[2] == '' then
  redis.call('ZREM', KEYS[2], ARGV[1])
else
  redis.call('ZADD', KEYS[2], ARGV[2], ARGV[1])
end
return 1
`;

function notificationState(channels, now) {
  const entries = Object.entries(channels);
  const waiting = entries.filter(([, n]) => n.status !== "sent" && n.status !== "failed");
  const sent = entries.every(([, n]) => n.status === "sent");
  const next = waiting.length ? Math.min(...waiting.map(([, n]) => Date.parse(n.next_attempt_at) || now)) : null;
  const error = entries.find(([, n]) => n.status !== "sent" && n.last_error);
  return {
    channels: JSON.stringify(channels),
    status: sent ? "sent" : waiting.length ? (waiting.every(([, n]) => n.status === "not_configured") ? "not_configured" : "retry") : "failed",
    attempts: String(Math.max(0, ...entries.map(([, n]) => Number(n.attempts) || 0))),
    last_attempt_at: entries.map(([, n]) => n.last_attempt_at || "").sort().at(-1) || "",
    sent_at: sent ? new Date(now).toISOString() : "",
    message_id: entries.find(([, n]) => n.message_id)?.[1].message_id || "",
    last_error: error ? `${error[0]}:${error[1].last_error}` : "",
    next_attempt_at: next === null ? "" : new Date(next).toISOString(),
  };
}

function decodeNotification(notify) {
  if (!notify.channels) return notify;
  try {
    const channels = JSON.parse(notify.channels);
    if (!channels || typeof channels !== "object" || Array.isArray(channels) || !Object.keys(channels).length) throw new Error();
    return { ...notify, channels };
  } catch {
    throw new StoreError("store_bad_notification_state");
  }
}

const keys = {
  idem: (hash) => `mx:idem:${hash}`,
  lead: (id) => `mx:lead:${id}`,
  notify: (id) => `mx:lead:${id}:notify`,
  index: "mx:leads:index",
  pending: "mx:leads:notify:pending",
  rate: (bucket) => `mx:rl:${bucket}`,
  lock: (name) => `mx:lock:${name}`,
};

import { dayKeys } from "../visits";

export class StoreError extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code;
  }
}

/* ------------------------------------------------------------------ Upstash REST */

export function createUpstashStore({ url, token, fetchImpl = fetch, timeoutMs = 6000 }) {
  const base = url.replace(/\/$/, "");

  async function request(path, body) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res;
    try {
      res = await fetchImpl(base + path, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
        cache: "no-store",
      });
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

  const hashToObject = (arr) => {
    if (!Array.isArray(arr)) return {};
    const o = {};
    for (let i = 0; i < arr.length; i += 2) o[arr[i]] = arr[i + 1];
    return o;
  };

  return {
    kind: "upstash",
    async ping() {
      return (await cmd("PING")) === "PONG";
    },
    async createLead({ idemHash, requestId, record, persistentIdempotency = false }) {
      if (persistentIdempotency && record.purpose !== 'forum') throw new StoreError('store_invalid_persistent_scope');
      const now = Date.now();
      const result = await cmd(
        "EVAL", CREATE_SCRIPT, "5",
        keys.idem(persistentIdempotency ? `forum:${idemHash}` : idemHash), keys.lead(requestId), keys.index, keys.pending, keys.notify(requestId),
        requestId, JSON.stringify(record), String(now), String(persistentIdempotency ? 0 : IDEM_TTL_SECONDS)
      );
      if (!Array.isArray(result) || result.length !== 2) throw new StoreError("store_bad_response");
      const created = Number(result[0]) === 1;
      const id = result[1];
      if (!created) {
        const exists = await cmd("EXISTS", keys.lead(id));
        if (Number(exists) !== 1) throw new StoreError("store_inconsistent");
      }
      return { created, requestId: id };
    },
    async getLead(requestId) {
      const [raw, notify] = await pipeline([["GET", keys.lead(requestId)], ["HGETALL", keys.notify(requestId)]]);
      if (!raw) return null;
      return { record: JSON.parse(raw), notify: decodeNotification(hashToObject(notify)) };
    },
    async listLeads(limit = 100) {
      const ids = await cmd("ZREVRANGE", keys.index, "0", String(Math.max(0, limit - 1)));
      if (!Array.isArray(ids) || ids.length === 0) return [];
      const results = await pipeline(ids.flatMap((id) => [["GET", keys.lead(id)], ["HGETALL", keys.notify(id)]]));
      const out = [];
      for (let i = 0; i < ids.length; i++) {
        const raw = results[i * 2];
        if (!raw) continue;
        out.push({ record: JSON.parse(raw), notify: decodeNotification(hashToObject(results[i * 2 + 1])) });
      }
      return out;
    },
    async countLeads() {
      return Number(await cmd("ZCARD", keys.index)) || 0;
    },
    async dueNotifications(nowMs, limit = 5) {
      const ids = await cmd("ZRANGEBYSCORE", keys.pending, "-inf", String(nowMs), "LIMIT", "0", String(limit));
      return Array.isArray(ids) ? ids : [];
    },
    async pendingCount() {
      return Number(await cmd("ZCARD", keys.pending)) || 0;
    },
    async recordAttempt(requestId, { ok, errorCode, messageId, nextAttemptAt, final }) {
      const now = new Date().toISOString();
      const cmds = [["HINCRBY", keys.notify(requestId), "attempts", "1"]];
      if (ok) {
        cmds.push(["HSET", keys.notify(requestId), "status", "sent", "last_attempt_at", now, "sent_at", now, "message_id", messageId || "", "last_error", ""]);
        cmds.push(["ZREM", keys.pending, requestId]);
      } else if (final) {
        cmds.push(["HSET", keys.notify(requestId), "status", "failed", "last_attempt_at", now, "last_error", errorCode || "error"]);
        cmds.push(["ZREM", keys.pending, requestId]);
      } else {
        cmds.push(["HSET", keys.notify(requestId), "status", "retry", "last_attempt_at", now, "last_error", errorCode || "error", "next_attempt_at", new Date(nextAttemptAt).toISOString()]);
        cmds.push(["ZADD", keys.pending, String(nextAttemptAt), requestId]);
      }
      await pipeline(cmds);
    },
    async saveNotificationState(requestId, channels, now = Date.now()) {
      const state = notificationState(channels, now);
      const next = state.next_attempt_at ? String(Date.parse(state.next_attempt_at)) : "";
      await cmd("EVAL", NOTIFICATION_STATE_SCRIPT, "2", keys.notify(requestId), keys.pending, requestId, next, ...Object.entries(state).flat());
      return decodeNotification(state);
    },
    async markNotConfigured(requestId) {
      await pipeline([
        ["HSET", keys.notify(requestId), "status", "not_configured"],
        ["ZADD", keys.pending, String(Date.now() + 3600 * 1000), requestId],
      ]);
    },
    async attempts(requestId) {
      return Number(await cmd("HGET", keys.notify(requestId), "attempts")) || 0;
    },
    /** Small durable settings written by the server itself — never request content. */
    async setting(name) {
      return (await cmd("GET", `mx:setting:${name}`)) || null;
    },
    async setSetting(name, value) {
      await cmd("SET", `mx:setting:${name}`, String(value));
    },
    /** Aggregate visit counters, newest day first. Written by edge middleware, see lib/visits.js. */
    async visits(days = 30) {
      const ks = dayKeys(days);
      const res = await pipeline(ks.map((k) => ["HGETALL", k]));
      return ks.map((k, i) => ({ day: k.slice(-10), fields: hashToObject(res[i]) }));
    },
    async rateLimit(bucket, windowSeconds) {
      const [count] = await pipeline([["INCR", keys.rate(bucket)], ["EXPIRE", keys.rate(bucket), String(windowSeconds * 2)]]);
      return Number(count) || 0;
    },
    async lock(name, ttlSeconds) {
      return (await cmd("SET", keys.lock(name), "1", "NX", "EX", String(ttlSeconds))) === "OK";
    },
    async unlock(name) {
      await cmd("DEL", keys.lock(name));
    },
  };
}

/* ------------------------------------------------------------------ memory (tests only) */

export function createMemoryStore() {
  const kv = new Map();
  const idem = new Map();
  const index = new Map();
  const pending = new Map();
  const notify = new Map();
  const rate = new Map();
  const locks = new Map();
  const settings = new Map();
  return {
    kind: "memory",
    failNext: null,
    async ping() {
      return true;
    },
    async createLead({ idemHash, requestId, record, persistentIdempotency = false }) {
      if (persistentIdempotency && record.purpose !== 'forum') throw new StoreError('store_invalid_persistent_scope');
      if (persistentIdempotency) idemHash = `forum:${idemHash}`;
      if (this.failNext) {
        const code = this.failNext;
        this.failNext = null;
        throw new StoreError(code);
      }
      if (idem.has(idemHash)) return { created: false, requestId: idem.get(idemHash) };
      idem.set(idemHash, requestId);
      kv.set(requestId, JSON.stringify(record));
      index.set(requestId, Date.now());
      pending.set(requestId, Date.now());
      notify.set(requestId, { status: "pending", attempts: "0" });
      return { created: true, requestId };
    },
    async getLead(id) {
      return kv.has(id) ? { record: JSON.parse(kv.get(id)), notify: decodeNotification({ ...notify.get(id) }) } : null;
    },
    async listLeads(limit = 100) {
      return [...index.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([id]) => ({ record: JSON.parse(kv.get(id)), notify: decodeNotification({ ...notify.get(id) }) }));
    },
    async countLeads() {
      return index.size;
    },
    async dueNotifications(nowMs, limit = 5) {
      return [...pending.entries()].filter(([, at]) => at <= nowMs).sort((a, b) => a[1] - b[1]).slice(0, limit).map(([id]) => id);
    },
    async pendingCount() {
      return pending.size;
    },
    async recordAttempt(id, { ok, errorCode, messageId, nextAttemptAt, final }) {
      const n = notify.get(id) || { attempts: "0" };
      n.attempts = String(Number(n.attempts || 0) + 1);
      n.last_attempt_at = new Date().toISOString();
      if (ok) {
        Object.assign(n, { status: "sent", message_id: messageId || "", last_error: "" });
        pending.delete(id);
      } else if (final) {
        Object.assign(n, { status: "failed", last_error: errorCode || "error" });
        pending.delete(id);
      } else {
        Object.assign(n, { status: "retry", last_error: errorCode || "error", next_attempt_at: new Date(nextAttemptAt).toISOString() });
        pending.set(id, nextAttemptAt);
      }
      notify.set(id, n);
    },
    async saveNotificationState(id, channels, now = Date.now()) {
      const state = notificationState(channels, now);
      notify.set(id, state);
      if (state.next_attempt_at) pending.set(id, Date.parse(state.next_attempt_at));
      else pending.delete(id);
      return decodeNotification(state);
    },
    async markNotConfigured(id) {
      notify.set(id, { ...(notify.get(id) || {}), status: "not_configured" });
      pending.set(id, Date.now() + 3600 * 1000);
    },
    async attempts(id) {
      return Number((notify.get(id) || {}).attempts || 0);
    },
    async setting(name) {
      return settings.has(name) ? settings.get(name) : null;
    },
    async setSetting(name, value) {
      settings.set(name, String(value));
    },
    async visits(days = 30) {
      return dayKeys(days).map((k) => ({ day: k.slice(-10), fields: {} }));
    },
    async rateLimit(bucket, windowSeconds) {
      const now = Date.now();
      const e = rate.get(bucket);
      if (!e || e.until < now) {
        rate.set(bucket, { count: 1, until: now + windowSeconds * 1000 });
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
  };
}

/* ------------------------------------------------------------------ resolution */

let memorySingleton = null;

/** Accepted REST credential pairs, in order of preference. */
const REST_PAIRS = [
  ["KV_REST_API_URL", "KV_REST_API_TOKEN"],
  ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
  ["REDIS_REST_URL", "REDIS_REST_TOKEN"],
];

/**
 * Reads the Redis REST credentials from the environment.
 *
 * The Vercel Marketplace lets the operator choose a prefix for the injected variables
 * (STORAGE_KV_REST_API_URL, for example). Both members of a pair must carry the same prefix,
 * so a URL is never combined with a token from a different database.
 */
export function readRestCredentials(env = process.env) {
  const prefixes = [""];
  for (const key of Object.keys(env)) {
    for (const [urlName] of REST_PAIRS) {
      if (key.length > urlName.length + 1 && key.endsWith(`_${urlName}`)) {
        const prefix = key.slice(0, key.length - urlName.length);
        if (!prefixes.includes(prefix)) prefixes.push(prefix);
      }
    }
  }
  for (const prefix of prefixes) {
    for (const [urlName, tokenName] of REST_PAIRS) {
      const url = env[prefix + urlName];
      const token = env[prefix + tokenName];
      if (url && token) return { url, token };
    }
  }
  return { url: undefined, token: undefined };
}

/** Returns the configured durable store, or null when none is configured (intake unavailable). */
export function resolveStore(env = process.env) {
  const { url, token } = readRestCredentials(env);
  const local = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(url || "");
  if (url && token && (url.startsWith("https://") || local)) return createUpstashStore({ url, token });
  if (env.LEAD_STORE === "memory" && env.NODE_ENV !== "production") {
    memorySingleton = memorySingleton || createMemoryStore();
    return memorySingleton;
  }
  return null;
}
