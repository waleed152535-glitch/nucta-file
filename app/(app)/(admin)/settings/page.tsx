import { getLiveSettings } from "@/lib/live-settings";
import { readiness, VENDOR_ID, SENDER_ID, ENDPOINTS } from "@/lib/hmrc";

export const dynamic = "force-dynamic";

/** Each setting, what it's for, and whether it's been provided. */
const VARS = [
  {
    key: "HMRC_TEST_PASSWORD",
    what: "The password HMRC sent in the document attached to their email. Any one of the passwords in that document works.",
    required: true,
  },
  {
    key: "HMRC_SENDER_ID",
    what: "The sender ID HMRC issued. Already defaults to CTUser100, so only set this if HMRC change it.",
    required: false,
  },
  {
    key: "HMRC_VENDOR_ID",
    what: "Our vendor ID. Already defaults to 9754.",
    required: false,
  },
  {
    key: "HMRC_TEST_UTR",
    what: "The test UTR HMRC issued. Defaults to 8596148860.",
    required: false,
  },
  {
    key: "HMRC_CONTACT_EMAIL",
    what: "An address that goes with submissions to HMRC's test service. A real filing uses the address chosen on the filing screen — by default the email on the HMRC account that signs in.",
    required: false,
  },
  {
    key: "RESEND_API_KEY",
    what: "The key from Resend (resend.com → API Keys), so Nucta File can email receipts, approval links, invitations and password resets. Secret: paste it only here, in the hosting settings.",
    required: false,
  },
  {
    key: "EMAIL_FROM",
    what: "Who the emails come from, on the domain verified in Resend — for example Nucta File <noreply@mail.nuctaformations.com>.",
    required: false,
  },
  {
    key: "STRIPE_SECRET_KEY",
    what: "Stripe's secret key (Stripe → Developers → API keys), for card payments of the filing fee: sk_test_… to try it, sk_live_… for real. Secret: paste it only here, in the hosting settings. Charging stays off until it's switched on on the Payments page.",
    required: false,
  },
  {
    key: "STRIPE_WEBHOOK_SECRET",
    what: "The signing secret (whsec_…) of the webhook endpoint added in Stripe for this site's /api/stripe/webhook — the Payments page shows the address. Secret.",
    required: false,
  },
  {
    key: "DATABASE_URL",
    what: "Where submissions are recorded. Filing works without it, but nothing is kept.",
    required: false,
  },
];

export default async function Settings() {
  const checks = readiness(await getLiveSettings());

  return (
    <>
      <div className="topbar">
        <div>
          <h2>Credentials</h2>
          <div className="sub">What HMRC issued, and where each piece has to be put.</div>
        </div>
      </div>

      <div className="content">
        <div className="banner info">
          <span>🔒</span>
          <span>
            <b>No password is stored in this application.</b> Each one lives only in the hosting
            environment and is read at the moment a submission is sent. That is why the password
            has to be added where the app is deployed rather than typed into a screen here — a
            password typed into a web page ends up in logs, in browser history and in backups.
          </span>
        </div>

        <div className="card">
          <div className="hd"><h3>Current state</h3></div>
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
            <h3>Settings to add where the app is hosted</h3>
            <span className="note">Vercel → Project → Settings → Environment Variables</span>
          </div>
          <div className="bd" style={{ padding: 0 }}>
            <table>
              <thead>
                <tr><th>Name</th><th>What it&apos;s for</th><th style={{ width: 90 }}>Set?</th></tr>
              </thead>
              <tbody>
                {VARS.map((v) => {
                  const set = Boolean(process.env[v.key]);
                  return (
                    <tr key={v.key}>
                      <td className="mono" style={{ fontSize: 12, whiteSpace: "nowrap" }}>{v.key}</td>
                      <td className="note">{v.what}</td>
                      <td>
                        {set
                          ? <span className="pill ok">set</span>
                          : v.required
                            ? <span className="pill bad">needed</span>
                            : <span className="pill draft">optional</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="hd"><h3>Registered with HMRC as</h3></div>
          <div className="bd">
            <div className="kv"><span className="k">Vendor ID</span><span className="v mono">{VENDOR_ID}</span></div>
            <div className="kv"><span className="k">Sender ID</span><span className="v mono">{SENDER_ID}</span></div>
            <div className="kv">
              <span className="k">Test endpoint</span>
              <span className="v mono" style={{ fontSize: 11, wordBreak: "break-all" }}>{ENDPOINTS.test}</span>
            </div>
            <div className="kv">
              <span className="k">Live endpoint</span>
              <span className="v mono" style={{ fontSize: 11, wordBreak: "break-all" }}>{ENDPOINTS.live}</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
