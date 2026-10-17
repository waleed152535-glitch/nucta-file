/**
 * One company's return, from its figures to the documents HMRC receive.
 *
 *   scope check → tax computation → accounts → computation document → CT600
 *
 * Each stage refuses rather than guesses: if the company is outside what
 * Nucta File handles, the figures don't add up, or the balance sheet doesn't
 * balance, the result says so in plain words and nothing is built.
 */

import { compute, figureProblems, type ComputationResult, type ReturnFigures } from "./tax/computation";
import { scopeProblems, type ScopeAnswers } from "./tax/scope";
import { checkMicroAccounts, microAccounts, type BalanceSheet } from "./accounts/micro";
import { buildAccounts, buildFullComputation, type PriorYear } from "./ixbrl";
import { buildCt600FromComputation } from "./ct600-return";
import { directorsLoans, type LoansResult, type ParticipatorAccount } from "./tax/directors-loans";

export interface CompanyReturnInput {
  company: {
    name: string;
    number: string;
    utr: string;
    /** What the company does, for the accounts and as the trade's name in the computation. */
    activity: string;
  };
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
  /** Today's date, for checking repayment dates; defaults to the real date. */
  today?: string;
}

export interface PreparedReturn {
  ok: boolean;
  problems: string[];
  warnings: string[];
  computation: ComputationResult | null;
  loans: LoansResult | null;
  accountsHtml: string | null;
  computationHtml: string | null;
  /** The CompanyTaxReturn element, ready for buildEnvelope. */
  ct600: string | null;
}

const nothing = (problems: string[], warnings: string[] = [], computation: ComputationResult | null = null, loans: LoansResult | null = null): PreparedReturn =>
  ({ ok: false, problems, warnings, computation, loans, accountsHtml: null, computationHtml: null, ct600: null });

export function prepareReturn(i: CompanyReturnInput): PreparedReturn {
  const scope = scopeProblems(i.scope);
  if (scope.length) return nothing(scope);
  const problems = figureProblems(i.figures);
  if (!/^\d{10}$/.test(i.company.utr.replace(/\s/g, ""))) problems.push("The Unique Taxpayer Reference is 10 digits, from HMRC's letters to the company.");
  if (!i.company.activity.trim()) problems.push("Describe what the company does — it appears in the accounts and names the trade in the computation.");
  if (!i.declarant.name.trim()) problems.push("The return needs the name of the person making the declaration.");
  // HMRC rule 9106: the period can't end after today.
  if (i.figures.periodTo > (i.today ?? new Date().toISOString().slice(0, 10))) {
    problems.push("This period hasn't ended yet. A return can only be filed once the year is over.");
  }
  if (problems.length) return nothing(problems);

  const computation = compute(i.figures);
  const people = (i.participators ?? []).filter((p) => p.name.trim() || p.openingOwed || p.advances || p.repaid);
  const loans = people.length ? directorsLoans(i.figures.periodFrom, i.figures.periodTo, people, i.today) : null;
  if (loans?.problems.length) return nothing(loans.problems, loans.warnings, computation, loans);
  const warnings = [...(loans?.warnings ?? [])];
  const credit = loans?.people.reduce((s, p) => s + p.closingCredit, 0) ?? 0;
  if (credit > i.balanceSheet.owedToDirectors) {
    warnings.push(`The director's loan accounts end £${credit.toLocaleString("en-GB")} in credit — the company owes that to them — but "owed to directors" on the balance sheet is £${i.balanceSheet.owedToDirectors.toLocaleString("en-GB")}. Check it includes them.`);
  }
  const accountsFigures = {
    companyName: i.company.name, companyNo: i.company.number, utr: i.company.utr,
    periodFrom: i.figures.periodFrom, periodTo: i.figures.periodTo, principalActivities: i.company.activity,
    pl: i.figures.pl, taxCharge: computation.taxChargeable,
    // Overdrawn loan accounts are money owed to the company: current assets.
    balanceSheet: { ...i.balanceSheet, owedByParticipators: loans?.a75 ?? 0 },
    director: i.director, approvedOn: i.approvedOn, prior: i.prior,
    directorsLoans: loans?.people.filter((p) => p.isDirector).map((p) => ({
      name: p.name, opening: p.opening, advanced: p.advanced, repaid: p.repaidInPeriod, closing: p.closingOwed,
      terms: people.find((x) => x.name.trim() === p.name)?.terms ?? "",
    })),
  };
  const check = checkMicroAccounts(accountsFigures);
  warnings.push(...check.warnings);
  if (check.problems.length) return nothing(check.problems, warnings, computation, loans);

  const accountsHtml = buildAccounts(microAccounts(accountsFigures));
  const computationHtml = buildFullComputation({
    companyName: i.company.name, companyNo: i.company.number.trim().toUpperCase(), utr: i.company.utr,
    periodFrom: i.figures.periodFrom, periodTo: i.figures.periodTo, tradeName: i.company.activity,
  }, computation, i.figures, loans);
  const ct600 = buildCt600FromComputation({
    companyName: i.company.name, companyNo: i.company.number, utr: i.company.utr,
    periodFrom: i.figures.periodFrom, periodTo: i.figures.periodTo, associatedCompanies: i.figures.associatedCompanies,
    turnover: i.figures.pl.turnover, declarantName: i.declarant.name, declarantStatus: i.declarant.status,
  }, computation, { accountsIxbrl: accountsHtml, computationIxbrl: computationHtml }, loans);

  return { ok: true, problems: [], warnings, computation, loans, accountsHtml, computationHtml, ct600 };
}
