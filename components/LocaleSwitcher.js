"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { switchLocale } from "../lib/paths";
import { UTM_KEYS } from "../lib/intake/schema";

const META = { en: "EN", ru: "RU", zh: "中文" };
/** Query parameters that survive a language switch (validated again by the destination page). */
const KEEP = ["purpose", "series", "grip", "from", ...UTM_KEYS];
const VALUE = /^[\p{L}\p{N} ._~+\-:/|%()]{1,100}$/u;

export function allowedQuery(search) {
  const src = new URLSearchParams(search || "");
  const out = new URLSearchParams();
  for (const k of KEEP) {
    const v = src.get(k);
    if (v && VALUE.test(v)) out.set(k, v);
  }
  const q = out.toString();
  return q ? `?${q}` : "";
}

export default function LocaleSwitcher({ locale }) {
  const pathname = usePathname() || "/";
  const [query, setQuery] = useState("");
  useEffect(() => {
    setQuery(allowedQuery(window.location.search));
  }, [pathname]);
  const target = (l) => `${switchLocale(pathname, l)}${query}`;
  // The query is re-read at interaction time: pages may remove consumed parameters from the URL.
  const refresh = (e, l) => {
    e.currentTarget.href = `${switchLocale(window.location.pathname, l)}${allowedQuery(window.location.search)}`;
  };
  return (
    <nav className="lang" aria-label="Language">
      {Object.keys(META).map((l) => (
        <a
          key={l}
          href={target(l)}
          onClick={(e) => refresh(e, l)}
          onPointerDown={(e) => refresh(e, l)}
          onFocus={(e) => refresh(e, l)}
          className={l === locale ? "on" : ""}
          aria-current={l === locale ? "true" : undefined}
          hrefLang={l === "zh" ? "zh-CN" : l}
          lang={l === "zh" ? "zh-CN" : l}
        >
          {META[l]}
        </a>
      ))}
    </nav>
  );
}
