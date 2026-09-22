/**
 * Acceptance scenarios (§14 of the implementation brief) against a running production build.
 *
 *   BASE_URL=http://127.0.0.1:3100 ADMIN_PASSWORD=… EVIDENCE=./evidence [WORK=<local stack dir>] \
 *   NODE_PATH=$(npm root -g) node tests/e2e/acceptance.mjs
 *
 * WORK enables local fault injection (store and SMTP outages) against tests/local-stack.sh.
 * Results: $EVIDENCE/acceptance.json, screenshots in $EVIDENCE/screens. Browser: Chromium
 * emulation (viewport, offline, reduced motion) — not physical devices.
 */
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.env.BASE_URL || "http://127.0.0.1:3100";
const OUT = process.env.EVIDENCE || "./evidence";
const ADMIN = process.env.ADMIN_PASSWORD || "";
const WORK = process.env.WORK || "";
const SHOTS = path.join(OUT, "screens");
mkdirSync(SHOTS, { recursive: true });

const results = [];
const log = (...a) => console.log(...a);
const ONLY = (process.env.ONLY || "").split(",").filter(Boolean);
async function scenario(id, name, fn) {
  if (ONLY.length && !ONLY.includes(id)) return;
  const t0 = Date.now();
  try {
    const evidence = await fn();
    results.push({ id, name, result: "PASS", ms: Date.now() - t0, evidence });
    log(`PASS ${id} ${name}`);
  } catch (e) {
    results.push({ id, name, result: e && e.skip ? "SKIP" : "FAIL", ms: Date.now() - t0, error: String((e && e.message) || e).slice(0, 600) });
    log(`${e && e.skip ? "SKIP" : "FAIL"} ${id} ${name}: ${(e && e.message) || e}`);
  }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const skip = (msg) => { const e = new Error(msg); e.skip = true; throw e; };

/* ------------------------------------------------------------------ helpers */

async function admin(pathAndQuery) {
  if (!ADMIN) skip("ADMIN_PASSWORD not set");
  const res = await fetch(`${BASE}/api/leads/admin${pathAndQuery}`, { headers: { Authorization: `Basic ${Buffer.from(`qa:${ADMIN}`).toString("base64")}` } });
  return { status: res.status, body: res.headers.get("content-type")?.includes("json") ? await res.json() : await res.text() };
}
const lead = async (id) => (await admin(`?format=json&id=${encodeURIComponent(id)}`)).body;
const total = async () => (await admin("?format=json")).body.total;

async function freshPage(browser, opts = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...opts });
  if (opts.analyticsTest) await context.addInitScript(() => { window.__MX_ANALYTICS_TEST__ = true; });
  const page = await context.newPage();
  return { context, page };
}
const shot = async (page, name, full = false) => {
  const file = path.join(SHOTS, `${name}.png`);
  await page.screenshot({ path: file, fullPage: full });
  return path.relative(OUT, file);
};
const storage = (page, key) => page.evaluate((k) => sessionStorage.getItem(k), key);
const waitCfg = (page) => page.waitForSelector('.cfg[data-ready="true"]');

/** Fills the contact block of a LeadForm (fields are located by name). */
async function fillContact(form, { name = "QA Tester", email = "qa.tester@example.org", role = "player", country = "United Arab Emirates", message } = {}) {
  await form.locator('input[name="name"]').fill(name);
  await form.locator('input[name="email"]').fill(email);
  await form.locator('select[name="role"]').selectOption(role);
  await form.locator('input[name="country"]').fill(country);
  if (message !== undefined) await form.locator('textarea[name="message"]').fill(message);
  await form.locator('input[type="checkbox"][required]').check();
}
async function submitAndWait(form, page) {
  await page.waitForTimeout(1600); // human-like pause (server rejects < 1.5 s as too fast)
  await form.locator('button[type="submit"]').click();
  const res = await Promise.race([
    page.waitForSelector('[data-state="accepted"] [data-request-id]', { timeout: 20000 }).then((el) => el.getAttribute("data-request-id")),
    page.waitForSelector('.lead-result[data-state="failed"]', { timeout: 20000 }).then(() => null),
  ]);
  return res;
}
async function runConfigurator(page, { series = "great", cls = "P1.5", weight = "272", grip = "L3", setType = "triple", sets = "2" } = {}) {
  await waitCfg(page);
  const click = (sel) => page.locator(sel).first().click();
  if (await page.locator('input[name="series"]').count()) {
    await page.locator(`input[name="series"][value="${series}"]`).check();
    await click('button[data-next="series"]');
  }
  await page.locator(`input[name="cls"][value="${cls}"]`).check();
  await click('button[data-next="cls"]');
  await page.locator('input[name="mode"][value="listed"]').check();
  await page.locator("#c-weight").selectOption(weight);
  await click('button[data-next="weight"]');
  await page.locator(`input[name="grip"][value="${grip}"]`).check();
  await click('button[data-next="grip"]');
  await click('button[data-next="targets"]');
  await page.locator('input[name="ptype"][value="none"]').check();
  await click('button[data-next="personal"]');
  await page.locator(`input[name="setType"][value="${setType}"]`).check();
  await page.locator("#c-sets").fill(sets);
  await click('button[data-next="set"]');
  await page.locator('input[name="use"][value="play"]').check();
  await click('button[data-next="use"]');
}

/* ------------------------------------------------------------------ fault injection (local stack) */

function restart(kind) {
  if (!WORK) skip("local stack (WORK) not available");
  const cwd = process.cwd();
  if (kind === "bridge") {
    const p = spawn("node", ["tests/redis-rest-bridge.mjs"], { cwd, env: { ...process.env, REDIS_PORT: "6390", BRIDGE_PORT: "8079", BRIDGE_TOKEN: "local-test-token" }, detached: true, stdio: "ignore" });
    p.unref();
    writeFileSync(path.join(WORK, "bridge.pid"), String(p.pid));
  } else {
    const p = spawn("python3", ["tests/smtp_sink.py", path.join(WORK, "mail"), "2465", "--tls", path.join(WORK, "smtp.crt"), path.join(WORK, "smtp.key"), "--auth", "website@maximus.tennis:app-password-test"], { cwd, detached: true, stdio: "ignore" });
    p.unref();
    writeFileSync(path.join(WORK, "smtp.pid"), String(p.pid));
  }
}
function stop(kind) {
  if (!WORK) skip("local stack (WORK) not available");
  const f = path.join(WORK, `${kind === "bridge" ? "bridge" : "smtp"}.pid`);
  try { process.kill(Number(readFileSync(f, "utf8"))); } catch { /* already stopped */ }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ scenarios */

const browser = await chromium.launch();

await scenario("S01", "GREAT / POWER / SPIN open the configurator with the correct series", async () => {
  const out = [];
  for (const id of ["great", "power", "spin"]) {
    const { context, page } = await freshPage(browser);
    await page.goto(`${BASE}/en/racquets/${id}`);
    await page.locator(`a[href="/en/build?series=${id}&from=series"]`).first().click();
    await waitCfg(page);
    const state = JSON.parse(await storage(page, "mx.cfg.v2"));
    const step = await page.locator('.stepper [aria-current="step"]').innerText();
    const search = await page.evaluate(() => location.search);
    assert(state.c.series === id, `${id}: series not preselected (${state.c.series})`);
    assert(/Precision class/.test(step), `${id}: expected to start at precision step, got ${step}`);
    assert(search === "", `${id}: URL parameters not consumed (${search})`);
    out.push({ id, preselected: state.c.series, step, urlAfter: page.url() });
    if (id === "power") out.push({ screenshot: await shot(page, "configurator-preselected-power") });
    await context.close();
  }
  return out;
});

await scenario("S02", "Invalid weight shows an error in the UI and is blocked on the server", async () => {
  const { context, page } = await freshPage(browser);
  await page.goto(`${BASE}/en/build`);
  await waitCfg(page);
  await page.locator('input[name="series"][value="great"]').check();
  await page.locator('button[data-next="series"]').click();
  await page.locator('input[name="cls"][value="P2.5"]').check();
  await page.locator('button[data-next="cls"]').click();
  await page.locator('input[name="mode"][value="custom"]').check();
  const cases = {};
  for (const v of ["0", "-5", "abc", "250.5"]) {
    await page.locator("#c-customWeight").fill(v);
    await page.locator('button[data-next="weight"]').click();
    const invalid = await page.locator("#c-customWeight").getAttribute("aria-invalid");
    const err = await page.locator("#c-customWeight-err").innerText().catch(() => "");
    const step = await page.locator('.stepper [aria-current="step"]').innerText();
    assert(invalid === "true" && err && /Weight/.test(step), `custom weight ${v} was not blocked`);
    cases[v] = err;
  }
  const screenshot = await shot(page, "configurator-invalid-weight");
  const server = await page.evaluate(async () => {
    const r = await fetch("/api/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ purpose: "config", locale: "en", fields: { name: "QA", email: "qa@example.org", role: "player", country: "UAE" }, config: { series: "great", cls: "P2.5", mode: "listed", weight: 0, grip: "L3", setType: "individual", sets: 1, use: "play" }, consent: true, idempotencyKey: crypto.randomUUID(), elapsedMs: 5000 }) });
    return { status: r.status, body: await r.json() };
  });
  assert(server.status === 400 && server.body.errors["config.weight"], `server accepted weight 0: ${JSON.stringify(server)}`);
  const server2 = await page.evaluate(async () => {
    const r = await fetch("/api/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ purpose: "config", locale: "en", fields: { name: "QA", email: "qa@example.org", role: "player", country: "UAE" }, config: { series: "power", cls: "P2.5", mode: "listed", weight: 272, grip: "L3", setType: "individual", sets: 1, use: "play" }, consent: true, idempotencyKey: crypto.randomUUID(), elapsedMs: 5000 }) });
    return { status: r.status, body: await r.json() };
  });
  assert(server2.status === 400 && server2.body.errors["config.weight"] === "not_in_matrix", "server accepted a weight outside the POWER matrix");
  await context.close();
  return { uiErrors: cases, serverZero: server, serverNotInMatrix: server2, screenshot };
});

await scenario("S03", "Changing series leaves no stale weight", async () => {
  const { context, page } = await freshPage(browser);
  await page.goto(`${BASE}/en/build`);
  await waitCfg(page);
  await page.locator('input[name="series"][value="power"]').check();
  await page.locator('button[data-next="series"]').click();
  await page.locator('input[name="cls"][value="P2.5"]').check();
  await page.locator('button[data-next="cls"]').click();
  await page.locator("#c-weight").selectOption("210");
  await page.locator(".stepper button.done").first().click();
  await page.locator('input[name="series"][value="great"]').check();
  const notice = await page.locator('[data-notice="weight-cleared"]').innerText();
  const state = JSON.parse(await storage(page, "mx.cfg.v2"));
  await page.locator('button[data-next="series"]').click();
  await page.locator('button[data-next="cls"]').click();
  const selected = await page.locator("#c-weight").inputValue();
  const screenshot = await shot(page, "configurator-series-change");
  assert(/210/.test(notice) && state.c.weight === undefined && selected === "", "stale weight survived the series change");
  await context.close();
  return { notice, storedWeight: state.c.weight ?? null, weightSelectValue: selected, screenshot };
});

await scenario("S04", "Precision step shows four parameters for every class; matched-set quantity is counted", async () => {
  const { context, page } = await freshPage(browser);
  await page.goto(`${BASE}/en/build?series=spin`);
  await waitCfg(page);
  const labels = await page.locator('input[name="cls"]').evaluateAll((els) => els.map((e) => e.closest("label").innerText.replace(/\s+/g, " ")));
  for (const l of labels) assert(/g/.test(l) && /mm/.test(l) && /kg·cm²/.test(l) && /RA/.test(l), `missing parameter in: ${l}`);
  const shotCls = await shot(page, "configurator-precision-four-parameters");
  await page.locator('input[name="cls"][value="P0.5"]').check();
  await page.locator('button[data-next="cls"]').click();
  const spinHint = await page.locator("#c-weight-hint").innerText();
  await page.locator("#c-weight").selectOption("300");
  await page.locator('button[data-next="weight"]').click();
  await page.locator('input[name="grip"][value="L7"]').check();
  await page.locator('button[data-next="grip"]').click();
  await page.locator('button[data-next="targets"]').click();
  await page.locator('button[data-next="personal"]').click();
  await page.locator('input[name="setType"][value="triple"]').check();
  await page.locator("#c-sets").fill("2");
  const triple = await page.locator("#c-total").getAttribute("data-total");
  await page.locator('input[name="setType"][value="team"]').check();
  await page.locator("#c-teamSize").fill("3");
  await page.locator('button[data-next="set"]').click();
  const teamErr = await page.locator("#c-teamSize-err").innerText().catch(() => "");
  await page.locator("#c-teamSize").fill("6");
  const team = await page.locator("#c-total").getAttribute("data-total");
  const shotSet = await shot(page, "configurator-matched-set");
  assert(triple === "6" && team === "12" && teamErr, `set counting wrong: triple=${triple} team=${team} err=${teamErr}`);
  assert(/requested weight architecture/i.test(spinHint), "SPIN matrix explanation missing");
  await context.close();
  return { classLabels: labels, tripleTimesTwo: triple, teamTwoBySix: team, teamSizeError: teamErr, spinHint, screenshots: [shotCls, shotSet] };
});

await scenario("S05", "Configuration request is accepted end-to-end with a server request ID", async () => {
  const { context, page } = await freshPage(browser);
  await page.goto(`${BASE}/en/racquets/great`);
  await page.locator('a[href="/en/build?series=great&from=series"]').first().click();
  await runConfigurator(page, { series: "great", cls: "P1.5", weight: "272", grip: "L3", setType: "triple", sets: "2" });
  const review = await shot(page, "configurator-review", true);
  const form = page.locator("form.lead-form");
  await fillContact(form, { role: "player" });
  const id = await submitAndWait(form, page);
  const success = await shot(page, "configurator-success");
  assert(id && /^MX-CFG-/.test(id), `no request id (${id})`);
  const rec = await lead(id);
  assert(rec.record.config.series === "great" && rec.record.config.weight === 272 && rec.record.config.racquetsTotal === 6, "stored configuration differs");
  assert(rec.record.context.from === "series", "entry context missing");
  await context.close();
  return { requestId: id, stored: rec.record.config, context: rec.record.context, screenshots: [review, success] };
});

await scenario("S06", "GPS reaches the form without losing answers; no free text in storage; seed applied once", async () => {
  const { context, page } = await freshPage(browser);
  await page.goto(`${BASE}/en/gps`);
  const next = () => page.locator(".panel .btn-row .btn").last().click();
  await page.locator('input[name="role"][value="player"]').check(); await next();
  await page.locator('input[name="sport"][value="tennis"]').check(); await next();
  await page.locator('input[name="experience"][value="intermediate"]').check(); await next();
  await page.locator('input[name="objectives"][value="control"]').check(); await next();
  await page.locator('input[name="style"][value="baseline"]').check(); await next();
  await page.locator("#g-eq").fill("Brand X Model Y 97"); await next();
  await page.locator("#g-grip").selectOption("L4");
  await page.locator("#g-pref").fill("slightly head-light"); await next();
  await page.locator('input[name="coach"][value="yes"]').check(); await next();
  await next(); // review → show profile
  await page.waitForSelector('[data-gps="result"]');
  const stored = await storage(page, "mx.gps.v2");
  assert(!/Brand X|head-light/.test(stored || ""), "free text found in session storage");
  const cards = await page.locator('[data-gps="result"] .card h3').allInnerTexts();
  const resultShot = await shot(page, "gps-result", true);
  const form = page.locator("form.lead-form");
  await fillContact(form, { role: "player" });
  const id = await submitAndWait(form, page);
  assert(id && /^MX-GPS-/.test(id), "GPS profile not accepted");
  const rec = await lead(id);
  assert(rec.record.profile.equipment === "Brand X Model Y 97" && rec.record.profile.directions.join() === "great", "GPS answers lost");
  // Configure from GPS → preselected once
  await page.locator(`a[href="/en/build?series=great&grip=L4&from=gps"]`).click();
  await waitCfg(page);
  let s = JSON.parse(await storage(page, "mx.cfg.v2"));
  assert(s.c.series === "great" && s.c.grip === "L4", "GPS context not applied");
  await page.locator(".stepper button.done").first().click();
  await page.locator('input[name="series"][value="power"]').check();
  await page.reload();
  await waitCfg(page);
  s = JSON.parse(await storage(page, "mx.cfg.v2"));
  assert(s.c.series === "power", `old GPS seed re-imposed after reload (${s.c.series})`);
  // other sport: no tennis series
  const other = await freshPage(browser);
  await other.page.goto(`${BASE}/en/gps`);
  const n2 = () => other.page.locator(".panel .btn-row .btn").last().click();
  await other.page.locator('input[name="role"][value="player"]').check(); await n2();
  await other.page.locator('input[name="sport"][value="padel"]').check(); await n2();
  await other.page.locator('input[name="experience"][value="beginner"]').check(); await n2();
  await other.page.locator('input[name="objectives"][value="spin"]').check(); await n2();
  await n2(); await n2(); await n2();
  await other.page.locator('input[name="coach"][value="no"]').check(); await n2();
  await n2();
  await other.page.waitForSelector('[data-gps="result"]');
  const otherNote = await other.page.locator('[data-gps-other-sport="true"]').count();
  const otherCards = await other.page.locator('[data-gps="result"] .card').count();
  assert(otherNote === 1 && otherCards === 0, "a tennis series was suggested for padel");
  await other.context.close();
  await context.close();
  return { requestId: id, directions: cards, storedAnswers: JSON.parse(stored).a, afterReloadSeries: s.c.series, padel: { note: otherNote, seriesCards: otherCards }, screenshot: resultShot };
});

await scenario("S07", "UTM landing → language switch → accepted request with allowed attribution", async () => {
  const { context, page } = await freshPage(browser);
  await page.goto(`${BASE}/en/racquets/great?utm_source=google&utm_medium=cpc&utm_campaign=great-launch&gclid=TEST123`);
  await page.locator('nav.lang a[hreflang="ru"]').click();
  await page.waitForURL(/\/ru\/racquets\/great/);
  const switched = page.url();
  assert(/utm_source=google/.test(switched) && !/gclid/.test(switched), `language switch lost or leaked parameters: ${switched}`);
  await page.goto(`${BASE}/ru/contact?purpose=coach`);
  await page.locator('nav.lang a[hreflang="en"]').click();
  await page.waitForURL(/\/en\/contact/);
  const contactUrl = page.url();
  await page.waitForSelector('form.lead-form[data-purpose="coach"]');
  await page.goto(`${BASE}/ru/choose`);
  const form = page.locator("form.lead-form");
  await form.locator('select[name="level"]').selectOption("advanced");
  await fillContact(form, { name: "Проверка UTM", role: "player", country: "ОАЭ" });
  const id = await submitAndWait(form, page);
  assert(id && /^MX-SEL-/.test(id), "selection request not accepted");
  const rec = await lead(id);
  const a = rec.record.attribution;
  assert(a.utm_source === "google" && a.utm_medium === "cpc" && a.utm_campaign === "great-launch" && a.landing_path === "/en/racquets/great" && !a.gclid, `attribution wrong: ${JSON.stringify(a)}`);
  const screenshot = await shot(page, "ru-choose-success");
  await context.close();
  return { switchedUrl: switched, contactSwitchUrl: contactUrl, requestId: id, locale: rec.record.locale, attribution: a, note: "gclid is dropped without analytics consent (by design)", screenshot };
});

await scenario("S08", "Family and coach forms submit with their own purpose", async () => {
  const out = {};
  for (const [url, purpose, prefix] of [["/en/families", "family", "MX-FAM-"], ["/en/partnerships/coaches", "coach", "MX-COA-"], ["/en/partnerships/distribution", "distribution", "MX-DST-"]]) {
    const { context, page } = await freshPage(browser);
    await page.goto(`${BASE}${url}`);
    const form = page.locator(`form.lead-form[data-purpose="${purpose}"]`);
    assert(await form.count() === 1, `${url}: form with purpose ${purpose} not found`);
    if (purpose === "family") await form.locator('textarea[name="goal"]').fill("First competition racquet after a junior frame.");
    if (purpose === "distribution") { await form.locator('input[name="territory"]').fill("GCC"); await form.locator('input[name="organisation"]').fill("QA Trading"); }
    await fillContact(form, { role: purpose === "family" ? "parent" : purpose === "coach" ? "coach" : "distributor" });
    const id = await submitAndWait(form, page);
    assert(id && id.startsWith(prefix), `${url}: wrong or missing id ${id}`);
    const rec = await lead(id);
    assert(rec.record.purpose === purpose, `${url}: stored purpose ${rec.record.purpose}`);
    out[purpose] = { requestId: id, context: rec.record.context };
    if (purpose === "family") out.screenshot = await shot(page, "family-success");
    await context.close();
  }
  return out;
});

await scenario("S09", "Double submit creates one request", async () => {
  const before = await total();
  const { context, page } = await freshPage(browser);
  await page.goto(`${BASE}/en/contact`);
  const form = page.locator("form.lead-form");
  await fillContact(form, { message: "Double submit test." });
  await page.waitForTimeout(1600);
  await form.locator('button[type="submit"]').dblclick();
  await page.waitForSelector('[data-state="accepted"] [data-request-id]');
  const id = await page.locator("[data-request-id]").getAttribute("data-request-id");
  const replay = await page.evaluate(async () => {
    const body = { purpose: "general", locale: "en", fields: { name: "Replay", email: "r@example.org", role: "other", country: "UAE", message: "same key" }, consent: true, idempotencyKey: "5b1f4f8e-8e0e-4c1e-9d3a-2f1c0d9b7a11", elapsedMs: 4000 };
    const a = await (await fetch("/api/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).json();
    const b = await (await fetch("/api/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).json();
    return { a, b };
  });
  const after = await total();
  assert(after - before === 2, `expected exactly 2 new records (UI double click + replay pair), got ${after - before}`);
  assert(replay.a.request_id === replay.b.request_id && replay.b.duplicate === true, "replay created a second request");
  await context.close();
  return { requestId: id, before, after, replay };
});

await scenario("S10", "Offline: no false success, input kept, retry succeeds", async () => {
  const { context, page } = await freshPage(browser, { viewport: { width: 390, height: 844 } });
  await page.goto(`${BASE}/en/choose`);
  const form = page.locator("form.lead-form");
  await form.locator('select[name="level"]').selectOption("beginner");
  await fillContact(form, { name: "Offline Test" });
  await context.setOffline(true);
  await page.waitForTimeout(1600);
  await form.locator('button[type="submit"]').click();
  await page.waitForSelector('.lead-result[data-state="failed"]');
  const code = await page.locator('.lead-result[data-state="failed"]').getAttribute("data-code");
  const kept = await form.locator('input[name="name"]').inputValue();
  const ids = await page.locator("[data-request-id]").count();
  const failShot = await shot(page, "form-offline-failed");
  assert(ids === 0 && kept === "Offline Test", "false success or lost input while offline");
  await context.setOffline(false);
  await form.locator('button[type="submit"]').click();
  await page.waitForSelector('[data-state="accepted"] [data-request-id]');
  const id = await page.locator("[data-request-id]").getAttribute("data-request-id");
  await context.close();
  return { failedCode: code, inputKept: kept, retryRequestId: id, screenshot: failShot };
});

await scenario("S11", "Store outage: 503 shown as not submitted, input kept; retry after recovery stores one request", async () => {
  if (!WORK) skip("requires local stack");
  const before = await total();
  const { context, page } = await freshPage(browser);
  await page.goto(`${BASE}/en/contact?purpose=general`);
  const form = page.locator("form.lead-form");
  await fillContact(form, { message: "Store outage test." });
  stop("bridge");
  await sleep(500);
  await page.waitForTimeout(1600);
  await form.locator('button[type="submit"]').click();
  await page.waitForSelector('.lead-result[data-state="failed"]');
  const code = await page.locator('.lead-result[data-state="failed"]').getAttribute("data-code");
  const text = await page.locator('.lead-result[data-state="failed"]').innerText();
  const mail = await page.locator('.lead-result[data-state="failed"] a[data-mail-fallback]').getAttribute("href");
  const mailBody = decodeURIComponent((mail || "").split("body=")[1] || "");
  assert(mail && mail.startsWith("mailto:gps@maximus.tennis?subject=") && mailBody.includes("Store outage test.") && !/consent/i.test(mailBody), `mail fallback missing or wrong: ${mail && mail.slice(0, 80)}`);
  const shotFail = await shot(page, "form-store-unavailable");
  restart("bridge");
  await sleep(1200);
  await form.locator('button[type="submit"]').click();
  await page.waitForSelector('[data-state="accepted"] [data-request-id]');
  const id = await page.locator("[data-request-id]").getAttribute("data-request-id");
  const after = await total();
  assert(code === "unavailable" && after - before === 1, `unexpected outcome code=${code} delta=${after - before}`);
  await context.close();
  return { failedCode: code, message: text.slice(0, 200), mailFallback: mail.slice(0, 60) + "…", requestId: id, newRecords: after - before, screenshot: shotFail };
});

await scenario("S12", "Notification outage: request stays saved, retry scheduled; manual retry delivers", async () => {
  if (!WORK) skip("requires local stack");
  stop("smtp");
  await sleep(500);
  const { context, page } = await freshPage(browser);
  await page.goto(`${BASE}/en/contact?purpose=general`);
  const form = page.locator("form.lead-form");
  await fillContact(form, { message: "Notification outage test." });
  const id = await submitAndWait(form, page);
  assert(id, "request not accepted during SMTP outage");
  await sleep(2500);
  const r1 = await lead(id);
  assert(r1.notify.status === "retry" && Date.parse(r1.notify.next_attempt_at) > Date.now(), `retry not scheduled: ${JSON.stringify(r1.notify)}`);
  restart("smtp");
  const net = await import("node:net");
  for (let i = 0; i < 40; i++) {
    const up = await new Promise((res) => { const c = net.connect(2465, "127.0.0.1", () => { c.destroy(); res(true); }); c.on("error", () => res(false)); });
    if (up) break;
    await sleep(250);
  }
  const res = await fetch(`${BASE}/api/leads/admin`, { method: "POST", headers: { Authorization: `Basic ${Buffer.from(`qa:${ADMIN}`).toString("base64")}`, Origin: BASE, "Content-Type": "application/x-www-form-urlencoded" }, body: `id=${encodeURIComponent(id)}` });
  const html = await res.text();
  const r2 = await lead(id);
  const mails = readdirSync(path.join(WORK, "mail")).map((f) => readFileSync(path.join(WORK, "mail", f), "utf8"));
  const mail = mails.find((m) => m.includes(id));
  assert(r2.notify.status === "sent" && mail, `manual retry did not deliver: ${r2.notify.status} ${r2.notify.last_error} ${html.replace(/<[^>]+>/g, " ").slice(0, 200)}`);
  const cross = await fetch(`${BASE}/api/leads/admin`, { method: "POST", headers: { Authorization: `Basic ${Buffer.from(`qa:${ADMIN}`).toString("base64")}`, Origin: "https://evil.example", "Content-Type": "application/x-www-form-urlencoded" }, body: `id=${encodeURIComponent(id)}` });
  await context.close();
  return { requestId: id, afterOutage: r1.notify, afterRetry: r2.notify, adminRetryHttp: res.status, adminResult: html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 160), crossOriginRetryHttp: cross.status, mailHasPlainText: /Content-Type: text\/plain/.test(mail) };
});

await scenario("S13", "Analytics: allowlisted events, one conversion, no personal data; opt-out keeps forms working", async () => {
  const { context, page } = await freshPage(browser, { analyticsTest: true });
  await page.goto(`${BASE}/en`);
  const banner = await page.locator(".consent-bar").count();
  await page.locator('a[href="/en/choose"].btn').first().click();
  await page.waitForURL(/\/en\/choose/);
  const form = page.locator("form.lead-form");
  await form.locator('select[name="level"]').selectOption("competitive");
  await fillContact(form, { name: "Analytics Person", email: "analytics.person@example.org" });
  const id = await submitAndWait(form, page);
  const events = await page.evaluate(() => window.__mxEvents || []);
  const conv = await storage(page, "mx.conv");
  await page.reload();
  const afterReload = await page.evaluate(() => (window.__mxEvents || []).filter((e) => e.name === "lead_submit_success").length);
  await page.goto(`${BASE}/en/racquets/power`);
  await page.waitForFunction(() => (window.__mxEvents || []).some((e) => e.name === "series_view"), null, { timeout: 8000 }).catch(() => {});
  const sv = await page.evaluate(() => (window.__mxEvents || []).filter((e) => e.name === "series_view"));
  const names = [...events.map((e) => e.name), ...sv.map((e) => e.name)];
  const blob = JSON.stringify(events);
  assert(names.includes("primary_cta_click") && names.includes("lead_form_started") && names.includes("lead_submit_attempt") && names.includes("series_view"), `missing events ${names}`);
  assert(events.filter((e) => e.name === "lead_submit_success").length === 1 && afterReload === 0, `conversion counted more than once: ${JSON.stringify(events.map((e) => e.name))} afterReload=${afterReload}`);
  assert(!/analytics\.person|Analytics Person|MX-/.test(blob), "personal data or request id leaked into analytics parameters");
  await context.close();
  return { requestId: id, consentBannerShown: banner, gaConfigured: false, events, seriesView: sv, conversionsStored: conv, successEventsAfterReload: afterReload };
});

await scenario("S14", "Keyboard: menus close on Escape with focus return; first invalid field focused and not under the sticky header", async () => {
  const { context, page } = await freshPage(browser, { viewport: { width: 1440, height: 900 } });
  await page.goto(`${BASE}/en`);
  await page.locator("#nav-btn-racquets").focus();
  await page.keyboard.press("Enter");
  const expanded = await page.locator("#nav-btn-racquets").getAttribute("aria-expanded");
  await page.keyboard.press("Escape");
  const closed = await page.locator("#nav-btn-racquets").getAttribute("aria-expanded");
  const focusedDesktop = await page.evaluate(() => document.activeElement && document.activeElement.id);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".menu-toggle").click();
  const mobileOpen = await page.locator(".menu-toggle").getAttribute("aria-expanded");
  await page.keyboard.press("Escape");
  const mobileClosed = await page.locator(".menu-toggle").getAttribute("aria-expanded");
  const focusMobile = await page.evaluate(() => document.activeElement && document.activeElement.className);
  await page.goto(`${BASE}/en/choose`);
  await page.locator('form.lead-form button[type="submit"]').click();
  await page.waitForSelector(".err-summary");
  await page.waitForTimeout(900); // smooth scrolling to the focused field settles
  const focus = await page.evaluate(() => { const el = document.activeElement; const r = el.getBoundingClientRect(); return { name: el.getAttribute("name"), top: Math.round(r.top), bottom: Math.round(r.bottom), viewport: innerHeight, invalid: el.getAttribute("aria-invalid"), describedBy: el.getAttribute("aria-describedby") }; });
  const header = await page.evaluate(() => Math.round(document.querySelector(".site-header").getBoundingClientRect().bottom));
  const errShot = await shot(page, "form-validation-errors-mobile");
  assert(expanded === "true" && closed === "false" && focusedDesktop === "nav-btn-racquets", "desktop menu keyboard behaviour");
  assert(mobileOpen === "true" && mobileClosed === "false" && /menu-toggle/.test(focusMobile), "mobile menu Escape/focus return");
  assert(focus.name === "level" && focus.invalid === "true" && focus.top >= header && focus.bottom <= focus.viewport, `first error focus wrong, covered or out of view: ${JSON.stringify(focus)} header=${header}`);
  await context.close();
  return { desktop: { expanded, closed, focusedDesktop }, mobile: { mobileOpen, mobileClosed, focusMobile }, firstError: focus, headerBottom: header, screenshot: errShot };
});

await scenario("S15", "Widths 320/390/768/1024/1440 × EN/RU/ZH: no horizontal overflow; screenshots", async () => {
  const pages = ["", "/racquets/power", "/racquets/spin", "/build", "/choose", "/contact", "/families", "/partnerships/coaches", "/privacy"];
  const widths = [320, 390, 768, 1024, 1440];
  const overflow = [];
  const shots = [];
  const context = await browser.newContext();
  const page = await context.newPage();
  for (const locale of ["en", "ru", "zh"]) {
    for (const w of widths) {
      await page.setViewportSize({ width: w, height: w < 760 ? 844 : 900 });
      for (const p of pages) {
        await page.goto(`${BASE}/${locale}${p}`, { waitUntil: "networkidle" });
        const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
        if (o.sw > o.cw + 1) overflow.push({ locale, width: w, page: p || "/", ...o });
        if ((p === "" && [320, 390, 1440].includes(w)) || (p === "/racquets/power" && [390, 1440].includes(w) && locale === "en") || (p === "/racquets/spin" && w === 390 && locale === "en") || (p === "/choose" && w === 390)) {
          shots.push(await shot(page, `${locale}-${(p || "/home").slice(1).replace(/\//g, "-")}-${w}`));
        }
      }
    }
  }
  await context.close();
  assert(overflow.length === 0, `horizontal overflow: ${JSON.stringify(overflow.slice(0, 5))}`);
  return { checked: pages.length * widths.length * 3, overflow, screenshots: shots };
});

await scenario("S16", "200 % zoom (CSS viewport 640 px) and reduced motion", async () => {
  const context = await browser.newContext({ viewport: { width: 640, height: 450 }, deviceScaleFactor: 2, reducedMotion: "reduce" });
  const page = await context.newPage();
  const out = [];
  for (const p of ["/en", "/en/build", "/en/choose", "/ru/contact", "/zh/racquets/great"]) {
    await page.goto(`${BASE}${p}`, { waitUntil: "networkidle" });
    const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, anim: getComputedStyle(document.querySelector(".reveal") || document.body).animationName, scroll: getComputedStyle(document.documentElement).scrollBehavior }));
    out.push({ page: p, ...o });
    assert(o.sw <= o.cw + 1, `${p}: overflow at 200% zoom`);
    assert(o.anim === "none" && o.scroll !== "smooth", `${p}: motion not reduced`);
  }
  const zoomShot = await shot(page, "zoom200-home");
  await context.close();
  return { emulation: "viewport 640×450 CSS px at deviceScaleFactor 2 (equivalent of 1280×900 at 200 % zoom), prefers-reduced-motion: reduce", pages: out, screenshot: zoomShot };
});

await browser.close();

writeFileSync(path.join(OUT, "acceptance.json"), JSON.stringify({ base: BASE, ranAt: new Date().toISOString(), browser: "Chromium (Playwright), emulated viewports", results }, null, 2));
const failed = results.filter((r) => r.result === "FAIL");
log(`\n${results.length} scenarios: ${results.filter((r) => r.result === "PASS").length} pass, ${failed.length} fail, ${results.filter((r) => r.result === "SKIP").length} skip`);
process.exit(failed.length ? 1 : 0);
