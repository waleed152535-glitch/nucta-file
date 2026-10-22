import { approvalByToken } from "@/lib/approval-core";
import ApproveForm from "./ApproveForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Approve the accounts and tax return", robots: { index: false, follow: false } };

const long = (iso?: string | null) => (iso ? new Date(iso.length === 10 ? iso + "T12:00:00Z" : iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "");
const gbp = (n: number) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** The director's page: what they're approving, the pack to read, and the approval itself. */
export default async function Approve({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const v = await approvalByToken(token);
  if (!v.ok) {
    return (
      <section className="read"><div className="wrap"><div className="paper"><h1>This link can&apos;t be used</h1><p>{v.problem}</p></div></div></section>
    );
  }
  const tax = (v.parts ?? []).reduce((s, p) => s + p.tax + p.loansTax, 0);
  return (
    <section className="read">
      <div className="wrap">
        <p className="crumb">Prepared by {v.preparedBy} with Nucta File</p>
        <div className="paper">
          <p className="meta" style={{ marginBottom: 8 }}>For the directors of</p>
          <h1>{v.company}</h1>
          <p className="meta">Company {v.companyNo}. Accounts and Company Tax Return for {long(v.periodFrom)} to {long(v.periodTo)}</p>
          <div className="approve-sum">
            <div><b>{gbp(tax)}</b><span>Corporation Tax{(v.parts ?? []).some((p) => p.loansTax) ? ", with tax on director's loans" : ""}</span></div>
            {(v.parts ?? []).map((p, i) => <div key={i}><b>{long(p.due)}</b><span>Pay by{(v.parts ?? []).length > 1 ? `, period to ${long(p.to)}` : ""}</span></div>)}
            <div><b>{long(v.filingDue)}</b><span>Return due at HMRC</span></div>
          </div>
          <p><a className="s-btn" href={`/approve/${token}/pack`} target="_blank" rel="noopener">Read the approval pack (PDF)</a></p>
          <p className="small">The pack has the accounts, the tax computation and the Company Tax Return box by box. Read it before approving.</p>
          <ApproveForm token={token} director={v.directorName ?? ""} status={v.status ?? "sent"} approvedAt={long(v.approvedAt)} approvedName={v.approvedName ?? ""} changed={Boolean(v.changed)} company={v.company ?? ""} preparedBy={v.preparedBy ?? ""} />
        </div>
      </div>
    </section>
  );
}
