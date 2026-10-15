/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/** Grip shape (Founder, 15 October 2026) — browser checks in all 48 languages at phone width.
 * Grip page section and cards, the configurator's grip step (size and shape, required choice,
 * replica field), home and series mentions, and a replica request through the shared validation.
 * Intake is intercepted: the authoritative validation runs on the captured payload; nothing is sent.
 * NODE_PATH=<existing playwright node_modules> node --import ./tests/register.mjs tests/e2e/grip-shape.mjs
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { validateRequest } from '../../lib/intake/schema.js';
import { locales, getDict } from '../../lib/i18n.js';
const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:3215';
const OUT = process.env.EVIDENCE || '../grip-shape-evidence';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
const results = [], pageErrors = [], networkRetries = [];
const SHOTS = new Set(['en', 'ru', 'zh', 'ar']);
const LOCALES = process.env.LOCALES ? process.env.LOCALES.split(',') : locales;
const SHAPES = ['classic', 'rectangular', 'even', 'replica', 'advise'];

async function surface(width = 360) {
  const context = await browser.newContext({ viewport: { width, height: 800 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  page.on('pageerror', (e) => pageErrors.push(`${page.url()}: ${e}`));
  await page.route('**/*', (route) => (new URL(route.request().url()).origin === new URL(BASE).origin ? route.continue() : route.abort()));
  return { page, context };
}
// A page whose script chunk did not arrive is loaded again; the retry is recorded, never hidden.
async function open(page, path) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const before = pageErrors.length;
    let res;
    try { res = await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' }); }
    catch (e) { if (/net::ERR_|Timeout/.test(String(e)) && attempt < 3) { networkRetries.push(`${path}: ${String(e).split('\n')[0]}`); continue; } throw e; }
    assert.equal(res.status(), 200, path);
    const fresh = pageErrors.slice(before);
    if (fresh.length && fresh.every((x) => /ChunkLoadError|Loading chunk/.test(x)) && attempt < 3) { pageErrors.splice(before); networkRetries.push(`${path}: script chunk did not load`); continue; }
    return;
  }
}
async function noOverflow(page, label) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${label}: horizontal scroll`);
}
/** Series → class → listed weight and length → the grip step. */
async function toGripStep(page) {
  await page.waitForSelector('.cfg[data-ready="true"]');
  await page.locator('input[name="series"][value="great"]').check();
  await page.locator('[data-next="series"]').click();
  await page.locator('input[name="cls"][value="P1.5"]').check();
  await page.locator('[data-next="cls"]').click();
  await page.locator('#c-weight').selectOption('272');
  await page.locator('#c-lengthIn').selectOption('27');
  await page.locator('[data-next="weight"]').click();
  await page.locator('input[name="grip"]').first().waitFor();
}

try {
  for (const locale of LOCALES) {
    const d = getDict(locale), GS = d.gripShape;
    const { page, context } = await surface();

    // Grip page: the shape section, four cards opening the configurator with that shape.
    await open(page, `/${locale}/grip-architecture`);
    const section = page.locator('#grip-shape');
    assert.equal((await section.locator('h2').first().textContent()).trim(), GS.title, `${locale}: section title`);
    const hrefs = await section.locator('.grip-shapes a').evaluateAll((xs) => xs.map((a) => a.getAttribute('href')));
    assert.deepEqual(hrefs, ['classic', 'rectangular', 'even', 'replica'].map((s) => `/${locale}/build?from=grip&shape=${s}`));
    assert.equal(await section.locator('.grip-shapes svg polygon').count(), 5); // three sections, a replica drawn twice
    const text = await section.textContent();
    for (const s of ['classic', 'rectangular', 'even', 'replica']) assert.ok(text.includes(GS.shapes[s][0]) && text.includes(GS.shapes[s][1]), `${locale}: card ${s}`);
    assert.ok(text.includes(GS.countNote) && text.includes(GS.caption), `${locale}: count note and caption`);
    await noOverflow(page, `${locale}/grip-architecture`);
    if (SHOTS.has(locale)) await section.screenshot({ path: `${OUT}/${locale}-grip-shape-section-360.png` });

    // Configurator: size and shape on one step; the shape is required; a replica asks for the racquet.
    await open(page, `/${locale}/build`);
    await toGripStep(page);
    assert.equal((await page.locator('#cfg-step-title').textContent()).trim(), GS.step, `${locale}: step title`);
    assert.deepEqual(await page.locator('input[name="gripShape"]').evaluateAll((xs) => xs.map((x) => x.value)), SHAPES);
    await page.locator('input[name="grip"][value="L3"]').check();
    await page.locator('[data-next="grip"]').click();
    assert.equal(await page.locator('#c-gripShape-err').count(), 1, `${locale}: shape required`);
    assert.equal(await page.locator('input[name="gripShape"][aria-invalid="true"]').count(), 5);
    await page.locator('input[name="gripShape"][value="replica"]').check();
    assert.equal(await page.locator('#c-gripReference').count(), 1);
    await page.locator('[data-next="grip"]').click();
    assert.equal(await page.locator('#c-gripReference-err').count(), 1, `${locale}: replica needs the racquet`);
    await noOverflow(page, `${locale}/build grip step`);
    if (SHOTS.has(locale)) await page.locator('.cfg').screenshot({ path: `${OUT}/${locale}-configurator-grip-step-360.png` });

    // Home and series pages mention the shape; the series FAQ asks about it.
    await open(page, `/${locale}`);
    assert.ok((await page.locator('#grip').textContent()).includes(GS.short), `${locale}: home`);
    await open(page, `/${locale}/racquets/great`);
    const main = await page.locator('main').textContent();
    assert.ok(main.includes(GS.short), `${locale}: series options`);
    assert.ok(main.includes(GS.faq[0]), `${locale}: series FAQ`);
    await noOverflow(page, `${locale}/racquets/great`);

    results.push({ locale, gripPage: 'PASS', configurator: 'PASS', home: 'PASS', series: 'PASS', overflow360: false });
    await context.close();
  }

  // A replica request end to end (RU): from the grip page card to the review and the validated payload.
  {
    const { page, context } = await surface(390);
    const d = getDict('ru'), GS = d.gripShape;
    const seen = [];
    await page.route('**/api/leads', async (route) => {
      const body = route.request().postDataJSON();
      seen.push(body);
      const v = validateRequest(body);
      assert.equal(v.ok, true, JSON.stringify(v.errors));
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ status: 'accepted', request_id: 'MX-CFG-20261015-TEST01', duplicate: false }) });
    });
    await open(page, '/ru/grip-architecture');
    await page.locator('#grip-shape a[data-shape="replica"]').click();
    await page.waitForURL(/\/ru\/build/);
    await page.waitForSelector('.cfg[data-ready="true"]');
    assert.equal(new URL(page.url()).search, '', 'URL context removed after it is applied');
    await toGripStep(page);
    assert.equal(await page.locator('input[name="gripShape"][value="replica"]').isChecked(), true, 'shape from the card preselected');
    await page.locator('input[name="grip"][value="L4"]').check();
    await page.locator('#c-gripReference').fill('Brand X Model 98');
    await page.locator('[data-next="grip"]').click();
    await page.locator('[data-next="targets"]').click();
    await page.locator('[data-next="personal"]').click();
    await page.locator('[data-next="set"]').click();
    await page.locator('input[name="use"][value="play"]').check();
    await page.locator('[data-next="use"]').click();
    const review = await page.locator('.cfg-summary').textContent();
    assert.ok(review.includes(`${GS.shapes.replica[0]} — Brand X Model 98`), 'review shows the shape and the racquet');
    const storage = await page.evaluate(() => JSON.stringify([Object.values(sessionStorage), Object.values(localStorage)]));
    assert.equal(/Brand X/.test(storage), false, 'the named racquet is never stored in the browser');
    const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem('mx.cfg.v2')));
    assert.equal(saved.c.gripShape, 'replica', 'the shape itself is kept as a structural choice');
    assert.equal('gripReference' in saved.c, false);
    await page.screenshot({ path: `${OUT}/ru-configurator-review-replica-390.png`, fullPage: true });
    const form = page.locator('form.lead-form');
    await form.locator('input[name="name"]').fill('Grip Shape Test');
    await form.locator('input[name="email"]').fill('grip@example.invalid');
    await form.locator('select[name="role"]').selectOption('player');
    await form.locator('input[name="country"]').fill('UAE');
    await form.locator('input[type="checkbox"][required]').check();
    await page.waitForTimeout(1600);
    await form.locator('button[type="submit"]').click();
    await page.waitForSelector('[data-state="accepted"]');
    assert.equal(seen.length, 1);
    const v = validateRequest(seen[0]).value;
    assert.equal(v.config.grip, 'L4');
    assert.equal(v.config.gripShape, 'replica');
    assert.equal(v.config.gripReference, 'Brand X Model 98');
    assert.equal(v.config.configurationKey, 'great-272-L27-L4');
    results.push({ locale: 'ru', replicaSubmission: 'accepted with number; validated', storage: 'shape kept, racquet name not stored' });
    await context.close();
  }
  // Phone widths for the grip page (EN and RU).
  for (const locale of ['en', 'ru']) for (const width of [390, 430]) {
    const { page, context } = await surface(width);
    await open(page, `/${locale}/grip-architecture`);
    await noOverflow(page, `${locale}/grip-architecture@${width}`);
    await page.screenshot({ path: `${OUT}/${locale}-grip-architecture-${width}.png`, fullPage: true });
    await context.close();
  }
  assert.deepEqual(pageErrors, []);
  writeFileSync(`${OUT}/browser.json`, JSON.stringify({ status: 'PASS', scenarios: results.length, results, pageErrors, networkRetries, submissionTransport: 'intercepted; shared authoritative validation executed, no message sent' }, null, 2));
  console.log(`PASS ${results.length} browser scenarios; ${LOCALES.length} locales × grip page, configurator grip step, home, series at 360 px; replica request validated; network retries: ${networkRetries.length}`);
} catch (e) {
  writeFileSync(`${OUT}/browser.json`, JSON.stringify({ status: 'FAIL', completed: results, pageErrors, networkRetries, error: String(e), stack: e.stack }, null, 2));
  throw e;
} finally { await browser.close(); }
