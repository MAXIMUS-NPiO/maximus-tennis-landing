/**
 * Content registry. One line per language, next to its entry in data/site.js → localeMeta.
 * Static imports are required so the bundler can include each file.
 */
import en from "./en";
import ru from "./ru";
import zh from "./zh";

export const bundles = { en, ru, zh };
export default bundles;
