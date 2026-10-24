import { currentUser, emailCheckNeeded } from "@/lib/auth";
import { getTeam } from "@/lib/team-actions";
import { myPayments } from "@/lib/billing-actions";
import PaymentsCard from "./PaymentsCard";
import AccountClient from "./AccountClient";
import TeamCard from "./TeamCard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your account" };

export default async function AccountPage() {
  const u = (await currentUser())!;
  const [team, payments] = await Promise.all([getTeam(), myPayments()]);
  return (
    <AccountClient name={u.name} email={u.email} firm={u.accountName} kind={u.accountKind} emailConfirmed={!emailCheckNeeded(u)}
      team={<TeamCard team={team} />} payments={<PaymentsCard payments={payments} />} />
  );
}
