/**
 * Consent-mode analytics test against a build made WITH NEXT_PUBLIC_GA_MEASUREMENT_ID.
 * The Google tag request is intercepted (never reaches Google); gtag calls are read from dataLayer.
 *   BASE_URL=http://127.0.0.1:3200 NODE_PATH=$(npm root -g) node tests/e2e/consent.mjs
 */
import { createRequire } from "node:module";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const BASE = process.env.BASE_URL || "http://127.0.0.1:3200";
const OUT = process.env.EVIDENCE || "./evidence";
mkdirSync(path.join(OUT, "screens"), { recursive: true });
const assert = (c, m) => { if (!c) throw new Error(m); };
const browser = await chromium.launch();
const result = {};

async function ctx() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const gtagRequests = [];
  await context.route(/googletagmanager\.com|google-analytics\.com/, (route) => { gtagRequests.push(route.request().url()); route.fulfill({ status: 200, contentType: "application/javascript", body: "/* intercepted in test */" }); });
  const page = await context.newPage();
  return { context, page, gtagRequests };
}
const dataLayer = (page) => page.evaluate(() => (window.dataLayer || []).map((a) => Array.from(a)));

// 1. Decline: banner shown, no tag loaded, form still works
{
  const { context, page, gtagRequests } = await ctx();
  await page.goto(`${BASE}/en/choose?utm_source=google&utm_medium=cpc&utm_campaign=consent-test&gclid=ABC123`);
  await page.waitForSelector(".consent-bar");
  await page.screenshot({ path: path.join(OUT, "screens", "consent-bar-mobile.png") });
  const formVisible = await page.locator("form.lead-form").isVisible();
  await page.locator(".consent-bar .btn-outline").click();
  await page.waitForTimeout(500);
  const bannerAfter = await page.locator(".consent-bar").count();
  const form = page.locator("form.lead-form");
  await form.locator('select[name="level"]').selectOption("advanced");
  await form.locator('input[name="name"]').fill("Consent Decline");
  await form.locator('input[name="email"]').fill("decline@example.org");
  await form.locator('select[name="role"]').selectOption("player");
  await form.locator('input[name="country"]').fill("UAE");
  await form.locator('input[type="checkbox"][required]').check();
  await page.waitForTimeout(1600);
  await form.locator('button[type="submit"]').click();
  const id = await page.waitForSelector("[data-request-id]", { timeout: 20000 }).then((e) => e.getAttribute("data-request-id")).catch(() => null);
  result.decline = { bannerShown: true, formVisibleWithBanner: formVisible, bannerAfterDecline: bannerAfter, tagRequests: gtagRequests.length, dataLayerEntries: (await dataLayer(page)).length, requestId: id };
  assert(bannerAfter === 0 && gtagRequests.length === 0 && id, "decline path failed");
  await context.close();
}

// 2. Allow: tag loads, page_view has controlled location, generate_lead once, no personal data
{
  const { context, page, gtagRequests } = await ctx();
  await page.goto(`${BASE}/en/choose?utm_source=google&utm_medium=cpc&utm_campaign=consent-test&gclid=ABC123&email=leak@example.org`);
  await page.waitForSelector(".consent-bar");
  await page.locator(".consent-bar .btn").first().click();
  await page.waitForTimeout(800);
  const form = page.locator("form.lead-form");
  await form.locator('select[name="level"]').selectOption("advanced");
  await form.locator('input[name="name"]').fill("Consent Allow");
  await form.locator('input[name="email"]').fill("allow@example.org");
  await form.locator('select[name="role"]').selectOption("player");
  await form.locator('input[name="country"]').fill("UAE");
  await form.locator('input[type="checkbox"][required]').check();
  await page.waitForTimeout(1600);
  await form.locator('button[type="submit"]').click();
  const id = await page.waitForSelector("[data-request-id]", { timeout: 20000 }).then((e) => e.getAttribute("data-request-id")).catch(() => null);
  const dl = await dataLayer(page);
  const events = dl.filter((a) => a[0] === "event").map((a) => ({ name: a[1], params: a[2] }));
  const pageViews = events.filter((e) => e.name === "page_view");
  const leads = events.filter((e) => e.name === "generate_lead");
  const blob = JSON.stringify(dl);
  await page.reload();
  await page.waitForTimeout(800);
  const afterReload = (await dataLayer(page)).filter((a) => a[0] === "event" && a[1] === "generate_lead").length;
  result.allow = { tagRequests: gtagRequests.map((u) => u.replace(/\?.*/, "")), consentDefault: dl.find((a) => a[0] === "consent"), config: dl.find((a) => a[0] === "config"), pageViews, generateLead: leads, successEventsAfterReload: afterReload, requestId: id, events: events.map((e) => e.name) };
  assert(gtagRequests.length >= 1, "tag not loaded after consent");
  assert(pageViews.length >= 1 && !/email=|leak@/.test(pageViews[0].params.page_location) && /utm_campaign=consent-test/.test(pageViews[0].params.page_location), `page_location not controlled: ${pageViews[0] && pageViews[0].params.page_location}`);
  assert(leads.length === 1 && afterReload === 0, "generate_lead not exactly once");
  assert(!/allow@example\.org|Consent Allow|MX-SEL-/.test(blob), "personal data or request id in dataLayer");
  await context.close();
}

await browser.close();
writeFileSync(path.join(OUT, "consent.json"), JSON.stringify({ base: BASE, measurementId: "G-TEST00000 (test build; Google requests intercepted)", ranAt: new Date().toISOString(), result }, null, 2));
console.log(JSON.stringify(result, null, 1).slice(0, 2500));
