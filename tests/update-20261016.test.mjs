/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/** Update of 16 October 2026: fifteen grip sizes, fixed National Package, target RA request, narrowed replica wording. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { update20261016Locales } from '../content/update-20261016-copy.js';
import { locales, getDict } from '../lib/i18n.js';
import { grips, referenceGrips, nationalPackage } from '../data/products.js';
import { validateConfig, TARGET_BOUNDS } from '../lib/intake/schema.js';

const base = { series: 'great', catalogueVersion: 3, cls: 'P1.5', mode: 'listed', weight: 299, lengthMode: 'standard', lengthIn: 27, setType: 'individual', sets: 1, use: 'play', ptype: 'none' };

test('fifteen grip sizes L0–L7 in half steps; nominal circumference 4 + L/8 in', () => {
  assert.equal(grips.length, 15);
  for (const g of grips) assert.equal(g.nominalIn, 4 + g.level / 8);
  assert.equal(grips.find((g) => g.id === 'L2.5').nominalMm, 109.54);
  for (const g of grips) assert.equal(validateConfig({ ...base, grip: g.id }).ok, true, g.id);
  assert.equal(validateConfig({ ...base, grip: 'L7.5' }).errors['config.grip'], 'invalid_choice');
});

test('the National Package keeps its eight whole sizes and its totals', () => {
  assert.deepEqual(referenceGrips.map((g) => g.id), ['L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7']);
  assert.equal(nationalPackage.combinations, 12376);
  assert.equal(nationalPackage.unitsPerCountry, 24752);
});

test('target frame stiffness is requested from 30 to 90 RA with no default', () => {
  assert.deepEqual(TARGET_BOUNDS.ra, [30, 90]);
  assert.equal(validateConfig({ ...base, grip: 'L3' }).value.ra, undefined);
  assert.equal(validateConfig({ ...base, grip: 'L3', ra: '29' }).errors['config.ra'], 'out_of_range');
  assert.equal(validateConfig({ ...base, grip: 'L3', ra: '70', basis: 'unstrung' }).value.ra, 70);
});

test('every language carries the update: no eight-size claim, RA hint, narrowed replica', () => {
  assert.deepEqual([...update20261016Locales].sort(), [...locales].sort());
  for (const l of locales) {
    const d = getDict(l);
    assert.ok(/30/.test(d.update20261016.raHint) && /90/.test(d.update20261016.raHint), `${l}: RA hint`);
    assert.ok(d.update20261016.halfNote.includes('National Package'), `${l}: half note`);
    assert.ok(d.grip.statement.includes('L0') && d.grip.statement.includes('L7'), `${l}: grip statement`);
  }
  assert.doesNotMatch(JSON.stringify(getDict('en')), /eight factory grip sizes|8 grip sizes/i);
  assert.match(getDict('en').gripShape.shapes.replica[1], /technical feasibility check/);
});
