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
if redis.call('SET', KEYS[1], ARGV[1], 'NX', 'EX', ARGV[4]) then
  redis.call('SET', KEYS[2], ARGV[2])
  redis.call('ZADD', KEYS[3], ARGV[3], ARGV[1])
  redis.call('ZADD', KEYS[4], ARGV[3], ARGV[1])
  redis.call('HSET', KEYS[5], 'status', 'pending', 'attempts', '0')
  return {1, ARGV[1]}
end
return {0, redis.call('GET', KEYS[1])}
`;

const keys = {
  idem: (hash) => `mx:idem:${hash}`,
  lead: (id) => `mx:lead:${id}`,
  notify: (id) => `mx:lead:${id}:notify`,
  index: "mx:leads:index",
  pending: "mx:leads:notify:pending",
  rate: (bucket) => `mx:rl:${bucket}`,
  lock: (name) => `mx:lock:${name}`,
};

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
    async createLead({ idemHash, requestId, record }) {
      const now = Date.now();
      const result = await cmd(
        "EVAL", CREATE_SCRIPT, "5",
        keys.idem(idemHash), keys.lead(requestId), keys.index, keys.pending, keys.notify(requestId),
        requestId, JSON.stringify(record), String(now), String(IDEM_TTL_SECONDS)
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
      return { record: JSON.parse(raw), notify: hashToObject(notify) };
    },
    async listLeads(limit = 100) {
      const ids = await cmd("ZREVRANGE", keys.index, "0", String(Math.max(0, limit - 1)));
      if (!Array.isArray(ids) || ids.length === 0) return [];
      const results = await pipeline(ids.flatMap((id) => [["GET", keys.lead(id)], ["HGETALL", keys.notify(id)]]));
      const out = [];
      for (let i = 0; i < ids.length; i++) {
        const raw = results[i * 2];
        if (!raw) continue;
        out.push({ record: JSON.parse(raw), notify: hashToObject(results[i * 2 + 1]) });
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
    async markNotConfigured(requestId) {
      await pipeline([
        ["HSET", keys.notify(requestId), "status", "not_configured"],
        ["ZADD", keys.pending, String(Date.now() + 3600 * 1000), requestId],
      ]);
    },
    async attempts(requestId) {
      return Number(await cmd("HGET", keys.notify(requestId), "attempts")) || 0;
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
  return {
    kind: "memory",
    failNext: null,
    async ping() {
      return true;
    },
    async createLead({ idemHash, requestId, record }) {
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
      return kv.has(id) ? { record: JSON.parse(kv.get(id)), notify: { ...notify.get(id) } } : null;
    },
    async listLeads(limit = 100) {
      return [...index.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([id]) => ({ record: JSON.parse(kv.get(id)), notify: { ...notify.get(id) } }));
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
    async markNotConfigured(id) {
      notify.set(id, { ...(notify.get(id) || {}), status: "not_configured" });
      pending.set(id, Date.now() + 3600 * 1000);
    },
    async attempts(id) {
      return Number((notify.get(id) || {}).attempts || 0);
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

/** Returns the configured durable store, or null when none is configured (intake unavailable). */
export function resolveStore(env = process.env) {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  const local = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(url || "");
  if (url && token && (url.startsWith("https://") || local)) return createUpstashStore({ url, token });
  if (env.LEAD_STORE === "memory" && env.NODE_ENV !== "production") {
    memorySingleton = memorySingleton || createMemoryStore();
    return memorySingleton;
  }
  return null;
}
