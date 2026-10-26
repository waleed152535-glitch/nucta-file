import { currentUser, emailCheckNeeded } from "@/lib/auth";
import { getTeam } from "@/lib/team-actions";
import { checkMembershipPayment, myMembership, myPayments } from "@/lib/billing-actions";
import PaymentsCard from "./PaymentsCard";
import MembershipCard from "./MembershipCard";
import AccountClient from "./AccountClient";
import TeamCard from "./TeamCard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your account" };

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ membership?: string; session_id?: string }> }) {
  const u = (await currentUser())!;
  const sp = await searchParams;
  // Back from Stripe's page: ask Stripe how it went before showing the membership.
  let notice: { tone: "good" | "bad" | "info"; text: string } | undefined;
  if (sp.membership === "back" && sp.session_id) {
    const r = await checkMembershipPayment(sp.session_id);
    notice = { tone: r.ok ? "good" : r.status === "pending" ? "info" : "bad", text: r.words };
  } else if (sp.membership === "cancelled") {
    notice = { tone: "info", text: "The payment wasn't finished, so nothing was charged." };
  }
  const [team, payments, membership] = await Promise.all([getTeam(), myPayments(), myMembership()]);
  return (
    <AccountClient name={u.name} email={u.email} firm={u.accountName} kind={u.accountKind} emailConfirmed={!emailCheckNeeded(u)}
      membership={<MembershipCard v={membership} notice={notice} />}
      team={<TeamCard team={team} />} payments={<PaymentsCard payments={payments} />} />
  );
}
