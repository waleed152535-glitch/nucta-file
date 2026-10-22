import { redirect } from "next/navigation";
import { headers } from "next/headers";
import AppBar from "@/components/AppBar";
import { currentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** The software itself: signed-in users only. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const u = await currentUser();
  if (!u) {
    const path = (await headers()).get("x-nf-path") ?? "/dashboard";
    redirect(`/sign-in?next=${encodeURIComponent(path)}`);
  }
  return (
    <div className="app">
      <AppBar user={{ name: u.name, email: u.email, accountName: u.accountName, accountKind: u.accountKind, admin: u.admin }} />
      <main className="main">{children}</main>
    </div>
  );
}
