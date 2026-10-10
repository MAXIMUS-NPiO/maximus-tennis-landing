/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
"use client";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { switchLocale } from "../lib/paths";
import { site } from "../data/site";
import { allowedQuery } from "./LocaleSwitcher";

/**
 * Language menu — the header button opens a language room (Founder, 10 October 2026: clearer and
 * more innovative, on the pattern of the selector built for his other site).
 *
 * Every language is shown twice: in its own script (how its speakers look for it) and in the
 * language the visitor is reading now (how the visitor knows it), with its code. One field finds a
 * language by any of the three, or by its English name, without regard to accents. The languages
 * the visitor's own device asks for come first. Europe and Asia are filters, not walls. The current
 * language wears the carbon finish of the site's buttons.
 *
 * Every entry is an ordinary link, rendered on the server, so the site's language versions are
 * linked from every page for search engines and for browsers without script. The names come from
 * data/language-names.js (Unicode CLDR, generated), passed in from the server layout, so the
 * server and the browser render the same text.
 */

const fold = (s) => String(s || "").normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase();

export default function LocaleMenu({ locale, label = "Language", menu = {}, names = {}, namesEn = {}, regionNames = {}, regionOf = {} }) {
  const pathname = usePathname() || "/";
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [region, setRegion] = useState("all");
  const [open, setOpen] = useState(false);
  const [device, setDevice] = useState([]);
  // The room is rendered in place on the server (so every language link is in the page's HTML) and
  // moved to <body> once the page is live: the header is a frosted layer, and a fixed element inside
  // a filtered parent is confined to that parent instead of covering the screen.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const btnRef = useRef(null);
  const dialogRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const uid = useId();
  const titleId = `${uid}-title`;
  const listId = `${uid}-list`;

  const meta = site.localeMeta;
  const current = meta[locale] || { short: String(locale).toUpperCase(), name: locale, hrefLang: locale };
  const t = (k, v = {}) => String(menu[k] || "").replace(/\{(\w+)\}/g, (_, x) => (x in v ? v[x] : `{${x}}`));

  useEffect(() => {
    setQuery(allowedQuery(window.location.search));
  }, [pathname]);

  const target = (l) => `${switchLocale(pathname, l)}${query}`;
  // Re-read at interaction time: a page may have consumed and removed parameters from the URL.
  const refresh = (e, l) => {
    e.currentTarget.href = `${switchLocale(window.location.pathname, l)}${allowedQuery(window.location.search)}`;
  };

  // What one entry answers to: its own name, its name here, its English name, its codes.
  const haystack = useMemo(() => Object.fromEntries(site.locales.map((l) => {
    const m = meta[l] || {};
    return [l, fold([m.name, names[l], namesEn[l], l, m.short, m.hrefLang, ...(m.match || [])].join(" "))];
  })), [meta, names, namesEn]);

  const q = fold(search.trim());
  const visible = useMemo(
    () => site.locales.filter((l) => (q ? haystack[l].includes(q) : region === "all" || regionOf[l] === region)),
    [q, region, haystack, regionOf],
  );
  const counts = useMemo(() => {
    const c = { all: site.locales.length, europe: 0, asia: 0 };
    for (const l of site.locales) if (regionOf[l] in c) c[regionOf[l]] += 1;
    return c;
  }, [regionOf]);

  const close = useCallback((focusBack) => {
    setOpen(false);
    if (focusBack && btnRef.current) btnRef.current.focus();
  }, []);

  // On opening: the device's own languages, the page held still, the search field ready (on a
  // phone the keyboard stays down until the visitor taps the field).
  useEffect(() => {
    if (!open) return undefined;
    const wanted = (navigator.languages || [navigator.language || ""]).map((x) => String(x).toLowerCase());
    const found = [];
    for (const w of wanted) {
      const base = w.split("-")[0];
      const hit = site.locales.find((l) => (meta[l]?.match || []).some((m) => m === w || m === base)) || site.locales.find((l) => l === base);
      if (hit && hit !== locale && !found.includes(hit)) found.push(hit);
      if (found.length >= 3) break;
    }
    setDevice(found);
    const root = document.documentElement;
    const prev = root.style.overflow;
    root.style.overflow = "hidden";
    const coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    const focusTarget = coarse ? dialogRef.current : inputRef.current;
    if (focusTarget) focusTarget.focus({ preventScroll: true });
    return () => { root.style.overflow = prev; };
  }, [open, locale, meta]);

  const options = () => (listRef.current ? [...listRef.current.querySelectorAll("a.lang-opt:not([hidden])")] : []);

  const onKeyDown = (e) => {
    if (e.key === "Escape") { e.stopPropagation(); close(true); return; }
    if (e.key === "Tab" && dialogRef.current) {
      const f = [...dialogRef.current.querySelectorAll("a[href]:not([hidden]), button:not([disabled]), input")].filter((el) => !el.closest("[hidden]"));
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      return;
    }
    const opts = options();
    const i = opts.indexOf(document.activeElement);
    if (document.activeElement === inputRef.current) {
      if (e.key === "ArrowDown" && opts.length) { e.preventDefault(); opts[0].focus(); }
      if (e.key === "Enter" && opts.length === 1) { e.preventDefault(); opts[0].click(); }
      return;
    }
    if (i >= 0) {
      const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
      if (step) {
        e.preventDefault();
        const rtl = document.documentElement.dir === "rtl" && (e.key === "ArrowRight" || e.key === "ArrowLeft");
        const n = i + (rtl ? -step : step);
        if (n < 0) inputRef.current?.focus();
        else opts[Math.min(n, opts.length - 1)].focus();
        return;
      }
      if (e.key === "Home") { e.preventDefault(); opts[0].focus(); return; }
      if (e.key === "End") { e.preventDefault(); opts[opts.length - 1].focus(); return; }
      // Typing while on a language goes to the search field.
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && /\S/.test(e.key)) {
        e.preventDefault();
        setSearch((s) => s + e.key);
        inputRef.current?.focus();
      }
    }
  };

  // A plain function, not a component: the entries keep their identity across renders, so focus
  // stays where it is while the list is filtered.
  const entry = (l) => {
    const m = meta[l] || { name: l, hrefLang: l, short: l.toUpperCase() };
    const on = l === locale;
    const local = names[l] && fold(names[l]) !== fold(m.name) ? names[l] : null;
    return (
      <a
        key={l}
        href={target(l)}
        className="lang-opt"
        hidden={!visible.includes(l) || undefined}
        aria-current={on ? "true" : undefined}
        hrefLang={m.hrefLang}
        onClick={(e) => { refresh(e, l); setOpen(false); }}
        onPointerDown={(e) => refresh(e, l)}
        onFocus={(e) => refresh(e, l)}
      >
        <span className="lang-opt-native" lang={m.hrefLang}><bdi>{m.name}</bdi></span>
        {local && <span className="lang-opt-local">{local}</span>}
        <span className="lang-opt-code" aria-hidden="true">{m.short}</span>
        {on && (
          <svg className="lang-opt-check" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
            <path d="M20 6 9 17l-5-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </a>
    );
  };

  const room = (
    <div className={`lang-layer${open ? " open" : ""}`} hidden={!open}>
      <div className="lang-backdrop" aria-hidden="true" onClick={() => close(true)} />
      <div
        className="lang-dialog"
        id={`${uid}-dialog`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        ref={dialogRef}
        onKeyDown={onKeyDown}
      >
        <div className="lang-head">
          <div>
            <h2 className="lang-title" id={titleId}>{t("title") || label}</h2>
            <p className="lang-count">{t("count", { n: site.locales.length })}</p>
          </div>
          <button type="button" className="lang-close" onClick={() => close(true)} aria-label={t("close") || "Close"}>
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
              <path d="M18 6 6 18M6 6l12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <label className="lang-search">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
            <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <path d="m20 20-4.2-4.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            type="search"
            inputMode="search"
            autoComplete="off"
            spellCheck={false}
            placeholder={t("search")}
            aria-label={t("search")}
            aria-controls={listId}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>

        <div className="lang-filters">
          <div className="lang-chips" role="group" aria-label={t("title") || label}>
            {["all", "europe", "asia"].map((r) => (
              <button
                key={r}
                type="button"
                className="lang-chip"
                aria-pressed={!q && region === r}
                onClick={() => { setRegion(r); setSearch(""); }}
              >
                {r === "all" ? t("all") : regionNames[r] || r}
                <i aria-hidden="true">{counts[r]}</i>
              </button>
            ))}
          </div>
          {device.length > 0 && !q && (
            <p className="lang-device">
              <span>{t("device")}</span>
              {device.map((l) => (
                <a key={l} href={target(l)} hrefLang={meta[l].hrefLang} lang={meta[l].hrefLang} className="lang-device-link" onClick={(e) => { refresh(e, l); setOpen(false); }} onPointerDown={(e) => refresh(e, l)}>
                  <bdi>{meta[l].name}</bdi>
                </a>
              ))}
            </p>
          )}
        </div>

        <div className="lang-list" id={listId} ref={listRef}>
          {[locale, ...site.locales.filter((l) => l !== locale)].map((l) => entry(l))}
          {visible.length === 0 && <p className="lang-empty">{t("empty", { q: search.trim() })}</p>}
        </div>
      </div>
    </div>
  );

  return (
    <div className="lang-menu">
      <button
        type="button"
        ref={btnRef}
        className="lang-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={`${uid}-dialog`}
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

      {mounted ? createPortal(room, document.body) : room}
    </div>
  );
}
