/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/** Production-mode browser checks. Intake is intercepted; no external notifications are sent.
 * NODE_PATH=<existing playwright node_modules> node --import ./tests/register.mjs tests/e2e/catalogue.mjs
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { validateRequest } from '../../lib/intake/schema.js';
import { configurationKey } from '../../data/products.js';
import { budgetRequestCopy } from '../../content/budget-request-copy.js';
import { locales, getDict } from '../../lib/i18n.js';
const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:3215';
const OUT = process.env.EVIDENCE || '../catalog-evidence';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
const results = [], pageErrors = [];
const expectedLengths = ['26.3', '26.6', '26.8', '27', '27.3', '27.6', '27.9'];
const expectedWeights = Array.from({ length: 61 }, (_, i) => String(200 + 5 * i));
const isTrainer = series => series === 'sst' || series === 'spot';
async function surface(mobile = false) {
  const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1365, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', e => pageErrors.push(String(e)));
  await page.route('**/*', route => new URL(route.request().url()).origin === new URL(BASE).origin ? route.continue() : route.abort());
  return { page, context };
}
async function fresh(locale, series = 'great', mobile = false) {
  const result = await surface(mobile);
  const { page } = result;
  await page.goto(`${BASE}/${locale}/build?series=${series}`);
  await page.waitForSelector('.cfg[data-ready="true"]');
  await page.locator('[data-next="cls"]').click();
  // Performance requests need an explicit precision class before leaving that step.
  if (!isTrainer(series)) {
    await page.locator('[name="cls"][value="P1.5"]').check();
    await page.locator('[data-next="cls"]').click();
  }
  return result;
}
async function remaining(page, grip = 'L3') {
  await page.locator('[data-next="weight"]').click();
  await page.locator(`[name="grip"][value="${grip}"]`).check();
  await page.locator('[data-next="grip"]').click();
  await page.locator('[data-next="targets"]').click();
  await page.locator('[data-next="personal"]').click();
  await page.locator('[data-next="set"]').click();
  await page.locator('[name="use"][value="play"]').check();
  await page.locator('[data-next="use"]').click();
}
async function noOverflow(page, label) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${label} overflow`);
}
async function mockSubmit(page, locale) {
  let captured;
  await page.route('**/api/leads', async route => {
    captured = route.request().postDataJSON();
    const valid = validateRequest(captured);
    assert.equal(valid.ok, true, JSON.stringify(valid.errors));
    assert.equal(valid.value.locale, locale);
    if (valid.value.config.lengthMode === 'standard') {
      assert.equal(valid.value.config.configurationKey, configurationKey(valid.value.config));
      assert.ok(valid.value.config.configurationKey);
    }
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ status: 'accepted', request_id: 'MX-CFG-20261013-TEST01', duplicate: false }) });
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
  // Every language is exercised through both trainer families as well as a playing series.
  for (const locale of locales) for (const series of ['great', 'sst', 'spot']) {
    const { page, context } = await fresh(locale, series, locale === 'ar');
    assert.deepEqual(await page.locator('#c-lengthIn option').evaluateAll(xs => xs.map(x => x.value).filter(Boolean)), expectedLengths);
    assert.equal(await page.locator('#c-lengthIn').inputValue(), '');
    assert.ok((await page.locator('.cfg').innerText()).includes(getDict(locale).catalogue.note));
    if (isTrainer(series)) {
      assert.deepEqual(await page.locator('#c-weight option').evaluateAll(xs => xs.map(x => x.value).filter(Boolean)), expectedWeights);
      assert.equal(await page.locator('[name="cls"]').count(), 0);
      await page.locator('#c-weight').selectOption('200');
      assert.equal(await page.locator('#c-weight').inputValue(), '200');
      await page.locator('#c-weight').selectOption('500');
    } else await page.locator('#c-weight').selectOption('272');
    await page.locator('[data-next="weight"]').click();
    assert.equal(await page.locator('#c-lengthIn').getAttribute('aria-invalid'), 'true');
    assert.equal(await page.locator('#c-lengthIn').inputValue(), '');
    await page.locator('#c-lengthIn').selectOption('27.9');
    await remaining(page, series === 'spot' ? 'L7' : 'L3');
    assert.match(await page.locator('.cfg-summary').innerText(), /27\.9/);
    assert.ok((await page.locator('[data-budget-request]').textContent()).includes(budgetRequestCopy(locale).title));
    await noOverflow(page, `${locale}/${series}`);
    if (['en', 'ru', 'ar'].includes(locale)) await page.screenshot({ path: `${OUT}/${locale}-${series}-request-summary.png`, fullPage: true });
    if (locale === 'ar') {
      const captured = await mockSubmit(page, locale);
      assert.equal(captured.config.catalogueVersion, 3);
      assert.equal(captured.config.lengthIn, 27.9);
      assert.equal(captured.config.lengthMode, 'standard');
      assert.equal(captured.config.weight, isTrainer(series) ? 500 : 272);
      if (isTrainer(series)) assert.equal(captured.config.cls, undefined);
    }
    results.push({ locale, series, standardLengthOptions: 7, trainerWeights: isTrainer(series) ? 61 : undefined, requestSummary: 'PASS', overflow: false });
    await context.close();
  }
  {
    const { page, context } = await fresh('ru', 'spot');
    await page.locator('#c-weight').selectOption('500');
    await page.locator('#c-lengthIn').selectOption('27.9');
    await remaining(page, 'L7');
    await page.locator('[name="budgetRequest.amount"]').fill('00320,50');
    await page.locator('[name="budgetRequest.currency"]').selectOption('USD');
    await page.locator('[name="budgetRequest.deliveryWishes"]').fill('Collection after confirmation');
    await page.locator('[name="budgetRequest.personalizationWishes"]').fill('Initials after artwork review');
    await page.locator('[data-budget-request]').screenshot({ path: `${OUT}/ru-budget-request.png` });
    const captured = await mockSubmit(page, 'ru');
    const normalized = validateRequest(captured).value;
    assert.equal(normalized.budgetRequest.amount, '320.50');
    assert.equal(normalized.budgetRequest.configurationKey, 'spot-500-L27.9-L7');
    assert.equal(normalized.budgetRequest.status, 'quote_requested');
    assert.equal(normalized.budgetRequest.deliveryWishes, 'Collection after confirmation');
    const storage = await page.evaluate(() => JSON.stringify(Object.values(sessionStorage)));
    assert.equal(/00320|Collection after|Initials after/.test(storage), false);
    await page.getByRole('button', { name: getDict('ru').lead.another, exact: true }).click();
    for (const key of ['amount', 'currency', 'deliveryWishes', 'personalizationWishes']) assert.equal(await page.locator(`[name="budgetRequest.${key}"]`).inputValue(), '');
    results.push({ budgetRequest: 'serialized with exact configuration and separate wishes', storage: 'no personal wishes stored', financialAcceptance: false });
    await context.close();
  }
  // Submit both inclusive weight boundaries and the shortest/longest standard lengths.
  for (const series of ['sst', 'spot']) for (const [weight, length, grip] of [[200, '26.3', 'L0'], [500, '27.9', 'L7']]) {
    const { page, context } = await fresh('ru', series);
    await page.locator('#c-weight').selectOption(String(weight));
    await page.locator('#c-lengthIn').selectOption(length);
    await remaining(page, grip);
    const captured = await mockSubmit(page, 'ru');
    assert.equal(captured.config.weight, weight);
    assert.equal(captured.config.lengthIn, Number(length));
    assert.equal(captured.config.grip, grip);
    assert.equal(captured.config.cls, undefined);
    results.push({ series, submittedWeight: weight, submittedLength: length, submittedGrip: grip, result: 'PASS' });
    await context.close();
  }
  for (const series of ['power', 'sst', 'spot']) {
    const { page, context } = await fresh('ru', series);
    await page.locator('#c-weight').selectOption('300');
    await page.locator('[name="lengthMode"][value="custom"]').check();
    await page.locator('#c-customLengthIn').fill('28,125');
    await page.reload();
    await page.waitForSelector('.cfg[data-ready="true"]');
    assert.equal(await page.locator('#c-customLengthIn').inputValue(), '28,125');
    const stored = await page.evaluate(() => JSON.parse(sessionStorage.getItem('mx.cfg.v2')));
    assert.equal(stored.v, 2);
    assert.equal(stored.c.catalogueVersion, 3);
    assert.equal(stored.c.customLengthIn, '28,125');
    await remaining(page);
    await page.screenshot({ path: `${OUT}/ru-${series}-custom-length.png`, fullPage: true });
    const captured = await mockSubmit(page, 'ru');
    assert.equal(validateRequest(captured).value.config.customLengthIn, 28.125);
    assert.equal(captured.config.lengthIn, undefined);
    assert.equal(validateRequest(captured).value.config.configurationKey, undefined);
    results.push({ series, customLength: '28,125', restored: true, serialization: 'PASS' });
    await context.close();
  }
  // The storage wrapper remains v2, but an old trainer draft may not silently skip length.
  for (const series of ['sst', 'spot']) {
    const { page, context } = await surface();
    await page.goto(`${BASE}/en`);
    await page.evaluate(({ series }) => sessionStorage.setItem('mx.cfg.v2', JSON.stringify({ v: 2, step: 7, c: { catalogueVersion: 2, series, mode: 'listed', weight: 270, grip: 'L3', ptype: 'none', setType: 'individual', sets: '1', use: 'play' } })), { series });
    await page.goto(`${BASE}/en/build`);
    await page.waitForSelector('.cfg[data-ready="true"]');
    assert.equal(await page.locator('#c-weight').inputValue(), '270');
    assert.equal(await page.locator('#c-lengthIn').inputValue(), '');
    await page.locator('[data-next="weight"]').click();
    assert.equal(await page.locator('#c-lengthIn').getAttribute('aria-invalid'), 'true');
    results.push({ series, legacyDraft: 'restored to length selection; no default', result: 'PASS' });
    await context.close();
  }
  for (const [route, name, marker] of [['training/sweet-spot-trainer', 'sst', '.weights-only [role="listitem"]'], ['training/spot-trainer', 'spot', '.spot-weights span'], ['racquets/great', 'great', '[data-standard-lengths] .status']]) {
    const { page, context } = await surface(true);
    await page.goto(`${BASE}/en/${route}`);
    assert.equal(await page.locator(marker).count(), name === 'great' ? 7 : 61);
    assert.equal(await page.locator('[data-standard-lengths] .status').count(), 7);
    if (name === 'sst') assert.equal(await page.locator('[data-historical-sst-length="27"] [role="listitem"]').count(), 4);
    assert.equal(await page.locator('[data-request-variants]').getAttribute('data-request-variants'), name === 'great' ? '693' : '427');
    await noOverflow(page, route);
    await page.screenshot({ path: `${OUT}/${name}-mobile.png`, fullPage: true });
    results.push({ route, mobile: 'PASS', lengthOptions: 7 });
    await context.close();
  }
  for (const locale of ['en', 'ru', 'ar']) for (const route of ['racquets', 'partnerships']) {
    const { page, context } = await surface(true);
    await page.goto(`${BASE}/${locale}/${route}`);
    const section = page.locator('#national-package');
    const matrix = section.locator('[data-national-package]');
    assert.equal(await matrix.getAttribute('data-variants'), '1547');
    assert.equal(await matrix.getAttribute('data-grip-combinations'), '12376');
    assert.equal(await matrix.getAttribute('data-units-per-country'), '24752');
    assert.equal(await section.locator('[data-national-family]').count(), 5);
    const text = await section.innerText();
    assert.ok(text.includes(getDict(locale).nationalPackage.boundary));
    for (const key of ["referenceLifecycle", "personalExample", "customBatches", "proShop"]) assert.ok(text.includes(getDict(locale).nationalPackage[key]), `${locale}/${key}`);
    assert.ok(text.includes('L6') && text.includes('L7'));
    await noOverflow(page, `${locale}/${route}`);
    if (route === 'racquets') await section.screenshot({ path: `${OUT}/${locale}-national-package.png` });
    results.push({ locale, route, nationalPackage: 'PASS', combinations: 12376, unitsPerCountry: 24752, overflow: false });
    await context.close();
  }
  assert.deepEqual(pageErrors, []);
  writeFileSync(`${OUT}/browser.json`, JSON.stringify({ status: 'PASS', scenarios: results.length, results, pageErrors, submissionTransport: 'intercepted; shared authoritative validation executed, no message sent' }, null, 2));
  console.log(`PASS ${results.length} browser scenarios; 48 locales × 3 product families; no page errors; submission intercepted`);
} catch (e) {
  writeFileSync(`${OUT}/browser.json`, JSON.stringify({ status: 'FAIL', completed: results, pageErrors, error: String(e), stack: e.stack }, null, 2));
  throw e;
} finally { await browser.close(); }
