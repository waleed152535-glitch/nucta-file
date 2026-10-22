"use client";

import { useActionState, useState } from "react";
import { approveAction, queryAction, type ApproveState } from "@/lib/approve-actions";

const start: ApproveState = { problems: [] };

export default function ApproveForm({ token, director, status, approvedAt, approvedName, changed, company, preparedBy }: {
  token: string; director: string; status: string; approvedAt: string; approvedName: string; changed: boolean; company: string; preparedBy: string;
}) {
  const [a, approve, approving] = useActionState(approveAction, start);
  const [q, ask, asking] = useActionState(queryAction, start);
  const [asked, setAsked] = useState(false);
  if (status === "approved" || a.done === "approved") {
    return <div className="approve-done"><b>Approved{approvedName || a.done ? ` by ${approvedName || "you"}` : ""}{approvedAt ? ` on ${approvedAt}` : ""}.</b> Thank you. {preparedBy} can now file the return. Keep the approval pack for the company&apos;s records.</div>;
  }
  if (q.done === "query") return <div className="approve-done"><b>Question sent.</b> {preparedBy} will reply and send a new link once it&apos;s answered.</div>;
  if (changed) return <div className="approve-done warn"><b>The figures have changed since this link was sent.</b> Ask {preparedBy} for a new link before approving.</div>;
  return (
    <div className="approve-box">
      <h2>Approve</h2>
      <form action={approve}>
        <input type="hidden" name="token" value={token} />
        <p>I have read the accounts and the Company Tax Return in the approval pack. On behalf of the board of {company}, I approve the accounts, and I confirm that the information in the return is correct and complete to the best of my knowledge and belief. {preparedBy} may file them.</p>
        {a.problems.length > 0 && <div className="approve-err">{a.problems.join(" ")}</div>}
        <label className="approve-f"><span>Type your full name</span><input name="name" defaultValue="" placeholder={director} autoComplete="name" required /></label>
        <label className="approve-agree"><input type="checkbox" name="agreed" value="yes" required /><span>I confirm the statement above, and that I am a director of the company.</span></label>
        <button className="s-btn big" type="submit" disabled={approving}>{approving ? "Recording…" : "Approve the accounts and return"}</button>
      </form>
      <p className="small" style={{ marginTop: 18 }}>Your name, the time and your internet address are recorded with the approval.</p>
      {!asked ? <p><button type="button" className="approve-link" onClick={() => setAsked(true)}>Something looks wrong? Ask a question instead</button></p> : (
        <form action={ask} style={{ marginTop: 10 }}>
          <input type="hidden" name="token" value={token} />
          {q.problems.length > 0 && <div className="approve-err">{q.problems.join(" ")}</div>}
          <label className="approve-f"><span>Your question for {preparedBy}</span><textarea name="message" rows={4} required /></label>
          <button className="s-btn" type="submit" disabled={asking}>{asking ? "Sending…" : "Send the question"}</button>
        </form>
      )}
    </div>
  );
}
