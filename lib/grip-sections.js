/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/**
 * Grip-shape cross-sections (Founder, 15 October 2026) — illustrative proportions, never a
 * specification. Every octagon has the same perimeter, so the geometries read as one grip size with
 * differently proportioned bevels. r = width / height of the section; k = the length of a corner
 * bevel relative to the side of a regular octagon of that perimeter. No dimension is published:
 * the exact geometry of an order is set in its written specification.
 */
export const SECTION_PROPORTIONS = Object.freeze({
  classic: Object.freeze({ r: 1.135, k: 0.85 }),
  rectangular: Object.freeze({ r: 1.2, k: 0.7 }),
  even: Object.freeze({ r: 1.06, k: 1 }),
});

/** The eight vertices of one section, clockwise from the top-left corner of the top bevel. */
export function sectionVertices(shape) {
  const { r, k } = SECTION_PROPORTIONS[shape] || SECTION_PROPORTIONS.classic;
  const P = 111; // any perimeter: only the proportions matter, and they are equal for every shape
  const d = (k * P) / 8, e = d / Math.SQRT2;
  const b = (P / 2 - 2 * d - 2 * e * (r - 1)) / (1 + r);
  const a = r * b + 2 * e * (r - 1);
  const W = a + 2 * e, H = b + 2 * e;
  return [[-a / 2, -H / 2], [a / 2, -H / 2], [W / 2, -b / 2], [W / 2, b / 2], [a / 2, H / 2], [-a / 2, H / 2], [-W / 2, b / 2], [-W / 2, -b / 2]];
}

/** SVG points in a 100 × 100 box; the widest of the sections fills `fill` of the box. */
export function sectionPoints(shape, { dx = 0, dy = 0, fill = 0.86 } = {}) {
  const u = (100 * fill) / 34.8;
  return sectionVertices(shape).map(([x, y]) => `${(50 + dx + x * u).toFixed(2)},${(50 + dy + y * u).toFixed(2)}`).join(" ");
}
