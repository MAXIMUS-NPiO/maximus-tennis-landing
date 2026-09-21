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
  store: "https://maximussports.ae/tennis/racquets/maximus/",
  locales: ["en", "ru", "zh"],
  defaultLocale: "en",
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
  { key: "racquets", items: ["racquets", "great", "power", "spin", "precision", "grip", "custom"] },
  { key: "training", items: ["training", "sst", "spot", "methodology"] },
  { key: "gps", href: "gps" },
  { key: "build", href: "build" },
  { key: "ecosystem", items: ["ecosystem", "engineering", "experience", "brands", "families", "owners", "network"] },
  { key: "partnerships", items: ["partnerships", "coaches", "clubs", "distribution", "strategic", "institutional"] },
  { key: "contact", href: "contact" },
];

/** Public status vocabulary for ecosystem nodes and services (rendered via content strings). */
export const STATUS = {
  AVAILABLE: "available",
  REQUEST: "request",
  PLANNED: "planned",
  DIRECTION: "direction",
  AGREEMENT: "agreement",
};

/** Ecosystem nodes — every node has a page, a status and a next action. */
export const ecosystemNodes = [
  { id: "engineering", status: STATUS.AVAILABLE, href: "engineering" },
  { id: "precision", status: STATUS.AVAILABLE, href: "precision" },
  { id: "training", status: STATUS.AVAILABLE, href: "training" },
  { id: "development", status: STATUS.REQUEST, href: "methodology" },
  { id: "identity", status: STATUS.REQUEST, href: "brands" },
  { id: "owners", status: STATUS.PLANNED, href: "owners" },
  { id: "mipa", status: STATUS.AVAILABLE, href: "legal" },
  { id: "digital", status: STATUS.DIRECTION, href: "owners" },
  { id: "licensing", status: STATUS.AGREEMENT, href: "brands" },
  { id: "families", status: STATUS.REQUEST, href: "families" },
  { id: "network", status: STATUS.REQUEST, href: "network" },
  { id: "market", status: STATUS.REQUEST, href: "partnerships" },
  { id: "institutional", status: STATUS.REQUEST, href: "institutional" },
  { id: "extensions", status: STATUS.DIRECTION, href: "racquets" },
];

/** Request purposes accepted by the enquiry workflow. */
export const requestPurposes = [
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
