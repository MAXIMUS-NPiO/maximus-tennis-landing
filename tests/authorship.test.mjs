/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/**
 * Authorship and the confidential-term guard: the notice is formed the same way everywhere, and the
 * guard reads figures, ranges and currencies the way the site writes them. The guarded terms
 * themselves never appear here; neutral figures stand in for them.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { AUTHOR, copyrightYears, notice, noticeLine, rightsUrl } from "../lib/authorship";
import { candidates, confidentialHits } from "../scripts/lib/guard.mjs";

test("the notice names the author, with the first year and the build year", () => {
  assert.equal(AUTHOR, "Maximus Kiriyakulov");
  assert.equal(copyrightYears(2026), "2026");
  assert.equal(copyrightYears(2028), "2026–2028");
  assert.equal(notice(2026), "© 2026 Maximus Kiriyakulov");
  assert.equal(noticeLine(2027), "© 2026–2027 Maximus Kiriyakulov. All rights reserved.");
  assert.equal(rightsUrl("ru"), "https://maximus.tennis/ru/terms#copyright");
});

test("figures are read without group separators, in every notation", () => {
  for (const s of ["7,654,321", "7 654 321", "7.654.321", "7 654 321", "7 654 321", "7654321"]) {
    assert.ok(candidates(`total ${s} units`).has("7654321"), s);
  }
  assert.ok(candidates("3.141592 exactly").has("3.141592"), "a decimal keeps its point");
});

test("ranges, currencies and word sequences are read as one candidate", () => {
  assert.ok(candidates("from 12 – 34 g").has("12-34"));
  assert.ok(candidates("12—34").has("12-34"));
  assert.ok(candidates("price 99 €").has("99 eur"));
  assert.ok(candidates("Alpha Beta Gamma").has("alpha beta gamma"));
  assert.ok(candidates("ALPHA beta").has("alpha beta"));
});

test("ordinary site text carries no guarded term", () => {
  assert.equal(confidentialHits("MAXIMUS GREAT series, 363 g: the complete composition. Family Tennis Plan. © 2026 Maximus Kiriyakulov."), 0);
});
