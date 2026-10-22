"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelInvite, inviteColleague, removeColleague, type TeamView } from "@/lib/team-actions";

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "never");

/** Everyone on the account, and invitations still waiting. */
export default function TeamCard({ team }: { team: TeamView }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState(""), [email, setEmail] = useState("");
  const [msg, setMsg] = useState<{ bad: boolean; text: string; link?: string } | null>(null);
  const owner = team.you?.role === "owner";
  const invite = () => start(async () => {
    const r = await inviteColleague(name, email);
    if (!r.ok) { setMsg({ bad: true, text: r.problem ?? "Couldn't invite them." }); return; }
    setMsg({ bad: false, text: r.emailed ? `Invitation emailed to ${email}. It works for 7 days.` : "Email isn't set up, so send them this link yourself. It works for 7 days and only once.", link: r.link });
    setName(""); setEmail(""); router.refresh();
  });
  return (
    <div className="card" id="team">
      <div className="hd"><h3>Team</h3><span className="note">Everyone here sees and works on the same companies</span></div>
      <div className="bd">
        {team.error && <div className="banner bad"><span>✕</span><span>{team.error}</span></div>}
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th className="num">Last signed in</th><th /></tr></thead>
          <tbody>
            {team.members.map((m) => (
              <tr key={m.id}>
                <td style={{ fontWeight: 600 }}>{m.name}{m.you ? <span className="note"> (you)</span> : null}</td>
                <td>{m.email}</td>
                <td><span className={`pill ${m.role === "owner" ? "live" : "draft"}`}>{m.role === "owner" ? "Owner" : "Member"}</span></td>
                <td className="num">{when(m.lastLoginAt)}</td>
                <td className="num">{owner && !m.you && <button type="button" className="btn ghost sm" disabled={pending} onClick={() => start(async () => { await removeColleague(m.id); router.refresh(); })}>Remove</button>}</td>
              </tr>
            ))}
            {team.invites.map((i) => (
              <tr key={i.id}>
                <td style={{ fontWeight: 600 }}>{i.name}</td>
                <td>{i.email}</td>
                <td><span className="pill warn">Invited</span></td>
                <td className="num note">until {when(i.expiresAt)}</td>
                <td className="num">{owner && <button type="button" className="btn ghost sm" disabled={pending} onClick={() => start(async () => { await cancelInvite(i.id); router.refresh(); })}>Cancel</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {owner ? (
          <div style={{ marginTop: 18 }}>
            <div className="row3" style={{ alignItems: "end" }}>
              <div className="field"><label>Their name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Warisha Khan" /></div>
              <div className="field"><label>Their email</label><input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="name@example.com" /></div>
              <div className="field"><button type="button" className="btn" disabled={pending || !name || !email} onClick={invite}>{pending ? "Inviting…" : "Invite to the team"}</button></div>
            </div>
            {msg && (
              <div className={`banner ${msg.bad ? "bad" : "good"}`}>
                <span>{msg.bad ? "✕" : "✓"}</span>
                <span style={{ minWidth: 0 }}>
                  {msg.text}
                  {msg.link && (
                    <span style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                      <input readOnly value={msg.link} onFocus={(e) => e.target.select()} style={{ flex: 1, minWidth: 220 }} aria-label="Invitation link" />
                      <button type="button" className="btn ghost sm" onClick={() => navigator.clipboard?.writeText(msg.link ?? "")}>Copy the link</button>
                    </span>
                  )}
                </span>
              </div>
            )}
            {!team.emailReady && <p className="note">Invitation emails need RESEND_API_KEY and EMAIL_FROM in the settings. Until then, copy each link and send it yourself.</p>}
          </div>
        ) : <p className="note" style={{ marginBottom: 0 }}>Only the account&apos;s owner can invite or remove people.</p>}
      </div>
    </div>
  );
}
