"use client";

import { useState, useTransition } from "react";
import { sendTestEmail } from "@/lib/live-actions";

/** Sends a test email to the administrator and shows the email service's answer. */
export default function TestEmail() {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
      <button type="button" className="btn ghost sm" disabled={pending} onClick={() => start(async () => {
        const r = await sendTestEmail();
        setMsg(r.ok ? { ok: true, text: `Sent to ${r.to}. Check the inbox (and spam).` } : { ok: false, text: r.problem ?? "It couldn't be sent." });
      })}>{pending ? "Sending…" : "Send a test email"}</button>
      {msg && <span className={msg.ok ? "ok-t" : "late-t"} style={{ fontSize: 12.5 }}>{msg.text}</span>}
    </div>
  );
}
