import Link from "next/link";
import { SITE } from "@/lib/site";
import ShowGuide from "./ShowGuide";

export const metadata = { title: "Help" };

/**
 * How Nucta Filings works, start to finish, in the order a new customer
 * meets it. Every section says where in the software the thing is done.
 */
const SECTIONS: { id: string; title: string; body: React.ReactNode }[] = [
  {
    id: "overview",
    title: "How it works",
    body: (
      <>
        <p>Nucta Filings does a small company&apos;s year-end in one place: the accounts, the Corporation Tax, the CT600 for HMRC and the accounts for Companies House.</p>
        <ol>
          <li><b>Add the company.</b> Its deadlines appear straight away.</li>
          <li><b>Start a return</b> for the year, and enter the figures in nine short steps. The tax works itself out as you type.</li>
          <li><b>Get the director&apos;s approval:</b> online from a link, or by signing the approval pack.</li>
          <li><b>File the CT600 with HMRC</b> and <b>the accounts with Companies House</b>, from the return&apos;s last step. Either can go first.</li>
          <li><b>Pay the tax</b> by its deadline. The amount and the payment reference are on the return.</li>
        </ol>
      </>
    ),
  },
  {
    id: "companies",
    title: "Adding companies",
    body: (
      <>
        <p>Press <b>Add a company</b> on the dashboard or the Companies page and search Companies House by name or number. The address and accounts dates fill in.</p>
        <p>Add the company&apos;s <b>Corporation Tax UTR</b>: 10 digits on HMRC&apos;s letters to the company. It&apos;s needed to file the CT600, but not to file accounts with Companies House.</p>
        <p>Bringing many clients across? On the Companies page, <b>Import a list</b> takes company numbers pasted from a spreadsheet, with UTRs if you have them.</p>
      </>
    ),
  },
  {
    id: "return",
    title: "A return, step by step",
    body: (
      <>
        <p>Open the company and press <b>Start a return</b>. The dates are suggested from the company&apos;s accounts dates. Accounts longer than 12 months make two CT600s automatically.</p>
        <dl className="help-steps">
          <dt>1 · The company</dt><dd>What it does, whether it was dormant, micro-entity or small company accounts, and a few questions that check Nucta Filings can prepare it. For most small trading companies, press <b>None of these apply</b>.</dd>
          <dt>2 · Profit and loss</dt><dd>The year&apos;s sales and costs. Import them from a trial balance (Xero, QuickBooks, FreeAgent, Sage) or from Amazon and eBay reports.</dd>
          <dt>3 · Expenses tax doesn&apos;t allow</dt><dd>Entertaining, fines and the like, already in the costs, added back for tax. Leave blank what doesn&apos;t apply.</dd>
          <dt>4 · Equipment and vehicles</dt><dd>What was bought or sold, for capital allowances.</dd>
          <dt>5 · Director&apos;s loans</dt><dd>Money a director owed the company. The CT600A page and any section 455 tax are worked out for you.</dd>
          <dt>6 · Last year</dt><dd>Last year&apos;s figures for the comparative column. They come across from last year&apos;s return, or from the accounts at Companies House.</dd>
          <dt>7 · Balance sheet</dt><dd>What the company has and owes at the year end. It has to balance; if it doesn&apos;t, the step says by how much and where to look.</dd>
          <dt>8 · Approval</dt><dd>Who approves the accounts and when, and who makes the declaration on the CT600.</dd>
          <dt>9 · Review and file</dt><dd>The documents, the tax, and filing with HMRC and Companies House.</dd>
        </dl>
        <p>Everything saves as you go. A step with something missing says what, in plain words.</p>
      </>
    ),
  },
  {
    id: "marketplace",
    title: "Amazon and eBay sellers",
    body: (
      <>
        <p>On the <b>Profit and loss</b> step, press <b>Import Amazon or eBay reports</b>, and choose the seller&apos;s transaction report for the year:</p>
        <ul>
          <li><b>Amazon:</b> Seller Central → Payments → Reports Repository → Transaction, for the year&apos;s dates, downloaded as CSV.</li>
          <li><b>eBay:</b> Seller Hub → Payments → Reports → Transaction report, downloaded as CSV.</li>
        </ul>
        <p>Nucta Filings adds up sales less refunds, reimbursements, and every kind of fee: selling, FBA, postage labels, advertising, subscriptions and storage. Several reports can go in together. Payouts to the bank are shown for checking, but aren&apos;t income. If the company is VAT registered, choose whether to take VAT out of sales.</p>
        <p>The reports don&apos;t show what the goods cost to buy, so add that as <b>Cost of goods sold</b>. Add any money Amazon or eBay still held at the year end to the balance sheet, under <b>Owed to the company</b>.</p>
      </>
    ),
  },
  {
    id: "approval",
    title: "The director's approval",
    body: (
      <>
        <p>On the <b>Approval</b> step, either send the director a link (they read the approval pack on their phone or computer and approve, or ask a question), or download the <b>approval pack</b> PDF for them to sign.</p>
        <p>The approval date must be after the year end. It goes on the accounts and is the date Companies House see.</p>
      </>
    ),
  },
  {
    id: "hmrc",
    title: "Filing the CT600 with HMRC",
    body: (
      <>
        <p>On <b>Review and file</b>, sign in with the company&apos;s HMRC Government Gateway user ID and password, or your own agent sign-in if you&apos;re the company&apos;s agent. The sign-in is used once for the filing and never stored.</p>
        <p>HMRC answer within a minute. Their receipt is kept with the return, and you can email it to the client. If HMRC reject a return, nothing is filed, and the screen says why and what to change.</p>
        <p>To correct a return HMRC have accepted, press <b>Amend this return</b> at the top.</p>
      </>
    ),
  },
  {
    id: "companies-house",
    title: "Filing the accounts with Companies House",
    body: (
      <>
        <p>On <b>Review and file</b>, under <b>File the accounts with Companies House</b>, type the company&apos;s <b>authentication code</b>: 6 letters or numbers that Companies House posted to the registered office when the company was formed. It isn&apos;t an HMRC code. If it&apos;s lost, Companies House send a new one by post.</p>
        <p>Nucta Filings sends the same accounts HMRC get, without the profit and loss account (and for small companies the directors&apos; report), as the law allows. Companies House don&apos;t charge for accounts.</p>
        <p>They answer in two stages: <b>Received</b> straight away, then <b>Accepted</b> or <b>Rejected</b> once they&apos;ve examined the accounts, usually within a day. The return shows the status, and the person who filed gets an email. A rejection shows Companies House&apos;s reason and what to do about it.</p>
        <p>The accounts can go to Companies House before the CT600 is ready. Their deadline is usually earlier: 9 months after the year end, against 12 for the CT600.</p>
      </>
    ),
  },
  {
    id: "dormant",
    title: "Dormant companies",
    body: (
      <>
        <p>For one company, answer <b>Yes</b> to the dormant question on the return&apos;s first step. The figures steps are skipped, and the accounts become dormant accounts.</p>
        <p>For many at once, open <Link href="/dormant">Dormant accounts in bulk</Link> (on the dashboard and the Companies page). Tick the companies, check each period, share capital and director, type each authentication code, and file them all in one go. Each company gets its own return showing Companies House&apos;s answer.</p>
        <p>HMRC need a nil CT600 from a dormant company only if they sent it a notice to file one. If they did, file it from that company&apos;s return.</p>
      </>
    ),
  },
  {
    id: "deadlines",
    title: "Deadlines, calendar and team",
    body: (
      <>
        <p>The <b>Dashboard</b> and <b>Deadlines</b> pages list what&apos;s overdue and due next, for every company: accounts at Companies House, Corporation Tax to pay, and the CT600.</p>
        <p><b>Add deadlines to your calendar</b> (on the dashboard) puts them all in Outlook, Google or Apple Calendar, with reminders a week and a day before. Download it again after adding companies.</p>
        <p>Invite colleagues from <Link href="/account">Your account</Link>. Everyone in the practice sees the same companies and returns, and can leave notes and to-dos on each company.</p>
      </>
    ),
  },
];

export default function HelpPage() {
  return (
    <>
      <div className="topbar"><div className="hello"><div>
        <h2>How Nucta Filings works</h2>
        <p className="sum">From adding a company to filing with HMRC and Companies House. <ShowGuide /></p>
      </div></div></div>
      <div className="content help-page">
        <nav className="card help-toc" aria-label="On this page">
          <div className="bd">
            <ol>{SECTIONS.map((s) => <li key={s.id}><a href={`#${s.id}`}>{s.title}</a></li>)}</ol>
          </div>
        </nav>
        {SECTIONS.map((s) => (
          <section key={s.id} id={s.id} className="card help-sec">
            <div className="hd"><h3>{s.title}</h3></div>
            <div className="bd">{s.body}</div>
          </section>
        ))}
        <div className="card help-sec"><div className="bd">
          <p style={{ margin: 0 }}>Stuck, or something isn&apos;t clear? Email <a href={`mailto:${SITE.email}`}>{SITE.email}</a> with the company&apos;s name, and we&apos;ll help.</p>
        </div></div>
      </div>
    </>
  );
}
