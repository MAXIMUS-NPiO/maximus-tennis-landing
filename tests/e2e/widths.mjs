/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/** Responsive sweep (Founder's update of 14 October 2026, P1.4): no horizontal scroll from 320 to 1920 px.
 * Every language at 320 px on the visitor route; EN, RU, ZH and AR at 768, 1280, 1440 and 1920 px with screenshots.
 * NODE_PATH=<existing playwright node_modules> node --import ./tests/register.mjs tests/e2e/widths.mjs
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { locales } from '../../lib/i18n.js';
const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:3215';
const OUT = process.env.EVIDENCE || '../widths-evidence';
mkdirSync(OUT, { recursive: true });
const PAGES = ['', '/racquets', '/racquets/great', '/training', '/catalogue', '/partnerships', '/personal-brands', '/pro-shop', '/meetings', '/contact', '/build'];
const browser = await chromium.launch({ headless: true });
const failures = [], pageErrors = [], retries = []; // retries: connection resets on the way, recorded
let checked = 0;
async function sweep(width, locs, shots) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => pageErrors.push(`${page.url()}: ${e}`));
  await page.route('**/*', (route) => (new URL(route.request().url()).origin === new URL(BASE).origin ? route.continue() : route.abort()));
  for (const l of locs) for (const p of PAGES) {
    let res;
    for (let attempt = 0; attempt < 4; attempt++) {
      const before = pageErrors.length;
      try { res = await page.goto(`${BASE}/${l}${p}`, { waitUntil: 'load' }); }
      catch (e) { if (attempt < 3) { retries.push(`${l}${p}@${width}: ${String(e).split('\n')[0]}`); continue; } throw e; }
      const fresh = pageErrors.slice(before);
      if (fresh.length && fresh.every((x) => /ChunkLoadError|Loading chunk/.test(x)) && attempt < 3) { pageErrors.splice(before); retries.push(`${l}${p}@${width}: script chunk did not load`); continue; }
      break;
    }
    if (res.status() !== 200) failures.push(`${l}${p}@${width}: HTTP ${res.status()}`);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    if (over > 1) {
      const culprit = await page.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 1).slice(0, 3).map((e) => `${e.tagName.toLowerCase()}.${[...e.classList].join('.')}`));
      failures.push(`${l}${p}@${width}: +${over}px ${culprit.join(' ')}`);
    }
    if (shots) await page.screenshot({ path: `${OUT}/${l}${p.replaceAll('/', '_') || '_home'}-${width}.png`, fullPage: false });
    checked++;
  }
  await context.close();
}
try {
  await sweep(320, locales, false);
  for (const w of [768, 1280, 1440, 1920]) await sweep(w, ['en', 'ru', 'zh', 'ar'], true);
  writeFileSync(`${OUT}/widths.json`, JSON.stringify({ status: failures.length || pageErrors.length ? 'FAIL' : 'PASS', checked, failures, pageErrors, retries }, null, 2));
  assert.deepEqual(failures, []);
  assert.deepEqual(pageErrors, []);
  console.log(`PASS ${checked} page views: 48 languages × ${PAGES.length} pages at 320 px; EN/RU/ZH/AR at 768, 1280, 1440, 1920 px; no horizontal scroll`);
} finally { await browser.close(); }
