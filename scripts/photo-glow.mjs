/**
 * Photo glow — the surroundings of each photograph, continued, so that the picture emerges from
 * the page instead of sitting on it as a rectangle (Founder, 8 October 2026: "the background flows
 * into the photographs; not a square, template solution").
 *
 * For every photograph in data/media.js (the registered photographs and the weight compositions of
 * GREAT, POWER and SPIN) this writes one small image to public/media/glow/:
 *   the photograph, reduced, softened, its edge pixels extended outwards by 45% of its size on every
 *   side, and blurred. Laid behind the photograph at the same scale (inset -45%), its middle sits
 *   exactly under the picture and its border continues the picture's own background outwards.
 *
 * The photograph itself is not changed; the files written here are only its surroundings.
 *
 * Usage: node scripts/photo-glow.mjs   (re-run after adding or replacing a photograph)
 */
import sharp from "sharp";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const OUT = path.join(root, "public", "media", "glow");
const EXTEND = 0.45;      // on each side, as a fraction of the photograph's width or height
const WORK_WIDTH = 120;   // working resolution: the result is a blur, detail is not needed
const OUT_WIDTH = 72;

const src = readFileSync(path.join(root, "data", "media.js"), "utf8");
const imports = Object.fromEntries([...src.matchAll(/import (\w+) from "\.\.\/public\/(media\/[^"]+)";/g)].map((m) => [m[1], m[2]]));
const blockOf = (start) => {
  const i = src.indexOf(start);
  if (i < 0) throw new Error(`not found in data/media.js: ${start}`);
  return src.slice(i, src.indexOf("};", i));
};

const jobs = [];
for (const [, key, imp] of blockOf("export const media = {").matchAll(/^\s+(\w+): owner\((\w+),/gm)) jobs.push([key, imp]);
for (const series of ["great", "power", "spin"]) {
  for (const [, weight, imp] of blockOf(`export const ${series}ByWeight = {`).matchAll(/(\d+): (\w+)/g)) jobs.push([`${series}-${weight}`, imp]);
}

mkdirSync(OUT, { recursive: true });
let bytes = 0;
for (const [key, imp] of jobs) {
  const file = imports[imp];
  if (!file) throw new Error(`no import for ${key} (${imp})`);
  const input = path.join(root, "public", file);
  const meta = await sharp(input).metadata();
  const w = WORK_WIDTH;
  const h = Math.max(2, Math.round((WORK_WIDTH * meta.height) / meta.width));
  const ex = Math.round(w * EXTEND);
  const ey = Math.round(h * EXTEND);
  const small = await sharp(input).resize(w, h, { fit: "fill" }).removeAlpha().blur(3).toBuffer();
  const continued = await sharp(small)
    .extend({ top: ey, bottom: ey, left: ex, right: ex, extendWith: "copy" })
    .blur(10)
    .modulate({ brightness: 0.94 })
    .toBuffer();
  const outH = Math.max(2, Math.round((OUT_WIDTH * (h + 2 * ey)) / (w + 2 * ex)));
  const info = await sharp(continued).resize(OUT_WIDTH, outH, { fit: "fill" }).webp({ quality: 72 }).toFile(path.join(OUT, `${key}.webp`));
  bytes += info.size;
}
console.log(`photo glow written for ${jobs.length} photographs (${Math.round(bytes / 1024)} KB) in public/media/glow/`);
