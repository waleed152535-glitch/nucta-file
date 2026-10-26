/**
 * Where HMRC send people back after signing in for VAT, with a one-time code
 * and the state Nucta File gave them. The state must be ours, unused and
 * under ten minutes old, and for the person signed in here.
 */
import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { store, siteUrl } from "@/lib/store";
import { finishSignIn, takeState } from "@/lib/hmrc-mtd";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code") ?? "";
  const denied = url.searchParams.get("error");
  const s = await store();
  const st = await takeState(s, state);
  if (!st) return NextResponse.redirect(`${siteUrl()}/companies?hmrc=expired`, 303);
  const back = (q: string) => NextResponse.redirect(`${siteUrl()}/companies/${encodeURIComponent(st.companyId)}/vat?${q}`, 303);
  const u = await currentUser();
  if (!u || u.id !== st.userId || u.accountId !== st.accountId) return back("hmrc=wrong-person");
  if (denied) return back(denied === "access_denied" ? "hmrc=declined" : "hmrc=failed");
  if (!/^[A-Za-z0-9._~-]{4,512}$/.test(code)) return back("hmrc=failed");
  try {
    await finishSignIn(s, st, code, u.name);
  } catch (e) {
    console.error("hmrc callback", String((e as Error)?.message ?? e).slice(0, 300));
    return back("hmrc=failed");
  }
  return back("hmrc=connected");
}
