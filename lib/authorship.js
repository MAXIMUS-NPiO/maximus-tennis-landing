/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/**
 * Authorship — one source for every place the site names its author (Founder, 10 October 2026:
 * authorship is added by default, everywhere, always, without being asked for).
 *
 * The notice names the person, not the brand: under the Berne Convention (Art. 15(1)) the person
 * whose name appears on a work in the usual manner is presumed to be its author. Everything that
 * prints a notice — the footer of every page, the calculators, the structured data, the image
 * metadata, the code headers and the bundle banner — takes it from here, and
 * scripts/check-authorship.mjs refuses a release in which any of them is missing.
 */
import { site } from "../data/site.js";

export const AUTHOR = "Maximus Kiriyakulov";
export const FIRST_YEAR = 2026;

/**
 * The year of the build, fixed into the bundle by next.config.mjs, so that the server render and
 * the browser agree on it (a year read from the visitor's clock would differ after New Year and
 * break hydration). Outside a Next build it falls back to the first year.
 */
const BUILD_YEAR = Number(process.env.NEXT_PUBLIC_BUILD_YEAR) || FIRST_YEAR;

/** "2026", or "2026–2027" once the site is built in a later year. */
export function copyrightYears(year = BUILD_YEAR) {
  return year > FIRST_YEAR ? `${FIRST_YEAR}–${year}` : String(FIRST_YEAR);
}

/** The notice itself, in the form used everywhere: © 2026 Maximus Kiriyakulov. */
export function notice(year) {
  return `© ${copyrightYears(year)} ${AUTHOR}`;
}

/** The full English line used in metadata, image files and code: notice + all rights reserved. */
export function noticeLine(year) {
  return `${notice(year)}. All rights reserved.`;
}

/** Where the rights statement lives (the terms page carries it in every language). */
export function rightsUrl(locale = "en") {
  return `${site.website}/${locale}/terms#copyright`;
}

/** Where permission is asked for. */
export function permissionUrl(locale = "en") {
  return `${site.website}/${locale}/contact`;
}

/** Schema.org person node for the author. */
export function authorNode() {
  return { "@type": "Person", name: AUTHOR };
}
