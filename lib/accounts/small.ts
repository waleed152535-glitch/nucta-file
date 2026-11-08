/**
 * Small-company accounts under FRS 102 Section 1A, for companies too big for
 * micro-entity accounts but within the small companies regime.
 *
 * They're fuller than micro-entity accounts: a profit and loss account in
 * Format 1 (turnover, cost of sales, gross profit, administrative expenses,
 * operating profit, interest), a balance sheet that splits fixed and current
 * assets, a short directors' report, and the notes Section 1A and the
 * Companies Act require — accounting policies, employees, the movement in
 * tangible fixed assets, what debtors and creditors are made of, deferred
 * tax, share capital, dividends, commitments and advances to directors.
 *
 * The same totals feed the tax engine and the balance check as for
 * micro-entity accounts: here they're worked out from the detail entered, so
 * the two can never disagree.
 */
import type { AccountsInput, PriorSmall, PriorYear, SmallAccountsBlock } from "../ixbrl";
import { microAccounts, type BalanceSheet, type MicroAccountsFigures } from "./micro";
import { addYear, daysInclusive, toDay } from "../tax/dates";

export type AccountsFormat = "micro" | "small";

/** What small-company accounts need beyond the micro-entity balance sheet. */
export interface SmallDetail {
  /** Shares and other investments held for the long term, at cost. */
  investments: number;
  /** Tangible fixed assets: cost and depreciation, for the note. Their net book value is the balance sheet figure. */
  tangibleCostBroughtForward: number;
  tangibleAdditions: number;
  tangibleDisposalsCost: number;
  depreciationBroughtForward: number;
  depreciationOnDisposals: number;
  /** How equipment is depreciated, in words. */
  depreciationPolicy: string;
  tradeDebtors: number;
  otherDebtors: number;
  /** Creditors due within a year, apart from Corporation Tax and directors' loans, which come from elsewhere. */
  bankWithin: number;
  tradeCreditors: number;
  /** PAYE, National Insurance and VAT owed: taxes other than Corporation Tax. */
  taxationSocialSecurity: number;
  otherCreditorsWithin: number;
  accrualsWithin: number;
  bankAfter: number;
  otherAfter: number;
  /**
   * The deferred tax provision at the start and end of the year. FRS 102
   * requires it where the books and the tax rules write equipment off at
   * different speeds; the difference in the year is part of the tax charge.
   */
  deferredTaxBroughtForward: number;
  deferredTaxCarriedForward: number;
  /** Part of "all other expenses" that is interest paid, shown on its own line. */
  interestPayable: number;
  sharesNumber: number;
  /** Nominal value of each share, in pounds. */
  shareNominal: number;
  /** Financial commitments, guarantees and contingencies not on the balance sheet, in words. Blank means none. */
  commitments: string;
  /** Directors other than the one approving the accounts who served in the year, one per line. */
  otherDirectors: string;
}

export const DEFAULT_DEPRECIATION_POLICY =
  "Depreciation is charged so as to write off the cost of each asset over its useful life, on a straight-line basis: computer equipment over 3 years and other equipment over 4 years.";

export const blankSmallDetail = (): SmallDetail => ({
  investments: 0,
  tangibleCostBroughtForward: 0, tangibleAdditions: 0, tangibleDisposalsCost: 0, depreciationBroughtForward: 0, depreciationOnDisposals: 0,
  depreciationPolicy: DEFAULT_DEPRECIATION_POLICY,
  tradeDebtors: 0, otherDebtors: 0,
  bankWithin: 0, tradeCreditors: 0, taxationSocialSecurity: 0, otherCreditorsWithin: 0, accrualsWithin: 0,
  bankAfter: 0, otherAfter: 0, deferredTaxBroughtForward: 0, deferredTaxCarriedForward: 0, interestPayable: 0,
  sharesNumber: 100, shareNominal: 1,
  commitments: "", otherDirectors: "",
});

export const normaliseSmall = (s: Partial<SmallDetail> | null | undefined): SmallDetail => ({ ...blankSmallDetail(), ...(s ?? {}) });

const r = (v: number) => Math.round(Number.isFinite(v) ? v : 0);

/** The tangible fixed assets note: cost and depreciation brought forward and carried forward, and the net book values. */
export function tangibleNote(s: SmallDetail, depreciationCharge: number) {
  const costBf = r(s.tangibleCostBroughtForward), additions = r(s.tangibleAdditions), disposals = r(s.tangibleDisposalsCost);
  const depBf = r(s.depreciationBroughtForward), charge = r(depreciationCharge), depDisposals = r(s.depreciationOnDisposals);
  const costCf = costBf + additions - disposals;
  const depCf = depBf + charge - depDisposals;
  return { costBf, additions, disposals, costCf, depBf, charge, depDisposals, depCf, nbvCf: costCf - depCf, nbvBf: costBf - depBf };
}
export type TangibleNote = ReturnType<typeof tangibleNote>;

/** Share capital from the number of shares and their nominal value, to the penny. */
export const shareCapitalOf = (s: SmallDetail): number =>
  s.sharesNumber > 0 && s.shareNominal > 0 ? Math.round(s.sharesNumber * s.shareNominal * 100) / 100 : 0;

/** The deferred tax charge (or credit, if negative) for the year: the movement in the provision. */
export const deferredTaxCharge = (s: SmallDetail): number => r(s.deferredTaxCarriedForward) - r(s.deferredTaxBroughtForward);

/**
 * The balance sheet totals, worked out from the detail: fixed assets from
 * equipment's net book value and investments; debtors, creditors and share
 * capital from their parts; provisions with the deferred tax provision
 * added. Cash, stock, prepayments, other provisions, directors' loans and
 * reserves are entered as for micro-entity accounts.
 */
export function applySmall(b: BalanceSheet, s: SmallDetail, depreciationCharge: number): BalanceSheet {
  const t = tangibleNote(s, depreciationCharge);
  const shares = shareCapitalOf(s);
  return {
    ...b,
    fixedAssets: t.nbvCf + r(s.investments),
    debtors: r(s.tradeDebtors) + r(s.otherDebtors),
    creditorsWithin: r(s.bankWithin) + r(s.tradeCreditors) + r(s.taxationSocialSecurity) + r(s.otherCreditorsWithin) + r(s.accrualsWithin),
    creditorsAfter: r(s.bankAfter) + r(s.otherAfter),
    provisions: r(b.provisions) + r(s.deferredTaxCarriedForward),
    shareCapital: shares || b.shareCapital,
  };
}

// ---- size: which accounts the company can prepare ----

export interface SizeLimits { turnover: number; balanceSheet: number; employees: number }

/** The limits for financial years beginning on or after 6 April 2025, and those before (Companies Act 2006 s382 and s384A). */
export function sizeLimits(periodFrom: string): { micro: SizeLimits; small: SizeLimits } {
  return periodFrom >= "2025-04-06"
    ? { micro: { turnover: 1_000_000, balanceSheet: 500_000, employees: 10 }, small: { turnover: 15_000_000, balanceSheet: 7_500_000, employees: 50 } }
    : { micro: { turnover: 632_000, balanceSheet: 316_000, employees: 10 }, small: { turnover: 10_200_000, balanceSheet: 5_100_000, employees: 50 } };
}

export interface SizeAnswer {
  /** Within the micro-entity limits on two of the three tests. */
  micro: boolean;
  small: boolean;
  limits: { micro: SizeLimits; small: SizeLimits };
  /** Turnover scaled to a year, as the test requires for a longer or shorter period. */
  turnoverForYear: number;
  balanceSheetTotal: number;
  employees: number;
}

/**
 * Whether a company's figures fit the micro-entity and small limits, on two
 * of the three tests. Only this year's figures are known here; a company
 * moves between sizes only after two years in a row on the other side, so
 * the answer is a guide, and said as one.
 */
export function sizeTest(periodFrom: string, periodTo: string, turnover: number, balanceSheetTotal: number, employees: number): SizeAnswer {
  const limits = sizeLimits(periodFrom);
  const yearDays = toDay(addYear(periodFrom)) - toDay(periodFrom);
  const days = daysInclusive(periodFrom, periodTo);
  const turnoverForYear = days > 0 ? Math.round(turnover * yearDays / days) : turnover;
  const within = (l: SizeLimits) => [turnoverForYear <= l.turnover, balanceSheetTotal <= l.balanceSheet, employees <= l.employees].filter(Boolean).length >= 2;
  return { micro: within(limits.micro), small: within(limits.small), limits, turnoverForYear, balanceSheetTotal, employees };
}

/** The balance sheet total for the size test: everything the company has, before what it owes. */
export const grossAssets = (b: BalanceSheet): number =>
  r(b.shareCapitalNotPaid + b.fixedAssets + b.stock + b.debtors + b.cash + b.prepayments + (b.owedByParticipators ?? 0));

const money = (n: number) => `£${Math.round(n).toLocaleString("en-GB")}`;

/** What the size test means for the accounts chosen, in words; nothing when there's nothing to say. */
export function sizeAdvice(format: AccountsFormat, size: SizeAnswer): string | null {
  const why = (l: SizeLimits) =>
    `turnover ${money(size.turnoverForYear)} (limit ${money(l.turnover)}), balance sheet total ${money(size.balanceSheetTotal)} (limit ${money(l.balanceSheet)}), ${size.employees} employees (limit ${l.employees})`;
  if (format === "micro" && !size.micro) {
    return `This year's figures are above the micro-entity limits on at least two of the three tests: ${why(size.limits.micro)}. ` +
      "A company stops being a micro-entity only after two years in a row above them, so micro-entity accounts may still be right this year. If last year was above them too, choose small company accounts in step 1.";
  }
  if (!size.small) {
    return `This year's figures are above the small company limits on at least two of the three tests: ${why(size.limits.small)}. ` +
      "If last year was above them too, the company is medium-sized and needs fuller accounts than Nucta File prepares; ask an accountant.";
  }
  return null;
}

// ---- checks ----

/** What's wrong with the detail, in words: things that would make the accounts wrong, and things to check. */
export function checkSmallDetail(s: SmallDetail, depreciationCharge: number, otherCharges: number, prior?: PriorYear | null): { problems: string[]; warnings: string[] } {
  const problems: string[] = [];
  const warnings: string[] = [];
  const t = tangibleNote(s, depreciationCharge);
  if (t.costCf < 0) problems.push("The cost of equipment at the year end comes out below nothing: check the cost at the start, what was bought and what was sold.");
  if (t.depCf < 0) problems.push("Depreciation at the year end comes out below nothing: check the depreciation at the start and on equipment sold.");
  if (t.costCf >= 0 && t.depCf > t.costCf) problems.push("Equipment's depreciation comes to more than its cost. Check the depreciation at the start, this year's depreciation and the figures for equipment sold.");
  const labels: Partial<Record<keyof SmallDetail, string>> = {
    investments: "investments", tangibleCostBroughtForward: "equipment cost at the start", tangibleAdditions: "equipment bought", tangibleDisposalsCost: "cost of equipment sold",
    depreciationBroughtForward: "depreciation at the start", depreciationOnDisposals: "depreciation on equipment sold", tradeDebtors: "owed by customers",
    otherDebtors: "other money owed to the company", bankWithin: "bank loans and overdrafts due within a year", tradeCreditors: "owed to suppliers",
    taxationSocialSecurity: "PAYE, National Insurance and VAT owed", otherCreditorsWithin: "other money owed", accrualsWithin: "accruals",
    bankAfter: "bank loans due after a year", otherAfter: "other money owed after a year", deferredTaxBroughtForward: "deferred tax at the start",
    deferredTaxCarriedForward: "deferred tax at the end", interestPayable: "interest paid",
  };
  const neg = (Object.keys(labels) as (keyof SmallDetail)[]).filter((k) => typeof s[k] === "number" && (s[k] as number) < 0).map((k) => labels[k]);
  if (neg.length) problems.push(`These should be positive amounts: ${neg.join(", ")}.`);
  if (s.interestPayable > otherCharges) problems.push("Interest paid is part of all other expenses, so it can't be more than them.");
  if (!(s.sharesNumber > 0) || !(s.shareNominal > 0)) problems.push("Enter how many shares the company has issued and the value of each, for the share capital note.");
  if (!Number.isInteger(s.sharesNumber)) problems.push("The number of shares is a whole number.");
  if (!s.depreciationPolicy.trim() && (t.costBf || t.costCf)) problems.push("Say how equipment is depreciated, for the accounting policies note.");
  if (t.costBf === 0 && t.depBf > 0) warnings.push("There's depreciation at the start on equipment with no cost at the start. Check last year's fixed assets note.");
  const ps = prior?.small;
  if (ps && Math.abs(ps.tangibleAssets - t.nbvBf) >= 1) {
    warnings.push(`Last year's balance sheet shows equipment of ${money(ps.tangibleAssets)}, but the cost less depreciation at the start of this year comes to ${money(t.nbvBf)}. They should be the same.`);
  }
  if (ps && Math.abs(ps.deferredTaxProvision - r(s.deferredTaxBroughtForward)) >= 1) {
    warnings.push(`Last year's deferred tax provision was ${money(ps.deferredTaxProvision)}, but the deferred tax at the start of this year is ${money(s.deferredTaxBroughtForward)}. They should be the same.`);
  }
  return { problems, warnings };
}

/**
 * A suggestion for the deferred tax provision at the year end: the gap
 * between equipment's value in the books and in the tax pools, at the rate
 * expected when it reverses. It's a starting point for the person preparing
 * the accounts, not a figure Nucta File puts in by itself.
 */
export function suggestDeferredTax(netBookValue: number, taxPools: number, taxableProfit: number): { amount: number; rate: number; gap: number } {
  const gap = Math.max(0, r(netBookValue) - r(taxPools));
  // The main rate where profits are above the small profits limit, as most
  // accounts use for the marginal band too; the small profits rate below it.
  const rate = taxableProfit > 50_000 ? 0.25 : 0.19;
  return { amount: Math.round(gap * rate), rate, gap };
}

// ---- last year ----

export const blankPriorSmall = (): PriorSmall => ({
  costOfSales: 0, administrativeExpenses: 0, otherOperatingIncome: 0, interestReceivable: 0, interestPayable: 0, currentTax: 0, deferredTax: 0,
  tangibleAssets: 0, investments: 0, stocks: 0, tradeDebtors: 0, owedByDirectors: 0, otherDebtors: 0, prepayments: 0, cash: 0,
  bankWithin: 0, tradeCreditors: 0, corporationTax: 0, otherTaxation: 0, owedToDirectors: 0, otherCreditorsWithin: 0, accrualsWithin: 0,
  bankAfter: 0, otherAfter: 0, deferredTaxProvision: 0, otherProvisions: 0, shareCapital: 0, dividendsPaid: 0,
});

/**
 * Last year's lines, started from the totals of micro-entity accounts. They
 * can't be split for us — current assets might be stock, debtors or cash —
 * so each total goes on one line, to be split by hand. The comparative column
 * adds up either way.
 */
export function priorSmallFromTotals(p: PriorYear): PriorSmall {
  return {
    ...blankPriorSmall(),
    costOfSales: r(p.rawMaterials),
    administrativeExpenses: r(p.staffCosts + p.depreciation + p.otherCharges),
    otherOperatingIncome: r(p.otherIncome),
    currentTax: r(p.tax),
    tangibleAssets: r(p.fixedAssets),
    cash: r(p.currentAssets),
    prepayments: r(p.prepayments),
    otherCreditorsWithin: r(p.creditorsWithin),
    otherAfter: r(p.creditorsAfter),
    otherProvisions: r(p.provisions),
    accrualsWithin: r(p.accruals),
  };
}

/** Last year's profit before tax, from the Format 1 lines. */
export const priorSmallProfit = (turnover: number, s: PriorSmall): number =>
  r(turnover - s.costOfSales - s.administrativeExpenses + s.otherOperatingIncome + s.interestReceivable - s.interestPayable);

/** Last year's totals worked out from its lines, so the comparative balance sheet adds up and checks see the same figures. */
export function syncPriorFromSmall(p: PriorYear): PriorYear {
  const s = p.small;
  if (!s) return p;
  return {
    ...p,
    rawMaterials: r(s.costOfSales), otherIncome: r(s.otherOperatingIncome + s.interestReceivable), staffCosts: 0, depreciation: 0,
    otherCharges: r(s.administrativeExpenses + s.interestPayable),
    profitBeforeTax: priorSmallProfit(p.turnover, s),
    tax: r(s.currentTax + s.deferredTax),
    fixedAssets: r(s.tangibleAssets + s.investments),
    currentAssets: r(s.stocks + s.tradeDebtors + s.owedByDirectors + s.otherDebtors + s.cash),
    prepayments: r(s.prepayments),
    creditorsWithin: r(s.bankWithin + s.tradeCreditors + s.corporationTax + s.otherTaxation + s.owedToDirectors + s.otherCreditorsWithin + s.accrualsWithin),
    creditorsAfter: r(s.bankAfter + s.otherAfter),
    provisions: r(s.deferredTaxProvision + s.otherProvisions),
    accruals: 0,
  };
}

// ---- the accounts ----

export interface SmallAccountsFigures extends MicroAccountsFigures {
  /** The balance sheet as applySmall leaves it, with the Corporation Tax owed set. */
  balanceSheet: BalanceSheet;
  small: SmallDetail;
  /** This period's Corporation Tax, from the computation; taxCharge is this plus deferred tax. */
  currentTax: number;
}

const names = (first: string, more: string): string[] => {
  const seen = new Set<string>();
  return [first, ...more.split(/\n|;/)].map((x) => x.trim()).filter((x) => x && !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase()));
};

/** The accounts, ready for the iXBRL builder. Check them with checkMicroAccounts and checkSmallDetail first. */
export function smallAccounts(f: SmallAccountsFigures): AccountsInput {
  const base = microAccounts(f);
  const s = f.small, b = f.balanceSheet, pl = f.pl;
  const t = tangibleNote(s, pl.depreciation);
  const ct = r(b.corporationTaxOwed ?? f.currentTax);
  const interestPayable = r(s.interestPayable);
  // Overdrawn loan accounts: directors' go on a line of their own, as the
  // taxonomy and the Act ask; a shareholder who isn't a director is another debtor.
  const owedByParticipators = r(b.owedByParticipators ?? 0);
  const owedByDirectors = Math.min(owedByParticipators, (f.directorsLoans ?? []).reduce((t, l) => t + r(l.closing), 0));
  const block: SmallAccountsBlock = {
    costOfSales: r(pl.costOfSales),
    administrativeExpenses: r(pl.staffCosts + pl.depreciation + pl.otherCharges) - interestPayable,
    otherOperatingIncome: r(pl.otherIncome),
    interestReceivable: r(pl.interestReceived),
    interestPayable,
    currentTax: r(f.currentTax),
    deferredTax: deferredTaxCharge(s),
    staffCosts: r(pl.staffCosts),
    tangibleAssets: t.nbvCf,
    investments: r(s.investments),
    stocks: r(b.stock),
    tradeDebtors: r(s.tradeDebtors),
    owedByDirectors,
    otherDebtors: r(s.otherDebtors) + owedByParticipators - owedByDirectors,
    prepayments: r(b.prepayments),
    cash: r(b.cash),
    bankWithin: r(s.bankWithin),
    tradeCreditors: r(s.tradeCreditors),
    corporationTax: ct,
    otherTaxation: r(s.taxationSocialSecurity),
    owedToDirectors: r(b.owedToDirectors),
    otherCreditorsWithin: r(s.otherCreditorsWithin),
    accrualsWithin: r(s.accrualsWithin),
    bankAfter: r(s.bankAfter),
    otherAfter: r(s.otherAfter),
    deferredTaxBroughtForward: r(s.deferredTaxBroughtForward),
    deferredTaxProvision: r(s.deferredTaxCarriedForward),
    otherProvisions: r(b.provisions) - r(s.deferredTaxCarriedForward),
    shareCapital: r(b.shareCapital),
    sharesNumber: Math.round(s.sharesNumber),
    shareNominal: s.shareNominal,
    dividendsPaid: r(b.dividendsPaid),
    tangible: t,
    depreciationPolicy: s.depreciationPolicy.trim(),
    commitments: s.commitments.trim(),
    directors: names(f.director, s.otherDirectors),
  };
  const prior = f.prior ? syncPriorFromSmall({ ...f.prior.figures, small: f.prior.figures.small ?? priorSmallFromTotals(f.prior.figures) }) : undefined;
  return {
    ...base,
    // Accruals sit inside creditors in these accounts, so there's no line of their own.
    accruals: 0,
    micro: undefined,
    small: block,
    prior,
    accountingStandard: "SmallEntities",
  };
}
