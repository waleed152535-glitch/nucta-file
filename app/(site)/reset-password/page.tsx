import Link from "next/link";
import { ResetForm } from "../AuthForms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Choose a new password" };

export default async function Reset({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const token = (await searchParams).token ?? "";
  return (
    <section className="auth">
      <div className="wrap">
        <div className="auth-side"><h2>Nearly there</h2><p>Choose a password you don&apos;t use anywhere else.</p></div>
        {token ? <ResetForm token={token} /> : <div className="auth-card"><h1>That link isn&apos;t complete</h1><p className="sub">Open the link from the email again, or <Link href="/forgot-password">ask for a new one</Link>.</p></div>}
      </div>
    </section>
  );
}
