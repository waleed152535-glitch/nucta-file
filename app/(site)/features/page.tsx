import Link from "next/link";

export const metadata = { title: "Features", description: "What Nucta File prepares, works out and files for a small UK company." };

const GROUPS: { heading: string; intro: string; items: [string, string][] }[] = [
  {
    heading: "The return",
    intro: "The CT600 is built from the same calculation as the computation attached to it, so the two always agree.",
    items: [
      ["Corporation Tax", "19% small profits rate, 25% main rate and marginal relief, with the limits divided between associated companies, reduced for a short period and split by days when the year crosses 1 April."],
      ["Supplementary page CT600A", "Loans to directors and shareholders, the section 455 charge, relief for loans repaid within nine months, and the 35.75% rate on loans made from 6 April 2026."],
      ["Two returns for long accounts", "Accounts over 12 months become two returns: profit apportioned by days, allowances by date, losses carried from the first period into the second."],
      ["Dormant companies", "Dormant accounts, and a nil return with no computation when HMRC send a notice to file."],
      ["Amended returns", "Correct an accepted return and send it again marked as an amendment, within HMRC's 12-month window."],
    ],
  },
  {
    heading: "The accounts and computation",
    intro: "Both in iXBRL, tagged with the taxonomies HMRC and Companies House use, and checked against them.",
    items: [
      ["Micro-entity accounts", "Profit and loss account, balance sheet, the audit exemption statements and the notes, with last year's figures alongside and the balance sheet checked to the pound."],
      ["Tax computation", "From profit per the accounts to taxable profit: expenses tax doesn't allow, capital allowances by pool, losses, interest and donations, line by line."],
      ["Capital allowances", "Annual Investment Allowance, full expensing, 100% allowances for new electric cars, main and special rate pools, small pools written off, and the hybrid rate when a year crosses 1 April 2026."],
    ],
  },
  {
    heading: "Working with clients",
    intro: "Built for a practice with a long client list as much as for one company.",
    items: [
      ["Dashboard of deadlines", "Every company's next return, tax payment and Companies House accounts, overdue first, with Companies House's own dates where they're known."],
      ["Companies House search", "Add a company by name or number; its address, year end and accounts dates come from Companies House."],
      ["Approval pack", "One PDF for the director: a page to sign, the tax due and when, the accounts, the computation and the CT600 box by box."],
      ["Next year starts itself", "Pool values, losses, reserves, loan balances and last year's figures carry into the next return."],
      ["Documents to download", "Every document as PDF and iXBRL, the CT600 as XML, and the submission exactly as sent to HMRC."],
    ],
  },
  {
    heading: "Filing",
    intro: "Tested, then filed, with nothing sensitive kept.",
    items: [
      ["Tested first", "Every return can be sent to HMRC's test service, which checks it exactly as a live filing would. Live filing is only offered for figures that have passed."],
      ["Your sign-in, never stored", "The company's or agent's Government Gateway sign-in is typed in at the moment of filing and used once."],
      ["HMRC's receipt, kept", "The receipt, the correlation ID and the IRmark are saved with the return and can be downloaded at any time."],
    ],
  },
];

export default function Features() {
  return (
    <>
      <section className="s-sec" style={{ paddingBottom: 24 }}>
        <div className="wrap">
          <h1 style={{ fontSize: "clamp(34px,4.6vw,48px)" }}>Everything a small company&apos;s return needs</h1>
          <p className="intro">From the year&apos;s figures to the documents HMRC receive, in one place.</p>
        </div>
      </section>
      {GROUPS.map((g, i) => (
        <section key={g.heading} className={`s-sec${i % 2 ? " alt" : ""}`} style={{ paddingTop: 48, paddingBottom: 48 }}>
          <div className="wrap">
            <h2>{g.heading}</h2>
            <p className="intro">{g.intro}</p>
            <div className="handles">
              {g.items.map(([h, p]) => <div key={h}><h3>{h}</h3><p>{p}</p></div>)}
            </div>
          </div>
        </section>
      ))}
      <section className="s-sec">
        <div className="wrap">
          <h2>Not handled yet</h2>
          <p className="intro">Groups and group relief, research and development and creative reliefs, chargeable gains, rental and other investment income, overseas income, and FRS 102 small-company accounts. If a company has any of these, Nucta File says so at the start rather than preparing a return that would be wrong.</p>
          <p><Link href="/sign-up" className="s-btn">Create your account</Link></p>
        </div>
      </section>
    </>
  );
}
