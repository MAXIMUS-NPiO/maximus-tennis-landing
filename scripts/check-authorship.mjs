/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/**
 * Authorship check (Founder, 10 October 2026: authorship is added by default, everywhere, always —
 * he is not to be reminded). A release in which any layer is missing is refused:
 *   1. every source file opens with the author's notice (code, calculations, algorithms, texts);
 *   2. LICENSE reserves all rights, and package.json names the author and grants no licence;
 *   3. every image the site serves from its own files carries the notice inside the file;
 *   4. every language has the footer authorship line, the calculation-model line and the extended
 *      copyright statement of the terms page;
 *   5. text and data mining is reserved (robots, /.well-known/tdmrep.json) and the bundle banner is
 *      configured;
 *   6. with --built: every script and stylesheet in .next/static opens with the notice.
 * Usage: node scripts/check-authorship.mjs [--fix] [--built]
 *   --fix adds the notice to source files that lack it.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { AUTHOR } from "../lib/authorship.js";
import { imageFiles, carriesRights } from "./image-rights.mjs";

const root = process.cwd();
const FIX = process.argv.includes("--fix");
const BUILT = process.argv.includes("--built");
const fail = [];
export const HEADER = "/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */";
const HEADER_RE = /^\/\*! © 2026(–\d{4})? Maximus Kiriyakulov\. All rights reserved\./;

const walk = (d, re) => (existsSync(d) ? readdirSync(d).flatMap((f) => {
  const p = path.join(d, f);
  if (["node_modules", ".next", ".git"].includes(f)) return [];
  return statSync(p).isDirectory() ? walk(p, re) : re.test(f) ? [p] : [];
}) : []);

// 1. Source files.
const SOURCE = /\.(js|mjs|cjs|jsx|css)$/;
const sources = ["app", "components", "lib", "data", "scripts", "tests", "content"]
  .flatMap((d) => walk(path.join(root, d), SOURCE))
  .concat(["middleware.js", "next.config.mjs"].map((f) => path.join(root, f)).filter(existsSync));
let fixed = 0;
for (const f of sources) {
  const txt = readFileSync(f, "utf8");
  const shebang = txt.startsWith("#!") ? txt.slice(0, txt.indexOf("\n") + 1) : "";
  const body = txt.slice(shebang.length);
  if (HEADER_RE.test(body)) continue;
  if (FIX) { writeFileSync(f, `${shebang}${HEADER}\n${body}`); fixed += 1; continue; }
  fail.push(`no authorship notice at the top of ${path.relative(root, f)}`);
}

// 2. Licence and package.
const lic = existsSync(path.join(root, "LICENSE")) ? readFileSync(path.join(root, "LICENSE"), "utf8") : "";
if (!lic.includes(AUTHOR) || !/All rights reserved/.test(lic) || !/No licence is granted/.test(lic)) fail.push("LICENSE must name the author, reserve all rights and grant no licence");
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
if (pkg.author !== AUTHOR) fail.push(`package.json author must be "${AUTHOR}"`);
if (pkg.license !== "UNLICENSED") fail.push('package.json license must be "UNLICENSED"');

// 3. Images.
const images = imageFiles();
let bare = 0;
for (const f of images) if (!(await carriesRights(f))) { bare += 1; fail.push(`image without the notice: ${path.relative(root, f)} (run node scripts/image-rights.mjs)`); }

// 4. Every language.
const { site } = await import("../data/site.js");
for (const l of site.locales) {
  const mod = await import(`../content/${l}.js`);
  const d = mod.default || Object.values(mod)[0];
  if (!d.footer?.authorship) fail.push(`${l}: footer.authorship missing`);
  if (!d.rights?.model || !d.rights.model.includes("{years}") || !d.rights.model.includes(AUTHOR)) fail.push(`${l}: rights.model must carry {years} and ${AUTHOR}`);
  // The extended statement (images, calculations, algorithms, data; no licence; no mining) is at
  // least three times the length of the original two sentences in every script.
  const min = ["ja", "ko", "zh"].includes(l) ? 150 : 400;
  if (!d.terms?.copyright || d.terms.copyright.length < min) fail.push(`${l}: terms.copyright missing or not extended`);
}

// 5. Reservation of text and data mining; bundle banner.
const robots = readFileSync(path.join(root, "app", "robots.js"), "utf8");
if (!/GPTBot/.test(robots) || !/Google-Extended/.test(robots)) fail.push("robots: AI training crawlers are not excluded");
try {
  const tdm = JSON.parse(readFileSync(path.join(root, "public", ".well-known", "tdmrep.json"), "utf8"));
  if (!Array.isArray(tdm) || !tdm.some((r) => r.location === "/" && r["tdm-reservation"] === 1)) fail.push("tdmrep.json must reserve text and data mining for /");
} catch { fail.push("public/.well-known/tdmrep.json missing or invalid"); }
const nextConfig = readFileSync(path.join(root, "next.config.mjs"), "utf8");
if (!/BannerPlugin/.test(nextConfig) || !nextConfig.includes(AUTHOR)) fail.push("next.config.mjs: the bundle banner is not configured");

// 6. Built bundles.
let bundles = 0;
if (BUILT) {
  // Framework files that Next.js writes or copies itself, outside the bundler, are not the author's
  // code and carry no banner: the build and SSG manifests and the browser polyfills.
  const FRAMEWORK = /(^|[\\/])(_buildManifest|_ssgManifest)\.js$|[\\/]polyfills-[0-9a-f]+\.js$/;
  for (const f of walk(path.join(root, ".next", "static"), /\.(js|css)$/)) {
    if (FRAMEWORK.test(f)) continue;
    bundles += 1;
    const head = readFileSync(f, "utf8").slice(0, 200);
    if (!HEADER_RE.test(head.replace(/^﻿/, "")) && !head.startsWith("/*! © 2026")) fail.push(`bundle without the notice: ${path.relative(root, f)}`);
  }
  if (!bundles) fail.push("--built: no bundles found in .next/static (build first)");
}

if (fail.length) { console.error(fail.slice(0, 60).join("\n") + (fail.length > 60 ? `\n… ${fail.length - 60} more` : "")); process.exit(1); }
console.log(`authorship OK — ${sources.length} source files${fixed ? ` (${fixed} given the notice now)` : ""}, ${images.length} images, ${site.locales.length} languages, licence, TDM reservation${BUILT ? `, ${bundles} bundles` : ""}`);
