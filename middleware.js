import { NextResponse } from "next/server";
import { site } from "./data/site";
import { pick } from "./lib/language";
import { visitFields, recordVisit } from "./lib/visits";

/**
 * Language routing, and the visit counter.
 *
 * The counter runs after the response has been handed back (waitUntil), so a slow or missing store
 * cannot delay a page. It writes aggregate numbers only — see lib/visits.js for what is and is not
 * recorded. A redirect is not counted: the page it leads to counts itself, one visit per view.
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

export const config = {
  matcher: ["/((?!api|_next|brand|favicon.ico|icon.png|apple-icon.png|robots.txt|sitemap.xml|.*\\..*).*)"],
};
