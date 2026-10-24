"use client";

import { useState, useTransition } from "react";
import { updateCharging } from "@/lib/billing-actions";
import type { BillingSettings } from "@/lib/billing";
import type { PRICES } from "@/lib/site";

export default function ChargingSwitch({ initial, ready, mode, prices }: { initial: BillingSettings; ready: boolean; mode: "test" | "live" | null; prices: typeof PRICES }) {
  const [charging, setCharging] = useState(initial.charging);
  const [saved, setSaved] = useState(initial);
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const changed = charging !== saved.charging;
  const needsConfirm = charging && !saved.charging;
  const save = () => start(async () => {
    const r = await updateCharging({ charging, confirm });
    if (r.ok && r.settings) { setSaved(r.settings); setConfirm(false); }
    setMsg(r.ok ? { ok: true, text: "Saved. It applies straight away — no redeploy needed." } : { ok: false, text: r.problem ?? "Couldn't save." });
  });
  return (
    <div className="card">
      <div className="hd"><h3>Charge for filing</h3><span className={`pill ${saved.charging && ready ? "ok" : "draft"}`}>{saved.charging && ready ? "Charging" : "Free"}</span></div>
      <div className="bd">
        <label className="toggle-row">
          <input type="checkbox" checked={charging} disabled={!ready && !charging} onChange={(e) => { setCharging(e.target.checked); setMsg(null); }} />
          <span>Customers pay before filing a return with HMRC
            <small>
              {`${gbp(prices.company.perReturn)} a return for a company filing its own (${gbp(prices.company.dormant)} dormant); ${gbp(prices.practice.perReturn)} for practices (${gbp(prices.practice.dormant)} dormant). `}
              {"One payment covers the return, sending it again, and amending it. Preparing, checking and HMRC's test service stay free. Administrators never pay."}
              {!ready && " Add the Stripe secret key first."}
            </small>
          </span>
        </label>
        {needsConfirm && (
          <div className="confirm-live">
            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
              <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} style={{ marginTop: 3 }} />
              <span><b>Start charging{mode === "test" ? " (Stripe test mode: no real money)" : ""}.</b> From now on, customers pay by card before a return is filed. Update the pricing page and terms before switching it on for real.</span>
            </label>
          </div>
        )}
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 14, flexWrap: "wrap" }}>
          <button type="button" className="btn" disabled={pending || !changed || (needsConfirm && !confirm)} onClick={save}>{pending ? "Saving…" : "Save"}</button>
          {msg && <span className={msg.ok ? "ok-t" : "late-t"}>{msg.text}</span>}
          {saved.changedAt && <span className="note">Last changed {new Date(saved.changedAt).toLocaleString("en-GB")} by {saved.changedBy}</span>}
        </div>
      </div>
    </div>
  );
}

const gbp = (n: number) => `£${n}`;
