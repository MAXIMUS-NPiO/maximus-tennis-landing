"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "./Logo";
import LocaleSwitcher from "./LocaleSwitcher";
import { navGroups } from "../data/site";
import { href } from "../lib/paths";

export default function Header({ locale, nav }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname() || "";
  const isActive = (key) => pathname === href(locale, key) || (key !== "home" && pathname.startsWith(href(locale, key) + "/"));
  const groupActive = (g) => g.items && g.items.some(isActive);

  return (
    <header className="site-header">
      <a className="skip" href="#main">{nav.home}</a>
      <div className="shell header-inner">
        <Link className="logo-link" href={href(locale, "home")} aria-label="MAXIMUS GPS">
          <Logo height={40} priority />
        </Link>
        <ul className="nav-desktop">
          {navGroups.map((g) =>
            g.items ? (
              <li key={g.key}>
                <button type="button" className={groupActive(g) ? "active" : ""} aria-haspopup="true">{nav.groups[g.key]} <span aria-hidden="true">▾</span></button>
                <div className="menu" role="menu">
                  {g.items.map((k, i) => (
                    <Link key={k} href={href(locale, k)} className={i === 0 ? "head" : ""} role="menuitem">{nav[k]}</Link>
                  ))}
                </div>
              </li>
            ) : (
              <li key={g.key}><Link href={href(locale, g.href)} className={isActive(g.href) ? "active" : ""}>{nav[g.key]}</Link></li>
            )
          )}
        </ul>
        <div className="header-tools">
          <LocaleSwitcher locale={locale} />
          <button type="button" className="menu-toggle" aria-expanded={open} aria-controls="mobile-nav" onClick={() => setOpen((v) => !v)} aria-label={open ? nav.close : nav.menu}>
            {open ? "✕" : "☰"}
          </button>
        </div>
      </div>
      <div id="mobile-nav" className={`nav-mobile ${open ? "open" : ""}`}>
        <div className="shell">
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
        </div>
      </div>
    </header>
  );
}
