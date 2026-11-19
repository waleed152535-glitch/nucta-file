import ChConsole from "./ChConsole";
import { CH_GATEWAY, chPresenter } from "@/lib/companies-house";
import { CH_STATUS_WORDS, type ChFilingStatus } from "@/lib/ch-filing";

export const dynamic = "force-dynamic";
/** Sending is acknowledged within the same connection, but can take a while. */
export const maxDuration = 60;

const when = (d: Date) => d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

/** Customers' real filings, newest first: what Companies House said about each. */
async function liveFilings() {
  try {
    const { store } = await import("@/lib/store");
    const s = await store();
    return await s.db.select().from(s.chFilings).orderBy(s.desc(s.chFilings.createdAt)).limit(40);
  } catch {
    return null;
  }
}

export default async function CompaniesHousePage() {
  const email = process.env.CH_CONTACT_EMAIL ?? process.env.HMRC_CONTACT_EMAIL;
  const live = chPresenter("live").presenter;
  const checks = [
    {
      label: "Test presenter ID",
      ok: Boolean(process.env.CH_PRESENTER_ID),
      detail: process.env.CH_PRESENTER_ID
        ? "CH_PRESENTER_ID — used by this console only; sent only as a hash."
        : "Add CH_PRESENTER_ID: the test presenter ID from Companies House's software team.",
    },
    {
      label: "Test presenter authentication code",
      ok: Boolean(process.env.CH_PRESENTER_AUTH),
      detail: process.env.CH_PRESENTER_AUTH
        ? `CH_PRESENTER_AUTH — held in the environment, never in the code. Test package ${process.env.CH_PACKAGE_REFERENCE?.trim() || "0012"}, GatewayTest 1.`
        : "Add CH_PRESENTER_AUTH from the same email. Don't paste it into a chat.",
    },
    {
      label: "Live presenter account",
      ok: Boolean(live),
      detail: live
        ? `CH_LIVE_PRESENTER_ID and CH_LIVE_PRESENTER_AUTH are set: customers can file accounts from a return. Live package ${live.packageReference}, GatewayTest 0.`
        : "Add CH_LIVE_PRESENTER_ID and CH_LIVE_PRESENTER_AUTH (the live presenter account) to let customers file accounts from a return. No testing is allowed on the live service.",
    },
    {
      label: "Contact email",
      ok: Boolean(email),
      detail: email
        ? `Companies House will write to ${email} about results waiting to be collected.`
        : "Add CH_CONTACT_EMAIL — Companies House use it to tell you results are waiting.",
    },
    {
      label: "Daily collection of results",
      ok: Boolean(process.env.CRON_SECRET),
      detail: process.env.CRON_SECRET
        ? "CRON_SECRET is set: every morning Nucta File collects Companies House's decisions and emails whoever filed."
        : "Optional: add CRON_SECRET (any long random text) so results are also collected each morning. Without it they're collected whenever a return is opened.",
    },
  ];
  const rows = await liveFilings();
  return (
    <>
      <ChConsole checks={checks} gateway={CH_GATEWAY} />
      <div className="content" style={{ paddingTop: 0 }}>
        <div className="card">
          <div className="hd"><h3>Customers&apos; filings</h3><span className="note">Accounts filed for real from a return, newest first</span></div>
          <div className="bd">
            {rows === null ? <p className="note">The filings couldn&apos;t be read just now.</p>
              : rows.length === 0 ? <p className="note">None yet. When a customer files accounts from a return, they&apos;ll be listed here with Companies House&apos;s answer.</p>
              : (
                <div style={{ overflowX: "auto" }}>
                  <table className="paytable">
                    <thead><tr><th>Sent</th><th>Company</th><th>Made up to</th><th>Submission</th><th>Status</th><th>Filed by</th></tr></thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.id}>
                          <td>{when(r.createdAt)}</td>
                          <td>{r.companyName}<div className="note mono">{r.companyNo}</div></td>
                          <td>{r.periodTo}</td>
                          <td className="mono">{r.submissionNumber}</td>
                          <td>{CH_STATUS_WORDS[r.status as ChFilingStatus]?.label ?? r.status}{r.reasons.length > 0 && <div className="note">{r.reasons.join(" · ")}</div>}</td>
                          <td>{r.filedByName}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
          </div>
        </div>
      </div>
    </>
  );
}
