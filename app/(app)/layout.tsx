import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import AppBar from "@/components/AppBar";
import EmailCheckBar from "@/components/EmailCheckBar";
import { currentUser, emailCheckNeeded } from "@/lib/auth";
import { liveModeFor } from "@/lib/live-settings";
import { THEME_COOKIE, themeFrom } from "@/lib/theme";

export const dynamic = "force-dynamic";

/** The software's pages are private: never in search results, even if a link to one leaks. */
export const metadata = { robots: { index: false, follow: false } };

/** The software itself: signed-in users only. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const u = await currentUser();
  if (!u) {
    const path = (await headers()).get("x-nf-path") ?? "/dashboard";
    redirect(`/sign-in?next=${encodeURIComponent(path)}`);
  }
  // A new account confirms its email first. If the email couldn't be sent,
  // the confirm page lets them carry on for a day without it.
  if (emailCheckNeeded(u) && !u.admin && (await cookies()).get("nf_confirm_later")?.value !== "1") {
    const path = (await headers()).get("x-nf-path") ?? "/dashboard";
    redirect(`/confirm-email?next=${encodeURIComponent(path)}`);
  }
  const live = (await liveModeFor(u)).mode;
  const theme = themeFrom((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <div className="app" data-theme={theme}>
      <AppBar user={{ name: u.name, email: u.email, accountName: u.accountName, accountKind: u.accountKind, admin: u.admin, live }} theme={theme} />
      <main className="main">
        {emailCheckNeeded(u) && <EmailCheckBar email={u.email} />}
        {children}
      </main>
    </div>
  );
}
