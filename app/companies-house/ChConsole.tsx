"use client";

import { useState, useTransition } from "react";
import {
  previewChAccounts, sendChAccounts, checkChStatus,
  type ChFormInput, type ChPreview, type ChAttempt, type ChPoll,
} from "@/lib/ch-actions";

/**
 * The Companies House test console.
 *
 * Files the same micro-entity accounts the HMRC console attaches to a tax
 * return, to Companies House's XML Gateway. Two things work differently from
 * HMRC and the screen says so: the result arrives later rather than in the
 * same request, and the test service accepts or rejects at random.
 */

const blank: ChFormInput = {
  companyName: "Nucta Test Trading Ltd",
  companyNo: "12345678",
  companyAuthCode: "ABC123",
  periodFrom: "2024-04-01",
  periodTo: "2025-03-31",
  turnover: 95000,
  tradingProfits: 12000,
  rate: 19,
  corporationTax: 2280,
  marginalRelief: 0,
  taxPayable: 2280,
  associatedCompanies: 0,
  director: "Waleed Sarfraz",
  approvedOn: "2025-06-30",
  contactName: "Waleed Sarfraz",
  contactNumber: "",
};

type Check = { label: string; ok: boolean; detail: string };

export default function ChConsole({ checks, gateway }: { checks: Check[]; gateway: string }) {
  const [f, setF] = useState<ChFormInput>(blank);
  const [preview, setPreview] = useState<ChPreview | null>(null);
  const [tab, setTab] = useState<"accounts" | "envelope">("accounts");
  const [sent, setSent] = useState<ChAttempt | null>(null);
  const [poll, setPoll] = useState<ChPoll | null>(null);
  const [lookup, setLookup] = useState("");
  const [pending, start] = useTransition();
  const ready = checks.every((c) => c.ok);

  const set = <K extends keyof ChFormInput>(k: K, v: ChFormInput[K]) => setF((p) => ({ ...p, [k]: v }));
  const num = (k: keyof ChFormInput) => (e: React.ChangeEvent<HTMLInputElement>) =>
    set(k, (e.target.value === "" ? 0 : Number(e.target.value)) as never);

  const doPreview = () => start(async () => { setPreview(await previewChAccounts(f)); setTab("accounts"); });
  const doSend = () => start(async () => {
    const r = await sendChAccounts(f);
    setSent(r);
    if (r.submissionNumber) setLookup(r.submissionNumber);
  });
  const doCheck = (sn?: string) => start(async () => setPoll(await checkChStatus(sn)));

  return (
    <>
      <div className="topbar">
        <div>
          <h2>Companies House test console</h2>
          <div className="sub">File micro-entity accounts through the XML Gateway and collect the result.</div>
        </div>
      </div>

      <div className="content">
        <div className="hero">
          <h3>Two things that work differently from HMRC</h3>
          <p>
            <b>The answer comes later.</b>{" "}Companies House acknowledge a submission straight away, then
            examine the accounts — usually within a day, occasionally up to five. Come back and check
            the status to see whether they were accepted.
          </p>
          <p style={{ marginTop: 10 }}>
            <b>The test service decides at random.</b>{" "}In testing, Companies House accept or reject
            submissions at random so software can be seen to handle both. A rejection here doesn&apos;t
            mean the accounts are wrong; a refusal at the moment of sending does.
          </p>
          <div className="acts">
            <button className="btn ghost" onClick={doPreview} disabled={pending}>Build it and show me</button>
            <button className="btn" onClick={doSend} disabled={pending || !ready}>
              {pending ? "Talking to Companies House…" : "Send to Companies House test service"}
            </button>
          </div>
        </div>

        {!ready && (
          <div className="banner warn">
            <span>⚠</span>
            <span>
              <b>The Companies House test credentials aren&apos;t set yet.</b> When Companies House email
              them, add <span className="mono">CH_PRESENTER_ID</span> and{" "}
              <span className="mono">CH_PRESENTER_AUTH</span> to your hosting settings, plus{" "}
              <span className="mono">CH_CONTACT_EMAIL</span>, then redeploy. Until then you can still build
              the accounts and read them.
            </span>
          </div>
        )}

        <div className="grid2">
          <div className="card">
            <div className="hd"><h3>The company</h3></div>
            <div className="bd">
              <div className="row2">
                <div className="field">
                  <label>Company name</label>
                  <input value={f.companyName} onChange={(e) => set("companyName", e.target.value)} />
                </div>
                <div className="field">
                  <label>Company number</label>
                  <input className="mono" value={f.companyNo} onChange={(e) => set("companyNo", e.target.value)} />
                </div>
              </div>
              <div className="field">
                <label>
                  Companies House authentication code
                  <span className="hint">6 characters — any will do in testing</span>
                </label>
                <input className="mono" value={f.companyAuthCode} onChange={(e) => set("companyAuthCode", e.target.value)} />
              </div>
              <div className="row2">
                <div className="field">
                  <label>Period from</label>
                  <input type="date" value={f.periodFrom} onChange={(e) => set("periodFrom", e.target.value)} />
                </div>
                <div className="field">
                  <label>Period to</label>
                  <input type="date" value={f.periodTo} onChange={(e) => set("periodTo", e.target.value)} />
                </div>
              </div>
              <div className="row2">
                <div className="field">
                  <label>Approved by director</label>
                  <input value={f.director} onChange={(e) => set("director", e.target.value)} />
                </div>
                <div className="field">
                  <label>Approved on <span className="hint">after the year end</span></label>
                  <input type="date" value={f.approvedOn} onChange={(e) => set("approvedOn", e.target.value)} />
                </div>
              </div>
              <div className="row2">
                <div className="field">
                  <label>Contact name</label>
                  <input value={f.contactName} onChange={(e) => set("contactName", e.target.value)} />
                </div>
                <div className="field">
                  <label>Contact phone</label>
                  <input value={f.contactNumber} onChange={(e) => set("contactNumber", e.target.value)} />
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="hd"><h3>The figures</h3><span className="note">Checked before anything is built</span></div>
            <div className="bd">
              <div className="row2">
                <div className="field">
                  <label>Turnover</label>
                  <input type="number" value={f.turnover} onChange={num("turnover")} />
                </div>
                <div className="field">
                  <label>Trading profit <span className="hint">a loss is a minus number</span></label>
                  <input type="number" value={f.tradingProfits} onChange={num("tradingProfits")} />
                </div>
              </div>
              <div className="row3">
                <div className="field">
                  <label>Tax rate %</label>
                  <input type="number" value={f.rate} onChange={num("rate")} />
                </div>
                <div className="field">
                  <label>Tax charged</label>
                  <input type="number" value={f.corporationTax} onChange={num("corporationTax")} />
                </div>
                <div className="field">
                  <label>Tax payable</label>
                  <input type="number" value={f.taxPayable} onChange={num("taxPayable")} />
                </div>
              </div>
              <div className="row2">
                <div className="field">
                  <label>Marginal relief</label>
                  <input type="number" value={f.marginalRelief} onChange={num("marginalRelief")} />
                </div>
                <div className="field">
                  <label>Associated companies</label>
                  <input type="number" value={f.associatedCompanies} onChange={num("associatedCompanies")} />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="hd"><h3>Credentials</h3><span className="note mono">{gateway}</span></div>
          <div className="bd">
            {checks.map((c) => (
              <div className="check" key={c.label}>
                <span className={`mark ${c.ok ? "ok" : "no"}`}>{c.ok ? "✓" : "–"}</span>
                <span><div className="t">{c.label}</div><div className="d">{c.detail}</div></span>
              </div>
            ))}
          </div>
        </div>

        {preview && (
          <div className="card">
            <div className="hd"><h3>What would be sent</h3></div>
            <div className="bd">
              {preview.problems.length > 0 && (
                <div className="banner bad">
                  <span>✕</span>
                  <span>
                    <b>This wouldn&apos;t be accepted.</b>
                    <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{preview.problems.map((p, i) => <li key={i}>{p}</li>)}</ul>
                  </span>
                </div>
              )}
              {preview.warnings.length > 0 && (
                <div className="banner warn">
                  <span>⚠</span>
                  <span><ul style={{ margin: 0, paddingLeft: 18 }}>{preview.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></span>
                </div>
              )}
              {preview.ok && (
                <>
                  <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                    <button className={`btn sm ${tab === "accounts" ? "" : "ghost"}`} onClick={() => setTab("accounts")}>The accounts</button>
                    <button className={`btn sm ${tab === "envelope" ? "" : "ghost"}`} onClick={() => setTab("envelope")}>Gateway envelope</button>
                  </div>
                  {tab === "accounts"
                    ? <iframe title="Accounts" srcDoc={preview.accounts ?? ""} style={{ width: "100%", height: 720, border: "1px solid #ddd", background: "#fff" }} />
                    : <pre className="xml">{preview.envelope}</pre>}
                  <p className="note" style={{ marginTop: 10 }}>
                    The company&apos;s authentication code and the presenter password show as dots: they
                    are never sent to your browser or stored.
                  </p>
                </>
              )}
            </div>
          </div>
        )}

        {sent && (
          <div className="card">
            <div className="hd"><h3>Sending</h3>{sent.submissionNumber && <span className="note mono">Submission {sent.submissionNumber}</span>}</div>
            <div className="bd">
              <div className={`banner ${sent.ok ? "good" : sent.outcome === "blocked" ? "warn" : "bad"}`}>
                <span>{sent.ok ? "✓" : "✕"}</span>
                <span>
                  <b>{sent.headline}</b>
                  {sent.detail.length > 0 && <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{sent.detail.map((d, i) => <li key={i}>{d}</li>)}</ul>}
                </span>
              </div>
              {sent.reply && <details><summary className="note">Companies House&apos;s reply, in full</summary><pre className="xml">{sent.reply}</pre></details>}
            </div>
          </div>
        )}

        <div className="card">
          <div className="hd"><h3>Results</h3><span className="note">Companies House keep results for 90 days</span></div>
          <div className="bd">
            <div className="row2">
              <div className="field">
                <label>Submission number <span className="hint">from the send above, or the log</span></label>
                <input className="mono" value={lookup} onChange={(e) => setLookup(e.target.value.toUpperCase())} />
              </div>
              <div className="field" style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                <button className="btn ghost" onClick={() => doCheck(lookup)} disabled={pending || !ready || !lookup}>Check this one</button>
                <button className="btn ghost" onClick={() => doCheck()} disabled={pending || !ready}>Collect all new results</button>
              </div>
            </div>
            {poll && (
              <>
                <div className={`banner ${poll.ok ? "info" : "bad"}`}>
                  <span>{poll.ok ? "ℹ" : "✕"}</span>
                  <span>
                    <b>{poll.headline}</b>
                    {poll.detail.length > 0 && <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{poll.detail.map((d, i) => <li key={i}>{d}</li>)}</ul>}
                  </span>
                </div>
                {poll.statuses.filter((s) => s.submissionNumber).map((s) => (
                  <div className="check" key={s.submissionNumber}>
                    <span className={`mark ${s.statusCode === "ACCEPT" ? "ok" : "no"}`}>{s.statusCode === "ACCEPT" ? "✓" : "–"}</span>
                    <span>
                      <div className="t">
                        <span className="mono">{s.submissionNumber}</span>
                        {s.companyNumber && <span className="mono"> · company {s.companyNumber}</span>}
                        {" — "}{s.meaning || s.statusCode}
                      </div>
                      {s.reasons.length > 0 && <div className="d">{s.reasons.join(" · ")}</div>}
                      {s.comment && <div className="d">Examiner&apos;s note: {s.comment}</div>}
                    </span>
                  </div>
                ))}
                {poll.reply && <details><summary className="note">The reply, in full</summary><pre className="xml">{poll.reply}</pre></details>}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
