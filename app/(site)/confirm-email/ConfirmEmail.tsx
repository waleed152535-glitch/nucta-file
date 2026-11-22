"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { confirmLaterAction, emailConfirmedYet, resendEmailCheckAction, signOutAction, type FormState } from "@/lib/session-actions";

const start: FormState = { problems: [] };

export default function ConfirmEmail({ email, next, failed, support }: { email: string; next: string; failed: boolean; support: string }) {
  const router = useRouter();
  const [s, resend, busy] = useActionState(resendEmailCheckAction, start);
  // Carry on as soon as the link is opened, here or on a phone.
  useEffect(() => {
    const t = setInterval(async () => { if (await emailConfirmedYet()) { clearInterval(t); router.replace(next); } }, 4000);
    return () => clearInterval(t);
  }, [next, router]);
  const cantSend = failed || s.problems.some((p) => /couldn't be sent/i.test(p));

  return (
    <div className="auth-card verify-card">
      <div className="verify-mark good" aria-hidden>@</div>
      <h1>Check your inbox</h1>
      {cantSend && !s.done ? (
        <p className="sub">We couldn&apos;t send the email to <b>{email}</b> just now. Try again below in a minute, or carry on and confirm later.</p>
      ) : (
        <p className="sub">We sent a link to <b>{email}</b>. Open it to confirm your email; this page carries on by itself once you have.</p>
      )}
      {!(cantSend && !s.done) && (
        <ul className="confirm-tips">
          <li>Not there after a minute? Look in the spam or promotions folder.</li>
          <li>The link works for 48 hours, on any device.</li>
        </ul>
      )}
      <form action={resend}>
        <button type="submit" className="s-btn big" disabled={busy} style={{ width: "100%" }}>{busy ? "Sending…" : "Send the link again"}</button>
      </form>
      {s.done && <p className="confirm-msg good">{s.done}</p>}
      {s.problems.length > 0 && <p className="confirm-msg bad">{s.problems.join(" ")}</p>}
      {cantSend && (
        <form action={confirmLaterAction} style={{ marginTop: 10 }}>
          <input type="hidden" name="next" value={next} />
          <button type="submit" className="s-btn quiet big" style={{ width: "100%" }}>Carry on and confirm later</button>
          <p className="confirm-note">You can prepare returns straight away. Filing and paying wait until the email is confirmed.</p>
        </form>
      )}
      <div className="confirm-foot">
        <span>Wrong address?</span>
        <form action={signOutAction}><button type="submit" className="linkish">Sign out and sign up again</button></form>
        <span>· Need help? <a href={`mailto:${support}`}>{support}</a></span>
      </div>
    </div>
  );
}
