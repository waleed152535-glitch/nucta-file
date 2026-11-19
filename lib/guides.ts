/**
 * Short guides for the website: the questions directors and accountants ask
 * most. Each states the rule plainly and says where it comes from.
 */

export interface Guide {
  slug: string;
  title: string;
  summary: string;
  updated: string;
  /** When it first went up, if earlier than `updated`. */
  published?: string;
  /** Short title for the share image and links, when the full one is long. */
  short?: string;
  sections: { heading: string; paragraphs: string[] }[];
  sources: { label: string; url: string }[];
  /** Other guides a reader of this one usually wants next, by slug. */
  related: string[];
}

export const GUIDES: Guide[] = [
  {
    slug: "hmrc-online-filing-closed",
    title: "HMRC's free Company Tax Return service has closed: what to do now",
    summary: "Since 1 April 2026, Company Tax Returns go to HMRC through commercial software. Here is what that means for a small company.",
    updated: "2026-11-12",
    published: "2026-10-21",
    short: "HMRC's free filing service has closed",
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
          "Late returns cost more than they used to. For returns due on or after 1 April 2026 the penalty is £200, rising to £400 once the return is three months late.",
        ],
      },
      {
        heading: "The accounts still go to Companies House",
        paragraphs: [
          "The joint service filed the accounts with Companies House and HMRC in one go. Now they are two filings: the CT600 with the accounts to HMRC, and the accounts on their own to Companies House, usually 9 months after the year end for a private company.",
          "Until April 2028 Companies House still take accounts through their own online service as well as through software. From 1 April 2028 software becomes the only way.",
        ],
      },
      {
        heading: "Using Nucta Filings",
        paragraphs: [
          "You enter the year's figures once. Nucta Filings prepares micro-entity or small company accounts, works out the computation and the tax, builds the CT600 and attaches the accounts and computation in iXBRL. Each return is checked by HMRC's test service before it can be filed for real.",
        ],
      },
    ],
    sources: [
      { label: "Ross Martin Tax Consultancy: online filing service for companies to close", url: "https://rossmartin.co.uk/sme-tax-news/8309-online-filing-service-for-companies-to-close" },
      { label: "GOV.UK: Company Tax Returns", url: "https://www.gov.uk/company-tax-returns" },
      { label: "GOV.UK: Increases to Corporation Tax late filing penalties", url: "https://www.gov.uk/government/publications/corporation-tax-increases-to-late-filing-penalties/increases-to-corporation-tax-late-filing-penalties" },
    ],
    related: ["file-ct600-yourself", "corporation-tax-deadlines-penalties", "companies-house-software-filing-2028"],
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
          "The same set of accounts goes with both returns. Nucta Filings does the split, attaches the accounts to each return and produces a computation for each.",
        ],
      },
    ],
    sources: [
      { label: "legislation.gov.uk: Finance Act 1998 Schedule 18 paragraph 14 (filing date)", url: "https://www.legislation.gov.uk/ukpga/1998/36/schedule/18/paragraph/14" },
      { label: "GOV.UK: Accounting periods for Corporation Tax", url: "https://www.gov.uk/corporation-tax-accounting-period" },
    ],
    related: ["corporation-tax-deadlines-penalties", "file-ct600-yourself", "micro-entity-or-small-company-accounts"],
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
          "In Nucta Filings, answer yes to the dormant question in the first step. The figures steps are skipped, the accounts are prepared as dormant accounts, and a nil return is ready if HMRC ask for one.",
        ],
      },
    ],
    sources: [
      { label: "GOV.UK: Dormant companies and associations", url: "https://www.gov.uk/dormant-company" },
    ],
    related: ["micro-entity-or-small-company-accounts", "corporation-tax-deadlines-penalties", "companies-house-software-filing-2028"],
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
          "For loans made on or after 6 April 2026 the rate is 35.75%. HMRC's systems accept only 33.75% until April 2027, so returns filed before then report 33.75% and are amended afterwards to add the difference. Nucta Filings works out the amendment and warns you.",
        ],
      },
      {
        heading: "Avoiding it",
        paragraphs: [
          "A loan repaid within nine months of the year end isn't charged — Nucta Filings gives that relief automatically when you enter the repayment and its date.",
          "Separately, an interest-free loan above £10,000 at any time in the tax year is a taxable benefit for a director, reported on form P11D, and the company pays Class 1A National Insurance on it.",
        ],
      },
    ],
    sources: [
      { label: "GOV.UK: Directors' loans", url: "https://www.gov.uk/directors-loans" },
    ],
    related: ["file-ct600-yourself", "corporation-tax-deadlines-penalties", "accounts-longer-than-12-months"],
  },
  {
    slug: "companies-house-software-filing-2028",
    title: "Companies House accounts: software-only filing from April 2028",
    short: "Software-only accounts filing from April 2028",
    summary: "From 1 April 2028 every company files its accounts with Companies House through software. The plan to make small companies file their profit and loss account has been paused.",
    updated: "2026-11-12",
    published: "2026-10-21",
    sections: [
      {
        heading: "What still changes in April 2028",
        paragraphs: [
          "From 1 April 2028 Companies House close their web and paper routes for accounts. Every company files its annual accounts through commercial software, in iXBRL, whether the directors file them or an accountant does.",
          "The web service stays open for filings that aren't accounts, such as the confirmation statement.",
          "Three smaller changes come with it: a stronger statement for companies claiming exemption from audit, the parts of the accounts and reports filed together rather than separately, and a limit on how often a company can shorten its accounting reference period.",
        ],
      },
      {
        heading: "What has been paused",
        paragraphs: [
          "Small companies and micro-entities were also due to file their profit and loss account with Companies House from April 2028. On 23 October 2026 Companies House announced that this is paused, following the Small Business Regulatory Taskforce's recommendations, while the government looks at bringing Companies House and HMRC filing closer together.",
          "So small companies can keep filing abridged accounts, and can keep leaving out (\u201cfilleting\u201d) the profit and loss account from the copy on the public register.",
        ],
      },
      {
        heading: "What it means with Nucta Filings",
        paragraphs: [
          "Nucta Filings already prepares the accounts in iXBRL and files them with Companies House from the same screen as the CT600, so nothing changes for its users in April 2028.",
          "Small company accounts in Nucta Filings include the profit and loss account and the directors' report. The copy for Companies House leaves them out, as the law allows, and says so on the balance sheet.",
        ],
      },
    ],
    sources: [
      { label: "GOV.UK: Companies House update to accounts filing from April 2028 (23 October 2026)", url: "https://www.gov.uk/government/news/companies-house-update-to-accounts-filing-from-april-2028" },
      { label: "ICAEW: Government pauses profit and loss filing but sticks with software-only filing", url: "https://www.icaew.com/insights/viewpoints-on-the-news/2026/nov-2026/uk-government-pauses-profit-and-loss-filing-but-sticks-with-software-only-filing" },
    ],
    related: ["micro-entity-or-small-company-accounts", "hmrc-online-filing-closed", "dormant-company-tax-return"],
  },
  {
    slug: "corporation-tax-deadlines-penalties",
    title: "Corporation Tax deadlines and late filing penalties",
    short: "Corporation Tax deadlines and penalties",
    summary: "When a small company's accounts, CT600 and Corporation Tax are due, and what each costs when it's late, including the penalties that doubled for returns due from 1 April 2026.",
    updated: "2026-11-12",
    sections: [
      {
        heading: "Three deadlines a year",
        paragraphs: [
          "Accounts to Companies House: 9 months after the end of the financial year for a private company. A company's first accounts are due 21 months after the day it was formed.",
          "Corporation Tax to HMRC: 9 months and 1 day after the end of the accounting period, for a company with profits up to £1.5 million.",
          "The Company Tax Return (CT600) to HMRC: 12 months after the end of the accounting period.",
          "So for a year ending 31 March 2026, the accounts are due at Companies House by 31 December 2026, the tax by 1 January 2027 and the return by 31 March 2027. The tax is due before the return.",
        ],
      },
      {
        heading: "A late Company Tax Return",
        paragraphs: [
          "For returns due on or after 1 April 2026, HMRC charge £200 if the return is late, and £400 if it is more than three months late. These amounts doubled from £100 and £200.",
          "If the return is late for the third accounting period running, the penalty is £1,000, or £2,000 once more than three months late.",
          "If the return still isn't in 18 months after the end of the period, HMRC add a penalty of 10% of the tax unpaid at that point, and 20% if it isn't in within two years.",
        ],
      },
      {
        heading: "Late Corporation Tax",
        paragraphs: [
          "Tax paid after its due date carries interest, charged from the day after the deadline until the day it's paid. The rate is the Bank of England base rate plus 4%.",
          "Pay with the 17-character payment reference on HMRC's notice to deliver or in the company's HMRC online account, so the money reaches the right company and period.",
        ],
      },
      {
        heading: "Late accounts at Companies House",
        paragraphs: [
          "Companies House penalties for a private company depend on how late the accounts are: £150 up to a month, £375 up to three months, £750 up to six months and £1,500 after that.",
          "The penalty doubles if the accounts were also late the year before. It is charged to the company, and the directors can be prosecuted for not filing.",
        ],
      },
      {
        heading: "Keeping track with Nucta Filings",
        paragraphs: [
          "Nucta Filings works out all three deadlines for every company you add and lists what is overdue and what is due in the next 30 days. You can add them to Outlook, Apple or Google Calendar with reminders a week and a day before.",
          "To check one company without an account, use the free deadline checker: it reads the company's Companies House record.",
        ],
      },
    ],
    sources: [
      { label: "GOV.UK: Increases to Corporation Tax late filing penalties", url: "https://www.gov.uk/government/publications/corporation-tax-increases-to-late-filing-penalties/increases-to-corporation-tax-late-filing-penalties" },
      { label: "GOV.UK: Corporation Tax penalty determinations (CT211 notes)", url: "https://www.gov.uk/government/publications/corporation-tax-penalty-determinations-ct211-notes/corporation-tax-penalty-determinations-ct211-notes" },
      { label: "GOV.UK: Pay your Corporation Tax bill", url: "https://www.gov.uk/pay-corporation-tax" },
      { label: "GOV.UK: Late filing penalties (Companies House)", url: "https://www.gov.uk/government/publications/late-filing-penalties/late-filing-penalties" },
    ],
    related: ["file-ct600-yourself", "accounts-longer-than-12-months", "hmrc-online-filing-closed"],
  },
  {
    slug: "micro-entity-or-small-company-accounts",
    title: "Micro-entity or small company accounts: which can your company use?",
    short: "Micro-entity or small company accounts?",
    summary: "The size limits went up for financial years starting on or after 6 April 2025. How to tell whether your company can prepare micro-entity accounts, and what changes if it can't.",
    updated: "2026-11-12",
    sections: [
      {
        heading: "The size limits",
        paragraphs: [
          "A company is a micro-entity if it meets at least two of these: turnover of no more than £1 million, a balance sheet total (its assets before taking off what it owes) of no more than £500,000, and no more than 10 employees on average.",
          "It is small if it meets two of: turnover of no more than £15 million, a balance sheet total of no more than £7.5 million, and no more than 50 employees.",
          "These limits apply to financial years beginning on or after 6 April 2025. Before that they were £632,000 and £316,000 for a micro-entity, and £10.2 million and £5.1 million for a small company, with the same employee numbers.",
        ],
      },
      {
        heading: "Two years in a row",
        paragraphs: [
          "A company's size doesn't change because of one unusual year. It moves up or down only when it meets, or fails, the limits two years running. A new company takes the size it meets in its first year.",
        ],
      },
      {
        heading: "Who can't be a micro-entity",
        paragraphs: [
          "Some companies can't use the micro-entity rules whatever their size: charities, investment and financial holding companies, credit institutions and insurers, a parent company that prepares group accounts, and a subsidiary whose accounts are included in group accounts.",
        ],
      },
      {
        heading: "What each set of accounts contains",
        paragraphs: [
          "Micro-entity accounts, under FRS 105, are a balance sheet and a short profit and loss account, with only a few notes: advances and credits to directors, and guarantees and other financial commitments. No directors' report is needed for Companies House.",
          "Small company accounts, under FRS 102 Section 1A, have fuller notes and a directors' report. A small company may still leave out the profit and loss account and the directors' report from the copy it files at Companies House.",
          "HMRC always get the full accounts, profit and loss account included, in iXBRL with the Company Tax Return.",
        ],
      },
      {
        heading: "With Nucta Filings",
        paragraphs: [
          "Nucta Filings prepares either set from the same figures: FRS 105 micro-entity accounts, or FRS 102 Section 1A small company accounts with the directors' report and notes, and the shorter copy for Companies House.",
        ],
      },
    ],
    sources: [
      { label: "GOV.UK: Accounts for micro-entities, small and dormant companies", url: "https://www.gov.uk/annual-accounts/microentities-small-and-dormant-companies" },
      { label: "legislation.gov.uk: The Companies (Accounts and Reports) (Amendment and Transitional Provision) Regulations 2024", url: "https://www.legislation.gov.uk/uksi/2024/1303/contents/made" },
    ],
    related: ["dormant-company-tax-return", "companies-house-software-filing-2028", "file-ct600-yourself"],
  },
  {
    slug: "file-ct600-yourself",
    title: "How to file a CT600 Company Tax Return yourself",
    short: "How to file a CT600 yourself",
    summary: "With HMRC's free service gone, a company files its CT600 through software. What you need before you start, and the steps from the year's figures to HMRC accepting the return.",
    updated: "2026-11-12",
    sections: [
      {
        heading: "What you need first",
        paragraphs: [
          "The company's Corporation Tax Unique Taxpayer Reference (UTR): 10 digits, on HMRC's notice to deliver a return and on letters about Corporation Tax.",
          "The Government Gateway user ID and password the company uses for HMRC's online services, with Corporation Tax added to it. An accountant filing for a client uses their agent login instead.",
          "The dates of the accounting period, and the year's figures: sales, costs, what the company owns and owes, and last year's accounts if there were any.",
        ],
      },
      {
        heading: "The steps",
        paragraphs: [
          "Prepare the accounts: micro-entity or small company accounts, depending on the company's size.",
          "Work out the taxable profit. Start from the accounts' profit, add back what tax doesn't allow (such as client entertaining and depreciation) and take off capital allowances for equipment and vans bought.",
          "Work out the tax: 19% on profits up to £50,000, 25% above £250,000, and the main rate less marginal relief in between. The limits are shared between associated companies and cut for a period shorter than 12 months.",
          "Complete the CT600, plus the CT600A page if a director owed the company money at the year end.",
          "Have a director approve the accounts and the return, then send them with the accounts and computation attached in iXBRL. HMRC check the return as it arrives and either accept it or reject it with a reason you can correct.",
          "Pay the tax by 9 months and 1 day after the period ends, using the company's 17-character payment reference.",
        ],
      },
      {
        heading: "Then Companies House",
        paragraphs: [
          "The accounts also go to Companies House, separately, usually 9 months after the year end. Until April 2028 that can be through Companies House's own online service; from 1 April 2028 it has to be through software.",
        ],
      },
      {
        heading: "With Nucta Filings",
        paragraphs: [
          "Nucta Filings takes you through those steps in one place: you enter the figures once, and it prepares the accounts, the computation, the tax and the CT600, gives the director an approval pack, files with HMRC, and files the accounts with Companies House. Every return is checked against HMRC's test service before it can be filed for real.",
        ],
      },
    ],
    sources: [
      { label: "GOV.UK: Company Tax Returns", url: "https://www.gov.uk/company-tax-returns" },
      { label: "GOV.UK: Corporation Tax rates and reliefs", url: "https://www.gov.uk/corporation-tax-rates" },
      { label: "GOV.UK: Pay your Corporation Tax bill", url: "https://www.gov.uk/pay-corporation-tax" },
    ],
    related: ["corporation-tax-deadlines-penalties", "hmrc-online-filing-closed", "directors-loans-s455"],
  },
];

export const guide = (slug: string) => GUIDES.find((g) => g.slug === slug);

/** The guides to suggest after this one, in the order given, skipping any that don't exist. */
export const relatedTo = (g: Guide): Guide[] => g.related.map(guide).filter((x): x is Guide => Boolean(x) && x!.slug !== g.slug);
