"use client";

/**
 * Filing with HMRC for real, in stages: the checks, the director's approval
 * and the declaration, the HMRC sign-in (the company's own, or an agent's),
 * HMRC's Test in Live check, then the filing itself — and afterwards the
 * receipt, and paying the tax.
 *
 * The sign-in lives only in this component's memory, is sent once with the
 * filing, and is never stored. The server checks every rule again.
 */
import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fileReturnLive, checkLiveFiling, type ReturnPreview, type LiveResult } from "@/lib/return-actions";
import { getFilingPicture, recordPayment, removePayment, emailReceipt } from "@/lib/live-actions";
import type { FilingPicture } from "@/lib/filing-checks";
import { HMRC_BANK, PAY_ONLINE, paymentReferenceProblem } from "@/lib/filing-rules";

const gbp = (n: number) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (iso: string) => new Date(iso + (iso.length === 10 ? "T12:00:00Z" : "")).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
const MARK = { ok: "✓", warn: "!", bad: "✕", info: "i" } as const;

function Result({ r }: { r: LiveResult }) {
  return (
    <div className={`banner ${r.ok ? "good" : r.outcome === "timeout" ? "info" : "bad"}`} style={{ marginTop: 10, marginBottom: 0 }}>
      <span>{r.ok ? "✓" : r.outcome === "timeout" ? "…" : "✕"}</span>
      <span><b>{r.headline}</b>
        {r.detail.length > 0 && <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{r.detail.map((t, i) => <li key={i}>{t}</li>)}</ul>}
        {r.correlationId && <div className="note mono">Correlation ID {r.correlationId}{r.irmark ? ` · IRmark ${r.irmark}` : ""}</div>}
      </span>
    </div>
  );
}

export default function LiveFiling({ returnId, preview, refreshKey, onFiled }: { returnId: string; preview: ReturnPreview; refreshKey: string; onFiled: () => void }) {
  const router = useRouter();
  const [pic, setPic] = useState<FilingPicture | null>(null);
  const [as, setAs] = useState<"company" | "agent">(preview.declarant.status === "Agent" ? "agent" : "company");
  const [signIn, setSignIn] = useState({ userId: "", password: "" });
  // Where HMRC send their own confirmation: the HMRC account's registered email unless another is chosen.
  const [notify, setNotify] = useState<"account" | "me" | "other">("account");
  const [notifyOther, setNotifyOther] = useState("");
  const [approved, setApproved] = useState(false);
  const [declared, setDeclared] = useState(false);
  const [results, setResults] = useState<Record<string, LiveResult>>({});
  const [confirming, setConfirming] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const load = useCallback(async () => setPic(await getFilingPicture(returnId)), [returnId]);
  useEffect(() => { load(); }, [load, refreshKey]);

  if (!pic) return <div className="card" style={{ padding: 14, marginBottom: 12 }}><p className="note" style={{ margin: 0 }}>Checking what&apos;s needed to file…</p></div>;
  if (!pic.ok) return <div className="banner bad"><span>✕</span><span>{pic.problem}</span></div>;

  const many = pic.parts.length > 1;
  const onlineOk = pic.approval?.status === "approved";
  const approvalOk = onlineOk || approved;
  const signedIn = Boolean(signIn.userId.trim() && signIn.password);
  const locked = Boolean(pic.lockedUntil);
  const allFiled = pic.parts.every((x) => x.filed?.status === "accepted");
  const canSend = pic.mode !== "off" && preview.ok && !locked && approvalOk && declared && signedIn;
  const blockingCheck = pic.checks.some((c) => c.state === "bad" && c.key !== "tested" && c.key !== "lock");

  const run = (key: string, fn: () => Promise<LiveResult>) => start(async () => {
    setBusy(key);
    const r = await fn();
    setResults((x) => ({ ...x, [key]: r }));
    setBusy(null); setConfirming(null);
    if (r.filed && pic.parts.length === 1) setSignIn({ userId: "", password: "" });
    await load(); router.refresh();
    if (r.filed || r.outcome === "timeout") onFiled();
  });
  const notifyEmail = notify === "me" ? pic.userEmail : notify === "other" ? notifyOther.trim() : "";
  const til = (n: number) => run(`til-${n}`, () => fileReturnLive(returnId, n, { ...signIn, as, notifyEmail }, { testInLive: true, approved, declared }));
  const file = (n: number) => run(`file-${n}`, () => fileReturnLive(returnId, n, { ...signIn, as, notifyEmail }, { testInLive: false, approved, declared }));
  const ask = (n: number) => run(`file-${n}`, () => checkLiveFiling(returnId, n, { ...signIn, as }));

  const stage = (done: boolean, now: boolean) => `fstage${done ? " done" : now ? " now" : " wait"}`;
  const notifyOk = notify !== "other" || /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(notifyOther.trim());
  const s1 = approvalOk && declared, s2 = signedIn && notifyOk;

  return (
    <>
      <div className="card" style={{ padding: "14px 16px", marginBottom: 12 }} id="file">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
          <h4 style={{ margin: 0, fontFamily: "var(--display)", fontSize: 18, fontWeight: 600 }}>File with HMRC</h4>
          <span className={`pill ${pic.mode === "on" ? "ok" : pic.mode === "til" ? "live" : "draft"}`}>{pic.mode === "on" ? "Live filing open" : pic.mode === "til" ? "Test in Live only" : "Test service only"}</span>
        </div>

        <div style={{ marginTop: 8 }}>
          {!allFiled && pic.checks.map((c) => (
            <div className="fcheck" key={c.key}>
              <span className={`m ${c.state}`} aria-hidden>{MARK[c.state]}</span>
              <span><div className="t">{c.title}</div>{c.detail && <div className="d">{c.detail}</div>}</span>
            </div>
          ))}
        </div>

        {pic.mode === "off" ? (
          <p className="note" style={{ margin: "12px 0 0" }}>
            When live filing is open for this account, the return is filed from here: the company&apos;s HMRC sign-in — or your agent account&apos;s — is typed
            in at that moment and never stored, HMRC&apos;s Test in Live check runs first, and HMRC&apos;s receipt is kept with the return.
          </p>
        ) : allFiled ? null : (
          <>
            <div className={stage(s1, true)} style={{ marginTop: 10 }}>
              <h5><span className="n">{s1 ? "✓" : 1}</span>The director&apos;s approval and the declaration</h5>
              {onlineOk ? (
                <p className="note" style={{ marginTop: 0 }}>✓ {pic.approval!.name} approved these figures online{pic.approval!.at ? ` on ${new Date(pic.approval!.at).toLocaleString("en-GB")}` : ""}. The approval is recorded with the filing.</p>
              ) : (
                <label className="check" style={{ cursor: "pointer" }}>
                  <input type="checkbox" checked={approved} onChange={(e) => setApproved(e.target.checked)} style={{ marginTop: 3 }} />
                  <span>{preview.director || "The director"} has seen the accounts, the computation and the return, and approved them{pic.approval ? " (another way than the online link)" : ""}.</span>
                </label>
              )}
              <label className="check" style={{ cursor: "pointer" }}>
                <input type="checkbox" checked={declared} onChange={(e) => setDeclared(e.target.checked)} style={{ marginTop: 3 }} />
                <span>
                  Declaration, made by {preview.declarant.name || "the person named in the approval step"} ({preview.declarant.status}): the information I have given in this
                  company tax return, and any accounts and computations attached, is correct and complete to the best of my knowledge and belief.
                </span>
              </label>
            </div>

            <div className={stage(s2, s1)}>
              <h5><span className="n">{s2 ? "✓" : 2}</span>Sign in to HMRC</h5>
              <div className="picks" role="radiogroup" aria-label="Whose HMRC account">
                <button type="button" role="radio" aria-checked={as === "company"} className="pick" onClick={() => setAs("company")}>
                  <span className="dot" aria-hidden /><span><b>The company&apos;s own HMRC account</b><small>Its Government Gateway organisation sign-in, with Corporation Tax added.</small></span>
                </button>
                <button type="button" role="radio" aria-checked={as === "agent"} className="pick" onClick={() => setAs("agent")}>
                  <span className="dot" aria-hidden /><span><b>An agent&apos;s HMRC account</b><small>Your agent Government Gateway sign-in, authorised for this company&apos;s Corporation Tax.</small></span>
                </button>
              </div>
              <div className="row2">
                <div className="field"><label>Government Gateway user ID<span className="hint">{as === "agent" ? "your agent user ID" : "the company's user ID"}</span></label>
                  <input value={signIn.userId} autoComplete="off" spellCheck={false} onChange={(e) => setSignIn({ ...signIn, userId: e.target.value })} />
                </div>
                <div className="field"><label>Password<span className="hint">used once, never stored</span></label>
                  <input type="password" autoComplete="new-password" value={signIn.password} onChange={(e) => setSignIn({ ...signIn, password: e.target.value })} />
                </div>
              </div>
              <p className="note" style={{ marginTop: -6 }}>Type it here only. Several wrong passwords can lock a Government Gateway account, so Nucta File stops after two failed sign-ins in an hour.</p>
              <div className="note" style={{ margin: "4px 0" }}>HMRC&apos;s own confirmation email goes to</div>
              <div className="picks" role="radiogroup" aria-label="HMRC's confirmation email">
                <button type="button" role="radio" aria-checked={notify === "account"} className="pick" onClick={() => setNotify("account")}>
                  <span className="dot" aria-hidden /><span><b>The email on this HMRC account</b><small>{as === "agent" ? "Your agent account's email, as HMRC have it." : "The company's email, as HMRC have it — the client hears from HMRC directly."}</small></span>
                </button>
                <button type="button" role="radio" aria-checked={notify === "me"} className="pick" onClick={() => setNotify("me")}>
                  <span className="dot" aria-hidden /><span><b>Me</b><small>{pic.userEmail}</small></span>
                </button>
                <button type="button" role="radio" aria-checked={notify === "other"} className="pick" onClick={() => setNotify("other")}>
                  <span className="dot" aria-hidden /><span><b>Another address</b><small>Such as the director&apos;s.</small></span>
                </button>
              </div>
              {notify === "other" && (
                <div className="field" style={{ maxWidth: 420 }}><label>Email for HMRC&apos;s confirmation</label>
                  <input type="email" value={notifyOther} onChange={(e) => setNotifyOther(e.target.value)} placeholder="name@example.co.uk" />
                </div>
              )}
              <p className="note" style={{ marginTop: 0 }}>Either way, Nucta File keeps HMRC&apos;s receipt with the return{pic.emailReady ? " and emails it to you" : ""} — the receipt is the proof of filing.</p>
            </div>

            {pic.parts.map((x) => {
              const tilR = results[`til-${x.n}`], fileR = results[`file-${x.n}`];
              const tilPassed = x.til?.outcome === "accepted" || (tilR?.ok ?? false);
              const filed = x.filed?.status === "accepted" || fileR?.filed;
              const waiting = x.filed?.status === "submitted-live" && !fileR?.filed;
              const canFileReal = pic.mode === "on" && canSend && x.passedTest && (!pic.requireTil || tilPassed) && !blockingCheck;
              const label = many ? ` return ${x.n + 1} (to ${day(x.periodTo)})` : "";
              return (
                <div key={x.n}>
                  <div className={stage(tilPassed || Boolean(filed), s1 && s2)}>
                    <h5><span className="n">{tilPassed || filed ? "✓" : 3}</span>Check{label} with HMRC&apos;s live service{pic.requireTil ? "" : " (recommended)"}</h5>
                    {!x.passedTest && !x.filed ? <p className="note" style={{ marginTop: 0 }}>Send it to HMRC&apos;s test service first, above.</p> : filed ? <p className="note" style={{ marginTop: 0 }}>Filed — no further check needed.</p> : (
                      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                        <button type="button" className={`btn ${tilPassed ? "ghost" : ""}`} disabled={pending || !canSend || waiting || blockingCheck} onClick={() => til(x.n)}>
                          {busy === `til-${x.n}` ? "Talking to HMRC…" : tilPassed ? "Check again" : "Check with HMRC's live service"}
                        </button>
                        <span className="note">Test in Live: the same sign-in, every check HMRC run on a real filing, and nothing filed.{x.til && !tilR ? ` Last check ${new Date(x.til.at).toLocaleString("en-GB")}: ${x.til.outcome}.` : ""}</span>
                      </div>
                    )}
                    {tilR && <Result r={tilR} />}
                  </div>

                  {pic.mode === "on" && (
                    <div className={stage(Boolean(filed), canFileReal)}>
                      <h5><span className="n">{filed ? "✓" : 4}</span>File{label} with HMRC</h5>
                      {filed ? null : waiting ? (
                        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                          <button type="button" className="btn" disabled={pending || !signedIn} onClick={() => ask(x.n)}>{busy === `file-${x.n}` ? "Asking HMRC…" : "Ask HMRC again"}</button>
                          <span className="note">HMRC have it and were still processing it. Ask again with the same sign-in — don&apos;t file it twice.</span>
                        </div>
                      ) : confirming === x.n ? (
                        <div className="confirm-live">
                          <span style={{ flex: "1 1 260px" }}><b>File {pic.company.name}&apos;s return{many ? ` ${x.n + 1}` : ""} for {day(x.periodFrom)} to {day(x.periodTo)} with HMRC now?</b> It can&apos;t be undone — only amended.</span>
                          <button type="button" className="btn" disabled={pending} onClick={() => file(x.n)}>{busy === `file-${x.n}` ? "Filing with HMRC…" : "Yes, file it now"}</button>
                          <button type="button" className="btn ghost" disabled={pending} onClick={() => setConfirming(null)}>Cancel</button>
                        </div>
                      ) : (
                        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                          <button type="button" className="btn" disabled={pending || !canFileReal} onClick={() => setConfirming(x.n)}>File{many ? ` return ${x.n + 1}` : ""} with HMRC</button>
                          {!canFileReal && <span className="note">{!x.passedTest ? "Pass HMRC's test service first." : !s1 ? "Confirm the approval and the declaration." : !s2 ? "Sign in to HMRC above." : locked ? "Wait until the sign-in pause ends." : pic.requireTil && !tilPassed ? "Pass the live check first." : blockingCheck ? "Fix the items marked ✕ above." : ""}</span>}
                        </div>
                      )}
                      {fileR && <Result r={fileR} />}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}

        {pic.parts.filter((x) => x.filed?.status === "accepted").map((x) => (
          <Receipt key={x.n} returnId={returnId} pic={pic} n={x.n} defaultTo={pic.approval?.email ?? ""} />
        ))}
      </div>

      <PayTax returnId={returnId} pic={pic} onChanged={load} />
    </>
  );
}

function Receipt({ returnId, pic, n, defaultTo }: { returnId: string; pic: FilingPicture; n: number; defaultTo: string }) {
  const x = pic.parts[n];
  const rec = x.filed!;
  const [to, setTo] = useState(defaultTo);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const base = `/returns/${returnId}/documents`;
  return (
    <div className="receipt">
      <h4>Filed with HMRC{pic.parts.length > 1 ? `: return ${n + 1}` : ""}</h4>
      <p className="note" style={{ margin: "0 0 8px" }}>
        {new Date(rec.at).toLocaleString("en-GB")}{rec.filedBy ? ` · user ID ${rec.filedBy}` : ""}{rec.filedAs ? ` · ${rec.filedAs === "agent" ? "agent's" : "company's"} HMRC account` : ""}{rec.approval ? ` · ${rec.approval}` : ""}{rec.notified !== undefined ? ` · HMRC's email to ${rec.notified || "the HMRC account's own address"}` : ""}
      </p>
      {rec.receiptText && <p style={{ margin: "0 0 8px", fontSize: 13.5 }}>{rec.receiptText}</p>}
      {rec.correlationId && <div className="note mono">Correlation ID {rec.correlationId}{rec.irmark ? ` · IRmark ${rec.irmark}` : ""}</div>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0" }}>
        <a className="btn sm" href={`${base}/receipt-${n + 1}.pdf`} target="_blank" rel="noreferrer">HMRC receipt (PDF)</a>
        <a className="btn ghost sm" href={`${base}/submission-${n + 1}.xml`} target="_blank" rel="noreferrer">What was sent</a>
        <a className="btn ghost sm" href={`${base}/ct600-${n + 1}.pdf`} target="_blank" rel="noreferrer">CT600 as filed</a>
      </div>
      {pic.emailReady && (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="field" style={{ marginBottom: 0, flex: "1 1 240px" }}><label>Email the receipt to<span className="hint">the director, or the client</span></label>
            <input type="email" value={to} onChange={(e) => { setTo(e.target.value); setMsg(null); }} placeholder="name@example.co.uk" />
          </div>
          <button type="button" className="btn ghost" disabled={pending || !to.trim()} onClick={() => start(async () => {
            const r = await emailReceipt(returnId, n, to);
            setMsg(r.ok ? { ok: true, text: `Sent to ${to.trim()}.` } : { ok: false, text: r.problem ?? "Couldn't send." });
          })}>{pending ? "Sending…" : "Email the receipt"}</button>
          {msg && <span className={msg.ok ? "ok-t" : "late-t"} style={{ fontSize: 13 }}>{msg.text}</span>}
        </div>
      )}
      <p className="note" style={{ margin: "12px 0 0" }}>Next: the accounts go to Companies House separately — check the company&apos;s deadlines. To correct this return, start an amended return.</p>
    </div>
  );
}

function PayTax({ returnId, pic, onChanged }: { returnId: string; pic: FilingPicture; onChanged: () => Promise<void> }) {
  const payable = pic.parts.filter((x) => x.payable > 0);
  const [form, setForm] = useState<Record<number, { on: string; amount: string; reference: string }>>({});
  const [msg, setMsg] = useState<Record<number, { ok: boolean; text: string }>>({});
  const [pending, start] = useTransition();
  if (!payable.length) return null;
  const today = new Date().toISOString().slice(0, 10);
  const f = (n: number) => form[n] ?? { on: today, amount: String(pic.parts[n].left || ""), reference: "" };
  const set = (n: number, k: "on" | "amount" | "reference", v: string) => { setForm((x) => ({ ...x, [n]: { ...f(n), [k]: v } })); setMsg((m) => { const c = { ...m }; delete c[n]; return c; }); };
  const bank = HMRC_BANK[0], other = HMRC_BANK[1];

  return (
    <div className="card" style={{ padding: "14px 16px", marginBottom: 12 }} id="pay">
      <h4 style={{ margin: "0 0 4px", fontFamily: "var(--display)", fontSize: 18, fontWeight: 600 }}>Pay the tax</h4>
      <p className="note" style={{ marginTop: 0 }}>
        Paying is separate from filing, and can be done before or after. Pay {bank.name} by Faster Payments (usually the same or next day), CHAPS or Bacs (3 working days),
        or <a href={PAY_ONLINE} target="_blank" rel="noreferrer">online on GOV.UK</a> by card or through your bank.
      </p>
      <div className="bank">
        <div><div className="l">Account name</div><div className="v">{bank.name}</div></div>
        <div><div className="l">Sort code</div><div className="v">{bank.sortCode}</div></div>
        <div><div className="l">Account number</div><div className="v">{bank.account}</div></div>
        <div><div className="l">Payment reference</div><div className="v">{pic.company.utr ? `${pic.company.utr}A001··A` : "UTR + A001··A"}</div></div>
      </div>
      <p className="note">
        The reference is 17 characters: the UTR, A001, two digits for the accounting period, and A. The two period digits are HMRC&apos;s — copy the whole reference
        from the notice to file or the company&apos;s HMRC account (Corporation Tax statement → accounting periods); a wrong one can put the money against another period.
        If the notice names {other.name}, pay {other.sortCode} / {other.account} instead. From abroad: IBAN {bank.iban}, BIC {bank.bic}.
      </p>
      {payable.map((x) => {
        const v = f(x.n);
        const refProblem = paymentReferenceProblem(v.reference, pic.company.utr);
        return (
          <div key={x.n} className="fstage" style={{ paddingTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
              <b>{pic.parts.length > 1 ? `Return ${x.n + 1}, to ${day(x.periodTo)}: ` : ""}{gbp(x.payable)} by {day(x.taxDue)}</b>
              <span className={x.left <= 0 ? "ok-t" : x.taxDue < today ? "late-t" : "soon-t"} style={{ fontSize: 13, fontWeight: 600 }}>
                {x.left <= 0 ? "Paid" : x.paid.length ? `${gbp(x.left)} left to pay` : x.taxDue < today ? "Overdue: HMRC charge interest" : "Not paid yet"}
              </span>
            </div>
            {x.paid.length > 0 && (
              <ul className="paidlist">
                {x.paid.map((p, i) => (
                  <li key={i}>
                    <span>{gbp(p.amount)} paid {day(p.on)}{p.reference ? <> · <span className="mono">{p.reference}</span></> : ""} <span className="note">· recorded by {p.recordedBy}</span></span>
                    <button type="button" className="btn ghost sm" disabled={pending} onClick={() => start(async () => { await removePayment(returnId, x.n, i); await onChanged(); })}>Remove</button>
                  </li>
                ))}
              </ul>
            )}
            {x.left > 0 && (
              <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginTop: 10 }}>
                <div className="field" style={{ marginBottom: 0, width: 160 }}><label>Paid on</label><input type="date" value={v.on} max={today} onChange={(e) => set(x.n, "on", e.target.value)} /></div>
                <div className="field" style={{ marginBottom: 0, width: 140 }}><label>Amount, £</label><input inputMode="decimal" value={v.amount} onChange={(e) => set(x.n, "amount", e.target.value)} /></div>
                <div className="field" style={{ marginBottom: 0, flex: "1 1 220px" }}><label>Payment reference<span className="hint">optional</span></label>
                  <input value={v.reference} spellCheck={false} placeholder={pic.company.utr ? `${pic.company.utr}A001…A` : ""} onChange={(e) => set(x.n, "reference", e.target.value)} />
                </div>
                <button type="button" className="btn ghost" disabled={pending || Boolean(refProblem) || !v.amount} onClick={() => start(async () => {
                  const r = await recordPayment(returnId, x.n, { on: v.on, amount: Number(v.amount.replace(/[£,\s]/g, "")), reference: v.reference });
                  setMsg((m) => ({ ...m, [x.n]: r.ok ? { ok: true, text: "Recorded. The dashboard stops showing this tax as due once it's all paid." } : { ok: false, text: r.problem ?? "Couldn't record it." } }));
                  if (r.ok) { setForm((fm) => { const c = { ...fm }; delete c[x.n]; return c; }); await onChanged(); }
                })}>Record a payment</button>
              </div>
            )}
            {refProblem && <p className="late-t" style={{ fontSize: 12.5, margin: "6px 0 0" }}>{refProblem}</p>}
            {msg[x.n] && <p className={msg[x.n].ok ? "ok-t" : "late-t"} style={{ fontSize: 12.5, margin: "6px 0 0" }}>{msg[x.n].text}</p>}
          </div>
        );
      })}
    </div>
  );
}
