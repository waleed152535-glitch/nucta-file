"use client";

/**
 * Dormant accounts for many companies at once. Each chosen company gets its
 * period, share capital, director and Companies House authentication code;
 * the approval date and contact are shared. Filing goes one company at a
 * time, so each gets its own answer, and stops for nothing: a problem with
 * one company doesn't hold up the rest.
 *
 * Authentication codes stay in this page's memory and go only with each
 * company's filing.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { dormantCandidates, fileDormant, type DormantCandidate } from "@/lib/dormant-actions";
import { dormantRowProblems } from "@/lib/dormant";

const day = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
interface Row { pick: boolean; start: string; end: string; capital: string; paid: boolean; everTraded: boolean; director: string; code: string; first: boolean }
interface Result { ok: boolean; headline: string; detail: string[]; returnId?: string; submission?: string }

export default function DormantClient({ userName, today }: { userName: string; today: string }) {
  const [list, setList] = useState<DormantCandidate[] | null>(null);
  const [meta, setMeta] = useState<{ live: boolean; chReady: boolean; error?: string }>({ live: true, chReady: true });
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [approvedOn, setApprovedOn] = useState(today);
  const [contact, setContact] = useState({ name: userName, phone: "" });
  const [confirmed, setConfirmed] = useState(false);
  const [results, setResults] = useState<Record<string, Result>>({});
  const [running, setRunning] = useState<string | null>(null);
  const [onlyDue, setOnlyDue] = useState(true);

  useEffect(() => {
    void (async () => {
      const r = await dormantCandidates();
      setMeta({ live: r.live, chReady: r.chReady, error: r.error });
      setList(r.companies);
      setRows(Object.fromEntries(r.companies.map((c) => [c.companyId, {
        pick: false, start: c.period?.start ?? "", end: c.period?.end ?? "",
        capital: c.shareCapital != null ? String(c.shareCapital) : "", paid: c.paid ?? false, everTraded: c.everTraded,
        director: c.directors.length === 1 ? c.directors[0] : "", code: "", first: c.first,
      }])));
    })();
  }, []);

  const shown = useMemo(() => (list ?? []).filter((c) => !onlyDue || (c.period && c.period.end <= today && !c.blocked)), [list, onlyDue, today]);
  const picked = (list ?? []).filter((c) => rows[c.companyId]?.pick && !c.blocked);
  const set = (id: string, v: Partial<Row>) => setRows((r) => ({ ...r, [id]: { ...r[id], ...v } }));
  const rowProblems = (c: DormantCandidate) => {
    const r = rows[c.companyId];
    const p = dormantRowProblems({ companyId: c.companyId, periodStart: r.start, periodEnd: r.end, shareCapital: Number(r.capital), paid: r.paid, everTraded: r.everTraded, director: r.director, first: r.first }, approvedOn, today);
    if (!/^[A-Z0-9]{6}$/.test(r.code)) p.push("Enter the company's 6-character authentication code.");
    return p;
  };
  const ready = picked.length > 0 && picked.every((c) => rowProblems(c).length === 0) && confirmed && contact.name.trim() && contact.phone.trim();

  const fileAll = async () => {
    for (const c of picked) {
      if (results[c.companyId]?.ok) continue;
      setRunning(c.companyId);
      const r = rows[c.companyId];
      const res = await fileDormant(
        { companyId: c.companyId, periodStart: r.start, periodEnd: r.end, shareCapital: Number(r.capital), paid: r.paid, everTraded: r.everTraded, director: r.director, first: r.first, authCode: r.code },
        { approvedOn, contactName: contact.name, contactPhone: contact.phone, confirmed },
      );
      setResults((x) => ({ ...x, [c.companyId]: { ok: res.ok, headline: res.headline, detail: [...res.detail, ...(res.filing?.reasons.map((q) => q.text) ?? [])], returnId: res.returnId, submission: res.filing?.submissionNumber } }));
      if (res.ok) set(c.companyId, { code: "" });
    }
    setRunning(null);
  };

  const sent = Object.values(results).filter((r) => r.ok).length;
  return (
    <>
      <div className="topbar"><div className="hello"><div>
        <h2>Dormant accounts in bulk</h2>
        <p className="sum">File dormant accounts with Companies House for many companies at once. Each one gets its own return in Nucta Filings, with the accounts and Companies House&apos;s answer.</p>
      </div></div></div>
      <div className="content">
        {meta.error && <div className="banner bad"><span>✕</span><span>{meta.error}</span></div>}
        {!meta.live && <div className="banner info"><span>!</span><span>Filing with Companies House isn&apos;t switched on for this site yet. You can prepare the accounts, but not send them.</span></div>}
        <div className="banner info"><span>i</span><span>
          For companies that did nothing all year and whose balance sheet is only their share capital, still owed by the shareholders or held as cash.
          A company with anything else (a bank balance beyond its shares, loans, costs paid) needs its own return. HMRC need a nil CT600 only if they sent the company a notice to file; that can be filed later from each company&apos;s return.
        </span></div>

        {!list ? <div className="card"><div className="bd"><span className="note">Reading the companies{meta.chReady ? " and Companies House's records" : ""}…</span></div></div> : (
          <div className="card">
            <div className="hd">
              <h3>Companies</h3>
              <label className="note" style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
                <input type="checkbox" checked={onlyDue} onChange={(e) => setOnlyDue(e.target.checked)} /> Only companies with a year ended and nothing filed for it
              </label>
            </div>
            <div className="bd" style={{ overflowX: "auto" }}>
              {shown.length === 0 ? <p className="note">{list.length ? "No company needs dormant accounts right now. Untick the box above to see them all." : <>No companies yet. <Link href="/companies">Add your companies</Link> first.</>}</p> : (
                <table className="paytable dormant-table">
                  <thead><tr><th /><th>Company</th><th>Period</th><th>Share capital</th><th>Director approving</th><th>Authentication code</th><th>Result</th></tr></thead>
                  <tbody>
                    {shown.map((c) => {
                      const r = rows[c.companyId];
                      const res = results[c.companyId];
                      const probs = r.pick ? rowProblems(c) : [];
                      return (
                        <tr key={c.companyId} className={r.pick ? "picked" : ""}>
                          <td><input type="checkbox" aria-label={`File ${c.name}`} checked={r.pick} disabled={Boolean(c.blocked) || running !== null} onChange={(e) => set(c.companyId, { pick: e.target.checked })} /></td>
                          <td>
                            <b>{c.name}</b><div className="note mono">{c.companyNo ?? "no number"}</div>
                            {c.due && <div className={`note ${c.overdue ? "late" : ""}`}>Due {day(c.due)}{c.overdue ? " · overdue" : ""}</div>}
                            {c.lastType && <div className="note">Last filed: {c.lastType.replace(/-/g, " ")}{c.lastMadeUpTo ? `, to ${day(c.lastMadeUpTo)}` : ""}</div>}
                            {c.blocked && <div className="note">{c.blocked}{c.filed ? <> · <Link href={`/returns/${c.filed.returnId}?step=file`}>open</Link></> : null}</div>}
                          </td>
                          <td>
                            <input type="date" value={r.start} onChange={(e) => set(c.companyId, { start: e.target.value })} aria-label="Period from" />
                            <input type="date" value={r.end} onChange={(e) => set(c.companyId, { end: e.target.value })} aria-label="Period to" style={{ marginTop: 4 }} />
                            <label className="note" style={{ display: "flex", gap: 4, marginTop: 4 }}><input type="checkbox" checked={r.first} onChange={(e) => set(c.companyId, { first: e.target.checked })} /> First accounts</label>
                          </td>
                          <td>
                            <input inputMode="decimal" value={r.capital} placeholder="e.g. 100" onChange={(e) => set(c.companyId, { capital: e.target.value.replace(/[^0-9.]/g, "") })} aria-label="Share capital in pounds" style={{ width: 90 }} />
                            <label className="note" style={{ display: "flex", gap: 4, marginTop: 4 }}><input type="checkbox" checked={r.paid} onChange={(e) => set(c.companyId, { paid: e.target.checked })} /> Paid (held as cash)</label>
                            <label className="note" style={{ display: "flex", gap: 4 }}><input type="checkbox" checked={r.everTraded} onChange={(e) => set(c.companyId, { everTraded: e.target.checked })} /> Has traded before</label>
                          </td>
                          <td>
                            {c.directors.length > 1 ? (
                              <select value={r.director} onChange={(e) => set(c.companyId, { director: e.target.value })} aria-label="Director">
                                <option value="">Choose…</option>
                                {c.directors.map((d) => <option key={d} value={d}>{d}</option>)}
                              </select>
                            ) : <input value={r.director} placeholder="Full name" onChange={(e) => set(c.companyId, { director: e.target.value })} aria-label="Director" />}
                          </td>
                          <td><input value={r.code} maxLength={6} autoComplete="off" spellCheck={false} placeholder="6 characters" style={{ width: 110, textTransform: "uppercase", letterSpacing: "0.1em" }}
                            onChange={(e) => set(c.companyId, { code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })} aria-label="Companies House authentication code" /></td>
                          <td style={{ minWidth: 200 }}>
                            {running === c.companyId ? <span className="note">Sending…</span>
                              : res ? <div className={res.ok ? "good-text" : "bad-text"}><b>{res.ok ? `Received · ${res.submission}` : res.headline}</b>
                                {res.detail.length > 0 && <ul style={{ margin: "4px 0 0", paddingLeft: 16 }}>{res.detail.map((d, i) => <li key={i}>{d}</li>)}</ul>}
                                {res.returnId && <div><Link href={`/returns/${res.returnId}?step=file`}>Open the return</Link></div>}</div>
                              : probs.length ? <ul className="note" style={{ margin: 0, paddingLeft: 16 }}>{probs.map((p, i) => <li key={i}>{p}</li>)}</ul>
                              : r.pick ? <span className="note">Ready</span> : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {picked.length > 0 && (
          <div className="card">
            <div className="hd"><h3>File {picked.length} compan{picked.length === 1 ? "y" : "ies"}</h3>{sent > 0 && <span className="note">{sent} received by Companies House</span>}</div>
            <div className="bd">
              <div className="grid2">
                <div className="field"><label>Date the directors approved the accounts<span className="hint">the same for every company chosen</span></label>
                  <input type="date" value={approvedOn} max={today} onChange={(e) => setApprovedOn(e.target.value)} /></div>
                <div />
                <div className="field"><label>Contact name<span className="hint">shown to Companies House</span></label><input value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} /></div>
                <div className="field"><label>Contact phone</label><input inputMode="tel" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} /></div>
              </div>
              <label className="check" style={{ cursor: "pointer" }}>
                <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} style={{ marginTop: 3 }} />
                <span>Each company was dormant for the whole period, its director named above approved these dormant accounts on that date, and I&apos;m authorised to deliver them to Companies House.</span>
              </label>
              <button type="button" className="btn" style={{ marginTop: 10 }} disabled={!ready || running !== null || !meta.live} onClick={() => void fileAll()}>
                {running ? "Filing…" : `File dormant accounts for ${picked.length} compan${picked.length === 1 ? "y" : "ies"}`}
              </button>
              <p className="note" style={{ marginTop: 8 }}>Companies House answer each one within about a day. Each company&apos;s return shows the result, and you get an email for each decision.</p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
