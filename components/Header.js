"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "./Logo";
import LocaleSwitcher from "./LocaleSwitcher";
import { navGroups } from "../data/site";
import { href } from "../lib/paths";

/**
 * Header with grouped navigation.
 * Desktop: each group is a button that opens its submenu on click / Enter / Space, closes on
 * Escape, Tab-out or outside click (never hover-only). Mobile: a toggle button and native
 * <details> groups. All toggles carry aria-expanded / aria-controls.
 */
export default function Header({ locale, nav }) {
  const [open, setOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState(null);
  const pathname = usePathname() || "";
  const navRef = useRef(null);
  const toggleRef = useRef(null);

  const isActive = (key) => pathname === href(locale, key) || (key !== "home" && pathname.startsWith(href(locale, key) + "/"));
  const groupActive = (g) => g.items && g.items.some(isActive);

  useEffect(() => { setOpenGroup(null); setOpen(false); }, [pathname]);

  useEffect(() => {
    if (!openGroup) return;
    const onDoc = (e) => { if (navRef.current && !navRef.current.contains(e.target)) setOpenGroup(null); };
    const onKey = (e) => { if (e.key === "Escape") { setOpenGroup(null); const b = navRef.current && navRef.current.querySelector(`#nav-btn-${openGroup}`); if (b) b.focus(); } };
    document.addEventListener("pointerdown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [openGroup]);

  // Mobile menu: Escape closes it and returns focus to the toggle.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") { setOpen(false); if (toggleRef.current) toggleRef.current.focus(); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const onBlurGroup = (e) => {
    const li = e.currentTarget;
    if (!li.contains(e.relatedTarget)) setOpenGroup((g) => (g === li.dataset.group ? null : g));
  };

  return (
    <header className="site-header">
      <a className="skip" href="#main">{nav.skip || nav.home}</a>
      <div className="shell header-inner">
        <Link className="logo-link" href={href(locale, "home")} aria-label="MAXIMUS GPS">
          <Logo height={40} />
        </Link>
        <ul className="nav-desktop" ref={navRef} aria-label={nav.menu}>
          {navGroups.map((g) =>
            g.items ? (
              <li key={g.key} data-group={g.key} onBlur={onBlurGroup}>
                <button
                  type="button"
                  id={`nav-btn-${g.key}`}
                  className={groupActive(g) ? "active" : ""}
                  aria-haspopup="true"
                  aria-expanded={openGroup === g.key}
                  aria-controls={`nav-menu-${g.key}`}
                  onClick={() => setOpenGroup((cur) => (cur === g.key ? null : g.key))}
                >
                  {nav.groups[g.key]} <span aria-hidden="true">{openGroup === g.key ? "▴" : "▾"}</span>
                </button>
                <div className={`menu ${openGroup === g.key ? "open" : ""}`} id={`nav-menu-${g.key}`} role="group" aria-labelledby={`nav-btn-${g.key}`}>
                  {g.items.map((k, i) => (
                    <Link key={k} href={href(locale, k)} className={i === 0 ? "head" : ""} tabIndex={openGroup === g.key ? 0 : -1}>{nav[k]}</Link>
                  ))}
                </div>
              </li>
            ) : (
              <li key={g.key}><Link href={href(locale, g.href)} className={isActive(g.href) ? "active" : ""} aria-current={isActive(g.href) ? "page" : undefined}>{nav[g.key]}</Link></li>
            )
          )}
        </ul>
        <div className="header-tools">
          <LocaleSwitcher locale={locale} />
          <button type="button" ref={toggleRef} className="menu-toggle" aria-expanded={open} aria-controls="mobile-nav" onClick={() => setOpen((v) => !v)} aria-label={open ? nav.close : nav.menu}>
            <span aria-hidden="true">{open ? "✕" : "☰"}</span>
          </button>
        </div>
      </div>
      <div id="mobile-nav" className={`nav-mobile ${open ? "open" : ""}`} hidden={!open}>
        <nav className="shell" aria-label={nav.menu}>
          {navGroups.map((g) =>
            g.items ? (
              <details key={g.key}>
                <summary>{nav.groups[g.key]}</summary>
                {g.items.map((k) => <Link key={k} href={href(locale, k)} onClick={() => setOpen(false)}>{nav[k]}</Link>)}
              </details>
            ) : (
              <Link key={g.key} className="top" href={href(locale, g.href)} onClick={() => setOpen(false)}>{nav[g.key]}</Link>
            )
          )}
        </nav>
      </div>
    </header>
  );
}
