/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/** Deterministic source tables for the catalogue/TZ; no prices, stock or invented measurements. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { seriesList, seriesCodes, standardLengths, sweetSpotTrainer, spotTrainer, catalogueCounts, productDataVersion, configurationKey } from '../data/products.js';
const dir = process.argv[2] || 'docs/catalogue-tables';
mkdirSync(dir, { recursive: true });
const historical = seriesList.flatMap(s => s.matrix.map(p => ({ base_variant_id: `${s.id}-${p.weight}`, series_id: s.id, series_name: s.short, head_size_sq_in: s.headSizeSqIn, weight_g: p.weight, historical_balance_mm: p.balance, balance_status: s.balanceStatus, measurement_basis: 'NOT_PROVIDED' })));
const playing = seriesList.flatMap(s => s.matrix.flatMap(p => standardLengths.map(l => ({ configuration_id: configurationKey({ series: s.id, weight: p.weight, lengthIn: l.inches }), base_variant_id: `${s.id}-${p.weight}`, series_id: s.id, head_size_sq_in: s.headSizeSqIn, weight_g: p.weight, length_in: l.inches, length_mm: Math.round(l.inches * 2540) / 100, length_class: l.category, balance_mm: null, swingweight: null, stiffness_ra: null, price: null, availability: null, lead_time: null, factory_sku: null, status: 'REQUEST_OPTION_REQUIRES_CONFIRMATION' }))));
const trainers = [
  ...sweetSpotTrainer.system.map(p => ({ family_id: 'sst', configuration_id: configurationKey({ series: 'sst', weight: p.weight }), weight_g: p.weight, length_in: sweetSpotTrainer.lengthIn, head_size_sq_in: sweetSpotTrainer.headSizeSqIn, string_pattern: sweetSpotTrainer.stringPattern, balance_mm: p.balance, balance_status: p.balance === null ? 'NOT_PROVIDED' : 'SUPPLIED_HISTORICAL', price: null, availability: null, lead_time: null, factory_sku: null })),
  ...spotTrainer.weights.map(weight => ({ family_id: 'spot', configuration_id: configurationKey({ series: 'spot', weight }), weight_g: weight, length_in: null, head_size_sq_in: null, string_pattern: null, balance_mm: null, balance_status: 'NOT_PROVIDED', price: null, availability: null, lead_time: null, factory_sku: null })),
];
const csv = rows => {
  const keys = Object.keys(rows[0]);
  const cell = v => v == null ? '' : `"${String(v).replaceAll('"', '""')}"`;
  return [keys.join(','), ...rows.map(r => keys.map(k => cell(r[k])).join(','))].join('\n') + '\n';
};
for (const [name, rows] of [['base-models-99', historical], ['playing-variants-693', playing], ['trainer-variants-122', trainers]]) writeFileSync(`${dir}/${name}.csv`, '\uFEFF' + csv(rows));
writeFileSync(`${dir}/catalogue-snapshot.json`, JSON.stringify({
  author: '© 2026 Maximus Kiriyakulov. All rights reserved.', revision: productDataVersion,
  sourceCommit: '9ec225b22415e813d38eb047094e6bb0a48d6938',
  sources: ['data/products.js (original 99 weights and historical balances)', 'Owner assortment instruction, 12 October 2026', 'MAXIMUS Catalogue Expansion TZ RU, revision 1.0, 12 October 2026'],
  counts: { ...catalogueCounts, totalRequestedVariants: playing.length + trainers.length }, seriesCodes,
  status: 'Prepared request matrix, not factory approval, stock, a price list or competition certification',
  naming: 'GREAT retained. Grade Series Plus is an unresolved wording in the owner request, not a new series or a rename.',
  trainerStep: '5 g for both lines is explicit in this implementation delegation; the PDF TZ describes Spot step as a working assumption. No trainer length multiplication.',
  unknownPolicy: 'JSON null / empty CSV cells mean NOT_PROVIDED, never zero. Historical balance records are preserved separately and are not inherited by new lengths.',
  historical, playing, trainers,
}, null, 2) + '\n');
console.log(`Exported ${historical.length} historical base rows, ${playing.length} playing rows, ${trainers.length} trainer rows = ${playing.length + trainers.length} request variants`);
