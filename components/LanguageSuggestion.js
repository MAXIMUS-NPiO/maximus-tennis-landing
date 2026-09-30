"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { site } from "../data/site";
import { switchLocale } from "../lib/paths";
import { matchLocale } from "../lib/language";
import { allowedQuery } from "./LocaleSwitcher";

const KEY = "mx-lang-choice";

/**
 * Offers the visitor's own language instead of forcing it.
 *
 * A link that names a language always opens in that language — for the visitor it was sent to
 * and for a search engine. When the device asks for another language that this site has, a
 * single line appears at the top offering it, written in that language. The answer is kept in
 * this browser only, and the bar never returns once answered.
 */
export default function LanguageSuggestion({ locale }) {
  const pathname = usePathname() || "/";
  const [suggested, setSuggested] = useState(null);

  useEffect(() => {
    let decided = null;
    try {
      decided = window.localStorage.getItem(KEY);
    } catch {
      /* private mode: the bar simply shows again next time */
    }
    if (decided) return;
    const wanted = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language]).filter(Boolean);
    // The same matcher the server uses, so the bar can never offer a language the server would not.
    const best = matchLocale(wanted);
    if (best && best !== locale) setSuggested(best);
  }, [locale, pathname]);

  if (!suggested) return null;
  const meta = site.localeMeta[suggested];
  const remember = (value) => {
    try {
      window.localStorage.setItem(KEY, value);
    } catch {
      /* nothing to remember in private mode */
    }
  };

  return (
    <div className="lang-suggest" role="region" aria-label={meta.name}>
      <div className="shell lang-suggest-inner">
        <p lang={meta.hrefLang}>{meta.suggest.text}</p>
        <div className="lang-suggest-actions">
          <a
            className="btn btn-small"
            lang={meta.hrefLang}
            href={`${switchLocale(pathname, suggested)}${typeof window === "undefined" ? "" : allowedQuery(window.location.search)}`}
            onClick={() => remember(suggested)}
          >
            {meta.suggest.go}
          </a>
          <button type="button" className="lang-suggest-stay" lang={meta.hrefLang} onClick={() => { remember(locale); setSuggested(null); }}>
            {meta.suggest.stay}
          </button>
        </div>
      </div>
    </div>
  );
}
