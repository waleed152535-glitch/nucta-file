import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * Every attempt, kept.
 *
 * This is the page that matters if HMRC ever query a filing: it shows what
 * was sent, when, under which credentials, and what came back.
 */
export default async function LogPage() {
  let rows: {
    id: string; outcome: string; correlationId: string | null; irmark: string | null;
    messageClass: string; gatewayTest: boolean; startedAt: Date; receipt: string | null;
    errors: { text: string }[];
  }[] = [];
  let problem: string | null = null;

  try {
    const { db } = await import("@/lib/db");
    const { submissions } = await import("@/lib/schema");
    rows = (await db.select().from(submissions).orderBy(desc(submissions.startedAt)).limit(100)) as typeof rows;
  } catch (e) {
    problem = (e as Error)?.message ?? "Couldn't read the submission log.";
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h2>Submission log</h2>
          <div className="sub">Every attempt made from this application, test or live.</div>
        </div>
      </div>

      <div className="content">
        {problem && (
          <div className="banner warn">
            <span>⚠</span>
            <span>
              <b>The log isn&apos;t available yet.</b> Submissions still work — they just aren&apos;t
              being recorded. This needs the database tables creating; the message underneath is
              the technical reason.
              <div className="mono" style={{ marginTop: 7, fontSize: 11, opacity: .8 }}>{problem}</div>
            </span>
          </div>
        )}

        {!problem && rows.length === 0 && (
          <div className="card"><div className="bd"><div className="empty">
            <div className="big">Nothing sent yet</div>
            <p>
              Once a return goes to HMRC, every message in the exchange is kept here —
              including the receipt, which is what proves a filing was made.
            </p>
          </div></div></div>
        )}

        {rows.length > 0 && (
          <div className="card">
            <div className="bd" style={{ padding: 0 }}>
              <table>
                <thead>
                  <tr>
                    <th>When</th><th>Service</th><th>Outcome</th>
                    <th>Correlation ID</th><th>IRmark</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td style={{ whiteSpace: "nowrap", fontSize: 12.5 }}>
                        {new Date(r.startedAt).toLocaleString("en-GB")}
                      </td>
                      <td>
                        <div style={{ fontSize: 12.5 }}>{r.messageClass}</div>
                        <div className="note" style={{ fontSize: 11 }}>
                          {r.gatewayTest ? "test service" : "live"}
                        </div>
                      </td>
                      <td>
                        <span className={`pill ${r.outcome === "accepted" ? "ok" : r.outcome === "rejected" ? "bad" : "warn"}`}>
                          {r.outcome}
                        </span>
                        {r.errors?.length > 0 && (
                          <div className="note" style={{ fontSize: 11, marginTop: 4, maxWidth: 280 }}>
                            {r.errors[0]?.text}
                          </div>
                        )}
                      </td>
                      <td className="mono" style={{ fontSize: 11, wordBreak: "break-all", maxWidth: 180 }}>
                        {r.correlationId ?? "—"}
                      </td>
                      <td className="mono" style={{ fontSize: 11, wordBreak: "break-all", maxWidth: 180 }}>
                        {r.irmark ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
