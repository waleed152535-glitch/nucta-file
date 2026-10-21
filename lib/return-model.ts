/**
 * A saved return: everything entered for one company and one period, held as
 * the `data` document of an nf_returns row. Plain data and pure functions
 * only, so both the server actions and the screens can use it.
 */

import type { Disallowable, ProfitAndLoss, ReturnFigures } from "./tax/computation";
import type { Addition, Disposal } from "./tax/capital-allowances";
import { SCOPE_QUESTIONS, type ScopeAnswers } from "./tax/scope";
import type { BalanceSheet } from "./accounts/micro";
import type { PriorYear } from "./ixbrl";
import type { CompanyReturnInput } from "./filing";
import type { ParticipatorAccount } from "./tax/directors-loans";
import type { PeriodOfAccountInput } from "./tax/long-period";

export interface ReturnData {
  activity: string;
  /**
   * Dormant for the whole period: no income, no spending, no transactions
   * (Companies House fees paid by a director don't count). The figures steps
   * are skipped; the accounts are dormant accounts and the return a nil one.
   */
  dormant: boolean;
  /** For a dormant company: whether it has ever traded, for the accounts' trading status. */
  everTraded: boolean;
  /**
   * For a dormant company: whether HMRC have sent a notice to deliver a
   * Company Tax Return. Without one, HMRC don't expect a return.
   */
  ctNoticeReceived: boolean | null;
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
  /** For accounts longer than 12 months: qualifying donations paid in the first 12 months. */
  donationsInFirstPart: number;
  /** Set on an amended return: the return it replaces. */
  amends?: AmendsLink | null;
  /**
   * What happened to each return when sent, by its number (0, or 0 and 1 for
   * accounts longer than 12 months). Kept by the server; cleared when the
   * figures change.
   */
  sent?: Record<string, SentRecord>;
  /** When a live filing of each return started, while it is under way. Kept by the server. */
  filing?: Record<string, string>;
  /** The last "Test in Live" check of each return. Kept by the server. */
  til?: Record<string, { outcome: string; at: string; correlationId: string | null }>;
}

export interface AmendsLink {
  returnId: string;
  /** HMRC's correlation IDs of the returns being replaced. */
  correlationIds: string[];
  /** When the return being replaced was accepted. */
  acceptedAt: string | null;
  /** Whether the original was only accepted by HMRC's test service. */
  test: boolean;
}

export interface SentRecord {
  outcome: string;
  /** accepted-test, rejected-test, submitted-test; or, filed for real, accepted or submitted-live. */
  status: string;
  correlationId: string | null;
  irmark: string | null;
  at: string;
  periodFrom: string;
  periodTo: string;
  /** For a live filing: HMRC's receipt, in words. The full signed receipt is kept with the submission. */
  receiptText?: string | null;
  /** For a live filing: the Government Gateway user ID it was filed with, mostly hidden. */
  filedBy?: string;
}

/** Keys the server keeps for itself; what the screen sends back for them is ignored. */
export const SERVER_KEYS = ["sent", "amends", "filing", "til"] as const;

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
    activity: "", dormant: false, everTraded: false, ctNoticeReceived: null, scope: {}, associatedCompanies: 0,
    pl: blankPL(), disallowable: blankDisallowable(), profitOnDisposals: 0,
    additions: [], disposals: [], mainPoolBroughtForward: 0, specialPoolBroughtForward: 0, aiaAvailable: null,
    tradingLossesBroughtForward: 0, qualifyingDonations: 0, participators: [],
    balanceSheet: blankBalanceSheet(), prior: null,
    director: "", approvedOn: "", declarantName: "", declarantStatus: "Director",
    donationsInFirstPart: 0,
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

/**
 * What the tax engine sees. A dormant company has nothing in its profit and
 * loss account and no trade to claim allowances for, so whatever was typed in
 * those steps before it was marked dormant is left out; losses brought
 * forward stay as they are, to carry on to the next year.
 */
export function toFigures(periodFrom: string, periodTo: string, d: ReturnData): ReturnFigures {
  if (d.dormant) {
    return {
      periodFrom, periodTo, associatedCompanies: d.associatedCompanies,
      pl: blankPL(), disallowable: blankDisallowable(), profitOnDisposals: 0,
      capitalAllowances: { additions: [], disposals: [], mainPoolBroughtForward: 0, specialPoolBroughtForward: 0 },
      tradingLossesBroughtForward: d.tradingLossesBroughtForward, qualifyingDonations: 0,
    };
  }
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

/** The tax for the whole period, worked out the same way on the screen and on the server. */
export function toPeriodOfAccountInput(periodFrom: string, periodTo: string, d: ReturnData, today?: string): PeriodOfAccountInput {
  return {
    figures: toFigures(periodFrom, periodTo, d), participators: d.dormant ? [] : d.participators,
    donationsInFirstPart: d.dormant ? 0 : d.donationsInFirstPart, ...(today ? { today } : {}),
  };
}

/** A dormant company's balance sheet holds only what a dormant company can have. */
export function dormantBalanceSheet(b: BalanceSheet): BalanceSheet {
  return { ...b, fixedAssets: 0, stock: 0, prepayments: 0, creditorsAfter: 0, provisions: 0, dividendsPaid: 0 };
}

/** Every scope question answered the way that keeps a company in scope: a dormant company has no trade, gains or income to ask about. */
export const dormantScope = (): Partial<ScopeAnswers> =>
  Object.fromEntries(SCOPE_QUESTIONS.map((q) => [q.key, q.expect])) as Partial<ScopeAnswers>;

export function toCompanyReturnInput(
  company: { name: string; companyNo: string | null; utr: string | null },
  periodFrom: string, periodTo: string, d: ReturnData,
): CompanyReturnInput {
  return {
    company: { name: company.name, number: company.companyNo ?? "", utr: company.utr ?? "", activity: d.activity.trim() || (d.dormant ? "Dormant company" : "") },
    figures: toFigures(periodFrom, periodTo, d),
    balanceSheet: d.dormant ? dormantBalanceSheet(d.balanceSheet) : d.balanceSheet,
    prior: d.prior ?? undefined,
    director: d.director,
    approvedOn: d.approvedOn,
    declarant: { name: d.declarantName, status: d.declarantStatus },
    scope: d.dormant ? dormantScope() : d.scope,
    participators: d.dormant ? [] : d.participators,
    donationsInFirstPart: d.dormant ? 0 : d.donationsInFirstPart,
    returnType: d.amends ? "amended" : "new",
    ...(d.dormant ? { dormant: { everTraded: d.everTraded } } : {}),
  };
}
