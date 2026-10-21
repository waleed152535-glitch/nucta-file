import Link from "next/link";
import { PRICES, gbp } from "@/lib/site";

export const metadata = { title: "Pricing", description: "Pay per return when you file it. Preparing, checking and testing returns is free." };

export default function Pricing() {
  return (
    <section className="s-sec">
      <div className="wrap">
        <h1 style={{ fontSize: "clamp(34px,4.6vw,48px)" }}>Pay for a return when you file it</h1>
        <p className="intro">No subscription. Preparing a return, checking it and sending it to HMRC&apos;s test service are free — you pay only for a return filed with HMRC.</p>
        <div className="plans">
          <div className="plan now">
            <h3>Now, while in testing</h3>
            <p className="who">Until HMRC recognise Nucta File</p>
            <div className="price">£0</div>
            <p className="per">for everything available today</p>
            <ul>
              <li>Unlimited companies and returns</li>
              <li>Accounts, computations and CT600s</li>
              <li>Tests with HMRC&apos;s test service</li>
              <li>PDF approval packs</li>
            </ul>
            <Link href="/sign-up" className="s-btn">Create your account</Link>
          </div>
          <div className="plan">
            <h3>Your own company</h3>
            <p className="who">For a director filing their company&apos;s return</p>
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
            <p className="who">For accountants and formation agents</p>
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
        <p className="small" style={{ marginTop: 18 }}>Accounts longer than 12 months make two returns and are charged as one. Filing with Companies House will be included when it opens.</p>
      </div>
    </section>
  );
}
