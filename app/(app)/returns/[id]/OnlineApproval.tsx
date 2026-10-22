"use client";

/**
 * Approval step: send the return to the director to approve online, see
 * where it has got to, and the record once it's approved.
 */
import { useCallback, useEffect, useState, useTransition } from "react";
import { cancelApproval, listApprovals, requestApproval, resendApproval, type ApprovalRow } from "@/lib/approval-actions";

const at = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" }) : "");

export default function OnlineApproval({ returnId, director, saveFirst }: { returnId: string; director: string; saveFirst: () => Promise<boolean> }) {
  const [rows, setRows] = useState<ApprovalRow[]>([]);
  const [emailReady, setEmailReady] = useState(false);
  const [name, setName] = useState(director);
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<{ bad: boolean; text: string; link?: string } | null>(null);
  const [pending, start] = useTransition();
  const load = useCallback(async () => { const r = await listApprovals(returnId); setRows(r.rows); setEmailReady(r.emailReady); }, [returnId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!name && director) setName(director); }, [director, name]);

  const done = (r: { ok: boolean; problem?: string; link?: string; emailed?: boolean }, who?: string) => {
    if (!r.ok) setMsg({ bad: true, text: r.problem ?? "Couldn't send it." });
    else setMsg({ bad: false, text: r.emailed ? `Sent to ${who}. The link works for 30 days.` : "Here's the link to send the director yourself, by email or WhatsApp. It works for 30 days.", link: r.link });
    load();
  };
  const send = () => start(async () => { if (!(await saveFirst())) return; done(await requestApproval(returnId, name, email), email); });
  const latest = rows[0];

  return (
    <div className="card">
      <div className="hd"><h3>Approve online</h3><span className="note">The director reads the approval pack and approves from their phone or computer</span></div>
      <div className="bd">
        {latest?.status === "approved" && (
          <div className={`banner ${latest.stale ? "warn" : "good"}`}>
            <span>{latest.stale ? "!" : "✓"}</span>
            <span><b>Approved by {latest.approvedName} on {at(latest.approvedAt)}</b>{latest.approvedIp ? `, from ${latest.approvedIp}` : ""}.
              {latest.stale ? " The figures have changed since, so this approval no longer matches: send it again." : " The approval is kept with the return."}</span>
          </div>
        )}
        {latest?.status === "query" && (
          <div className="banner warn"><span>?</span><span><b>{latest.directorName} asked:</b> {latest.query}<br />Answer them, change anything that needs changing, then send a new link.</span></div>
        )}
        <div className="row3" style={{ alignItems: "end" }}>
          <div className="field"><label>Director</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" /></div>
          <div className="field"><label>Their email<span className="hint">{emailReady ? "to email the link" : "optional"}</span></label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="director@example.com" /></div>
          <div className="field"><button type="button" className="btn" disabled={pending || name.trim().length < 3} onClick={send}>{pending ? "Preparing…" : latest && latest.status !== "approved" ? "Send a new approval" : "Send for approval"}</button></div>
        </div>
        {msg && (
          <div className={`banner ${msg.bad ? "bad" : "good"}`}>
            <span>{msg.bad ? "✕" : "✓"}</span>
            <span style={{ minWidth: 0, flex: 1 }}>{msg.text}
              {msg.link && (
                <span style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                  <input readOnly value={msg.link} onFocus={(e) => e.target.select()} style={{ flex: 1, minWidth: 220 }} aria-label="Approval link" />
                  <button type="button" className="btn ghost sm" onClick={() => navigator.clipboard?.writeText(msg.link ?? "")}>Copy the link</button>
                  <a className="btn ghost sm" href={`https://wa.me/?text=${encodeURIComponent(`Please approve the accounts and tax return: ${msg.link}`)}`} target="_blank" rel="noopener">Send by WhatsApp</a>
                </span>
              )}
            </span>
          </div>
        )}
        {!emailReady && <p className="note">Emailing links needs RESEND_API_KEY and EMAIL_FROM in the settings. Until then, copy the link and send it yourself.</p>}
        {rows.length > 0 && (
          <table style={{ marginTop: 10 }}>
            <thead><tr><th>Director</th><th>Status</th><th>Sent</th><th>Approved</th><th /></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{r.directorName}<div className="note">{r.directorEmail ?? "link copied, not emailed"}</div></td>
                  <td><span className={`pill ${r.status === "approved" ? (r.stale ? "warn" : "ok") : r.status === "query" ? "warn" : "live"}`}>{r.status === "approved" ? (r.stale ? "Approved, figures since changed" : "Approved") : r.status === "query" ? "Question asked" : "Waiting"}</span></td>
                  <td>{at(r.lastSentAt ?? r.createdAt)}{r.sentCount > 1 ? <div className="note">reminded {r.sentCount - 1} time{r.sentCount > 2 ? "s" : ""}</div> : null}</td>
                  <td>{r.approvedAt ? <>{at(r.approvedAt)}<div className="note">{r.approvedName}{r.approvedIp ? `, ${r.approvedIp}` : ""}</div></> : ""}</td>
                  <td className="num">{r.status !== "approved" && (
                    <span style={{ display: "inline-flex", gap: 6 }}>
                      <button type="button" className="btn ghost sm" disabled={pending} onClick={() => start(async () => done(await resendApproval(r.id), r.directorEmail ?? undefined))}>{r.directorEmail && emailReady ? "Remind" : "New link"}</button>
                      <button type="button" className="btn ghost sm" disabled={pending} onClick={() => start(async () => { await cancelApproval(r.id); load(); })}>Cancel</button>
                    </span>
                  )}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
