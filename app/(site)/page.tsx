import Link from "next/link";
import Film from "./_parts/Film";
import TaxEngine from "./_parts/TaxEngine";
import DashPreview from "./_parts/DashPreview";
import { PRICES, SITE, gbp } from "@/lib/site";
import { chargingOn, getPlans } from "@/lib/billing";

// The page is built once and rebuilt when charging is switched on or off
// (lib/billing-actions.ts), so its prices follow the switch on the Payments page.

export const metadata = { title: { absolute: "Nucta File — Company Tax Returns and accounts for small companies" } };

/** What Nucta File works out, keyed by the CT600 box it ends up in where there is one. */
const WORKS_OUT: { ref: string; box?: boolean; title: string; text: string }[] = [
  { ref: "430", box: true, title: "Corporation Tax at 19% and 25%", text: "The small profits rate, the main rate and marginal relief, with the limits shared across associated companies, cut for a short period and split when the year crosses 1 April." },
  { ref: "Accounts", title: "Micro-entity accounts in iXBRL", text: "Profit and loss, balance sheet and notes, tagged for HMRC and Companies House, with last year's figures alongside and the balance sheet checked to the pound." },
  { ref: "690", box: true, title: "Capital allowances", text: "Annual Investment Allowance, full expensing, electric cars, the main and special rate pools, and the 2026 change to the writing down rate." },
  { ref: "A80", box: true, title: "Director's loans", text: "The CT600A page and the section 455 charge, with relief for repayments within nine months and the higher rate on loans from 6 April 2026." },
  { ref: "50", box: true, title: "First accounts over 12 months", text: "Split into two returns automatically: profit by days, purchases by date, each period with its own limits, tax and deadline." },
  { ref: "160", box: true, title: "Losses and donations", text: "Trading losses carried forward and used against later profits, and qualifying charitable donations relieved." },
  { ref: "Dormant", title: "Dormant companies", text: "Dormant accounts and, when HMRC send a notice, a nil return, with the figures steps skipped." },
  { ref: "Amend", title: "Amended returns", text: "Change an accepted return and send it again as an amendment, up to 12 months after the filing deadline." },
];

/** What Nucta File files today, and what it doesn't yet: said plainly, before anyone starts. */
const FILES_NOW = [
  "Company Tax Returns (CT600) for UK limited companies with one trade",
  "The CT600A page, for loans to directors and other participators",
  "Micro-entity accounts and the tax computation, tagged in iXBRL",
  "Dormant company accounts, and a nil return when HMRC ask for one",
  "First accounts longer than 12 months, as two returns",
  "Amended returns, up to 12 months after the filing deadline",
];
const NOT_YET = [
  { t: "Filing accounts at Companies House", d: "Built and waiting for Companies House's approval. Until then Nucta File gives you the figures, box by box, for Companies House's own online form." },
  { t: "Small-company accounts under FRS 102 Section 1A", d: "For companies above the micro-entity limits." },
  { t: "VAT returns", d: "Built for Making Tax Digital, and waiting for HMRC's approval to file for real." },
  { t: "Groups, R&D relief, charities and rental income", d: "Nor companies that sold land or shares. Nucta File says so at the start if a company is one of these." },
  { t: "Self Assessment and confirmation statements", d: "These still go through HMRC and Companies House directly." },
];

const Icon = ({ d }: { d: React.ReactNode }) => <svg viewBox="0 0 24 24" aria-hidden>{d}</svg>;

export default async function Home() {
  const [charging, plans] = await Promise.all([chargingOn(), getPlans()]);
  const from = plans.filter((p) => p.on).reduce<null | { price: number; returns: number }>((a, b) => (!a || b.price < a.price ? b : a), null);
  return (
    <>
      <Film charging={charging} />

      <section className="trust" aria-label="Who makes Nucta File">
        <div className="wrap">
          <ul>
            <li><b>Registered with HMRC</b><span>As a software developer, vendor {SITE.vendorId}</span></li>
            <li><b>Your HMRC password is never stored</b><span>Typed when you file, and used once</span></li>
            <li><b>The director approves online</b><span>With a record of who approved, and when</span></li>
            <li><b>Made by <a href={SITE.parentSite}>{SITE.company}</a></b><span>UK company formations and compliance</span></li>
          </ul>
        </div>
      </section>

      <section className="deadline" aria-labelledby="deadline-h">
        <div className="wrap">
          <h2 id="deadline-h" className="date">31 March<span>2026</span></h2>
          <div>
            <p><b>HMRC&apos;s free Company Tax Return service closed that day. Every company now files through software.</b></p>
            <p>The return still goes with the company&apos;s accounts and a tax computation, both in iXBRL. Nucta File prepares all three from one set of figures, for one company or a whole client list.</p>
            <p><Link href="/guides/hmrc-online-filing-closed">What the change means for your company</Link></p>
          </div>
        </div>
      </section>

      <section className="s-sec" aria-labelledby="files-h">
        <div className="wrap">
          <h2 id="files-h">What it files today</h2>
          <p className="intro">So you know before you start. If a company needs something Nucta File doesn&apos;t do yet, it tells you at the beginning, not halfway through.</p>
          <div className="cover">
            <div>
              <h3>Files now</h3>
              <ul className="ticks">{FILES_NOW.map((t) => <li key={t}>{t}</li>)}</ul>
            </div>
            <div className="later">
              <h3>Not yet</h3>
              <ul>{NOT_YET.map((x) => <li key={x.t}><b>{x.t}</b><span>{x.d}</span></li>)}</ul>
            </div>
          </div>
        </div>
      </section>

      <section className="s-sec alt" aria-labelledby="engine-h">
        <div className="wrap">
          <h2 id="engine-h">Try the tax engine</h2>
          <p className="intro">Move the profit and watch the Corporation Tax work itself out: the small profits rate, marginal relief and the main rate, with the limits cut for a short period or shared with associated companies.</p>
          <TaxEngine />
        </div>
      </section>

      <section className="s-sec" aria-labelledby="works-h">
        <div className="wrap">
          <h2 id="works-h">What Nucta File works out for you</h2>
          <p className="intro">Each rule is HMRC&apos;s, applied the way HMRC check it. Where a company is outside what Nucta File handles, it says so at the start rather than guessing.</p>
          <div className="index">
            {WORKS_OUT.map((w) => (
              <div className="item" key={w.title}>
                <span className="ref">{w.box ? <b title={`CT600 box ${w.ref}`}>{w.ref}</b> : w.ref}</span>
                <h3>{w.title}</h3>
                <p>{w.text}</p>
              </div>
            ))}
          </div>
          <p style={{ marginTop: 36 }}><Link href="/features" className="s-btn quiet">Everything Nucta File does</Link></p>
        </div>
      </section>

      <section className="s-sec alt" aria-labelledby="practice-h">
        <div className="wrap practice">
          <div>
            <h2 id="practice-h">Every client&apos;s deadline, soonest first</h2>
            <p className="intro">For accountants and formation agents looking after small companies, including directors who live outside the UK.</p>
            <ul className="ticks">
              <li>Returns, Corporation Tax and Companies House accounts for every client, overdue ones first.</li>
              <li>An approval pack per client: one PDF with the accounts, computation, CT600 and a page to sign.</li>
              <li>Last year&apos;s closing figures carried into this year by themselves.</li>
              <li>File as the client&apos;s agent with your own HMRC sign-in.</li>
            </ul>
            <p style={{ marginTop: 34 }}><Link href="/accountants" className="s-btn quiet">How it works for practices</Link></p>
          </div>
          <DashPreview />
        </div>
      </section>

      <section className="s-sec" aria-labelledby="safe-h">
        <div className="wrap">
          <h2 id="safe-h">Careful with what matters</h2>
          <p className="intro">A tax return is evidence. Nucta File treats it that way.</p>
          <div className="safe">
            <div>
              <Icon d={<><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>} />
              <h3>Your HMRC password is never stored</h3>
              <p>It&apos;s typed in at the moment of filing, used once and forgotten.</p>
            </div>
            <div>
              <Icon d={<><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.6 2.6L16 9.5" /></>} />
              <h3>Checked before it&apos;s filed</h3>
              <p>Nucta File checks every figure against HMRC&apos;s rules before it&apos;s sent, and HMRC check it again as it arrives. If anything is wrong, nothing is filed and you see what to fix.</p>
            </div>
            <div>
              <Icon d={<><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6M9 16h3" /></>} />
              <h3>Every receipt kept</h3>
              <p>What was sent and what HMRC sent back are stored with the return, so the documents always show exactly what was filed.</p>
            </div>
            <div>
              <Icon d={<><path d="M12 4v16M7 20h10M4 8h16" /><path d="M4 8l-2.5 6a2.5 2.5 0 0 0 5 0zM20 8l-2.5 6a2.5 2.5 0 0 0 5 0z" /></>} />
              <h3>Figures that add up</h3>
              <p>The balance sheet has to balance and every box agrees with HMRC&apos;s rules before anything can be sent.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="s-sec alt" aria-labelledby="price-h">
        <div className="wrap">
          <h2 id="price-h">{charging ? "One price per return" : "Free while we launch"}</h2>
          {charging ? (
            <p className="intro">No subscription. You pay by card when a return is filed, and amending it later costs nothing more.</p>
          ) : (
            <p className="intro">Prepare, approve and file as many returns as you like, free. When charging starts we&apos;ll tell you first — nothing is ever charged without your agreement.</p>
          )}
          <div className="price-row">
            {charging
              ? <div><b>{gbp(PRICES.company.dormant)}</b><p>Per return for a dormant company, filing its own.</p></div>
              : <div><b>£0</b><p>Now: every return, filed with HMRC, with the accounts for Companies House.</p></div>}
            <div><b>{gbp(PRICES.company.perReturn)}</b><p>{charging ? "Per return, for a company filing its own." : `Later, per return, for a company filing its own. ${gbp(PRICES.company.dormant)} for a dormant company.`}</p></div>
            <div><b>{gbp(PRICES.practice.perReturn)}</b><p>{charging ? "Per" : "Later, per"} return, for practices filing for clients. {gbp(PRICES.practice.dormant)} for a dormant company{from ? `, or a yearly membership from ${gbp(from.price)} for ${from.returns} returns` : ""}.</p></div>
          </div>
          <p style={{ marginTop: 28 }}><Link href="/pricing">See pricing in full</Link></p>
        </div>
      </section>

      <section className="s-sec" aria-labelledby="faq-h">
        <div className="wrap">
          <h2 id="faq-h">Questions</h2>
          <div className="faq">
            <details><summary>Can I file with HMRC through Nucta File now?</summary><p>Yes. Nucta File files Company Tax Returns directly with HMRC, with the accounts and computation attached in iXBRL. You type the company&apos;s HMRC sign-in — or your agent sign-in — at the moment of filing; it is used once and never stored, and HMRC&apos;s receipt is kept with the return. Nucta File is registered with HMRC as a software developer (vendor {SITE.vendorId}). HMRC&apos;s recognition of software is optional — HMRC say so themselves.</p></details>
            <details><summary>Can I still use HMRC&apos;s own free filing service?</summary><p>No. HMRC closed its free Company Accounts and Tax Online service on 31 March 2026, so a company&apos;s return now has to be filed with commercial software such as Nucta File.</p></details>
            <details><summary>Which companies can use it?</summary><p>UK limited companies with one trade, filing micro-entity accounts, which is most small companies, and dormant companies. Groups, research and development relief, rental income and companies that sold land or shares aren&apos;t handled yet; Nucta File tells you at the start if a company is one of them.</p></details>
            <details><summary>What does HMRC need with the return?</summary><p>The CT600, the company&apos;s accounts and a tax computation, both in iXBRL. Nucta File prepares all three from the figures you enter and sends them together.</p></details>
            <details><summary>Does it file the accounts with Companies House?</summary><p>Filing with Companies House is built and waiting for Companies House&apos;s test approval. Until then, download the accounts from Nucta File and file them as you do now.</p></details>
            <details><summary>What if a return needs correcting?</summary><p>Open it and press Amend. You get a copy to change, sent to HMRC marked as an amendment, which HMRC put in place of the original. Amendments can be made up to 12 months after the filing deadline.</p></details>
          </div>
        </div>
      </section>

      <section className="closing" aria-labelledby="closing-h">
        <div className="wrap">
          <h2 id="closing-h">Your next return, ready before the deadline.</h2>
          <p>Create an account, add the company, enter the year&apos;s figures and file with HMRC — free while we launch.</p>
          <div className="ctas">
            <Link href="/sign-up" className="s-btn big">Create your account</Link>
            <a href={`mailto:${SITE.email}`} className="s-btn quiet big">Email us</a>
          </div>
        </div>
      </section>
    </>
  );
}
