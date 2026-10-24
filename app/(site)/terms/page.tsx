import { SITE } from "@/lib/site";

export const metadata = { title: "Terms of use", description: "The terms for using Nucta File." };

export default function Terms() {
  return (
    <section className="read">
      <div className="wrap">
        <div className="paper">
        <h1>Terms of use</h1>
        <p className="meta">Last updated 24 October 2026</p>
        <p>These terms are between you and {SITE.company}{SITE.companyNumber ? ` (company number ${SITE.companyNumber})` : ""}, which provides {SITE.product}. By creating an account you agree to them.</p>

        <h2>What Nucta File does</h2>
        <p>{SITE.product} helps you prepare a company&apos;s accounts and Corporation Tax return from figures you enter, and file them with HMRC. It applies the tax rules as they stand and tells you when a company is outside what it handles.</p>
        <p>{SITE.product} files returns with HMRC using the HMRC sign-in you type in at the moment of filing. A return is filed only when you confirm it, after the declaration.</p>

        <h2>Your responsibilities</h2>
        <ul>
          <li>The figures you enter are yours to get right, from the company&apos;s records.</li>
          <li>A company&apos;s directors are responsible for its accounts and return. Have them approved by a director before filing.</li>
          <li>If you file for a company as its agent, you must be authorised by it to act for its Corporation Tax.</li>
          <li>Keep your password to yourself, and tell us straight away if you think someone else has used your account.</li>
        </ul>

        <h2>Our responsibilities</h2>
        <p>We&apos;ll take reasonable care that {SITE.product} works out returns correctly and keeps your information secure. Nucta File isn&apos;t a substitute for professional advice: if a company&apos;s position isn&apos;t straightforward, ask an accountant.</p>

        <h2>Fees</h2>
        <p>Using {SITE.product} is free while we launch. When charging starts, the prices on our pricing page apply to each return filed, and we&apos;ll tell you before anything is charged.</p>

        <h2>Liability</h2>
        <p>Nothing in these terms limits liability that can&apos;t be limited by law. Otherwise, our total liability to you for a return is limited to the fee paid for it, and we aren&apos;t liable for penalties or interest that arise from figures entered incorrectly, from a return not approved by the company, or from a return filed late.</p>

        <h2>Ending your account</h2>
        <p>You can close your account at any time by emailing us. We may suspend an account that is misused. Filing records are kept as our privacy notice describes.</p>

        <h2>Law</h2>
        <p>These terms are governed by the law of England and Wales, and the courts of England and Wales deal with any dispute.</p>
        <p>Questions about these terms: <a href={`mailto:${SITE.email}`}>{SITE.email}</a>.</p>
        </div>
      </div>
    </section>
  );
}
