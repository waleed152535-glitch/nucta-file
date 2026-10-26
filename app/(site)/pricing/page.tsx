import Link from "next/link";
import { PRICES, gbp } from "@/lib/site";
import { chargingOn, getPlans } from "@/lib/billing";

export const metadata = { title: "Pricing", description: "Company Tax Returns filed with HMRC: a price per return with no subscription, or a yearly membership for practices." };

// Built once, and rebuilt when charging is switched on or off or the plans change (lib/billing-actions.ts).

const pounds = (n: number) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

export default async function Pricing() {
  const [charging, all] = await Promise.all([chargingOn(), getPlans()]);
  const plans = all.filter((p) => p.on);
  const cheapest = plans.length ? plans.reduce((a, b) => (a.price <= b.price ? a : b)) : null;
  const later = charging ? "" : "Later — ";
  return (
    <section className="page-top" style={{ paddingBottom: 120 }}>
      <div className="wrap">
        <h1>{charging ? "One price per return" : "Free while we launch"}</h1>
        <p className="intro">
          {charging
            ? "Pay when a return is filed with HMRC, with no subscription. Practices can pay per return, or buy a year of returns at once."
            : "Prepare, approve and file Company Tax Returns with HMRC, free. When charging starts it will be per return with no subscription, or a yearly membership for practices — and we'll tell you before anything is charged."}
        </p>
        <div className="plans">
          {!charging && (
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
          )}
          <div className={`plan${charging ? " now" : ""}`}>
            <h3>Your own company</h3>
            <p className="who">{later}for a director filing their company&apos;s return</p>
            <div className="price">{gbp(PRICES.company.perReturn)}</div>
            <p className="per">per return filed, or {gbp(PRICES.company.dormant)} for a dormant company</p>
            <ul>
              <li>Accounts and computation in iXBRL</li>
              <li>CT600 and CT600A filed to HMRC</li>
              <li>HMRC&apos;s receipt kept</li>
              <li>Amendments included</li>
            </ul>
            <Link href="/sign-up" className={`s-btn${charging ? "" : " quiet"}`}>Get started</Link>
          </div>
          <div className="plan">
            <h3>Practices, per return</h3>
            <p className="who">{later}for accountants and formation agents</p>
            <div className="price">{gbp(PRICES.practice.perReturn)}</div>
            <p className="per">per return filed, or {gbp(PRICES.practice.dormant)} for a dormant company</p>
            <ul>
              <li>Every client on one dashboard</li>
              <li>Online approval by each director</li>
              <li>File as the client&apos;s agent</li>
              <li>Amendments included</li>
            </ul>
            <Link href="/sign-up" className="s-btn quiet">Create a practice account</Link>
          </div>
          {charging && cheapest && (
            <div className="plan">
              <h3>Practices, yearly</h3>
              <p className="who">a year of returns for one payment</p>
              <div className="price">{pounds(cheapest.price)}</div>
              <p className="per">a year for {cheapest.returns} returns, and larger plans below</p>
              <ul>
                <li>Everything in per return</li>
                <li>Each return filed uses one</li>
                <li>Resending and amendments use nothing more</li>
                <li>Bought from your account page</li>
              </ul>
              <a href="#memberships" className="s-btn quiet">See the plans</a>
            </div>
          )}
        </div>

        {plans.length > 0 && (
          <div className="mships" id="memberships">
            <div>
              <h2>Memberships for practices</h2>
              <p>{charging ? "Pay once for a year of returns." : "When charging starts, practices can also pay once for a year of returns."} Each return filed with HMRC uses one; sending it again, filing both parts of a period over 12 months, and amending it later use nothing more. A membership runs for twelve months from the day it starts, and is bought by card from the account page.</p>
            </div>
            <table>
              <thead><tr><th scope="col">Plan</th><th scope="col" className="num">Returns</th><th scope="col" className="num">A year</th><th scope="col" className="num">A return</th></tr></thead>
              <tbody>
                {plans.map((p) => (
                  <tr key={p.key}>
                    <th scope="row">{p.name}</th>
                    <td className="num">{p.returns.toLocaleString("en-GB")}</td>
                    <td className="num"><b>{pounds(p.price)}</b></td>
                    <td className="num">{pounds(Math.round((p.price / p.returns) * 100) / 100)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="small" style={{ marginTop: 28 }}>{charging ? "" : "Prices after launch. "}Accounts longer than 12 months make two returns and are charged as one. Filing with Companies House directly from Nucta File will be included when it opens.</p>
      </div>
    </section>
  );
}
