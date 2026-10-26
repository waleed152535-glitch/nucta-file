import Link from "next/link";
import type { PaymentRow } from "@/lib/billing";

const gbp = (n: number) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const WORD: Record<string, string> = { paid: "Paid", pending: "Not finished", refunded: "Refunded" };
const TONE: Record<string, string> = { paid: "ok", pending: "warn", refunded: "bad" };

/** The account's filing fees: what was paid, when, and Stripe's card receipt. */
export default function PaymentsCard({ payments }: { payments: PaymentRow[] }) {
  if (!payments.length) return null;
  return (
    <div className="card" id="payments">
      <div className="hd"><h3>Payments</h3><span className="note">Filing fees and memberships paid by card. Each was confirmed by email.</span></div>
      <div className="bd" style={{ paddingTop: 4, overflowX: "auto" }}>
        <table className="paytable">
          <thead><tr><th>Paid on</th><th>For</th><th>Reference</th><th className="num">Amount</th><th>Status</th></tr></thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id}>
                <td>{new Date(p.paidAt ?? p.at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</td>
                <td>{p.returnId ? <Link href={`/returns/${p.returnId}`}>{p.description}</Link> : <a href="#membership">{p.description}</a>}</td>
                <td className="mono">{p.reference}</td>
                <td className="num">{gbp(p.amount)}</td>
                <td><span className={`pill ${TONE[p.status] ?? "draft"}`}>{WORD[p.status] ?? p.status}</span>{p.receiptUrl && <> <a className="note" href={p.receiptUrl} target="_blank" rel="noreferrer">Card receipt</a></>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
