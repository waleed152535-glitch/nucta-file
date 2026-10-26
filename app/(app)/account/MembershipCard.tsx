"use client";

import { useEffect, useState, useTransition } from "react";
import { buyMembership, type MembershipView } from "@/lib/billing-actions";
import { PRICES } from "@/lib/site";

const gbp = (n: number) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
const day = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

/**
 * A practice's yearly membership: how much of the current one is used, and
 * the plans to buy or renew. Paid on Stripe's page, like a filing fee.
 */
export default function MembershipCard({ v, notice }: { v: MembershipView; notice?: { tone: "good" | "bad" | "info"; text: string } }) {
  const [msg, setMsg] = useState(notice ?? null);
  const [busy, setBusy] = useState<string | null>(null);
  const [, start] = useTransition();
  // Back from Stripe: the server has already asked Stripe how it went. Tidy the address bar.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("membership")) window.history.replaceState(null, "", window.location.pathname + "#membership");
  }, []);
  if (!v.ok || !v.forThisAccount) return null;
  const cur = v.current;
  const used = cur ? Math.min(cur.used, cur.returnsIncluded) : 0;
  const pct = cur ? Math.round((used / cur.returnsIncluded) * 100) : 0;
  const buyable = v.charging && v.canPay && v.window.canBuy;
  const buy = (key: string) => start(async () => {
    setBusy(key); setMsg(null);
    const r = await buyMembership(key);
    if (r.ok && r.url) { window.location.href = r.url; return; }
    setBusy(null);
    setMsg({ tone: "bad", text: r.problem ?? "Couldn't open the payment page." });
  });

  return (
    <div className="card" id="membership">
      <div className="hd"><h3>Membership</h3><span className="note">A year of returns for one payment</span></div>
      <div className="bd">
        {msg && <div className={`banner ${msg.tone}`}><span>{msg.tone === "good" ? "✓" : msg.tone === "bad" ? "✕" : "i"}</span><span>{msg.text}</span></div>}
        {cur && (
          <div className="mship">
            <div className="mship-top">
              <b>{cur.planName}</b>
              <span><b>{used}</b> of {cur.returnsIncluded} returns used</span>
            </div>
            <div className="meter" role="img" aria-label={`${used} of ${cur.returnsIncluded} returns used`}><i style={{ width: `${pct}%` }} /></div>
            <p className="note">Runs {day(cur.startsOn)} to {day(cur.endsOn)}. {cur.returnsIncluded - used > 0 ? `${cur.returnsIncluded - used} returns left.` : "Every return is used: the next one is charged per return, or buy another membership below."}</p>
          </div>
        )}
        {v.next && <p className="note">Bought and waiting: {v.next.planName}, {v.next.returnsIncluded} returns, from {day(v.next.startsOn)}.</p>}
        {!v.charging && (
          <div className="banner info"><span>i</span><span>Filing is free while Nucta File launches, so there&apos;s nothing to buy yet. These are the yearly plans for when charging starts — we&apos;ll tell you first.</span></div>
        )}
        <div className="plan-picks">
          {v.plans.map((p) => (
            <div className="plan-pick" key={p.key}>
              <b>{p.name}</b>
              <span className="n">{p.returns.toLocaleString("en-GB")} returns</span>
              <span className="price">{gbp(p.price)}<small> a year</small></span>
              <span className="note">About {gbp(Math.round((p.price / p.returns) * 100) / 100)} a return</span>
              {buyable && (
                <button type="button" className="btn" disabled={busy !== null} onClick={() => buy(p.key)}>
                  {busy === p.key ? "Opening Stripe…" : v.window.renewal ? `Renew from ${day(v.window.startsOn)}` : `Pay ${gbp(p.price)} by card`}
                </button>
              )}
            </div>
          ))}
        </div>
        {v.charging && v.window.why && <p className="note">{v.window.why}</p>}
        {v.charging && !v.canPay && <p className="note">Only the account&apos;s owner can buy a membership.</p>}
        {buyable && v.testMode && <p className="note">Stripe test mode: use card 4242 4242 4242 4242. No money moves.</p>}
        <p className="note" style={{ marginBottom: 0 }}>
          Each return filed with HMRC uses one. Sending it again, filing both parts of a period over 12 months, and amending it later use nothing more.
          Without a membership, each return is {gbp(PRICES.practice.perReturn)} ({gbp(PRICES.practice.dormant)} for a dormant company).
        </p>
      </div>
    </div>
  );
}
