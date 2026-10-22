"use client";

/**
 * The dashboard's pieces, also used by the Deadlines page: a month calendar of
 * deadlines, the board of returns by stage, Corporation Tax by month, what
 * happened lately, and the company table.
 */
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Deadline } from "@/lib/deadlines";
import type { ActivityItem, DashboardData, DashboardReturn } from "@/lib/return-actions";
import DeadlineList from "./DeadlineList";

export const shortDate = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
export const money = (n: number, pence = false) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: pence ? 2 : 0, maximumFractionDigits: pence ? 2 : 0 })}`;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const iso = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

export const dotOf = (d: Deadline) =>
  d.state === "overdue" ? "late" : d.kind === "ct600" ? "ct600" : d.kind === "ct-payment" ? "pay" : d.kind === "ch-accounts" || d.kind === "confirmation" ? "ch" : "start";
const SHORT_LABEL: Record<Deadline["kind"], string> = { ct600: "Tax return", "ct-payment": "Tax to pay", "ch-accounts": "Accounts", confirmation: "Confirmation", "not-started": "Start" };

/** A month of deadlines. Small on the dashboard; large, with each deadline written in, on the Deadlines page. */
export function Calendar({ deadlines, today, big = false }: { deadlines: Deadline[]; today: string; big?: boolean }) {
  const [ty, tm] = today.split("-").map(Number);
  const [offset, setOffset] = useState(0);
  const [sel, setSel] = useState<string | null>(null);
  const y = ty + Math.floor((tm - 1 + offset) / 12), m = (((tm - 1 + offset) % 12) + 12) % 12;
  const byDay = useMemo(() => {
    const map = new Map<string, Deadline[]>();
    for (const d of deadlines) { if (d.kind === "not-started" && d.label !== "Return not started") continue; map.set(d.due, [...(map.get(d.due) ?? []), d]); }
    return map;
  }, [deadlines]);
  const first = new Date(Date.UTC(y, m, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const cells: { date: string; day: number; out: boolean }[] = [];
  for (let i = 0; i < lead; i++) { const d = new Date(Date.UTC(y, m, i - lead + 1)); cells.push({ date: d.toISOString().slice(0, 10), day: d.getUTCDate(), out: true }); }
  for (let d = 1; d <= days; d++) cells.push({ date: iso(y, m, d), day: d, out: false });
  while (cells.length % 7) { const d = new Date(Date.UTC(y, m + 1, cells.length - lead - days + 1)); cells.push({ date: d.toISOString().slice(0, 10), day: d.getUTCDate(), out: true }); }
  const monthCount = cells.filter((c) => !c.out).reduce((n, c) => n + (byDay.get(c.date)?.length ?? 0), 0);
  const picked = sel ? byDay.get(sel) ?? [] : [];

  return (
    <div className={`cal${big ? " big" : ""}`}>
      <div className="head">
        <b>{MONTHS[m]} {y}<span className="note" style={{ marginLeft: 10, fontFamily: "var(--sans)", fontWeight: 400 }}>{monthCount} deadline{monthCount === 1 ? "" : "s"}</span></b>
        <div className="nav2">
          <button type="button" aria-label="Previous month" onClick={() => { setOffset(offset - 1); setSel(null); }}>‹</button>
          <button type="button" aria-label="This month" onClick={() => { setOffset(0); setSel(null); }} style={{ width: "auto", padding: "0 10px", fontSize: 12 }}>Today</button>
          <button type="button" aria-label="Next month" onClick={() => { setOffset(offset + 1); setSel(null); }}>›</button>
        </div>
      </div>
      <div className="grid" role="grid" aria-label={`${MONTHS[m]} ${y}`}>
        {DOW.map((d) => <div key={d} className="dow" role="columnheader">{big ? d : d[0]}</div>)}
        {cells.map((c) => {
          const evs = byDay.get(c.date) ?? [];
          const cls = ["day", c.out && "out", c.date === today && "today", evs.length && "has", sel === c.date && "sel"].filter(Boolean).join(" ");
          return (
            <button type="button" key={c.date} className={cls} onClick={() => setSel(sel === c.date ? null : c.date)}
              aria-label={`${shortDate(c.date)}: ${evs.length ? `${evs.length} deadline${evs.length === 1 ? "" : "s"}` : "nothing due"}`}>
              {big ? (
                <>
                  <span className="num">{c.day}</span>
                  <span className="evs">{evs.slice(0, 3).map((e, i) => <span key={i} className={`ev ${dotOf(e)}`}>{SHORT_LABEL[e.kind]}: {e.companyName}</span>)}
                    {evs.length > 3 && <span className="note" style={{ fontSize: 11 }}>and {evs.length - 3} more</span>}</span>
                </>
              ) : (
                <>
                  <span>{c.day}</span>
                  <span className="dots">{evs.slice(0, 3).map((e, i) => <i key={i} className={`dot-${dotOf(e)}`} />)}</span>
                </>
              )}
            </button>
          );
        })}
      </div>
      <div className="legend">
        <span><i className="dot-ct600" />Tax return</span><span><i className="dot-pay" />Tax to pay</span><span><i className="dot-ch" />Accounts to Companies House</span><span><i className="dot-late" />Overdue</span>
      </div>
      {sel && (
        <div className="daylist">
          <div className="note" style={{ marginBottom: 2 }}>{shortDate(sel)}</div>
          <DeadlineList deadlines={picked} empty="Nothing due that day." />
        </div>
      )}
    </div>
  );
}

const IN_PROGRESS = new Set(["draft", "rejected-test", "submitted-test"]);
const TESTED = new Set(["accepted-test", "partly-sent-test"]);
const FILED = new Set(["accepted", "submitted-live", "partly-filed"]);
const STAGE_NOTE: Record<string, string> = {
  draft: "Draft", "rejected-test": "Test turned down", "submitted-test": "Waiting for the test service",
  "accepted-test": "Passed", "partly-sent-test": "One of two tested", accepted: "Filed", "submitted-live": "Waiting for HMRC", "partly-filed": "One of two filed",
};

/** Every return by where it has got to, from not started to filed. */
export function Board({ data }: { data: DashboardData }) {
  const notStarted = data.deadlines.filter((d) => d.kind === "not-started" && d.label === "Return not started");
  const lanes: { cls: string; title: string; items: DashboardReturn[] }[] = [
    { cls: "l2", title: "In progress", items: data.returns.filter((r) => IN_PROGRESS.has(r.status)) },
    { cls: "l3", title: "Passed HMRC's test", items: data.returns.filter((r) => TESTED.has(r.status)) },
    { cls: "l4", title: "Filed", items: data.returns.filter((r) => FILED.has(r.status)) },
  ];
  const SHOW = 5;
  return (
    <div className="board">
      <div className="lane l1">
        <h4><b>Not started</b><span>{notStarted.length}</span></h4>
        {notStarted.slice(0, SHOW).map((d) => (
          <Link key={d.companyId + d.periodTo} className={`ticket${d.state === "overdue" ? " warnt" : ""}`} href={`/companies/${d.companyId}?from=${d.periodFrom}&to=${d.periodTo}#start`}>
            <b>{d.companyName}</b><span><span>Year to {shortDate(d.periodTo)}</span><span className={d.state === "overdue" ? "late-t" : ""}>due {shortDate(d.due)}</span></span>
          </Link>
        ))}
        {notStarted.length > SHOW && <div className="more">and {notStarted.length - SHOW} more</div>}
        {!notStarted.length && <div className="more">Every finished year has a return.</div>}
      </div>
      {lanes.map((l) => (
        <div key={l.cls} className={`lane ${l.cls}`}>
          <h4><b>{l.title}</b><span>{l.items.length}</span></h4>
          {l.items.slice(0, SHOW).map((r) => (
            <Link key={r.id} href={`/returns/${r.id}`} className={`ticket${r.status === "rejected-test" ? " warnt" : ""}`}>
              <b>{r.companyName}{r.amendment ? " (amended)" : ""}</b>
              <span><span>Year to {shortDate(r.periodEnd)}</span><span className="tx">{r.tax != null ? money(r.tax) : STAGE_NOTE[r.status] ?? ""}</span></span>
              {r.tax != null && <span><span>{STAGE_NOTE[r.status] ?? r.status}</span>{r.parts > 1 ? <span>two returns</span> : <span />}</span>}
              {r.approval && <span><span className={r.approval === "approved" ? "ok-t" : "soon-t"}>{r.approval === "approved" ? "Approved by the director" : r.approval === "query" ? "Director asked a question" : "Waiting for the director's approval"}</span></span>}
            </Link>
          ))}
          {l.items.length > SHOW && <div className="more">and {l.items.length - SHOW} more</div>}
          {!l.items.length && <div className="more">Nothing here yet.</div>}
        </div>
      ))}
    </div>
  );
}

/** Corporation Tax falling due in each of the next twelve months. */
export function TaxChart({ deadlines, today }: { deadlines: Deadline[]; today: string }) {
  const [ty, tm] = today.split("-").map(Number);
  const months = Array.from({ length: 12 }, (_, i) => { const y = ty + Math.floor((tm - 1 + i) / 12), m = (tm - 1 + i) % 12; return { y, m, key: `${y}-${String(m + 1).padStart(2, "0")}`, total: 0, n: 0 }; });
  let overdue = 0;
  for (const d of deadlines) {
    if (d.kind !== "ct-payment" || d.amount == null) continue;
    if (d.state === "overdue") { overdue += d.amount; continue; }
    const mo = months.find((x) => d.due.startsWith(x.key));
    if (mo) { mo.total += d.amount; mo.n++; }
  }
  const max = Math.max(1, ...months.map((x) => x.total));
  const sum = months.reduce((s, x) => s + x.total, 0);
  const W = 720, H = 200, bw = W / 12;
  return (
    <div className="chart">
      <div className="total"><b>{money(sum)}</b><span className="note">due in the next 12 months{overdue ? `, plus ${money(overdue)} already past its date` : ""}</span></div>
      <svg viewBox={`0 0 ${W} ${H + 24}`} role="img" aria-label={`Corporation Tax due by month: ${months.filter((x) => x.total).map((x) => `${MONTHS[x.m]} ${money(x.total)}`).join(", ") || "none"}`}>
        <defs>
          <linearGradient id="taxbar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FF8466" /><stop offset="1" stopColor="#B4230A" /></linearGradient>
        </defs>
        {[0.25, 0.5, 0.75, 1].map((f) => <line key={f} x1="0" x2={W} y1={H - f * (H - 26)} y2={H - f * (H - 26)} stroke="rgba(196,210,240,.07)" />)}
        {months.map((x, i) => {
          const h = x.total ? Math.max(4, (x.total / max) * (H - 26)) : 3;
          return (
            <g key={x.key}>
              <rect className={`bar-r${x.total ? "" : " zero"}`} x={i * bw + bw * 0.2} y={H - h} width={bw * 0.6} height={h} rx="5" />
              {x.total > 0 && <text className="v" x={i * bw + bw / 2} y={H - h - 7} textAnchor="middle">{x.total >= 1000 ? `£${(x.total / 1000).toFixed(x.total >= 10000 ? 0 : 1)}k` : money(x.total)}</text>}
              <text x={i * bw + bw / 2} y={H + 17} textAnchor="middle">{MONTHS[x.m].slice(0, 3)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

const ago = (isoTime: string) => {
  const s = (Date.now() - Date.parse(isoTime)) / 1000;
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.round(s / 86400)} d ago`;
  return new Date(isoTime).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

/** Tests and filings with HMRC, newest first, with the returns edited lately. */
export function Feed({ activity, recent }: { activity: ActivityItem[]; recent: DashboardReturn[] }) {
  const items = [
    ...activity.map((a) => ({ at: a.at, href: a.returnId ? `/returns/${a.returnId}` : "#", title: a.what, who: a.companyName, tone: a.tone })),
    ...recent.slice(0, 6).map((r) => ({ at: r.updatedAt, href: `/returns/${r.id}`, title: "Return updated", who: `${r.companyName}, year to ${shortDate(r.periodEnd)}`, tone: "info" as const })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 9);
  if (!items.length) return <p className="note">Nothing yet. Tests and filings with HMRC will show here.</p>;
  return (
    <div className="feed">
      {items.map((x, i) => (
        <Link key={i} href={x.href} className={`ev ${x.tone}`} style={{ color: "inherit" }}>
          <i aria-hidden />
          <span><b>{x.title}</b><span>{x.who}</span></span>
          <time dateTime={x.at} suppressHydrationWarning>{ago(x.at)}</time>
        </Link>
      ))}
    </div>
  );
}

/** Every company, searchable, soonest deadline first. */
export function CompanyTable({ companies }: { companies: DashboardData["companies"] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const rows = companies
    .filter((c) => !q.trim() || `${c.name} ${c.companyNo ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => (a.next?.due ?? "9999").localeCompare(b.next?.due ?? "9999"));
  return (
    <>
      <div className="searchrow" style={{ padding: "16px 20px 6px" }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by name or number" aria-label="Filter companies" />
        <span className="note">{rows.length} of {companies.length}</span>
        <span style={{ flex: 1 }} />
        <a className="btn ghost sm" href="/companies/export">Download as a spreadsheet</a>
      </div>
      <table className="ctable">
        <thead><tr><th>Company</th><th className="hide-m">Returns</th><th>Next deadline</th><th className="num">Due</th></tr></thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id} onClick={() => router.push(`/companies/${c.id}`)}>
              <td><Link href={`/companies/${c.id}`} className="co" style={{ color: "var(--text)" }}>{c.name}<small>{c.companyNo}</small></Link></td>
              <td className="hide-m">{c.returns}</td>
              <td>{c.next ? c.next.label : <span className="note">Nothing due</span>}</td>
              <td className={`num ${c.next?.state === "overdue" ? "late-t" : c.next?.state === "soon" ? "soon-t" : ""}`}>{c.next ? shortDate(c.next.due) : ""}</td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={4} className="note">No company matches.</td></tr>}
        </tbody>
      </table>
    </>
  );
}
