"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { startReturn, type ReturnRow } from "@/lib/return-actions";
import { accountingPeriodsOf } from "@/lib/tax/long-period";
import { exceedsEighteenMonths, isIsoDate, monthsIn } from "@/lib/tax/dates";

const STATUS: Record<string, string> = {
  draft: "Draft", "accepted-test": "Passed HMRC's test service", "rejected-test": "Rejected by the test service — open to see why",
  "submitted-test": "Sent to the test service, awaiting the answer", accepted: "Filed with HMRC",
  "partly-sent-test": "One of the two returns has passed HMRC's test service — send the other",
  "partly-filed": "One of the two returns has been filed with HMRC — file the other",
  "submitted-live": "Filed — waiting for HMRC's answer",
};

const day = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

/** The day after a date, and a year on less a day: the usual next period. */
const nextPeriod = (lastEnd: string | undefined): { from: string; to: string } => {
  if (!lastEnd) return { from: "", to: "" };
  const d = new Date(lastEnd + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1);
  const from = d.toISOString().slice(0, 10);
  const e = new Date(d); e.setUTCFullYear(e.getUTCFullYear() + 1); e.setUTCDate(e.getUTCDate() - 1);
  return { from, to: e.toISOString().slice(0, 10) };
};

export default function CompanyClient({ company, returns }: {
  company: { id: string; name: string; companyNo: string | null; utr: string | null; incorporatedOn: string | null };
  returns: ReturnRow[];
}) {
  const router = useRouter();
  const [p, setP] = useState(nextPeriod(returns[0]?.periodEnd));
  const [problems, setProblems] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const begin = () => start(async () => {
    const r = await startReturn(company.id, p.from, p.to);
    if (r.ok && r.id) router.push(`/returns/${r.id}`); else setProblems(r.problems);
  });

  return (
    <>
      <div className="topbar">
        <div>
          <h2>{company.name}</h2>
          <div className="sub mono">{company.companyNo} · UTR {company.utr}{company.incorporatedOn ? ` · incorporated ${company.incorporatedOn}` : ""} · <Link href="/companies">all companies</Link></div>
        </div>
      </div>
      <div className="content">
        <div className="card">
          <div className="hd"><h3>Start a return</h3><span className="note">Enter the dates the accounts cover</span></div>
          <div className="bd">
            <div className="row2">
              <div className="field"><label>Period from</label><input type="date" value={p.from} onChange={(e) => setP({ ...p, from: e.target.value })} /></div>
              <div className="field"><label>Period to <span className="hint">the accounts year end</span></label><input type="date" value={p.to} onChange={(e) => setP({ ...p, to: e.target.value })} /></div>
            </div>
            {isIsoDate(p.from) && isIsoDate(p.to) && p.to > p.from && (() => {
              if (exceedsEighteenMonths(p.from, p.to)) return <p className="note">Accounts can&apos;t cover more than 18 months — check the dates.</p>;
              const parts = accountingPeriodsOf(p.from, p.to);
              return parts.length > 1 ? (
                <div className="banner info"><span>ℹ</span><span>
                  These accounts cover {monthsIn(p.from, p.to)}{" "}months. A Corporation Tax return can&apos;t cover more than 12, so Nucta File will
                  make <b>two returns</b> from the one set of figures: {day(parts[0].from)} to {day(parts[0].to)}, and {day(parts[1].from)} to {day(parts[1].to)}.
                </span></div>
              ) : null;
            })()}
            {returns.length > 0 && <p className="note">Following on from the last return, so its closing figures will be carried forward.</p>}
            {problems.length > 0 && <div className="banner bad"><span>✕</span><span><ul style={{ margin: 0, paddingLeft: 18 }}>{problems.map((x, i) => <li key={i}>{x}</li>)}</ul></span></div>}
            <button className="btn" disabled={pending || !p.from || !p.to} onClick={begin}>{pending ? "Starting…" : "Start the return"}</button>
          </div>
        </div>

        <div className="card">
          <div className="hd"><h3>Returns</h3></div>
          <div className="bd">
            {returns.length === 0 && <p className="note">None yet.</p>}
            {returns.map((r) => (
              <Link key={r.id} href={`/returns/${r.id}`} className="check" style={{ textDecoration: "none", color: "inherit" }}>
                <span className={`mark ${r.status === "accepted" || r.status === "accepted-test" ? "ok" : "no"}`}>{r.status === "accepted" || r.status === "accepted-test" ? "✓" : "–"}</span>
                <span style={{ flex: 1 }}>
                  <div className="t">{r.parts > 1 ? "Accounts" : "Year"} to {r.periodEnd}{r.amendment ? " · amended return" : ""}</div>
                  <div className="d">{r.periodStart} to {r.periodEnd}{r.parts > 1 ? " · two returns" : ""} · {STATUS[r.status] ?? r.status}</div>
                </span>
                <span className="note">updated {new Date(r.updatedAt).toLocaleDateString("en-GB")}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
