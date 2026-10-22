"use client";

/**
 * The dashboard: what needs doing first, where every return has got to, the
 * tax falling due, and every company and deadline, for one company or a
 * practice's whole client list.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import type { DashboardData } from "@/lib/return-actions";
import AddCompany from "../companies/AddCompany";
import DeadlineList from "./DeadlineList";
import { Board, Calendar, CompanyTable, Feed, TaxChart, money, shortDate } from "./parts";
import { openPalette } from "@/components/AppBar";
import DashTasks from "./DashTasks";

type Filter = "all" | "overdue" | "soon" | "ct600" | "ct-payment" | "ch-accounts" | "not-started";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" }, { key: "overdue", label: "Overdue" }, { key: "soon", label: "Next 30 days" },
  { key: "ct600", label: "Tax returns" }, { key: "ct-payment", label: "Tax to pay" }, { key: "ch-accounts", label: "Companies House" },
  { key: "not-started", label: "Not started" },
];

const I = {
  doc: <svg viewBox="0 0 24 24"><path d="M6 2.5h8l4 4v15H6z" /><path d="M14 2.5v4h4M9 12h6M9 16h4" /></svg>,
  plus: <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>,
  cal: <svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>,
  sheet: <svg viewBox="0 0 24 24"><rect x="4" y="3.5" width="16" height="17" rx="2" /><path d="M4 9h16M4 14h16M10 3.5v17" /></svg>,
};

function greeting(h: number) { return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"; }

export default function DashboardClient({ data, chReady, who, supportEmail, today }: {
  data: DashboardData; chReady: boolean; who: { firstName: string; practice: boolean }; supportEmail: string; today: string;
}) {
  const [tab, setTab] = useState<"deadlines" | "companies">("deadlines");
  const [filter, setFilter] = useState<Filter>("all");
  const [adding, setAdding] = useState(false);
  const [hello, setHello] = useState("Welcome back");
  useEffect(() => { setHello(greeting(new Date().getHours())); }, []);
  const c = data.counts;
  const shown = data.deadlines.filter((d) =>
    filter === "all" ? true : filter === "overdue" ? d.state === "overdue" : filter === "soon" ? d.state === "soon" : filter === "ch-accounts" ? d.kind === "ch-accounts" || d.kind === "confirmation" : d.kind === filter);
  const attention = data.deadlines.filter((d) => d.state === "overdue" || (d.state === "soon" && d.daysLeft <= 30)).slice(0, 7);
  const in90 = data.deadlines.filter((d) => d.kind === "ct-payment" && d.amount != null && d.daysLeft >= 0 && d.daysLeft <= 90).reduce((s, d) => s + (d.amount ?? 0), 0);
  const summary: string[] = [];
  if (c.overdue) summary.push(`${c.overdue} overdue`);
  if (c.dueSoon) summary.push(`${c.dueSoon} due in the next 30 days`);
  if (in90) summary.push(`${money(in90)} of Corporation Tax due in the next 90 days`);
  const empty = data.companies.length === 0 && !data.error;
  const name = who.firstName ? `, ${who.firstName}` : "";

  return (
    <>
      <div className="topbar">
        <div className="hello" style={{ width: "100%" }}>
          <div>
            <h2 suppressHydrationWarning>{hello}{name}.</h2>
            <p className="sum">
              {empty ? (who.practice ? "Add your first client and Nucta File will keep every deadline for you." : "Add your company and Nucta File will keep every deadline for you.")
                : summary.length ? <>You have <b>{summary.join(", ")}</b>.</> : <>Nothing is overdue or due in the next 30 days.</>}
              {" "}{!empty && <span className="note">{who.practice ? `${c.companies} client compan${c.companies === 1 ? "y" : "ies"}` : "Your company"}, as at {shortDate(today)}.</span>}
            </p>
          </div>
        </div>
      </div>
      <div className="content">
        {data.error && <div className="banner bad"><span>✕</span><span>{data.error}</span></div>}

        <div className="quick">
          <button type="button" onClick={() => openPalette("new")} disabled={empty}><span className="qi">{I.doc}</span><span>Start a return<small>Pick a company and a year</small></span></button>
          <button type="button" onClick={() => setAdding(!adding)}><span className="qi">{I.plus}</span><span>Add a company<small>{chReady ? "From Companies House" : "Type in the details"}</small></span></button>
          <a href="/calendar.ics"><span className="qi">{I.cal}</span><span>Add deadlines to your calendar<small>Outlook, Google or your phone</small></span></a>
          <a href="/companies/export"><span className="qi">{I.sheet}</span><span>Download the company list<small>A spreadsheet of every deadline</small></span></a>
        </div>

        {adding && <AddCompany chReady={chReady} onCancel={() => setAdding(false)} />}

        {empty && !adding ? (
          <div className="card welcome">
            <div className="bd">
              <h3>{who.practice ? "Let's add your first client." : "Let's get your company's return ready."}</h3>
              <ol className="welcome-steps">
                <li><b>{who.practice ? "Add a client company" : "Add your company"}</b>{chReady ? "Search Companies House by name or number; the address and accounts dates fill in." : "Type its name, number and Corporation Tax reference."}</li>
                <li><b>Start the return</b>Nucta File suggests the period from the company&apos;s accounts dates.</li>
                <li><b>Enter the year&apos;s figures</b>From the bookkeeping or last year&apos;s accounts. The tax is worked out as you type.</li>
                <li><b>Check, then send</b>Download the accounts, computation and CT600, test with HMRC&apos;s test service, then file with HMRC.</li>
              </ol>
              <button type="button" className="btn" onClick={() => setAdding(true)}>{who.practice ? "Add your first client" : "Add your company"}</button>
              <p className="note" style={{ marginTop: 14 }}>Stuck? Email <a href={`mailto:${supportEmail}`}>{supportEmail}</a> and we&apos;ll help you set up.</p>
            </div>
          </div>
        ) : !empty && (
          <>
            <div className="stats">
              <div className="stat"><div className="l">{who.practice ? "Client companies" : "Companies"}</div><div className="n">{c.companies}</div><div className="s">{data.returns.length} return{data.returns.length === 1 ? "" : "s"} in Nucta File</div></div>
              <div className={`stat ${c.overdue ? "bad" : ""}`}><div className="l">Overdue</div><div className="n">{c.overdue}</div><div className="s">{c.overdue ? "Deal with these first" : "All up to date"}</div></div>
              <div className={`stat ${c.dueSoon ? "warn" : ""}`}><div className="l">Due in the next 30 days</div><div className="n">{c.dueSoon}</div><div className="s">Returns, tax and accounts</div></div>
              <div className="stat money"><div className="l">Tax due in 90 days</div><div className="n">{money(in90)}</div><div className="s">Corporation Tax and loans tax</div></div>
              <div className={`stat ${c.filed ? "good" : ""}`}><div className="l">Filed with HMRC</div><div className="n">{c.filed}</div><div className="s">Receipts kept with each return</div></div>
              <div className="stat"><div className="l">Passed HMRC&apos;s test</div><div className="n">{c.passedTest}</div><div className="s">Ready to file with HMRC</div></div>
            </div>

            <div className="dgrid">
              <div className="card attn">
                <div className="hd"><h3>Needs your attention</h3><span className="note">Overdue first, then the next 30 days</span></div>
                <div className="bd" style={{ paddingTop: 6, paddingBottom: 6 }}>
                  {!attention.length && <p className="note" style={{ padding: "14px 0" }}>Nothing overdue and nothing due in the next 30 days.</p>}
                  {attention.map((d, i) => {
                    const href = d.returnId ? `/returns/${d.returnId}` : d.kind === "confirmation" ? `/companies/${d.companyId}` : `/companies/${d.companyId}?from=${d.periodFrom}&to=${d.periodTo}#start`;
                    return (
                      <div className="item" key={i}>
                        <span className={`pill ${d.state === "overdue" ? "bad" : "warn"}`}>{d.state === "overdue" ? "Overdue" : "Soon"}</span>
                        <span style={{ minWidth: 0 }}>
                          <div className="t" style={{ fontWeight: 600 }}>{d.label}{d.amount != null ? `: ${money(d.amount, true)}` : ""}</div>
                          <div className="note">{d.companyName}{d.kind === "confirmation" ? ", at Companies House" : `, year to ${shortDate(d.periodTo)}`}</div>
                        </span>
                        <span className={`when ${d.state === "overdue" ? "late" : "soon"}`}><b>{shortDate(d.due)}</b><span>{d.daysLeft < 0 ? `${-d.daysLeft} days overdue` : d.daysLeft === 0 ? "today" : `in ${d.daysLeft} days`}</span></span>
                        <Link className="btn ghost sm" href={href}>{d.returnId ? "Open" : d.kind === "not-started" ? "Start" : "Open"}</Link>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div>
                <div className="card">
                  <div className="hd"><h3>Calendar</h3><Link className="note" href="/deadlines">Full calendar</Link></div>
                  <div className="bd"><Calendar deadlines={data.deadlines} today={today} /></div>
                </div>
                <DashTasks today={today} />
              </div>
            </div>

            <div className="card">
              <div className="hd"><h3>Where every return has got to</h3><span className="note">From the year ending to HMRC&apos;s receipt</span></div>
              <Board data={data} />
            </div>

            <div className="grid2" style={{ alignItems: "start" }}>
              <div className="card">
                <div className="hd"><h3>Corporation Tax falling due</h3><span className="note">By month, from each return&apos;s figures</span></div>
                <TaxChart deadlines={data.deadlines} today={today} />
              </div>
              <div className="card">
                <div className="hd"><h3>Lately</h3><span className="note">Tests, filings and changes</span></div>
                <div className="bd" style={{ paddingTop: 6, paddingBottom: 6 }}><Feed activity={data.activity} recent={data.recent} /></div>
              </div>
            </div>

            <div className="card">
              <div className="tabs">
                <button type="button" className={tab === "deadlines" ? "on" : ""} onClick={() => setTab("deadlines")}>Every deadline ({data.deadlines.length})</button>
                <button type="button" className={tab === "companies" ? "on" : ""} onClick={() => setTab("companies")}>Companies ({c.companies})</button>
              </div>
              {tab === "deadlines" && (
                <div className="bd">
                  <div className="chips">
                    {FILTERS.map((f) => (
                      <button type="button" key={f.key} className={`chip ${filter === f.key ? "on" : ""}`} onClick={() => setFilter(f.key)}>{f.label}</button>
                    ))}
                  </div>
                  <DeadlineList deadlines={shown} empty="Nothing in this list." />
                </div>
              )}
              {tab === "companies" && <CompanyTable companies={data.companies} />}
            </div>
          </>
        )}
      </div>
    </>
  );
}
