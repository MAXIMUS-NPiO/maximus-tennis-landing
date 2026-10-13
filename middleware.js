/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import { NextResponse } from "next/server";
import { site } from "./data/site";
import { pick } from "./lib/language";
import { visitFields, recordVisit } from "./lib/visits";
import { CONTROL_PAYMENT_HEADERS, controlPaymentCsp, controlPaymentLocale, controlPaymentNonce } from "./lib/control-csp";

/**
 * Language routing, and the visit counter.
 *
 * The counter runs after the response has been handed back (waitUntil), so a slow or missing store
 * cannot delay a page. It writes aggregate numbers only — see lib/visits.js for what is and is not
 * recorded. A redirect is not counted: the page it leads to counts itself, one visit per view.
 *
 * The owner payment-control page alone receives a per-request Content Security Policy: the nonce
 * travels in the request header so Next.js stamps its own scripts, and the same policy is set on
 * the response. No other page is touched (lib/control-csp.js).
 */
export function middleware(request, event) {
  const { pathname } = request.nextUrl;
  const first = pathname.split("/")[1];
  // A path that already names a language is served in that language and is never redirected:
  // a link sent in one language must open in that language, and a search engine must be able
  // to reach every language version of every page.
  if (site.locales.includes(first)) {
    const fields = visitFields(request, first, pathname.slice(first.length + 1) || "/");
    if (fields && event && typeof event.waitUntil === "function") {
      event.waitUntil(recordVisit(process.env, fields));
    }
    if (controlPaymentLocale(pathname)) return controlPaymentResponse(request);
    return NextResponse.next();
  }
  const locale = pick(request.headers.get("accept-language"));
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  // Temporary, and varying by Accept-Language: the same address must be able to lead to a
  // different language for a different visitor, so it must not be cached as permanent.
  const res = NextResponse.redirect(url, 307);
  res.headers.set("Vary", "Accept-Language");
  return res;
}

function controlPaymentResponse(request) {
  const nonce = controlPaymentNonce();
  const policy = controlPaymentCsp(nonce, { production: process.env.NODE_ENV === "production" });
  const headers = new Headers(request.headers);
  headers.set("Content-Security-Policy", policy);
  headers.set("x-nonce", nonce);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy", policy);
  for (const [name, value] of Object.entries(CONTROL_PAYMENT_HEADERS)) res.headers.set(name, value);
  return res;
}

export const config = {
  matcher: ["/((?!api|_next|brand|favicon.ico|icon.png|apple-icon.png|robots.txt|sitemap.xml|.*\\..*).*)"],
};
