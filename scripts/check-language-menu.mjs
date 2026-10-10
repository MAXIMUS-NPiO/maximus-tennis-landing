/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/**
 * Language room (components/LocaleMenu.js): opens over the page inside the screen at every size from
 * a 320 px phone to a 1920 px desktop, in left-to-right and right-to-left languages; lists all
 * languages; finds a language by its own name, by its name in the reading language and by its code;
 * shows the empty state; filters by region; holds the page still while open; closes on Escape and
 * returns focus to the header button; raises no runtime error.
 *
 * Usage: node scripts/check-language-menu.mjs [base-url]   (default http://127.0.0.1:3000)
 * Needs Playwright with a Chromium binary (CHROMIUM_PATH); without it the check reports SKIPPED.
 */
let chromium;
try { ({ chromium } = await import("playwright")); } catch { console.log("language menu SKIPPED — playwright is not installed here"); process.exit(0); }
const { site } = await import("../data/site.js");
const base = (process.argv[2] || "http://127.0.0.1:3000").replace(/\/$/, "");
const launch = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const b = await chromium.launch(launch).catch((e) => { console.log(`language menu SKIPPED — no browser binary (${e.message.split("\n")[0]})`); process.exit(0); });
const TOTAL = site.locales.length;
const ASIA = (await import("../data/language-names.js")).regionOf;
const asiaCount = Object.values(ASIA).filter((r) => r === "asia").length;
const sizes = [[320, 568], [360, 640], [390, 844], [844, 390], [768, 1024], [1024, 768], [1440, 900], [1920, 1080]];
const locs = ['en', 'ru', 'ar', 'zh', 'th', 'fil', 'de'];
const problems = [];
let n = 0;
for (const [w, h] of sizes) for (const loc of locs) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, locale: loc === 'en' ? 'de-DE' : 'en-US', hasTouch: w < 600, isMobile: w < 600 });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e.message).slice(0, 120)));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 120)); });
  await p.goto(`${base}/${loc}`, { waitUntil: 'networkidle' });
  await p.click('.lang-trigger');
  await p.waitForTimeout(350);
  const r = await p.evaluate(() => {
    const d = document.querySelector('.lang-dialog');
    const vr = d.getBoundingClientRect();
    const list = d.querySelector('.lang-list');
    const vw = document.documentElement.clientWidth, vh = window.innerHeight;
    const opts = [...d.querySelectorAll('a.lang-opt')].filter((a) => !a.hidden);
    const cur = d.querySelector('a.lang-opt[aria-current="true"]');
    const over = [...d.querySelectorAll('*')].filter((el) => { const b = el.getBoundingClientRect(); return b.width && (b.right > vw + 1 || b.left < -1); }).length;
    return { inside: vr.left >= -1 && vr.top >= -1 && vr.right <= vw + 1 && vr.bottom <= vh + 1, visible: getComputedStyle(d).display !== 'none', opts: opts.length,
      scrolls: list.scrollHeight > list.clientHeight, current: cur && cur.textContent.slice(0, 30), title: d.querySelector('.lang-title').textContent,
      device: [...d.querySelectorAll('.lang-device-link')].map((a) => a.textContent), over, bodyLock: getComputedStyle(document.documentElement).overflow };
  });
  n++;
  if (!r.visible || !r.inside) problems.push(`${loc} ${w}x${h}: dialog not inside the screen`);
  if (r.opts !== TOTAL) problems.push(`${loc} ${w}x${h}: ${r.opts} options visible`);
  if (r.over) problems.push(`${loc} ${w}x${h}: ${r.over} elements overflow horizontally`);
  if (r.bodyLock !== 'hidden') problems.push(`${loc} ${w}x${h}: page not held still`);
  // search by own name, by name in the reading language, by code
  const search = async (q) => { await p.fill('.lang-search input', q); await p.waitForTimeout(80); return p.evaluate(() => [...document.querySelectorAll('a.lang-opt')].filter((a) => !a.hidden).map((a) => a.getAttribute('hreflang'))); };
  const s1 = await search('Deutsch'); if (!s1.includes('de')) problems.push(`${loc} ${w}x${h}: search by own name failed (${s1})`);
  const s2 = await search('fil'); if (!s2.includes('tl')) problems.push(`${loc} ${w}x${h}: search by code failed (${s2})`);
  const s3 = await search(loc === 'ru' ? 'немецкий' : loc === 'de' ? 'Russisch' : 'Japanese'); if (!s3.length) problems.push(`${loc} ${w}x${h}: search by name in reading language failed`);
  const s4 = await search('zzqx'); const empty = await p.evaluate(() => !!document.querySelector('.lang-empty'));
  if (s4.length || !empty) problems.push(`${loc} ${w}x${h}: empty state not shown`);
  await search('');
  // region filter
  await p.click('.lang-chip:nth-child(3)');
  const asia = await p.evaluate(() => [...document.querySelectorAll('a.lang-opt')].filter((a) => !a.hidden).length);
  if (asia !== asiaCount) problems.push(`${loc} ${w}x${h}: Asia filter shows ${asia}`);
  await p.click('.lang-chip:nth-child(1)');
  // keyboard: Escape closes and returns focus
  await p.keyboard.press('Escape');
  await p.waitForTimeout(120);
  const after = await p.evaluate(() => ({ hidden: document.querySelector('.lang-layer').hidden, focus: document.activeElement && document.activeElement.className, lock: getComputedStyle(document.documentElement).overflow }));
  if (!after.hidden) problems.push(`${loc} ${w}x${h}: Escape did not close`);
  if (!/lang-trigger/.test(after.focus || '')) problems.push(`${loc} ${w}x${h}: focus not returned (${after.focus})`);
  if (after.lock === 'hidden') problems.push(`${loc} ${w}x${h}: page still locked after closing`);
  if (errs.length) problems.push(`${loc} ${w}x${h}: ${errs.join(' | ')}`);
  await ctx.close();
}
await b.close();
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
console.log(`language menu OK — ${n} cases (${sizes.length} sizes × ${locs.length} languages)`);
