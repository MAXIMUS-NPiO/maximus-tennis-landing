/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/** Production-mode browser checks. Intake is intercepted; no external notifications are sent.
 * NODE_PATH=<existing playwright node_modules> node --import ./tests/register.mjs tests/e2e/catalogue.mjs
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { validateRequest } from '../../lib/intake/schema.js';
import { locales, getDict } from '../../lib/i18n.js';
const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:3214';
const OUT = process.env.EVIDENCE || '../catalog-evidence';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
const results = [], pageErrors = [];
const expectedLengths = ['26.3', '26.6', '26.8', '27', '27.3', '27.6', '27.9'];
async function fresh(locale, series = 'great', mobile = false) {
  const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1365, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', e => pageErrors.push(String(e)));
  await page.route('**/*', route => new URL(route.request().url()).origin === new URL(BASE).origin ? route.continue() : route.abort());
  await page.goto(`${BASE}/${locale}/build?series=${series}`);
  await page.waitForSelector('.cfg[data-ready="true"]');
  await page.locator('[data-next="cls"]').click();
  // Performance requests need an explicit precision class before leaving that step.
  if (series !== 'sst' && series !== 'spot') {
    await page.locator('[name="cls"][value="P1.5"]').check();
    await page.locator('[data-next="cls"]').click();
  }
  return { page, context };
}
async function remaining(page) {
  await page.locator('[data-next="weight"]').click();
  await page.locator('[name="grip"][value="L3"]').check();
  await page.locator('[data-next="grip"]').click();
  await page.locator('[data-next="targets"]').click();
  await page.locator('[data-next="personal"]').click();
  await page.locator('[data-next="set"]').click();
  await page.locator('[name="use"][value="play"]').check();
  await page.locator('[data-next="use"]').click();
}
async function mockSubmit(page, locale) {
  let captured;
  await page.route('**/api/leads', async route => {
    captured = route.request().postDataJSON();
    const valid = validateRequest(captured);
    assert.equal(valid.ok, true, JSON.stringify(valid.errors));
    assert.equal(valid.value.locale, locale);
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ status: 'accepted', request_id: 'MX-CFG-20261012-TEST01', duplicate: false }) });
  });
  const form = page.locator('form').filter({ has: page.locator('input[name="email"]') }).first();
  await form.locator('input[name="name"]').fill('Catalogue Test');
  await form.locator('input[name="email"]').fill('catalogue@example.invalid');
  await form.locator('select[name="role"]').selectOption('player');
  await form.locator('input[name="country"]').fill('UAE');
  await form.locator('input[type="checkbox"][required]').check();
  await form.locator('button[type="submit"]').click();
  await page.waitForSelector('[data-state="accepted"]');
  assert.ok(captured);
  return captured;
}
try {
  for (const locale of locales) {
    const { page, context } = await fresh(locale, 'great', locale === 'ar');
    assert.deepEqual(await page.locator('#c-lengthIn option').evaluateAll(xs => xs.map(x => x.value).filter(Boolean)), expectedLengths);
    assert.match(await page.locator('.cfg').innerText(), new RegExp(getDict(locale).catalogue.note.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    await page.locator('#c-weight').selectOption('272');
    await page.locator('[data-next="weight"]').click();
    assert.equal(await page.locator('#c-lengthIn').getAttribute('aria-invalid'), 'true');
    await page.locator('#c-lengthIn').selectOption('27.9');
    await remaining(page);
    assert.match(await page.locator('.cfg-summary').innerText(), /27\.9/);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    assert.equal(overflow, false, `${locale} overflow`);
    if (['en', 'ru', 'ar'].includes(locale)) await page.screenshot({ path: `${OUT}/${locale}-request-summary.png`, fullPage: true });
    if (locale === 'ar') {
      const captured = await mockSubmit(page, locale);
      assert.equal(captured.config.lengthIn, 27.9);
      assert.equal(captured.config.lengthMode, 'standard');
    }
    results.push({ locale, standardLengthOptions: 7, requestSummary: 'PASS', overflow: false });
    await context.close();
  }
  for (const series of ['sst', 'spot']) {
    const { page, context } = await fresh('ru', series);
    const weights = await page.locator('#c-weight option').evaluateAll(xs => xs.map(x => x.value).filter(Boolean));
    assert.equal(weights.length, 61);
    assert.equal(weights[0], '200'); assert.equal(weights.at(-1), '500');
    assert.equal(await page.locator('#c-lengthIn').count(), 0);
    assert.equal(await page.locator('[name="cls"]').count(), 0);
    await page.locator('#c-weight').selectOption('500');
    await remaining(page);
    const captured = await mockSubmit(page, 'ru');
    assert.equal(captured.config.weight, 500);
    assert.equal(captured.config.cls, undefined);
    assert.equal(captured.config.lengthMode, undefined);
    results.push({ series, trainerWeights: 61, submittedWeight: 500, result: 'PASS' });
    await context.close();
  }
  {
    const { page, context } = await fresh('ru', 'power');
    await page.locator('#c-weight').selectOption('300');
    await page.locator('[name="lengthMode"][value="custom"]').check();
    await page.locator('#c-customLengthIn').fill('28,125');
    await page.reload();
    await page.waitForSelector('.cfg[data-ready="true"]');
    assert.equal(await page.locator('#c-customLengthIn').inputValue(), '28,125');
    await remaining(page);
    await page.screenshot({ path: `${OUT}/ru-custom-length.png`, fullPage: true });
    const captured = await mockSubmit(page, 'ru');
    assert.equal(validateRequest(captured).value.config.customLengthIn, 28.125);
    assert.equal(captured.config.lengthIn, undefined);
    results.push({ customLength: '28,125', restored: true, serialization: 'PASS' });
    await context.close();
  }
  for (const [route, name, marker] of [['training/sweet-spot-trainer', 'sst', '.matrix [role="listitem"]'], ['training/spot-trainer', 'spot', '.spot-weights span'], ['racquets/great', 'great', '[data-standard-lengths] .status']]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.goto(`${BASE}/en/${route}`);
    assert.equal(await page.locator(marker).count(), name === 'great' ? 7 : 61);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await page.screenshot({ path: `${OUT}/${name}-mobile.png`, fullPage: true });
    results.push({ route, mobile: 'PASS' });
    await context.close();
  }
  assert.deepEqual(pageErrors, []);
  writeFileSync(`${OUT}/browser.json`, JSON.stringify({ status: 'PASS', scenarios: results.length, results, pageErrors, submissionTransport: 'intercepted; shared authoritative validation executed, no message sent' }, null, 2));
  console.log(`PASS ${results.length} browser scenarios; 48 locales; no page errors; submission intercepted`);
} catch (e) {
  writeFileSync(`${OUT}/browser.json`, JSON.stringify({ status: 'FAIL', completed: results, pageErrors, error: String(e), stack: e.stack }, null, 2));
  throw e;
} finally { await browser.close(); }
