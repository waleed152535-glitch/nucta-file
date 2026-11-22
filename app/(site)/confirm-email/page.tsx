import { redirect } from "next/navigation";
import { currentUser, emailCheckNeeded } from "@/lib/auth";
import { SITE } from "@/lib/site";
import ConfirmEmail from "./ConfirmEmail";

export const dynamic = "force-dynamic";
export const metadata = { title: "Confirm your email", robots: { index: false, follow: false } };

const safe = (n: string | undefined) => (n && /^\/[a-z]/.test(n) && !n.startsWith("//") ? n : "/dashboard");

/**
 * The step between signing up and the software: confirm the email address.
 * The page notices by itself when the link has been opened (on this device
 * or another) and carries on.
 */
export default async function ConfirmEmailPage({ searchParams }: { searchParams: Promise<{ next?: string; failed?: string }> }) {
  const q = await searchParams;
  const next = safe(q.next);
  const u = await currentUser();
  if (!u) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  if (!emailCheckNeeded(u)) redirect(next);
  return (
    <section className="auth">
      <div className="wrap">
        <div className="auth-side">
          <h2>One last step</h2>
          <p>Confirming your email means HMRC&apos;s receipts, Companies House&apos;s decisions and your payment confirmations reach you, and no one else.</p>
        </div>
        <ConfirmEmail email={u.email} next={next} failed={q.failed === "1"} support={SITE.email} />
      </div>
    </section>
  );
}
