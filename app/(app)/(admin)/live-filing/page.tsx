import { getLiveAdmin } from "@/lib/live-actions";
import LiveFilingSettings from "./LiveFilingSettings";

export const dynamic = "force-dynamic";

/**
 * The switch for live filing: off, HMRC's Test in Live check, or real
 * filing; for administrators first, then every account. Every change is
 * noted with who made it, and every live attempt is listed.
 */
export default async function LiveFilingPage() {
  const v = await getLiveAdmin();
  return (
    <>
      <div className="topbar">
        <div>
          <h2>Live filing</h2>
          <div className="sub">Whether returns can be filed with HMRC for real, and for whom.</div>
        </div>
      </div>
      <div className="content">
        {!v.ok ? <div className="banner bad"><span>✕</span><span>{v.problem}</span></div> : (
          <>
            <LiveFilingSettings initial={v.settings} />

            <div className="grid2" style={{ alignItems: "start" }}>
              <div className="card">
                <div className="hd"><h3>Before the first real filing</h3></div>
                <div className="bd" style={{ paddingTop: 6, paddingBottom: 6 }}>
                  {v.checks.map((c) => (
                    <div className="check" key={c.label}>
                      <span className={`mark ${c.ok ? "ok" : "no"}`}>{c.ok ? "✓" : "–"}</span>
                      <span><div className="t">{c.label}</div><div className="d">{c.detail}</div></span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="card">
                <div className="hd"><h3>Changes to this page</h3></div>
                <div className="bd" style={{ paddingTop: 6, paddingBottom: 6 }}>
                  {!v.changes.length && <p className="note">No changes yet. Until a choice is saved, live filing follows NUCTA_LIVE_FILING in the hosting settings ({v.settings.mode}), for administrators only.</p>}
                  {v.changes.slice(0, 12).map((c, i) => (
                    <div className="kv" key={i}><span className="k">{new Date(c.at).toLocaleString("en-GB")}<br /><span className="note">{c.by}</span></span><span className="v" style={{ textAlign: "right", maxWidth: "60%" }}>{c.summary}</span></div>
                  ))}
                </div>
              </div>
            </div>

            <div className="card">
              <div className="hd"><h3>Live attempts</h3><span className="note">Test in Live checks and real filings, newest first. The full envelopes are in the submission log.</span></div>
              <div className="bd" style={{ padding: 0 }}>
                {!v.filings.length ? <p className="note" style={{ padding: "14px 18px" }}>Nothing has been sent to HMRC&apos;s live service yet.</p> : (
                  <table>
                    <thead><tr><th>When</th><th>Company</th><th>What</th><th>HMRC said</th><th>User ID</th></tr></thead>
                    <tbody>
                      {v.filings.map((f, i) => (
                        <tr key={i}>
                          <td>{new Date(f.at).toLocaleString("en-GB")}</td><td>{f.company}</td><td>{f.kind}</td>
                          <td><span className={`pill ${f.outcome === "accepted" ? "ok" : f.outcome === "running" || f.outcome === "timeout" ? "warn" : "bad"}`}>{f.outcome}</span></td>
                          <td className="mono">{f.by ?? ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
