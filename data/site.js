/**
 * Verified site-level data. Strings that are legal identifiers, addresses or brand marks
 * are kept here once and rendered identically in every locale.
 */
export const site = {
  brand: "MAXIMUS",
  brandSystem: "MAXIMUS GPS",
  tagline: "YOUR NAVIGATION IN THE WORLD OF TENNIS",
  gpsMeaning: "GREAT POWER & SPIN",
  email: "gps@maximus.tennis",
  website: "https://maximus.tennis",
  instagram: "https://www.instagram.com/maximus_gps/",
  instagramHandle: "@maximus_gps",
  /**
   * Languages, in the order they appear in the language menu. Adding one means: a line here,
   * a line in content/index.js, and the translated content file. Nothing else in the site
   * needs to change — the menu, the routes, the sitemap, hreflang, the sign-in of the browser
   * language and the checks all read this list.
   *
   *   name     — written in that language itself, as it appears in the menu
   *   short    — the compact code on the menu trigger
   *   hrefLang — the BCP 47 tag used in <html lang>, in hreflang links and in the sitemap
   *   ogLocale — the Open Graph locale
   *   match    — language tags of a visitor's device that select this language
   *   dir      — writing direction; omit for left to right
   */
  // Order of the language menu. Ukrainian sits with the other European languages and Russian
  // before the non-European block, so the two are neither adjacent in the list nor in the
  // same column of the panel. Both placements are geographic; neither is a ranking.
  locales: ["en", "de", "nl", "da", "no", "sv", "fi", "is", "ga", "fr", "ca", "eu", "gl", "es", "pt", "it", "mt", "pl", "cs", "sk", "hu", "sl", "hr", "bs", "sr", "mk", "sq", "ro", "bg", "el", "et", "lv", "lt", "uk", "be", "tr", "az", "uz", "kk", "ru", "ar", "hi", "id", "fil", "th", "ja", "ko", "zh"],
  defaultLocale: "en",
  localeMeta: {
    en: { name: "English", short: "EN", hrefLang: "en", ogLocale: "en_GB", match: ["en"],
      suggest: { text: "This site is available in English.", go: "Switch to English", stay: "Stay on this version" } },
    pt: { name: "Português", short: "PT", hrefLang: "pt-BR", ogLocale: "pt_BR", match: ["pt"],
      suggest: { text: "Este site está disponível em português.", go: "Mudar para português", stay: "Continuar nesta versão" } },
    ar: { name: "العربية", short: "AR", hrefLang: "ar", ogLocale: "ar_AE", match: ["ar"], dir: "rtl",
      suggest: { text: "هذا الموقع متاح باللغة العربية.", go: "التحويل إلى العربية", stay: "البقاء على هذه النسخة" } },
    ja: { name: "日本語", short: "日本語", hrefLang: "ja", ogLocale: "ja_JP", match: ["ja"],
      suggest: { text: "このサイトは日本語でもご覧いただけます。", go: "日本語に切り替える", stay: "このまま表示する" } },
    ko: { name: "한국어", short: "KO", hrefLang: "ko", ogLocale: "ko_KR", match: ["ko"],
      suggest: { text: "이 사이트는 한국어로도 제공됩니다.", go: "한국어로 보기", stay: "현재 버전 유지" } },
    tr: { name: "Türkçe", short: "TR", hrefLang: "tr", ogLocale: "tr_TR", match: ["tr"],
      suggest: { text: "Bu site Türkçe olarak da mevcut.", go: "Türkçeye geç", stay: "Bu sürümde kal" } },
    uk: { name: "Українська", short: "UA", hrefLang: "uk", ogLocale: "uk_UA", match: ["uk"],
      suggest: { text: "Сайт доступний українською.", go: "Перейти на українську", stay: "Залишитися на цій версії" } },
    ru: { name: "Русский", short: "RU", hrefLang: "ru", ogLocale: "ru_RU", match: ["ru", "uk-ru"],
      suggest: { text: "Сайт доступен на русском языке.", go: "Перейти на русский", stay: "Остаться на этой версии" } },
    de: { name: "Deutsch", short: "DE", hrefLang: "de", ogLocale: "de_DE", match: ["de"],
      suggest: { text: "Diese Website ist auch auf Deutsch verfügbar.", go: "Auf Deutsch wechseln", stay: "Bei dieser Version bleiben" } },
    fr: { name: "Français", short: "FR", hrefLang: "fr", ogLocale: "fr_FR", match: ["fr"],
      suggest: { text: "Ce site est disponible en français.", go: "Passer en français", stay: "Rester sur cette version" } },
    es: { name: "Español", short: "ES", hrefLang: "es", ogLocale: "es_ES", match: ["es"],
      suggest: { text: "Este sitio está disponible en español.", go: "Cambiar a español", stay: "Permanecer en esta versión" } },
    it: { name: "Italiano", short: "IT", hrefLang: "it", ogLocale: "it_IT", match: ["it"],
      suggest: { text: "Questo sito è disponibile in italiano.", go: "Passa all'italiano", stay: "Resta su questa versione" } },
    nl: { name: "Nederlands", short: "NL", hrefLang: "nl", ogLocale: "nl_NL", match: ["nl"],
      suggest: { text: "Deze website is ook in het Nederlands beschikbaar.", go: "Overschakelen naar Nederlands", stay: "Op deze versie blijven" } },
    hr: { name: "Hrvatski", short: "HR", hrefLang: "hr", ogLocale: "hr_HR", match: ["hr"],
      suggest: { text: "Ova je stranica dostupna i na hrvatskom.", go: "Prijeđi na hrvatski", stay: "Ostani na ovoj verziji" } },
    el: { name: "Ελληνικά", short: "EL", hrefLang: "el", ogLocale: "el_GR", match: ["el"],
      suggest: { text: "Αυτός ο ιστότοπος είναι διαθέσιμος και στα ελληνικά.", go: "Αλλαγή στα ελληνικά", stay: "Παραμονή σε αυτήν την έκδοση" } },
    hi: { name: "हिन्दी", short: "HI", hrefLang: "hi", ogLocale: "hi_IN", match: ["hi"],
      suggest: { text: "यह साइट हिन्दी में भी उपलब्ध है।", go: "हिन्दी में देखें", stay: "इसी संस्करण पर रहें" } },
    id: { name: "Bahasa Indonesia", short: "ID", hrefLang: "id", ogLocale: "id_ID", match: ["id", "in"],
      suggest: { text: "Situs ini juga tersedia dalam bahasa Indonesia.", go: "Beralih ke bahasa Indonesia", stay: "Tetap di versi ini" } },
    // Filipino: Google accepts only ISO 639-1 codes in hreflang, and Filipino has none of its own, so
    // <html lang>, hreflang and the sitemap use "tl" (Tagalog, the basis of Filipino); the path stays /fil.
    fil: { name: "Filipino", short: "FIL", hrefLang: "tl", ogLocale: "tl_PH", match: ["fil", "tl"],
      suggest: { text: "Mayroon ding bersyong Filipino ang site na ito.", go: "Lumipat sa Filipino", stay: "Manatili sa bersyong ito" } },
    th: { name: "ไทย", short: "TH", hrefLang: "th", ogLocale: "th_TH", match: ["th"],
      suggest: { text: "เว็บไซต์นี้มีให้บริการเป็นภาษาไทยด้วย", go: "เปลี่ยนเป็นภาษาไทย", stay: "อยู่ในเวอร์ชันนี้ต่อ" } },
    az: { name: "Azərbaycan", short: "AZ", hrefLang: "az", ogLocale: "az_AZ", match: ["az"],
      suggest: { text: "Bu sayt Azərbaycan dilində də mövcuddur.", go: "Azərbaycan dilinə keç", stay: "Bu versiyada qal" } },
    uz: { name: "Oʻzbekcha", short: "UZ", hrefLang: "uz", ogLocale: "uz_UZ", match: ["uz"],
      suggest: { text: "Bu sayt oʻzbek tilida ham mavjud.", go: "Oʻzbek tiliga oʻtish", stay: "Shu versiyada qolish" } },
    kk: { name: "Қазақша", short: "KK", hrefLang: "kk", ogLocale: "kk_KZ", match: ["kk"],
      suggest: { text: "Бұл сайт қазақ тілінде де қолжетімді.", go: "Қазақ тіліне ауысу", stay: "Осы нұсқада қалу" } },
    pl: { name: "Polski", short: "PL", hrefLang: "pl", ogLocale: "pl_PL", match: ["pl"],
      suggest: { text: "Ta strona jest dostępna po polsku.", go: "Przejdź na polski", stay: "Zostań na tej wersji" } },
    hu: { name: "Magyar", short: "HU", hrefLang: "hu", ogLocale: "hu_HU", match: ["hu"],
      suggest: { text: "Ez az oldal magyarul is elérhető.", go: "Váltás magyarra", stay: "Maradok ezen a verzión" } },
    sk: { name: "Slovenčina", short: "SK", hrefLang: "sk", ogLocale: "sk_SK", match: ["sk"],
      suggest: { text: "Táto stránka je dostupná aj v slovenčine.", go: "Prepnúť na slovenčinu", stay: "Zostať na tejto verzii" } },
    sr: { name: "Srpski", short: "SR", hrefLang: "sr-Latn", ogLocale: "sr_RS", match: ["sr"],
      suggest: { text: "Ovaj sajt je dostupan na srpskom.", go: "Pređi na srpski", stay: "Ostani na ovoj verziji" } },
    ro: { name: "Română", short: "RO", hrefLang: "ro", ogLocale: "ro_RO", match: ["ro"],
      suggest: { text: "Acest site este disponibil în română.", go: "Comută la română", stay: "Rămâi pe această versiune" } },
    bg: { name: "Български", short: "BG", hrefLang: "bg", ogLocale: "bg_BG", match: ["bg"],
      suggest: { text: "Този сайт е достъпен на български.", go: "Превключи на български", stay: "Остани на тази версия" } },
    sv: { name: "Svenska", short: "SV", hrefLang: "sv", ogLocale: "sv_SE", match: ["sv"],
      suggest: { text: "Den här webbplatsen finns på svenska.", go: "Byt till svenska", stay: "Stanna på den här versionen" } },
    no: { name: "Norsk", short: "NO", hrefLang: "nb", ogLocale: "nb_NO", match: ["no", "nb", "nn"],
      suggest: { text: "Dette nettstedet er tilgjengelig på norsk.", go: "Bytt til norsk", stay: "Bli på denne versjonen" } },
    zh: { name: "简体中文", short: "中文", hrefLang: "zh-CN", ogLocale: "zh_CN", match: ["zh"],
      suggest: { text: "本网站提供简体中文版本。", go: "切换到简体中文", stay: "保持当前版本" } },
    cs: { name: "Čeština", short: "CS", hrefLang: "cs", ogLocale: "cs_CZ", match: ["cs"],
      suggest: { text: "Tento web je k dispozici v češtině.", go: "Přepnout do češtiny", stay: "Zůstat na této verzi" } },
    sl: { name: "Slovenščina", short: "SL", hrefLang: "sl", ogLocale: "sl_SI", match: ["sl"],
      suggest: { text: "To spletno mesto je na voljo v slovenščini.", go: "Preklopi na slovenščino", stay: "Ostani na tej različici" } },
    bs: { name: "Bosanski", short: "BS", hrefLang: "bs", ogLocale: "bs_BA", match: ["bs"],
      suggest: { text: "Ova stranica je dostupna na bosanskom.", go: "Prebaci na bosanski", stay: "Ostani na ovoj verziji" } },
    mk: { name: "Македонски", short: "MK", hrefLang: "mk", ogLocale: "mk_MK", match: ["mk"],
      suggest: { text: "Оваа страница е достапна на македонски.", go: "Префрли на македонски", stay: "Остани на оваа верзија" } },
    sq: { name: "Shqip", short: "SQ", hrefLang: "sq", ogLocale: "sq_AL", match: ["sq"],
      suggest: { text: "Kjo faqe është e disponueshme në shqip.", go: "Kalo në shqip", stay: "Qëndro në këtë version" } },
    da: { name: "Dansk", short: "DA", hrefLang: "da", ogLocale: "da_DK", match: ["da"],
      suggest: { text: "Dette website findes også på dansk.", go: "Skift til dansk", stay: "Bliv på denne version" } },
    fi: { name: "Suomi", short: "FI", hrefLang: "fi", ogLocale: "fi_FI", match: ["fi"],
      suggest: { text: "Tämä sivusto on saatavilla myös suomeksi.", go: "Vaihda suomeksi", stay: "Pysy tässä versiossa" } },
    is: { name: "Íslenska", short: "IS", hrefLang: "is", ogLocale: "is_IS", match: ["is"],
      suggest: { text: "Þessi vefur er einnig á íslensku.", go: "Skipta yfir á íslensku", stay: "Vera áfram á þessari útgáfu" } },
    ga: { name: "Gaeilge", short: "GA", hrefLang: "ga", ogLocale: "ga_IE", match: ["ga"],
      suggest: { text: "Tá an suíomh seo ar fáil as Gaeilge.", go: "Athraigh go Gaeilge", stay: "Fan leis an leagan seo" } },
    et: { name: "Eesti", short: "ET", hrefLang: "et", ogLocale: "et_EE", match: ["et"],
      suggest: { text: "See veebisait on saadaval ka eesti keeles.", go: "Lülitu eesti keelele", stay: "Jää sellele versioonile" } },
    lv: { name: "Latviešu", short: "LV", hrefLang: "lv", ogLocale: "lv_LV", match: ["lv"],
      suggest: { text: "Šī vietne ir pieejama arī latviski.", go: "Pārslēgties uz latviešu valodu", stay: "Palikt šajā versijā" } },
    lt: { name: "Lietuvių", short: "LT", hrefLang: "lt", ogLocale: "lt_LT", match: ["lt"],
      suggest: { text: "Ši svetainė taip pat prieinama lietuvių kalba.", go: "Perjungti į lietuvių kalbą", stay: "Likti šioje versijoje" } },
    mt: { name: "Malti", short: "MT", hrefLang: "mt", ogLocale: "mt_MT", match: ["mt"],
      suggest: { text: "Dan is-sit huwa disponibbli bil-Malti.", go: "Aqleb għall-Malti", stay: "Ibqa\u2019 f\u2019din il-verżjoni" } },
    ca: { name: "Català", short: "CA", hrefLang: "ca", ogLocale: "ca_ES", match: ["ca"],
      suggest: { text: "Aquest lloc està disponible en català.", go: "Canvia al català", stay: "Continua en aquesta versió" } },
    eu: { name: "Euskara", short: "EU", hrefLang: "eu", ogLocale: "eu_ES", match: ["eu"],
      suggest: { text: "Webgune hau euskaraz ere eskuragarri dago.", go: "Aldatu euskarara", stay: "Jarraitu bertsio honetan" } },
    gl: { name: "Galego", short: "GL", hrefLang: "gl", ogLocale: "gl_ES", match: ["gl"],
      suggest: { text: "Este sitio está dispoñible en galego.", go: "Cambiar ao galego", stay: "Continuar nesta versión" } },
    be: { name: "Беларуская", short: "BY", hrefLang: "be", ogLocale: "be_BY", match: ["be"],
      suggest: { text: "Сайт даступны па-беларуску.", go: "Перайсці на беларускую", stay: "Застацца на гэтай версіі" } },
  },
};

/** Legal and organisational identities. Public brand = MAXIMUS / MAXIMUS GPS. */
export const entities = {
  institutional: {
    name: "MAXIMUS INVESTMENT BUSINESS CLUB NPIO (DIFC)",
    licence: "OL11672",
    registration: "SR-588047",
    email: "info@maximus.ltd",
    jurisdiction: "DIFC, Dubai, United Arab Emirates",
  },
  equipment: {
    name: "MAXIMUS SPORTS EQUIPMENT TRADING L.L.C",
    licence: "TL 623813",
    vatTrn: "100011596200003",
    address: "Office 2, The Curve, Sheikh Zayed Road, Al Quoz Ind 2, Bur Dubai, P.O. Box 49363, Dubai, United Arab Emirates",
  },
  ip: {
    name: "MAXIMUS VEGAS L.L.C-FZ",
    licence: "2310630.01",
    jurisdiction: "Meydan Free Zone, Dubai, United Arab Emirates",
  },
  stewardship: "House of Maximus",
  control: "MIPA",
};

/** Route table — one place for every public destination. Paths are locale-relative. */
export const routes = {
  home: "",
  racquets: "/racquets",
  great: "/racquets/great",
  power: "/racquets/power",
  spin: "/racquets/spin",
  precision: "/precision",
  grip: "/grip-architecture",
  custom: "/custom-engineering",
  training: "/training",
  sst: "/training/sweet-spot-trainer",
  spot: "/training/spot-trainer",
  methodology: "/training/methodology",
  gps: "/gps",
  build: "/build",
  familyPlan: "/family-plan",
  choose: "/choose",
  experience: "/experience",
  engineering: "/engineering",
  ecosystem: "/ecosystem",
  brands: "/personal-brands",
  families: "/families",
  owners: "/owners",
  network: "/sports-network",
  partnerships: "/partnerships",
  coaches: "/partnerships/coaches",
  clubs: "/partnerships/clubs-academies",
  distribution: "/partnerships/distribution",
  strategic: "/partnerships/strategic",
  institutional: "/partnerships/institutional",
  contact: "/contact",
  legal: "/legal",
  privacy: "/privacy",
  terms: "/terms",
};

/**
 * Grouped header navigation. Keys resolve to translated labels in content/<locale>.js → nav.
 * Family Plan is a category of its own on the bar, as the Founder asked, placed second, next to
 * the racquets. To keep the bar clear of the lockup in all forty-six languages, the configurator
 * moved into the Racquets menu, beside "Help me choose": both are ways of arriving at a racquet.
 * Measured, not guessed — see scripts/check-header.mjs.
 */
export const navGroups = [
  { key: "racquets", items: ["choose", "build", "racquets", "great", "power", "spin", "precision", "grip", "custom"] },
  { key: "familyPlan", href: "familyPlan" },
  { key: "training", items: ["training", "sst", "spot", "methodology"] },
  { key: "gps", href: "gps" },
  { key: "ecosystem", items: ["ecosystem", "engineering", "experience", "brands", "families", "owners", "network"] },
  { key: "partnerships", items: ["partnerships", "coaches", "clubs", "distribution", "strategic", "institutional"] },
  { key: "contact", href: "contact" },
];

/**
 * Public status vocabulary (rendered via content strings):
 *   current      — exists and is offered now
 *   agreement    — available by written agreement / on request
 *   development  — in active development (only where confirmed)
 *   concept      — defined as a concept; no implementation is represented
 */
export const STATUS = {
  CURRENT: "current",
  AGREEMENT: "agreement",
  DEVELOPMENT: "development",
  CONCEPT: "concept",
};

/** Ecosystem nodes — every node has a page, an honest status and a next action. */
export const ecosystemNodes = [
  { id: "engineering", status: STATUS.CURRENT, href: "engineering" },
  { id: "precision", status: STATUS.CURRENT, href: "precision" },
  { id: "training", status: STATUS.CURRENT, href: "training" },
  { id: "development", status: STATUS.AGREEMENT, href: "methodology" },
  { id: "identity", status: STATUS.AGREEMENT, href: "brands" },
  { id: "owners", status: STATUS.CONCEPT, href: "owners" },
  { id: "mipa", status: STATUS.CURRENT, href: "legal" },
  { id: "digital", status: STATUS.CONCEPT, href: "owners" },
  { id: "licensing", status: STATUS.AGREEMENT, href: "brands" },
  { id: "families", status: STATUS.AGREEMENT, href: "families" },
  { id: "network", status: STATUS.AGREEMENT, href: "network" },
  { id: "market", status: STATUS.AGREEMENT, href: "partnerships" },
  { id: "institutional", status: STATUS.AGREEMENT, href: "institutional" },
  { id: "extensions", status: STATUS.CONCEPT, href: "racquets" },
];

/** Request purposes accepted by the enquiry workflow. */
export const requestPurposes = [
  "selection",
  "product",
  "fitting",
  "technical",
  "coach",
  "club",
  "distribution",
  "brand",
  "family",
  "institutional",
  "strategic",
  "owner",
  "network",
  "general",
];
