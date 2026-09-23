/**
 * Media registry — the code-side counterpart of ASSET_MANIFEST.md.
 *
 * Owner instructions 22–23 September 2026: the site shows the owner's own product visual sets.
 * The white-background source photographs were withdrawn; renders generated in this repository
 * are banned and removed.
 *
 * Spin series (instruction of 23 September 2026): every composition is published WHOLE — the
 * specification strip, the personalisation engraving zone and the MIPA marking stay visible and
 * readable. No crop, no retouch, no substitution. The published weight and balance of each file
 * were checked against data/products.js file by file, 33 of 33.
 *
 * Sets received: SPIN (1_1, 1_2 — 33 compositions), Sweet Spot Trainer (2_1, 2_2). GREAT and POWER: awaited.
 */
import spinVisual from "../public/media/spin-visual.jpg";
import spinHead from "../public/media/spin-head.jpg";
import handleLion from "../public/media/handle-lion.jpg";
import engraving from "../public/media/engraving.jpg";
import lettering from "../public/media/lettering.jpg";
import sstSystem from "../public/media/sst-system.jpg";
import sst270 from "../public/media/sst-270.jpg";
import sst285 from "../public/media/sst-285.jpg";
import sst300 from "../public/media/sst-300.jpg";
import sst400 from "../public/media/sst-400.jpg";
import sstShafts from "../public/media/sst-shafts.jpg";
import sstGrips from "../public/media/sst-grips.jpg";
import sstButtcaps from "../public/media/sst-buttcaps.jpg";

import s222 from "../public/media/spin/spin-222.jpg";
import s229 from "../public/media/spin/spin-229.jpg";
import s233 from "../public/media/spin/spin-233.jpg";
import s236 from "../public/media/spin/spin-236.jpg";
import s239 from "../public/media/spin/spin-239.jpg";
import s243 from "../public/media/spin/spin-243.jpg";
import s247 from "../public/media/spin/spin-247.jpg";
import s250 from "../public/media/spin/spin-250.jpg";
import s253 from "../public/media/spin/spin-253.jpg";
import s257 from "../public/media/spin/spin-257.jpg";
import s260 from "../public/media/spin/spin-260.jpg";
import s263 from "../public/media/spin/spin-263.jpg";
import s267 from "../public/media/spin/spin-267.jpg";
import s270 from "../public/media/spin/spin-270.jpg";
import s273 from "../public/media/spin/spin-273.jpg";
import s277 from "../public/media/spin/spin-277.jpg";
import s280 from "../public/media/spin/spin-280.jpg";
import s283 from "../public/media/spin/spin-283.jpg";
import s287 from "../public/media/spin/spin-287.jpg";
import s290 from "../public/media/spin/spin-290.jpg";
import s294 from "../public/media/spin/spin-294.jpg";
import s297 from "../public/media/spin/spin-297.jpg";
import s315 from "../public/media/spin/spin-315.jpg";
import s320 from "../public/media/spin/spin-320.jpg";
import s325 from "../public/media/spin/spin-325.jpg";
import s330 from "../public/media/spin/spin-330.jpg";
import s333 from "../public/media/spin/spin-333.jpg";
import s339 from "../public/media/spin/spin-339.jpg";
import s347 from "../public/media/spin/spin-347.jpg";
import s355 from "../public/media/spin/spin-355.jpg";
import s360 from "../public/media/spin/spin-360.jpg";
import s366 from "../public/media/spin/spin-366.jpg";
import s377 from "../public/media/spin/spin-377.jpg";

const owner = (src, model, purpose) => ({ src, model, kind: "owner", purpose });

/**
 * Spin compositions by listed weight. Each entry is the complete, uncropped file for that weight;
 * the weight and balance printed inside the image match data/products.js.
 */
export const spinByWeight = {
  222: s222, 229: s229, 233: s233, 236: s236, 239: s239, 243: s243, 247: s247, 250: s250,
  253: s253, 257: s257, 260: s260, 263: s263, 267: s267, 270: s270, 273: s273, 277: s277,
  280: s280, 283: s283, 287: s287, 290: s290, 294: s294, 297: s297, 315: s315, 320: s320,
  325: s325, 330: s330, 333: s333, 339: s339, 347: s347, 355: s355, 360: s360, 366: s366,
  377: s377,
};

export const media = {
  spinVisual: owner(spinVisual, "spin", "SPIN: complete composition, 290 g"),
  spinHead: owner(spinHead, "spin", "SPIN head and string bed — detail view"),
  handleLion: owner(handleLion, "spin", "Throat, grip and butt cap with the lion mark — detail view"),
  engraving: owner(engraving, "spin", "Silver personalisation engraving on the shaft — detail view"),
  lettering: owner(lettering, "spin", "Gloss MAXIMUS lettering on the matte frame — detail view"),
  sstSystem: owner(sstSystem, "sst", "Sweet Spot Trainer four-racquet system"),
  sst270: owner(sst270, "sst", "Sweet Spot Trainer 270 g / 330 mm"),
  sst285: owner(sst285, "sst", "Sweet Spot Trainer 285 g / 325 mm"),
  sst300: owner(sst300, "sst", "Sweet Spot Trainer 300 g / 325 mm"),
  sst400: owner(sst400, "sst", "Sweet Spot Trainer 400 g / 320 mm"),
  sstShafts: owner(sstShafts, "sst", "Sweet Spot Trainer shafts with the MAXIMUS lettering"),
  sstGrips: owner(sstGrips, "sst", "Sweet Spot Trainer grips and butt caps"),
  sstButtcaps: owner(sstButtcaps, "sst", "Sweet Spot Trainer four-racquet system, butt caps"),
};

/** Sweet Spot Trainer gallery. */
export const sstGallery = ["sst270", "sst285", "sst300", "sst400"];
export const sstDetails = ["sstShafts", "sstGrips", "sstButtcaps"];

/**
 * Per-series media. `full` = complete view, `details` = construction views.
 * null or [] = nothing registered yet → typographic tile and an entry in CONTENT_GAPS.md.
 * GREAT and POWER: the owner's visual sets are awaited.
 */
export const seriesMedia = {
  great: { card: null, full: null, details: [] },
  power: { card: null, full: null, details: [] },
  spin: { card: "spinVisual", full: "spinVisual", details: ["spinHead", "handleLion"] },
};

export const trainingMedia = { sst: "sstSystem" };

/**
 * Inspection video 08 is prepared but NOT released: the owner must review the full clip first.
 */
export const inspectionVideo = { released: false, model: "great", source: "08_Great_Source_Video.mp4 (3781)", src: null, poster: null };
