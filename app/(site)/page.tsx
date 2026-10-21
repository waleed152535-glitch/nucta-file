import Link from "next/link";
import { PRICES, gbp } from "@/lib/site";

export const metadata = { title: { absolute: "Nucta File — Company Tax Returns and accounts for small companies" } };

/** An example company's return, typeset as the form it becomes. Box numbers are HMRC's. */
const ROWS: { box: string; label: string; amount: string; total?: boolean }[] = [
  { box: "145", label: "Turnover", amount: "182,400" },
  { box: "155", label: "Trading profits", amount: "26,690" },
  { box: "170", label: "Bank interest", amount: "140" },
  { box: "315", label: "Profits chargeable to Corporation Tax", amount: "26,830" },
  { box: "345", label: "Tax at 19%", amount: "5,097.70" },
  { box: "510", label: "Tax chargeable", amount: "5,097.70", total: true },
];

export default function Home() {
  return (
    <>
      <section className="s-hero">
        <div className="wrap">
          <div>
            <h1>Accounts in. Company Tax Return out.</h1>
            <p className="lead">Enter a year&apos;s figures once. Nucta File prepares the accounts, works out the Corporation Tax and files the CT600 to HMRC with the accounts and computation attached.</p>
            <div className="ctas">
              <Link href="/sign-up" className="s-btn big">Create your account</Link>
              <a href="#how" className="s-btn quiet big">See how it works</a>
            </div>
            <p className="s-status">In final testing with HMRC. You can prepare and check returns now; live filing opens as soon as HMRC recognise Nucta File.</p>
          </div>
          <div>
            <div className="ct" role="img" aria-label="An example Company Tax Return: trading profits £26,690, tax chargeable £5,097.70, accepted by HMRC's test service.">
              <div className="ct-top"><b>Company Tax Return — CT600</b><span>Example</span></div>
              <div className="ct-who"><b>Brightshelf Trading Ltd</b> &nbsp;1 April 2024 to 31 March 2025</div>
              {ROWS.map((r, i) => (
                <div key={r.box} className={`ct-row${r.total ? " total" : ""}`}>
                  <span className="ct-box">{r.box}</span>
                  <span className="ct-label">{r.label}</span>
                  <span className="ct-amt" style={{ ["--i" as string]: i }}>£{r.amount}</span>
                </div>
              ))}
              <div className="ct-receipt" style={{ ["--n" as string]: ROWS.length }}>
                <span className="ct-tick" aria-hidden>✓</span>
                <span>Accepted by HMRC&apos;s test service<small>with the iXBRL accounts and tax computation attached</small></span>
              </div>
            </div>
            <p className="ct-note">The numbers in the boxes are HMRC&apos;s own box numbers on the CT600. Every figure comes from the same calculation as the computation sent with it.</p>
          </div>
        </div>
      </section>

      <section className="s-band" aria-label="HMRC's free filing service has closed">
        <div className="wrap">
          <div className="date">31 March 2026<span>HMRC&apos;s free filing service closed</span></div>
          <div>
            <p><b>Companies can no longer file their Company Tax Return through HMRC&apos;s own website.</b> Since 1 April 2026 every return goes through commercial software, with the accounts and the tax computation in iXBRL.</p>
            <p>Nucta File is built for exactly that, for one company or a whole client list. <Link href="/guides/hmrc-online-filing-closed" style={{ color: "#fff" }}>What the change means</Link></p>
          </div>
        </div>
      </section>

      <section className="s-sec" id="how">
        <div className="wrap">
          <h2>From the bookkeeping to HMRC in four steps</h2>
          <p className="intro">The questions are the ones an accountant would ask, in plain words. Nothing goes to HMRC until you&apos;ve seen every document.</p>
          <ol className="steps">
            <li><span className="n">1</span><h3>Add the company</h3><p>Search Companies House by name or number. The address, year end and deadlines fill in themselves.</p></li>
            <li><span className="n">2</span><h3>Enter the year&apos;s figures</h3><p>Profit and loss, equipment bought and sold, director&apos;s loans and the balance sheet, checked as you type.</p></li>
            <li><span className="n">3</span><h3>Check the documents</h3><p>The accounts, the computation and the CT600, with an approval pack for the director to sign.</p></li>
            <li><span className="n">4</span><h3>File with HMRC</h3><p>Tested by HMRC&apos;s test service first, then filed with the company&apos;s sign-in. HMRC&apos;s receipt is kept with the return.</p></li>
          </ol>
        </div>
      </section>

      <section className="s-sec alt">
        <div className="wrap">
          <h2>What Nucta File works out for you</h2>
          <p className="intro">Each rule is HMRC&apos;s, applied the way HMRC check it — and where a company is outside what Nucta File handles, it says so rather than guessing.</p>
          <div className="handles">
            <div><h3>Corporation Tax at 19% and 25%<span className="box">430</span></h3><p>The small profits rate, the main rate and marginal relief, with the limits shared across associated companies and split when the year crosses 1 April.</p></div>
            <div><h3>Micro-entity accounts in iXBRL</h3><p>Profit and loss, balance sheet and notes, tagged for HMRC and Companies House, with last year&apos;s figures alongside.</p></div>
            <div><h3>Capital allowances<span className="box">690</span></h3><p>Annual Investment Allowance, full expensing, electric cars, the main and special rate pools and the 2026 change to the writing down rate.</p></div>
            <div><h3>Director&apos;s loans<span className="box">A80</span></h3><p>The CT600A page and the section 455 charge, with relief for repayments within nine months and the 2026 rate change.</p></div>
            <div><h3>First accounts over 12 months</h3><p>Split into two returns automatically: profit by days, purchases by date, each period with its own limits and deadlines.</p></div>
            <div><h3>Dormant companies</h3><p>Dormant accounts and, if HMRC ask for one, a nil return — with the figures steps skipped.</p></div>
            <div><h3>Losses and donations<span className="box">160</span></h3><p>Trading losses carried forward and used, and qualifying charitable donations relieved.</p></div>
            <div><h3>Amendments</h3><p>Change an accepted return and send it again as an amendment, up to 12 months after the filing deadline.</p></div>
          </div>
          <p style={{ marginTop: 28 }}><Link href="/features">Everything Nucta File does</Link></p>
        </div>
      </section>

      <section className="s-sec">
        <div className="wrap split">
          <div>
            <h2>Careful with what matters</h2>
            <p className="intro">A tax return is evidence. Nucta File treats it that way.</p>
          </div>
          <ul className="ticks">
            <li><b>Your HMRC password is never stored.</b> It&apos;s typed in at the moment of filing, used once, and forgotten.</li>
            <li><b>Tested before it&apos;s filed.</b> A return can only go to HMRC for real once the same figures have passed HMRC&apos;s test service.</li>
            <li><b>Every receipt kept.</b> What was sent and what HMRC sent back are stored with the return, and the documents always show exactly what was filed.</li>
            <li><b>Figures that add up.</b> The balance sheet has to balance and every box agrees with HMRC&apos;s rules before anything can be sent.</li>
          </ul>
        </div>
      </section>

      <section className="s-sec alt">
        <div className="wrap split">
          <div>
            <h2>For accountants and formation agents</h2>
            <p className="intro">Every client on one dashboard, soonest deadline first.</p>
            <p><Link href="/accountants" className="s-btn quiet">How it works for practices</Link></p>
          </div>
          <ul className="ticks">
            <li>Deadlines for every client: returns, Corporation Tax and Companies House accounts, with overdue ones first.</li>
            <li>An approval pack for each client: one PDF with the accounts, computation, CT600 and a page to sign.</li>
            <li>Last year&apos;s closing figures carried into this year automatically.</li>
            <li>File as the client&apos;s agent with your own HMRC agent sign-in.</li>
          </ul>
        </div>
      </section>

      <section className="s-sec">
        <div className="wrap">
          <h2>Pay for a return when you file it</h2>
          <p className="intro">{gbp(PRICES.company.perReturn)} per return for a company filing its own, {gbp(PRICES.practice.perReturn)} per return for practices. Preparing, checking and testing are free, and nothing is charged until live filing opens.</p>
          <p><Link href="/pricing">See pricing</Link></p>

          <h2 style={{ marginTop: 56 }}>Questions</h2>
          <div className="faq">
            <details><summary>Is Nucta File recognised by HMRC?</summary><p>Not yet. Nucta File is registered with HMRC as a software developer (vendor 9754), and its returns pass HMRC&apos;s test service — including returns with director&apos;s loans, long periods, dormant companies and amendments. Recognition is the last step. Until then you can prepare and check returns; filing opens the day HMRC confirm.</p></details>
            <details><summary>Which companies can use it?</summary><p>UK limited companies with one trade, filing micro-entity accounts — most small companies — and dormant companies. Groups, research and development relief, rental income and companies that sold land or shares aren&apos;t handled yet; Nucta File tells you at the start if a company is one of them.</p></details>
            <details><summary>What does HMRC need with the return?</summary><p>The CT600, the company&apos;s accounts and a tax computation, both in iXBRL. Nucta File prepares all three from the figures you enter and sends them together.</p></details>
            <details><summary>Does it file the accounts with Companies House?</summary><p>Filing with Companies House is built and waiting for Companies House&apos;s test approval. Until then, download the accounts from Nucta File and file them as you do now.</p></details>
            <details><summary>What if a return needs correcting?</summary><p>Open it and press Amend. You get a copy to change, sent to HMRC marked as an amendment, which HMRC put in place of the original. Amendments can be made up to 12 months after the filing deadline.</p></details>
          </div>
        </div>
      </section>

      <section className="s-band" aria-label="Get started">
        <div className="wrap">
          <div className="date">Start now<span>Free until live filing opens</span></div>
          <div>
            <p><b>Create an account and prepare your first return today.</b> When HMRC recognise Nucta File, the same return is ready to file.</p>
            <p><Link href="/sign-up" className="s-btn">Create your account</Link></p>
          </div>
        </div>
      </section>
    </>
  );
}
