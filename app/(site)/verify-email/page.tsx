import Link from "next/link";
import { confirmEmail, currentUser, type EmailCheckOutcome } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Confirm your email", robots: { index: false, follow: false } };

const WORDS: Record<EmailCheckOutcome, { title: string; text: (email: string) => string }> = {
  confirmed: { title: "Email confirmed", text: (e) => `Thank you — ${e || "your email address"} is confirmed. You can now file returns with HMRC from Nucta File, and receipts and payment confirmations will come to this address.` },
  already: { title: "Already confirmed", text: (e) => `${e || "This email address"} is already confirmed. There's nothing more to do.` },
  expired: { title: "That link has expired", text: () => "Links to confirm an email work for 48 hours. Sign in to Nucta File and press “Send the link again” at the top of the page." },
  invalid: { title: "That link doesn't work", text: () => "It may be incomplete, or from an older email. Open the link in the most recent email from Nucta File, or sign in and send a new one." },
};

/** Where the link in the confirmation email lands. Works whether or not this browser is signed in. */
export default async function VerifyEmail({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const token = (await searchParams).token ?? "";
  const r = token ? await confirmEmail(token).catch(() => ({ outcome: "invalid" as const, email: undefined })) : { outcome: "invalid" as const, email: undefined };
  const u = await currentUser();
  const w = WORDS[r.outcome];
  const good = r.outcome === "confirmed" || r.outcome === "already";
  return (
    <section className="auth">
      <div className="wrap">
        <div className="auth-side"><h2>{good ? "You're all set" : "Nearly there"}</h2><p>Confirming your email means HMRC&apos;s receipts and your payment confirmations reach you, and no one else.</p></div>
        <div className="auth-card verify-card" data-outcome={r.outcome}>
          <div className={`verify-mark ${good ? "good" : "bad"}`} aria-hidden>{good ? "✓" : "!"}</div>
          <h1>{w.title}</h1>
          <p className="sub">{w.text(r.email ?? "")}</p>
          {u
            ? <Link className="s-btn big" href="/dashboard" style={{ width: "100%", textAlign: "center" }}>Open Nucta File</Link>
            : <Link className="s-btn big" href="/sign-in?next=%2Fdashboard" style={{ width: "100%", textAlign: "center" }}>Sign in</Link>}
        </div>
      </div>
    </section>
  );
}
