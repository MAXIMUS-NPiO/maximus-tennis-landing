/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/**
 * Confidential-term guard. Some words and figures must never reach the site — names of clients and
 * partners, internal figures, prices and coefficients, an address that is not to be linked. The
 * repository is public, so the guard must not publish them either: it holds only salted hashes and
 * compares the hashes of the words, word pairs and word triples of a text against them. Numbers are
 * read with their group separators removed and ranges with their dash unified, so "7,654,321",
 * "7 654 321" and "7654321" are the same figure. Which terms are guarded is recorded only in the
 * Founder's private records.
 */
import { createHash } from "node:crypto";

const SALT = "maximus.tennis:";
const hash = (s) => createHash("sha256").update(SALT + s).digest("hex").slice(0, 32);
const CONFIDENTIAL = new Set(["ef543788cdc8c677b20ea2b08b6b2eac","fd46bc424f28e264185c013f9871e42a","64affbe640d44388d189273900cdb4b4","889943d6dfbe4729b50494b21765dd52","38e39ab7693a56ef3d7d7f95042d9ba9","aae1cc6d079d88d53aae1314916ce3e8","a40ebf4090f24264235d49c69a69e894","20ef358434fe443241b78890952eabcd","812252594bcaa3e36dce49c45c91a14f","d4efd9dabe9191c2116c518872e44f25","5f1f0ab645a308a0586380b442a3b62a","4585f514c280a4cd3499fd81799f9ccc","f084289aea1c6581860cb319b2806ec7","1dee63991747d515d2692ed10791d82c","48393aa81d681c5800dd76e40d332f2d","04b04c37584aa6980a83d98fadc22280","f2e24a44b1a0192a1a3bdf98a4a2b9ea","6542e15e78948dffec866f662d537577","130f6d7fc6fd21c5a5b933f7bd1e545f","6b127d53c7acb7560fafaaa2ba0335b2"]);
const cache = new Map();

/** The candidates of a text: lower-cased words, figures without separators, and their pairs and triples. */
export function candidates(text) {
  let t = String(text).normalize("NFKC").toLowerCase().replace(/€/g, " eur ");
  for (let i = 0; i < 4; i++) t = t.replace(/(\d)[ ,.  '’](?=\d{3}(?!\d))/g, "$1");
  t = t.replace(/(\d)\s*[–—-]\s*(\d)/g, "$1-$2");
  const words = t.match(/[\p{L}\p{N}]+(?:[.\-][\p{N}]+)*/gu) || [];
  const out = new Set(words);
  for (let i = 0; i + 1 < words.length; i++) {
    out.add(`${words[i]} ${words[i + 1]}`);
    if (i + 2 < words.length) out.add(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
  }
  return out;
}

/** How many guarded terms occur in a text (the terms themselves are not known here). */
export function confidentialHits(text) {
  let hits = 0;
  for (const c of candidates(text)) {
    let hit = cache.get(c);
    if (hit === undefined) { hit = CONFIDENTIAL.has(hash(c)); cache.set(c, hit); }
    if (hit) hits += 1;
  }
  return hits;
}

/** For tests: whether a given term would be caught (hashes it the same way). */
export const isGuarded = (term) => CONFIDENTIAL.has(hash(String(term).toLowerCase()));
