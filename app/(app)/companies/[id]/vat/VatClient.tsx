"use client";

/**
 * A company's VAT returns under Making Tax Digital: its VAT number, the HMRC
 * connection, the periods HMRC are waiting for, and the return itself — the
 * nine boxes read from the bookkeeping's spreadsheet, checked, declared and
 * sent. Everything HMRC send back is kept.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { checkFraudHeaders, disconnectVat, saveVrn, submitVatReturn, vatFromSheet, vatView, type VatView } from "@/lib/vat-actions";
import { BOXES, DECLARATION, completeBoxes, checkBoxes, vatOutcome, type VatBoxes } from "@/lib/vat-rules";
import { clientInfo } from "@/lib/client-info";

const day = (iso?: string | null) => (iso ? new Date(iso.slice(0, 10) + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");
const money = (n: number) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const whole = (n: number) => `£${n.toLocaleString("en-GB")}`;
const today = () => new Date().toISOString().slice(0, 10);
const ZERO: VatBoxes = completeBoxes({});

type Tone = "good" | "bad" | "info";
const Banner = ({ tone, children }: { tone: Tone | "warn"; children: React.ReactNode }) => (
  <div className={`banner ${tone}`}><span>{tone === "good" ? "✓" : tone === "bad" ? "✕" : tone === "warn" ? "!" : "i"}</span><span>{children}</span></div>
);

export default function VatClient({ companyId, notice }: { companyId: string; notice?: { tone: Tone; text: string } }) {
  const [v, setV] = useState<VatView | null>(null);
  const [loading, startLoad] = useTransition();
  const [msg, setMsg] = useState(notice ?? null);
  const load = useCallback(() => startLoad(async () => setV(await vatView(companyId, clientInfo()))), [companyId]);
  useEffect(() => {
    load();
    if (new URLSearchParams(window.location.search).has("hmrc")) window.history.replaceState(null, "", window.location.pathname);
  }, [load]);

  const [preparing, setPreparing] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ periodKey: string; data: Record<string, unknown> } | null>(null);

  if (!v) {
    return (
      <>
        <div className="topbar"><div><h2>VAT returns</h2><div className="sub">Asking HMRC…</div></div></div>
        <div className="content"><div className="card"><div className="bd"><p className="note">Loading the VAT periods…</p></div></div></div>
      </>
    );
  }
  if (!v.ok || !v.company) {
    return (
      <>
        <div className="topbar"><div><h2>VAT returns</h2></div></div>
        <div className="content"><Banner tone="bad">{v.problem}</Banner></div>
      </>
    );
  }
  const c = v.company;
  const open = v.obligations.filter((o) => o.status === "O");
  const fulfilled = v.obligations.filter((o) => o.status === "F");
  const ob = v.obligations.find((o) => o.periodKey === preparing) ?? null;

  return (
    <>
      <div className="topbar">
        <div>
          <h2>VAT returns</h2>
          <div className="sub">{c.name}{c.vrn ? `, VAT number ${c.vrn.replace(/^(\d{3})(\d{4})(\d{2})$/, "$1 $2 $3")}` : ""}. <Link href={`/companies/${c.id}`}>Back to the company</Link></div>
        </div>
        {v.ready && <span className={`pill ${v.env === "production" ? "live" : "draft"}`}>{v.env === "production" ? "HMRC live" : "HMRC sandbox: test businesses only"}</span>}
      </div>
      <div className="content">
        {msg && <Banner tone={msg.tone}>{msg.text}</Banner>}
        {!v.ready && (
          <Banner tone="info">
            <b>VAT returns aren&apos;t switched on on this site yet.</b>{" "}
            {v.admin
              ? <>Register an application on HMRC&apos;s Developer Hub for the VAT (MTD) API, with <span className="mono">{v.redirectUri}</span> as its redirect URI, then put its client ID and secret in HMRC_MTD_CLIENT_ID and HMRC_MTD_CLIENT_SECRET in Vercel and redeploy.</>
              : "They'll appear here once Nucta File's administrators have connected to HMRC."}
          </Banner>
        )}

        <div className="grid2" style={{ alignItems: "start" }}>
          <VrnCard companyId={c.id} vrn={c.vrn} onSaved={(vrn) => { setV({ ...v, company: { ...c, vrn } }); load(); }} />
          <ConnectionCard v={v} companyId={c.id} onChange={load} />
        </div>

        {v.connection && c.vrn && (
          <div className="card">
            <div className="hd"><h3>VAT periods</h3><span className="note">{loading ? "Asking HMRC…" : "From HMRC: the open ones first"}</span></div>
            <div className="bd" style={{ paddingTop: 4, overflowX: "auto" }}>
              {v.obligationsProblem && <Banner tone="bad">{v.obligationsProblem}</Banner>}
              {!v.obligationsProblem && !v.obligations.length && <p className="note">HMRC have no VAT periods for this business in the past year.</p>}
              {v.obligations.length > 0 && (
                <table className="paytable">
                  <thead><tr><th>Period</th><th>Return due</th><th>Status</th><th /></tr></thead>
                  <tbody>
                    {[...open, ...fulfilled].map((o) => {
                      const ended = o.end < today();
                      const late = o.status === "O" && o.due < today();
                      const ours = v.submitted.find((x) => x.periodKey === o.periodKey);
                      return (
                        <tr key={o.periodKey}>
                          <td>{day(o.start)} to {day(o.end)}</td>
                          <td className={late ? "late-t" : undefined}>{day(o.due)}</td>
                          <td>{o.status === "F" ? <span className="pill ok">Received{o.received ? ` ${day(o.received)}` : ""}</span> : late ? <span className="pill bad">Overdue</span> : ended ? <span className="pill warn">Ready to send</span> : <span className="pill draft">Period running</span>}</td>
                          <td style={{ textAlign: "right" }}>
                            {o.status === "O" && ended && <button type="button" className="btn sm" onClick={() => { setPreparing(o.periodKey); setReceipt(null); setTimeout(() => document.getElementById("vat-return")?.scrollIntoView({ behavior: "smooth" }), 50); }}>{preparing === o.periodKey ? "Preparing" : "Prepare the return"}</button>}
                            {o.status === "O" && !ended && <span className="note">Ends {day(o.end)}</span>}
                            {ours && <a className="note" href={`#sent-${ours.id}`}>Sent from Nucta File</a>}
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

        {receipt && (
          <div className="receipt" id="vat-receipt">
            <h4>HMRC received the VAT return</h4>
            <div className="bank">
              <div><div className="l">Received</div><div className="v">{new Date(String(receipt.data.processingDate)).toLocaleString("en-GB")}</div></div>
              <div><div className="l">Form bundle number</div><div className="v">{String(receipt.data.formBundleNumber ?? "—")}</div></div>
              {receipt.data.chargeRefNumber ? <div><div className="l">Charge reference</div><div className="v">{String(receipt.data.chargeRefNumber)}</div></div> : null}
              {receipt.data.paymentIndicator ? <div><div className="l">Payment</div><div className="v">{receipt.data.paymentIndicator === "DD" ? "Direct Debit" : "By bank transfer"}</div></div> : null}
            </div>
            <p className="note" style={{ marginBottom: 0 }}>Kept with the company below. {receipt.data.paymentIndicator === "DD" ? "HMRC will collect any VAT owed by Direct Debit." : "Pay any VAT owed by the payment deadline, using the VAT number as the reference."}</p>
          </div>
        )}

        {ob && !receipt && (
          <ReturnForm key={ob.periodKey} companyId={c.id} ob={ob} onSent={(data) => { setReceipt({ periodKey: ob.periodKey, data }); setPreparing(null); setMsg(null); load(); }} />
        )}

        {v.submitted.length > 0 && (
          <div className="card">
            <div className="hd"><h3>Sent from Nucta File</h3><span className="note">Every VAT return sent, with HMRC&apos;s receipt</span></div>
            <div className="bd" style={{ paddingTop: 4, overflowX: "auto" }}>
              <table className="paytable">
                <thead><tr><th>Period</th><th className="num">Box 3</th><th className="num">Box 4</th><th className="num">Box 5</th><th>Sent</th><th>HMRC&apos;s reference</th></tr></thead>
                <tbody>
                  {v.submitted.map((x) => (
                    <tr key={x.id} id={`sent-${x.id}`}>
                      <td>{day(x.periodStart)} to {day(x.periodEnd)}{x.env !== "production" && <div className="note">Sandbox</div>}</td>
                      <td className="num">{money(x.boxes.totalVatDue)}</td>
                      <td className="num">{money(x.boxes.vatReclaimedCurrPeriod)}</td>
                      <td className="num"><b>{money(x.boxes.netVatDue)}</b> <span className="note">{vatOutcome(x.boxes) === "reclaim" ? "to reclaim" : vatOutcome(x.boxes) === "pay" ? "to pay" : ""}</span></td>
                      <td>{new Date(x.submittedAt).toLocaleString("en-GB")}<div className="note">{x.submittedByName}{x.source === "import" ? `, from ${x.sourceName ?? "a spreadsheet"}` : ", typed in"}</div></td>
                      <td className="mono">{String(x.receipt?.formBundleNumber ?? "—")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {v.connection && c.vrn && (v.liabilities.length > 0 || v.payments.length > 0) && (
          <div className="grid2" style={{ alignItems: "start" }}>
            <div className="card">
              <div className="hd"><h3>Owed to HMRC</h3><span className="note">The past year</span></div>
              <div className="bd" style={{ paddingTop: 4 }}>
                {v.liabilities.length ? v.liabilities.map((l, i) => (
                  <div className="kv" key={i}><span className="k">{l.taxPeriod ? `${day(l.taxPeriod.from)} to ${day(l.taxPeriod.to)}` : l.type}{l.due ? `, due ${day(l.due)}` : ""}</span><span className="v">{l.outstandingAmount === 0 ? <>{money(l.originalAmount)} <span className="ok-t">paid</span></> : <>{money(l.outstandingAmount ?? l.originalAmount)}{l.outstandingAmount !== undefined && l.outstandingAmount !== l.originalAmount ? ` left of ${money(l.originalAmount)}` : ""}</>}</span></div>
                )) : <p className="note">Nothing owed.</p>}
              </div>
            </div>
            <div className="card">
              <div className="hd"><h3>Paid to HMRC</h3><span className="note">The past year</span></div>
              <div className="bd" style={{ paddingTop: 4 }}>
                {v.payments.length ? v.payments.map((p, i) => <div className="kv" key={i}><span className="k">{day(p.received)}</span><span className="v">{money(p.amount)}</span></div>) : <p className="note">No payments in the past year.</p>}
              </div>
            </div>
          </div>
        )}

        {v.admin && v.ready && v.env === "sandbox" && <HeaderCheck />}
      </div>
    </>
  );
}

function VrnCard({ companyId, vrn, onSaved }: { companyId: string; vrn: string | null; onSaved: (vrn: string | null) => void }) {
  const [text, setText] = useState(vrn ?? "");
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const save = () => start(async () => {
    const r = await saveVrn(companyId, text);
    if (r.ok) { setProblem(null); onSaved(r.vrn ?? null); } else setProblem(r.problem ?? "Couldn't save it.");
  });
  return (
    <div className="card">
      <div className="hd"><h3>VAT number</h3><span className="note">On the VAT registration certificate</span></div>
      <div className="bd">
        <div className="field"><label>VAT registration number<span className="hint">nine digits; GB in front is fine</span></label>
          <input className="mono" value={text} onChange={(e) => { setText(e.target.value); setProblem(null); }} placeholder="e.g. 123 4567 89" inputMode="numeric" /></div>
        {problem && <Banner tone="bad">{problem}</Banner>}
        <button type="button" className="btn" disabled={pending || (text.replace(/\D/g, "") === (vrn ?? ""))} onClick={save}>{pending ? "Saving…" : vrn ? "Save the change" : "Save"}</button>
      </div>
    </div>
  );
}

function ConnectionCard({ v, companyId, onChange }: { v: VatView; companyId: string; onChange: () => void }) {
  const [pending, start] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);
  const conn = v.connection;
  const disconnect = () => start(async () => {
    const r = await disconnectVat(companyId, conn!.kind);
    if (r.ok) onChange(); else setProblem(r.problem ?? "Couldn't disconnect.");
  });
  const href = (as: "company" | "agent") => `/api/hmrc/connect?company=${encodeURIComponent(companyId)}&as=${as}`;
  return (
    <div className="card">
      <div className="hd"><h3>Connection to HMRC</h3>{conn && <span className="pill ok">Connected</span>}</div>
      <div className="bd">
        {problem && <Banner tone="bad">{problem}</Banner>}
        {conn ? (
          <>
            <p className="note" style={{ marginTop: 0 }}>
              Through {conn.kind === "agent" ? "your practice's agent services account, which reaches every client that has authorised it for VAT" : "the business's own HMRC sign-in"}.
              {conn.by ? ` Connected by ${conn.by}` : " Connected"} on {day(conn.at)}. It lasts 18 months; HMRC&apos;s password was typed on HMRC&apos;s page, never here.
            </p>
            <button type="button" className="btn ghost sm" disabled={pending} onClick={disconnect}>{pending ? "Disconnecting…" : "Disconnect"}</button>
          </>
        ) : (
          <>
            <p className="note" style={{ marginTop: 0 }}>
              Sign in on HMRC&apos;s own page and grant Nucta File authority to see the VAT periods and send returns. The HMRC password is typed there, never in Nucta File.
              {!v.company?.vrn && " Add the VAT number first."}
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <a className={`btn${!v.ready || !v.company?.vrn ? " disabled" : ""}`} aria-disabled={!v.ready || !v.company?.vrn} href={v.ready && v.company?.vrn ? href("company") : undefined}>Connect with the business&apos;s HMRC sign-in</a>
              {v.practice && <a className={`btn ghost${!v.ready || !v.company?.vrn ? " disabled" : ""}`} aria-disabled={!v.ready || !v.company?.vrn} href={v.ready && v.company?.vrn ? href("agent") : undefined}>Connect your agent services account</a>}
            </div>
            {v.practice && <p className="note" style={{ marginBottom: 0 }}>An agent services account is connected once and works for every client who has authorised your practice for VAT on GOV.UK.</p>}
          </>
        )}
      </div>
    </div>
  );
}

function ReturnForm({ companyId, ob, onSent }: { companyId: string; ob: { periodKey: string; start: string; end: string; due: string }; onSent: (r: Record<string, unknown>) => void }) {
  const [boxes, setBoxes] = useState<VatBoxes>(ZERO);
  const [text, setText] = useState<Record<string, string>>({});
  const [source, setSource] = useState<{ kind: "import" | "typed"; name: string | null }>({ kind: "typed", name: null });
  const [sheetMsg, setSheetMsg] = useState<{ tone: Tone | "warn"; lines: string[] } | null>(null);
  const [typing, setTyping] = useState(false);
  const [declared, setDeclared] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const done = useMemo(() => completeBoxes(boxes), [boxes]);
  const issues = useMemo(() => checkBoxes(done), [done]);
  const outcome = vatOutcome(done);
  // Boxes 6 to 9 are whole pounds: HMRC say to leave the pence out, so say so when some were typed.
  const pence = BOXES.filter((b) => b.whole && /\.\d*[1-9]/.test(text[b.key] ?? "")).map((b) => b.n);
  const hasFigures = source.kind === "import" || typing;

  const read = (f: File | undefined) => {
    if (!f) return;
    const form = new FormData(); form.set("file", f);
    start(async () => {
      const r = await vatFromSheet(form);
      if (!r.ok || !r.boxes) { setSheetMsg({ tone: "bad", lines: r.problems }); return; }
      setBoxes(r.boxes); setText({}); setSource({ kind: "import", name: r.name ?? f.name });
      setSheetMsg({ tone: r.problems.length ? "warn" : "good", lines: [`Read ${r.found?.length ?? 0} boxes from ${r.name}. Check them against the bookkeeping before sending.`, ...r.problems] });
      setDeclared(false); setConfirming(false);
    });
  };
  const setBox = (k: keyof VatBoxes, raw: string) => {
    setText({ ...text, [k]: raw });
    const n = Number(raw.replace(/[£,\s]/g, ""));
    setBoxes({ ...boxes, [k]: Number.isFinite(n) ? n : 0 });
    if (source.kind === "import") setSource({ kind: "typed", name: source.name });
    setDeclared(false); setConfirming(false);
  };
  const send = () => start(async () => {
    setProblems([]);
    const r = await submitVatReturn({ companyId, periodKey: ob.periodKey, boxes: done, source: source.kind, sourceName: source.name, declared, client: clientInfo() });
    if (r.ok && r.receipt) onSent(r.receipt); else { setProblems(r.problems); setConfirming(false); }
  });

  return (
    <div className="card" id="vat-return">
      <div className="hd"><h3>VAT return for {day(ob.start)} to {day(ob.end)}</h3><span className="note">Due by {day(ob.due)}</span></div>
      <div className="bd">
        <div className="vat-source">
          <div>
            <b>Import the figures from the bookkeeping</b>
            <p className="note">Making Tax Digital needs the return&apos;s figures to come digitally from the business&apos;s records. Export the VAT return report from Xero, QuickBooks, FreeAgent, Sage or the VAT spreadsheet as CSV or Excel, and read it in here.</p>
          </div>
          <label className="btn">
            {pending && source.kind !== "import" ? "Reading…" : "Choose the spreadsheet"}
            <input type="file" accept=".csv,.xlsx,.xls,.ods,text/csv" style={{ display: "none" }} onChange={(e) => { read(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
        </div>
        {sheetMsg && <Banner tone={sheetMsg.tone}>{sheetMsg.lines[0]}{sheetMsg.lines.length > 1 && <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{sheetMsg.lines.slice(1).map((l) => <li key={l}>{l}</li>)}</ul>}</Banner>}
        {!hasFigures && (
          <p className="note">Keeping the VAT records somewhere that can&apos;t export them? <button type="button" className="approve-link" style={{ fontSize: 12.5, color: "var(--accent-text)" }} onClick={() => setTyping(true)}>Type the nine boxes in instead</button> — only where HMRC&apos;s rules allow a manual step.</p>
        )}

        {hasFigures && (
          <>
            <table className="paytable vat-boxes">
              <tbody>
                {BOXES.map((b) => (
                  <tr key={b.key} className={b.worked ? "worked" : undefined}>
                    <td className="bx"><span>{b.n}</span></td>
                    <td>{b.label}</td>
                    <td className="num">
                      {b.worked ? <b>{money(done[b.key])}</b> : (
                        <input aria-label={`Box ${b.n}`} inputMode="decimal" value={text[b.key] ?? (done[b.key] ? String(done[b.key]) : "")} placeholder={b.whole ? "0" : "0.00"} onChange={(e) => setBox(b.key, e.target.value)} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="vat-outcome">
              <b>{outcome === "pay" ? `${money(done.netVatDue)} to pay HMRC` : outcome === "reclaim" ? `${money(done.netVatDue)} for HMRC to repay` : "Nothing to pay or reclaim"}</b>
              <span className="note">Sales {whole(done.totalValueSalesExVAT)}, purchases {whole(done.totalValuePurchasesExVAT)}, excluding VAT.</span>
            </div>
            {pence.length > 0 && <p className="note">Box{pence.length > 1 ? "es" : ""} {pence.join(", ")}: whole pounds only, so the pence are left out.</p>}
            {issues.length > 0 && <Banner tone="bad"><ul style={{ margin: 0, paddingLeft: 18 }}>{issues.map((x) => <li key={x}>{x}</li>)}</ul></Banner>}
            <label className="toggle-row" style={{ borderTop: 0 }}>
              <input type="checkbox" checked={declared} onChange={(e) => { setDeclared(e.target.checked); setConfirming(false); }} />
              <span><b>Declaration</b><small>{DECLARATION}</small></span>
            </label>
            {problems.length > 0 && <Banner tone="bad"><ul style={{ margin: 0, paddingLeft: 18 }}>{problems.map((x) => <li key={x}>{x}</li>)}</ul></Banner>}
            {!confirming ? (
              <button type="button" className="btn big" disabled={!declared || issues.length > 0 || pending} onClick={() => setConfirming(true)}>Send the return to HMRC</button>
            ) : (
              <div className="confirm-live">
                <span><b>Send it now?</b> Once HMRC have it, it can&apos;t be sent again: a mistake is corrected by telling HMRC or on a later return.</span>
                <button type="button" className="btn" disabled={pending} onClick={send}>{pending ? "Sending…" : "Yes, send it"}</button>
                <button type="button" className="btn ghost" disabled={pending} onClick={() => setConfirming(false)}>Not yet</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function HeaderCheck() {
  const [r, setR] = useState<{ ok: boolean; text: string[] } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="card">
      <div className="hd"><h3>Fraud prevention headers</h3><span className="note">Administrators only, in HMRC&apos;s sandbox</span></div>
      <div className="bd">
        <p className="note" style={{ marginTop: 0 }}>HMRC require these with every VAT call, and check them before giving production access. This asks HMRC&apos;s own test service to check what this browser and server send.</p>
        <button type="button" className="btn ghost sm" disabled={pending} onClick={() => start(async () => setR(await checkFraudHeaders(clientInfo())))}>{pending ? "Asking HMRC…" : "Check them with HMRC"}</button>
        {r && <div style={{ marginTop: 12 }}><Banner tone={r.ok ? "good" : "warn"}>{r.text[0]}{r.text.length > 1 && <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{r.text.slice(1).map((x) => <li key={x}>{x}</li>)}</ul>}</Banner></div>}
      </div>
    </div>
  );
}
