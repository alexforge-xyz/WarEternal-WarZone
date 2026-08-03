import { NextResponse, type NextRequest } from "next/server";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n";

/**
 * Optional hard path for language: /map?lang=ru → set cookie → redirect clean.
 * Useful when client storage is blocked; the switcher does not need this.
 */
export function proxy(request: NextRequest) {
  const lang = request.nextUrl.searchParams.get("lang");
  if (!lang || !isLocale(lang)) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.searchParams.delete("lang");

  const res = NextResponse.redirect(url);
  res.cookies.set(LOCALE_COOKIE, lang, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
