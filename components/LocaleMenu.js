"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { switchLocale } from "../lib/paths";
import { site } from "../data/site";
import { allowedQuery } from "./LocaleSwitcher";

/**
 * Language menu — one control in the header at every width, phone included.
 *
 * It is a menu rather than a row of buttons so that it stays the same size as languages are
 * added: the trigger shows the current language, the panel lists every language by its own
 * name. Nothing about it depends on the number of languages except the height of the panel,
 * which scrolls. The list comes from data/site.js.
 */
export default function LocaleMenu({ locale, label = "Language" }) {
  const pathname = usePathname() || "/";
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const btnRef = useRef(null);
  const panelId = useId();

  useEffect(() => {
    setQuery(allowedQuery(window.location.search));
  }, [pathname]);

  const close = useCallback((focusBack) => {
    setOpen(false);
    if (focusBack && btnRef.current) btnRef.current.focus();
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(true); } };
    const onDown = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) close(false); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", onDown); };
  }, [open, close]);

  const meta = site.localeMeta;
  const current = meta[locale] || { short: String(locale).toUpperCase(), name: locale, hrefLang: locale };
  const target = (l) => `${switchLocale(pathname, l)}${query}`;
  // Re-read at interaction time: a page may have consumed and removed parameters from the URL.
  const refresh = (e, l) => {
    e.currentTarget.href = `${switchLocale(window.location.pathname, l)}${allowedQuery(window.location.search)}`;
  };

  return (
    <div className="lang-menu" ref={rootRef}>
      <button
        type="button"
        ref={btnRef}
        className="lang-trigger"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`${label}: ${current.name}`}
        onClick={() => setOpen((v) => !v)}
      >
        <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" focusable="false">
          <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <ellipse cx="12" cy="12" rx="4" ry="9" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M3.5 9.2h17M3.5 14.8h17" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
        <span className="lang-code" lang={current.hrefLang}>{current.short}</span>
        <span className="lang-caret" aria-hidden="true">▾</span>
      </button>
      <ul className={`lang-panel ${open ? "open" : ""}`} id={panelId} hidden={!open} aria-label={label}>
        {site.locales.map((l) => {
          const m = meta[l] || { name: l, hrefLang: l };
          return (
            <li key={l}>
              <a
                href={target(l)}
                onClick={(e) => { refresh(e, l); setOpen(false); }}
                onPointerDown={(e) => refresh(e, l)}
                onFocus={(e) => refresh(e, l)}
                className={l === locale ? "on" : ""}
                aria-current={l === locale ? "true" : undefined}
                hrefLang={m.hrefLang}
                lang={m.hrefLang}
              >
                {m.name}
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
