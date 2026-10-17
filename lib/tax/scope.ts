/**
 * Which companies Nucta File can file for.
 *
 * Each question names something the engine doesn't yet compute. Answering
 * "yes" to any of them stops the return with a plain explanation, so a
 * company is never filed on a computation that silently left something out.
 * As each is supported, its question is removed from the list.
 */

export interface ScopeAnswers {
  /** Is the company UK resident, with its trade carried on in the UK? */
  ukResidentUkTrade: boolean;
  /**
   * Did a director or shareholder repay a loan and borrow £5,000 or more again
   * within 30 days, or receive a benefit under an arrangement rather than a
   * loan? Ordinary director's loans are handled; these two cases aren't.
   */
  loanArrangements: boolean;
  /** Is it claiming or giving up losses within a group (group relief)? Associated companies alone are fine. */
  groupRelief: boolean;
  /** Is it claiming research and development relief or a creative industry relief? */
  researchOrCreativeRelief: boolean;
  /** Did it sell or give away land, buildings, shares or other investments (chargeable gains)? */
  chargeableGains: boolean;
  /** Did it receive dividends from other companies? */
  dividendsReceived: boolean;
  /** Does it have income from property or investments, other than bank interest? */
  propertyOrInvestmentIncome: boolean;
  /** Does it have income from abroad, an overseas branch, or a controlled foreign company? */
  overseasIncome: boolean;
  /** Does it lease out plant, machinery or vehicles? */
  leasesOutAssets: boolean;
  /** Did it stop trading, or start a new trade, during the period? */
  startedOrStoppedTrade: boolean;
  /** Does it claim structures and buildings allowance, or own a building it claims allowances on? */
  buildingsAllowances: boolean;
}

export const SCOPE_QUESTIONS: { key: keyof ScopeAnswers; ask: string; expect: boolean; why: string }[] = [
  { key: "ukResidentUkTrade", expect: true, ask: "Is the company UK resident, with one trade carried on in the UK?", why: "Non-resident companies and overseas trades are taxed under different rules." },
  { key: "loanArrangements", expect: false, ask: "Did a director or shareholder repay a loan and then borrow £5,000 or more again within 30 days, or receive a benefit from the company under an arrangement rather than a loan?", why: "These are taxed under special rules (sections 464A and 464C) that need an accountant. Ordinary director's loans are fine — enter them in the director's loans step." },
  { key: "groupRelief", expect: false, ask: "Is the company claiming or giving up losses with other companies in a group (group relief)?", why: "Group relief needs the CT600C page." },
  { key: "researchOrCreativeRelief", expect: false, ask: "Is the company claiming research and development relief, or a creative industry relief?", why: "These claims have their own pages and detailed rules." },
  { key: "chargeableGains", expect: false, ask: "Did the company sell or give away land, buildings, shares or other investments?", why: "Gains on these are calculated separately and added to profits." },
  { key: "dividendsReceived", expect: false, ask: "Did the company receive dividends from other companies?", why: "They change the marginal relief calculation." },
  { key: "propertyOrInvestmentIncome", expect: false, ask: "Does the company have rental income, or investment income other than bank interest?", why: "Property businesses are computed separately from the trade." },
  { key: "overseasIncome", expect: false, ask: "Does the company have income from abroad, an overseas branch, or a company it controls abroad?", why: "Foreign income and double tax relief aren't handled yet." },
  { key: "leasesOutAssets", expect: false, ask: "Does the company lease out plant, machinery or vehicles to others?", why: "Leased assets are excluded from full expensing and have their own allowance rules." },
  { key: "startedOrStoppedTrade", expect: false, ask: "Did the company stop trading, or start a new trade, during this period?", why: "Starting or ceasing a trade ends or begins an accounting period and changes how losses and allowances work." },
  { key: "buildingsAllowances", expect: false, ask: "Is the company claiming structures and buildings allowance?", why: "Buildings allowances aren't handled yet." },
];

/** The reasons this company can't be filed through Nucta File yet. Empty means it can. */
export function scopeProblems(a: Partial<ScopeAnswers>): string[] {
  return SCOPE_QUESTIONS.flatMap((q) => {
    const v = a[q.key];
    if (v === undefined) return [`Please answer: ${q.ask}`];
    return v === q.expect ? [] : [`${q.why}`];
  });
}
