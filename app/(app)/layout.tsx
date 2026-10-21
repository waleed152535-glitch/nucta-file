import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Nav from "@/components/Nav";
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
      <Nav user={{ name: u.name, email: u.email, accountName: u.accountName, admin: u.admin }} />
      <div className="main">{children}</div>
    </div>
  );
}
