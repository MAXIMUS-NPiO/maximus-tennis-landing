/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/** Grip shape (Founder, 15 October 2026): copy, request schema, browser boundary, counts and notifications. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { gripShapeCopy, gripShapeLocales } from '../content/grip-shape-copy.js';
import { locales, getDict } from '../lib/i18n.js';
import { gripShapes, grips, nationalPackage, catalogueCounts, configurationKey } from '../data/products.js';
import { validateConfig, validateRequest, GRIP_SHAPE_IDS } from '../lib/intake/schema.js';
import { PERSIST, toPayload } from '../lib/client/configuration.js';
import { buildMessage, buildTelegramText } from '../lib/intake/notify.js';
import { sectionPoints } from '../lib/grip-sections.js';

const base = { series: 'great', catalogueVersion: 3, cls: 'P1.5', mode: 'listed', weight: 272, lengthMode: 'standard', lengthIn: 27, grip: 'L3', setType: 'individual', sets: 1, use: 'play', ptype: 'none' };
const BRANDS = /\b(wilson|head|babolat|yonex|prince|dunlop|tecnifibre|v[öo]lkl|pro ?kennex|angell|tk ?82)\b/i;

test('five options: three geometries, a replica of the player\'s handle, and "not sure yet"', () => {
  assert.deepEqual(GRIP_SHAPE_IDS, ['classic', 'rectangular', 'even', 'replica', 'advise']);
  assert.deepEqual(gripShapes.map((s) => s.kind), ['geometry', 'geometry', 'geometry', 'reference', 'open']);
});

test('the copy exists in every site language with the English structure and names no racquet brand', () => {
  assert.deepEqual([...gripShapeLocales].sort(), [...locales].sort());
  for (const l of locales) {
    const G = gripShapeCopy(l);
    assert.deepEqual(Object.keys(G.shapes), GRIP_SHAPE_IDS, l);
    for (const id of GRIP_SHAPE_IDS) assert.equal(G.shapes[id].length, 2, `${l}: ${id}`);
    assert.match(G.note, /L0/, `${l}: note keeps L0`);
    assert.match(G.note, /L7/, `${l}: note keeps L7`);
    for (const fam of ['GREAT', 'POWER', 'SPIN', 'Sweet Spot Trainer', 'Spot Trainer']) assert.ok(G.note.includes(fam), `${l}: note keeps ${fam}`);
    assert.ok(G.countNote.includes('National Package'), `${l}: count note names the National Package`);
    assert.doesNotMatch(JSON.stringify(G), BRANDS, `${l}: no racquet brand or model`);
  }
});

test('Russian and English masters say what the Founder approved', () => {
  const ru = gripShapeCopy('ru');
  assert.equal(ru.title, 'Форма ручки');
  assert.equal(ru.statement, 'Размер и форма — два отдельных выбора.');
  assert.deepEqual(ru.shapes.replica[0], 'Как у вашей ракетки');
  const en = gripShapeCopy('en');
  assert.match(en.note, /can be requested/);
  assert.match(en.shapes.replica[1], /reproduced on request/);
  assert.match(en.caption, /Schematic; not to scale/);
});

test('the dictionaries carry the grip shape: build lead, review labels, series FAQ, National Package scope', () => {
  for (const l of locales) {
    const d = getDict(l);
    const G = gripShapeCopy(l);
    assert.deepEqual(d.gripShape, G, l);
    assert.equal(d.build.lead, G.buildLead, l);
    assert.equal(d.build.fieldNames.gripShape, G.title, l);
    assert.equal(d.build.fieldNames.gripReference, G.referenceShort, l);
    assert.ok(d.nationalPackage.scope.endsWith(G.npScope), `${l}: National Package scope`);
    const i = d.seriesPage.faq.findIndex((q) => q[0] === G.faq[0] && q[1] === G.faq[1]);
    assert.ok(i > 0 && /L0/.test(d.seriesPage.faq[i - 1][1]), `${l}: the shape question follows the overgrip question`);
    assert.equal(d.seriesPage.faq.filter((q) => q[0] === G.faq[0]).length, 1, `${l}: asked once`);
  }
});

test('the server accepts a request without a shape; the configurator requires one', () => {
  const server = validateConfig(base);
  assert.equal(server.ok, true, JSON.stringify(server.errors));
  assert.equal(server.value.gripShape, undefined);
  assert.equal(validateConfig(base, { requireGripShape: true }).errors['config.gripShape'], 'required');
  assert.equal(validateConfig({ ...base, gripShape: 'square' }).errors['config.gripShape'], 'invalid_choice');
  for (const id of ['classic', 'rectangular', 'even', 'advise']) {
    const r = validateConfig({ ...base, gripShape: id, gripReference: 'Should be dropped' }, { requireGripShape: true });
    assert.equal(r.ok, true, id);
    assert.equal(r.value.gripShape, id);
    assert.equal('gripReference' in r.value, false, `${id}: a reference is kept only for a replica`);
  }
});

test('a replica needs the racquet whose handle is reproduced, as plain text up to 160 characters', () => {
  assert.equal(validateConfig({ ...base, gripShape: 'replica' }).errors['config.gripReference'], 'required');
  assert.equal(validateConfig({ ...base, gripShape: 'replica', gripReference: 'x'.repeat(161) }).errors['config.gripReference'], 'too_long');
  const ok = validateConfig({ ...base, gripShape: 'replica', gripReference: '  Brand X Model 98 (2024)  ' });
  assert.equal(ok.ok, true, JSON.stringify(ok.errors));
  assert.equal(ok.value.gripReference, 'Brand X Model 98 (2024)');
  const req = validateRequest({ purpose: 'config', locale: 'en', consent: true, idempotencyKey: '7a1c2c1e-6c8b-4d0e-9a51-3c1f0f0d2b11', elapsedMs: 4000, hp: '', fields: { name: 'Synthetic', email: 'test@example.invalid', role: 'player', country: 'Test' }, config: { ...base, gripShape: 'replica', gripReference: 'Brand X Model 98' } });
  assert.equal(req.ok, true, JSON.stringify(req.errors));
  assert.equal(req.value.config.gripShape, 'replica');
  assert.equal(req.value.config.gripReference, 'Brand X Model 98');
});

test('the browser keeps the shape but never the named racquet; the payload carries both', () => {
  assert.equal(PERSIST.gripShape('rectangular'), true);
  assert.equal(PERSIST.gripShape('round'), false);
  assert.equal('gripReference' in PERSIST, false);
  const p = toPayload({ ...base, gripShape: 'replica', gripReference: 'Brand X Model 98' });
  assert.equal(p.gripShape, 'replica');
  assert.equal(p.gripReference, 'Brand X Model 98');
  const q = toPayload({ ...base, gripShape: 'even', gripReference: 'stale text' });
  assert.equal(q.gripShape, 'even');
  assert.equal('gripReference' in q, false);
});

test('the shape is an order option: request keys and every count stay as they were', () => {
  const a = validateConfig({ ...base, gripShape: 'classic' }).value.configurationKey;
  const b = validateConfig({ ...base, gripShape: 'rectangular' }).value.configurationKey;
  assert.equal(a, 'great-272-L27-L3');
  assert.equal(a, b);
  assert.equal(configurationKey({ ...base, gripShape: 'even' }), 'great-272-L27-L3');
  assert.equal(catalogueCounts.totalRequestedVariants, 1547);
  assert.equal(nationalPackage.combinations, 1547 * grips.length);
  assert.equal(nationalPackage.combinations, 12376);
  assert.deepEqual([...nationalPackage.dimensions], ['family', 'weight', 'length', 'factory grip']);
});

test('notifications name the shape in words, the handle to reproduce, and a missing shape', () => {
  const rec = (config) => ({ request_id: 'MX-CFG-20261015-ABCDEF', created_at: '2026-10-15T08:00:00Z', purpose: 'config', locale: 'en', contact: { name: 'Synthetic', email: 'test@example.invalid' }, config });
  const replica = buildMessage(rec({ ...base, gripShape: 'replica', gripReference: 'Brand X Model 98' })).text;
  assert.match(replica, /Grip: L3\nGrip shape: reproduce the handle of the requester's racquet \(replica\)\nHandle to reproduce \(brand and model\): Brand X Model 98/);
  assert.match(buildMessage(rec({ ...base, gripShape: 'rectangular' })).text, /Grip shape: rectangular \(rectangular\)/);
  assert.match(buildMessage(rec(base)).text, /Grip shape: not stated in the request — agree with the requester before production/);
  assert.match(buildTelegramText(rec({ ...base, gripShape: 'even' })), /Grip shape: even-sided \(even\)/);
});

test('cross-sections: one perimeter for every shape, proportions in the stated order', () => {
  const dims = {};
  for (const id of ['classic', 'rectangular', 'even']) {
    const pts = sectionPoints(id).split(' ').map((p) => p.split(',').map(Number));
    assert.equal(pts.length, 8, id);
    let per = 0;
    for (let i = 0; i < 8; i++) { const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % 8]; per += Math.hypot(x2 - x1, y2 - y1); }
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    dims[id] = { per, ratio: (Math.max(...xs) - Math.min(...xs)) / (Math.max(...ys) - Math.min(...ys)) };
  }
  for (const id of ['rectangular', 'even']) assert.ok(Math.abs(dims[id].per - dims.classic.per) < 0.2, `${id}: same perimeter`);
  assert.ok(dims.even.ratio < dims.classic.ratio && dims.classic.ratio < dims.rectangular.ratio, JSON.stringify(dims));
});
