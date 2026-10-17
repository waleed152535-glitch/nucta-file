/**
 * Micro-entity accounts (FRS 105) from a company's real figures.
 *
 * The profit and loss account comes from the same figures the tax engine
 * uses, and the tax line from the engine's answer, so the accounts and the
 * return can never disagree. The balance sheet is entered from the
 * company's records and must balance against share capital and reserves —
 * nothing is invented to make it.
 */

import type { AccountsInput, PriorYear } from "../ixbrl";
import type { ProfitAndLoss } from "../tax/computation";

export interface BalanceSheet {
  /** Net book value of all fixed assets at the period end. */
  fixedAssets: number;
  stock: number;
  /** Money owed to the company: customers, marketplace balances, VAT refunds. Not loans to directors. */
  debtors: number;
  /** Cash at bank and in hand, including marketplace balances held as cash. */
  cash: number;
  /** Prepayments and accrued income, if not already in debtors. */
  prepayments: number;
  /** Everything owed within a year except Corporation Tax and directors' loans: suppliers, VAT, PAYE, accruals. */
  creditorsWithin: number;
  /** Money the company owes its directors (a director's loan account in credit). */
  owedToDirectors: number;
  /**
   * Corporation Tax owed at the period end. Leave out to use this period's
   * tax from the computation, which is normally still unpaid at the year end.
   */
  corporationTaxOwed?: number;
  /** Loans and other amounts due after more than a year. */
  creditorsAfter: number;
  provisions: number;
  /** Called up share capital (e.g. 100 shares of £1 = 100). */
  shareCapital: number;
  /** Any part of the share capital not yet paid for. */
  shareCapitalNotPaid: number;
  /** Profit and loss reserve at the start of the period: retained profits, or accumulated losses as a negative. */
  reservesBroughtForward: number;
  /** Dividends paid during the period. */
  dividendsPaid: number;
  /** Average number of employees, including directors. */
  employees: number;
}

export interface MicroAccountsFigures {
  companyName: string;
  companyNo: string;
  utr?: string;
  periodFrom: string;
  periodTo: string;
  principalActivities: string;
  pl: ProfitAndLoss;
  /** This period's Corporation Tax, from the computation. */
  taxCharge: number;
  balanceSheet: BalanceSheet;
  director: string;
  approvedOn: string;
  /** Last year's figures and dates, for the comparative column. */
  prior?: { from: string; to: string; figures: PriorYear };
}

const r = (v: number): number => Math.round(v);

export interface MicroAccountsCheck {
  problems: string[];
  warnings: string[];
  profitBeforeTax: number;
  profitAfterTax: number;
  netAssets: number;
  capitalAndReserves: number;
  reservesCarriedForward: number;
}

/** Whether the figures make a set of accounts that adds up. */
export function checkMicroAccounts(f: MicroAccountsFigures): MicroAccountsCheck {
  const problems: string[] = [];
  const warnings: string[] = [];
  const b = f.balanceSheet, pl = f.pl;
  const profitBeforeTax = r(pl.turnover + pl.otherIncome + pl.interestReceived - pl.costOfSales - pl.staffCosts - pl.depreciation - pl.otherCharges);
  const tax = Math.round(f.taxCharge);
  const profitAfterTax = profitBeforeTax - tax;
  const ctOwed = r(b.corporationTaxOwed ?? f.taxCharge);
  const currentAssets = r(b.stock + b.debtors + b.cash);
  const creditorsWithin = r(b.creditorsWithin + b.owedToDirectors + ctOwed);
  const netAssets = r(b.shareCapitalNotPaid + b.fixedAssets + currentAssets + b.prepayments - creditorsWithin - b.creditorsAfter - b.provisions);
  const reservesCarriedForward = r(b.reservesBroughtForward + profitAfterTax - b.dividendsPaid);
  const capitalAndReserves = r(b.shareCapital) + reservesCarriedForward;

  const negative = Object.entries(b).filter(([k, v]) => k !== "reservesBroughtForward" && typeof v === "number" && v < 0).map(([k]) => k);
  if (negative.length) problems.push(`These should be positive amounts: ${negative.join(", ")}.`);
  if (b.shareCapitalNotPaid > b.shareCapital) problems.push("Unpaid share capital can't be more than the share capital itself.");
  if (!(b.shareCapital > 0)) problems.push("A company limited by shares has share capital — enter it (often £1 or £100).");
  if (Math.abs(netAssets - capitalAndReserves) >= 1) {
    const diff = netAssets - capitalAndReserves;
    problems.push(
      `The balance sheet doesn't balance. Net assets come to £${netAssets.toLocaleString("en-GB")}, but share capital and reserves come to £${capitalAndReserves.toLocaleString("en-GB")} — £${Math.abs(diff).toLocaleString("en-GB")} ${diff > 0 ? "more assets than reserves" : "more reserves than assets"}. ` +
      "Check the cash, debtors and creditors at the year end, last year's reserves, and dividends paid.",
    );
  }
  if (b.dividendsPaid > 0 && b.reservesBroughtForward + profitAfterTax < b.dividendsPaid) {
    warnings.push("Dividends paid are more than the profits available to pay them. Dividends can only lawfully be paid from accumulated profits; an accountant should look at this before the accounts are approved.");
  }
  if (!f.director.trim()) problems.push("The accounts need the name of the director approving them.");
  if (!(f.approvedOn > f.periodTo)) problems.push("Accounts are approved after the year end, so the approval date must be later than the period end.");
  if (!(b.employees >= 1) && (pl.staffCosts > 0)) warnings.push("Staff costs are shown but no employees. Directors count as employees here if they're paid.");
  return { problems, warnings, profitBeforeTax, profitAfterTax, netAssets, capitalAndReserves, reservesCarriedForward };
}

/** The accounts, ready for the iXBRL builder. Call checkMicroAccounts first. */
export function microAccounts(f: MicroAccountsFigures): AccountsInput {
  const pl = f.pl, b = f.balanceSheet;
  const c = checkMicroAccounts(f);
  const dormant = [pl.turnover, pl.otherIncome, pl.interestReceived, pl.costOfSales, pl.staffCosts, pl.depreciation, pl.otherCharges].every((v) => !v);
  const otherIncome = r(pl.otherIncome + pl.interestReceived);
  return {
    companyName: f.companyName,
    companyNo: f.companyNo.trim().toUpperCase(),
    utr: (f.utr ?? "").replace(/\D/g, ""),
    periodFrom: f.periodFrom,
    periodTo: f.periodTo,
    priorFrom: f.prior?.from,
    priorTo: f.prior?.to,
    dormant,
    tradingStatus: dormant ? "neverTraded" : "trading",

    // The older layout's fields, kept consistent for anything that reads them.
    turnover: r(pl.turnover),
    costOfSales: r(pl.costOfSales),
    grossProfit: r(pl.turnover - pl.costOfSales),
    adminExpenses: r(pl.otherCharges + pl.depreciation),
    staffCosts: r(pl.staffCosts),
    otherIncome,
    profitBeforeTax: c.profitBeforeTax,
    taxCharge: Math.round(f.taxCharge),
    micro: {
      otherIncome,
      rawMaterials: r(pl.costOfSales),
      staffCosts: r(pl.staffCosts),
      depreciation: r(pl.depreciation),
      otherCharges: r(pl.otherCharges),
    },
    prior: f.prior?.figures,

    shareCapitalNotPaid: r(b.shareCapitalNotPaid),
    fixedAssets: r(b.fixedAssets),
    currentAssets: r(b.stock + b.debtors + b.cash),
    prepayments: r(b.prepayments),
    creditorsWithin: r(b.creditorsWithin + b.owedToDirectors + (b.corporationTaxOwed ?? f.taxCharge)),
    creditorsAfter: r(b.creditorsAfter),
    provisions: r(b.provisions),
    accruals: 0,
    shareCapital: r(b.shareCapital),
    employees: Math.max(0, Math.round(b.employees)),

    approvedBy: f.director,
    approvedOn: f.approvedOn,
    principalActivities: f.principalActivities,
    accountingStandard: "Micro-entities",
    accountsType: "FullAccounts",
    accountsStatus: "AuditExempt-NoAccountantsReport",
    legalForm: "PrivateLimitedCompanyLtd",
  };
}
