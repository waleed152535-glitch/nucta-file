"use client";

/**
 * Filing the accounts with Companies House from the return: the Companies
 * House copy of the same accounts HMRC receive, sent through Nucta File's
 * presenter account. The company's authentication code lives only in this
 * component's memory and is sent once with the filing.
 *
 * Companies House answer twice: "received" at once, then accepted or
 * rejected after examining the accounts. The status here updates whenever
 * the return is opened, and an email goes to whoever filed when they decide.
 */
import { useCallback, useEffect, useState, useTransition } from "react";
import { chFilingState, checkChFiling, fileWithCompaniesHouse, type ChFilingState } from "@/lib/ch-filing-actions";
import type { ChFilingView, FileOutcome } from "@/lib/ch-filing";

const day = (iso: string) => new Date(iso + (iso.length === 10 ? "T12:00:00Z" : "")).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const MARK = { good: "✓", bad: "✕", info: "…", warn: "!" } as const;
const KIND = { micro: "micro-entity accounts", small: "small company accounts (balance sheet and notes)", dormant: "dormant company accounts" } as const;

function Filing({ f, latest }: { f: ChFilingView; latest: boolean }) {
  return (
    <div className={`banner ${f.tone === "warn" ? "info" : f.tone}`} style={{ marginTop: 10, marginBottom: 0, opacity: latest ? 1 : 0.75 }}>
      <span>{MARK[f.tone]}</span>
      <span>
        <b>{f.label}</b> · submission <span className="mono">{f.submissionNumber}</span>
        <div>{f.meaning}</div>
        {f.reasons.length > 0 && (
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {f.reasons.map((r, i) => <li key={i}>{r.text}{r.help && <div className="note" style={{ marginTop: 2 }}><b>What to do:</b> {r.help}</div>}</li>)}
          </ul>
        )}
        {f.examinerNote && !/^see reject reason$/i.test(f.examinerNote) && <div className="note">Examiner&apos;s note: {f.examinerNote}</div>}
        {f.changedSince && <div className="note"><b>The return has changed since these accounts were filed.</b> Companies House have the version sent on {when(f.sentAt)}.</div>}
        <div className="note">
          Sent {when(f.sentAt)} by {f.filedByName}{f.receivedAt ? ` · received ${when(f.receivedAt)}` : ""}{f.checkedAt ? ` · last checked ${when(f.checkedAt)}` : ""}
        </div>
      </span>
    </div>
  );
}

export default function CompaniesHouseFiling({ returnId, refreshKey }: { returnId: string; refreshKey: string }) {
  const [st, setSt] = useState<ChFilingState | null>(null);
  const [code, setCode] = useState("");
  const [contact, setContact] = useState({ name: "", phone: "" });
  const [confirmed, setConfirmed] = useState(false);
  const [asking, setAsking] = useState(false);
  const [result, setResult] = useState<FileOutcome | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const load = useCallback(() => start(async () => {
    const s = await chFilingState(returnId);
    setSt(s);
    setContact((c) => (c.name || c.phone ? c : s.contact));
  }), [returnId]);
  useEffect(() => { load(); }, [load, refreshKey]);

  if (!st) return <div className="card" style={{ padding: "16px 18px", marginBottom: 12 }}><span className="note">Checking with Companies House…</span></div>;
  if (!st.ok) return <div className="banner bad" style={{ marginBottom: 12 }}><span>✕</span><span>{st.error}</span></div>;
  if (!st.available) return null;

  const latest = st.filings[0] ?? null;
  const waiting = latest && ["sending", "unknown", "received", "pending", "parked"].includes(latest.status);
  const file = () => start(async () => {
    setNote(null);
    const r = await fileWithCompaniesHouse(returnId, { authCode: code, contactName: contact.name, contactPhone: contact.phone, confirmed });
    setResult(r);
    setAsking(false);
    if (r.filing) { setCode(""); setConfirmed(false); }
    setSt(await chFilingState(returnId));
  });
  const check = () => start(async () => {
    const r = await checkChFiling(returnId);
    setNote(r.problem ?? null);
    setSt(await chFilingState(returnId));
  });

  return (
    <div className="card" id="file-companies-house" style={{ padding: "16px 18px", marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
        <h4 style={{ margin: 0, fontFamily: "var(--display)", fontSize: 19, fontWeight: 600 }}>File the accounts with Companies House</h4>
        {latest?.status === "accepted" && <span className="pill ok">Filed</span>}
      </div>

      {latest && <Filing f={latest} latest />}
      {st.filings.slice(1).length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary className="note" style={{ cursor: "pointer" }}>Earlier attempts ({st.filings.length - 1})</summary>
          {st.filings.slice(1).map((f) => <Filing key={f.id} f={f} latest={false} />)}
        </details>
      )}
      {waiting && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
          <button type="button" className="btn ghost sm" onClick={check} disabled={pending}>{pending ? "Checking…" : "Check with Companies House"}</button>
          <span className="note">You&apos;ll also get an email when they decide.</span>
        </div>
      )}
      {note && <p className="note" style={{ marginTop: 8 }}>{note}</p>}

      {latest?.status !== "accepted" && !waiting && (
        <>
          <p className="note" style={{ margin: "10px 0 12px" }}>
            Nucta File sends Companies House the {st.kind ? KIND[st.kind] : "accounts"} made up to <b>{day(st.periodTo)}</b>: the same accounts HMRC get, without the
            profit and loss account{st.kind === "small" ? " and directors' report" : ""}, as the law allows. Companies House don&apos;t charge for filing accounts.
          </p>
          {st.problems.length > 0 && (
            <div className="banner bad" style={{ marginBottom: 10 }}><span>✕</span><span><b>Before these can be filed:</b>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{st.problems.map((p, i) => <li key={i}>{p}</li>)}</ul></span></div>
          )}
          {st.warnings.length > 0 && (
            <div className="banner info" style={{ marginBottom: 10 }}><span>!</span><span><b>Check first:</b>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{st.warnings.map((p, i) => <li key={i}>{p}</li>)}</ul></span></div>
          )}
          {st.problems.length === 0 && (
            <>
              <div className="kv"><span className="k">Company</span><span className="v">{st.company.name} · {st.company.companyNo}</span></div>
              <div className="kv"><span className="k">Approved by</span><span className="v">{st.director} on {day(st.approvedOn)}</span></div>
              <div className="grid2" style={{ marginTop: 12 }}>
                <div className="field"><label>Company authentication code<span className="hint">6 characters, from Companies House · used once, never stored</span></label>
                  <input value={code} maxLength={6} autoComplete="off" spellCheck={false} style={{ textTransform: "uppercase", letterSpacing: "0.12em" }}
                    onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} />
                </div>
                <div />
                <div className="field"><label>Contact name<span className="hint">shown to Companies House if they have a question</span></label>
                  <input value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} />
                </div>
                <div className="field"><label>Contact phone</label>
                  <input inputMode="tel" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} />
                </div>
              </div>
              <label className="check" style={{ cursor: "pointer", marginTop: 4 }}>
                <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} style={{ marginTop: 3 }} />
                <span>{st.director || "The director"} approved these accounts on {day(st.approvedOn)}, and I&apos;m authorised to deliver them to Companies House for the company.</span>
              </label>
              <p className="note" style={{ margin: "8px 0 10px" }}>
                The code is the company&apos;s Companies House authentication code, posted to the registered office when the company was formed. It isn&apos;t an HMRC code.
                Lost it? <a href="https://find-and-update.company-information.service.gov.uk/" target="_blank" rel="noreferrer">Request a new one from Companies House</a> (it comes by post).
              </p>
              {!asking ? (
                <button type="button" className="btn" disabled={pending || code.length !== 6 || !confirmed || !contact.name.trim() || !contact.phone.trim()} onClick={() => setAsking(true)}>
                  File with Companies House
                </button>
              ) : (
                <div className="banner info" style={{ marginBottom: 0 }}><span>!</span><span>
                  <b>Send these accounts to Companies House now?</b> Once accepted they go on the public register and can only be replaced by amended accounts.
                  <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                    <button type="button" className="btn sm" onClick={file} disabled={pending}>{pending ? "Sending…" : "Yes, file them"}</button>
                    <button type="button" className="btn ghost sm" onClick={() => setAsking(false)} disabled={pending}>Not yet</button>
                  </div>
                </span></div>
              )}
            </>
          )}
        </>
      )}
      {result && (
        <div className={`banner ${result.ok ? "good" : "bad"}`} style={{ marginTop: 10, marginBottom: 0 }}>
          <span>{result.ok ? "✓" : "✕"}</span>
          <span><b>{result.headline}</b>{result.detail.length > 0 && <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{result.detail.map((t, i) => <li key={i}>{t}</li>)}</ul>}</span>
        </div>
      )}
    </div>
  );
}
