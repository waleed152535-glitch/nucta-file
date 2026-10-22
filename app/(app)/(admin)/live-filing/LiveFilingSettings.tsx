"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateLiveFiling } from "@/lib/live-actions";
import type { LiveSettings } from "@/lib/live-settings";
import type { LiveFiling } from "@/lib/hmrc";

const MODES: { key: LiveFiling; title: string; text: string }[] = [
  { key: "off", title: "Off", text: "HMRC's test service only. Nothing reaches HMRC's live service." },
  { key: "til", title: "Test in Live only", text: "HMRC's live service checks a return with the company's real sign-in, and files nothing." },
  { key: "on", title: "Live filing", text: "Returns can be filed with HMRC for real, after the checks on the filing screen." },
];

export default function LiveFilingSettings({ initial }: { initial: LiveSettings }) {
  const router = useRouter();
  const [mode, setMode] = useState<LiveFiling>(initial.mode);
  const [who, setWho] = useState(initial.who);
  const [requireTil, setRequireTil] = useState(initial.requireTil);
  const [emailReceipt, setEmailReceipt] = useState(initial.emailReceipt);
  const [confirmLive, setConfirmLive] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const changed = mode !== initial.mode || who !== initial.who || requireTil !== initial.requireTil || emailReceipt !== initial.emailReceipt;
  const needsConfirm = (mode === "on" && initial.mode !== "on") || (mode === "on" && who === "everyone" && !(initial.mode === "on" && initial.who === "everyone"));

  const save = () => start(async () => {
    const r = await updateLiveFiling({ mode, who, requireTil, emailReceipt, confirmLive });
    setMsg(r.ok ? { ok: true, text: "Saved. It applies straight away — no redeploy needed." } : { ok: false, text: r.problem ?? "Couldn't save." });
    if (r.ok) { setConfirmLive(false); router.refresh(); }
  });

  return (
    <div className="card">
      <div className="hd">
        <h3>{initial.mode === "on" ? "Live filing is on" : initial.mode === "til" ? "Test in Live is open" : "Live filing is off"}{initial.mode !== "off" ? (initial.who === "everyone" ? ", for every account" : ", for administrators only") : ""}</h3>
        {initial.changedAt && <span className="note">Last changed {new Date(initial.changedAt).toLocaleString("en-GB")} by {initial.changedBy}</span>}
      </div>
      <div className="bd">
        <div className="note" style={{ marginBottom: 4 }}>Mode</div>
        <div className="picks" role="radiogroup" aria-label="Live filing mode">
          {MODES.map((m) => (
            <button key={m.key} type="button" role="radio" aria-checked={mode === m.key} className="pick" onClick={() => { setMode(m.key); setMsg(null); }}>
              <span className="dot" aria-hidden /><span><b>{m.title}</b><small>{m.text}</small></span>
            </button>
          ))}
        </div>
        <div className="note" style={{ marginBottom: 4 }}>Who can use it</div>
        <div className="picks" role="radiogroup" aria-label="Who can file live">
          <button type="button" role="radio" aria-checked={who === "admins"} className="pick" onClick={() => { setWho("admins"); setMsg(null); }}>
            <span className="dot" aria-hidden /><span><b>Administrators only</b><small>A pilot: Nucta File&apos;s own staff file their clients&apos; returns first. Other accounts see that live filing isn&apos;t open for them yet.</small></span>
          </button>
          <button type="button" role="radio" aria-checked={who === "everyone"} className="pick" onClick={() => { setWho("everyone"); setMsg(null); }}>
            <span className="dot" aria-hidden /><span><b>Every account</b><small>Every customer can file their own returns, with their own HMRC sign-in.</small></span>
          </button>
        </div>
        <label className="toggle-row">
          <input type="checkbox" checked={requireTil} onChange={(e) => { setRequireTil(e.target.checked); setMsg(null); }} />
          <span>Require HMRC&apos;s Test in Live check before every real filing<small>Recommended. It uses the same sign-in and files nothing, so a wrong password or an HMRC account without Corporation Tax shows up first. Turn it off only if HMRC&apos;s Test in Live service is unavailable.</small></span>
        </label>
        <label className="toggle-row">
          <input type="checkbox" checked={emailReceipt} onChange={(e) => { setEmailReceipt(e.target.checked); setMsg(null); }} />
          <span>Email HMRC&apos;s receipt to the person who filed<small>As soon as HMRC accept the return, with the tax to pay and how to pay it.</small></span>
        </label>
        {needsConfirm && (
          <div className="confirm-live">
            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
              <input type="checkbox" checked={confirmLive} onChange={(e) => setConfirmLive(e.target.checked)} style={{ marginTop: 3 }} />
              <span><b>Switch on real filing{who === "everyone" ? " for every account" : ""}.</b> Returns filed from now on are filed with HMRC for real and can only be corrected by an amended return.</span>
            </label>
          </div>
        )}
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 14, flexWrap: "wrap" }}>
          <button type="button" className="btn" disabled={pending || !changed || (needsConfirm && !confirmLive)} onClick={save}>{pending ? "Saving…" : "Save"}</button>
          {msg && <span className={msg.ok ? "ok-t" : "late-t"}>{msg.text}</span>}
        </div>
      </div>
    </div>
  );
}
