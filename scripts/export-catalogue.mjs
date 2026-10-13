/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/** Deterministic request catalogue and per-country reference collection. Never a stock/price list. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { seriesList, seriesCodes, standardLengths, grips, sweetSpotTrainer, spotTrainer, catalogueCounts, nationalPackage, productDataVersion, configurationKey, catalogueVariantKey } from '../data/products.js';
const dir = process.argv[2] || 'docs/catalogue-tables';
mkdirSync(dir, { recursive: true });
const historical = seriesList.flatMap(s => s.matrix.map(p => ({ base_variant_id: `${s.id}-${p.weight}`, series_id: s.id, series_name: s.short, head_size_sq_in: s.headSizeSqIn, weight_g: p.weight, historical_balance_mm: p.balance, balance_status: s.balanceStatus, measurement_basis: 'NOT_PROVIDED' })));
const unknowns = { balance_mm: null, swingweight: null, stiffness_ra: null, price: null, availability: null, lead_time: null, factory_sku: null };
const lengthFields = l => ({ length_in: l.inches, length_mm: Math.round(l.inches * 2540) / 100, length_class: l.category });
const playing = seriesList.flatMap(s => s.matrix.flatMap(p => standardLengths.map(l => ({ catalogue_variant_id: catalogueVariantKey({ series: s.id, weight: p.weight, lengthIn: l.inches }), base_variant_id: `${s.id}-${p.weight}`, series_id: s.id, head_size_sq_in: s.headSizeSqIn, weight_g: p.weight, ...lengthFields(l), ...unknowns, status: 'REQUEST_OPTION_REQUIRES_CONFIRMATION' }))));
const trainerHistory = [
  ...sweetSpotTrainer.system.map(p => ({ family_id: 'sst', weight_g: p.weight, historical_length_in: sweetSpotTrainer.historicalLengthIn, head_size_sq_in: sweetSpotTrainer.headSizeSqIn, string_pattern: sweetSpotTrainer.stringPattern, historical_balance_mm: p.balance, balance_status: p.balance === null ? 'NOT_PROVIDED' : 'SUPPLIED_HISTORICAL' })),
  ...spotTrainer.weights.map(weight => ({ family_id: 'spot', weight_g: weight, historical_length_in: null, head_size_sq_in: null, string_pattern: null, historical_balance_mm: null, balance_status: 'NOT_PROVIDED' })),
];
const trainers = trainerHistory.flatMap(p => standardLengths.map(l => ({ family_id: p.family_id, catalogue_variant_id: catalogueVariantKey({ series: p.family_id, weight: p.weight_g, lengthIn: l.inches }), weight_g: p.weight_g, ...lengthFields(l), head_size_sq_in: p.head_size_sq_in, string_pattern: p.string_pattern, ...unknowns, balance_status: 'NOT_PROVIDED', status: 'REQUEST_OPTION_REQUIRES_CONFIRMATION' })));
const all = [...playing.map(p => ({ family_id: p.series_id, ...p })), ...trainers];
const nationalLines = all.flatMap(p => grips.map(g => ({ configuration_id: configurationKey({ series: p.family_id, weight: p.weight_g, lengthIn: p.length_in, grip: g.id }), catalogue_variant_id: p.catalogue_variant_id, family_id: p.family_id, weight_g: p.weight_g, length_in: p.length_in, length_mm: p.length_mm, length_class: p.length_class, grip_id: g.id, grip_nominal_in: `${g.inches}${g.fraction}`, quantity_per_country: nationalPackage.copiesPerCombination, head_size_sq_in: p.head_size_sq_in, balance_mm: null, swingweight: null, stiffness_ra: null, price: null, availability: null, lead_time: null, factory_sku: null, status: nationalPackage.status })));
const csv = rows => {
  const keys = [...new Set(rows.flatMap(r => Object.keys(r)))];
  const cell = v => v == null ? '' : `"${String(v).replaceAll('"', '""')}"`;
  return [keys.join(','), ...rows.map(r => keys.map(k => cell(r[k])).join(','))].join('\n') + '\n';
};
for (const [name, rows] of [['base-models-99', historical], ['playing-variants-693', playing], ['trainer-weight-history-122', trainerHistory], ['trainer-variants-854', trainers], ['all-request-variants-1547', all], ['national-package-lines-12376', nationalLines]]) writeFileSync(`${dir}/${name}.csv`, '\uFEFF' + csv(rows));
writeFileSync(`${dir}/catalogue-snapshot.json`, JSON.stringify({
  author: '© 2026 Maximus Kiriyakulov. All rights reserved.', revision: productDataVersion,
  sourceCommit: '0fd7bcf7d072a3aef0e9ac1b385313c0077565b1',
  sources: ['Published catalogue 0fd7bcf: original weights, historical measurements, heads and branding', 'Owner trainer-length and National Package instruction, 13 October 2026', 'data/products.js: seven lengths and eight nominal factory grips L0–L7', 'Owner clarification, 13 October 2026: permanent reference library, matte-black bases, illustrative personal sets/batches and Pro Shop architectural concept'],
  counts: catalogueCounts, seriesCodes,
  status: 'Preview request matrix, not production approval, stock, a price list or competition certification',
  naming: 'GREAT retained. Spoken Grade does not authorize a series rename.',
  trainerStep: 'Both trainer lines: 200–500 g inclusive, step 5 g, each weight at all seven requested lengths.',
  unknownPolicy: 'JSON null / empty CSV cells mean NOT_PROVIDED, never zero. Historical balances are separate and are not inherited by any explicitly selected length, including 27 in.',
  grips, lengths: standardLengths, historical, trainerHistory, playing, trainers,
  nationalPackage: { ...nationalPackage, purpose: 'Proposed per-country reference/fitting collection, including rare larger factory grips; no medical or stock claims. Custom lengths and P classes do not multiply this package. No number of countries is assumed.' },
}, null, 2) + '\n');
writeFileSync(`${dir}/national-package-specification.json`, JSON.stringify({ ...nationalPackage, catalogueRevision: productDataVersion, unknownPolicy: 'Null means NOT_PROVIDED, not zero.', gripDimensions: 'Nominal factory size labels; no raw-handle dimensions or measurements inferred.', lines: nationalLines }, null, 2) + '\n');
if (new Set(all.map(x => x.catalogue_variant_id)).size !== 1547 || new Set(nationalLines.map(x => x.configuration_id)).size !== 12376 || nationalLines.length !== 12376 || nationalLines.reduce((n, x) => n + x.quantity_per_country, 0) !== 24752) throw new Error('Catalogue/package counts mismatch');
console.log(`Exported ${historical.length} historical bases, ${playing.length} playing + ${trainers.length} trainer variants = ${all.length}; National Package ${nationalLines.length} combinations / ${nationalPackage.unitsPerCountry} units per country`);
