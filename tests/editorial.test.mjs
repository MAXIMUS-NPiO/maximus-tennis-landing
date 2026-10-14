/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/** Founder's update of 14 October 2026, part I: editorial copy, valuation and meeting-interest intake. */
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { editorialCopy, editorialLocales } from '../content/editorial-copy.js';
import { forumCopy } from '../content/forum-copy.js';
import { locales, getDict } from '../lib/i18n.js';
import { routes, navGroups, requestPurposes } from '../data/site.js';
import { validateRequest, PURPOSES, VALUATION_CURRENCIES, MEETING_INTERESTS, fieldsFor } from '../lib/intake/schema.js';
import { makeRequestId } from '../lib/intake/service.js';

const base = (purpose, fields, over = {}) => ({
  purpose, locale: 'en', consent: true, idempotencyKey: crypto.randomUUID(), elapsedMs: 3000, hp: '',
  fields: { name: 'Synthetic visitor', email: 'test@example.invalid', role: 'player', country: 'Test country', ...fields }, ...over,
});

test('editorial copy exists in every site language with the English structure', () => {
  assert.deepEqual([...editorialLocales].sort(), [...locales].sort());
  for (const l of locales) {
    const E = editorialCopy(l);
    assert.equal(E.platform.points.length, 6, l);
    assert.equal(E.kits.route.length, 6, l);
    assert.equal(E.kits.types.length, 5, l);
    assert.equal(E.proShop.sequence.length, 7, l);
    assert.equal(E.proShop.labels.length, 5, l);
    assert.equal(E.meetings.stages.length, 5, l);
    assert.equal(E.identity.audiences.length, 5, l);
    assert.ok(E.kits.exampleCount.includes('14') && E.kits.exampleCount.includes('16'), `${l}: kit example keeps 14–16`);
    assert.match(E.kits.exampleCount, /6\s*\+\s*5\s*\+\s*5/, `${l}: kit example keeps 6 + 5 + 5`);
    forumCopy(l); // the reviewed forum copy reused for meeting labels is complete in the same language
  }
});

test('the barter clause and the philosophy headline are the Founder\'s words in English and Russian', () => {
  assert.equal(editorialCopy('ru').exchange.text, 'Помимо денежной оплаты, отдельные партнёрства могут предусматривать согласованный обмен товарами, услугами или полезным вкладом. Содержание, оценка и условия такого обмена фиксируются отдельно.');
  assert.equal(editorialCopy('ru').platform.title, 'Постоянная основа. Индивидуальное развитие.');
  assert.equal(editorialCopy('ru').kits.title, 'Соберите систему вокруг своей ракетки.');
  assert.equal(editorialCopy('en').identity.title, 'Your identity. Built on MAXIMUS.');
  assert.equal(editorialCopy('ru').identity.lead, 'Ваше сообщество получает собственную визуальную идентичность на основе согласованной конфигурации MAXIMUS.');
});

test('the Pro Shop is presented as a concept, never as an engineered or certified system', () => {
  const E = editorialCopy('en').proShop;
  assert.match(E.conceptText, /not yet established/);
  assert.match(E.conceptText, /does not by itself confirm safety or certification/);
  assert.match(E.diagramCaption, /Not an engineered design/);
  assert.match(E.designText, /closed high-density cassettes, not on a wall of open shelves/);
});

test('new pages are routed, in the sitemap source and in the partnerships menu; dictionaries carry their labels', () => {
  assert.equal(routes.proShop, '/pro-shop');
  assert.equal(routes.meetings, '/meetings');
  const partners = navGroups.find((g) => g.key === 'partnerships').items;
  assert.ok(partners.includes('proShop') && partners.includes('meetings'));
  for (const l of locales) {
    const d = getDict(l);
    for (const k of ['proShop', 'meetings']) assert.ok(d.nav[k] && d.nav[k].trim(), `${l}: nav.${k}`);
    for (const p of ['valuation', 'meeting']) assert.ok(d.form.purposes[p], `${l}: form.purposes.${p}`);
    for (const k of Object.keys(fieldsFor('valuation').extra).concat(Object.keys(fieldsFor('meeting').extra))) assert.ok(d.form.fields[k], `${l}: form.fields.${k}`);
    assert.deepEqual(Object.keys(d.form.meetingInterests), MEETING_INTERESTS, l);
    assert.ok(d.form.fieldsByPurpose.valuation.message, l);
  }
});

test('valuation: an estimate with a currency for a named configuration; never a price, never an order', () => {
  assert.ok(PURPOSES.includes('valuation') && requestPurposes.includes('valuation'));
  const ok = validateRequest(base('valuation', { configuration: 'GREAT · 97 in² · 299 g · 27 in · L3', proposedPrice: '250', priceCurrency: 'USD', quantity: '2', message: 'Club use' }));
  assert.equal(ok.ok, true, JSON.stringify(ok.errors));
  const missing = validateRequest(base('valuation', { configuration: '', proposedPrice: '', priceCurrency: '' }));
  assert.equal(missing.errors.configuration, 'required');
  assert.equal(missing.errors.proposedPrice, 'required');
  assert.equal(missing.errors.priceCurrency, 'required');
  assert.equal(validateRequest(base('valuation', { configuration: 'SPIN', proposedPrice: '199.99', priceCurrency: 'EUR' })).errors.proposedPrice, 'decimal_not_supported');
  assert.equal(validateRequest(base('valuation', { configuration: 'SPIN', proposedPrice: '0', priceCurrency: 'EUR' })).errors.proposedPrice, 'out_of_range');
  assert.equal(validateRequest(base('valuation', { configuration: 'SPIN', proposedPrice: '200', priceCurrency: 'RUB' })).errors.priceCurrency, 'invalid_choice');
  assert.deepEqual([...VALUATION_CURRENCIES], ['USD', 'EUR', 'AED', 'CNY']);
  assert.match(makeRequestId('valuation'), /^MX-VAL-\d{8}-[0-9A-Z]{6}$/);
});

test('meeting interest: residence, preferred city, travel readiness, attendees, interests; stored as a request with a number', () => {
  assert.ok(PURPOSES.includes('meeting') && requestPurposes.includes('meeting'));
  const fields = { residenceCity: 'Test city', preferredMeetingCity: 'Dubai', willingToTravel: 'yes', travelCities: 'Abu Dhabi', attendees: '3', meetingInterests: ['products', 'club', 'national'], hosting: ['coorganise'], organisation: 'Test club' };
  const ok = validateRequest(base('meeting', fields));
  assert.equal(ok.ok, true, JSON.stringify(ok.errors));
  const bad = validateRequest(base('meeting', { residenceCity: '', preferredMeetingCity: '', attendees: '0', meetingInterests: [] }));
  assert.equal(bad.errors.residenceCity, 'required');
  assert.equal(bad.errors.preferredMeetingCity, 'required');
  assert.equal(bad.errors.attendees, 'out_of_range');
  assert.equal(bad.errors.meetingInterests, 'required');
  assert.equal(validateRequest(base('meeting', { ...fields, meetingInterests: ['bank'] })).errors.meetingInterests, 'invalid_choice');
  assert.equal(validateRequest(base('meeting', { ...fields, attendees: '10000' })).errors.attendees, 'out_of_range');
  assert.match(makeRequestId('meeting'), /^MX-MTG-\d{8}-[0-9A-Z]{6}$/);
});

test('valuation and meeting requests are stored before any notification and answered with their number', async () => {
  const { acceptRequest } = await import('../lib/intake/service.js');
  const { createMemoryStore } = await import('../lib/intake/store.js');
  const store = createMemoryStore();
  const options = { ip: '192.0.2.60', now: Date.parse('2026-10-14T12:00:00Z'), config: { store, notifier: null, salt: 'TEST-ONLY-RATE-SALT', minElapsedMs: 1500, rateLimit: { max: 100, windowSeconds: 600 } } };
  const v = await acceptRequest(base('valuation', { configuration: 'POWER · 98 in²', proposedPrice: '180', priceCurrency: 'AED' }), options);
  assert.equal(v.http, 201);
  assert.match(v.requestId, /^MX-VAL-20261014-/);
  const vr = (await store.getLead(v.requestId)).record;
  assert.equal(vr.purpose, 'valuation');
  assert.equal(vr.details.proposedPrice, 180);
  assert.equal(vr.details.priceCurrency, 'AED');
  const m = await acceptRequest(base('meeting', { residenceCity: 'Test city', preferredMeetingCity: 'Dubai', attendees: '2', meetingInterests: ['infrastructure'] }), options);
  assert.equal(m.http, 201);
  assert.match(m.requestId, /^MX-MTG-20261014-/);
  assert.deepEqual((await store.getLead(m.requestId)).record.details.meetingInterests, ['infrastructure']);
  assert.equal(await store.countLeads(), 2);
});
