/**
 * Photo surroundings — each photograph's own backdrop, continued a short way past its edges and
 * dissolved into the page, so the picture emerges from the page instead of sitting on it as a
 * rectangle (Founder, 8 October 2026: "the background flows into the photographs; not a square,
 * template solution"; later the same day: "the shading is murky, too strong — the racquet must stay
 * visible further; not in patches; one story").
 *
 * For every photograph in data/media.js (the registered photographs and the weight compositions of
 * GREAT, POWER and SPIN) this writes one small image with transparency to public/media/glow/:
 *   - inside the photograph's rectangle: the photograph itself, reduced (it lies under the picture
 *     and shows only through the picture's outermost pixels, which are feathered);
 *   - outside: the colour of the photograph's own edge, taken point by point along each edge and
 *     smoothed a little along the edge only, carried straight outwards and faded to nothing, quickly
 *     at first and then slowly ((1 - d)^1.6), so the edge itself dissolves and no halo is left standing.
 *     How far it is carried depends on the edge: where an edge already has the tone of the page
 *     (the GREAT compositions) it dissolves within a few per cent; where it is lit (the smoke at the
 *     side of the POWER and SPIN compositions) the light runs further before it fades, as light
 *     would. The reach is never more than EXTEND.
 * Nothing of the picture's content is smeared outwards: no blurred copy of the racquet, no halo.
 * Laid behind the photograph at inset -EXTEND (components/Media.js, components/PhotoStage.js), the
 * middle sits exactly under the picture.
 *
 * The photograph itself is not changed; the files written here are only its surroundings.
 *
 * Usage: node scripts/photo-glow.mjs   (re-run after adding or replacing a photograph)
 */
import sharp from "sharp";
import { mkdirSync, readFileSync, readdirSync, unlinkSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const OUT = path.join(root, "public", "media", "glow");
export const EXTEND = 0.24;  // the furthest reach on any side, as a fraction of the photograph's width or height
const MIN_REACH = 0.06;      // the reach of an edge that already has the page's tone
const REACH_PER_TONE = 0.9;  // further reach per unit of tone (0–1) between an edge and the page
const PAGE = [0x15, 0x15, 0x14]; // --bg in app/globals.css
const WORK_WIDTH = 160;      // working resolution: the surroundings are smooth, detail is not needed
const OUT_WIDTH = 120;
const EDGE_BAND = 0.025;     // depth of the edge band whose colour is carried outwards
const ALONG = 0.07;          // smoothing along each edge, as a fraction of the edge length

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

/** Box blur of a profile of RGB triples, repeated three times (close to a Gaussian). */
function smooth(profile, radius) {
  let cur = profile;
  const n = cur.length;
  for (let pass = 0; pass < 3; pass++) {
    const next = new Array(n);
    for (let i = 0; i < n; i++) {
      let r = 0, g = 0, b = 0, c = 0;
      for (let k = -radius; k <= radius; k++) {
        const j = Math.min(n - 1, Math.max(0, i + k));
        r += cur[j][0]; g += cur[j][1]; b += cur[j][2]; c++;
      }
      next[i] = [r / c, g / c, b / c];
    }
    cur = next;
  }
  return cur;
}

const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const PAGE_LUM = lum(PAGE);

mkdirSync(OUT, { recursive: true });
const written = new Set();
let bytes = 0;
for (const [key, imp] of jobs) {
  const file = imports[imp];
  if (!file) throw new Error(`no import for ${key} (${imp})`);
  const input = path.join(root, "public", file);
  const meta = await sharp(input).metadata();
  const w = WORK_WIDTH;
  const h = Math.max(8, Math.round((WORK_WIDTH * meta.height) / meta.width));
  const { data: px } = await sharp(input).resize(w, h, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const at = (x, y) => { const i = (y * w + x) * 3; return [px[i], px[i + 1], px[i + 2]]; };

  // The colour of each edge, point by point along it: the mean of a thin band at the edge.
  const band = (len, depth, get) => Array.from({ length: len }, (_, i) => {
    let r = 0, g = 0, b = 0;
    for (let d = 0; d < depth; d++) { const [pr, pg, pb] = get(i, d); r += pr; g += pg; b += pb; }
    return [r / depth, g / depth, b / depth];
  });
  const dy = Math.max(1, Math.round(h * EDGE_BAND));
  const dx = Math.max(1, Math.round(w * EDGE_BAND));
  const top = smooth(band(w, dy, (x, d) => at(x, d)), Math.max(1, Math.round((w * ALONG) / 2)));
  const bottom = smooth(band(w, dy, (x, d) => at(x, h - 1 - d)), Math.max(1, Math.round((w * ALONG) / 2)));
  const left = smooth(band(h, dx, (y, d) => at(d, y)), Math.max(1, Math.round((h * ALONG) / 2)));
  const right = smooth(band(h, dx, (y, d) => at(w - 1 - d, y)), Math.max(1, Math.round((h * ALONG) / 2)));

  // How far each point of each edge is carried: further the more its tone differs from the page.
  const reach = (c) => Math.min(EXTEND, MIN_REACH + (Math.abs(lum(c) - PAGE_LUM) / 255) * REACH_PER_TONE);
  const reachL = left.map((c) => reach(c) * w);
  const reachR = right.map((c) => reach(c) * w);
  const reachT = top.map((c) => reach(c) * h);
  const reachB = bottom.map((c) => reach(c) * h);

  const ex = Math.round(w * EXTEND);
  const ey = Math.round(h * EXTEND);
  const W = w + 2 * ex;
  const H = h + 2 * ey;
  const out = Buffer.alloc(W * H * 4);
  for (let Y = 0; Y < H; Y++) {
    for (let X = 0; X < W; X++) {
      const x = X - ex;
      const y = Y - ey;
      const ox = x < 0 ? -x : x > w - 1 ? x - (w - 1) : 0;   // distance outside, horizontally
      const oy = y < 0 ? -y : y > h - 1 ? y - (h - 1) : 0;   // and vertically
      let c;
      if (!ox && !oy) c = at(x, y);
      else {
        const cx = Math.min(w - 1, Math.max(0, x));
        const cy = Math.min(h - 1, Math.max(0, y));
        const side = x < 0 ? left[cy] : right[cy];
        const cap = y < 0 ? top[cx] : bottom[cx];
        if (!oy) c = side;
        else if (!ox) c = cap;
        else {
          const k = ox / (ox + oy);   // in a corner, the two edges meet in proportion to direction
          c = [0, 1, 2].map((j) => k * side[j] + (1 - k) * cap[j]);
        }
      }
      const cx = Math.min(w - 1, Math.max(0, x));
      const cy = Math.min(h - 1, Math.max(0, y));
      const fx = x < 0 ? reachL[cy] : reachR[cy];
      const fy = y < 0 ? reachT[cx] : reachB[cx];
      const d = Math.sqrt((ox ? ox / fx : 0) ** 2 + (oy ? oy / fy : 0) ** 2);
      const a = d >= 1 ? 0 : (1 - d) ** 1.6;
      const o = (Y * W + X) * 4;
      out[o] = Math.round(c[0]); out[o + 1] = Math.round(c[1]); out[o + 2] = Math.round(c[2]); out[o + 3] = Math.round(a * 255);
    }
  }
  const outH = Math.max(2, Math.round((OUT_WIDTH * H) / W));
  const info = await sharp(out, { raw: { width: W, height: H, channels: 4 } })
    .blur(1.2)
    .resize(OUT_WIDTH, outH, { fit: "fill" })
    .webp({ quality: 80, alphaQuality: 90 })
    .toFile(path.join(OUT, `${key}.webp`));
  written.add(`${key}.webp`);
  bytes += info.size;
}
// A photograph withdrawn from data/media.js takes its surroundings with it.
for (const f of readdirSync(OUT)) if (f.endsWith(".webp") && !written.has(f)) unlinkSync(path.join(OUT, f));
console.log(`photo surroundings written for ${jobs.length} photographs (${Math.round(bytes / 1024)} KB) in public/media/glow/`);
