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
      ["Dashboard of deadlines", "Every company's next return, tax payment, Companies House accounts and confirmation statement, overdue first, with a board of every return from not started to filed and the Corporation Tax falling due each month."],
      ["Import from your bookkeeping", "Upload the trial balance from Xero, QuickBooks, FreeAgent or Sage: each account is matched to its place in the profit and loss and balance sheet, and you check the matches before anything is filled in."],
      ["Online approval by the director", "Send the director a link: they read the approval pack and approve from their phone, or ask a question instead. The name, time and internet address are recorded, and a change to the figures afterwards is flagged."],
      ["Your whole team", "Invite colleagues to the account. Everyone sees the same companies, with notes and to-dos on each one."],
      ["Bring every client across at once", "Paste a list of company numbers and UTRs: each company is looked up at Companies House and added with its deadlines."],
      ["Deadlines in your calendar", "Every deadline as a calendar file for Outlook, Google or Apple Calendar, with reminders a week and a day before, and the company list as a spreadsheet."],
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
      <section className="page-top">
        <div className="wrap">
          <h1>Everything a small company&apos;s return needs</h1>
          <p className="intro">From the year&apos;s figures to the documents HMRC receive, in one place, with every rule written down and checked.</p>
        </div>
      </section>
      <section style={{ paddingBottom: 40 }}>
        <div className="wrap groups">
          {GROUPS.map((g) => (
            <div className="group" key={g.heading}>
              <div><h2>{g.heading}</h2><p className="intro">{g.intro}</p></div>
              <dl>{g.items.map(([h, p]) => <div key={h}><dt>{h}</dt><dd>{p}</dd></div>)}</dl>
            </div>
          ))}
        </div>
      </section>
      <section className="s-sec tight" style={{ paddingTop: 20 }}>
        <div className="wrap">
          <div className="not-yet">
            <h2>Not handled yet</h2>
            <p>Groups and group relief, research and development and creative reliefs, chargeable gains, rental and other investment income, overseas income, and FRS 102 small-company accounts. If a company has any of these, Nucta File says so at the start rather than preparing a return that would be wrong.</p>
            <p style={{ marginTop: 24, marginBottom: 0 }}><Link href="/sign-up" className="s-btn">Create your account</Link></p>
          </div>
        </div>
      </section>
    </>
  );
}
