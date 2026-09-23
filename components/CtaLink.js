"use client";
import Link from "next/link";
import { track } from "../lib/analytics";

/** Link that reports a primary CTA click (allowlisted parameters only). */
export default function CtaLink({ href, className, children, cta, locale, series }) {
  return (
    <Link
      href={href}
      className={className}
      onClick={() => cta && track("primary_cta_click", { cta, locale, series, route: href.split("?")[0] })}
    >
      {children}
    </Link>
  );
}
