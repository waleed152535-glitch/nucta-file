import { notFound } from "next/navigation";
import { currentUser } from "@/lib/auth";

/** The HMRC and Companies House consoles, the submission log and setup: Nucta File's own staff only. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const u = await currentUser();
  if (!u?.admin) notFound();
  return <>{children}</>;
}
