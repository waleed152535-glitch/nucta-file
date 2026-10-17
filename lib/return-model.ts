/**
 * A saved return: everything entered for one company and one period, held as
 * the `data` document of an nf_returns row. Plain data and pure functions
 * only, so both the server actions and the screens can use it.
 */

import type { Disallowable, ProfitAndLoss, ReturnFigures } from "./tax/computation";
import type { Addition, Disposal } from "./tax/capital-allowances";
import type { ScopeAnswers } from "./tax/scope";
import type { BalanceSheet } from "./accounts/micro";
import type { PriorYear } from "./ixbrl";
import type { CompanyReturnInput } from "./filing";
import type { ParticipatorAccount } from "./tax/directors-loans";

export interface ReturnData {
  activity: string;
  scope: Partial<ScopeAnswers>;
  associatedCompanies: number;
  pl: ProfitAndLoss;
  disallowable: Disallowable;
  profitOnDisposals: number;
  additions: Addition[];
  disposals: Disposal[];
  mainPoolBroughtForward: number;
  specialPoolBroughtForward: number;
  /** Set only when the company shares one AIA with related companies. */
  aiaAvailable: number | null;
  tradingLossesBroughtForward: number;
  qualifyingDonations: number;
  /** Directors' and shareholders' loan accounts. */
  participators: ParticipatorAccount[];
  balanceSheet: BalanceSheet;
  /** Last year's figures; absent for a company's first accounts. */
  prior: { from: string; to: string; figures: PriorYear } | null;
  director: string;
  approvedOn: string;
  declarantName: string;
  declarantStatus: string;
  /** Which values were filled in from last year's return, so the screen can say so. */
  carriedFrom?: string | null;
}

export const blankPL = (): ProfitAndLoss => ({
  turnover: 0, otherIncome: 0, interestReceived: 0, costOfSales: 0, staffCosts: 0, depreciation: 0, otherCharges: 0,
});

export const blankDisallowable = (): Disallowable => ({
  entertainment: 0, finesAndPenalties: 0, charitableDonations: 0, politicalDonations: 0,
  privateExpenses: 0, capitalItemsExpensed: 0, lossOnDisposals: 0, other: 0,
});

export const blankBalanceSheet = (): BalanceSheet => ({
  fixedAssets: 0, stock: 0, debtors: 0, cash: 0, prepayments: 0, creditorsWithin: 0, owedToDirectors: 0,
  creditorsAfter: 0, provisions: 0, shareCapital: 100, shareCapitalNotPaid: 0, reservesBroughtForward: 0,
  dividendsPaid: 0, employees: 1,
});

export function blankReturnData(): ReturnData {
  return {
    activity: "", scope: {}, associatedCompanies: 0,
    pl: blankPL(), disallowable: blankDisallowable(), profitOnDisposals: 0,
    additions: [], disposals: [], mainPoolBroughtForward: 0, specialPoolBroughtForward: 0, aiaAvailable: null,
    tradingLossesBroughtForward: 0, qualifyingDonations: 0, participators: [],
    balanceSheet: blankBalanceSheet(), prior: null,
    director: "", approvedOn: "", declarantName: "", declarantStatus: "Director",
  };
}

/** Fills any missing parts of a saved document, so older drafts still open. */
export function normaliseReturnData(d: Partial<ReturnData> | null | undefined): ReturnData {
  const b = blankReturnData();
  if (!d) return b;
  return {
    ...b, ...d,
    pl: { ...b.pl, ...(d.pl ?? {}) },
    disallowable: { ...b.disallowable, ...(d.disallowable ?? {}) },
    balanceSheet: { ...b.balanceSheet, ...(d.balanceSheet ?? {}) },
    scope: { ...(d.scope ?? {}) },
    additions: d.additions ?? [],
    disposals: d.disposals ?? [],
    participators: d.participators ?? [],
  };
}

export function toFigures(periodFrom: string, periodTo: string, d: ReturnData): ReturnFigures {
  return {
    periodFrom, periodTo, associatedCompanies: d.associatedCompanies,
    pl: d.pl, disallowable: d.disallowable, profitOnDisposals: d.profitOnDisposals,
    capitalAllowances: {
      additions: d.additions, disposals: d.disposals,
      mainPoolBroughtForward: d.mainPoolBroughtForward, specialPoolBroughtForward: d.specialPoolBroughtForward,
      ...(d.aiaAvailable !== null && d.aiaAvailable !== undefined ? { aiaAvailable: d.aiaAvailable } : {}),
    },
    tradingLossesBroughtForward: d.tradingLossesBroughtForward,
    qualifyingDonations: d.qualifyingDonations,
  };
}

export function toCompanyReturnInput(
  company: { name: string; companyNo: string | null; utr: string | null },
  periodFrom: string, periodTo: string, d: ReturnData,
): CompanyReturnInput {
  return {
    company: { name: company.name, number: company.companyNo ?? "", utr: company.utr ?? "", activity: d.activity },
    figures: toFigures(periodFrom, periodTo, d),
    balanceSheet: d.balanceSheet,
    prior: d.prior ?? undefined,
    director: d.director,
    approvedOn: d.approvedOn,
    declarant: { name: d.declarantName, status: d.declarantStatus },
    scope: d.scope,
    participators: d.participators,
  };
}
