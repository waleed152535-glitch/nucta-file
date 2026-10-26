/**
 * Starts signing in to HMRC for VAT: checks the person and the company, then
 * sends them to HMRC's own sign-in page. HMRC send them back to
 * /api/hmrc/callback.
 */
import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { store, siteUrl } from "@/lib/store";
import { mtdReady, startSignIn } from "@/lib/hmrc-mtd";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const companyId = url.searchParams.get("company") ?? "";
  const as = url.searchParams.get("as") === "agent" ? "agent" : "company";
  const back = (q: string) => NextResponse.redirect(`${siteUrl()}/companies/${encodeURIComponent(companyId)}/vat?${q}`, 303);
  const u = await currentUser();
  if (!u) return NextResponse.redirect(`${siteUrl()}/sign-in?next=${encodeURIComponent(`/companies/${companyId}/vat`)}`, 303);
  if (!mtdReady()) return back("hmrc=not-set-up");
  const s = await store();
  const [c] = await s.db.select({ id: s.companies.id }).from(s.companies).where(s.and(s.eq(s.companies.id, companyId), s.eq(s.companies.accountId, u.accountId)));
  if (!c) return NextResponse.redirect(`${siteUrl()}/companies`, 303);
  if (as === "agent" && u.accountKind === "company") return back("hmrc=agent-for-practices");
  const to = await startSignIn(s, { accountId: u.accountId, userId: u.id, companyId: c.id, scopeKey: as === "agent" ? "agent" : c.id });
  return NextResponse.redirect(to, 303);
}
