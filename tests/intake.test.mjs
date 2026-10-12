/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/**
 * Intake tests: schema, service, idempotency, rate limit, durable store (real redis-server through
 * an Upstash-compatible REST bridge), notification delivery (webhook receiver + SMTP sink), retries.
 * Run: npm run test:unit. Redis/SMTP integration prerequisites are reported as skips when absent.
 * Set INTAKE_REQUIRE_REDIS=1 to require Redis; INTAKE_REQUIRE_SMTP=1 also requires SMTP.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { EventEmitter } from "node:events";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { validateConfig, validateRequest, gpsDirections, sanitizeAttribution, parseStrictInt, totalRacquets } from "../lib/intake/schema.js";
import { createMemoryStore, createUpstashStore, resolveStore, readRestCredentials } from "../lib/intake/store.js";
import { acceptRequest, afterAccept, makeRequestId, safeEqual } from "../lib/intake/service.js";
import { deliver, processDue, nextAttemptAt, RETRY_SCHEDULE_MS, MAX_ATTEMPTS, createWebhookNotifier, createSmtpNotifier, createTelegramNotifier, buildMessage } from "../lib/intake/notify.js";
import { readConfig, resolveNotifier, telegramSettings } from "../lib/intake/config.js";
import { startTestRedis, startBridge, RedisConn } from "./redis-rest-bridge.mjs";

const uuid = () => crypto.randomUUID();
const ID_RE = /^MX-[A-Z]{3}-\d{8}-[0-9A-HJKMNP-TV-Z]{6}$/;

function cfg(store, extra = {}) {
  return { store, notifier: null, rateLimit: { max: 10, windowSeconds: 600 }, salt: "test-salt", minElapsedMs: 1500, ...extra };
}

const contact = { name: "Test Person", email: "tester@example.org", role: "player", country: "United Arab Emirates" };
const baseConfig = { series: "great", cls: "P1.5", mode: "listed", weight: 272, grip: "L3", setType: "individual", sets: 1, use: "play", ptype: "none" };
const payload = (over = {}) => ({
  purpose: "config",
  locale: "en",
  fields: { ...contact },
  config: { ...baseConfig },
  consent: true,
  idempotencyKey: uuid(),
  elapsedMs: 9000,
  hp: "",
  attribution: { landing_path: "/en/racquets/great", locale: "en", utm_source: "google", utm_campaign: "great-launch", evil: "<script>" },
  context: { page: "/en/build", from: "series" },
  ...over,
});

/* ------------------------------------------------------------------ schema */

test("strict integers reject zero-like, negative, decimal, exponent and non-finite input", () => {
  assert.deepEqual(parseStrictInt("272"), { value: 272 });
  assert.equal(parseStrictInt("-5").error, "out_of_range");
  assert.equal(parseStrictInt("250.5").error, "decimal_not_supported");
  assert.equal(parseStrictInt("1e3").error, "not_number");
  assert.equal(parseStrictInt("abc").error, "not_number");
  assert.equal(parseStrictInt(Infinity).error, "not_number");
  assert.equal(parseStrictInt(NaN).error, "not_number");
});

test("listed weight must belong to the exact series matrix", () => {
  assert.equal(validateConfig({ ...baseConfig, weight: 240 }).errors["config.weight"], "not_in_matrix");
  assert.equal(validateConfig({ ...baseConfig, weight: 0 }).errors["config.weight"], "out_of_range");
  assert.equal(validateConfig({ ...baseConfig, weight: "-236" }).errors["config.weight"], "out_of_range");
  assert.equal(validateConfig({ ...baseConfig, series: "power", weight: 272 }).errors["config.weight"], "not_in_matrix");
  assert.ok(validateConfig({ ...baseConfig, weight: 236 }).ok);
});

test("custom weight rejects invalid integers and preserves the required Unstrung basis", () => {
  const c = { ...baseConfig, mode: "custom", weight: undefined };
  assert.equal(validateConfig({ ...c, customWeight: 0 }).errors["config.customWeight"], "out_of_range");
  assert.equal(validateConfig({ ...c, customWeight: "-300" }).errors["config.customWeight"], "out_of_range");
  assert.equal(validateConfig({ ...c, customWeight: "heavy" }).errors["config.customWeight"], "not_number");
  assert.equal(validateConfig({ ...c, customWeight: "301.5" }).errors["config.customWeight"], "decimal_not_supported");
  const defaultBasis = validateConfig({ ...c, customWeight: 301 });
  assert.ok(defaultBasis.ok);
  assert.equal(defaultBasis.value.basis, "unstrung");
  assert.equal(validateConfig({ ...c, customWeight: 301, basis: "strung" }).errors["config.basis"], "invalid");
  const ok = validateConfig({ ...c, customWeight: 301, basis: "unstrung" });
  assert.ok(ok.ok);
  assert.equal(ok.value.customWeight, 301);
});

test("matched sets count racquets correctly", () => {
  assert.equal(validateConfig({ ...baseConfig, setType: "triple", sets: 1 }).value.racquetsTotal, 3);
  assert.equal(validateConfig({ ...baseConfig, setType: "pair", sets: 2 }).value.racquetsTotal, 4);
  assert.equal(validateConfig({ ...baseConfig, setType: "team", sets: 2 }).errors["config.teamSize"], "required");
  assert.equal(validateConfig({ ...baseConfig, setType: "team", sets: 2, teamSize: 3 }).errors["config.teamSize"], "out_of_range");
  assert.equal(validateConfig({ ...baseConfig, setType: "team", sets: 2, teamSize: 6 }).value.racquetsTotal, 12);
  assert.equal(validateConfig({ ...baseConfig, sets: 0 }).errors["config.sets"], "out_of_range");
  assert.equal(totalRacquets({ setType: "individual", sets: 5 }), 5);
});

test("engraving: required text for personalisation, non-Latin flagged for artwork review", () => {
  assert.equal(validateConfig({ ...baseConfig, ptype: "name" }).errors["config.engraving"], "required");
  assert.equal(validateConfig({ ...baseConfig, ptype: "name", engraving: "A".repeat(25) }).errors["config.engraving"], "too_long");
  assert.equal(validateConfig({ ...baseConfig, ptype: "name", engraving: "МАКСИМ" }).value.engravingArtworkReview, true);
  assert.equal(validateConfig({ ...baseConfig, ptype: "name", engraving: "MAX 7" }).value.engravingArtworkReview, false);
});

test("request validation: consent, email format, header-injection attempts, unknown purpose", () => {
  assert.equal(validateRequest({ ...payload(), consent: false }).errors.consent, "consent_required");
  assert.equal(validateRequest(payload({ fields: { ...contact, email: "not-an-email" } })).errors.email, "invalid_email");
  assert.equal(validateRequest(payload({ fields: { ...contact, email: "a@b.org\r\nBcc: x@y.org" } })).errors.email, "invalid_email");
  assert.equal(validateRequest(payload({ fields: { ...contact, name: "Bob\r\nBcc: x@y.org" } })).errors.name, "invalid");
  assert.equal(validateRequest(payload({ purpose: "wallet" })).errors.purpose, "invalid_choice");
  assert.equal(validateRequest(payload({ purpose: "family", fields: { ...contact, role: "parent" } })).errors.goal, "required");
});

test("GPS: other sports never receive a tennis series", () => {
  assert.deepEqual(gpsDirections({ sport: "padel", objectives: ["control", "spin"] }), []);
  assert.deepEqual(gpsDirections({ sport: "tennis", objectives: ["control", "spin"] }), ["great", "spin"]);
  assert.deepEqual(gpsDirections({ sport: "tennis", objectives: ["comfort"] }), []);
});

test("attribution keeps only allowlisted, well-formed fields", () => {
  const a = sanitizeAttribution({ landing_path: "/en/racquets/great?x=1", locale: "de", utm_source: "google", utm_medium: "<script>", gclid: "Cj0KCQ-abc_123", email: "x@y.org" });
  assert.deepEqual(a, { locale: "de", utm_source: "google", gclid: "Cj0KCQ-abc_123" });
});

test("request ids and secret comparison", () => {
  assert.match(makeRequestId("config"), ID_RE);
  assert.match(makeRequestId("family"), /^MX-FAM-/);
  assert.ok(safeEqual("abcdefghijklmnop", "abcdefghijklmnop"));
  assert.ok(!safeEqual("abcdefghijklmnop", "abcdefghijklmnoq"));
  assert.ok(!safeEqual("abc", "abcd"));
});

/* ------------------------------------------------------------------ service (memory store) */

test("accepted request: server id, stored record, allowlisted attribution, no IP in record", async () => {
  const store = createMemoryStore();
  const r = await acceptRequest(payload(), { ip: "203.0.113.7", config: cfg(store) });
  assert.equal(r.http, 201);
  assert.equal(r.body.status, "accepted");
  assert.match(r.body.request_id, ID_RE);
  const lead = await store.getLead(r.body.request_id);
  assert.equal(lead.record.config.weight, 272);
  assert.equal(lead.record.config.racquetsTotal, 1);
  assert.equal(lead.record.attribution.utm_campaign, "great-launch");
  assert.equal(lead.record.attribution.evil, undefined);
  assert.equal(lead.record.context.from, "series");
  assert.ok(!JSON.stringify(lead.record).includes("203.0.113.7"));
  assert.equal(lead.notify.status, "pending");
});

test("a subscription to updates needs only an address, and is stored like any other request", async () => {
  const store = createMemoryStore();
  const sub = {
    purpose: "updates",
    locale: "de",
    fields: { email: "reader@example.org" },
    consent: true,
    idempotencyKey: uuid(),
    elapsedMs: 9000,
    hp: "",
  };
  const r = await acceptRequest(sub, { ip: "198.51.100.4", config: cfg(store) });
  assert.equal(r.http, 201);
  assert.equal(r.body.status, "accepted");
  assert.match(r.body.request_id, ID_RE);
  assert.ok(r.body.request_id.startsWith("MX-UPD-"));
  const lead = await store.getLead(r.body.request_id);
  assert.equal(lead.record.contact.email, "reader@example.org");
  assert.equal(lead.record.contact.name, undefined);
  assert.equal(lead.notify.status, "pending");
  assert.ok(!JSON.stringify(lead.record).includes("198.51.100.4"));
});

test("a subscription without an address is refused", async () => {
  const store = createMemoryStore();
  const r = await acceptRequest(
    { purpose: "updates", locale: "en", fields: {}, consent: true, idempotencyKey: uuid(), elapsedMs: 9000, hp: "" },
    { ip: "198.51.100.5", config: cfg(store) }
  );
  assert.equal(r.http, 400);
  assert.equal(r.body.errors.email, "required");
  assert.equal(await store.countLeads(), 0);
});

test("a subscription filled in faster than a human is refused", async () => {
  const store = createMemoryStore();
  const r = await acceptRequest(
    { purpose: "updates", locale: "en", fields: { email: "bot@example.org" }, consent: true, idempotencyKey: uuid(), elapsedMs: 40, hp: "" },
    { ip: "198.51.100.6", config: cfg(store) }
  );
  assert.equal(r.http, 400);
  assert.equal(r.body.code, "too_fast");
  assert.equal(await store.countLeads(), 0);
});

test("double submit with the same idempotency key creates one request", async () => {
  const store = createMemoryStore();
  const p = payload();
  const a = await acceptRequest(p, { ip: "1.1.1.1", config: cfg(store) });
  const b = await acceptRequest(p, { ip: "1.1.1.1", config: cfg(store) });
  assert.equal(a.http, 201);
  assert.equal(b.http, 200);
  assert.equal(b.body.duplicate, true);
  assert.equal(a.body.request_id, b.body.request_id);
  assert.equal(await store.countLeads(), 1);
});

test("invalid weight is blocked on the server with a field error", async () => {
  const store = createMemoryStore();
  const r = await acceptRequest(payload({ config: { ...baseConfig, weight: 0 } }), { ip: "1.1.1.1", config: cfg(store) });
  assert.equal(r.http, 400);
  assert.equal(r.body.errors["config.weight"], "out_of_range");
  assert.equal(await store.countLeads(), 0);
});

test("anti-spam: honeypot and too-fast submissions are rejected honestly", async () => {
  const store = createMemoryStore();
  assert.equal((await acceptRequest(payload({ hp: "http://spam" }), { ip: "x", config: cfg(store) })).body.code, "spam_suspected");
  assert.equal((await acceptRequest(payload({ elapsedMs: 200 }), { ip: "x", config: cfg(store) })).body.code, "too_fast");
  assert.equal((await acceptRequest(payload({ elapsedMs: "9000" }), { ip: "x", config: cfg(store) })).body.code, "too_fast");
  assert.equal((await acceptRequest(payload({ idempotencyKey: "123" }), { ip: "x", config: cfg(store) })).http, 400);
  assert.equal(await store.countLeads(), 0);
});

test("rate limit per hashed IP answers 429", async () => {
  const store = createMemoryStore();
  const c = cfg(store, { rateLimit: { max: 3, windowSeconds: 600 } });
  const codes = [];
  for (let i = 0; i < 5; i++) codes.push((await acceptRequest(payload(), { ip: "198.51.100.1", config: c })).http);
  assert.deepEqual(codes, [201, 201, 201, 429, 429]);
  assert.equal((await acceptRequest(payload(), { ip: "198.51.100.2", config: c })).http, 201);
});

test("no store configured or store failure → 503, never a false success", async () => {
  assert.equal((await acceptRequest(payload(), { ip: "x", config: cfg(null) })).body.code, "intake_not_configured");
  const store = createMemoryStore();
  store.failNext = "store_timeout";
  const r = await acceptRequest(payload(), { ip: "x", config: cfg(store) });
  assert.equal(r.http, 503);
  assert.equal(r.body.status, "unavailable");
  assert.equal(r.body.request_id, undefined);
});

test("request content is never written to the console", async () => {
  const store = createMemoryStore();
  const seen = [];
  const orig = { log: console.log, error: console.error, warn: console.warn, info: console.info, debug: console.debug };
  for (const k of Object.keys(orig)) console[k] = (...a) => seen.push(a.join(" "));
  try {
    await acceptRequest(payload(), { ip: "x", config: cfg(store) });
    store.failNext = "store_error";
    await acceptRequest(payload(), { ip: "x", config: cfg(store) });
  } finally {
    Object.assign(console, orig);
  }
  assert.ok(!seen.join("\n").includes("tester@example.org"));
  assert.ok(!seen.join("\n").includes("Test Person"));
});

/* ------------------------------------------------------------------ retry schedule */

test("retry schedule: 8 attempts with growing delays, then final failure", async () => {
  assert.equal(MAX_ATTEMPTS, 8);
  assert.equal(nextAttemptAt(1, 0), RETRY_SCHEDULE_MS[0]);
  assert.equal(nextAttemptAt(7, 0), RETRY_SCHEDULE_MS[6]);
  assert.equal(nextAttemptAt(8, 0), null);
  const store = createMemoryStore();
  const r = await acceptRequest(payload(), { ip: "x", config: cfg(store) });
  const failing = { channel: "test", send: async () => ({ ok: false, errorCode: "smtp_connection" }) };
  let now = Date.now();
  let res;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    res = await deliver(store, failing, r.body.request_id, now);
    now += 25 * 3600e3;
  }
  assert.equal(res.state, "failed");
  const lead = await store.getLead(r.body.request_id);
  assert.equal(lead.notify.status, "failed");
  assert.equal(lead.notify.attempts, "8");
  assert.ok(lead.record, "the request stays stored after notification failure");
});

test("notification not configured keeps the request queued for later delivery", async () => {
  const store = createMemoryStore();
  const r = await acceptRequest(payload(), { ip: "x", config: cfg(store) });
  await afterAccept(cfg(store), r.body.request_id, true, { quickRetryMs: 0 });
  const lead = await store.getLead(r.body.request_id);
  assert.equal(lead.notify.status, "not_configured");
  assert.equal(await store.pendingCount(), 1);
  const sent = [];
  const ok = { channel: "test", send: async (rec) => (sent.push(rec.request_id), { ok: true, messageId: "m1" }) };
  const s = await processDue(store, ok, { now: Date.now() + 2 * 3600e3 });
  assert.equal(s.sent, 1);
  assert.deepEqual(sent, [r.body.request_id]);
  assert.equal((await store.getLead(r.body.request_id)).notify.status, "sent");
});

test("configuration: memory store refused in production; secrets required; channels resolved", () => {
  assert.equal(readConfig({ NODE_ENV: "production", LEAD_STORE: "memory" }).store, null);
  assert.equal(readConfig({ NODE_ENV: "production" }).adminPassword, null);
  assert.equal(readConfig({ NODE_ENV: "production", LEADS_ADMIN_PASSWORD: "short" }).adminPassword, null);
  assert.equal(resolveNotifier({ NODE_ENV: "production", SMTP_HOST: "smtp.gmail.com", LEAD_NOTIFY_TO: "gps@maximus.tennis" }), null);
  assert.equal(resolveNotifier({ NODE_ENV: "production", SMTP_HOST: "smtp.gmail.com", SMTP_USER: "u@maximus.tennis", SMTP_PASS: "x", LEAD_NOTIFY_TO: "gps@maximus.tennis" }).channel, "smtp");
  assert.equal(resolveNotifier({ NODE_ENV: "production", LEAD_WEBHOOK_URL: "http://example.org/x", LEAD_WEBHOOK_SECRET: "0123456789abcdef" }), null);
  assert.equal(resolveNotifier({ NODE_ENV: "production", LEAD_WEBHOOK_URL: "https://example.org/x", LEAD_WEBHOOK_SECRET: "0123456789abcdef" }).channel, "webhook");
});

test("telegram: chat resolved from the bot's own updates, stored, and reused", async () => {
  const store = createMemoryStore();
  const calls = [];
  const fetchImpl = async (url, init) => {
    const method = String(url).split("/").pop();
    calls.push(method);
    const payload = JSON.parse(init.body);
    if (method === "getUpdates") {
      return { ok: true, json: async () => ({ ok: true, result: [{ message: { chat: { id: 777123 } } }] }) };
    }
    assert.equal(payload.chat_id, "777123");
    assert.match(payload.text, /MAXIMUS — new request/);
    return { ok: true, json: async () => ({ ok: true, result: { message_id: 42 } }) };
  };
  const n = createTelegramNotifier({ token: "123456:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", chatId: null }, { fetchImpl, store });
  const record = { request_id: "MX-GEN-20260929-AAAAAA", created_at: new Date().toISOString(), purpose: "general", locale: "ru", contact };
  const first = await n.send(record);
  assert.equal(first.ok, true);
  assert.equal(first.messageId, "tg-42");
  assert.equal(await store.setting("telegram_chat"), "777123");
  // A fresh notifier takes the chat from the store: no second getUpdates.
  const n2 = createTelegramNotifier({ token: "123456:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", chatId: null }, { fetchImpl, store });
  assert.equal((await n2.send(record)).ok, true);
  assert.equal(calls.filter((c) => c === "getUpdates").length, 1);
  // Nobody has written to the bot yet: the request stays queued instead of being lost.
  const empty = createTelegramNotifier({ token: "123456:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", chatId: null }, {
    fetchImpl: async () => ({ ok: true, json: async () => ({ ok: true, result: [] }) }),
    store: createMemoryStore(),
  });
  assert.deepEqual(await empty.send(record), { ok: false, errorCode: "telegram_no_chat" });
});

test("configuration: telegram is accepted on the bot token alone and chosen first", () => {
  const token = "8123456789:AAHqWmVeryLongLookingTokenValue_x";
  assert.equal(telegramSettings({ TELEGRAM_BOT_TOKEN: "not-a-token" }), null);
  assert.deepEqual(telegramSettings({ TELEGRAM_BOT_TOKEN: token }), { token, chatId: null });
  assert.equal(resolveNotifier({ NODE_ENV: "production", TELEGRAM_BOT_TOKEN: token }).channel, "telegram");
  assert.equal(resolveNotifier({
    NODE_ENV: "production", TELEGRAM_BOT_TOKEN: token,
    SMTP_HOST: "smtp.gmail.com", SMTP_USER: "u@maximus.tennis", SMTP_PASS: "x", LEAD_NOTIFY_TO: "gps@maximus.tennis",
    LEAD_NOTIFY_CHANNEL: "smtp",
  }).channel, "smtp");
});

test("configuration: REST credentials are accepted under any Vercel variable prefix", () => {
  const url = "https://example.upstash.io";
  assert.deepEqual(readRestCredentials({ KV_REST_API_URL: url, KV_REST_API_TOKEN: "t1" }), { url, token: "t1" });
  assert.deepEqual(readRestCredentials({ UPSTASH_REDIS_REST_URL: url, UPSTASH_REDIS_REST_TOKEN: "t2" }), { url, token: "t2" });
  assert.deepEqual(readRestCredentials({ STORAGE_KV_REST_API_URL: url, STORAGE_KV_REST_API_TOKEN: "t3" }), { url, token: "t3" });
  assert.deepEqual(readRestCredentials({ LEADS_UPSTASH_REDIS_REST_URL: url, LEADS_UPSTASH_REDIS_REST_TOKEN: "t4" }), { url, token: "t4" });
  // A URL and a token from different databases are never combined.
  assert.deepEqual(readRestCredentials({ STORAGE_KV_REST_API_URL: url, OTHER_KV_REST_API_TOKEN: "t5" }), { url: undefined, token: undefined });
  // A prefixed pair configures the store exactly like the standard names.
  assert.notEqual(resolveStore({ STORAGE_KV_REST_API_URL: url, STORAGE_KV_REST_API_TOKEN: "t6" }), null);
  assert.equal(resolveStore({ NODE_ENV: "production" }), null);
});

/* ------------------------------------------------------------------ real redis through REST bridge */

// Pure tests have no dependency on this suite's infrastructure. Set INTAKE_REQUIRE_REDIS=1
// when the integration environment is expected to be present: missing prerequisites then fail.
function waitForReady(child, marker, timeoutMs, label) {
  child.stderr?.resume?.(); // drain diagnostics without printing process output
  return new Promise((resolve, reject) => {
    let settled = false;
    let output = "";
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.stdout.removeListener("data", onData);
      child.stdout.resume?.(); // keep a ready/noisy process from filling its output pipe
      if (error) { child.kill(); reject(error); } else resolve();
    };
    const onData = (d) => {
      output = (output + String(d)).slice(-4096);
      if (output.includes(marker)) finish();
    };
    const timer = setTimeout(() => finish(Object.assign(new Error(`${label} readiness timed out`), { code: `${label}_timeout` })), timeoutMs);
    child.stdout.on("data", onData);
    // Keep the listener after readiness, so a later process error is never unhandled.
    child.on("error", finish);
    child.once("exit", (code, signal) => finish(Object.assign(new Error(`${label} exited before readiness (${code ?? signal})`), { code: `${label}_exit` })));
  });
}

function listenLocal(server) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { server.close(); reject(Object.assign(new Error("local listen timed out"), { code: "listen_timeout" })); }, 2000);
    server.once("error", (e) => { clearTimeout(timer); reject(e); });
    server.listen(0, "127.0.0.1", () => { clearTimeout(timer); resolve(); });
  });
}

// This block is scoped: its before hook cannot block schema, memory or mock notification tests.
describe("local Redis integrations", () => {
let redis, bridge, upstash, unavailable;
const REDIS_PORT = 6391;
before(async () => {
  try {
    redis = await startTestRedis(REDIS_PORT);
    bridge = await startBridge({ redisPort: REDIS_PORT, token: "bridge-token" });
    upstash = createUpstashStore({ url: bridge.url, token: "bridge-token" });
    await upstash.ping();
  } catch (e) {
    if (bridge) bridge.close();
    await redis?.close();
    const expected = ["ENOENT", "EPERM", "EACCES"];
    if (process.env.INTAKE_REQUIRE_REDIS === "1" || !expected.includes(e.code)) throw e;
    unavailable = `local Redis integration unavailable: ${e.code}`;
  }
});
after(async () => {
  if (bridge) bridge.close();
  await redis?.close();
});
function integrationTest(name, run) {
  test(name, async (t) => {
    if (unavailable) { t.skip(unavailable); return; }
    await run(t);
  });
}

integrationTest("redis store: atomic idempotent create, index, pending queue, rate limit", async () => {
  assert.equal(await upstash.ping(), true);
  const p = payload();
  const c = cfg(upstash);
  const a = await acceptRequest(p, { ip: "192.0.2.10", config: c });
  const b = await acceptRequest(p, { ip: "192.0.2.10", config: c });
  assert.equal(a.http, 201);
  assert.equal(b.http, 200);
  assert.equal(a.body.request_id, b.body.request_id);
  const lead = await upstash.getLead(a.body.request_id);
  assert.equal(lead.record.contact.email, "tester@example.org");
  assert.equal(lead.notify.status, "pending");
  assert.ok((await upstash.listLeads(10)).some((l) => l.record.request_id === a.body.request_id));
  assert.ok((await upstash.dueNotifications(Date.now() + 1000, 50)).includes(a.body.request_id));
  const bad = createUpstashStore({ url: bridge.url, token: "wrong" });
  const r = await acceptRequest(payload(), { ip: "192.0.2.11", config: cfg(bad) });
  assert.equal(r.http, 503);
  const down = createUpstashStore({ url: "http://127.0.0.1:9", token: "x", timeoutMs: 1000 });
  assert.equal((await acceptRequest(payload(), { ip: "192.0.2.12", config: cfg(down) })).body.code, "store_unreachable");
});

integrationTest("redis store: lock prevents concurrent double delivery", async () => {
  const r = await acceptRequest(payload(), { ip: "192.0.2.20", config: cfg(upstash) });
  let calls = 0;
  const slow = { channel: "test", send: async () => { calls++; await new Promise((res) => setTimeout(res, 150)); return { ok: true, messageId: "m" }; } };
  const [x, y] = await Promise.all([deliver(upstash, slow, r.body.request_id), deliver(upstash, slow, r.body.request_id)]);
  assert.equal(calls, 1);
  assert.deepEqual([x.state, y.state].sort(), ["locked", "sent"]);
});

/* ------------------------------------------------------------------ webhook channel */

integrationTest("webhook: signed delivery, failure schedules a retry, request stays stored", async () => {
  const secret = "whsec-0123456789abcdef";
  const received = [];
  let fail = true;
  const srv = http.createServer(async (req, res) => {
    let body = "";
    for await (const c of req) body += c;
    received.push({ headers: req.headers, body });
    res.writeHead(fail ? 500 : 204);
    res.end();
  });
  try {
  await listenLocal(srv);
  const url = `http://127.0.0.1:${srv.address().port}/hook`;
  const notifier = createWebhookNotifier({ url, secret });
  const r = await acceptRequest(payload(), { ip: "192.0.2.30", config: cfg(upstash) });
  const first = await deliver(upstash, notifier, r.body.request_id);
  assert.equal(first.state, "retry");
  assert.equal(first.errorCode, "http_500");
  const afterFail = await upstash.getLead(r.body.request_id);
  assert.equal(afterFail.notify.status, "retry");
  assert.ok(Date.parse(afterFail.notify.next_attempt_at) > Date.now());
  fail = false;
  const s = await processDue(upstash, notifier, { now: Date.now() + 61e3, limit: 50 });
  assert.ok(s.sent >= 1);
  const last = received[received.length - 1];
  const expected = crypto.createHmac("sha256", secret).update(`${last.headers["x-maximus-timestamp"]}.${last.body}`).digest("hex");
  assert.equal(last.headers["x-maximus-signature"], `sha256=${expected}`);
  assert.equal(JSON.parse(last.body).request_id, r.body.request_id);
  assert.equal((await upstash.getLead(r.body.request_id)).notify.status, "sent");
  } finally { srv.close(); srv.closeAllConnections?.(); }
});

/* ------------------------------------------------------------------ SMTP channel */

integrationTest("SMTP: plain-text notification with Reply-To; unreachable server schedules a retry", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "mx-smtp-"));
  const port = 2525 + Math.floor(Math.random() * 1000);
  const sink = spawn("python3", ["tests/smtp_sink.py", dir, String(port)], { stdio: ["ignore", "pipe", "pipe"] });
  try {
    await waitForReady(sink, "smtp sink", 5000, "smtp");
  } catch (e) {
    sink.kill();
    if (process.env.INTAKE_REQUIRE_SMTP === "1") throw e;
    t.skip(`local SMTP sink unavailable: ${e.code || "startup_error"}`);
    return;
  }
  try {
    const env = { NODE_ENV: "test", SMTP_HOST: "127.0.0.1", SMTP_PORT: String(port), SMTP_SECURE: "false", SMTP_REQUIRE_TLS: "false", SMTP_AUTH: "none", LEAD_NOTIFY_TO: "gps@maximus.tennis", LEAD_NOTIFY_FROM: "website@maximus.tennis" };
    const notifier = resolveNotifier(env);
    assert.equal(notifier.channel, "smtp");
    const p = payload({ fields: { ...contact, message: "Line one\n<b>not html</b>" } });
    const r = await acceptRequest(p, { ip: "192.0.2.40", config: cfg(upstash) });
    const d = await deliver(upstash, notifier, r.body.request_id);
    assert.equal(d.state, "sent");
    const files = readdirSync(dir);
    assert.equal(files.length, 1);
    const eml = readFileSync(join(dir, files[0]), "utf8");
    assert.match(eml, new RegExp(`Subject: \\[MAXIMUS\\] ${r.body.request_id}`));
    assert.match(eml, /Reply-To: tester@example\.org/);
    assert.match(eml, /X-Envelope-To: gps@maximus\.tennis/);
    assert.match(eml, /Content-Type: text\/plain/);
    assert.ok(!/text\/html/.test(eml));
    const lead = await upstash.getLead(r.body.request_id);
    assert.equal(lead.notify.status, "sent");
    assert.ok(lead.notify.message_id.length > 0);

    const offline = resolveNotifier({ ...env, SMTP_PORT: "9" });
    const r2 = await acceptRequest(payload(), { ip: "192.0.2.41", config: cfg(upstash) });
    const d2 = await deliver(upstash, offline, r2.body.request_id);
    assert.equal(d2.state, "retry");
    assert.equal(d2.errorCode, "smtp_connection");
    assert.ok(await upstash.getLead(r2.body.request_id));
  } finally {
    sink.kill();
  }
});

}); // local Redis integrations

test("notification message contains validated content only and a neutral status line", () => {
  const { subject, text } = buildMessage({ request_id: "MX-CFG-20260921-ABCDEF", created_at: "2026-09-21T10:00:00.000Z", purpose: "config", locale: "ru", contact, details: {}, config: { series: "spin", customWeight: 301, basis: "unstrung" }, context: {}, attribution: {} });
  assert.equal(subject, "[MAXIMUS] MX-CFG-20260921-ABCDEF | config | ru");
  assert.match(text, /Requested weight \(g\) — technical review: 301/);
  assert.match(text, /not an order/);
});

/* ------------------------------------------------------------------ visit counting */

test("a page view is counted as aggregate fields, with no identifier of any kind", async () => {
  const { visitFields } = await import("../lib/visits.js");
  const req = {
    headers: new Map([
      ["user-agent", "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15"],
      ["accept", "text/html,application/xhtml+xml"],
      ["x-vercel-ip-country", "ae"],
      ["referer", "https://www.google.com/search?q=maximus+tennis&secret=abc"],
      ["host", "maximus.tennis"],
    ]),
  };
  req.headers.get = Map.prototype.get.bind(req.headers);
  const f = visitFields(req, "ru", "/precision");
  assert.deepEqual(f, ["all", "loc:ru", "c:AE", "src:google.com", "dev:mobile", "p:/precision"]);
  const joined = f.join(" ");
  assert.ok(!joined.includes("secret"));
  assert.ok(!joined.includes("search"));
});

test("bots, prefetches and non-page requests are not counted", async () => {
  const { visitFields } = await import("../lib/visits.js");
  const make = (h) => {
    const m = new Map(Object.entries(h));
    return { headers: { get: (k) => (m.has(k) ? m.get(k) : null) } };
  };
  assert.equal(visitFields(make({ "user-agent": "Googlebot/2.1", accept: "text/html" }), "en", "/"), null);
  assert.equal(visitFields(make({ "user-agent": "Mozilla/5.0", accept: "text/html", "next-router-prefetch": "1" }), "en", "/"), null);
  assert.equal(visitFields(make({ "user-agent": "Mozilla/5.0", accept: "application/json" }), "en", "/"), null);
  assert.equal(visitFields(make({ accept: "text/html" }), "en", "/"), null);
});

test("a visit written with no store configured is a no-op, never an error", async () => {
  const { recordVisit } = await import("../lib/visits.js");
  assert.equal(await recordVisit({}, ["all"]), false);
});

test("visits are written to the day's hash and expire on their own", async () => {
  const { recordVisit, dayKey } = await import("../lib/visits.js");
  const sent = [];
  const fake = async (url, init) => {
    sent.push({ url, body: JSON.parse(init.body) });
    return { ok: true };
  };
  const now = new Date("2026-10-02T09:00:00Z");
  const ok = await recordVisit(
    { KV_REST_API_URL: "https://store.example", KV_REST_API_TOKEN: "t" },
    ["all", "c:AE"],
    now,
    fake
  );
  assert.equal(ok, true);
  assert.equal(sent[0].url, "https://store.example/pipeline");
  assert.deepEqual(sent[0].body[0], ["HINCRBY", dayKey(now), "all", "1"]);
  assert.deepEqual(sent[0].body[1], ["HINCRBY", dayKey(now), "c:AE", "1"]);
  assert.equal(sent[0].body[2][0], "EXPIRE");
});

/* ------------------------------------------------------------------ harness failure regressions (no sockets/processes) */
function fakeSocket() {
  const socket = new EventEmitter();
  socket.writes = [];
  socket.write = (data) => { socket.writes.push(data); };
  socket.destroy = () => { socket.destroyed = true; };
  return socket;
}
function fakeServer() {
  const server = new EventEmitter();
  server.close = () => { server.closed = true; };
  server.closeAllConnections = () => { server.connectionsClosed = true; };
  server.address = () => ({ port: 12345 });
  server.listen = (_port, _host, ready) => queueMicrotask(ready);
  return server;
}
function fakeChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.kill = () => { child.killed = true; };
  return child;
}

test("harness: spawn error and early exit reject readiness and stop the child", async () => {
  for (const event of ["error", "exit"]) {
    const child = fakeChild();
    const wait = waitForReady(child, "ready", 100, "redis");
    queueMicrotask(() => event === "error" ? child.emit("error", Object.assign(new Error("missing"), { code: "ENOENT" })) : child.emit("exit", 1));
    await assert.rejects(wait, { code: event === "error" ? "ENOENT" : "redis_exit" });
    assert.equal(child.killed, true);
  }
});
test("harness: readiness requires the child's marker and has a deadline", async () => {
  const child = fakeChild();
  const wait = waitForReady(child, "ready", 100, "redis");
  child.stdout.emit("data", "rea"); child.stdout.emit("data", "dy");
  await wait;
  assert.equal(child.killed, undefined);
  const silent = fakeChild();
  await assert.rejects(waitForReady(silent, "ready", 15, "redis"), { code: "redis_timeout" });
  assert.equal(silent.killed, true);
});
test("bridge: connection error and connection deadline reject readiness", async () => {
  const socket = fakeSocket();
  const conn = new RedisConn(1, { connectImpl: () => socket, timeoutMs: 100 });
  const assertion = assert.rejects(conn.ready, { code: "EPERM" });
  socket.emit("error", Object.assign(new Error("denied"), { code: "EPERM" }));
  await assertion; assert.equal(socket.destroyed, true);
  const silent = fakeSocket();
  const waiting = new RedisConn(1, { connectImpl: () => silent, timeoutMs: 15 });
  await assert.rejects(waiting.ready, { code: "redis_connect_timeout" });
  assert.equal(silent.destroyed, true);
});
test("bridge: socket close rejects every queued and future command", async () => {
  const socket = fakeSocket();
  const conn = new RedisConn(1, { connectImpl: () => socket });
  socket.emit("connect"); await conn.ready;
  const a = assert.rejects(conn.send(["PING"]), { code: "redis_connection_closed" });
  const b = assert.rejects(conn.send(["GET", "x"]), { code: "redis_connection_closed" });
  await Promise.resolve(); socket.emit("close");
  await Promise.all([a, b]);
  await assert.rejects(conn.send(["PING"]), { code: "redis_connection_closed" });
  assert.equal(conn.queue.length, 0);
});
test("bridge: command deadline closes the whole RESP queue", async () => {
  const socket = fakeSocket();
  const conn = new RedisConn(1, { connectImpl: () => socket, timeoutMs: 15 });
  socket.emit("connect"); await conn.ready;
  await Promise.all([assert.rejects(conn.send(["PING"]), { code: "redis_command_timeout" }), assert.rejects(conn.send(["GET", "x"]), { code: "redis_command_timeout" })]);
  assert.equal(socket.destroyed, true); assert.equal(conn.queue.length, 0);
});
test("bridge: fragmented RESP replies resolve commands in order", async () => {
  const socket = fakeSocket();
  const conn = new RedisConn(1, { connectImpl: () => socket });
  socket.emit("connect"); await conn.ready;
  const a = conn.send(["PING"]), b = conn.send(["GET", "x"]);
  await Promise.resolve();
  socket.emit("data", Buffer.from("+PO")); socket.emit("data", Buffer.from("NG\r\n$3\r\nfoo\r\n"));
  assert.equal(await a, "PONG"); assert.equal(await b, "foo"); conn.close();
});
test("bridge: invalid RESP rejects commands without leaving a queue", async () => {
  const socket = fakeSocket();
  const conn = new RedisConn(1, { connectImpl: () => socket });
  socket.emit("connect"); await conn.ready;
  const assertion = assert.rejects(conn.send(["PING"]), /RESP parse error/);
  await Promise.resolve(); socket.emit("data", Buffer.from("?bad\r\n"));
  await assertion; assert.equal(socket.destroyed, true);
});
test("bridge: listen failure and listen timeout reject startup and clean resources", async () => {
  for (const mode of ["error", "timeout"]) {
    const socket = fakeSocket(), server = fakeServer();
    server.listen = () => { if (mode === "error") queueMicrotask(() => server.emit("error", Object.assign(new Error("denied"), { code: "EPERM" }))); };
    const result = startBridge({ redisPort: 1, token: "synthetic", timeoutMs: 15, connectImpl: () => { queueMicrotask(() => socket.emit("connect")); return socket; }, createServerImpl: () => server });
    await assert.rejects(result, { code: mode === "error" ? "EPERM" : "bridge_listen_timeout" });
    assert.equal(socket.destroyed, true); assert.equal(server.closed, true);
  }
});
test("bridge: backend failure returns HTTP 503 rather than an unhandled rejection", async () => {
  const socket = fakeSocket(), server = fakeServer(); let handler;
  const bridge = await startBridge({ redisPort: 1, token: "synthetic", connectImpl: () => { queueMicrotask(() => socket.emit("connect")); return socket; }, createServerImpl: (fn) => { handler = fn; return server; } });
  socket.emit("close");
  const req = { headers: { authorization: "Bearer synthetic" }, url: "/", async *[Symbol.asyncIterator]() { yield '["PING"]'; } };
  const res = { writeHead(status) { this.status = status; }, end(body) { this.body = body; } };
  await handler(req, res); assert.equal(res.status, 503); assert.equal(JSON.parse(res.body).error, "redis_unavailable");
  bridge.close(); assert.equal(server.connectionsClosed, true);
});
