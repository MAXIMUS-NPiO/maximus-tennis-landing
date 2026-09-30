/**
 * Header fit: the navigation bar must not collide with the lockup in any language.
 *
 * The header shell is 1320 px wide whatever the screen, so a language whose seven navigation
 * labels are longer than the English ones can run into the lockup instead of overflowing the
 * page — no horizontal scrollbar appears and no other check notices. This one measures the real
 * gap between the lockup artwork and the first navigation item, and between the last item and
 * the header tools, in every language the registry lists, at the widths where the full bar is
 * shown. Right-to-left languages are measured in reading order.
 *
 * Usage: node scripts/check-header.mjs [base-url]      (default http://127.0.0.1:3000)
 * Needs Playwright with a Chromium binary; without it the check reports SKIPPED and exits 0,
 * because it cannot say anything true about a browser it does not have.
 */
import { pathToFileURL } from "node:url";
import path from "node:path";

const base = (process.argv[2] || "http://127.0.0.1:3000").replace(/\/$/, "");
const site = (await import(pathToFileURL(path.join(process.cwd(), "data", "site.js")).href)).site;

const MIN_GAP = 12; // px of daylight required on each side of the bar
const WIDTHS = [1920, 1440, 1360];

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.log("header fit SKIPPED — playwright is not installed here; run it where it is before adding a language");
  process.exit(0);
}

const launch = {};
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;

let browser;
try {
  browser = await chromium.launch(launch);
} catch (e) {
  console.log(`header fit SKIPPED — no browser binary (${e.message.split("\n")[0]}); set CHROMIUM_PATH to run it`);
  process.exit(0);
}

const failures = [];
const report = [];

for (const width of WIDTHS) {
  for (const locale of site.locales) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(`${base}/${locale}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(350);
    const m = await page.evaluate(() => {
      const logo = document.querySelector(".header-logo") || document.querySelector(".logo-link img");
      const nav = document.querySelector(".nav-desktop");
      const tools = document.querySelector(".header-tools");
      if (!logo || !nav || !tools) return { error: "header elements not found" };
      if (getComputedStyle(nav).display === "none") return null; // compact menu: nothing to measure
      const items = [...nav.querySelectorAll(":scope > *")].map((el) => el.getBoundingClientRect()).filter((b) => b.width > 0);
      if (!items.length) return { error: "no navigation items" };
      const L = logo.getBoundingClientRect();
      const T = tools.getBoundingClientRect();
      const rtl = document.documentElement.dir === "rtl";
      const start = rtl ? Math.max(...items.map((b) => b.right)) : Math.min(...items.map((b) => b.left));
      const end = rtl ? Math.min(...items.map((b) => b.left)) : Math.max(...items.map((b) => b.right));
      return {
        toLogo: Math.round(rtl ? L.left - start : start - L.right),
        toTools: Math.round(rtl ? end - T.right : T.left - end),
      };
    });
    await ctx.close();
    if (m === null) continue;
    if (m.error) { failures.push(`${locale} @ ${width}: ${m.error}`); continue; }
    report.push(`${locale}@${width} ${m.toLogo}/${m.toTools}`);
    if (m.toLogo < MIN_GAP) failures.push(`${locale} @ ${width}px: navigation is ${m.toLogo} px from the lockup (needs ${MIN_GAP}) — shorten that language's navigation labels`);
    if (m.toTools < MIN_GAP) failures.push(`${locale} @ ${width}px: navigation is ${m.toTools} px from the header tools (needs ${MIN_GAP})`);
  }
}

await browser.close();

if (failures.length) {
  console.error("header fit FAILED:\n  " + failures.join("\n  "));
  process.exit(1);
}
console.log(`header fit OK — ${site.locales.length} languages × ${WIDTHS.length} widths, at least ${MIN_GAP} px clear on both sides of the bar`);
