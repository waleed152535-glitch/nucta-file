import Link from "next/link";
import { inviteByToken } from "@/lib/team-core";
import { JoinForm } from "../AuthForms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Join a Nucta File account", robots: { index: false } };

export default async function Join({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const token = (await searchParams).token ?? "";
  const v = await inviteByToken(token);
  return (
    <section className="auth">
      <div className="wrap">
        <div className="auth-side">
          <h2>{v.ok ? `${v.invitedBy} has invited you` : "Invitation"}</h2>
          <p>{v.ok ? `Join ${v.accountName} to see its companies, prepare returns and keep every deadline together.` : "Invitations are sent from the Team section of an account."}</p>
        </div>
        {v.ok ? <JoinForm token={token} name={v.name ?? ""} email={v.email ?? ""} accountName={v.accountName ?? ""} />
          : <div className="auth-card"><h1>This link can&apos;t be used</h1><p className="sub">{v.problem}</p><p className="switch"><Link href="/sign-in">Sign in</Link></p></div>}
      </div>
    </section>
  );
}
