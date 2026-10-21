import DashboardClient from "./DashboardClient";
import { getDashboard } from "@/lib/return-actions";
import { chApiReady } from "@/lib/ch-api";
import { currentUser } from "@/lib/auth";
import { SITE } from "@/lib/site";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [d, u] = await Promise.all([getDashboard(), currentUser()]);
  const who = { firstName: (u?.name ?? "").trim().split(/\s+/)[0] ?? "", practice: u?.accountKind !== "company" };
  return <DashboardClient data={d} chReady={chApiReady()} who={who} supportEmail={SITE.email} />;
}
