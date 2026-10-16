/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { seriesList, seriesCodes, standardLengths, trainerWeights, sweetSpotTrainer, spotTrainer, catalogueCounts, nationalPackage, grips, referenceGrips, balanceFor, catalogueVariantKey, configurationKey } from '../data/products.js';
import { validateConfig, validateRequest, parseLength } from '../lib/intake/schema.js';
import { createConfigurations, validateRevisionFields } from '../lib/platform/configurations.js';
import { createMemoryStore } from '../lib/platform/store.js';
import { createMemoryStore as intakeStore } from '../lib/intake/store.js';
import { createCatalog, catalogueSummary, skuFor } from '../lib/platform/catalog.js';
import { acceptRequest } from '../lib/intake/service.js';
import { buildMessage, buildTelegramText } from '../lib/intake/notify.js';
import { toPayload, withSeries, PERSIST, DEFAULTS } from '../lib/client/configuration.js';
import { pick } from '../lib/client/storage.js';
import { getDict, locales } from '../lib/i18n.js';
import { acceptOrder } from '../lib/commerce/service.js';

const base = { series: 'great', cls: 'P1.5', mode: 'listed', weight: 272, grip: 'L3', setType: 'individual', sets: '1', use: 'play', ptype: 'none', catalogueVersion: 3, lengthMode: 'standard', lengthIn: 27 };
const request = (config, locale = 'en') => ({ purpose: 'config', config, locale, fields: { name: 'Test Person', email: 'catalog@example.invalid', country: 'UAE', role: 'player' }, consent: true, idempotencyKey: crypto.randomUUID(), hp: '', elapsedMs: 2000 });
const trainer = (series, weight, lengthIn = 27) => ({ ...base, series, weight, cls: undefined, lengthIn });
const legacyTrainer = (series, weight) => ({ ...trainer(series, weight), catalogueVersion: 2, lengthMode: undefined, lengthIn: undefined });
const families = [...seriesList.map(s => ({ id: s.id, weights: s.matrix.map(p => p.weight) })), ...['sst', 'spot'].map(id => ({ id, weights: trainerWeights }))];

test('preserved 99 playing models and seven lengths give 693 playing plus 854 trainer variants', () => {
  assert.deepEqual(seriesCodes, { S: 'spin', P: 'power', G: 'great' });
  assert.deepEqual(catalogueCounts, { baseModels: 99, lengthsPerModel: 7, playingVariants: 693, addedPlayingVariants: 594, trainerWeightPoints: 122, trainerVariants: 854, totalRequestedVariants: 1547 });
  assert.deepEqual(standardLengths.map(x => x.inches), [26.3, 26.6, 26.8, 27, 27.3, 27.6, 27.9]);
  assert.deepEqual(standardLengths.map(x => x.category), ['short', 'short', 'short', 'standard', 'plus', 'plus', 'superlong']);
  const keys = new Set();
  for (const s of seriesList) for (const p of s.matrix) for (const len of standardLengths) {
    const r = validateConfig({ ...base, series: s.id, weight: p.weight, lengthIn: len.inches });
    assert.equal(r.ok, true, JSON.stringify(r.errors));
    assert.equal(r.value.lengthIn, len.inches);
    keys.add(catalogueVariantKey(r.value));
    assert.equal(balanceFor(s.id, p.weight, len.inches), null);
  }
  assert.equal(keys.size, 693);
  assert.equal(catalogueSummary().combinations, 693 * 8 * 3);
  assert.equal(catalogueSummary().nationalPackage.unitsPerCountry, 24752);
});

test('all 854 trainer weight/length requests validate and round-trip; boundaries and step are enforced', () => {
  assert.deepEqual(trainerWeights, Array.from({ length: 61 }, (_, i) => 200 + 5 * i));
  const keys = new Set();
  for (const s of ['sst', 'spot']) {
    for (const w of trainerWeights) for (const len of standardLengths) {
      const r = validateConfig(trainer(s, w, len.inches));
      assert.equal(r.ok, true, JSON.stringify(r.errors));
      assert.equal(r.value.productKind, s);
      assert.equal(r.value.cls, undefined);
      assert.equal(r.value.lengthIn, len.inches);
      assert.equal(r.value.lengthMode, 'standard');
      assert.equal(r.value.configurationKey, configurationKey(r.value));
      assert.deepEqual(validateConfig(JSON.parse(JSON.stringify(r.value))), r);
      assert.equal(balanceFor(s, w, len.inches), null);
      keys.add(catalogueVariantKey(r.value));
    }
    for (const w of [199, 501, 201, 499, 202.5, '2e2', '200g', NaN, Infinity]) assert.equal(validateConfig(trainer(s, w)).ok, false, `${s}/${w}`);
    assert.equal(validateConfig({ ...trainer(s, 200), cls: 'P0.5' }).ok, false);
    assert.equal(validateConfig({ ...trainer(s, 200), mode: 'custom', customWeight: 301 }).ok, false);
  }
  assert.equal(keys.size, 854);
});

test('historical trainer geometry and four measured balances are not reused for new length requests', () => {
  assert.equal(sweetSpotTrainer.headSizeSqIn, 50);
  assert.equal(sweetSpotTrainer.lengthIn, 27);
  assert.equal(sweetSpotTrainer.historicalLengthIn, 27);
  assert.equal(sweetSpotTrainer.stringPattern, '12 × 14');
  assert.deepEqual(sweetSpotTrainer.system.filter(x => x.balance !== null), [{ weight: 270, balance: 330 }, { weight: 285, balance: 325 }, { weight: 300, balance: 325 }, { weight: 400, balance: 320 }]);
  assert.equal(balanceFor('sst', 270), 330);
  assert.equal(balanceFor('sst', 270, 27), null);
  assert.equal(balanceFor('sst', 200), null);
  assert.equal(spotTrainer.lengthIn, null);
  assert.equal(spotTrainer.targetDimensions, 'NOT_PROVIDED');
  for (const product of [sweetSpotTrainer, spotTrainer]) assert.deepEqual(product.requestedLengths, standardLengths);
});

test('National Package has 12376 collision-free full configurations and two copies each per country', () => {
  assert.deepEqual(grips.map(g => g.id), ['L0', 'L0.5', 'L1', 'L1.5', 'L2', 'L2.5', 'L3', 'L3.5', 'L4', 'L4.5', 'L5', 'L5.5', 'L6', 'L6.5', 'L7']);
  assert.deepEqual(grips.filter(g => !g.half).map(g => g.inches + g.fraction), ['4', '4⅛', '4¼', '4⅜', '4½', '4⅝', '4¾', '4⅞']);
  assert.equal(grips.find(g => g.id === 'L2.5').nominalMm, 109.54); // (4 + 2.5/8) × 25.4 = 109.5375 mm, nominal
  const variants = new Set(), fullKeys = new Set(), counted = {};
  for (const family of families) {
    counted[family.id] = 0;
    for (const weight of family.weights) for (const { inches: lengthIn } of standardLengths) {
      const c = { ...base, series: family.id, weight, lengthIn, ...(['sst', 'spot'].includes(family.id) ? { cls: undefined } : {}) };
      const variant = catalogueVariantKey(c);
      assert.ok(variant);
      assert.equal(variants.has(variant), false, `duplicate variant ${variant}`);
      variants.add(variant);
      for (const { id: grip } of referenceGrips) {
        const full = { ...c, grip };
        const key = configurationKey(full);
        assert.ok(key);
        assert.equal(fullKeys.has(key), false, `duplicate configuration ${key}`);
        fullKeys.add(key);
        const validated = validateConfig({ ...full, configurationKey: 'forged-key' });
        assert.equal(validated.ok, true, JSON.stringify(validated.errors));
        assert.equal(validated.value.configurationKey, key);
        counted[family.id] += 2;
      }
    }
  }
  assert.equal(variants.size, 1547);
  assert.equal(fullKeys.size, 12376);
  // Half sizes are requestable and produce their own keys, but never enter the fixed library.
  assert.equal(configurationKey({ ...base, series: 'great', weight: 299, lengthIn: 27, grip: 'L2.5' }), 'great-299-L27-L2.5');
  assert.deepEqual([...nationalPackage.referenceGrips], ['L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7']);
  assert.equal(grips.length, 15);
  assert.deepEqual(counted, { great: 3696, power: 3696, spin: 3696, sst: 6832, spot: 6832 });
  assert.equal(Object.values(counted).reduce((sum, units) => sum + units, 0), 24752);
  assert.equal(nationalPackage.combinations, fullKeys.size);
  assert.equal(nationalPackage.copiesPerCombination, 2);
  assert.equal(nationalPackage.unitsPerCountry, 24752);
  assert.equal(nationalPackage.playingUnits, 11088);
  assert.equal(nationalPackage.trainerUnits, 13664);
  assert.equal(nationalPackage.perCountry, true);
  assert.equal(nationalPackage.countryCount, null);
  assert.equal(nationalPackage.price, null);
  assert.equal(nationalPackage.availability, null);
  assert.equal(nationalPackage.productionApproved, false);
  for (const f of nationalPackage.families) assert.equal(f.units, counted[f.id]);
  // Precision class is not an additional dimension in this fitting/reference collection.
  assert.equal(configurationKey(base), configurationKey({ ...base, cls: 'P0.5' }));
  for (const bad of [{ grip: undefined }, { grip: 'L8' }, { series: 'grade' }, { weight: 271 }, { lengthIn: 27.5 }, { lengthMode: 'custom', customLengthIn: 27 }]) assert.equal(configurationKey({ ...base, ...bad }), null, JSON.stringify(bad));
});

test('new playing and trainer requests require an explicit length without a 27-inch default', () => {
  for (const c of [base, trainer('sst', 200), trainer('spot', 500)]) {
    const empty = validateConfig({ ...c, lengthIn: undefined });
    assert.equal(empty.errors['config.lengthIn'], 'required');
    assert.equal(empty.value.lengthIn, undefined);
    assert.equal(empty.value.configurationKey, undefined);
    assert.equal(validateConfig({ ...c, lengthMode: undefined }).errors['config.lengthMode'], 'required');
    for (const x of [26.4, 27.5, 28, 29, 0, '', '27in', '2.7e1', NaN, Infinity]) assert.equal(validateConfig({ ...c, lengthIn: x }).ok, false, `${c.series}/${x}`);
    for (const version of [0, 1, 4, '3']) assert.equal(validateConfig({ ...c, catalogueVersion: version }).errors['config.catalogueVersion'], 'invalid_choice');
  }
  const legacy = { ...base, catalogueVersion: undefined, lengthMode: undefined, lengthIn: undefined, targetRA: 60 };
  assert.equal(validateConfig(legacy).value.lengthIn, undefined);
  const r = validateRevisionFields(legacy);
  assert.equal(r.standardConfirmable, false);
  assert.equal(r.customRequest, false);
  assert.ok(r.missingForStandard.includes('lengthMode'));
});

test('legacy trainer requests retain historical data but cannot manufacture before explicit length selection', async () => {
  const store = createMemoryStore(), api = configService(store);
  for (const series of ['sst', 'spot']) {
    const validated = validateConfig(legacyTrainer(series, 270));
    assert.equal(validated.ok, true);
    assert.equal(validated.value.lengthIn, series === 'sst' ? 27 : undefined);
    assert.equal(validated.value.lengthMode, undefined);
    assert.equal(validated.value.configurationKey, undefined);
    assert.deepEqual(validateConfig(JSON.parse(JSON.stringify(validated.value))), validated);
    const cfg = await api.importDraft(ctx, { v: 2, c: legacyTrainer(series, 270) });
    assert.equal(cfg.currentRevision.fields.lengthIn, series === 'sst' ? 27 : undefined);
    assert.equal(cfg.currentRevision.customRequest, false);
    assert.equal(cfg.currentRevision.standardConfirmable, false);
    await assert.rejects(api.requestManufacturingConfirmation(ctx, cfg.id), e => e.code === 'standard_confirmation_blocked' && e.details.missingForStandard.includes('lengthMode'));
  }
  assert.equal((await store.listIndex('admin:reviews:pending')).length, 0);
});

test('explicit trainer lengths require the new request version and unversioned explicit requests normalize to v3', () => {
  for (const series of ['sst', 'spot']) {
    const c = trainer(series, 270, 27.3);
    assert.equal(validateConfig({ ...c, catalogueVersion: 2 }).errors['config.catalogueVersion'], 'invalid_choice');
    const current = validateConfig({ ...c, catalogueVersion: undefined });
    assert.equal(current.ok, true);
    assert.equal(current.value.catalogueVersion, 3);
    assert.equal(current.value.lengthIn, 27.3);
    assert.deepEqual(validateConfig(JSON.parse(JSON.stringify(current.value))), current);
  }
});

test('custom length is preserved for every product as a technical request, with decimal comma and no finite matrix key', () => {
  for (const c of [base, trainer('sst', 200), trainer('spot', 500)]) for (const raw of ['28.125', '28,125', '30']) {
    const r = validateConfig({ ...c, lengthMode: 'custom', customLengthIn: raw, configurationKey: 'forged-key' });
    assert.equal(r.ok, true);
    assert.equal(r.value.customLengthIn, Number(raw.replace(',', '.')));
    assert.equal(r.value.lengthIn, undefined);
    assert.equal(r.value.configurationKey, undefined);
    assert.equal(configurationKey(r.value), null);
    assert.equal(catalogueVariantKey(r.value), null);
    const rev = validateRevisionFields({ ...r.value, targetRA: 60 });
    assert.equal(rev.standardConfirmable, false);
    assert.equal(rev.customRequest, true);
    assert.equal(skuFor(r.value), null);
  }
  for (const x of ['0', '-27', '27.1234', '27e0', '27 in', '<script>', true, {}, []]) assert.ok(parseLength(x).error, JSON.stringify(x));
});

test('browser serialization and persistence retain version and active dimensions, exclude private text, and reset switched lengths', () => {
  assert.equal(DEFAULTS.catalogueVersion, 3);
  assert.equal(DEFAULTS.lengthMode, 'standard');
  assert.equal(DEFAULTS.lengthIn, undefined);
  const c = { ...base, lengthMode: 'custom', customLengthIn: '28,125', engraving: 'PRIVATE', notes: 'PRIVATE', email: 'private@example.invalid', configurationKey: 'stale-client-key' };
  const stored = JSON.parse(JSON.stringify(pick(c, PERSIST)));
  assert.equal(stored.catalogueVersion, 3);
  assert.equal(stored.customLengthIn, '28,125');
  for (const k of ['engraving', 'notes', 'email', 'configurationKey']) assert.equal(stored[k], undefined);
  const sent = toPayload(stored);
  assert.equal(sent.catalogueVersion, 3);
  assert.equal(sent.lengthIn, undefined);
  assert.equal(validateConfig(sent).value.customLengthIn, 28.125);
  const sst = withSeries(c, 'sst').c;
  assert.equal(sst.cls, undefined);
  assert.equal(sst.lengthMode, 'standard');
  assert.equal(sst.lengthIn, undefined);
  assert.equal(sst.customLengthIn, undefined);
  assert.equal(validateConfig(toPayload({ ...sst, weight: 200 })).errors['config.lengthIn'], 'required');
  const spot = withSeries({ ...sst, weight: 200, lengthIn: 27.9 }, 'spot').c;
  assert.equal(spot.weight, 200);
  assert.equal(spot.lengthIn, undefined);
  const back = withSeries(spot, 'power').c;
  assert.equal(back.weight, undefined);
  assert.equal(back.lengthIn, undefined);
  assert.equal(back.lengthMode, 'standard');
});

test('all 48 locales expose trainer lengths, historical captions and National Package copy', () => {
  assert.equal(locales.length, 48);
  for (const locale of locales) {
    const d = getDict(locale);
    for (const key of ['length', 'standard', 'short', 'custom', 'note', 'balanceNote']) assert.ok(d.catalogue[key]?.length, `${locale}/${key}`);
    for (const key of ['title', 'lead', 'inclusion', 'scope', 'boundary', 'historical', 'referenceLifecycle', 'personalExample', 'customBatches', 'proShop']) assert.ok(d.nationalPackage[key]?.length, `${locale}/nationalPackage/${key}`);
    assert.match(d.sst.lead, /200–500/);
    assert.match(d.spot.lead, /61/);
    for (const len of standardLengths) for (const product of ['sst', 'spot']) assert.ok(d[product].lead.includes(String(len.inches)), `${locale}/${product}/${len.inches}`);
    assert.ok(d.home.training.sstCaption.includes(d.nationalPackage.historical));
    assert.equal(validateRequest(request(base, locale)).value.locale, locale);
  }
});

test('accepted intake and notifications preserve trainer length, grip and canonical identity without contacting anyone', async () => {
  for (const series of ['sst', 'spot']) {
    const store = intakeStore();
    const p = request({ ...trainer(series, 500, 27.9), grip: 'L7', configurationKey: 'forged-key' }, 'ar');
    const r = await acceptRequest(p, { ip: '127.0.0.1', config: { store, notifier: null, minElapsedMs: 1500, salt: 'fixture', rateLimit: { max: 10, windowSeconds: 60 } } });
    assert.equal(r.http, 201);
    const saved = await store.getLead(r.body.request_id);
    const record = JSON.parse(JSON.stringify(saved.record));
    assert.equal(record.locale, 'ar');
    assert.equal(record.config.weight, 500);
    assert.equal(record.config.lengthIn, 27.9);
    assert.equal(record.config.grip, 'L7');
    assert.equal(record.config.configurationKey, configurationKey(record.config));
    assert.match(buildMessage(record).text, /27\.9/);
    assert.match(buildTelegramText(record), /27\.9/);
  }
});

test('accepted intake, JSON reconstruction and notifications preserve an exact custom length', async () => {
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
  const access = { requireCap: () => {}, authorize: async () => ({ via: 'owner' }), ensureSelfProfile: async () => ({ id: 'profile1' }), controlledProfileIds: async () => new Set(['profile1']) };
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

test('v3 trainer drafts inside the existing v2 storage wrapper retain length in revisions, duplication and review', async () => {
  const store = createMemoryStore(), api = configService(store);
  for (const series of ['sst', 'spot']) {
    const cfg = await api.importDraft(ctx, { v: 2, c: { ...trainer(series, 200, 26.3), grip: 'L0' } });
    assert.equal(cfg.currentRevision.fields.catalogueVersion, 3);
    assert.equal(cfg.currentRevision.fields.lengthIn, 26.3);
    assert.equal(cfg.currentRevision.fields.configurationKey, configurationKey(cfg.currentRevision.fields));
    const review = await api.requestManufacturingConfirmation(ctx, cfg.id);
    assert.equal(review.targets.lengthIn, 26.3);
    assert.equal(review.customRequest, true);
    const dup = await api.duplicate(ctx, cfg.id);
    assert.equal(dup.currentRevision.fields.configurationKey, cfg.currentRevision.fields.configurationKey);
    assert.equal(dup.currentRevision.fields.lengthIn, 26.3);
    const incomplete = await api.importDraft(ctx, { v: 2, c: { ...trainer(series, 200), lengthIn: undefined } });
    assert.equal(incomplete.currentRevision.fields.lengthIn, undefined);
    await assert.rejects(api.requestManufacturingConfirmation(ctx, incomplete.id), e => e.code === 'standard_confirmation_blocked' && e.details.missingForStandard.includes('lengthIn'));
  }
});

test('custom length survives imported drafts, duplicates and manufacturing review', async () => {
  const store = createMemoryStore(), api = configService(store);
  const cfg = await api.importDraft(ctx, { v: 2, c: { ...base, lengthMode: 'custom', customLengthIn: '28.125', ra: '60' } });
  assert.equal(cfg.currentRevision.fields.customLengthIn, 28.125);
  const review = await api.requestManufacturingConfirmation(ctx, cfg.id);
  assert.equal(review.targets.customLengthIn, 28.125);
  assert.equal(review.customRequest, true);
  const dup = await api.duplicate(ctx, cfg.id);
  assert.equal(dup.currentRevision.fields.customLengthIn, 28.125);
});

test('all explicit lengths, even 27 inches and historical trainer weights, inherit no SKU, price or availability', async () => {
  const store = createMemoryStore(), catalog = createCatalog({ store });
  for (const c of [base, trainer('sst', 270), trainer('spot', 270)]) for (const { inches: lengthIn } of standardLengths) {
    const line = { ...c, productKind: c.series === 'great' ? 'racquet' : c.series, precisionLevel: 'P1.5', country: 'AE', quantity: 1, lengthIn };
    assert.equal(skuFor(line), null);
    assert.notEqual(catalog.resolvePrice(line).status, 'priced');
    const availability = await catalog.availability(line);
    assert.equal(availability.state, 'requires_review');
    assert.equal(availability.leadTime, undefined);
    assert.equal(availability.sku, undefined);
  }
  for (const productKind of ['sst', 'spot']) for (const weight of [200, 205, 495, 500]) assert.equal((await catalog.availability({ productKind, weight, grip: 'L3' })).state, 'requires_review');
});

test('incomplete new drafts cannot fall back to historical SKUs, stock records or an approved old price', async () => {
  const store = createMemoryStore();
  const approvedHistoricalPrice = { id: 'historical-fixture', status: 'approved', scopeType: 'catalogue', scope: { productKind: 'racquet', series: 'great', country: 'AE' }, currency: 'EUR', unitCents: 25000 };
  const catalog = createCatalog({ store, priceBookVersions: [approvedHistoricalPrice] });
  const legacy = { productKind: 'racquet', series: 'great', mode: 'listed', precisionLevel: 'P1.5', weight: 272, grip: 'L3', country: 'AE', quantity: 1 };
  assert.equal(catalog.resolvePrice(legacy).status, 'priced');
  await store.commit({ writes: [{ type: 'stock', id: skuFor(legacy), expectedVersion: -1, doc: { state: 'in_stock', available: 10, source: 'fixture historical stock' } }] });
  assert.equal((await catalog.availability(legacy)).state, 'in_stock');
  for (const productKind of ['racquet', 'sst', 'spot']) for (const marker of [{ catalogueVersion: 3 }, { catalogueVersion: 2 }, { lengthMode: 'standard' }]) {
    const line = { ...legacy, productKind, series: productKind === 'racquet' ? 'great' : productKind, weight: productKind === 'racquet' ? 272 : 270, ...marker };
    assert.equal(skuFor(line), null, JSON.stringify(line));
    assert.notEqual(catalog.resolvePrice(line).status, 'priced');
    const availability = await catalog.availability(line);
    assert.equal(availability.state, 'requires_review', JSON.stringify(line));
    assert.equal(availability.leadTime, undefined);
    assert.equal(availability.sku, undefined);
  }
});

test('new assortment uses request intake and cannot activate the historical financial flow', async () => {
  for (const c of [base, trainer('sst', 200), trainer('spot', 500)]) {
    const r = await acceptOrder({ ...request(c), plan: 'A' }, { store: {}, accessSecret: 'x'.repeat(32) });
    assert.equal(r.http, 400);
    assert.equal(r.body.status, 'invalid');
  }
});

test('manufacturing approval requires the exact selected trainer length or custom request length', async () => {
  const store = createMemoryStore(), api = configService(store);
  const protocol = { method: 'fixture method', instrument: 'fixture instrument', resolution: '0.001 in', calibration: 'fixture calibration', basis: 'unstrung' };
  for (const fields of [{ ...base, lengthMode: 'custom', customLengthIn: '28.125', targetRA: 60 }, trainer('sst', 200, 26.3), trainer('spot', 500, 27.9)]) {
    const cfg = await api.create(ctx, { name: 'Length review', fields });
    const review = await api.requestManufacturingConfirmation(ctx, cfg.id);
    const requested = fields.lengthMode === 'custom' ? 28.125 : fields.lengthIn;
    for (const agreedLengthIn of [undefined, 27, { anything: 'not a length' }, -1, 0, '27 in', '1e2']) {
      await assert.rejects(api.decideReview(ctx, review.id, { decision: 'approved', protocol: { ...protocol, agreedLengthIn } }), e => e.code === 'validation_failed', String(agreedLengthIn));
    }
    const approved = await api.decideReview(ctx, review.id, { decision: 'approved', protocol: { ...protocol, agreedLengthIn: String(requested).replace('.', ',') } });
    assert.equal(approved.protocol.agreedLengthIn, requested);
    assert.equal(approved.targets[fields.lengthMode === 'custom' ? 'customLengthIn' : 'lengthIn'], requested);
  }
});
