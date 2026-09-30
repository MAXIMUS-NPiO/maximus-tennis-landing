/**
 * Content registry. One line per language, next to its entry in data/site.js → localeMeta.
 * Static imports are required so the bundler can include each file.
 */
import en from "./en";
import de from "./de";
import fr from "./fr";
import es from "./es";
import it from "./it";
import ru from "./ru";
import zh from "./zh";

export const bundles = { en, de, fr, es, it, ru, zh };
export default bundles;
