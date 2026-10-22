"use client";

import { useState } from "react";
import type { DashboardData } from "@/lib/return-actions";
import DeadlineList from "../dashboard/DeadlineList";
import { Calendar, money } from "../dashboard/parts";

type Filter = "all" | "overdue" | "soon" | "ct600" | "ct-payment" | "ch-accounts" | "not-started";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" }, { key: "overdue", label: "Overdue" }, { key: "soon", label: "Next 30 days" },
  { key: "ct600", label: "Tax returns" }, { key: "ct-payment", label: "Tax to pay" }, { key: "ch-accounts", label: "Companies House" },
  { key: "not-started", label: "Not started" },
];

/** Every deadline in the account: a month at a glance, and the full list. */
export default function DeadlinesClient({ data, today }: { data: DashboardData; today: string }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const shown = data.deadlines.filter((d) =>
    (filter === "all" ? true : filter === "overdue" ? d.state === "overdue" : filter === "soon" ? d.state === "soon" : filter === "ch-accounts" ? d.kind === "ch-accounts" || d.kind === "confirmation" : d.kind === filter)
    && (!q.trim() || d.companyName.toLowerCase().includes(q.trim().toLowerCase())));
  const tax = shown.filter((d) => d.kind === "ct-payment" && d.amount != null).reduce((s, d) => s + (d.amount ?? 0), 0);
  return (
    <>
      <div className="topbar">
        <div>
          <h2>Deadlines</h2>
          <div className="sub">Every return, tax payment and Companies House filing, for every company.</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <a className="btn ghost" href="/companies/export">Download as a spreadsheet</a>
          <a className="btn" href="/calendar.ics">Add to your calendar</a>
        </div>
      </div>
      <div className="content">
        {data.error && <div className="banner bad"><span>✕</span><span>{data.error}</span></div>}
        <div className="banner info">
          <span>◷</span>
          <span><b>Add to your calendar</b> downloads a calendar file of every deadline below, with a reminder a week before and a day before. Open it with Outlook, Apple Calendar or Google Calendar (Settings, then Import). Download it again after adding companies or returns.</span>
        </div>
        <div className="card">
          <div className="bd"><Calendar deadlines={data.deadlines} today={today} big /></div>
        </div>
        <div className="card">
          <div className="hd">
            <h3>{shown.length} deadline{shown.length === 1 ? "" : "s"}{tax ? <span className="note" style={{ marginLeft: 10 }}>{money(tax, true)} of tax</span> : null}</h3>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by company" aria-label="Filter by company" style={{ maxWidth: 280 }} />
          </div>
          <div className="bd">
            <div className="chips">
              {FILTERS.map((f) => <button type="button" key={f.key} className={`chip ${filter === f.key ? "on" : ""}`} onClick={() => setFilter(f.key)}>{f.label}</button>)}
            </div>
            <DeadlineList deadlines={shown} empty="Nothing in this list." />
          </div>
        </div>
      </div>
    </>
  );
}
