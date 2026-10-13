import { NextResponse, type NextRequest } from "next/server";

/**
 * A single gate in front of everything.
 *
 * Nucta File can send real filings under HMRC credentials, so it must not be
 * open to whoever finds the address. The passcode is one shared secret for
 * now, which is enough while only one person uses it; proper accounts come
 * when it's sold to anyone else.
 */
export function middleware(req: NextRequest) {
  const code = process.env.NUCTA_FILE_PASSCODE;

  // With no passcode configured there is nothing to check against, so the app
  // stays locked rather than silently open.
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/login") || pathname.startsWith("/_next") || pathname === "/favicon.ico") {
    return NextResponse.next();
  }

  const given = req.cookies.get("nf_pass")?.value;
  if (code && given === code) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = code ? "" : "?unset=1";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!api/health).*)"],
};
