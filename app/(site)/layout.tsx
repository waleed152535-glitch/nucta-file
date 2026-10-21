import "@fontsource/public-sans/400.css";
import "@fontsource/public-sans/500.css";
import "@fontsource/public-sans/600.css";
import "@fontsource/public-sans/700.css";
import "@fontsource/public-sans/800.css";
import "./site.css";
import Link from "next/link";
import SiteHeader from "./SiteHeader";
import { SITE } from "@/lib/site";

/** The public website: everything a visitor sees before signing in. */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="site">
      <SiteHeader />
      <main id="main">{children}</main>
      <footer className="s-foot">
        <div className="wrap">
          <div>
            <h4>{SITE.product}</h4>
            <p style={{ margin: 0, maxWidth: "34ch" }}>Company Tax Returns and accounts for small UK companies, and the accountants who look after them.</p>
          </div>
          <div>
            <h4>Product</h4>
            <ul>
              <li><Link href="/features">Features</Link></li>
              <li><Link href="/accountants">For accountants</Link></li>
              <li><Link href="/pricing">Pricing</Link></li>
              <li><Link href="/sign-in">Sign in</Link></li>
            </ul>
          </div>
          <div>
            <h4>Guides</h4>
            <ul>
              <li><Link href="/guides/hmrc-online-filing-closed">HMRC&apos;s free service has closed</Link></li>
              <li><Link href="/guides/accounts-longer-than-12-months">Accounts over 12 months</Link></li>
              <li><Link href="/guides/dormant-company-tax-return">Dormant companies</Link></li>
              <li><Link href="/guides">All guides</Link></li>
            </ul>
          </div>
          <div>
            <h4>Company</h4>
            <ul>
              <li><Link href="/about">About</Link></li>
              <li><Link href="/contact">Contact</Link></li>
              <li><Link href="/terms">Terms</Link></li>
              <li><Link href="/privacy">Privacy</Link></li>
            </ul>
          </div>
          <p className="legal">
            {SITE.product} is made by {SITE.company}{SITE.companyNumber ? `, a company registered in England and Wales, number ${SITE.companyNumber}` : ""}{SITE.registeredOffice ? `. Registered office: ${SITE.registeredOffice}` : ""}.
            {" "}It is registered with HMRC as a software developer (vendor {SITE.vendorId}) and is in testing; live filing opens once HMRC recognise it.
          </p>
        </div>
      </footer>
    </div>
  );
}
