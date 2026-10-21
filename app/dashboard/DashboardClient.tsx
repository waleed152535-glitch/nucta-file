"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { DashboardData } from "@/lib/return-actions";
import AddCompany from "../companies/AddCompany";
import DeadlineList from "./DeadlineList";

const STATUS: Record<string, string> = {
  draft: "Draft", "accepted-test": "Passed HMRC's test service", "rejected-test": "Rejected by the test service",
  "submitted-test": "Awaiting the test service", "partly-sent-test": "One of two returns tested",
  accepted: "Filed with HMRC", "partly-filed": "One of two returns filed", "submitted-live": "Filed — awaiting HMRC",
};
const short = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

type Filter = "all" | "overdue" | "soon" | "ct600" | "ct-payment" | "ch-accounts" | "not-started";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" }, { key: "overdue", label: "Overdue" }, { key: "soon", label: "Next 30 days" },
  { key: "ct600", label: "Tax returns" }, { key: "ct-payment", label: "Tax to pay" }, { key: "ch-accounts", label: "Companies House" },
  { key: "not-started", label: "Not started" },
];

export default function DashboardClient({ data, chReady }: { data: DashboardData; chReady: boolean }) {
  const router = useRouter();
  const [tab, setTab] = useState<"deadlines" | "recent" | "companies">("deadlines");
  const [filter, setFilter] = useState<Filter>("all");
  const [adding, setAdding] = useState(false);
  const [picking, setPicking] = useState(false);
  const c = data.counts;
  const shown = data.deadlines.filter((d) =>
    filter === "all" ? true : filter === "overdue" ? d.state === "overdue" : filter === "soon" ? d.state === "soon" : d.kind === filter);

  return (
    <>
      <div className="topbar">
        <div>
          <h2>Dashboard</h2>
          <div className="sub">Every client&apos;s returns and deadlines, soonest first.</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="btn ghost" onClick={() => { setAdding(!adding); setPicking(false); }}>Add a company</button>
          <button type="button" className="btn" onClick={() => { setPicking(!picking); setAdding(false); }}>+ New return</button>
        </div>
      </div>
      <div className="content">
        {data.error && <div className="banner bad"><span>✕</span><span>{data.error}</span></div>}
        {adding && <AddCompany chReady={chReady} onCancel={() => setAdding(false)} />}
        {picking && (
          <div className="card">
            <div className="hd"><h3>New return — which company?</h3><button type="button" className="btn ghost sm" onClick={() => setPicking(false)}>Cancel</button></div>
            <div className="bd">
              {data.companies.length === 0 && <p className="note">Add a company first.</p>}
              <select defaultValue="" onChange={(e) => e.target.value && router.push(`/companies/${e.target.value}`)} style={{ width: "100%", padding: 9 }}>
                <option value="" disabled>Choose a company…</option>
                {data.companies.map((x) => <option key={x.id} value={x.id}>{x.name}{x.companyNo ? ` (${x.companyNo})` : ""}</option>)}
              </select>
            </div>
          </div>
        )}

        <div className="stats">
          <div className="stat"><div className="l">Companies</div><div className="n">{c.companies}</div></div>
          <div className={`stat ${c.overdue ? "bad" : ""}`}><div className="l">Overdue</div><div className="n">{c.overdue}</div></div>
          <div className={`stat ${c.dueSoon ? "warn" : ""}`}><div className="l">Due in the next 30 days</div><div className="n">{c.dueSoon}</div></div>
          <div className="stat"><div className="l">Returns filed with HMRC</div><div className="n">{c.filed}</div></div>
          <div className="stat"><div className="l">Passed the test service</div><div className="n">{c.passedTest}</div></div>
        </div>

        <div className="card">
          <div className="tabs">
            <button type="button" className={tab === "deadlines" ? "on" : ""} onClick={() => setTab("deadlines")}>Upcoming deadlines ({data.deadlines.length})</button>
            <button type="button" className={tab === "recent" ? "on" : ""} onClick={() => setTab("recent")}>Recent returns</button>
            <button type="button" className={tab === "companies" ? "on" : ""} onClick={() => setTab("companies")}>Companies ({c.companies})</button>
          </div>
          <div className="bd">
            {tab === "deadlines" && (
              <>
                <div className="chips">
                  {FILTERS.map((f) => (
                    <button type="button" key={f.key} className={`chip ${filter === f.key ? "on" : ""}`} onClick={() => setFilter(f.key)}>{f.label}</button>
                  ))}
                </div>
                <DeadlineList deadlines={shown} empty={data.companies.length ? "Nothing in this list." : "Add your first company to see its deadlines."} />
              </>
            )}
            {tab === "recent" && (
              data.recent.length === 0 ? <p className="note">No returns yet. Press “New return” to start one.</p>
                : data.recent.map((r) => (
                  <Link key={r.id} href={`/returns/${r.id}`} className="check" style={{ textDecoration: "none", color: "inherit" }}>
                    <span className={`mark ${r.status === "accepted" || r.status === "accepted-test" ? "ok" : "no"}`}>{r.status === "accepted" || r.status === "accepted-test" ? "✓" : "–"}</span>
                    <span style={{ flex: 1 }}>
                      <div className="t">{r.companyName}{r.amendment ? " · amended return" : ""}</div>
                      <div className="d">{short(r.periodStart)} to {short(r.periodEnd)}{r.parts > 1 ? " · two returns" : ""} · {STATUS[r.status] ?? r.status}</div>
                    </span>
                    <span className="note">updated {new Date(r.updatedAt).toLocaleDateString("en-GB")}</span>
                  </Link>
                ))
            )}
            {tab === "companies" && (
              data.companies.length === 0 ? <p className="note">No companies yet.</p>
                : data.companies.map((x) => (
                  <Link key={x.id} href={`/companies/${x.id}`} className="check" style={{ textDecoration: "none", color: "inherit" }}>
                    <span className={`mark ${x.next?.state ?? "ok"}`}>⌂</span>
                    <span style={{ flex: 1 }}>
                      <div className="t">{x.name}</div>
                      <div className="d"><span className="mono">{x.companyNo}</span> · {x.returns} return{x.returns === 1 ? "" : "s"}</div>
                    </span>
                    <span className="note" style={{ textAlign: "right" }}>
                      {x.next ? <>Next: {x.next.label.toLowerCase()}<br />{short(x.next.due)}</> : "Nothing due"}
                    </span>
                  </Link>
                ))
            )}
          </div>
        </div>
      </div>
    </>
  );
}
