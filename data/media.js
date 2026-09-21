/**
 * Media registry — the code-side counterpart of ASSET_MANIFEST.md.
 * Only owner-supplied source photographs, used for the purpose stated in the owner's manifest
 * (00_READ_FIRST_CLAUDE.md). Production approval of each file is part of the release approval.
 * No generated image, render, rejected crop or substitute racquet is registered here.
 */
import powerFull from "../public/media/power-full-frame.jpg";
import powerHandle from "../public/media/power-throat-handle.jpg";
import buttcap from "../public/media/lion-buttcap.jpg";
import lettering from "../public/media/maximus-lettering.jpg";
import greatHead from "../public/media/great-head-geometry.jpg";
import finish from "../public/media/frames-finish-reference.jpg";

export const media = {
  powerFull: { src: powerFull, model: "power", source: "02_Power_Full_Frame.jpeg (IMG_9629)", purpose: "POWER full view, unstrung" },
  powerHandle: { src: powerHandle, model: "power", source: "03_Power_Handle.jpeg (IMG_9634)", purpose: "POWER throat-to-handle transition" },
  buttcap: { src: buttcap, model: null, source: "04_Lion_Buttcap.jpeg (IMG_9633)", purpose: "Butt cap with lion emblem" },
  lettering: { src: lettering, model: null, source: "05_MAXIMUS_Lettering.jpeg (IMG_9630)", purpose: "Gloss / matte lettering detail" },
  greatHead: { src: greatHead, model: "great", source: "06_Great_Actual_Geometry.jpeg (3780)", purpose: "GREAT head, beam and V-throat geometry (handle cropped; not a full view)" },
  finish: { src: finish, model: null, source: "07_Frames_Finish_Reference.jpeg (IMG_2971)", purpose: "Finish reference; frames not identified by series" },
};

/**
 * Per-series media. `full` = complete racquet view, `details` = construction / handle details.
 * null or [] = not available → typographic tile and an entry in CONTENT_GAPS.md.
 */
export const seriesMedia = {
  great: { card: "greatHead", full: null, details: ["greatHead"] },
  power: { card: "powerFull", full: "powerFull", details: ["powerHandle"] },
  spin: { card: null, full: null, details: [] },
};

/** Inspection video 08 is prepared but NOT released: the owner must review the full clip first. */
export const videoReleased = false;
