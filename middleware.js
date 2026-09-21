import { NextResponse } from "next/server";

const LOCALES = ["en", "ru", "zh"];
const DEFAULT = "en";

function pick(acceptLanguage) {
  if (!acceptLanguage) return DEFAULT;
  const tags = acceptLanguage.split(",").map((t) => t.split(";")[0].trim().toLowerCase());
  for (const tag of tags) {
    if (tag.startsWith("ru")) return "ru";
    if (tag.startsWith("zh")) return "zh";
    if (tag.startsWith("en")) return "en";
  }
  return DEFAULT;
}

export function middleware(request) {
  const { pathname } = request.nextUrl;
  const first = pathname.split("/")[1];
  if (LOCALES.includes(first)) return NextResponse.next();
  const locale = pick(request.headers.get("accept-language"));
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(url, 308);
}

export const config = {
  matcher: ["/((?!api|_next|brand|favicon.ico|icon.png|apple-icon.png|robots.txt|sitemap.xml|.*\\..*).*)"],
};
