"use client";

import { useState, useTransition } from "react";
import { previewEnvelope, runSubmission, type AttemptResult, type TestFormInput } from "@/lib/actions";
import { MARK_METHODS, type MarkMethod } from "@/lib/ct600-xml";

/**
 * The gateway console.
 *
 * Everything else in Nucta File depends on one question being answered:
 * does HMRC accept what we build? This screen asks them. It shows the exact
 * XML that goes out, the IRmark we calculated, and every word that comes
 * back — because when HMRC refuses a submission, their own wording is the
 * only reliable guide to what's wrong.
 */

const blank: TestFormInput = {
  mode: "test",
  companyName: "Nucta Test Trading Ltd",
  companyNo: "12345678",
  utr: "8596148860",
  periodFrom: "2024-04-01",
  periodTo: "2025-03-31",
  turnover: 48000,
  tradingProfits: 12000,
  corporationTax: 2280,
  taxPayable: 2280,
  rate: 19,
  financialYear: 2024,
  declarantName: "Waleed Sarfraz",
  declarantStatus: "Agent",
  attachAccounts: true,
  markMethod: "exc-c14n",
  testInLive: false,
};

type Check = { label: string; ok: boolean; detail: string };

export default function GatewayConsole({
  checks, vendorId, senderId, endpoint, testUtr,
}: {
  checks: Check[]; vendorId: string; senderId: string; endpoint: string; testUtr: string;
}) {
  const [f, setF] = useState<TestFormInput>({ ...blank, utr: testUtr });
  const [pending, start] = useTransition();
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [preview, setPreview] = useState<{
    envelope: string | null; irmark: string | null; canonical: boolean;
    problems: string[]; warnings: string[];
    accounts: string | null; computation: string | null;
  } | null>(null);
  const [tab, setTab] = useState<"envelope" | "accounts" | "computation">("envelope");

  const set = <K extends keyof TestFormInput>(k: K, v: TestFormInput[K]) =>
    setF((p) => ({ ...p, [k]: v }));

  const num = (k: keyof TestFormInput) => (e: React.ChangeEvent<HTMLInputElement>) =>
    set(k, (Number(e.target.value) || 0) as TestFormInput[typeof k]);

  const blocked = checks.some((c) => !c.ok && c.label === "Test password");

  function doPreview() {
    setResult(null);
    start(async () => {
      const p = await previewEnvelope(f);
      setPreview(p);
      setTab("envelope");
    });
  }

  function doSend() {
    setPreview(null);
    start(async () => {
      const r = await runSubmission(f);
      setResult(r);
    });
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h2>HMRC test console</h2>
          <div className="sub">
            Send a Corporation Tax return to HMRC&apos;s test service and read their answer in full.
          </div>
        </div>
      </div>

      <div className="content">
        <div className="hero">
          <h3>The one thing that has to be proved first</h3>
          <p>
            A Company Tax Return is signed with an <b>IRmark</b> — a fingerprint of the XML that
            HMRC recalculates at their end. If our fingerprint and theirs don&apos;t match, the
            submission is refused with error 9001 and nothing else about the software matters.
            This console sends a return to HMRC&apos;s test service so we find out now, long before
            a real client&apos;s filing is at stake.
          </p>
          <div className="acts">
            <button className="btn ghost" onClick={doPreview} disabled={pending}>
              Build it and show me the XML
            </button>
            <button className="btn" onClick={doSend} disabled={pending || blocked}>
              {pending ? "Talking to HMRC…" : "Send to HMRC test service"}
            </button>
          </div>
        </div>

        {blocked && (
          <div className="banner warn">
            <span>⚠</span>
            <span>
              <b>The password isn&apos;t set yet, so nothing can be sent.</b> In your hosting
              settings add an environment variable called <span className="mono">HMRC_TEST_PASSWORD</span>{" "}
              and paste in one of the passwords from the document HMRC attached to their email. Then
              redeploy and come back here. Until then you can still build the XML and read it —
              that alone catches most mistakes.
            </span>
          </div>
        )}

        <div className="grid2">
          <div className="card">
            <div className="hd">
              <h3>What we&apos;re sending</h3>
              <span className="note">Figures only matter in that they must add up</span>
            </div>
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
                  Corporation Tax UTR
                  <span className="hint">HMRC issued {testUtr} for testing</span>
                </label>
                <input className="mono" value={f.utr} onChange={(e) => set("utr", e.target.value)} />
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
                  <label>Turnover <span className="hint">box 145</span></label>
                  <input type="number" value={f.turnover} onChange={num("turnover")} />
                </div>
                <div className="field">
                  <label>Trading profit <span className="hint">box 155</span></label>
                  <input type="number" value={f.tradingProfits} onChange={num("tradingProfits")} />
                </div>
              </div>

              <div className="row3">
                <div className="field">
                  <label>Tax rate %</label>
                  <input type="number" value={f.rate} onChange={num("rate")} />
                </div>
                <div className="field">
                  <label>Tax charged <span className="hint">box 430</span></label>
                  <input type="number" value={f.corporationTax} onChange={num("corporationTax")} />
                </div>
                <div className="field">
                  <label>Tax payable <span className="hint">box 525</span></label>
                  <input type="number" value={f.taxPayable} onChange={num("taxPayable")} />
                </div>
              </div>

              <div className="row2">
                <div className="field">
                  <label>Declared by</label>
                  <input value={f.declarantName} onChange={(e) => set("declarantName", e.target.value)} />
                </div>
                <div className="field">
                  <label>Capacity</label>
                  <select value={f.declarantStatus} onChange={(e) => set("declarantStatus", e.target.value)}>
                    <option>Agent</option>
                    <option>Director</option>
                    <option>Secretary</option>
                    <option>Authorised official</option>
                  </select>
                </div>
              </div>

              <label style={{ display: "flex", gap: 9, alignItems: "flex-start", fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={f.attachAccounts}
                  onChange={(e) => set("attachAccounts", e.target.checked)}
                  style={{ width: 16, marginTop: 2 }}
                />
                <span>
                  Attach iXBRL accounts and computations
                  <span style={{ display: "block", color: "var(--muted)", fontSize: 12, marginTop: 2 }}>
                    HMRC expects both with a real return. Turning this off narrows the test to the
                    CT600 and the IRmark alone, which is useful when hunting a rejection.
                  </span>
                </span>
              </label>
            </div>
          </div>

          <div>
            <div className="card">
              <div className="hd">
                <h3>Where this is going</h3>
                <span className="pill live">Test service</span>
              </div>
              <div className="bd">
                <div className="kv"><span className="k">Vendor ID</span><span className="v mono">{vendorId}</span></div>
                <div className="kv"><span className="k">Sender ID</span><span className="v mono">{senderId}</span></div>
                <div className="kv"><span className="k">Message class</span><span className="v mono">{f.testInLive ? "HMRC-CT-CT600-TIL" : "HMRC-CT-CT600"}</span></div>
                <div className="kv">
                  <span className="k">Endpoint</span>
                  <span className="v mono" style={{ fontSize: 11, wordBreak: "break-all" }}>{endpoint}</span>
                </div>
                <div className="kv"><span className="k">GatewayTest</span><span className="v mono">{f.testInLive ? "0" : "1"}</span></div>
                <div className="kv"><span className="k">IRmark method</span><span className="v" style={{ fontSize: 12 }}>{MARK_METHODS.find((m) => m.key === f.markMethod)?.label}</span></div>
              </div>
            </div>

            <div className="card">
              <div className="hd"><h3>Before a real filing</h3></div>
              <div className="bd" style={{ paddingTop: 6, paddingBottom: 6 }}>
                {checks.map((c) => (
                  <div className="check" key={c.label}>
                    <span className={`mark ${c.ok ? "ok" : "no"}`}>{c.ok ? "✓" : "–"}</span>
                    <span>
                      <div className="t">{c.label}</div>
                      <div className="d">{c.detail}</div>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <div className="hd">
                <h3>IRmark method</h3>
                <span className="note">Only change this if HMRC return 9001</span>
              </div>
              <div className="bd">
                <div className="field">
                  <label>How to calculate the fingerprint</label>
                  <select value={f.markMethod} onChange={(e) => set("markMethod", e.target.value as MarkMethod)}>
                    {MARK_METHODS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                  </select>
                </div>
                <p className="note" style={{ marginTop: 0 }}>
                  {MARK_METHODS.find((m) => m.key === f.markMethod)?.detail}
                </p>
                <p className="note">
                  HMRC&apos;s published wording allows more than one reading, and working
                  implementations disagree. If a submission comes back with error 9001, try the
                  next one down and send again — nothing else needs changing.
                </p>
              </div>
            </div>
          </div>
        </div>

        {preview && (
          <div className="card">
            <div className="hd">
              <h3>Built, not sent</h3>
              <span className="note mono" style={{ fontSize: 11 }}>
                {preview.irmark ? `IRmark ${preview.irmark}` : ""}
              </span>
            </div>
            <div className="bd">
              {preview.problems.length > 0 && (
                <div className="banner bad">
                  <span>✕</span>
                  <span>
                    <b>This wouldn&apos;t be accepted.</b>
                    <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                      {preview.problems.map((p, i) => <li key={i}>{p}</li>)}
                    </ul>
                  </span>
                </div>
              )}
              {preview.warnings.length > 0 && (
                <div className="banner warn">
                  <span>⚠</span>
                  <span>
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {preview.warnings.map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                  </span>
                </div>
              )}

              <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                {([
                  ["envelope", "GovTalk envelope"],
                  ["accounts", "iXBRL accounts"],
                  ["computation", "iXBRL computation"],
                ] as const).map(([k, label]) => (
                  <button
                    key={k}
                    className={`btn sm ${tab === k ? "" : "ghost"}`}
                    onClick={() => setTab(k)}
                    disabled={k !== "envelope" && !preview[k]}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <pre className="xml">
                {tab === "envelope" ? preview.envelope
                  : tab === "accounts" ? preview.accounts
                    : preview.computation}
              </pre>
              <p className="note" style={{ marginTop: 10 }}>
                The password shows as dots because it&apos;s never sent to your browser — it&apos;s
                read on the server at the moment of sending and nowhere else.
              </p>
            </div>
          </div>
        )}

        {result && <Transcript r={result} />}
      </div>
    </>
  );
}

function Transcript({ r }: { r: AttemptResult }) {
  const tone =
    r.outcome === "accepted" ? "good"
      : r.outcome === "rejected" ? "bad"
        : r.outcome === "blocked" ? "warn" : "warn";

  return (
    <>
      <div className={`banner ${tone}`}>
        <span>{r.outcome === "accepted" ? "✓" : r.outcome === "rejected" ? "✕" : "⚠"}</span>
        <span>
          <b>{r.headline}</b>
          {r.detail.length > 0 && (
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              {r.detail.map((d, i) => <li key={i}>{d}</li>)}
            </ul>
          )}
        </span>
      </div>

      {(r.irmark || r.correlationId || r.receipt) && (
        <div className="card">
          <div className="hd"><h3>What HMRC gave us</h3></div>
          <div className="bd">
            {r.irmark && (
              <div className="kv">
                <span className="k">IRmark we calculated</span>
                <span className="v mono" style={{ fontSize: 11, wordBreak: "break-all" }}>{r.irmark}</span>
              </div>
            )}
            <div className="kv">
              <span className="k">How it was calculated</span>
              <span className="v">
                {r.canonical
                  ? <span className="pill ok">exclusive C14N</span>
                  : <span className="pill bad">fell back to raw text</span>}
              </span>
            </div>
            {r.correlationId && (
              <div className="kv">
                <span className="k">Correlation ID</span>
                <span className="v mono" style={{ fontSize: 11, wordBreak: "break-all" }}>{r.correlationId}</span>
              </div>
            )}
            {r.receipt && (
              <div className="kv">
                <span className="k">Receipt</span>
                <span className="v mono" style={{ fontSize: 11, wordBreak: "break-all" }}>{r.receipt}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {r.steps.length > 0 && (
        <div className="card">
          <div className="hd">
            <h3>The whole exchange</h3>
            <span className="note">{r.steps.length} message{r.steps.length === 1 ? "" : "s"}</span>
          </div>
          <div className="bd">
            {r.steps.map((s, i) => (
              <div className="step" key={i}>
                <div className="sh">
                  <span className="stage">{s.stage}</span>
                  <span className={`pill ${s.httpStatus >= 200 && s.httpStatus < 300 ? "ok" : "bad"}`}>
                    HTTP {s.httpStatus}
                  </span>
                  <span className="pill draft">{s.qualifier}</span>
                  <span style={{ marginLeft: "auto", color: "var(--faint)", fontSize: 11 }}>
                    {new Date(s.at).toLocaleTimeString("en-GB")}
                  </span>
                </div>
                <div className="sb">
                  <pre className="xml" style={{ maxHeight: 260 }}>{s.raw}</pre>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {r.envelope && (
        <div className="card">
          <div className="hd"><h3>What we sent</h3></div>
          <div className="bd"><pre className="xml">{r.envelope}</pre></div>
        </div>
      )}
    </>
  );
}
