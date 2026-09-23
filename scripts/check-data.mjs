/** Product-data integrity checks — protects the published matrices and precision system. */
const { series, grips, precisionClasses, sweetSpotTrainer, spotTrainer } = await import("../data/products.js");
const fail = [];
const expect = (cond, msg) => { if (!cond) fail.push(msg); };

const counts = { great: 32, power: 33, spin: 29 };
for (const [id, n] of Object.entries(counts)) {
  const s = series[id];
  expect(s && s.matrix.length === n, `${id}: expected ${n} listed weights, got ${s ? s.matrix.length : "none"}`);
  const w = s.matrix.map((p) => p.weight);
  expect(w.every((x, i) => i === 0 || x > w[i - 1]), `${id}: weights must be strictly ascending`);
  expect(new Set(w).size === w.length, `${id}: duplicate weights`);
  for (const p of s.matrix) expect(p.balance === null || Number.isInteger(p.balance), `${id}: balance must be integer mm or null (${p.weight})`);
}
expect(series.spin.matrix.every((p) => p.balance === null), "spin: balances must be NOT PROVIDED (null)");
expect(series.power.matrix.every((p) => p.balance !== null) && series.great.matrix.every((p) => p.balance !== null), "power/great: balances must be present");
expect(series.power.matrix[0].weight === 210 && series.power.matrix[0].balance === 347 && series.power.matrix.at(-1).weight === 377 && series.power.matrix.at(-1).balance === 320, "power: endpoints mismatch");
expect(series.great.matrix[0].weight === 236 && series.great.matrix[0].balance === 343 && series.great.matrix.at(-1).weight === 369 && series.great.matrix.at(-1).balance === 321, "great: endpoints mismatch");
expect(series.great.headSizeSqIn === 97 && series.power.headSizeSqIn === 98 && series.spin.headSizeSqIn === 100, "head sizes mismatch");
expect(grips.length === 8 && grips[0].id === "L0" && grips[7].id === "L7", "grips: expected L0–L7");
expect(precisionClasses.length === 3, "precision: expected three classes");
const byId = Object.fromEntries(precisionClasses.map((c) => [c.id, c]));
expect(byId["P2.5"].weightG === 2.5 && byId["P2.5"].stiffness.valueRA === 1, "P2.5 values");
expect(byId["P1.5"].weightG === 1.5 && byId["P1.5"].stiffness.valueRA === 0.5, "P1.5 values");
expect(byId["P0.5"].weightG === 0.5 && byId["P0.5"].stiffness.kind === "exact-declared-reading", "P0.5 values");
expect(sweetSpotTrainer.headSizeSqIn === 50 && sweetSpotTrainer.lengthIn === 27 && sweetSpotTrainer.stringPattern === "12 × 14", "SST baseline");
expect(JSON.stringify(sweetSpotTrainer.system.map((x) => [x.weight, x.balance])) === JSON.stringify([[270, 330], [285, 325], [300, 325], [400, 320]]), "SST system");
expect(spotTrainer.targetDimensions === "NOT_PROVIDED" && spotTrainer.balances === "NOT_PROVIDED", "Spot Trainer: no invented dimensions or balances");
// Evidence statuses (founder instruction 21.09.2026)
expect(series.spin.matrixStatus === "REQUESTED_ARCHITECTURE" && series.spin.balanceStatus === "NOT_PROVIDED", "spin: must keep the status 'requested weight architecture' with balance NOT PROVIDED");
expect(series.great.balanceStatus === "MODELLED" && series.power.balanceStatus === "MODELLED", "great/power: balances must be labelled as calculated");
for (const id of ["great", "power", "spin"]) {
  const ps = series[id].paramStatus || {};
  expect(ps.swingweight === "not_provided" && ps.stiffness === "not_provided", `${id}: swingweight and stiffness must stay NOT PROVIDED until confirmed`);
}
expect(sweetSpotTrainer.precisionClassesApply === false, "SST: precision classes must not apply");

// The internal balance formula must never be present in the repository.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
const walk = (d) => readdirSync(d).flatMap((f) => { const p = path.join(d, f); if (["node_modules", ".next", ".git"].includes(f)) return []; return statSync(p).isDirectory() ? walk(p) : [p]; });
const banned = [
  /381\.135245/, /0\.162636422/, /shaleni/i, /borteyman/i, /ghana/i, /zero weight tolerance/i, /go tennis/i, /norris/i,
  /maximussports\.ae/i, /1[ ,.]?104[ ,.]?600/, /2[ ,.]?946[ ,.]?618/, /\b(102|136|204|139)\s?(EUR|€)/, /\bJude\b/, /\bNii\b/, /240\s?[–-]\s?340/,
];
// Scope: everything that can reach the public bundle or rendered pages. Internal governance
// documents (*.md) and the check scripts legitimately NAME the banned terms and are excluded.
const PUBLIC_DIRS = ["app", "components", "content", "data", "lib", "public"];
const publicFiles = PUBLIC_DIRS.flatMap((d) => walk(path.join(process.cwd(), d))).concat([path.join(process.cwd(), "middleware.js"), path.join(process.cwd(), "next.config.mjs")]);
for (const f of publicFiles) {
  if (!/\.(js|mjs|json|css|svg|txt|html)$/.test(f)) continue;
  const txt = readFileSync(f, "utf8");
  for (const re of banned) if (re.test(txt)) fail.push(`banned content ${re} in ${path.relative(process.cwd(), f)}`);
}

if (fail.length) { console.error(fail.join("\n")); process.exit(1); }
console.log("product data OK: GREAT 32 · POWER 33 · SPIN 29 · L0–L7 · P2.5/P1.5/P0.5 · SST · Spot Trainer · no banned content");
