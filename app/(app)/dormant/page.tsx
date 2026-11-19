import DormantClient from "./DormantClient";
import { currentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const metadata = { title: "Dormant accounts in bulk" };

export default async function DormantPage() {
  const u = await currentUser();
  return <DormantClient userName={u?.name ?? ""} today={new Date().toISOString().slice(0, 10)} />;
}
