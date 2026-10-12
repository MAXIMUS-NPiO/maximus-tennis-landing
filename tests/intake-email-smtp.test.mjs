/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { startNodeSmtpSink } from "./node-smtp-sink.mjs";
import { createMemoryStore } from "../lib/intake/store.js";
import { readConfig } from "../lib/intake/config.js";
import { acceptRequest } from "../lib/intake/service.js";
import { deliver } from "../lib/intake/notify.js";

test("loopback SMTP copies technical/config requests only to the owner and preserves Telegram once", async () => {
  const sink = await startNodeSmtpSink();
  try {
    const store = createMemoryStore();
    const telegramMessages = [];
    const env = {
      NODE_ENV: "test", LEAD_NOTIFY_EMAIL_COPY: "true", LEAD_NOTIFY_CHANNEL: "telegram",
      TELEGRAM_BOT_TOKEN: "123456:LOCAL_TEST_TOKEN_NEVER_USED_EXTERNALLY", TELEGRAM_CHAT_ID: "123456",
      SMTP_HOST: "127.0.0.1", SMTP_PORT: String(sink.port), SMTP_SECURE: "false",
      SMTP_REQUIRE_TLS: "false", SMTP_AUTH: "none",
      LEAD_NOTIFY_TO: "gps@maximus.tennis", LEAD_NOTIFY_FROM: "gps@maximus.tennis",
    };
    const config = readConfig(env, { store, fetchImpl: async (url, options) => {
      assert.match(url, /\/sendMessage$/);
      telegramMessages.push(JSON.parse(options.body));
      return { status: 200, json: async () => ({ ok: true, result: { message_id: telegramMessages.length } }) };
    } });
    for (const purpose of ["technical", "config"]) {
      const payload = {
        purpose, locale: "en", consent: true, hp: "", elapsedMs: 5000, idempotencyKey: crypto.randomUUID(),
        fields: {
          name: "TEST LOCAL EMAIL COPY", email: "gps@maximus.tennis", role: "player", country: "Test country",
          message: "TEST: synthetic local notification; no customer, order or payment.",
          ...(purpose === "technical" ? { targets: "TEST delivery", use: "TEST only" } : {}),
        },
        ...(purpose === "config" ? { config: { series: "great", cls: "P1.5", mode: "listed", weight: 272, grip: "L3", setType: "individual", sets: 1, use: "play", ptype: "none" } } : {}),
      };
      const accepted = await acceptRequest(payload, { ip: "192.0.2.1", config });
      assert.equal(accepted.http, 201);
      const id = accepted.requestId;
      assert.equal((await deliver(store, config.notifier, id)).state, "sent");
      assert.equal((await deliver(store, config.notifier, id)).state, "sent");
      const message = sink.messages.at(-1);
      assert.deepEqual(message.to, ["<gps@maximus.tennis>"]);
      assert.equal(message.from, "<gps@maximus.tennis>");
      const raw = message.raw.replace(/\r\n[ \t]+/g, " ");
      assert.ok(raw.includes(`Subject: [MAXIMUS] ${id} | ${purpose} | en`));
      assert.match(raw, /Reply-To: gps@maximus\.tennis/);
      assert.match(raw, /Content-Type: text\/plain/);
      assert.doesNotMatch(raw, /^(?:Cc|Bcc):/im);
      const lead = await store.getLead(id);
      assert.equal(lead.notify.channels.telegram.status, "sent");
      assert.equal(lead.notify.channels.smtp.status, "sent");
      assert.ok(lead.notify.channels.smtp.message_id);
    }
    assert.equal(sink.messages.length, 2);
    assert.equal(telegramMessages.length, 2);
    assert.ok(telegramMessages.every((message) => message.chat_id === "123456"));
  } finally {
    await sink.close();
  }
});
