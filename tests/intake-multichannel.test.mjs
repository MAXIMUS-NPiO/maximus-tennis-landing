/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createMemoryStore, createUpstashStore } from "../lib/intake/store.js";
import { resolveNotifier, processingSummary } from "../lib/intake/config.js";
import { createSmtpNotifier, deliver, processDue, MAX_ATTEMPTS } from "../lib/intake/notify.js";
import { startBridge, startTestRedis } from "./redis-rest-bridge.mjs";
import { startNodeSmtpSink } from "./node-smtp-sink.mjs";

const NOW = Date.parse("2026-10-12T12:00:00Z");
const env = {
  NODE_ENV: "production", TELEGRAM_BOT_TOKEN: "123456:synthetic-token-01234567890123456789", TELEGRAM_CHAT_ID: "123456789",
  SMTP_HOST: "smtp.gmail.com", SMTP_PORT: "465", SMTP_USER: "website@maximus.tennis", SMTP_PASS: "synthetic-test-value",
  LEAD_NOTIFY_TO: "gps@maximus.tennis", LEAD_NOTIFY_EMAIL_COPY: "true",
};
async function lead(store, id = "MX-TEST-20261012-MAIL", extra = {}) {
  const record = {
    request_id: id, created_at: new Date(NOW).toISOString(), purpose: "technical", locale: "en",
    contact: { name: "TEST — synthetic notification check", email: "synthetic@example.invalid" },
    details: { message: "TEST only; no order or payment." }, context: {}, ...extra,
  };
  await store.createLead({ idemHash: id, requestId: id, record });
  return id;
}
function channels(telegram, smtp) {
  const primary = { channel: "telegram", send: telegram };
  return { ...primary, channels: [primary, { channel: "smtp", send: smtp }] };
}
const ok = (messageId) => ({ ok: true, messageId });

test("email copy is explicit, keeps Telegram methods, and does not duplicate SMTP as primary", () => {
  for (const flag of [undefined, "false", "TRUE", "1"]) {
    const n = resolveNotifier({ ...env, LEAD_NOTIFY_EMAIL_COPY: flag });
    assert.equal(n.channel, "telegram");
    assert.equal(n.channels, undefined);
  }
  const n = resolveNotifier(env);
  assert.equal(n.channel, "telegram");
  assert.deepEqual(n.channels.map((c) => c.channel), ["telegram", "smtp"]);
  assert.equal(typeof n.resolveChat, "function");
  assert.equal(typeof n.diagnose, "function");
  const smtp = resolveNotifier({ ...env, LEAD_NOTIFY_CHANNEL: "smtp" });
  assert.equal(smtp.channel, "smtp");
  assert.equal(smtp.channels, undefined);
  assert.equal(resolveNotifier({ ...env, TELEGRAM_BOT_TOKEN: undefined }).channel, "smtp");
  const webhook = resolveNotifier({ ...env, LEAD_NOTIFY_CHANNEL: "webhook", LEAD_WEBHOOK_URL: "https://example.invalid/hook", LEAD_WEBHOOK_SECRET: "synthetic-webhook-secret" });
  assert.deepEqual(webhook.channels.map((c) => c.channel), ["webhook", "smtp"]);
  assert.deepEqual(processingSummary(env).notifications, ["telegram", "google-workspace-smtp"]);
  assert.equal(processingSummary(env).notification, "telegram");
  assert.equal(processingSummary({ ...env, SMTP_PASS: undefined }).emailCopy, "not_configured");
});

test("missing SMTP credentials preserve Telegram and queue only the unsent copy until configured", async () => {
  const store = createMemoryStore(), id = await lead(store);
  let telegram = 0, smtp = 0;
  const deps = {
    store,
    fetchImpl: async () => { telegram++; return { ok: true, status: 200, json: async () => ({ ok: true, result: { message_id: 42 } }) }; },
    transportFactory: () => ({ sendMail: async () => { smtp++; return { messageId: "mail-test", rejected: [] }; } }),
  };
  const first = await deliver(store, resolveNotifier({ ...env, SMTP_PASS: undefined }, deps), id, NOW);
  assert.equal(first.state, "not_configured");
  assert.equal(telegram, 1);
  assert.equal(smtp, 0);
  const state = (await store.getLead(id)).notify;
  assert.equal(state.channels.telegram.status, "sent");
  assert.equal(state.channels.smtp.status, "not_configured");
  assert.equal(state.channels.smtp.attempts, 0);
  assert.deepEqual(await store.dueNotifications(NOW + 3599e3), []);
  const retry = await processDue(store, resolveNotifier(env, deps), { now: NOW + 3600e3 });
  assert.equal(retry.sent, 1);
  assert.equal(telegram, 1);
  assert.equal(smtp, 1);
  assert.equal(await store.pendingCount(), 0);
});

for (const failing of ["smtp", "telegram"]) {
  test(`${failing} failure does not block the other channel; retry sends only the failed channel`, async () => {
    const store = createMemoryStore(), id = await lead(store);
    const calls = { smtp: 0, telegram: 0 };
    let fail = true;
    const send = (channel) => async () => {
      calls[channel]++;
      if (fail && channel === failing) return { ok: false, errorCode: "synthetic_transient" };
      return ok(`${channel}-test`);
    };
    assert.equal((await deliver(store, channels(send("telegram"), send("smtp")), id, NOW)).state, "retry");
    assert.deepEqual(calls, { smtp: 1, telegram: 1 });
    const first = (await store.getLead(id)).notify.channels;
    assert.equal(first[failing].status, "retry");
    assert.equal(first[failing === "smtp" ? "telegram" : "smtp"].status, "sent");
    fail = false;
    // Recreate the notifier to simulate another worker; no in-process completion cache.
    assert.equal((await deliver(store, channels(send("telegram"), send("smtp")), id, NOW + 60e3)).state, "sent");
    assert.equal(calls[failing], 2);
    assert.equal(calls[failing === "smtp" ? "telegram" : "smtp"], 1);
    assert.equal(await store.pendingCount(), 0);
    await deliver(store, channels(send("telegram"), send("smtp")), id, NOW + 120e3);
    assert.equal(calls[failing], 2);
  });
}

test("a thrown primary error is redacted and still attempts SMTP", async () => {
  const store = createMemoryStore(), id = await lead(store);
  let smtp = 0;
  await deliver(store, channels(async () => { throw new Error("PRIVATE REQUEST / SECRET"); }, async () => { smtp++; return ok("smtp-test"); }), id, NOW);
  assert.equal(smtp, 1);
  const notify = (await store.getLead(id)).notify;
  assert.equal(notify.channels.telegram.last_error, "notification_exception");
  assert.equal(notify.channels.smtp.status, "sent");
  assert.ok(!JSON.stringify(notify).includes("PRIVATE"));
});

test("completion is durable before the second send and concurrent triggers cannot duplicate either channel", async () => {
  const store = createMemoryStore(), id = await lead(store);
  let enter, release;
  const entered = new Promise((resolve) => { enter = resolve; });
  const gate = new Promise((resolve) => { release = resolve; });
  let telegram = 0, smtp = 0;
  const n = channels(async () => { telegram++; enter(); await gate; return ok("tg-test"); }, async () => {
    smtp++;
    assert.equal((await store.getLead(id)).notify.channels.telegram.status, "sent");
    return ok("smtp-test");
  });
  const first = deliver(store, n, id, NOW);
  await entered;
  assert.equal((await deliver(store, n, id, NOW)).state, "locked");
  release();
  assert.equal((await first).state, "sent");
  assert.equal(telegram, 1);
  assert.equal(smtp, 1);
});

test("permanent failure exhausts only its own budget and never resends the successful channel", async () => {
  const store = createMemoryStore(), id = await lead(store);
  let smtp = 0, telegram = 0;
  const n = channels(async () => { telegram++; return ok("tg-test"); }, async () => { smtp++; return { ok: false, errorCode: "smtp_rejected" }; });
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) await deliver(store, n, id, NOW + attempt * 86400e3);
  const record = await store.getLead(id);
  assert.equal(record.notify.status, "failed");
  assert.equal(record.notify.channels.smtp.attempts, MAX_ATTEMPTS);
  assert.equal(record.notify.channels.telegram.attempts, 1);
  assert.equal(telegram, 1);
  assert.equal(smtp, MAX_ATTEMPTS);
  assert.equal(await store.pendingCount(), 0);
  assert.equal((await deliver(store, n, id, NOW + 10 * 86400e3)).state, "failed");
  assert.equal(smtp, MAX_ATTEMPTS);
  assert.equal(record.record.contact.name, "TEST — synthetic notification check");
  assert.equal((await deliver(store, channels(async () => assert.fail("manual retry must preserve sent Telegram"), async () => ok("smtp-recovered")), id, NOW + 11 * 86400e3, { forceRetry: true })).state, "sent");
});

test("queue processing respects independent retry deadlines", async () => {
  const store = createMemoryStore(), id = await lead(store);
  await store.saveNotificationState(id, {
    telegram: { status: "retry", attempts: 4, last_error: "telegram_timeout", next_attempt_at: new Date(NOW + 3600e3).toISOString() },
    smtp: { status: "retry", attempts: 1, last_error: "smtp_connection", next_attempt_at: new Date(NOW).toISOString() },
  }, NOW);
  let telegram = 0, smtp = 0;
  const n = channels(async () => { telegram++; return ok("tg-test"); }, async () => { smtp++; return ok("smtp-test"); });
  assert.equal((await processDue(store, n, { now: NOW })).retry, 1);
  assert.equal(telegram, 0);
  assert.equal(smtp, 1);
  assert.deepEqual(await store.dueNotifications(NOW + 3599e3), []);
  assert.equal((await processDue(store, n, { now: NOW + 3600e3 })).sent, 1);
  assert.equal(telegram, 1);
  assert.equal(smtp, 1);
});

test("legacy sent records never backfill email, even when notification configuration disappears", async () => {
  const store = createMemoryStore(), id = await lead(store);
  await store.recordAttempt(id, { ok: true, messageId: "legacy-tg" });
  const mustNotSend = async () => { assert.fail("legacy sent request must not be replayed"); };
  assert.equal((await deliver(store, channels(mustNotSend, mustNotSend), id, NOW)).state, "sent");
  assert.equal((await deliver(store, null, id, NOW)).state, "sent");
  const notify = (await store.getLead(id)).notify;
  assert.equal(notify.channels, undefined);
  assert.equal(notify.message_id, "legacy-tg");
});

test("disabling the copy pauses an outstanding email without replaying Telegram or claiming completion", async () => {
  const store = createMemoryStore(), id = await lead(store);
  let telegram = 0, smtp = 0;
  const tg = async () => { telegram++; return ok("tg-test"); };
  await deliver(store, channels(tg, async () => { smtp++; return { ok: false, errorCode: "smtp_connection" }; }), id, NOW);
  assert.equal((await deliver(store, { channel: "telegram", send: tg }, id, NOW + 60e3)).state, "not_configured");
  assert.equal(telegram, 1);
  assert.equal(smtp, 1);
  const state = (await store.getLead(id)).notify.channels.smtp;
  assert.equal(state.status, "not_configured");
  assert.equal(state.attempts, 1);
});

test("Baby Tennis events remain Telegram-only in the shared retry queue", async () => {
  const store = createMemoryStore(), id = await lead(store, "MX-TEST-BABY", { context: { source: "maximus-baby-tennis" } });
  let telegram = 0;
  const n = channels(async () => { telegram++; return ok("tg-test"); }, async () => assert.fail("Baby Tennis must not acquire an email copy"));
  assert.equal((await deliver(store, n, id, NOW)).state, "sent");
  assert.equal(telegram, 1);
  assert.equal((await store.getLead(id)).notify.channels, undefined);
});

test("SMTP sends only to the configured owner; requester is Reply-To, never a recipient", async () => {
  const store = createMemoryStore(), id = await lead(store);
  const messages = [];
  const n = resolveNotifier(env, {
    fetchImpl: async () => ({ status: 200, json: async () => ({ ok: true, result: { message_id: 7 } }) }),
    transportFactory: () => ({ sendMail: async (message) => { messages.push(message); return { rejected: [], messageId: "synthetic-mail" }; } }),
  });
  assert.equal((await deliver(store, n, id, NOW)).state, "sent");
  assert.equal(messages.length, 1);
  assert.equal(messages[0].to, "gps@maximus.tennis");
  assert.equal(messages[0].replyTo, "synthetic@example.invalid");
  assert.equal(messages[0].cc, undefined);
  assert.equal(messages[0].bcc, undefined);
  assert.equal(messages[0].headers["X-Maximus-Request-Id"], id);
  assert.equal(messages[0].subject, `[MAXIMUS] ${id} | technical | en`);
});

test("Upstash checkpoint atomically writes channel state and retry queue without secrets", async () => {
  const calls = [];
  const store = createUpstashStore({ url: "https://store.example.invalid", token: "synthetic", fetchImpl: async (_url, init) => { calls.push(JSON.parse(init.body)); return { ok: true, json: async () => ({ result: 1 }) }; } });
  await store.saveNotificationState("MX-TEST", {
    telegram: { status: "sent", attempts: 1, message_id: "tg-test" },
    smtp: { status: "retry", attempts: 1, last_error: "smtp_connection", next_attempt_at: new Date(NOW + 60e3).toISOString() },
  }, NOW);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "EVAL");
  assert.match(calls[0][1], /HSET/);
  assert.match(calls[0][1], /ZADD/);
  assert.match(calls[0][1], /ZREM/);
  assert.equal(calls[0][6], String(NOW + 60e3));
  const state = Object.fromEntries(Array.from({ length: (calls[0].length - 7) / 2 }, (_, i) => [calls[0][7 + 2 * i], calls[0][8 + 2 * i]]));
  assert.equal(state.status, "retry");
  assert.equal(JSON.parse(state.channels).telegram.message_id, "tg-test");
  assert.ok(!JSON.stringify(calls).includes(env.SMTP_PASS));
});

test("loopback SMTP accepts one owner-only copy for technical and config requests", async (t) => {
  const sink = await startNodeSmtpSink();
  t.after(() => sink.close());
  const store = createMemoryStore();
  let telegram = 0;
  const smtp = createSmtpNotifier({ host: "127.0.0.1", port: sink.port, secure: false, requireTLS: false, ignoreTLS: true, from: "website@maximus.tennis", to: "gps@maximus.tennis" });
  const n = channels(async () => { telegram++; return ok("tg-test"); }, smtp.send);
  for (const purpose of ["technical", "config"]) {
    const id = await lead(store, `MX-TEST-${purpose.toUpperCase()}`, { purpose });
    assert.equal((await deliver(store, n, id, NOW)).state, "sent");
    await deliver(store, n, id, NOW);
  }
  assert.equal(telegram, 2);
  assert.equal(sink.messages.length, 2);
  for (const message of sink.messages) {
    assert.deepEqual(message.to, ["<gps@maximus.tennis>"]);
    assert.match(message.raw, /Reply-To: synthetic@example\.invalid/);
    assert.match(message.raw, /Subject: \[MAXIMUS\] MX-TEST-/);
  }
});

test("real Redis survives adapter restart and preserves per-channel completion", async (t) => {
  let redis;
  try { redis = await startTestRedis(6409); }
  catch (error) {
    if (error.code !== "ENOENT" || process.env.INTAKE_REQUIRE_REDIS === "1") throw error;
    t.skip("redis-server is not installed"); return;
  }
  t.after(() => redis.close());
  const bridge = await startBridge({ redisPort: 6409, token: "synthetic-test-token" });
  t.after(() => bridge.close());
  const store = createUpstashStore({ url: bridge.url, token: "synthetic-test-token" });
  const id = await lead(store);
  let telegram = 0, smtp = 0;
  await deliver(store, channels(async () => { telegram++; return ok("tg-test"); }, async () => { smtp++; return { ok: false, errorCode: "smtp_connection" }; }), id, NOW);
  const restarted = createUpstashStore({ url: bridge.url, token: "synthetic-test-token" });
  assert.equal((await restarted.getLead(id)).notify.channels.telegram.status, "sent");
  assert.deepEqual(await restarted.dueNotifications(NOW + 60e3), [id]);
  await deliver(restarted, channels(async () => { telegram++; return ok("tg-again"); }, async () => { smtp++; return ok("smtp-test"); }), id, NOW + 60e3);
  assert.equal(telegram, 1);
  assert.equal(smtp, 2);
  assert.equal((await restarted.getLead(id)).notify.status, "sent");
  assert.equal(await restarted.pendingCount(), 0);
});
