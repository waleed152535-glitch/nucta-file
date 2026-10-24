"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { startReturn, refreshFromCompaniesHouse, updateCompany, type ReturnRow, type CompanyDetail } from "@/lib/return-actions";
import CompanyNotes from "./CompanyNotes";
import type { Deadline } from "@/lib/deadlines";
import { firstPeriodEnd } from "@/lib/deadlines";
import DeadlineList from "../../dashboard/DeadlineList";
import { accountingPeriodsOf } from "@/lib/tax/long-period";
import { exceedsEighteenMonths, isIsoDate, monthsIn } from "@/lib/tax/dates";

const STATUS: Record<string, string> = {
  draft: "Draft — not filed yet", "accepted-test": "Checked by HMRC's test service — ready to file", "rejected-test": "HMRC's test found a problem — open to see why",
  "submitted-test": "With HMRC's test service", accepted: "Filed with HMRC",
  "partly-sent-test": "One of the two returns checked by HMRC's test service",
  "partly-filed": "One of the two returns has been filed with HMRC — file the other",
  "submitted-live": "Filed — waiting for HMRC's answer",
};

const day = (iso: string | null | undefined) => (iso ? new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "—");

/** The day after a date, and a year on less a day: the usual next period. */
const nextPeriod = (lastEnd: string | undefined, c?: CompanyDetail): { from: string; to: string } => {
  if (!lastEnd) {
    // No return yet: Companies House's next accounts dates, or the first accounts from incorporation.
    const ch = c?.chProfile;
    if (ch?.nextAccountsMadeUpTo) {
      const from = ch.lastAccountsMadeUpTo ? new Date(Date.parse(ch.lastAccountsMadeUpTo + "T00:00:00Z") + 86_400_000).toISOString().slice(0, 10) : (ch.incorporatedOn ?? c?.incorporatedOn ?? "");
      return { from, to: ch.nextAccountsMadeUpTo };
    }
    if (c?.incorporatedOn) return { from: c.incorporatedOn, to: firstPeriodEnd(c.incorporatedOn) };
    return { from: "", to: "" };
  }
  const d = new Date(lastEnd + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1);
  const from = d.toISOString().slice(0, 10);
  const e = new Date(d); e.setUTCFullYear(e.getUTCFullYear() + 1); e.setUTCDate(e.getUTCDate() - 1);
  return { from, to: e.toISOString().slice(0, 10) };
};

export default function CompanyClient({ company, returns, deadlines, chReady, suggest }: {
  company: CompanyDetail;
  returns: ReturnRow[];
  deadlines: Deadline[];
  chReady: boolean;
  suggest?: { from: string; to: string };
}) {
  const router = useRouter();
  const [p, setP] = useState(suggest ?? nextPeriod(returns.find((r) => !r.amendment)?.periodEnd, company));
  const [chMsg, setChMsg] = useState<string | null>(null);
  const refresh = () => start(async () => {
    const r = await refreshFromCompaniesHouse(company.id);
    setChMsg(r.ok ? "Updated from Companies House." : r.error ?? "Couldn't update.");
    if (r.ok) router.refresh();
  });
  const ch = company.chProfile;
  const [problems, setProblems] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(!company.utr);
  const [det, setDet] = useState({ name: company.name, utr: company.utr ?? "", incorporatedOn: company.incorporatedOn ?? "", registeredOffice: company.registeredOffice ?? "" });
  const [detMsg, setDetMsg] = useState<{ bad: boolean; text: string } | null>(null);
  const saveDetails = () => start(async () => {
    const r = await updateCompany(company.id, det);
    setDetMsg(r.ok ? { bad: false, text: "Saved." } : { bad: true, text: r.problems.join(" ") });
    if (r.ok) { setEditing(false); router.refresh(); }
  });
  const begin = () => start(async () => {
    const r = await startReturn(company.id, p.from, p.to);
    if (r.ok && r.id) router.push(`/returns/${r.id}`); else setProblems(r.problems);
  });

  return (
    <>
      <div className="topbar">
        <div>
          <h2>{company.name}</h2>
          <div className="sub">Company {company.companyNo}, {company.utr ? `UTR ${company.utr}` : "no UTR yet"}{company.incorporatedOn ? `, incorporated ${day(company.incorporatedOn)}` : ""}. <Link href="/companies">All companies</Link></div>
        </div>
        <button type="button" className="btn ghost" onClick={() => setEditing(!editing)}>{editing ? "Close" : "Edit details"}</button>
      </div>
      <div className="content">
        {editing && (
          <div className="card">
            <div className="hd"><h3>Company details</h3>{!company.utr && <span className="pill warn">The UTR is needed before a return can be filed</span>}</div>
            <div className="bd">
              <div className="row2">
                <div className="field"><label>Name</label><input value={det.name} onChange={(e) => setDet({ ...det, name: e.target.value })} /></div>
                <div className="field"><label>Corporation Tax UTR<span className="hint">10 digits, from HMRC&apos;s letters to the company</span></label><input value={det.utr} inputMode="numeric" onChange={(e) => setDet({ ...det, utr: e.target.value })} /></div>
              </div>
              <div className="row2">
                <div className="field"><label>Incorporated on</label><input type="date" value={det.incorporatedOn} onChange={(e) => setDet({ ...det, incorporatedOn: e.target.value })} /></div>
                <div className="field"><label>Registered office</label><input value={det.registeredOffice} onChange={(e) => setDet({ ...det, registeredOffice: e.target.value })} /></div>
              </div>
              {detMsg && <div className={`banner ${detMsg.bad ? "bad" : "good"}`}><span>{detMsg.bad ? "✕" : "✓"}</span><span>{detMsg.text}</span></div>}
              <button type="button" className="btn" disabled={pending} onClick={saveDetails}>Save details</button>
            </div>
          </div>
        )}
        <div className="grid2">
          <div className="card">
            <div className="hd"><h3>At Companies House</h3>
              {chReady && company.companyNo && <button type="button" className="btn ghost sm" disabled={pending} onClick={refresh}>{ch ? "Refresh" : "Look up"}</button>}
            </div>
            <div className="bd">
              {ch ? (
                <>
                  <div className="kv"><span className="k">Status</span><span className="v">{ch.status || "—"}</span></div>
                  <div className="kv"><span className="k">Registered office</span><span className="v" style={{ fontWeight: 400 }}>{ch.registeredOffice || "—"}</span></div>
                  <div className="kv"><span className="k">Year end</span><span className="v">{ch.ard ? `${ch.ard.day} ${new Date(Date.UTC(2000, ch.ard.month - 1, 1)).toLocaleDateString("en-GB", { month: "long" })}` : "—"}</span></div>
                  <div className="kv"><span className="k">Last accounts</span><span className="v">{ch.lastAccountsMadeUpTo ? `to ${day(ch.lastAccountsMadeUpTo)}` : "none yet"}</span></div>
                  <div className="kv"><span className="k">Next accounts</span><span className="v">{ch.nextAccountsMadeUpTo ? `to ${day(ch.nextAccountsMadeUpTo)}, due ${day(ch.nextAccountsDue)}` : "—"}{ch.accountsOverdue ? " · overdue" : ""}</span></div>
                  <div className="kv"><span className="k">Confirmation statement due</span><span className="v">{day(ch.confirmationStatementDue)}</span></div>
                  <p className="note" style={{ marginBottom: 0 }}>Read from Companies House on {new Date(ch.fetchedAt).toLocaleDateString("en-GB")}.</p>
                </>
              ) : (
                <p className="note" style={{ margin: 0 }}>
                  {company.registeredOffice ? <>{company.registeredOffice}<br /></> : null}
                  {chReady ? "Press “Look up” to read this company's record — accounts dates, address and status — from Companies House."
                    : "With a Companies House API key (CH_API_KEY) set, this shows the company's record and accounts dates from Companies House."}
                </p>
              )}
              {chMsg && <p className="note">{chMsg}</p>}
            </div>
          </div>
          <div className="card">
            <div className="hd"><h3>Deadlines</h3></div>
            <div className="bd"><DeadlineList deadlines={deadlines.slice(0, 6)} showCompany={false} empty={company.incorporatedOn ? "Nothing due." : "Add the incorporation date, or look the company up at Companies House, to see its deadlines."} /></div>
          </div>
        </div>

        <div className="card" id="start" style={{ scrollMarginTop: 96 }}>
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

        <CompanyNotes companyId={company.id} />

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
