/**
 * Short guides for the website: the questions directors and accountants ask
 * most. Each states the rule plainly and says where it comes from.
 */

export interface Guide {
  slug: string;
  title: string;
  summary: string;
  updated: string;
  sections: { heading: string; paragraphs: string[] }[];
  sources: { label: string; url: string }[];
}

export const GUIDES: Guide[] = [
  {
    slug: "hmrc-online-filing-closed",
    title: "HMRC's free Company Tax Return service has closed: what to do now",
    summary: "Since 1 April 2026, Company Tax Returns go to HMRC through commercial software. Here is what that means for a small company.",
    updated: "2026-10-21",
    sections: [
      {
        heading: "What changed",
        paragraphs: [
          "HMRC's joint online service for filing company accounts and Corporation Tax returns closed on 31 March 2026. From 1 April 2026, a company files its Company Tax Return (form CT600) using commercial software.",
          "Nothing else about the return changed. It still goes with the company's accounts and a tax computation, both in iXBRL — a format that tags each figure so HMRC's systems can read it.",
        ],
      },
      {
        heading: "What a small company needs to file",
        paragraphs: [
          "The CT600 itself, showing the profits chargeable to Corporation Tax and the tax due.",
          "The statutory accounts for the period, in iXBRL.",
          "The Corporation Tax computation, in iXBRL: how the accounting profit becomes the taxable profit — expenses tax doesn't allow added back, capital allowances taken off.",
          "If a director or shareholder owed the company money at the end of the year, the CT600A supplementary page as well.",
        ],
      },
      {
        heading: "Deadlines",
        paragraphs: [
          "The return is due 12 months after the end of the accounting period. Corporation Tax is due earlier: 9 months and 1 day after the period ends, for a company that isn't large.",
          "The accounts go to Companies House separately, usually 9 months after the year end for a private company.",
        ],
      },
      {
        heading: "Using Nucta File",
        paragraphs: [
          "You enter the year's figures once. Nucta File prepares micro-entity accounts, works out the computation and the tax, builds the CT600 and attaches the accounts and computation in iXBRL. Each return is checked by HMRC's test service before it can be filed for real.",
        ],
      },
    ],
    sources: [
      { label: "Ross Martin Tax Consultancy: online filing service for companies to close", url: "https://rossmartin.co.uk/sme-tax-news/8309-online-filing-service-for-companies-to-close" },
      { label: "GOV.UK: Company Tax Returns", url: "https://www.gov.uk/company-tax-returns" },
    ],
  },
  {
    slug: "accounts-longer-than-12-months",
    title: "Accounts longer than 12 months: why there are two tax returns",
    summary: "A company's first accounts often run for 13 months or more. Corporation Tax periods can't, so those accounts make two returns.",
    updated: "2026-10-21",
    sections: [
      {
        heading: "Why it happens",
        paragraphs: [
          "A company's first accounts run from the day it was formed to the last day of the month of its first anniversary — so a company formed on 15 January has first accounts to 31 January the following year, a little over 12 months. A year end moved later does the same.",
          "A Corporation Tax accounting period can't be longer than 12 months. So accounts for, say, 13 months cover two accounting periods: the first 12 months, then the rest. Each needs its own Company Tax Return.",
        ],
      },
      {
        heading: "How the figures are split",
        paragraphs: [
          "The trading profit of the whole period is shared between the two by days. Capital allowances are worked out for each period separately, by the dates things were bought and sold, and the short second period gets a reduced Annual Investment Allowance. Charitable donations count in the period they were paid. Losses brought forward are used in the first period first.",
          "Each period has its own limits for the small profits rate and marginal relief, reduced for the short period.",
        ],
      },
      {
        heading: "Deadlines",
        paragraphs: [
          "When the accounts cover 18 months or less, both returns are due 12 months after the end of the accounts. The tax for each period is due 9 months and a day after that period ends — so the first period's tax is due sooner.",
          "The same set of accounts goes with both returns. Nucta File does the split, attaches the accounts to each return and produces a computation for each.",
        ],
      },
    ],
    sources: [
      { label: "legislation.gov.uk: Finance Act 1998 Schedule 18 paragraph 14 (filing date)", url: "https://www.legislation.gov.uk/ukpga/1998/36/schedule/18/paragraph/14" },
      { label: "GOV.UK: Accounting periods for Corporation Tax", url: "https://www.gov.uk/corporation-tax-accounting-period" },
    ],
  },
  {
    slug: "dormant-company-tax-return",
    title: "Dormant companies: do you need to file a Company Tax Return?",
    summary: "Usually not — unless HMRC send a notice to file. The accounts still go to Companies House every year.",
    updated: "2026-10-21",
    sections: [
      {
        heading: "When a company is dormant",
        paragraphs: [
          "A company is dormant when it has no significant transactions: no trading, no income and no expenses. Paying Companies House fees doesn't count, nor does shareholders paying for their shares.",
        ],
      },
      {
        heading: "Corporation Tax",
        paragraphs: [
          "HMRC usually treat a dormant company as not needing to file a Company Tax Return. If HMRC send the company a notice to deliver a return, though, it must file one — a nil return, with its accounts.",
          "A dormant company sends no tax computation: the return says the company was dormant instead.",
        ],
      },
      {
        heading: "Companies House",
        paragraphs: [
          "Every company files accounts with Companies House each year, dormant or not. Dormant accounts are short: a balance sheet, usually just the share capital, and a statement that the company was dormant and is exempt from audit under section 480 of the Companies Act 2006.",
          "In Nucta File, answer yes to the dormant question in the first step. The figures steps are skipped, the accounts are prepared as dormant accounts, and a nil return is ready if HMRC ask for one.",
        ],
      },
    ],
    sources: [
      { label: "GOV.UK: Dormant companies and associations", url: "https://www.gov.uk/dormant-company" },
    ],
  },
  {
    slug: "directors-loans-s455",
    title: "Director's loans and the section 455 charge",
    summary: "Money a director takes out of the company that isn't salary, dividends or expenses is a loan — and an unpaid one at the year end can mean extra tax.",
    updated: "2026-10-21",
    sections: [
      {
        heading: "What the charge is",
        paragraphs: [
          "If a director or shareholder of a close company — most small companies — still owes the company money nine months after the year end, the company pays tax on the amount outstanding: 33.75% for loans made from 6 April 2022. It is reported on the CT600A page of the Company Tax Return and paid with the Corporation Tax.",
          "The tax is repaid to the company once the loan is repaid, released or written off.",
        ],
      },
      {
        heading: "The rate from 6 April 2026",
        paragraphs: [
          "For loans made on or after 6 April 2026 the rate is 35.75%. HMRC's systems accept only 33.75% until April 2027, so returns filed before then report 33.75% and are amended afterwards to add the difference. Nucta File works out the amendment and warns you.",
        ],
      },
      {
        heading: "Avoiding it",
        paragraphs: [
          "A loan repaid within nine months of the year end isn't charged — Nucta File gives that relief automatically when you enter the repayment and its date.",
          "Separately, an interest-free loan above £10,000 at any time in the tax year is a taxable benefit for a director, reported on form P11D, and the company pays Class 1A National Insurance on it.",
        ],
      },
    ],
    sources: [
      { label: "GOV.UK: Directors' loans", url: "https://www.gov.uk/directors-loans" },
    ],
  },
  {
    slug: "companies-house-software-filing-2028",
    title: "Companies House accounts: software-only filing from April 2028",
    summary: "From 1 April 2028 every company files its accounts through software, and small companies file their profit and loss account too.",
    updated: "2026-10-21",
    sections: [
      {
        heading: "What changes",
        paragraphs: [
          "From 1 April 2028, Companies House's web and paper routes for accounts close: every company files its annual accounts using commercial software, in iXBRL.",
          "Micro-entities and small companies will file a profit and loss account, and the option to file abridged accounts goes.",
        ],
      },
      {
        heading: "What it means with Nucta File",
        paragraphs: [
          "Nucta File already prepares the accounts in iXBRL for HMRC. Filing them with Companies House from the same screen is built and waiting for Companies House's test approval.",
        ],
      },
    ],
    sources: [
      { label: "TaxCalc: Companies House accounts filing changes, April 2028", url: "https://www.taxcalc.com/blog/companies-house-accounts-filing-changes-april-2028" },
    ],
  },
];

export const guide = (slug: string) => GUIDES.find((g) => g.slug === slug);
