/**
 * Media registry — the code-side counterpart of ASSET_MANIFEST.md.
 *
 * Owner instruction 22–23 September 2026: the site shows the owner's own product visual sets.
 * The white-background source photographs were withdrawn; renders generated in this repository
 * are banned and removed. Every file below comes from the owner's sets, cropped only to remove
 * the internal MIPA record line and, on the SPIN set, the specification strip whose values
 * (balance, tension, string pattern) are not confirmed data. Weight and series labels are kept
 * and match data/products.js.
 *
 * Sets received: SPIN (1_1, 1_2), Sweet Spot Trainer (2_1, 2_2). GREAT and POWER: awaited.
 */
import spinVisual from "../public/media/spin-visual.jpg";
import spinHead from "../public/media/spin-head.jpg";
import handleLion from "../public/media/handle-lion.jpg";
import engraving from "../public/media/engraving.jpg";
import lettering from "../public/media/lettering.jpg";
import spin239 from "../public/media/spin-239.jpg";
import spin250 from "../public/media/spin-250.jpg";
import spin260 from "../public/media/spin-260.jpg";
import spin270 from "../public/media/spin-270.jpg";
import spin283 from "../public/media/spin-283.jpg";
import spin294 from "../public/media/spin-294.jpg";
import spin315 from "../public/media/spin-315.jpg";
import spin325 from "../public/media/spin-325.jpg";
import spin339 from "../public/media/spin-339.jpg";
import spin355 from "../public/media/spin-355.jpg";
import sstSystem from "../public/media/sst-system.jpg";
import sst270 from "../public/media/sst-270.jpg";
import sst285 from "../public/media/sst-285.jpg";
import sst300 from "../public/media/sst-300.jpg";
import sst400 from "../public/media/sst-400.jpg";
import sstShafts from "../public/media/sst-shafts.jpg";
import sstGrips from "../public/media/sst-grips.jpg";
import sstButtcaps from "../public/media/sst-buttcaps.jpg";

const owner = (src, model, purpose) => ({ src, model, kind: "owner", purpose });

export const media = {
  spinVisual: owner(spinVisual, "spin", "SPIN: head, lettering, grip and lion butt cap"),
  spinHead: owner(spinHead, "spin", "SPIN head and string bed"),
  handleLion: owner(handleLion, "spin", "Throat, grip and butt cap with the lion mark"),
  engraving: owner(engraving, "spin", "Silver personalisation engraving on the shaft"),
  lettering: owner(lettering, "spin", "Gloss MAXIMUS lettering on the matte frame"),
  spin239: owner(spin239, "spin", "SPIN 239 g"),
  spin250: owner(spin250, "spin", "SPIN 250 g"),
  spin260: owner(spin260, "spin", "SPIN 260 g"),
  spin270: owner(spin270, "spin", "SPIN 270 g"),
  spin283: owner(spin283, "spin", "SPIN 283 g"),
  spin294: owner(spin294, "spin", "SPIN 294 g"),
  spin315: owner(spin315, "spin", "SPIN 315 g"),
  spin325: owner(spin325, "spin", "SPIN 325 g"),
  spin339: owner(spin339, "spin", "SPIN 339 g"),
  spin355: owner(spin355, "spin", "SPIN 355 g"),
  sstSystem: owner(sstSystem, "sst", "Sweet Spot Trainer four-racquet system"),
  sst270: owner(sst270, "sst", "Sweet Spot Trainer 270 g / 330 mm"),
  sst285: owner(sst285, "sst", "Sweet Spot Trainer 285 g / 325 mm"),
  sst300: owner(sst300, "sst", "Sweet Spot Trainer 300 g / 325 mm"),
  sst400: owner(sst400, "sst", "Sweet Spot Trainer 400 g / 320 mm"),
  sstShafts: owner(sstShafts, "sst", "Sweet Spot Trainer shafts with the MAXIMUS lettering"),
  sstGrips: owner(sstGrips, "sst", "Sweet Spot Trainer grips and butt caps"),
  sstButtcaps: owner(sstButtcaps, "sst", "Sweet Spot Trainer four-racquet system, butt caps"),
};

/** SPIN weight gallery: every weight shown is in the confirmed SPIN matrix. */
export const spinWeights = ["spin239", "spin250", "spin260", "spin270", "spin283", "spin294", "spin315", "spin325", "spin339", "spin355"];

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
