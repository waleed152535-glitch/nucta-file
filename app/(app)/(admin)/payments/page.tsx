import Link from "next/link";
import { getPaymentsAdmin } from "@/lib/billing-actions";
import ChargingSwitch from "./ChargingSwitch";
import CopyText from "./CopyText";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payments" };

const gbp = (n: number) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const TONE: Record<string, string> = { paid: "ok", pending: "warn", refunded: "bad", expired: "draft" };
const WORD: Record<string, string> = { paid: "Paid", pending: "Not finished", refunded: "Refunded", expired: "Expired" };

/**
 * Charging for filing: Stripe's set-up, the switch, and every payment. Filing
 * is free until the switch is on; administrators never pay.
 */
export default async function PaymentsPage() {
  const v = await getPaymentsAdmin();
  return (
    <>
      <div className="topbar">
        <div>
          <h2>Payments</h2>
          <div className="sub">Whether customers pay to file, Stripe&apos;s set-up, and every payment.</div>
        </div>
        {v.mode && <span className={`pill ${v.mode === "live" ? "live" : "draft"}`}>{v.mode === "live" ? "Stripe live mode" : "Stripe test mode"}</span>}
      </div>
      <div className="content">
        {!v.ok ? <div className="banner bad"><span>✕</span><span>{v.problem}</span></div> : (
          <>
            {v.settings.charging && !v.checks[0].ok && (
              <div className="banner warn"><span>!</span><span><b>Charging is switched on, but the Stripe key is missing,</b> so filing is free until it&apos;s added back.</span></div>
            )}
            <ChargingSwitch initial={v.settings} ready={v.checks[0].ok} mode={v.mode} prices={v.prices} />

            <div className="grid2" style={{ alignItems: "start" }}>
              <div className="card">
                <div className="hd"><h3>Stripe set-up</h3><span className="note">{v.checks.filter((c) => c.ok).length} of {v.checks.length} ready</span></div>
                <div className="bd" style={{ paddingTop: 6, paddingBottom: 6 }}>
                  {v.checks.map((c) => (
                    <div className="check" key={c.label}>
                      <span className={`mark ${c.ok ? "ok" : "no"}`}>{c.ok ? "✓" : "–"}</span>
                      <span><div className="t">{c.label}</div><div className="d">{c.detail}</div></span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="card">
                <div className="hd"><h3>Stripe&apos;s webhook</h3></div>
                <div className="bd">
                  <p className="note" style={{ marginTop: 0 }}>In Stripe: Developers → Webhooks → Add endpoint. Paste this address, and choose these events:</p>
                  <CopyText value={v.webhookUrl} />
                  <ul className="chsteps" style={{ marginTop: 10 }}>
                    <li><span className="mono">checkout.session.completed</span></li>
                    <li><span className="mono">checkout.session.async_payment_succeeded</span></li>
                    <li><span className="mono">checkout.session.expired</span></li>
                    <li><span className="mono">charge.refunded</span></li>
                  </ul>
                  <p className="note" style={{ marginBottom: 0 }}>Then copy the endpoint&apos;s signing secret (whsec_…) into STRIPE_WEBHOOK_SECRET in Vercel. Test and live mode each have their own endpoint and secret.</p>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="hd"><h3>Payments</h3><span className="note">Newest first. Refunds are made in Stripe; they show here once Stripe tell Nucta File.</span></div>
              <div className="bd" style={{ paddingTop: 4 }}>
                {!v.payments.length ? <p className="note">No payments yet.</p> : (
                  <div style={{ overflowX: "auto" }}>
                    <table className="paytable">
                      <thead><tr><th>When</th><th>Account</th><th>For</th><th>Reference</th><th className="num">Amount</th><th>Status</th></tr></thead>
                      <tbody>
                        {v.payments.map((p) => (
                          <tr key={p.id}>
                            <td>{new Date(p.paidAt ?? p.at).toLocaleString("en-GB")}</td>
                            <td>{p.account ?? "—"}<div className="note">{p.email}</div></td>
                            <td><Link href={`/returns/${p.returnId}`}>{p.description}</Link></td>
                            <td className="mono">{p.reference}</td>
                            <td className="num">{gbp(p.amount)}</td>
                            <td><span className={`pill ${TONE[p.status] ?? "draft"}`}>{WORD[p.status] ?? p.status}</span>{p.receiptUrl && <> <a className="note" href={p.receiptUrl} target="_blank" rel="noreferrer">receipt</a></>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
