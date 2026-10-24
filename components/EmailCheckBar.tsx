"use client";

/**
 * Across the top of the software until the email address is confirmed:
 * filing with HMRC and paying wait for it. Offers to send the link again.
 */
import { useActionState } from "react";
import { resendEmailCheckAction, type FormState } from "@/lib/session-actions";

const start: FormState = { problems: [] };

export default function EmailCheckBar({ email }: { email: string }) {
  const [s, act, busy] = useActionState(resendEmailCheckAction, start);
  return (
    <form action={act} className="verify-bar" role="status">
      <span className="vb-text">
        <b>Confirm your email address.</b> We sent a link to {email}. Until it&apos;s confirmed you can prepare returns, but not file them with HMRC.
      </span>
      {s.done ? <span className="vb-done">{s.done}</span> : (
        <button type="submit" className="btn ghost sm" disabled={busy}>{busy ? "Sending…" : "Send the link again"}</button>
      )}
      {s.problems.length > 0 && <span className="vb-problem">{s.problems.join(" ")}</span>}
    </form>
  );
}
