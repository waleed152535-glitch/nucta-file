/**
 * The words on the Corporation Tax calculator page, kept apart from the page
 * so the Markdown copy (app/md) says exactly the same thing.
 */

export const CALCULATOR = {
  path: "/corporation-tax-calculator",
  title: "Corporation Tax calculator",
  metaTitle: "Corporation Tax calculator: 19%, 25% and marginal relief",
  description: "Work out a UK company's Corporation Tax for year ends from March 2025 to March 2027: the 19% and 25% rates, marginal relief, short periods and associated companies.",
  intro: "Work out a company's Corporation Tax for a year ending between March 2025 and March 2027: the 19% small profits rate, the 25% main rate and marginal relief in between, with the limits cut for a short period and shared with associated companies.",
  updated: "2026-11-12",
  how: [
    {
      heading: "The rates",
      paragraphs: [
        "Since 1 April 2023 a company pays 19% on profits up to £50,000 and 25% on profits over £250,000. In between it pays 25% less marginal relief, which works out at 26.5% on each pound between the two limits. The rates haven't changed since, and apply to the financial year running to 31 March 2027.",
      ],
    },
    {
      heading: "Short periods and associated companies",
      paragraphs: [
        "The £50,000 and £250,000 limits are for a 12-month period. For a shorter period they are cut by days: a 6-month period has limits of about £25,000 and £125,000.",
        "They are also shared: a company with one associated company divides each limit by two, with two associated companies by three, and so on.",
      ],
    },
    {
      heading: "When it's due",
      paragraphs: [
        "A company with profits up to £1.5 million pays its Corporation Tax 9 months and 1 day after the end of the accounting period. The Company Tax Return (CT600) is due 12 months after the end of the period.",
      ],
    },
    {
      heading: "What the calculator doesn't cover",
      paragraphs: [
        "Enter the taxable profit: the accounts' profit with expenses tax doesn't allow added back and capital allowances taken off. Dividends a company receives from companies outside its group can reduce marginal relief, and companies with profits over £1.5 million pay by instalments; neither is included here.",
        "The result shows how the rules work. It isn't advice about a particular company.",
      ],
    },
  ],
  faq: [
    {
      q: "What is the Corporation Tax rate for 2026/27?",
      a: "For the financial year from 1 April 2026 to 31 March 2027: 19% on profits up to £50,000, 25% on profits over £250,000, and 25% less marginal relief in between. These are the same as in the three years before.",
    },
    {
      q: "How is marginal relief worked out?",
      a: "Marginal relief is 3/200 of the difference between the upper limit and the profit. For a profit of £100,000 over 12 months with no associated companies: tax at 25% is £25,000, marginal relief is 3/200 × (£250,000 − £100,000) = £2,250, so the tax is £22,750.",
    },
    {
      q: "What counts as an associated company?",
      a: "Another company that is under the same control as yours, by the same person or group of people, at any time in the accounting period. Dormant companies, and holding companies that only hold shares in their subsidiaries, don't count.",
    },
    {
      q: "Does a loss mean no Corporation Tax?",
      a: "Yes, there's no Corporation Tax on a loss. A trading loss can be carried forward and set against later profits, which then reduces the tax in a later year.",
    },
  ],
  related: ["file-ct600-yourself", "corporation-tax-deadlines-penalties", "accounts-longer-than-12-months"],
} as const;
