import Link from "next/link";
import { readiness } from "@/lib/hmrc";

export const dynamic = "force-dynamic";

/**
 * The stages a filing product has to clear, in the order they actually bind.
 *
 * Features don't matter until the wire works, and the wire doesn't matter
 * until HMRC has recognised the product. Showing the order honestly stops
 * effort going into screens that a failed handshake would make worthless.
 */
const STAGES = [
  {
    title: "Vendor registration",
    done: true,
    body: "HMRC's Software Developers Support Team issued vendor ID 9754 and test credentials.",
  },
  {
    title: "The envelope and the IRmark",
    done: true,
    body: "HMRC's test service accepted five returns with accounts and computations attached — small profits rate, main rate, marginal relief, a loss and a dormant company (build 30).",
  },
  {
    title: "The tax engine and step-by-step returns",
    done: true,
    body: "Returns are worked out from the accounts: disallowed expenses, capital allowances, losses, interest and donations, then the 19%/25% rates with marginal relief. Accounts are built from real balance-sheet figures. Each year's closing figures carry into the next.",
  },
  {
    title: "HMRC recognition",
    done: false,
    body: "The applicant's pack has been requested from sdsteam@hmrc.gov.uk. Recognition is what allows live filing for customers and a listing on GOV.UK, and it is renewed every year.",
  },
  {
    title: "Accounts to Companies House",
    done: false,
    body: "Built and checked against Companies House's schemas; waiting for test presenter credentials, then at least four test filings and authorisation.",
  },
  {
    title: "More companies covered",
    done: false,
    body: "Next: director's loans (CT600A), then losses carried back, group relief, property income and FRS 102 small-company accounts.",
  },
];

export default function Home() {
  const checks = readiness();
  const ready = checks.filter((c) => c.ok).length;

  return (
    <>
      <div className="topbar">
        <div>
          <h2>Nucta File</h2>
          <div className="sub">Corporation Tax, statutory accounts and VAT, filed directly.</div>
        </div>
      </div>

      <div className="content">
        <div className="hero">
          <h3>A filing engine of our own</h3>
          <p>
            HMRC closed its free Corporation Tax service in March 2026, which left every small
            company buying filing software. Nucta File is that software — built to file for our own
            62 clients first, and sold to everyone else second. It is deliberately separate from
            Nucta Desk: the desk runs the practice, this files the returns, and the two meet only
            at the moment of submission.
          </p>
          <div className="acts">
            <Link href="/companies" className="btn">Companies and returns</Link>
            <Link href="/gateway" className="btn ghost">HMRC test console</Link>
            <Link href="/settings" className="btn ghost">Credentials ({ready} of {checks.length} set)</Link>
          </div>
        </div>

        <div className="card">
          <div className="hd">
            <h3>Where this stands</h3>
            <span className="note">In the order the work actually depends on</span>
          </div>
          <div className="bd" style={{ paddingTop: 6, paddingBottom: 6 }}>
            {STAGES.map((s) => (
              <div className="check" key={s.title}>
                <span className={`mark ${s.done ? "ok" : "no"}`}>{s.done ? "✓" : "–"}</span>
                <span>
                  <div className="t">{s.title}</div>
                  <div className="d">{s.body}</div>
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid2">
          <div className="card">
            <div className="hd"><h3>What beats WeFile</h3></div>
            <div className="bd">
              <p className="note" style={{ marginTop: 0 }}>
                WeFile charges per return and asks the customer to type every figure into a form
                that mirrors the CT600. Three things are worth doing differently:
              </p>
              <ul className="note" style={{ paddingLeft: 18, lineHeight: 1.7 }}>
                <li>
                  <b>Start from the records, not the form.</b> Bank statements and Amazon
                  settlement reports become a trial balance, and the boxes fill themselves.
                </li>
                <li>
                  <b>Accounts and CT600 together.</b> The same figures go to Companies House and
                  HMRC in one pass, so they can&apos;t disagree.
                </li>
                <li>
                  <b>Built for non-resident sellers.</b> Reverse-charge Amazon fees, foreign
                  directors, no UK address — the cases generic software handles badly.
                </li>
              </ul>
            </div>
          </div>

          <div className="card">
            <div className="hd"><h3>How it links to Nucta Desk</h3></div>
            <div className="bd">
              <p className="note" style={{ marginTop: 0 }}>
                Nothing is duplicated. When a return is ready to file, Nucta Desk hands over the
                company details, the accounting period and the figures it already holds; Nucta File
                builds and signs the submission and hands back the receipt and the IRmark, which the
                desk stores against the client.
              </p>
              <p className="note">
                That keeps the filing record clean enough to stand up years later, and it means
                Nucta File can be sold to accountants who have never seen Nucta Desk.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
