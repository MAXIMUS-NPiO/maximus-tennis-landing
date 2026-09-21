/**
 * Browser storage boundary. Only an explicit allowlist of structural, non-personal fields is ever
 * written: no names, contacts, free text, engraving text or information about children.
 * Every access is wrapped: storage may be unavailable (private mode, blocked, previews).
 */
export const STORAGE_KEYS = {
  config: "mx.cfg.v2", // configurator: enums and numeric selections only
  gps: "mx.gps.v2", // GPS: enum answers only
  attribution: "mx.attr", // landing path, locale, UTM (click IDs only with analytics consent)
  conversions: "mx.conv", // hashed request ids already reported to analytics (dedupe)
  consent: "mx.consent", // localStorage: "granted" | "denied"
};

function area(kind) {
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export function readJson(key, kind = "session") {
  try {
    const s = area(kind);
    const raw = s ? s.getItem(key) : null;
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeJson(key, value, kind = "session") {
  try {
    const s = area(kind);
    if (s) s.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable — state stays in memory */
  }
}

export function remove(key, kind = "session") {
  try {
    const s = area(kind);
    if (s) s.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** Keeps only allowlisted keys whose values pass their validator. */
export function pick(obj, validators) {
  const out = {};
  if (!obj || typeof obj !== "object") return out;
  for (const [k, ok] of Object.entries(validators)) {
    if (obj[k] !== undefined && ok(obj[k])) out[k] = obj[k];
  }
  return out;
}
