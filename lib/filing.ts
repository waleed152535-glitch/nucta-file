/**
 * One company's return, from its figures to the documents HMRC receive.
 *
 *   scope check → tax computation → accounts → computation document → CT600
 *
 * Each stage refuses rather than guesses: if the company is outside what
 * Nucta File handles, the figures don't add up, or the balance sheet doesn't
 * balance, the result says so in plain words and nothing is built.
 *
 * Accounts longer than 12 months make two returns (see tax/long-period.ts):
 * one set of accounts, attached to both, and a computation and CT600 for
 * each accounting period.
 */

import type { ComputationResult, ReturnFigures } from "./tax/computation";
import { scopeProblems, type ScopeAnswers } from "./tax/scope";
import { checkMicroAccounts, microAccounts, type BalanceSheet } from "./accounts/micro";
import { companiesHouseForm, type CompaniesHouseForm } from "./accounts/ch-form";
import { buildAccounts, buildFullComputation, type PriorYear } from "./ixbrl";
import { buildCt600FromComputation } from "./ct600-return";
import type { LoansResult, ParticipatorAccount } from "./tax/directors-loans";
import { computePeriodOfAccount } from "./tax/long-period";

export interface CompanyReturnInput {
  company: {
    name: string;
    number: string;
    utr: string;
    /** What the company does, for the accounts and as the trade's name in the computation. */
    activity: string;
  };
  /** The figures of the whole period the accounts cover — up to 18 months. */
  figures: ReturnFigures;
  balanceSheet: BalanceSheet;
  prior?: { from: string; to: string; figures: PriorYear };
  /** The director approving the accounts, and the date the board approved them. */
  director: string;
  approvedOn: string;
  declarant: { name: string; status: string };
  scope: Partial<ScopeAnswers>;
  /** Directors' and shareholders' loan accounts; leave empty when there are none. */
  participators?: ParticipatorAccount[];
  /** For accounts longer than 12 months: qualifying donations paid in the first 12 months. */
  donationsInFirstPart?: number;
  /** "amended" replaces a return HMRC already have for the same period. */
  returnType?: "new" | "amended";
  /**
   * Set for a company dormant throughout the period: dormant accounts, and a
   * nil return with no computation ("Company dormant", box 90B).
   */
  dormant?: { everTraded: boolean };
  /** Today's date, for checking repayment dates and deadlines; defaults to the real date. */
  today?: string;
}

/** One Corporation Tax return: one accounting period. */
export interface PreparedPart {
  periodFrom: string;
  periodTo: string;
  days: number;
  figures: ReturnFigures;
  computation: ComputationResult;
  loans: LoansResult | null;
  /** When this period's tax is due. */
  taxDue: string;
  computationHtml: string | null;
  ct600: string | null;
}

export interface PreparedReturn {
  ok: boolean;
  problems: string[];
  warnings: string[];
  /** Whether the accounts cover more than 12 months, so there are two returns. */
  long: boolean;
  returnType: "new" | "amended";
  /** One per return, in date order. Empty when nothing could be computed. */
  parts: PreparedPart[];
  /** The first return's computation, loans and documents — the only ones for a period of 12 months or less. */
  computation: ComputationResult | null;
  loans: LoansResult | null;
  computationHtml: string | null;
  /** The CompanyTaxReturn element, ready for buildEnvelope. */
  ct600: string | null;
  /** The accounts, the same for every return of the period. */
  accountsHtml: string | null;
  /** The same accounts as Companies House's online form asks for them, box by box. */
  companiesHouse: CompaniesHouseForm | null;
  /** Corporation Tax and tax on director's loans for the whole period. */
  corporationTax: number;
  loansTax: number;
  /** When the return (or both returns) must reach HMRC, and the last day to amend. */
  filingDue: string;
  amendBy: string;
}

const longDate = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

export function prepareReturn(i: CompanyReturnInput): PreparedReturn {
  const today = i.today ?? new Date().toISOString().slice(0, 10);
  const returnType = i.returnType ?? "new";
  const base = { long: false, returnType, parts: [] as PreparedPart[], corporationTax: 0, loansTax: 0, filingDue: "", amendBy: "" };
  const nothing = (problems: string[], warnings: string[] = [], extra: Partial<PreparedReturn> = {}): PreparedReturn => ({
    ok: false, problems, warnings, ...base, computation: null, loans: null, computationHtml: null, ct600: null, accountsHtml: null, companiesHouse: null, ...extra,
  });

  const scope = scopeProblems(i.scope);
  if (scope.length) return nothing(scope);
  const poa = computePeriodOfAccount({ figures: i.figures, participators: i.participators, donationsInFirstPart: i.donationsInFirstPart, today: i.today });
  const problems = [...poa.problems];
  if (!/^\d{10}$/.test(i.company.utr.replace(/\s/g, ""))) problems.push("The Unique Taxpayer Reference is 10 digits, from HMRC's letters to the company.");
  if (!i.company.activity.trim()) problems.push("Describe what the company does — it appears in the accounts and names the trade in the computation.");
  if (!i.declarant.name.trim()) problems.push("The return needs the name of the person making the declaration.");
  // HMRC rule 9106: the period can't end after today.
  if (i.figures.periodTo > today) problems.push("This period hasn't ended yet. A return can only be filed once the year is over.");
  // An amendment must reach HMRC within 12 months of the filing date (FA 1998 Sch 18 para 15).
  if (returnType === "amended" && poa.amendBy && today > poa.amendBy) {
    problems.push(`The last day to amend this return was ${longDate(poa.amendBy)} — 12 months after it was due. A change now has to go to HMRC by letter, or as a claim for overpayment relief.`);
  }

  const partsWithoutDocs: PreparedPart[] = poa.parts.map((p) => ({
    periodFrom: p.from, periodTo: p.to, days: p.days, figures: p.figures, computation: p.result, loans: p.loans, taxDue: p.taxDue,
    computationHtml: null, ct600: null,
  }));
  const computed = {
    long: poa.long, parts: partsWithoutDocs, computation: partsWithoutDocs[0]?.computation ?? null, loans: partsWithoutDocs[0]?.loans ?? null,
    corporationTax: poa.corporationTax, loansTax: poa.loansTax, filingDue: poa.filingDue, amendBy: poa.amendBy,
  };
  if (problems.length) return nothing(problems, poa.warnings, computed);

  const warnings = [...poa.warnings];
  const closing = poa.closingLoans;
  const people = (i.participators ?? []).filter((p) => p.name.trim() || p.openingOwed || p.advances || p.repaid);
  const credit = closing?.people.reduce((s, p) => s + p.closingCredit, 0) ?? 0;
  if (credit > i.balanceSheet.owedToDirectors) {
    warnings.push(`The director's loan accounts end £${credit.toLocaleString("en-GB")} in credit — the company owes that to them — but "owed to directors" on the balance sheet is £${i.balanceSheet.owedToDirectors.toLocaleString("en-GB")}. Check it includes them.`);
  }
  // The accounts cover the whole period: their tax charge is both periods'
  // Corporation Tax, and the loans note runs from the first day to the last.
  const accountsFigures = {
    companyName: i.company.name, companyNo: i.company.number, utr: i.company.utr,
    periodFrom: i.figures.periodFrom, periodTo: i.figures.periodTo, principalActivities: i.company.activity,
    pl: i.figures.pl, taxCharge: poa.corporationTax,
    // Overdrawn loan accounts are money owed to the company: current assets.
    balanceSheet: { ...i.balanceSheet, owedByParticipators: closing?.a75 ?? 0 },
    director: i.director, approvedOn: i.approvedOn, prior: i.prior,
    ...(i.dormant ? { dormant: true, everTraded: i.dormant.everTraded } : {}),
    directorsLoans: closing?.people.map((p, n) => ({ p, src: people[n] })).filter(({ p }) => p.isDirector).map(({ p, src }) => ({
      name: p.name, opening: Math.max(0, Math.round(src?.openingOwed ?? p.opening)), advanced: Math.max(0, Math.round(src?.advances ?? p.advanced)),
      repaid: Math.max(0, Math.round(src?.repaid ?? p.repaidInPeriod)), closing: p.closingOwed, terms: src?.terms ?? "",
    })),
  };
  const check = checkMicroAccounts(accountsFigures);
  warnings.push(...check.warnings);
  if (check.problems.length) return nothing(check.problems, warnings, computed);

  const accountsInput = microAccounts(accountsFigures);
  const accountsHtml = buildAccounts(accountsInput);
  const companiesHouse = companiesHouseForm(accountsInput);
  const companyNo = i.company.number.trim().toUpperCase();
  const parts = partsWithoutDocs.map((p, n): PreparedPart => {
    // A dormant company sends no computation: there is nothing to compute.
    const computationHtml = i.dormant ? null : buildFullComputation({
      companyName: i.company.name, companyNo, utr: i.company.utr,
      periodFrom: p.periodFrom, periodTo: p.periodTo, tradeName: i.company.activity,
      periodOfAccount: poa.long ? {
        from: i.figures.periodFrom, to: i.figures.periodTo, profitPerAccounts: partsProfit(i.figures),
        partNumber: n + 1, otherPart: n === 0 ? partsWithoutDocs[1] : partsWithoutDocs[0],
      } : undefined,
    }, p.computation, p.figures, p.loans);
    const ct600 = buildCt600FromComputation({
      companyName: i.company.name, companyNo: i.company.number, utr: i.company.utr,
      periodFrom: p.periodFrom, periodTo: p.periodTo, associatedCompanies: i.figures.associatedCompanies,
      turnover: p.figures.pl.turnover, declarantName: i.declarant.name, declarantStatus: i.declarant.status,
      returnType, accountsForDifferentPeriod: poa.long, multipleReturns: poa.long, dormant: Boolean(i.dormant),
    }, p.computation, { accountsIxbrl: accountsHtml, computationIxbrl: computationHtml }, p.loans);
    return { ...p, computationHtml, ct600 };
  });

  return {
    ok: true, problems: [], warnings, returnType, ...computed, parts,
    computation: parts[0].computation, loans: parts[0].loans, computationHtml: parts[0].computationHtml, ct600: parts[0].ct600, accountsHtml, companiesHouse,
  };
}

/** Profit before tax for the whole period of account, as the accounts show it. */
function partsProfit(f: ReturnFigures): number {
  const pl = f.pl;
  return Math.round(pl.turnover + pl.otherIncome + pl.interestReceived - pl.costOfSales - pl.staffCosts - pl.depreciation - pl.otherCharges);
}
