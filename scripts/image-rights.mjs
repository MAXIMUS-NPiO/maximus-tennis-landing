/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/**
 * Writes the author's rights into every image the site serves from its own files (public/ and the
 * app icons), inside the file itself: EXIF Artist and Copyright, XMP creator, rights, "copyrighted"
 * flag and rights statement, and for JPEG the IPTC creator and notice. The pixels are not touched:
 * ExifTool rewrites metadata only, without re-encoding.
 *
 * Usage: node scripts/image-rights.mjs          (needs ExifTool: brew install exiftool,
 *                                                apt-get install libimage-exiftool-perl)
 * scripts/check-authorship.mjs refuses a release with any image that lacks the notice, so a new
 * picture cannot reach the site without it. Images written by scripts/photo-glow.mjs carry it already.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { AUTHOR, noticeLine, rightsUrl } from "../lib/authorship.js";

const root = process.cwd();
const IMAGE = /\.(jpe?g|png|webp|avif)$/i;
const walk = (d) => readdirSync(d).flatMap((f) => {
  const p = path.join(d, f);
  return statSync(p).isDirectory() ? walk(p) : IMAGE.test(f) ? [p] : [];
});
export const imageFiles = () => [...walk(path.join(root, "public")), ...walk(path.join(root, "app")).filter((p) => !p.includes(`${path.sep}api${path.sep}`))];

/** True when the file's own EXIF names the author. */
export async function carriesRights(file) {
  try {
    const { exif } = await sharp(file).metadata();
    return Boolean(exif && exif.includes(Buffer.from(AUTHOR)));
  } catch {
    return false;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const year = new Date().getUTCFullYear();
  const line = noticeLine(year);
  const todo = [];
  for (const f of imageFiles()) if (!(await carriesRights(f))) todo.push(f);
  if (!todo.length) {
    console.log(`image rights: all ${imageFiles().length} images already carry the notice`);
    process.exit(0);
  }
  const args = [
    "-q", "-q", "-overwrite_original", "-m",
    `-EXIF:Artist=${AUTHOR}`, `-EXIF:Copyright=${line}`,
    `-XMP-dc:Creator=${AUTHOR}`, `-XMP-dc:Rights=${line}`,
    "-XMP-xmpRights:Marked=True", `-XMP-xmpRights:WebStatement=${rightsUrl("en")}`,
    `-XMP-photoshop:Credit=${AUTHOR}`,
  ];
  const jpeg = todo.filter((f) => /\.jpe?g$/i.test(f));
  const other = todo.filter((f) => !/\.jpe?g$/i.test(f));
  try {
    if (jpeg.length) execFileSync("exiftool", [...args, `-IPTC:By-line=${AUTHOR}`, `-IPTC:CopyrightNotice=${line}`, `-IPTC:Credit=${AUTHOR}`, "-charset", "iptc=UTF8", ...jpeg], { stdio: "inherit" });
    if (other.length) execFileSync("exiftool", [...args, ...other], { stdio: "inherit" });
  } catch (e) {
    console.error("image rights: ExifTool is required (brew install exiftool / apt-get install libimage-exiftool-perl)");
    process.exit(1);
  }
  const still = [];
  for (const f of todo) if (!(await carriesRights(f))) still.push(path.relative(root, f));
  if (still.length) { console.error(`image rights: not written for ${still.length}: ${still.join(", ")}`); process.exit(1); }
  console.log(`image rights: notice written into ${todo.length} images (${jpeg.length} JPEG, ${other.length} other); pixels unchanged`);
}
