"use client";
import { usePathname } from "next/navigation";
import { switchLocale } from "../lib/paths";

const META = { en: "EN", ru: "RU", zh: "中文" };

export default function LocaleSwitcher({ locale }) {
  const pathname = usePathname() || "/";
  return (
    <nav className="lang" aria-label="Language">
      {Object.keys(META).map((l) => (
        <a key={l} href={switchLocale(pathname, l)} className={l === locale ? "on" : ""} aria-current={l === locale ? "true" : undefined} hrefLang={l === "zh" ? "zh-CN" : l} lang={l === "zh" ? "zh-CN" : l}>
          {META[l]}
        </a>
      ))}
    </nav>
  );
}
