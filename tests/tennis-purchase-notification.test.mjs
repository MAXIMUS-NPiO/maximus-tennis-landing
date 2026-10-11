/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { buildMessage, createSmtpNotifier } from '../lib/intake/notify.js';
import { acceptRequest } from '../lib/intake/service.js';
import { createMemoryStore } from '../lib/intake/store.js';

const base = () => ({ request_id: 'MX-CFG-20261011-ABCDEF', created_at: '2026-10-11T00:00:00.000Z', purpose: 'config', locale: 'en', contact: { name: 'Synthetic client', email: 'client@example.invalid' }, details: {}, config: { series: 'great', weight: 272 }, context: { page: '/en/build' }, attribution: {} });
const interest = request => ({ ...base(), purchaseIntent: 'goods_with_program_interest', programRequest: request });

test('legacy message bytes and subject stay unchanged without new purchase fields', () => {
  assert.deepEqual(buildMessage(base()), {
    subject: '[MAXIMUS] MX-CFG-20261011-ABCDEF | config | en',
    text: 'Request ID: MX-CFG-20261011-ABCDEF\nReceived (UTC): 2026-10-11T00:00:00.000Z\nPurpose: config\nLocale: en\n\n== Contact ==\nName: Synthetic client\nEmail: client@example.invalid\n\n== Configuration request ==\nSeries: great\nListed weight (g): 272\n\n== Context ==\npage: /en/build\n\nStatus: accepted for review. This is a request, not an order, a price or a manufacturing commitment.\nReply to the requester using the Reply-To address.',
  });
});

test('goods-only notification preserves choice without program amounts, rates or enrollment claims', () => {
  const message = buildMessage({ ...base(), purchaseIntent: 'goods_only' });
  assert.match(message.text, /Purchase intention: goods_only/);
  assert.doesNotMatch(message.text, /Requested principal|Program status|rateBps|20%/);
  assert.equal(message.subject, buildMessage(base()).subject);
});

test('terms-only notification does not invent a principal, currency or accepted agreement', () => {
  const message = buildMessage(interest({ status: 'terms_requested' }));
  assert.match(message.text, /Purchase intention: goods_with_program_interest/);
  assert.match(message.text, /Program status: terms_requested/);
  assert.match(message.text, /No program terms accepted, enrollment, investment payment or funds posting\./);
  assert.doesNotMatch(message.text, /Requested principal|Requested currency|20%/);
});

test('notification formats exact canonical requested minor units in every supported currency', () => {
  for (const currency of ['EUR', 'AED', 'USD']) {
    const message = buildMessage(interest({ status: 'terms_requested', requestedPrincipalMinor: '123450', currency }));
    assert.ok(message.text.includes(`Requested principal: 1234.50 ${currency}`));
    assert.ok(message.text.includes('Requested principal (minor units): 123450'));
    assert.ok(message.text.includes(`Requested currency: ${currency}`));
    assert.match(message.text, /Request for program terms only\./);
  }
  assert.match(buildMessage(interest({ status: 'terms_requested', requestedPrincipalMinor: '1', currency: 'EUR' })).text, /Requested principal: 0\.01 EUR/);
});

test('unsafe magnitude is rendered from exact text without floating conversion', () => {
  const message = buildMessage(interest({ status: 'terms_requested', requestedPrincipalMinor: '900719925474099299', currency: 'USD' }));
  assert.match(message.text, /Requested principal: 9007199254740992\.99 USD/);
  assert.match(message.text, /Requested principal \(minor units\): 900719925474099299/);
});

test('malformed or forged stored financial details cannot become approval claims or message injection', () => {
  for (const programRequest of [null, {}, { status: 'approved', requestedPrincipalMinor: '100', currency: 'EUR' }, { status: 'terms_requested', requestedPrincipalMinor: 100, currency: 'EUR' }, { status: 'terms_requested', requestedPrincipalMinor: '0100', currency: 'EUR' }, { status: 'terms_requested', requestedPrincipalMinor: '0', currency: 'EUR' }, { status: 'terms_requested', requestedPrincipalMinor: '-100', currency: 'EUR' }, { status: 'terms_requested', requestedPrincipalMinor: '100\nAPPROVED', currency: 'EUR' }, { status: 'terms_requested', requestedPrincipalMinor: '100', currency: 'GBP' }, { status: 'terms_requested', requestedPrincipalMinor: '100', currency: 'EUR', rateBps: 2000 }, { status: 'terms_requested', enrolled: true }]) {
    const message = buildMessage(interest(programRequest));
    assert.match(message.text, /Program request details require review\./);
    assert.doesNotMatch(message.text, /Requested principal|Requested currency|APPROVED|rateBps|20%/);
    assert.match(message.text, /No program terms accepted, enrollment, investment payment or funds posting\./);
  }
  assert.doesNotMatch(buildMessage({ ...interest({ status: 'terms_requested' }), purpose: 'product' }).text, /Purchase choice|Program status/);
  assert.doesNotMatch(buildMessage({ ...base(), purchaseIntent: 'approved\nAPPROVED' }).text, /APPROVED|Purchase choice/);
});

test('SMTP mocked capture includes the real validated stored choice and exact amount without changing envelope', async () => {
  const store = createMemoryStore();
  const payload = { purpose: 'config', locale: 'en', fields: { name: 'Synthetic client', email: 'client@example.invalid', role: 'player', country: 'Test country' }, config: { series: 'great', cls: 'P1.5', mode: 'listed', weight: 272, grip: 'L3', setType: 'individual', sets: 1, use: 'play', ptype: 'none' }, consent: true, idempotencyKey: crypto.randomUUID(), elapsedMs: 3000, hp: '', purchaseIntent: 'goods_with_program_interest', programRequest: { principal: '9 007 199 254 740 992,99', currency: 'AED' } };
  const accepted = await acceptRequest(payload, { ip: '192.0.2.55', now: Date.parse('2026-10-11T00:00:00Z'), config: { store, notifier: null, salt: 'TEST-ONLY-NOTIFICATION-SALT', minElapsedMs: 1500, rateLimit: { max: 10, windowSeconds: 600 } } });
  assert.equal(accepted.http, 201);
  const record = (await store.getLead(accepted.requestId)).record;
  const captured = [], config = { from: 'sender@example.invalid', to: 'operator@example.invalid' };
  let factoryCalls = 0;
  const notifier = createSmtpNotifier(config, { transportFactory: actual => { factoryCalls++; assert.equal(actual, config); return { sendMail: async message => { captured.push(message); return { messageId: 'TEST-ONLY-MOCK-MESSAGE', rejected: [] }; } }; } });
  assert.deepEqual(await notifier.send(record), { ok: true, messageId: 'TEST-ONLY-MOCK-MESSAGE' });
  assert.equal(factoryCalls, 1); assert.equal(captured.length, 1);
  const message = captured[0];
  assert.equal(message.from, config.from); assert.equal(message.to, config.to); assert.equal(message.replyTo, 'client@example.invalid');
  assert.deepEqual(message.headers, { 'X-Maximus-Request-Id': accepted.requestId });
  assert.equal(message.subject, buildMessage(record).subject); assert.equal(message.text, buildMessage(record).text);
  assert.match(message.text, /Purchase intention: goods_with_program_interest/);
  assert.match(message.text, /Requested principal: 9007199254740992\.99 AED/);
  assert.match(message.text, /Requested principal \(minor units\): 900719925474099299/);
  assert.match(message.text, /No program terms accepted, enrollment, investment payment or funds posting\./);
  assert.equal(message.html, undefined);
});
