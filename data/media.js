/**
 * Media registry — the code-side counterpart of ASSET_MANIFEST.md.
 *
 * Owner instruction 22 September 2026: the source photographs of the unstrung frames on a white
 * background are withdrawn from the site ("they show nothing"); the site shows product
 * visualisations from several angles instead. Two kinds are registered here, both labelled as
 * visualisations on the page:
 *   - `owner`  — the owner's own SPIN series visual set (1_1.zip, 22 Sep 2026), specification strip
 *                and internal MIPA record line cropped off; only the approved weight labels remain;
 *   - `render` — studio renders built in this repository from the geometry of the photographed
 *                frames (head area per series, L0–L7 handle architecture, official wordmark and lion).
 * No render is evidence that a configuration exists or is available; product data always comes from
 * data/products.js, never from an image.
 */
import spinVisual from "../public/media/spin-visual.jpg";
import spinHead from "../public/media/spin-head.jpg";
import handleLion from "../public/media/handle-lion.jpg";
import engraving from "../public/media/engraving.jpg";
import lettering from "../public/media/lettering.jpg";
import spin270 from "../public/media/spin-270.jpg";
import spin320 from "../public/media/spin-320.jpg";
import spin347 from "../public/media/spin-347.jpg";
import powerHero from "../public/media/power-hero.jpg";
import powerFront from "../public/media/power-front.jpg";
import powerThroat from "../public/media/power-throat.jpg";
import greatHero from "../public/media/great-hero.jpg";
import greatFront from "../public/media/great-front.jpg";
import sstFront from "../public/media/sst-front.jpg";

export const media = {
  spinVisual: { src: spinVisual, model: "spin", kind: "owner", source: "owner visual set 1_1 (22 Sep 2026)", purpose: "SPIN series visualisation: head, lettering, handle and butt cap" },
  spinHead: { src: spinHead, model: "spin", kind: "owner", source: "owner visual set 1_1", purpose: "Head and string bed" },
  handleLion: { src: handleLion, model: "spin", kind: "owner", source: "owner visual set 1_1", purpose: "Throat, grip and butt cap with the lion mark" },
  engraving: { src: engraving, model: "spin", kind: "owner", source: "owner visual set 1_1", purpose: "Silver personalisation engraving on the shaft" },
  lettering: { src: lettering, model: "spin", kind: "owner", source: "owner visual set 1_1", purpose: "Gloss MAXIMUS lettering on the matte frame" },
  spin270: { src: spin270, model: "spin", kind: "owner", source: "owner visual set 1_1", purpose: "SPIN 270 g" },
  spin320: { src: spin320, model: "spin", kind: "owner", source: "owner visual set 1_1", purpose: "SPIN 320 g" },
  spin347: { src: spin347, model: "spin", kind: "owner", source: "owner visual set 1_1", purpose: "SPIN 347 g" },
  powerHero: { src: powerHero, model: "power", kind: "render", source: "studio render", purpose: "POWER three-quarter view" },
  powerFull: { src: powerFront, model: "power", kind: "render", source: "studio render", purpose: "POWER front view" },
  powerHandle: { src: powerThroat, model: "power", kind: "render", source: "studio render", purpose: "POWER throat and shaft" },
  greatHero: { src: greatHero, model: "great", kind: "render", source: "studio render", purpose: "GREAT three-quarter view" },
  greatFull: { src: greatFront, model: "great", kind: "render", source: "studio render", purpose: "GREAT front view" },
  sstFull: { src: sstFront, model: "sst", kind: "render", source: "studio render", purpose: "Sweet Spot Trainer front view" },
};

/**
 * Per-series media. `full` = complete racquet view, `details` = construction / handle views.
 * null or [] = nothing registered → typographic tile and an entry in CONTENT_GAPS.md.
 */
export const seriesMedia = {
  great: { card: "greatFull", full: "greatHero", details: ["greatFull"] },
  power: { card: "powerFull", full: "powerHero", details: ["powerHandle"] },
  spin: { card: "spinVisual", full: "spinVisual", details: ["spinHead", "handleLion"] },
};

/** Sweet Spot Trainer visual (separate training category). */
export const trainingMedia = { sst: "sstFull" };

/**
 * Inspection video 08 is prepared but NOT released: the owner must review the full clip first.
 * To release: place the approved cut and its poster in public/media/, set src/poster, released: true.
 */
export const inspectionVideo = { released: false, model: "great", source: "08_Great_Source_Video.mp4 (3781)", src: null, poster: null };
