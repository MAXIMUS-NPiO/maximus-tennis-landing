/**
 * Family Plan — the control cases of §10 of the Founder's brief, one test each.
 * Integer arithmetic is compared exactly; fractional hours and unit prices within 1e-9.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultPlan, parsePlan, computePlan, restore, serialise, sessionHours, unitPrice, money,
  STORAGE_VERSION,
} from "../lib/familyPlan";

const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} vs ${b}`);

/** The main reference: planned P=2, C=50, F=4, D=90, B=250; ages 6→16; M=12; extras 100/50/25 + 20/30 a month. */
function reference(over = {}) {
  const p = defaultPlan();
  p.scenarios.planned = { players: "2", cost: "50", sessions: "4", minutes: "90", contacts: "250" };
  p.start = "6"; p.end = "16"; p.months = "12";
  p.extras = { equipment: "100", clothing: "50", renewal: "25", court: "20", travel: "30" };
  for (const [k, v] of Object.entries(over)) {
    if (k.startsWith("planned.")) p.scenarios.planned[k.slice(8)] = v;
    else if (k.startsWith("extras.")) p.extras[k.slice(7)] = v;
    else p[k] = v;
  }
  return p;
}

test("defaults match version 15: USD, planned, M = 0, first step, every number 0", () => {
  const p = defaultPlan();
  assert.equal(p.currency, "USD");
  assert.equal(p.selected, "planned");
  assert.equal(p.months, "0");
  assert.equal(p.step, 0);
  for (const id of ["now", "planned", "wish"]) for (const v of Object.values(p.scenarios[id])) assert.equal(v, "0");
  for (const v of Object.values(p.extras)) assert.equal(v, "0");
});

test("main reference: $5,575 and every figure that leads to it", () => {
  const r = computePlan(reference());
  assert.ok(r.ok, JSON.stringify(r.errors));
  const a = r.annual.planned;
  assert.equal(a.playerSessions, 96);
  assert.equal(a.trainingCost, 4800);
  assert.equal(a.playerHours, 144);
  assert.equal(a.contacts, 24000);
  close(a.costPerHour, 100 / 3, "cost per hour");
  close(a.costPerContact, 0.2, "cost per contact");
  assert.deepEqual(r.longTerm.planned.map((x) => x.cost), [4800, 9600, 14400, 19200, 24000, 48000]);
  assert.deepEqual(r.longTerm.planned.map((x) => x.activeYears), [1, 2, 3, 4, 5, 10]);
  const f = r.final;
  assert.equal(f.oneOffCosts, 175);
  assert.equal(f.monthlyExtraCosts, 50);
  assert.equal(f.extraCosts, 775);
  assert.equal(f.playerSessions, 96);
  assert.equal(f.trainingCost, 4800);
  assert.equal(f.total, 5575);
  assert.equal(f.playerHours, 144);
  assert.equal(f.contacts, 24000);
});

test("the other two scenarios stay independent zero scenarios", () => {
  const r = computePlan(reference());
  for (const id of ["now", "wish"]) {
    assert.equal(r.annual[id].trainingCost, 0);
    assert.equal(r.annual[id].costPerHour, null);
    assert.equal(r.annual[id].costPerContact, null);
  }
});

test("all zeros: every sum is 0 and both unit costs are undefined, never NaN or Infinity", () => {
  const r = computePlan(defaultPlan());
  assert.ok(r.ok);
  for (const id of ["now", "planned", "wish"]) {
    const a = r.annual[id];
    assert.equal(a.trainingCost, 0); assert.equal(a.playerHours, 0); assert.equal(a.contacts, 0);
    assert.equal(a.costPerContact, null); assert.equal(a.costPerHour, null);
  }
  assert.equal(r.final.total, 0);
});

test("C = 0: hours and contacts unchanged, unit costs 0, total is the extras alone", () => {
  const r = computePlan(reference({ "planned.cost": "0" }));
  assert.equal(r.annual.planned.playerHours, 144);
  assert.equal(r.annual.planned.contacts, 24000);
  assert.equal(r.annual.planned.costPerHour, 0);
  assert.equal(r.annual.planned.costPerContact, 0);
  assert.equal(r.final.total, 775);
});

test("B = 0: no contacts, cost per contact undefined, training cost and total unchanged", () => {
  const r = computePlan(reference({ "planned.contacts": "0" }));
  assert.equal(r.annual.planned.contacts, 0);
  assert.equal(r.annual.planned.costPerContact, null);
  assert.equal(r.annual.planned.trainingCost, 4800);
  assert.equal(r.final.total, 5575);
});

test("D = 0: no hours, cost per hour undefined, contacts and cost unchanged", () => {
  const r = computePlan(reference({ "planned.minutes": "0" }));
  assert.equal(r.annual.planned.playerHours, 0);
  assert.equal(r.annual.planned.costPerHour, null);
  assert.equal(r.annual.planned.contacts, 24000);
  assert.equal(r.final.total, 5575);
});

test("P = 0 or F = 0: no activity, extras remain, unit costs still from C, D and B", () => {
  for (const key of ["planned.players", "planned.sessions"]) {
    const r = computePlan(reference({ [key]: "0" }));
    const a = r.annual.planned;
    assert.equal(a.playerSessions, 0); assert.equal(a.playerHours, 0); assert.equal(a.contacts, 0); assert.equal(a.trainingCost, 0);
    assert.equal(r.final.total, 775, key);
    close(a.costPerHour, 100 / 3, key);
    close(a.costPerContact, 0.2, key);
  }
});

test("M = 0: the one-off items are still charged once; the annual table is untouched", () => {
  const r = computePlan(reference({ months: "0" }));
  assert.equal(r.final.total, 175);
  assert.equal(r.final.playerSessions, 0);
  assert.equal(r.final.trainingCost, 0);
  assert.equal(r.annual.planned.trainingCost, 4800);
});

test("ages 6 → 9: active years 1/2/3/3/3/3", () => {
  const r = computePlan(reference({ end: "9" }));
  assert.deepEqual(r.longTerm.planned.map((x) => x.activeYears), [1, 2, 3, 3, 3, 3]);
  assert.deepEqual(r.longTerm.planned.map((x) => x.cost), [4800, 9600, 14400, 14400, 14400, 14400]);
});

test("ages 6 → 9 with M = 120: the final total ignores the ages — $54,175", () => {
  const r = computePlan(reference({ end: "9", months: "120" }));
  assert.equal(r.final.total, 54175);
  assert.equal(r.final.playerSessions, 960);
  assert.equal(r.final.playerHours, 1440);
  assert.equal(r.final.contacts, 240000);
});

test("start = end: every long-term figure is 0; the final total for M = 12 is still $5,575", () => {
  const r = computePlan(reference({ start: "8", end: "8" }));
  assert.deepEqual(r.longTerm.planned.map((x) => x.cost), [0, 0, 0, 0, 0, 0]);
  assert.equal(r.final.total, 5575);
});

test("D = 45: 72 hours a year, 0.75 h shown exactly, $66.67 an hour", () => {
  const r = computePlan(reference({ "planned.minutes": "45" }));
  assert.equal(r.annual.planned.playerHours, 72);
  close(r.annual.planned.costPerHour, 200 / 3, "cost per hour");
  const sh = sessionHours("en", 45);
  assert.equal(sh.text, "0.75"); assert.equal(sh.approx, false);
});

test("D = 75: 120 hours a year, 1.25 h, $40 an hour", () => {
  const r = computePlan(reference({ "planned.minutes": "75" }));
  assert.equal(r.annual.planned.playerHours, 120);
  close(r.annual.planned.costPerHour, 40, "cost per hour");
  assert.deepEqual(sessionHours("en", 75), { text: "1.25", approx: false });
});

test("D = 45.5 (fractional minutes allowed, point or comma): 72.8 hours, 65.934065… an hour", () => {
  for (const d of ["45.5", "45,5"]) {
    const r = computePlan(reference({ "planned.minutes": d }));
    assert.ok(r.ok, d);
    close(r.annual.planned.playerHours, 72.8, d);
    close(r.annual.planned.costPerHour, 3000 / 45.5, d);
  }
  assert.equal(sessionHours("en", 45.5).approx, true);
});

test("C = 1 is valid: $96 a year, 0.004 per contact", () => {
  const r = computePlan(reference({ "planned.cost": "1" }));
  assert.equal(r.annual.planned.trainingCost, 96);
  close(r.annual.planned.costPerContact, 0.004, "cost per contact");
});

test("C = 50.5 and fractional extras are rejected, as in version 15", () => {
  const r = computePlan(reference({ "planned.cost": "50.5" }));
  assert.equal(r.ok, false);
  assert.deepEqual(r.errors, [{ path: "scenarios.planned.cost", code: "integer" }]);
  for (const k of ["equipment", "clothing", "renewal", "court", "travel"]) {
    const x = computePlan(reference({ [`extras.${k}`]: "1.5" }));
    assert.equal(x.ok, false, k);
    assert.equal(x.errors[0].path, `extras.${k}`);
  }
});

test("negative, fractional, malformed and non-finite inputs fail with the field to correct", () => {
  const cases = [
    [{ "planned.players": "-1" }, "scenarios.planned.players", "negative"],
    [{ "planned.players": "1.5" }, "scenarios.planned.players", "integer"],
    [{ "planned.sessions": "2.5" }, "scenarios.planned.sessions", "integer"],
    [{ "planned.contacts": "abc" }, "scenarios.planned.contacts", "number"],
    [{ "planned.minutes": "NaN" }, "scenarios.planned.minutes", "number"],
    [{ "planned.minutes": "Infinity" }, "scenarios.planned.minutes", "number"],
    [{ "planned.minutes": "9".repeat(400) }, "scenarios.planned.minutes", "tooLarge"],
    [{ "planned.cost": "9007199254740993" }, "scenarios.planned.cost", "tooLarge"],
    [{ start: "6.5" }, "start", "integer"],
    [{ months: "1.5" }, "months", "integer"],
    [{ start: "6", end: "5" }, "end", "endBeforeStart"],
  ];
  for (const [over, path, code] of cases) {
    const r = computePlan(reference(over));
    assert.equal(r.ok, false, JSON.stringify(over));
    assert.ok(r.errors.some((e) => e.path === path && e.code === code), `${JSON.stringify(over)} → ${JSON.stringify(r.errors)}`);
  }
});

test("empty months is an error; an explicit 0 is valid", () => {
  const empty = computePlan(reference({ months: "" }));
  assert.equal(empty.ok, false);
  assert.deepEqual(empty.errors, [{ path: "months", code: "required" }]);
  assert.equal(computePlan(reference({ months: "0" })).ok, true);
});

test("no empty required field is read as 0", () => {
  for (const key of ["planned.players", "planned.cost", "planned.sessions", "planned.minutes", "planned.contacts", "start", "end", "extras.court"]) {
    const r = computePlan(reference({ [key]: "" }));
    assert.equal(r.ok, false, key);
    assert.equal(r.errors[0].code, "required", key);
  }
});

test("an error in a scenario that is not selected still blocks the result", () => {
  const p = reference();
  p.scenarios.wish.players = "-2";
  const r = computePlan(p);
  assert.equal(r.ok, false);
  assert.equal(r.errors[0].path, "scenarios.wish.players");
});

test("extras are for the family: more players never multiply them", () => {
  const two = computePlan(reference()).final;
  const five = computePlan(reference({ "planned.players": "5" })).final;
  assert.equal(two.extraCosts, five.extraCosts);
  assert.equal(five.trainingCost, 5 * 4 * 12 * 50);
});

test("changing only the extras moves the total, not the unit costs or the long-term table", () => {
  const a = computePlan(reference());
  const b = computePlan(reference({ "extras.travel": "130" }));
  assert.equal(b.final.total - a.final.total, 12 * 100);
  assert.equal(a.annual.planned.costPerHour, b.annual.planned.costPerHour);
  assert.equal(a.annual.planned.costPerContact, b.annual.planned.costPerContact);
  assert.deepEqual(a.longTerm.planned, b.longTerm.planned);
});

test("scenarios, months and ages do not leak into one another", () => {
  const base = computePlan(reference());
  const p = reference();
  p.scenarios.now = { players: "1", cost: "80", sessions: "8", minutes: "60", contacts: "300" };
  const withNow = computePlan(p);
  assert.deepEqual(withNow.annual.planned, base.annual.planned);
  assert.deepEqual(withNow.annual.wish, base.annual.wish);
  assert.deepEqual(computePlan(reference({ months: "24" })).annual, base.annual);
  assert.equal(computePlan(reference({ end: "7" })).final.total, base.final.total);
});

test("a result too large to represent is an error, never a rounded figure", () => {
  const p = reference();
  p.scenarios.planned = { players: "9007199254", cost: "9007199254", sessions: "9007199", minutes: "60", contacts: "1" };
  const r = computePlan(p);
  assert.equal(r.ok, false);
  assert.deepEqual(r.errors, [{ path: "result", code: "tooLarge" }]);
});

test("unit prices show two to four decimals and never a false zero", () => {
  assert.equal(unitPrice("en", "USD", 100 / 3).text, "$33.3333");
  assert.equal(unitPrice("en", "USD", 0.2).text, "$0.20");
  assert.equal(unitPrice("en", "USD", 0.004).text, "$0.004");
  const tiny = unitPrice("en", "USD", 0.00001);
  assert.equal(tiny.below, true);
  assert.equal(tiny.text, "$0.0001");
  assert.equal(unitPrice("en", "USD", null), null);
});

test("money follows the language's separators with Latin digits", () => {
  assert.equal(money("en", "USD", 5575), "$5,575");
  assert.match(money("de", "EUR", 5575), /5\.575/);
  assert.match(money("ar", "USD", 5575), /5,575|5٬575/);
  assert.doesNotMatch(money("ar", "USD", 5575), /[٠-٩]/);
});

test("save and restore keep the whole plan; a damaged record is refused, never half-applied", () => {
  const p = reference({ selected: "planned", currency: "EUR" });
  p.step = 3; p.quoteSource = "Club price list"; p.quoteDate = "2026-10-08";
  const back = restore(serialise(p));
  assert.equal(back.status, "ok");
  assert.deepEqual(back.plan, p);
  assert.equal(restore(null).status, "none");
  assert.equal(restore("{not json").status, "invalid");
  assert.equal(restore(JSON.stringify({ v: STORAGE_VERSION + 1, plan: p })).status, "invalid");
  const broken = JSON.parse(serialise(p)); delete broken.plan.scenarios.wish;
  assert.equal(restore(JSON.stringify(broken)).status, "invalid");
  const bad = JSON.parse(serialise(p)); bad.plan.scenarios.now.players = "-3";
  assert.equal(restore(JSON.stringify(bad)).status, "invalid");
  const step = JSON.parse(serialise(p)); step.plan.step = 9;
  assert.equal(restore(JSON.stringify(step)).status, "invalid");
});

test("the quote source is optional and capped at 200 characters; the date is optional", () => {
  assert.equal(parsePlan({ ...reference(), quoteSource: "x".repeat(200) }).ok, true);
  const long = parsePlan({ ...reference(), quoteSource: "x".repeat(201) });
  assert.equal(long.ok, false);
  assert.equal(long.errors[0].code, "tooLong");
  assert.equal(parsePlan({ ...reference(), quoteDate: "" }).ok, true);
  assert.equal(parsePlan({ ...reference(), quoteDate: "08/10/2026" }).ok, false);
});

test("the tab's working copy survives a language switch even mid-correction, but never a broken shape", async () => {
  const { restoreDraft } = await import("../lib/familyPlan");
  const p = reference({ months: "" });                 // an incomplete field is still the family's input
  const back = restoreDraft(serialise(p));
  assert.equal(back.status, "ok");
  assert.equal(back.plan.months, "");
  assert.equal(computePlan(back.plan).ok, false);      // and the calculator still reports it
  const broken = JSON.parse(serialise(p)); broken.plan.extras = null;
  assert.equal(restoreDraft(JSON.stringify(broken)).status, "invalid");
  assert.equal(restoreDraft(null).status, "none");
});
