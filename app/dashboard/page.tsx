import DashboardClient from "./DashboardClient";
import { getDashboard } from "@/lib/return-actions";
import { chApiReady } from "@/lib/ch-api";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const d = await getDashboard();
  return <DashboardClient data={d} chReady={chApiReady()} />;
}
