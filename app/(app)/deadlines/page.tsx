import { getDashboard } from "@/lib/return-actions";
import DeadlinesClient from "./DeadlinesClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Deadlines" };

export default async function DeadlinesPage() {
  const d = await getDashboard();
  return <DeadlinesClient data={d} today={new Date().toISOString().slice(0, 10)} />;
}
