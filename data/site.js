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
  locales: ["en", "de", "fr", "es", "it", "pt", "tr", "uk", "ru", "ar", "ja", "ko", "zh"],
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
    ru: { name: "Русский", short: "RU", hrefLang: "ru", ogLocale: "ru_RU", match: ["ru", "be", "kk", "uk-ru"],
      suggest: { text: "Сайт доступен на русском языке.", go: "Перейти на русский", stay: "Остаться на этой версии" } },
    de: { name: "Deutsch", short: "DE", hrefLang: "de", ogLocale: "de_DE", match: ["de"],
      suggest: { text: "Diese Website ist auch auf Deutsch verfügbar.", go: "Auf Deutsch wechseln", stay: "Bei dieser Version bleiben" } },
    fr: { name: "Français", short: "FR", hrefLang: "fr", ogLocale: "fr_FR", match: ["fr"],
      suggest: { text: "Ce site est disponible en français.", go: "Passer en français", stay: "Rester sur cette version" } },
    es: { name: "Español", short: "ES", hrefLang: "es", ogLocale: "es_ES", match: ["es"],
      suggest: { text: "Este sitio está disponible en español.", go: "Cambiar a español", stay: "Permanecer en esta versión" } },
    it: { name: "Italiano", short: "IT", hrefLang: "it", ogLocale: "it_IT", match: ["it"],
      suggest: { text: "Questo sito è disponibile in italiano.", go: "Passa all'italiano", stay: "Resta su questa versione" } },
    zh: { name: "简体中文", short: "中文", hrefLang: "zh-CN", ogLocale: "zh_CN", match: ["zh"],
      suggest: { text: "本网站提供简体中文版本。", go: "切换到简体中文", stay: "保持当前版本" } },
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

/** Grouped header navigation. Keys resolve to translated labels in content/<locale>.js → nav. */
export const navGroups = [
  { key: "racquets", items: ["choose", "racquets", "great", "power", "spin", "precision", "grip", "custom"] },
  { key: "training", items: ["training", "sst", "spot", "methodology"] },
  { key: "gps", href: "gps" },
  { key: "build", href: "build" },
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
