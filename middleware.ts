import { NextResponse, type NextRequest } from "next/server";

/**
 * The website is public; the software isn't.
 *
 * Pages of the software need a signed-in session. This only checks that a
 * session cookie is present, to send anyone without one to the sign-in page;
 * the session itself is checked against the database by every page and action
 * (lib/auth.ts), so a made-up cookie gets nothing.
 */
const PRIVATE = ["/dashboard", "/companies", "/returns", "/deadlines", "/calendar.ics", "/gateway", "/companies-house", "/log", "/settings", "/status", "/account"];

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const isPrivate = PRIVATE.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (isPrivate && !req.cookies.get("nf_session")?.value) {
    const url = req.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  // Tell the page where it is, so a sign-in can come back here.
  const res = NextResponse.next({ request: { headers: new Headers({ ...Object.fromEntries(req.headers), "x-nf-path": pathname + search }) } });
  return res;
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico|fonts/).*)"],
};
