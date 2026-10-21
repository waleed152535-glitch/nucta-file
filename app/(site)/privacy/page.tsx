import { SITE } from "@/lib/site";

export const metadata = { title: "Privacy notice", description: "What Nucta File keeps about you and your companies, and why." };

export default function Privacy() {
  return (
    <section className="read">
      <div className="wrap">
        <div className="paper">
        <h1>Privacy notice</h1>
        <p className="meta">Last updated 21 October 2026</p>
        <p>This notice explains what information {SITE.product} keeps, why, and your rights. {SITE.company} (&ldquo;we&rdquo;) is the controller of the personal information described here{SITE.companyNumber ? ` (company number ${SITE.companyNumber})` : ""}. Contact us at <a href={`mailto:${SITE.email}`}>{SITE.email}</a>.</p>

        <h2>What we keep</h2>
        <ul>
          <li><b>Your account:</b> your name, email address, your firm or company name, and a scrambled form of your password (we can&apos;t read it).</li>
          <li><b>Companies and returns you add:</b> company details, the figures you enter, the accounts, computations and returns prepared, and the names of directors and shareholders where a return needs them.</li>
          <li><b>Filings:</b> what was sent to HMRC and what HMRC sent back, including receipts — with the password removed and the Government Gateway user ID hidden.</li>
          <li><b>Signing in:</b> a session cookie and the type of browser, so you stay signed in. We don&apos;t use advertising or tracking cookies.</li>
        </ul>

        <h2>What we never keep</h2>
        <p>Your HMRC Government Gateway password. It&apos;s used once, at the moment of filing, and isn&apos;t stored or logged.</p>

        <h2>Why we use it</h2>
        <ul>
          <li>To provide the service you signed up for — preparing and filing returns (contract).</li>
          <li>To keep a record of what was filed, which HMRC can ask about years later (legal obligation and legitimate interest).</li>
          <li>To keep accounts secure and to answer you when you contact us (legitimate interest).</li>
        </ul>

        <h2>Who else sees it</h2>
        <ul>
          <li><b>HMRC</b>, when you file a return, and <b>Companies House</b>, when you look up or file for a company.</li>
          <li><b>Our hosting and database providers</b> (Vercel and Neon), who store it for us under contract and can&apos;t use it for anything else.</li>
          <li>An <b>email provider</b>, if password reset emails are sent.</li>
        </ul>
        <p>We don&apos;t sell personal information or share it for marketing.</p>

        <h2>How long we keep it</h2>
        <p>Returns and filing records are kept for at least six years after the end of the accounting period, as tax records must be. Account details are kept while the account is open and deleted within 90 days of it being closed, except where a filing record has to be kept.</p>

        <h2>Your rights</h2>
        <p>You can ask for a copy of your information, ask us to correct or delete it, or object to how it&apos;s used. Email us and we&apos;ll respond within a month. If you&apos;re unhappy with our answer, you can complain to the Information Commissioner&apos;s Office at ico.org.uk.</p>

        <h2>Where it&apos;s held</h2>
        <p>Our providers may hold information outside the UK. Where they do, it&apos;s protected by the safeguards UK data protection law requires.</p>
        </div>
      </div>
    </section>
  );
}
