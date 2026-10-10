import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { createTelegramNotifier, processDue } from "../lib/intake/notify.js";
import { fixedOwnerTelegramDelivery, handleSiteEvent, MAX_SITE_EVENT_BYTES, retryBabyOutbox } from "../lib/intake/site-events.js";

const SECRET = "test-only-baby-tennis-shared-secret-32-characters";
const NOW = Date.parse("2026-10-10T02:00:00.000Z");
const TOKEN = "123456:TEST_ONLY_TOKEN_WITH_32_CHARACTERS";

function payload(overrides = {}) {
  return {
    source: "maximus-baby-tennis",
    event: "registration.created",
    event_id: "registration:example-001",
    created_at: new Date(NOW).toISOString(),
    contact: { name: "Example Parent", email: "parent@example.test" },
    details: { role: "parent", country: "UAE", quantity: 1 },
    ...overrides,
  };
}

function signedRequest(input = payload(), options = {}) {
  const body = options.raw !== undefined ? Buffer.from(options.raw) : Buffer.from(JSON.stringify(input));
  const timestamp = options.timestamp ?? String(Math.floor(NOW / 1000));
  const signature = crypto.createHmac("sha256", options.secret ?? SECRET).update(`${timestamp}.`).update(body).digest("hex");
  const headers = {
    "content-type": "application/json",
    "x-maximus-timestamp": timestamp,
    "x-maximus-signature": `sha256=${signature}`,
    ...options.headers,
  };
  return new Request("https://maximus.tennis/api/site-events", { method: "POST", headers, body });
}

/** Matches the durable store contract; no external IO, shared state or credentials. */
function fakeStore() {
  const records = new Map();
  const idempotency = new Map();
  const pending = new Map();
  const locks = new Set();
  const settings = new Map([["telegram_chat", "123456789"]]);
  const calls = [];
  return {
    records, idempotency, pending, settings, calls,
    async createLead({ idemHash, requestId, record }) {
      calls.push("store:create");
      if (idempotency.has(idemHash)) return { created: false, requestId: idempotency.get(idemHash) };
      idempotency.set(idemHash, requestId);
      records.set(requestId, { record: structuredClone(record), notify: { status: "pending", attempts: "0" } });
      pending.set(requestId, NOW);
      return { created: true, requestId };
    },
    async getLead(requestId) { calls.push("store:read"); return structuredClone(records.get(requestId) ?? null); },
    async recordAttempt(requestId, { ok, errorCode, messageId, nextAttemptAt, final }) {
      calls.push("store:attempt");
      const lead = records.get(requestId);
      lead.notify.attempts = String(Number(lead.notify.attempts) + 1);
      if (ok) {
        Object.assign(lead.notify, { status: "sent", message_id: messageId });
        pending.delete(requestId);
      } else if (final) {
        Object.assign(lead.notify, { status: "failed", last_error: errorCode });
        pending.delete(requestId);
      } else {
        Object.assign(lead.notify, { status: "retry", last_error: errorCode, next_attempt_at: new Date(nextAttemptAt).toISOString() });
        pending.set(requestId, nextAttemptAt);
      }
    },
    async markNotConfigured(requestId) { records.get(requestId).notify.status = "not_configured"; pending.set(requestId, NOW + 3600000); },
    async lock(name) { if (locks.has(name)) return false; locks.add(name); return true; },
    async unlock(name) { locks.delete(name); },
    async setting(name) { calls.push(`store:setting:${name}`); return settings.get(name) ?? null; },
    async dueNotifications(now, limit = 5) { return [...pending].filter(([, at]) => at <= now).slice(0, limit).map(([id]) => id); },
  };
}

function fixture(options = {}) {
  const store = fakeStore();
  const sent = [];
  let configs = 0;
  const notifier = {
    channel: "telegram",
    async send(record) {
      assert.ok(store.records.has(record.request_id), "event must already be durably stored");
      store.calls.push("telegram:send");
      sent.push(structuredClone(record));
      return options.result ?? { ok: true, messageId: "tg-987654321" };
    },
  };
  const run = (request, extra = {}) => handleSiteEvent(request, {
    secret: SECRET,
    now: NOW,
    getDeliveryConfig: async () => { configs += 1; return { store, notifier }; },
    ...extra,
  });
  return { store, notifier, sent, run, configs: () => configs };
}

test("anonymous, malformed, stale and incorrectly signed requests never access the store", async () => {
  const f = fixture();
  const cases = [
    new Request("https://example.test/api/site-events", { method: "POST", body: "{}" }),
    signedRequest(payload(), { headers: { "x-maximus-signature": "sha256=not-hex" } }),
    signedRequest(payload(), { secret: "wrong-shared-secret" }),
    signedRequest(payload(), { timestamp: String(NOW / 1000 - 301) }),
    signedRequest(payload(), { timestamp: String(NOW / 1000 + 301) }),
    signedRequest(payload(), { timestamp: `${NOW / 1000},${NOW / 1000}` }),
  ];
  for (const request of cases) {
    const response = await f.run(request);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { ok: false, code: "unauthorized" });
  }
  assert.equal(f.configs(), 0);
  assert.equal(f.store.records.size, 0);
  assert.equal(f.sent.length, 0);
});

test("signature covers exact raw bytes, not reparsed JSON", async () => {
  const f = fixture();
  const original = signedRequest();
  const tampered = new Request(original.url, { method: "POST", headers: original.headers, body: `${JSON.stringify(payload())} ` });
  assert.equal((await f.run(tampered)).status, 401);
  assert.equal(f.configs(), 0);
});

test("all accepted events are persisted before send and return only safe delivery evidence", async () => {
  const f = fixture();
  const response = await f.run(signedRequest());
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(Object.keys(data).sort(), ["event_id", "message_id", "ok", "request_id", "status"]);
  assert.equal(data.ok, true);
  assert.equal(data.status, "delivered");
  assert.equal(data.event_id, payload().event_id);
  assert.match(data.request_id, /^MX-BABY-[A-F0-9]{32}$/);
  assert.equal(data.message_id, "tg-987654321");
  assert.ok(f.store.calls.indexOf("store:create") < f.store.calls.indexOf("telegram:send"));
  assert.equal(f.sent[0].context.source, "maximus-baby-tennis");
  assert.equal(f.sent[0].context.event, "registration.created");
  assert.equal(f.sent[0].context.admin_url, "https://maximusbabytennis.com/#community");
  assert.equal(f.sent[0].locale, "en");
  assert.equal(f.store.pending.size, 0);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.ok(!JSON.stringify(data).includes("parent@example.test"));
  assert.ok(!JSON.stringify(data).includes(SECRET));
});

test("the five-minute signature boundary is allowed, then rejected", async () => {
  const f = fixture();
  assert.equal((await f.run(signedRequest(payload(), { timestamp: String(NOW / 1000 - 300) }))).status, 200);
  assert.equal((await f.run(signedRequest(payload(), { timestamp: String(NOW / 1000 - 301) }))).status, 401);
});

test("replays and differently ordered equivalent JSON return the same ID without another send", async () => {
  const f = fixture();
  const first = await (await f.run(signedRequest())).json();
  const p = payload();
  const ordered = { details: { quantity: 1, country: "UAE", role: "parent" }, contact: { email: p.contact.email, name: p.contact.name }, created_at: p.created_at, event_id: p.event_id, event: p.event, source: p.source };
  const second = await (await f.run(signedRequest(ordered))).json();
  assert.deepEqual(second, first);
  assert.equal(f.sent.length, 1);
  assert.equal(f.store.records.size, 1);
  // The durable record also suppresses duplication after the store's 7-day idem TTL.
  f.store.idempotency.clear();
  const third = await (await f.run(signedRequest())).json();
  assert.equal(third.request_id, first.request_id);
  assert.equal(f.sent.length, 1);
});

test("event ID reuse with a changed payload is a conflict, including concurrent requests", async () => {
  const f = fixture();
  const changed = payload({ details: { role: "coach" } });
  const responses = await Promise.all([f.run(signedRequest()), f.run(signedRequest(changed))]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
  assert.equal(f.store.records.size, 1);
  assert.equal(f.sent.length, 1);
  const subsequent = await f.run(signedRequest(changed));
  assert.equal(subsequent.status, 409);
  assert.deepEqual(await subsequent.json(), { ok: false, code: "event_conflict" });
});

test("concurrent identical requests store and send only once", async () => {
  const f = fixture();
  const responses = await Promise.all(Array.from({ length: 6 }, () => f.run(signedRequest())));
  const values = await Promise.all(responses.map((r) => r.json()));
  assert.ok(values.every((value) => value.ok && value.request_id === values[0].request_id));
  assert.equal(f.sent.length, 1);
  assert.equal(f.store.records.size, 1);
});

test("Telegram outage queues durably and the existing processDue retries that record", async () => {
  const f = fixture({ result: { ok: false, errorCode: "telegram_timeout" } });
  const response = await f.run(signedRequest());
  const data = await response.json();
  assert.equal(response.status, 202);
  assert.deepEqual(data, { ok: true, status: "queued", event_id: payload().event_id, request_id: data.request_id });
  assert.equal(f.store.pending.size, 1);
  const duplicate = await (await f.run(signedRequest())).json();
  assert.equal(duplicate.status, "queued");
  assert.equal(f.sent.length, 1, "replay must not defeat the retry backoff");
  const summary = await processDue(f.store, { channel: "telegram", send: async () => ({ ok: true, messageId: "tg-1234" }) }, { now: NOW + 60000 });
  assert.equal(summary.sent, 1);
  const recovered = await (await f.run(signedRequest())).json();
  assert.equal(recovered.status, "delivered");
  assert.equal(recovered.message_id, "tg-1234");
  assert.equal(f.store.pending.size, 0);
});

test("transport exception leaves the saved event queued and never leaks the exception", async () => {
  const f = fixture();
  const response = await f.run(signedRequest(), { deliverImpl: async () => { throw new Error(`${SECRET}/private/path/contact@example.test`); } });
  const data = await response.json();
  assert.equal(response.status, 202);
  assert.equal(data.status, "queued");
  assert.equal(f.store.records.size, 1);
  assert.equal(f.store.pending.size, 1);
  assert.ok(!JSON.stringify(data).includes("private"));
});

test("store failure before durable creation never sends or returns success", async () => {
  const f = fixture();
  f.store.createLead = async () => { throw new Error(`${SECRET}/private/path`); };
  const response = await f.run(signedRequest());
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { ok: false, code: "temporarily_unavailable" });
  assert.equal(f.sent.length, 0);
});

test("unverifiable persisted state and exhausted retry state are never called queued", async () => {
  const f = fixture();
  const accepted = await (await f.run(signedRequest())).json();
  f.store.records.get(accepted.request_id).notify.status = "failed";
  assert.equal((await f.run(signedRequest())).status, 503);
  f.store.getLead = async () => { throw new Error("store_unreachable"); };
  const response = await f.run(signedRequest());
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { ok: false, code: "temporarily_unavailable" });
});

test("non-Telegram configuration and missing shared secret fail closed", async () => {
  const f = fixture();
  assert.equal((await f.run(signedRequest(), { secret: undefined })).status, 503);
  assert.equal((await f.run(signedRequest(), { secret: "short" })).status, 503);
  assert.equal((await f.run(signedRequest(), { getDeliveryConfig: async () => ({ store: f.store, notifier: { channel: "smtp", send() { throw new Error("must not send"); } } }) })).status, 503);
  assert.equal(f.store.records.size, 0);
  assert.equal(f.sent.length, 0);
});

test("strict schema rejects wrong sources, unknown routing fields, bad email and unsafe values", async () => {
  const f = fixture();
  const cases = [
    payload({ source: "other-site" }), payload({ event: "payment.created" }),
    payload({ event_id: "bad id" }), payload({ chat_id: "55555555" }),
    payload({ contact: { email: "missing-at-sign" } }), payload({ contact: {} }),
    payload({ contact: { email: "valid@example.test", telegram_chat: "55555555" } }),
    payload({ contact: { email: "valid@example.test", name: "bad\u0000name" } }),
    payload({ details: { message: "x".repeat(2001) } }), payload({ details: { quantity: -1 } }),
    payload({ details: { quantity: "1" } }), payload({ details: { role: ["parent"] } }),
    payload({ details: { country: { name: "UAE" } } }), payload({ details: { secret: "data" } }),
    payload({ event: "inquiry.created", details: {} }),
    payload({ created_at: "2026-02-31T02:00:00.000Z" }),
    payload({ created_at: new Date(NOW + 301000).toISOString() }),
    [], null,
  ];
  for (const input of cases) assert.equal((await f.run(signedRequest(input))).status, 400, JSON.stringify(input));
  assert.equal(f.configs(), 0);
  assert.equal(f.store.records.size, 0);
});

test("valid inquiry retains only bounded parent contact and message", async () => {
  const f = fixture();
  const response = await f.run(signedRequest(payload({ event: "inquiry.created", details: { message: "Please contact me.\nThank you.", country: "UAE" } })));
  assert.equal(response.status, 200);
  assert.equal(f.sent[0].details.message, "Please contact me.\nThank you.");
  assert.match(f.sent[0].purpose, /inquiry$/);
});

test("optional quantity may be omitted or zero; values above the UI maximum are rejected", async () => {
  const f = fixture();
  assert.equal((await f.run(signedRequest(payload({ details: { quantity: 0 } })))).status, 200);
  assert.equal(f.sent[0].details.quantity, 0);
  assert.equal((await f.run(signedRequest(payload({ event_id: "registration:example-002", details: {} })))).status, 200);
  assert.equal((await f.run(signedRequest(payload({ event_id: "registration:example-003", details: { quantity: 1000001 } })))).status, 400);
});

test("connection test accepts no fabricated contact and is explicitly labelled TEST", async () => {
  const f = fixture();
  const response = await f.run(signedRequest(payload({ event: "connection.test", event_id: "connection:test-001", contact: {}, details: {} })));
  assert.equal(response.status, 200);
  assert.match(f.sent[0].purpose, /TEST connection/);
  assert.deepEqual(f.sent[0].contact, {});
});

test("body bound counts UTF-8 bytes and stops a streaming oversized body", async () => {
  const f = fixture();
  assert.equal((await f.run(signedRequest(payload(), { headers: { "content-length": String(MAX_SITE_EVENT_BYTES + 1) } }))).status, 413);
  const raw = Buffer.from(`{"message":"${"🎾".repeat(4000)}"}`);
  assert.ok(raw.length > MAX_SITE_EVENT_BYTES);
  assert.equal((await f.run(signedRequest(null, { raw }))).status, 413);
  let cancelled = false;
  const stream = new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(MAX_SITE_EVENT_BYTES + 1)); },
    cancel() { cancelled = true; },
  });
  const signed = signedRequest();
  const streamed = new Request(signed.url, { method: "POST", headers: signed.headers, body: stream, duplex: "half" });
  assert.equal((await f.run(streamed)).status, 413);
  assert.equal(cancelled, true);
  assert.equal(f.configs(), 0);
});

test("signed malformed JSON, invalid UTF-8 and false Content-Length are rejected", async () => {
  const f = fixture();
  assert.equal((await f.run(signedRequest(null, { raw: "{" }))).status, 400);
  assert.equal((await f.run(signedRequest(null, { raw: Buffer.from([0xff]) }))).status, 400);
  assert.equal((await f.run(signedRequest(payload(), { headers: { "content-length": "1" } }))).status, 400);
  assert.equal((await f.run(signedRequest(payload(), { headers: { "content-length": "not-a-number" } }))).status, 400);
  assert.equal(f.configs(), 0);
});

test("unsupported content encoding/type and non-POST methods are rejected", async () => {
  const f = fixture();
  assert.equal((await f.run(signedRequest(payload(), { headers: { "content-type": "text/plain" } }))).status, 415);
  assert.equal((await f.run(signedRequest(payload(), { headers: { "content-type": "application/json-fake" } }))).status, 415);
  assert.equal((await f.run(signedRequest(payload(), { headers: { "content-encoding": "gzip" } }))).status, 415);
  const response = await f.run(new Request("https://example.test/api/site-events"));
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "POST");
});

test("fixed owner delivery never discovers a recipient and stays pinned after 403", async () => {
  const store = fakeStore();
  const calls = [];
  const config = await fixedOwnerTelegramDelivery({
    env: {}, store, telegram: { token: TOKEN, chatId: null },
    notifierFactory: (cfg, deps) => createTelegramNotifier(cfg, {
      ...deps,
      fetchImpl: async (url, init) => {
        calls.push({ url, body: JSON.parse(init.body) });
        return new Response(JSON.stringify({ ok: false, error_code: 403 }), { status: 403 });
      },
    }),
  });
  await config.notifier.send({ request_id: "TEST", created_at: new Date(NOW).toISOString(), purpose: "TEST", locale: "en", contact: {}, details: {} });
  // Even if the backing setting changes, this relay request keeps the originally pinned owner.
  store.settings.set("telegram_chat", "999999999");
  await config.notifier.send({ request_id: "TEST", created_at: new Date(NOW).toISOString(), purpose: "TEST", locale: "en", contact: {}, details: {} });
  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => call.url.endsWith("/sendMessage") && call.body.chat_id === "123456789"));
  assert.ok(!calls.some((call) => call.url.includes("getUpdates")));
});

test("explicit owner overrides stored owner; no owner or alternative channel fails closed", async () => {
  const store = fakeStore();
  let chosen;
  const factory = (cfg) => { chosen = cfg; return { send: async () => ({ ok: true }) }; };
  const config = await fixedOwnerTelegramDelivery({ env: { TELEGRAM_CHAT_ID: "222222222" }, store, telegram: { token: TOKEN, chatId: "222222222" }, notifierFactory: factory });
  await config.notifier.send({});
  assert.equal(chosen.chatId, "222222222");
  assert.ok(!store.calls.some((call) => call.includes("setting")));
  store.settings.clear();
  assert.equal(await fixedOwnerTelegramDelivery({ env: {}, store, telegram: { token: TOKEN } }), null);
  assert.equal(await fixedOwnerTelegramDelivery({ env: { TELEGRAM_CHAT_ID: "@unverified" }, store, telegram: { token: TOKEN } }), null);
  assert.equal(await fixedOwnerTelegramDelivery({ env: { LEAD_NOTIFY_CHANNEL: "smtp", TELEGRAM_CHAT_ID: "222222222" }, store, telegram: { token: TOKEN } }), null);
});

async function pendingBabyEvent(store, suffix = "001") {
  const requestId = `TEST-BABY-${suffix}`;
  await store.createLead({
    idemHash: requestId, requestId,
    record: {
      request_id: requestId, created_at: new Date(NOW).toISOString(),
      purpose: "MAXIMUS BABY TENNIS — TEST connection", locale: "en", contact: {}, details: {},
      context: { source: "maximus-baby-tennis", event: "connection.test" },
    },
  });
  return requestId;
}

test("shared cron never discovers a Baby owner when the stored destination is absent or invalid", async () => {
  for (const invalid of [null, "", "@unverified", "0", "1 2", "123;456"]) {
    const store = fakeStore();
    store.settings.clear();
    if (invalid !== null) store.settings.set("telegram_chat", invalid);
    const requestId = await pendingBabyEvent(store);
    let apiCalls = 0;
    const notifier = createTelegramNotifier({ token: TOKEN, chatId: null }, {
      store, fetchImpl: async () => { apiCalls += 1; throw new Error("must not call any Telegram method"); },
    });
    const summary = await processDue(store, notifier, { now: NOW });
    assert.equal(summary.retry, 1);
    assert.equal(apiCalls, 0);
    assert.equal(store.records.get(requestId).notify.last_error, "telegram_no_chat");
    assert.equal(store.pending.size, 1);
  }
});

test("shared cron pins explicit Baby owner on 400/403 and never falls back to another stored chat", async () => {
  for (const status of [400, 403]) {
    const store = fakeStore();
    store.settings.set("telegram_chat", "999999999");
    await pendingBabyEvent(store);
    const calls = [];
    const notifier = createTelegramNotifier({ token: TOKEN, chatId: "222222222" }, {
      store,
      fetchImpl: async (url, init) => {
        calls.push({ url, body: JSON.parse(init.body) });
        return new Response(JSON.stringify({ ok: false, error_code: status }), { status });
      },
    });
    assert.equal((await processDue(store, notifier, { now: NOW })).retry, 1);
    assert.equal((await processDue(store, notifier, { now: NOW + 60000 })).retry, 1);
    assert.equal(calls.length, 2);
    assert.ok(calls.every((call) => call.url.endsWith("/sendMessage") && call.body.chat_id === "222222222"));
    assert.ok(!calls.some((call) => call.url.endsWith("/getUpdates")));
  }
});

test("shared cron with stored Baby owner fails closed if that owner disappears after 403", async () => {
  const store = fakeStore();
  await pendingBabyEvent(store);
  const calls = [];
  const notifier = createTelegramNotifier({ token: TOKEN, chatId: null }, {
    store,
    fetchImpl: async (url, init) => {
      calls.push({ url, body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ ok: false, error_code: 403 }), { status: 403 });
    },
  });
  assert.equal((await processDue(store, notifier, { now: NOW })).retry, 1);
  store.settings.clear();
  assert.equal((await processDue(store, notifier, { now: NOW + 60000 })).retry, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.chat_id, "123456789");
  assert.ok(calls[0].url.endsWith("/sendMessage"));
});

test("legacy recipient discovery remains available only to non-Baby records", async () => {
  const store = fakeStore();
  store.settings.clear();
  const calls = [];
  const notifier = createTelegramNotifier({ token: TOKEN, chatId: null }, {
    store,
    fetchImpl: async (url) => {
      calls.push(url);
      return new Response(JSON.stringify(url.endsWith("/getUpdates")
        ? { ok: true, result: [{ message: { chat: { id: 777123 } } }] }
        : { ok: true, result: { message_id: 123 } }));
    },
  });
  const generic = { request_id: "TEST-LEGACY", created_at: new Date(NOW).toISOString(), purpose: "general", locale: "en", contact: {}, details: {} };
  assert.equal((await notifier.send(generic)).ok, true);
  assert.equal(calls.length, 2);
  assert.ok(calls[0].endsWith("/getUpdates"));
  await pendingBabyEvent(store);
  const summary = await processDue(store, notifier, { now: NOW });
  assert.equal(summary.retry, 1);
  assert.equal(calls.length, 2, "Baby event must not reuse a chat cached from legacy discovery");
});

test("outbox recovery signs its fixed action and destination, sends no body, returns counts only", async () => {
  let calls = 0;
  const result = await retryBabyOutbox({
    secret: SECRET,
    now: () => NOW,
    fetchImpl: async (url, init) => {
      calls += 1;
      assert.equal(url, "https://maximusbabytennis.com/api/notifications/flush");
      assert.equal(init.method, "POST");
      assert.equal(init.body, "");
      assert.equal(init.redirect, "error");
      assert.equal(init.cache, "no-store");
      assert.ok(init.signal instanceof AbortSignal);
      assert.equal(init.signal.aborted, false);
      const timestamp = String(NOW / 1000);
      const expected = crypto.createHmac("sha256", SECRET).update(`${timestamp}.retry-baby-owner-notifications`).digest("hex");
      assert.equal(init.headers["X-Maximus-Timestamp"], timestamp);
      assert.equal(init.headers["X-Maximus-Signature"], `sha256=${expected}`);
      assert.ok(!Object.values(init.headers).includes(SECRET));
      return Response.json({ configured: true, processed: 5, relayed: 3, ignored_secret: SECRET, ignored_contact: "parent@example.test" });
    },
  });
  assert.equal(calls, 1);
  assert.deepEqual(result, { disabled: false, failed: false, processed: 5, relayed: 3 });
});

test("outbox recovery is disabled without a sufficient secret and makes no request", async () => {
  let calls = 0;
  for (const secret of [undefined, "", "short"]) {
    const result = await retryBabyOutbox({ secret, fetchImpl: async () => { calls += 1; throw new Error("must not request"); } });
    assert.deepEqual(result, { disabled: true, failed: false, processed: 0, relayed: 0 });
  }
  assert.equal(calls, 0);
});

test("outbox recovery never exposes transport errors, HTTP failures or invalid response fields", async () => {
  const failures = [
    async () => { throw new Error(`${SECRET}/private/path`); },
    async () => Response.json({ error: SECRET }, { status: 401 }),
    async () => new Response("not-json"),
    async () => Response.json({ configured: false, processed: 0, relayed: 0 }),
    async () => Response.json({ configured: true, processed: 6, relayed: 1 }),
    async () => Response.json({ configured: true, processed: 2, relayed: 3 }),
    async () => Response.json({ configured: true, processed: 2, relayed: "2" }),
  ];
  for (const fetchImpl of failures) {
    const result = await retryBabyOutbox({ secret: SECRET, now: () => NOW, fetchImpl });
    assert.deepEqual(result, { disabled: false, failed: true, processed: 0, relayed: 0 });
  }
});
