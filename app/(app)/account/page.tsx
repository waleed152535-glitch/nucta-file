import { currentUser } from "@/lib/auth";
import { getTeam } from "@/lib/team-actions";
import AccountClient from "./AccountClient";
import TeamCard from "./TeamCard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your account" };

export default async function AccountPage() {
  const u = (await currentUser())!;
  const team = await getTeam();
  return <AccountClient name={u.name} email={u.email} firm={u.accountName} kind={u.accountKind} team={<TeamCard team={team} />} />;
}
