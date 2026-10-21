import Link from "next/link";
import { PRICES, gbp } from "@/lib/site";

export const metadata = { title: "For accountants", description: "Nucta File for accountancy practices and formation agents: every client's deadlines, approval packs and filing as agent." };

export default function Accountants() {
  return (
    <>
      <section className="s-sec">
        <div className="wrap split">
          <div>
            <h1 style={{ fontSize: "clamp(34px,4.6vw,48px)" }}>Every client&apos;s return, in one list</h1>
            <p className="intro">For accountancy practices and company formation agents looking after small companies — including directors who live outside the UK.</p>
            <p style={{ marginTop: 24 }}><Link href="/sign-up" className="s-btn big">Create a practice account</Link></p>
          </div>
          <ul className="ticks">
            <li><b>A dashboard of deadlines.</b> Returns, Corporation Tax payments and Companies House accounts for every client, overdue first, with Companies House&apos;s own dates once a company is looked up.</li>
            <li><b>Approval packs.</b> One PDF per client: a page to sign, the tax and when it&apos;s due, the accounts, the computation and the CT600 box by box.</li>
            <li><b>Last year carried forward.</b> Pools, losses, reserves, loan balances and comparatives come across when you start the next return.</li>
            <li><b>File as agent.</b> Use your HMRC agent sign-in for clients who have authorised you for Corporation Tax. The sign-in is never stored.</li>
            <li><b>Your clients stay yours.</b> A practice account sees only its own companies; nobody else can.</li>
          </ul>
        </div>
      </section>
      <section className="s-sec alt">
        <div className="wrap">
          <h2>How a year end goes</h2>
          <ol className="steps">
            <li><span className="n">1</span><h3>Start from the dashboard</h3><p>The client&apos;s return appears as not started the day its year ends. One click opens it with the dates filled in.</p></li>
            <li><span className="n">2</span><h3>Enter the figures</h3><p>From the client&apos;s bookkeeping. The tax so far updates as you type.</p></li>
            <li><span className="n">3</span><h3>Send for approval</h3><p>Download the approval pack and send it to the director.</p></li>
            <li><span className="n">4</span><h3>File</h3><p>Once it&apos;s signed, file the return. HMRC&apos;s receipt is kept with it.</p></li>
          </ol>
          <p className="small" style={{ marginTop: 28 }}>Practices pay {gbp(PRICES.practice.perReturn)} per return filed ({gbp(PRICES.practice.dormant)} for a dormant company). No subscription. <Link href="/pricing">Pricing</Link></p>
        </div>
      </section>
    </>
  );
}
