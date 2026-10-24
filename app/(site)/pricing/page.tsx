import Link from "next/link";
import { PRICES, gbp } from "@/lib/site";

export const metadata = { title: "Pricing", description: "Free while we launch: prepare and file Company Tax Returns with HMRC at no cost." };

export default function Pricing() {
  return (
    <section className="page-top" style={{ paddingBottom: 120 }}>
      <div className="wrap">
        <h1>Free while we launch</h1>
        <p className="intro">Prepare, approve and file Company Tax Returns with HMRC, free. When charging starts, it will be per return filed with no subscription — and we&apos;ll tell you before anything is charged.</p>
        <div className="plans">
          <div className="plan now">
            <h3>Now, while we launch</h3>
            <p className="who">Every account</p>
            <div className="price">£0</div>
            <p className="per">for every return, filed with HMRC</p>
            <ul>
              <li>Unlimited companies and returns</li>
              <li>Accounts, computations and CT600s, filed with HMRC</li>
              <li>The figures for Companies House, box by box</li>
              <li>Online approval by the director, and PDF packs</li>
            </ul>
            <Link href="/sign-up" className="s-btn">Create your account</Link>
          </div>
          <div className="plan">
            <h3>Your own company</h3>
            <p className="who">Later — for a director filing their company&apos;s return</p>
            <div className="price">{gbp(PRICES.company.perReturn)}</div>
            <p className="per">per return filed, or {gbp(PRICES.company.dormant)} for a dormant company</p>
            <ul>
              <li>Accounts and computation in iXBRL</li>
              <li>CT600 and CT600A filed to HMRC</li>
              <li>HMRC&apos;s receipt kept</li>
              <li>Amendments included</li>
            </ul>
            <Link href="/sign-up" className="s-btn quiet">Get started</Link>
          </div>
          <div className="plan">
            <h3>Practices</h3>
            <p className="who">Later — for accountants and formation agents</p>
            <div className="price">{gbp(PRICES.practice.perReturn)}</div>
            <p className="per">per return filed, or {gbp(PRICES.practice.dormant)} for a dormant company</p>
            <ul>
              <li>Every client on one dashboard</li>
              <li>Approval packs for each client</li>
              <li>File as agent</li>
              <li>Amendments included</li>
            </ul>
            <Link href="/sign-up" className="s-btn quiet">Create a practice account</Link>
          </div>
        </div>
        <p className="small" style={{ marginTop: 22 }}>Prices after launch. Accounts longer than 12 months make two returns and will be charged as one. Filing with Companies House directly from Nucta File will be included when it opens.</p>
      </div>
    </section>
  );
}
