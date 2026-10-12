/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { seriesList, seriesCodes, standardLengths, trainerWeights, sweetSpotTrainer, spotTrainer, catalogueCounts, balanceFor, configurationKey } from '../data/products.js';
import { validateConfig, validateRequest, parseLength } from '../lib/intake/schema.js';
import { createConfigurations, validateRevisionFields } from '../lib/platform/configurations.js';
import { createMemoryStore } from '../lib/platform/store.js';
import { createMemoryStore as intakeStore } from '../lib/intake/store.js';
import { createCatalog, catalogueSummary, skuFor } from '../lib/platform/catalog.js';
import { acceptRequest } from '../lib/intake/service.js';
import { buildMessage, buildTelegramText } from '../lib/intake/notify.js';
import { toPayload, withSeries, PERSIST } from '../lib/client/configuration.js';
import { pick } from '../lib/client/storage.js';
import { getDict, locales } from '../lib/i18n.js';
import { acceptOrder } from '../lib/commerce/service.js';

const base = { series: 'great', cls: 'P1.5', mode: 'listed', weight: 272, grip: 'L3', setType: 'individual', sets: '1', use: 'play', ptype: 'none', catalogueVersion: 2, lengthMode: 'standard', lengthIn: 27 };
const request = (config, locale = 'en') => ({ purpose: 'config', config, locale, fields: { name: 'Test Person', email: 'catalog@example.invalid', country: 'UAE', role: 'player' }, consent: true, idempotencyKey: crypto.randomUUID(), hp: '', elapsedMs: 2000 });
const trainer = (series, weight) => ({ ...base, series, weight, cls: undefined, lengthMode: undefined, lengthIn: undefined });

test('99 original models, seven requested lengths, 693 variants and 122 separate trainers', () => {
  assert.deepEqual(seriesCodes, { S: 'spin', P: 'power', G: 'great' });
  assert.deepEqual(catalogueCounts, { baseModels: 99, lengthsPerModel: 7, playingVariants: 693, addedPlayingVariants: 594, trainerVariants: 122 });
  assert.deepEqual(standardLengths.map(x => x.inches), [26.3, 26.6, 26.8, 27, 27.3, 27.6, 27.9]);
  assert.deepEqual(standardLengths.map(x => x.category), ['short', 'short', 'short', 'standard', 'plus', 'plus', 'superlong']);
  const keys = new Set();
  for (const s of seriesList) for (const p of s.matrix) for (const len of standardLengths) {
    const r = validateConfig({ ...base, series: s.id, weight: p.weight, lengthIn: len.inches });
    assert.equal(r.ok, true, JSON.stringify(r.errors));
    assert.equal(r.value.lengthIn, len.inches);
    keys.add(configurationKey({ series: s.id, precisionLevel: 'P1.5', weight: p.weight, grip: 'L3', lengthIn: len.inches }));
    assert.equal(balanceFor(s.id, p.weight, len.inches), null);
  }
  assert.equal(keys.size, 693);
  assert.equal(catalogueSummary().combinations, 693 * 8 * 3);
});

test('all 61 trainer weights validate, endpoints included; off-step and malformed values fail', () => {
  assert.equal(trainerWeights.length, 61);
  assert.deepEqual(trainerWeights, Array.from({ length: 61 }, (_, i) => 200 + 5 * i));
  for (const s of ['sst', 'spot']) {
    for (const w of trainerWeights) {
      const r = validateConfig(trainer(s, w));
      assert.equal(r.ok, true, JSON.stringify(r.errors));
      assert.equal(r.value.productKind, s);
      assert.equal(r.value.cls, undefined);
      assert.equal(r.value.lengthIn, s === 'sst' ? 27 : undefined);
      assert.equal(validateConfig(JSON.parse(JSON.stringify(r.value))).ok, true);
    }
    for (const w of [199, 501, 201, 499, 202.5, '2e2', '200g', NaN, Infinity]) assert.equal(validateConfig(trainer(s, w)).ok, false, `${s}/${w}`);
    assert.equal(validateConfig({ ...trainer(s, 200), cls: 'P0.5' }).ok, false);
    assert.equal(validateConfig({ ...trainer(s, 200), lengthMode: 'standard', lengthIn: 27.3 }).ok, false);
    assert.equal(validateConfig({ ...trainer(s, 200), mode: 'custom', customWeight: 301 }).ok, false);
  }
  assert.equal(sweetSpotTrainer.headSizeSqIn, 50);
  assert.equal(sweetSpotTrainer.lengthIn, 27);
  assert.equal(sweetSpotTrainer.stringPattern, '12 × 14');
  assert.deepEqual(sweetSpotTrainer.system.filter(x => x.balance !== null), [{ weight: 270, balance: 330 }, { weight: 285, balance: 325 }, { weight: 300, balance: 325 }, { weight: 400, balance: 320 }]);
  assert.equal(spotTrainer.lengthIn, null);
  assert.equal(spotTrainer.targetDimensions, 'NOT_PROVIDED');
});

test('length has no silent default; explicit standard choices validate exactly', () => {
  assert.equal(validateConfig({ ...base, lengthIn: undefined }).errors['config.lengthIn'], 'required');
  assert.equal(validateConfig({ ...base, lengthMode: undefined }).errors['config.lengthMode'], 'required');
  for (const x of [26.4, 27.5, 28, 29, 0, '', '27in', '2.7e1', NaN, Infinity]) assert.equal(validateConfig({ ...base, lengthIn: x }).ok, false, String(x));
  const legacy = { ...base, catalogueVersion: undefined, lengthMode: undefined, lengthIn: undefined, targetRA: 60 };
  assert.equal(validateConfig(legacy).value.lengthIn, undefined);
  const r = validateRevisionFields(legacy);
  assert.equal(r.standardConfirmable, false);
  assert.equal(r.customRequest, false);
  assert.ok(r.missingForStandard.includes('lengthMode'));
});

test('custom length is preserved as a technical request, including decimal comma; no standard SKU', () => {
  for (const raw of ['28.125', '28,125', '30']) {
    const r = validateConfig({ ...base, lengthMode: 'custom', customLengthIn: raw });
    assert.equal(r.ok, true);
    assert.equal(r.value.customLengthIn, Number(raw.replace(',', '.')));
    assert.equal(r.value.lengthIn, undefined);
    const rev = validateRevisionFields({ ...r.value, targetRA: 60 });
    assert.equal(rev.standardConfirmable, false);
    assert.equal(rev.customRequest, true);
    assert.equal(skuFor({ ...r.value }), null);
  }
  for (const x of ['0', '-27', '27.1234', '27e0', '27 in', '<script>', true, {}, []]) assert.ok(parseLength(x).error, JSON.stringify(x));
});

test('browser serialization, draft storage and product switching retain active fields only', () => {
  const c = { ...base, lengthMode: 'custom', customLengthIn: '28,125', engraving: 'PRIVATE', notes: 'PRIVATE', email: 'private@example.invalid' };
  const stored = JSON.parse(JSON.stringify(pick(c, PERSIST)));
  assert.equal(stored.customLengthIn, '28,125');
  for (const k of ['engraving', 'notes', 'email']) assert.equal(stored[k], undefined);
  const sent = toPayload(stored);
  assert.equal(sent.lengthIn, undefined);
  assert.equal(validateConfig(sent).value.customLengthIn, 28.125);
  const sst = withSeries(c, 'sst').c;
  assert.equal(sst.cls, undefined);
  assert.equal(sst.lengthMode, undefined);
  assert.equal(sst.customLengthIn, undefined);
  const back = withSeries({ ...sst, weight: 200 }, 'power').c;
  assert.equal(back.weight, undefined);
  assert.equal(back.lengthIn, undefined);
  assert.equal(back.lengthMode, 'standard');
});

test('all 48 locales retain new fields and their submitted language', () => {
  assert.equal(locales.length, 48);
  for (const locale of locales) {
    const d = getDict(locale);
    for (const key of ['length', 'standard', 'short', 'custom', 'note', 'balanceNote']) assert.ok(d.catalogue[key]?.length, `${locale}/${key}`);
    assert.match(d.sst.lead, /200–500/);
    assert.match(d.spot.lead, /61/);
    assert.match(d.home.training.sstCaption, /61/);
    assert.equal(validateRequest(request(base, locale)).value.locale, locale);
  }
});

test('accepted intake, JSON reconstruction and notification render preserve exact custom length', async () => {
  const store = intakeStore();
  const p = request({ ...base, lengthMode: 'custom', customLengthIn: '28,125' }, 'ar');
  const r = await acceptRequest(p, { ip: '127.0.0.1', config: { store, notifier: null, minElapsedMs: 1500, salt: 'fixture', rateLimit: { max: 10, windowSeconds: 60 } } });
  assert.equal(r.http, 201);
  const saved = await store.getLead(r.body.request_id);
  const record = JSON.parse(JSON.stringify(saved.record));
  assert.equal(record.locale, 'ar');
  assert.equal(record.config.customLengthIn, 28.125);
  assert.equal(record.config.lengthIn, undefined);
  assert.match(buildMessage(record).text, /Custom-made requested length \(in\).*28\.125/);
  assert.match(buildTelegramText(record), /28\.125/);
});

function configService(store) {
  const access = { authorize: async () => ({ via: 'owner' }), ensureSelfProfile: async () => ({ id: 'profile1' }), controlledProfileIds: async () => new Set(['profile1']) };
  return createConfigurations({ store, access });
}
const ctx = { userId: 'user1', email: 'test@example.invalid', emailVerified: true };

test('stored legacy readiness flags cannot submit a missing-length revision', async () => {
  const store = createMemoryStore(), api = configService(store);
  const fields = { ...base, catalogueVersion: undefined, lengthMode: undefined, lengthIn: undefined, targetRA: 60, targetRAInput: '60' };
  await store.commit({ writes: [
    { type: 'configuration', id: 'cfg1', expectedVersion: -1, doc: { id: 'cfg1', ownerUserId: 'user1', profileId: 'profile1', currentRevisionId: 'rev1' } },
    { type: 'revision', id: 'rev1', expectedVersion: -1, doc: { id: 'rev1', fields, standardConfirmable: true, customRequest: false, missingForStandard: [] } },
  ] });
  await assert.rejects(api.requestManufacturingConfirmation(ctx, 'cfg1'), e => e.code === 'standard_confirmation_blocked' && e.details.missingForStandard.includes('lengthMode'));
  assert.equal((await store.listIndex('admin:reviews:pending')).length, 0);
});

test('revisions, imported draft, duplicate and manufacturing review retain length', async () => {
  const store = createMemoryStore(), api = configService(store);
  const cfg = await api.importDraft(ctx, { v: 2, c: { ...base, lengthMode: 'custom', customLengthIn: '28.125', ra: '60' } });
  assert.equal(cfg.currentRevision.fields.customLengthIn, 28.125);
  const review = await api.requestManufacturingConfirmation(ctx, cfg.id);
  assert.equal(review.targets.customLengthIn, 28.125);
  assert.equal(review.customRequest, true);
  const dup = await api.duplicate(ctx, cfg.id);
  assert.equal(dup.currentRevision.fields.customLengthIn, 28.125);
});

test('expanded lengths and new trainer weights inherit neither price nor availability promises', async () => {
  const store = createMemoryStore(), catalog = createCatalog({ store });
  for (const lengthIn of standardLengths.map(x => x.inches)) {
    const line = { productKind: 'racquet', series: 'great', weight: 272, precisionLevel: 'P1.5', grip: 'L3', country: 'AE', quantity: 1, lengthMode: 'standard', lengthIn };
    assert.equal(catalog.resolvePrice(line).status, 'review');
    assert.equal((await catalog.availability(line)).state, 'requires_review');
    assert.equal((await catalog.availability(line)).leadTime, undefined);
  }
  for (const productKind of ['sst', 'spot']) for (const weight of [200, 205, 495, 500]) {
    assert.equal((await catalog.availability({ productKind, weight, grip: 'L3' })).state, 'requires_review');
  }
});

test('new assortment uses request intake and cannot activate the historical financial flow', async () => {
  const r = await acceptOrder({ ...request(base), plan: 'A' }, { store: {}, accessSecret: 'x'.repeat(32) });
  assert.equal(r.http, 400);
  assert.equal(r.body.status, 'invalid');
});

test('manufacturing approval requires the exact requested length and blocks a changed value', async () => {
  const store = createMemoryStore();
  const access = { requireCap: () => {}, authorize: async () => ({ via: 'owner' }), ensureSelfProfile: async () => ({ id: 'profile1' }), controlledProfileIds: async () => new Set(['profile1']) };
  const api = createConfigurations({ store, access });
  const cfg = await api.create(ctx, { name: 'Length review', fields: { ...base, lengthMode: 'custom', customLengthIn: '28.125', targetRA: 60 } });
  const review = await api.requestManufacturingConfirmation(ctx, cfg.id);
  const protocol = { method: 'fixture method', instrument: 'fixture instrument', resolution: '0.001 in', calibration: 'fixture calibration', basis: 'unstrung' };
  await assert.rejects(api.decideReview(ctx, review.id, { decision: 'approved', protocol }), e => e.code === 'validation_failed');
  await assert.rejects(api.decideReview(ctx, review.id, { decision: 'approved', protocol: { ...protocol, agreedLengthIn: 27 } }), e => e.code === 'validation_failed');
  const approved = await api.decideReview(ctx, review.id, { decision: 'approved', protocol: { ...protocol, agreedLengthIn: '28,125' } });
  assert.equal(approved.protocol.agreedLengthIn, 28.125);
});


test('Spot review keeps unknown length absent and validates any supplied protocol length', async () => {
  const store = createMemoryStore();
  const access = { requireCap: () => {}, authorize: async () => ({ via: 'owner' }), ensureSelfProfile: async () => ({ id: 'profile1' }), controlledProfileIds: async () => new Set(['profile1']) };
  const api = createConfigurations({ store, access });
  const protocol = { method: 'fixture', instrument: 'fixture', resolution: '0.001 in', calibration: 'fixture', basis: 'unstrung' };
  const cfg = await api.create(ctx, { name: 'Spot review', fields: trainer('spot', 500) });
  const review = await api.requestManufacturingConfirmation(ctx, cfg.id);
  for (const invalid of [{ anything: 'not a length' }, -1, 0, '27 in', '1e2']) {
    await assert.rejects(api.decideReview(ctx, review.id, { decision: 'approved', protocol: { ...protocol, agreedLengthIn: invalid } }), e => e.code === 'validation_failed');
  }
  const approved = await api.decideReview(ctx, review.id, { decision: 'approved', protocol });
  assert.equal(approved.protocol.agreedLengthIn, undefined);
  assert.equal(approved.targets.lengthIn, null);
  const cfg2 = await api.create(ctx, { name: 'Spot measured length', fields: trainer('spot', 500) });
  const review2 = await api.requestManufacturingConfirmation(ctx, cfg2.id);
  const approved2 = await api.decideReview(ctx, review2.id, { decision: 'approved', protocol: { ...protocol, agreedLengthIn: '27,125' } });
  assert.equal(approved2.protocol.agreedLengthIn, 27.125);
});
