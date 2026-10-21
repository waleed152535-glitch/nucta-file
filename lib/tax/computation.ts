/**
 * The Corporation Tax computation: from a micro-entity company's profit and
 * loss account to the tax it owes.
 *
 *   profit before tax per the accounts
 *   − interest received (taxed separately, as non-trading income)
 *   + expenses tax doesn't allow (depreciation, entertaining, fines …)
 *   − profit on selling fixed assets (capital allowances deal with sales)
 *   = adjusted trading profit
 *   − capital allowances + balancing charges
 *   = trading profit (box 155) or trading loss (box 780)
 *   − trading losses brought forward (box 160)
 *   + interest received (box 170)
 *   − qualifying charitable donations (box 305)
 *   = profits chargeable to Corporation Tax (box 315)
 *   × 19% / 25%, less marginal relief between the limits
 *
 * What it handles is deliberately narrow, and `scopeProblems` refuses the
 * rest rather than guessing: a UK company with one trade, a period of up to
 * twelve months starting on or after 1 April 2023, and none of the reliefs
 * or regimes listed there.
 */

import {
  daysInclusive, exceedsEighteenMonths, exceedsTwelveMonths, financialYearOf, isIsoDate, splitByFinancialYear, toDay, yearFraction,
} from "./dates";
import { capitalAllowances, type CapitalAllowanceInput, type CapitalAllowanceResult } from "./capital-allowances";
import { CT_FROM_FY2023, LAST_CHECKED_FY } from "./rules";

export interface ProfitAndLoss {
  /** Sales, net of VAT and returns. */
  turnover: number;
  /** Other trading income (e.g. marketplace reimbursements, grants). Not interest. */
  otherIncome: number;
  /** Interest received from a bank or on loans. Taxed as non-trading income. */
  interestReceived: number;
  /** Cost of raw materials and consumables: stock bought and sold. */
  costOfSales: number;
  /** Salaries including directors', employer's National Insurance, pension contributions. */
  staffCosts: number;
  /** Depreciation and other amounts written off fixed assets. */
  depreciation: number;
  /** Every other expense. */
  otherCharges: number;
}

/**
 * Amounts already counted in the expenses above that tax doesn't allow. Each
 * is added back. All are positive numbers.
 */
export interface Disallowable {
  /** Entertaining clients or suppliers (staff entertaining is allowed). */
  entertainment: number;
  /** Fines and penalties, including HMRC penalties and parking fines. */
  finesAndPenalties: number;
  /** Donations to charity included in expenses. Relieved separately as qualifying charitable donations. */
  charitableDonations: number;
  /** Donations to political parties. Never relieved. */
  politicalDonations: number;
  /** Personal spending of directors or shareholders paid by the company and charged as an expense. */
  privateExpenses: number;
  /** Equipment and other assets charged as expenses in the accounts. Enter them as additions too, for capital allowances. */
  capitalItemsExpensed: number;
  /** Losses on selling fixed assets, included in expenses. */
  lossOnDisposals: number;
  /** Anything else tax doesn't allow. */
  other: number;
}

export interface ReturnFigures {
  periodFrom: string;
  periodTo: string;
  /** Associated companies (not counting this one). Divides the £50,000 and £250,000 limits. */
  associatedCompanies: number;
  pl: ProfitAndLoss;
  disallowable: Disallowable;
  /** Profits on selling fixed assets, included in other income. Deducted. */
  profitOnDisposals: number;
  capitalAllowances: Omit<CapitalAllowanceInput, "periodFrom" | "periodTo">;
  /** Trading losses carried forward from earlier periods, still unused. */
  tradingLossesBroughtForward: number;
  /** Qualifying charitable donations paid in the period (to UK charities). Usually the same as charitableDonations. */
  qualifyingDonations: number;
}

export interface ComputationLine {
  label: string;
  amount: number;
  /** "+" adds to the running figure, "−" takes away, "=" is a subtotal. */
  kind: "+" | "-" | "=";
  note?: string;
}

export interface FinancialYearTax {
  fy: number;
  from: string;
  to: string;
  days: number;
  /** Profits chargeable apportioned to this financial year. */
  profits: number;
  lowerLimit: number;
  upperLimit: number;
  /** "small", "marginal" or "main". */
  band: "small" | "marginal" | "main";
  /** Tax at the main rate, or the small profits rate when that applies (box 430 part). */
  grossTax: number;
  marginalRelief: number;
  tax: number;
}

export interface ComputationResult {
  accountingProfit: number;
  adjustedTradingProfit: number;
  capitalAllowances: CapitalAllowanceResult;
  /** Trading profit after allowances; zero when there is a loss. Box 155. */
  tradingProfit: number;
  /** Trading loss of the period; zero when there is a profit. Box 780. */
  tradingLoss: number;
  /** Losses brought forward used against this period's trading profit. Box 160. */
  lossesUsed: number;
  /** Box 165. */
  netTradingProfit: number;
  /** Box 170. */
  nonTradingInterest: number;
  /** Box 235: profits before other deductions and reliefs. */
  profitsBeforeDeductions: number;
  /** Box 305, capped at the profits available. */
  qualifyingDonations: number;
  /** Box 315. */
  chargeableProfits: number;
  years: FinancialYearTax[];
  /** Box 430: tax before marginal relief. */
  corporationTax: number;
  /** Box 435. */
  marginalRelief: number;
  /** Box 440 = 430 − 435; also box 475 and 510 for a company with nothing else to add. */
  taxChargeable: number;
  /** The rate the return names: 19 when every part is in the small band, otherwise 25. */
  rate: 19 | 25;
  /** Whether a lower rate or marginal relief is claimed (box 329 territory). */
  smallProfitsRateOrMarginalRelief: boolean;
  /** To carry to next year's return. */
  carryForward: { tradingLosses: number; mainPool: number; specialPool: number };
  lines: ComputationLine[];
}

const sum = (o: object): number => Object.values(o).reduce((s: number, v) => s + (Number(v) || 0), 0);
const pounds = (v: number): number => Math.round(v);
const pence = (v: number): number => Math.round(v * 100) / 100;

/**
 * What the figures fail, in plain words. An empty list means the engine can
 * compute this return. Run before `compute`.
 */
export function figureProblems(f: ReturnFigures, opts: { periodOfAccount?: boolean } = {}): string[] {
  const out: string[] = [];
  if (!isIsoDate(f.periodFrom) || !isIsoDate(f.periodTo)) return ["Both period dates are needed."];
  if (toDay(f.periodTo) < toDay(f.periodFrom)) out.push("The period must end after it starts.");
  // The figures of a whole period of account may run up to 18 months: they
  // are split into two Corporation Tax periods before any tax is worked out
  // (see long-period.ts). A single Corporation Tax period can't pass 12.
  const long = exceedsTwelveMonths(f.periodFrom, f.periodTo);
  if (long && !opts.periodOfAccount) {
    out.push("A Corporation Tax period can't be longer than 12 months. Accounts for a longer period need two returns: the first 12 months, then the rest.");
  }
  if (long && opts.periodOfAccount && exceedsEighteenMonths(f.periodFrom, f.periodTo)) {
    out.push("Accounts can't cover more than 18 months, so these dates look wrong. Check the start date and the accounts year end.");
  }
  if (toDay(f.periodFrom) < toDay(`${CT_FROM_FY2023.firstYear}-04-01`)) {
    out.push("Periods starting before 1 April 2023 used different tax rules and aren't supported.");
  }
  if (financialYearOf(f.periodTo) > LAST_CHECKED_FY) {
    out.push(`The tax rates for the year from 1 April ${LAST_CHECKED_FY + 1} haven't been checked into Nucta File yet, so this period can't be computed.`);
  }
  if (!Number.isInteger(f.associatedCompanies) || f.associatedCompanies < 0) out.push("Associated companies must be a whole number, 0 or more.");
  const negatives = [
    ...Object.entries(f.pl).filter(([, v]) => v < 0).map(([k]) => k),
    ...Object.entries(f.disallowable).filter(([, v]) => v < 0).map(([k]) => k),
  ];
  if (negatives.length) out.push(`These should be entered as positive amounts: ${negatives.join(", ")}.`);
  if (f.disallowable.charitableDonations + f.disallowable.politicalDonations + sum({
    e: f.disallowable.entertainment, fp: f.disallowable.finesAndPenalties, p: f.disallowable.privateExpenses,
    c: f.disallowable.capitalItemsExpensed, l: f.disallowable.lossOnDisposals, o: f.disallowable.other,
  }) > f.pl.costOfSales + f.pl.staffCosts + f.pl.otherCharges + f.pl.depreciation) {
    out.push("The expenses tax doesn't allow come to more than the expenses in the accounts. They should be part of them.");
  }
  if (f.profitOnDisposals > f.pl.otherIncome) out.push("Profit on selling fixed assets should be included in other income, so it can't be more than other income.");
  if (f.qualifyingDonations < 0 || f.tradingLossesBroughtForward < 0) out.push("Donations and losses brought forward can't be negative.");
  for (const a of f.capitalAllowances.additions) {
    if (!isIsoDate(a.date) || toDay(a.date) < toDay(f.periodFrom) || toDay(a.date) > toDay(f.periodTo)) {
      out.push(`"${a.description}" must be dated within the period to be claimed this year.`);
    }
    if (!(a.cost > 0)) out.push(`"${a.description}" needs its cost.`);
  }
  for (const x of f.capitalAllowances.disposals) {
    const name = x.description.trim() || "An item sold";
    if (x.date && (!isIsoDate(x.date) || toDay(x.date) < toDay(f.periodFrom) || toDay(x.date) > toDay(f.periodTo))) {
      out.push(`"${name}" must be dated within the period, as it was sold this year.`);
    } else if (!x.date && long && opts.periodOfAccount) {
      out.push(`"${name}": the accounts cover more than 12 months, so give the date it was sold — it decides which of the two returns it belongs to.`);
    }
  }
  return out;
}

/** Tax for the profits falling in one financial year (FY2023 onwards). */
function taxForYear(part: { fy: number; from: string; to: string; days: number }, profits: number, limitFraction: number, divisor: number): FinancialYearTax {
  const r = CT_FROM_FY2023;
  const lowerLimit = (r.lowerLimit * limitFraction) / divisor;
  const upperLimit = (r.upperLimit * limitFraction) / divisor;
  let band: FinancialYearTax["band"], grossTax: number, marginalRelief = 0;
  // Tax is worked in whole pence from whole-pound profits and whole-number
  // rates, so it equals HMRC's check exactly (rule F035: [345] = [335] ×
  // [340] ÷ 100, rounded half up), with no floating-point drift.
  const at = (pct: number) => Math.round(profits * pct) / 100;
  if (profits <= lowerLimit) {
    band = "small";
    grossTax = at(Math.round(r.smallRate * 100));
  } else if (profits < upperLimit) {
    band = "marginal";
    grossTax = at(Math.round(r.mainRate * 100));
    // (F × (U − A)) × (N ÷ A); with no exempt distributions A = N (CTM03925).
    marginalRelief = r.marginalFraction * (upperLimit - profits);
  } else {
    band = "main";
    grossTax = at(Math.round(r.mainRate * 100));
  }
  return {
    ...part, profits, lowerLimit, upperLimit, band,
    grossTax: pence(grossTax), marginalRelief: pence(marginalRelief), tax: pence(grossTax) - pence(marginalRelief),
  };
}

export function compute(f: ReturnFigures): ComputationResult {
  const pl = f.pl, d = f.disallowable;
  const lines: ComputationLine[] = [];

  const accountingProfit = pounds(pl.turnover + pl.otherIncome + pl.interestReceived - pl.costOfSales - pl.staffCosts - pl.depreciation - pl.otherCharges);
  lines.push({ label: "Profit before tax per the accounts", amount: accountingProfit, kind: "=" });
  if (pl.interestReceived) lines.push({ label: "Interest received, taxed separately below", amount: pl.interestReceived, kind: "-" });

  const addBacks: [string, number][] = [
    ["Depreciation", pl.depreciation],
    ["Entertaining", d.entertainment],
    ["Fines and penalties", d.finesAndPenalties],
    ["Charitable donations (relieved below)", d.charitableDonations],
    ["Political donations", d.politicalDonations],
    ["Private expenses", d.privateExpenses],
    ["Equipment charged as an expense (claimed as capital allowances)", d.capitalItemsExpensed],
    ["Loss on selling fixed assets", d.lossOnDisposals],
    ["Other expenses not allowed", d.other],
  ];
  for (const [label, amount] of addBacks) if (amount) lines.push({ label: `Add back: ${label}`, amount: pounds(amount), kind: "+" });
  if (f.profitOnDisposals) lines.push({ label: "Profit on selling fixed assets", amount: pounds(f.profitOnDisposals), kind: "-" });

  const adjustedTradingProfit = pounds(accountingProfit - pl.interestReceived + addBacks.reduce((s, [, a]) => s + pounds(a), 0) - f.profitOnDisposals);
  lines.push({ label: "Adjusted trading profit", amount: adjustedTradingProfit, kind: "=" });

  const ca = capitalAllowances({ periodFrom: f.periodFrom, periodTo: f.periodTo, ...f.capitalAllowances });
  if (ca.totalAllowances) lines.push({ label: "Capital allowances", amount: ca.totalAllowances, kind: "-", note: ca.notes.join(" ") || undefined });
  if (ca.totalCharges) lines.push({ label: "Balancing charges", amount: ca.totalCharges, kind: "+" });

  const afterAllowances = adjustedTradingProfit - ca.totalAllowances + ca.totalCharges;
  const tradingProfit = Math.max(0, afterAllowances);
  const tradingLoss = Math.max(0, -afterAllowances);
  lines.push({ label: tradingLoss ? "Trading loss" : "Trading profit", amount: tradingLoss || tradingProfit, kind: "=" });

  const lossesUsed = Math.min(pounds(f.tradingLossesBroughtForward), tradingProfit);
  if (lossesUsed) lines.push({ label: "Trading losses brought forward", amount: lossesUsed, kind: "-" });
  const netTradingProfit = tradingProfit - lossesUsed;

  const nonTradingInterest = pounds(pl.interestReceived);
  if (nonTradingInterest) lines.push({ label: "Interest received (non-trading)", amount: nonTradingInterest, kind: "+" });
  const profitsBeforeDeductions = netTradingProfit + nonTradingInterest;
  if (nonTradingInterest || lossesUsed) lines.push({ label: "Total profits", amount: profitsBeforeDeductions, kind: "=" });

  const qualifyingDonations = Math.min(pounds(f.qualifyingDonations), profitsBeforeDeductions);
  if (qualifyingDonations) lines.push({ label: "Qualifying charitable donations", amount: qualifyingDonations, kind: "-" });
  const chargeableProfits = profitsBeforeDeductions - qualifyingDonations;
  lines.push({ label: "Profits chargeable to Corporation Tax", amount: chargeableProfits, kind: "=" });

  // Limits: £50,000 and £250,000, reduced for a short period and divided by
  // the company plus its associates. A period straddling 1 April is split
  // into the financial years it falls in, profits and limits apportioned by
  // days (the ATT's 275/365 × £50,000 example).
  const parts = splitByFinancialYear(f.periodFrom, f.periodTo);
  const totalDays = daysInclusive(f.periodFrom, f.periodTo);
  const frac = yearFraction(f.periodFrom, f.periodTo);
  const divisor = f.associatedCompanies + 1;
  let allocated = 0;
  const years = parts.map((p, i) => {
    const share = i === parts.length - 1 ? chargeableProfits - allocated : Math.round((chargeableProfits * p.days) / totalDays);
    allocated += share;
    return taxForYear(p, share, (frac * p.days) / totalDays, divisor);
  });

  const corporationTax = pence(years.reduce((s, y) => s + y.grossTax, 0));
  const marginalRelief = pence(years.reduce((s, y) => s + y.marginalRelief, 0));
  const taxChargeable = pence(corporationTax - marginalRelief);
  const allSmall = years.every((y) => y.band === "small");
  for (const y of years) {
    const what = y.band === "small" ? "19%" : y.band === "main" ? "25%" : "25% less marginal relief";
    lines.push({
      label: `Corporation Tax, year from 1 April ${y.fy}${years.length > 1 ? ` (${y.days} days)` : ""}: ${what}`,
      amount: y.tax,
      kind: "=",
      note: y.band === "marginal" ? `Marginal relief £${y.marginalRelief.toFixed(2)}: 3/200 × (£${Math.round(y.upperLimit).toLocaleString("en-GB")} − £${y.profits.toLocaleString("en-GB")}).` : undefined,
    });
  }

  return {
    accountingProfit,
    adjustedTradingProfit,
    capitalAllowances: ca,
    tradingProfit,
    tradingLoss,
    lossesUsed,
    netTradingProfit,
    nonTradingInterest,
    profitsBeforeDeductions,
    qualifyingDonations,
    chargeableProfits,
    years,
    corporationTax,
    marginalRelief,
    taxChargeable,
    // Nil profits fall in the small band too, so a dormant or loss-making
    // company is reported at 19% with nothing to pay.
    rate: allSmall ? 19 : 25,
    smallProfitsRateOrMarginalRelief: chargeableProfits > 0 && years.some((y) => y.band !== "main"),
    carryForward: {
      tradingLosses: pounds(f.tradingLossesBroughtForward) - lossesUsed + tradingLoss,
      mainPool: ca.main.carriedForward,
      specialPool: ca.special.carriedForward,
    },
    lines,
  };
}
