import { NextResponse, type NextRequest } from "next/server";
import { canonicalHost } from "@/lib/site";

/**
 * Three jobs, in order:
 *
 * 1. One address. Once NUCTA_SITE_URL names the site's own domain, a visit to
 *    any other address of the live site (the old vercel.app one, or www) is
 *    sent there with a permanent redirect, keeping the path. Search engines
 *    then move their listings across. Calls to /api/ and anything that isn't
 *    a plain page request (form posts, Stripe and HMRC callbacks) are left
 *    alone, so nothing already pointed at the old address breaks.
 *
 * 2. Markdown copies. /guides/<slug>.md, /corporation-tax-calculator.md,
 *    /index.md and /sitemap.md are answered by app/md, as plain text for AI
 *    assistants and anyone who wants the words without the page.
 *
 * 3. The website is public; the software isn't. Pages of the software need a
 *    signed-in session. This only checks that a session cookie is present, to
 *    send anyone without one to the sign-in page; the session itself is
 *    checked against the database by every page and action (lib/auth.ts), so a
 *    made-up cookie gets nothing.
 */
const PRIVATE = ["/dashboard", "/companies", "/returns", "/deadlines", "/calendar.ics", "/gateway", "/live-filing", "/payments", "/companies-house", "/log", "/settings", "/status", "/account"];

/** Pages that have a Markdown copy, by the path the copy is asked for at. */
const MARKDOWN = /^\/(?:guides\/[a-z0-9-]+|guides|corporation-tax-calculator|index|sitemap)\.md$/;

function toCanonicalHost(req: NextRequest): NextResponse | null {
  if (process.env.VERCEL_ENV !== "production") return null; // previews and local runs answer where they are
  const want = canonicalHost();
  if (!want) return null;
  if (req.method !== "GET" && req.method !== "HEAD") return null;
  const { pathname, search } = req.nextUrl;
  if (pathname.startsWith("/api/")) return null;
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").toLowerCase();
  // Next may already see the request as served from the right host (and would
  // then write the redirect as a relative one, which loops): leave it.
  const servedAs = req.nextUrl.host.toLowerCase();
  if (!host || host === want || servedAs === want) return null;
  return NextResponse.redirect(`https://${want}${pathname}${search}`, 308);
}

export function middleware(req: NextRequest) {
  const moved = toCanonicalHost(req);
  if (moved) return moved;

  const { pathname, search } = req.nextUrl;
  if (MARKDOWN.test(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = `/md${pathname.replace(/\.md$/, "")}`;
    return NextResponse.rewrite(url);
  }

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
