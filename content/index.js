/**
 * Content registry. One line per language, next to its entry in data/site.js → localeMeta.
 * Static imports are required so the bundler can include each file.
 */
import en from "./en";
import de from "./de";
import fr from "./fr";
import es from "./es";
import it from "./it";
import pt from "./pt";
import pl from "./pl";
import hu from "./hu";
import sk from "./sk";
import sr from "./sr";
import ro from "./ro";
import bg from "./bg";
import sv from "./sv";
import no from "./no";
import tr from "./tr";
import uk from "./uk";
import ru from "./ru";
import ar from "./ar";
import ja from "./ja";
import ko from "./ko";
import zh from "./zh";

export const bundles = { en, de, fr, es, it, pt, pl, hu, sk, sr, ro, bg, sv, no, tr, uk, ru, ar, ja, ko, zh };
export default bundles;
