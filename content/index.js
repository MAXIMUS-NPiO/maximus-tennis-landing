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
import nl from "./nl";
import hr from "./hr";
import el from "./el";
import hi from "./hi";
import id from "./id";
import az from "./az";
import uz from "./uz";
import kk from "./kk";
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
import cs from "./cs";
import sl from "./sl";
import bs from "./bs";
import mk from "./mk";
import sq from "./sq";
import da from "./da";
import fi from "./fi";
import isl from "./is";
import ga from "./ga";
import et from "./et";
import lv from "./lv";
import lt from "./lt";
import mt from "./mt";
import ca from "./ca";
import eu from "./eu";
import gl from "./gl";
import be from "./be";

export const bundles = { en, de, nl, fr, es, it, pt, pl, hu, sk, hr, sr, ro, bg, el, sv, no, tr, az, uz, kk, uk, ru, ar, hi, id, ja, ko, zh, cs, sl, bs, mk, sq, da, fi, is: isl, ga, et, lv, lt, mt, ca, eu, gl, be };
export default bundles;
