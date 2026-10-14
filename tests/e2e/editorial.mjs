/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/** Founder's update of 14 October 2026, part I — browser checks of the editorial release in all 48 languages.
 * Production build, phone width. Intake is intercepted: the shared authoritative validation runs on every
 * captured payload and no message is sent.
 * NODE_PATH=<existing playwright node_modules> node --import ./tests/register.mjs tests/e2e/editorial.mjs
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { validateRequest } from '../../lib/intake/schema.js';
import { locales, getDict } from '../../lib/i18n.js';
const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:3215';
const OUT = process.env.EVIDENCE || '../editorial-evidence';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
const results = [], pageErrors = [];
const SHOTS = new Set(['en', 'ru', 'zh', 'ar']);
const LOCALES = process.env.LOCALES ? process.env.LOCALES.split(',') : locales;

async function surface(width = 360) {
  const context = await browser.newContext({ viewport: { width, height: 800 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  page.on('pageerror', (e) => pageErrors.push(`${page.url()}: ${e}`));
  await page.route('**/*', (route) => (new URL(route.request().url()).origin === new URL(BASE).origin ? route.continue() : route.abort()));
  return { page, context };
}
async function open(page, path) {
  const res = await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  assert.equal(res.status(), 200, path);
}
async function noOverflow(page, label) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${label}: horizontal scroll`);
}
async function intercept(page, status = 201) {
  const seen = [];
  await page.route('**/api/leads', async (route) => {
    const body = route.request().postDataJSON();
    seen.push(body);
    const v = validateRequest(body);
    assert.equal(v.ok, true, JSON.stringify(v.errors));
    if (status === 201) await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ status: 'accepted', request_id: `MX-${body.purpose === 'meeting' ? 'MTG' : 'VAL'}-20261014-TEST01`, duplicate: false }) });
    else await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ status: 'unavailable', code: 'store_unavailable' }) });
  });
  return seen;
}
async function contact(form) {
  await form.locator('input[name="name"]').fill('Editorial Test');
  await form.locator('input[name="email"]').fill('editorial@example.invalid');
  await form.locator('select[name="role"]').selectOption('club');
  await form.locator('input[name="country"]').fill('UAE');
  await form.locator('input[type="checkbox"][required]').check();
}
async function fillMeeting(page) {
  const form = page.locator('form.lead-form');
  await form.locator('input[name="residenceCity"]').fill('Sharjah');
  await form.locator('input[name="preferredMeetingCity"]').fill('Dubai');
  await form.locator('select[name="willingToTravel"]').selectOption('yes');
  await form.locator('input[name="attendees"]').fill('3');
  await form.locator('input[name="meetingInterests"][value="club"]').check();
  await form.locator('input[name="meetingInterests"][value="national"]').check();
  await contact(form);
  await page.waitForTimeout(1600); // the intake refuses forms filled faster than a person can
  return form;
}

try {
  for (const locale of LOCALES) {
    const d = getDict(locale), E = d.editorial;
    const { page, context } = await surface();

    // Meetings: Dubai first, honest interest form, five real stages.
    await open(page, `/${locale}/meetings`);
    assert.equal((await page.locator('h1').innerText()).trim(), d.meetings.title);
    const form = page.locator('form.lead-form');
    for (const name of ['residenceCity', 'preferredMeetingCity', 'attendees', 'travelCities']) assert.equal(await form.locator(`[name="${name}"]`).count(), 1, `${locale} meetings ${name}`);
    assert.equal(await form.locator('input[name="meetingInterests"]').count(), 5);
    assert.equal(await form.locator('input[name="hosting"]').count(), 2);
    assert.equal(await page.locator('.stages li').count(), 5);
    assert.ok((await page.locator('main').textContent()).includes(E.meetings.noAccount));
    await noOverflow(page, `${locale}/meetings`);
    if (SHOTS.has(locale)) await page.screenshot({ path: `${OUT}/${locale}-meetings-360.png`, fullPage: true });

    // Pro Shop: concept status, diagram with its legend, seven steps, concept boundary.
    await open(page, `/${locale}/pro-shop`);
    assert.equal((await page.locator('h1').innerText()).trim(), E.proShop.title);
    assert.equal(await page.locator('.proshop-svg').count(), 1);
    assert.equal(await page.locator('.proshop-legend li').count(), 5);
    assert.equal(await page.locator('.steps.seq li').count(), 7);
    assert.ok((await page.locator('main').textContent()).includes(E.proShop.conceptText));
    assert.equal((await page.locator('.status.concept').first().textContent()).trim(), d.common.statuses.concept); // textContent: capitals by CSS drop Greek accents
    await noOverflow(page, `${locale}/pro-shop`);
    if (SHOTS.has(locale)) await page.screenshot({ path: `${OUT}/${locale}-pro-shop-360.png`, fullPage: true });

    // Training: the linked route and the kits, with the 6 + 5 + 5 = 16 example.
    await open(page, `/${locale}/training`);
    const route = await page.locator('#kits .route a').evaluateAll((xs) => xs.map((a) => a.getAttribute('href')));
    assert.deepEqual(route, [`/${locale}/racquets`, `/${locale}/build`, `/${locale}/training/spot-trainer`, `/${locale}/training/sweet-spot-trainer`, '#kit-types', `/${locale}/contact?purpose=selection`]);
    assert.equal(await page.locator('#kits .kit-types .card').count(), 5);
    assert.equal(await page.locator('#kits .kit-formula b').allInnerTexts().then((x) => x.join(' ')), '6 5 5 16');
    await noOverflow(page, `${locale}/training`);
    if (SHOTS.has(locale)) await page.locator('#kits').screenshot({ path: `${OUT}/${locale}-kits-360.png` });

    // Partnerships: the Founder's exchange clause; Pro Shop and meetings are reachable.
    await open(page, `/${locale}/partnerships`);
    assert.equal((await page.locator('#exchange p.lead').innerText()).trim(), E.exchange.text);
    assert.equal(await page.locator(`a[href="/${locale}/pro-shop"]`).count() >= 1, true);
    assert.equal(await page.locator(`a[href="/${locale}/meetings"]`).count() >= 1, true);
    await noOverflow(page, `${locale}/partnerships`);
    if (SHOTS.has(locale)) await page.locator('#exchange').screenshot({ path: `${OUT}/${locale}-exchange-360.png` });

    // Personal brands: "Your identity. Built on MAXIMUS." first.
    await open(page, `/${locale}/personal-brands`);
    assert.equal((await page.locator('#identity h2').first().innerText()).trim(), E.identity.title);
    assert.equal(await page.locator('#identity .tags li').count(), 5);
    await noOverflow(page, `${locale}/personal-brands`);
    if (SHOTS.has(locale)) await page.locator('#identity').screenshot({ path: `${OUT}/${locale}-identity-360.png` });

    // Racquets and a series page: philosophy and the valuation route.
    await open(page, `/${locale}/racquets`);
    assert.equal((await page.locator('#philosophy h2').first().innerText()).trim(), E.platform.title);
    assert.equal(await page.locator('#philosophy .card').count(), 6);
    assert.equal(await page.locator(`#valuation a[href="/${locale}/contact?purpose=valuation"]`).count(), 1);
    await noOverflow(page, `${locale}/racquets`);
    if (SHOTS.has(locale)) await page.locator('#philosophy').screenshot({ path: `${OUT}/${locale}-philosophy-360.png` });
    await open(page, `/${locale}/racquets/great`);
    assert.equal(await page.locator(`#valuation a[href="/${locale}/contact?purpose=valuation&series=great"]`).count(), 1);

    // Contact: the valuation scenario opens with its own fields and the series named.
    await open(page, `/${locale}/contact?purpose=valuation&series=great`);
    const vf = page.locator('form.lead-form');
    await vf.locator('input[name="configuration"]').waitFor();
    assert.equal(await vf.locator('input[name="configuration"]').inputValue(), 'MAXIMUS GREAT SERIES · 97 in²');
    assert.deepEqual(await vf.locator('select[name="priceCurrency"] option').evaluateAll((xs) => xs.map((x) => x.value).filter(Boolean)), ['USD', 'EUR', 'AED', 'CNY']);
    assert.equal(await vf.locator('input[name="proposedPrice"]').count(), 1);
    assert.ok((await vf.textContent()).includes(E.valuation.comment)); // textContent: labels may be set in capitals by CSS
    await noOverflow(page, `${locale}/contact valuation`);
    if (SHOTS.has(locale)) await vf.screenshot({ path: `${OUT}/${locale}-valuation-form-360.png` });

    results.push({ locale, meetings: 'PASS', proShop: 'PASS', kits: 'PASS', exchange: 'PASS', identity: 'PASS', philosophy: 'PASS', valuation: 'PASS', overflow360: false });
    await context.close();
  }

  // Submissions through the shared validation: meeting (en, RTL ar) and valuation (ru).
  for (const locale of ['en', 'ar']) {
    const { page, context } = await surface(390);
    const seen = await intercept(page);
    await open(page, `/${locale}/meetings`);
    const form = await fillMeeting(page);
    await form.locator('button[type="submit"]').click();
    await page.waitForSelector('[data-state="accepted"]');
    assert.equal(await page.locator('[data-request-id]').innerText(), 'MX-MTG-20261014-TEST01');
    assert.equal(seen.length, 1);
    const v = validateRequest(seen[0]).value;
    assert.equal(v.purpose, 'meeting');
    assert.deepEqual(v.details.meetingInterests, ['club', 'national']);
    assert.equal(v.details.attendees, 3);
    assert.equal(v.details.willingToTravel, 'yes');
    const storage = await page.evaluate(() => JSON.stringify([Object.values(sessionStorage), Object.values(localStorage)]));
    assert.equal(/Sharjah|editorial@example/.test(storage), false, 'contact data in browser storage');
    await page.screenshot({ path: `${OUT}/${locale}-meeting-accepted-390.png`, fullPage: false });
    results.push({ locale, meetingSubmission: 'accepted with number; validated', storage: 'no contact data' });
    await context.close();
  }
  {
    const { page, context } = await surface(390);
    const seen = await intercept(page);
    await open(page, '/ru/contact?purpose=valuation&series=power');
    const form = page.locator('form.lead-form');
    await form.locator('input[name="proposedPrice"]').fill('250');
    await form.locator('select[name="priceCurrency"]').selectOption('AED');
    await form.locator('input[name="quantity"]').fill('2');
    await form.locator('textarea[name="message"]').fill('Для клуба');
    await contact(form);
    await page.waitForTimeout(1600);
    await form.locator('button[type="submit"]').click();
    await page.waitForSelector('[data-state="accepted"]');
    const v = validateRequest(seen[0]).value;
    assert.equal(v.purpose, 'valuation');
    assert.equal(v.details.configuration, 'MAXIMUS POWER SERIES · 98 in²');
    assert.equal(v.details.proposedPrice, 250);
    assert.equal(v.details.priceCurrency, 'AED');
    assert.equal(v.details.quantity, 2);
    results.push({ locale: 'ru', valuationSubmission: 'accepted with number; validated' });
    await context.close();
  }
  // A storage failure must show an error, never a green success.
  {
    const { page, context } = await surface(390);
    await intercept(page, 503);
    await open(page, '/en/meetings');
    const form = await fillMeeting(page);
    await form.locator('button[type="submit"]').click();
    await page.waitForSelector('.lead-result.fail');
    assert.equal(await page.locator('[data-state="accepted"]').count(), 0);
    await page.locator('.lead-result.fail').screenshot({ path: `${OUT}/en-meeting-store-failure-390.png` });
    results.push({ locale: 'en', storeFailure: 'error shown, no success state' });
    await context.close();
  }
  // Phone widths for the new pages (EN and RU): 360, 390, 430.
  for (const locale of ['en', 'ru']) for (const width of [390, 430]) for (const path of ['meetings', 'pro-shop']) {
    const { page, context } = await surface(width);
    await open(page, `/${locale}/${path}`);
    await noOverflow(page, `${locale}/${path}@${width}`);
    await page.screenshot({ path: `${OUT}/${locale}-${path}-${width}.png`, fullPage: true });
    await context.close();
  }
  assert.deepEqual(pageErrors, []);
  writeFileSync(`${OUT}/browser.json`, JSON.stringify({ status: 'PASS', scenarios: results.length, results, pageErrors, submissionTransport: 'intercepted; shared authoritative validation executed, no message sent' }, null, 2));
  console.log(`PASS ${results.length} browser scenarios; 48 locales × 7 pages at 360 px; meeting and valuation submissions; store failure shows an error`);
} catch (e) {
  writeFileSync(`${OUT}/browser.json`, JSON.stringify({ status: 'FAIL', completed: results, pageErrors, error: String(e), stack: e.stack }, null, 2));
  throw e;
} finally { await browser.close(); }
