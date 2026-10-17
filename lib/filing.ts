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
}

export interface PreparedReturn {
  ok: boolean;
  problems: string[];
  warnings: string[];
  computation: ComputationResult | null;
  accountsHtml: string | null;
  computationHtml: string | null;
  /** The CompanyTaxReturn element, ready for buildEnvelope. */
  ct600: string | null;
}

const nothing = (problems: string[], warnings: string[] = [], computation: ComputationResult | null = null): PreparedReturn =>
  ({ ok: false, problems, warnings, computation, accountsHtml: null, computationHtml: null, ct600: null });

export function prepareReturn(i: CompanyReturnInput): PreparedReturn {
  const scope = scopeProblems(i.scope);
  if (scope.length) return nothing(scope);
  const problems = figureProblems(i.figures);
  if (!/^\d{10}$/.test(i.company.utr.replace(/\s/g, ""))) problems.push("The Unique Taxpayer Reference is 10 digits, from HMRC's letters to the company.");
  if (!i.company.activity.trim()) problems.push("Describe what the company does — it appears in the accounts and names the trade in the computation.");
  if (!i.declarant.name.trim()) problems.push("The return needs the name of the person making the declaration.");
  if (problems.length) return nothing(problems);

  const computation = compute(i.figures);
  const accountsFigures = {
    companyName: i.company.name, companyNo: i.company.number, utr: i.company.utr,
    periodFrom: i.figures.periodFrom, periodTo: i.figures.periodTo, principalActivities: i.company.activity,
    pl: i.figures.pl, taxCharge: computation.taxChargeable, balanceSheet: i.balanceSheet,
    director: i.director, approvedOn: i.approvedOn, prior: i.prior,
  };
  const check = checkMicroAccounts(accountsFigures);
  if (check.problems.length) return nothing(check.problems, check.warnings, computation);

  const accountsHtml = buildAccounts(microAccounts(accountsFigures));
  const computationHtml = buildFullComputation({
    companyName: i.company.name, companyNo: i.company.number.trim().toUpperCase(), utr: i.company.utr,
    periodFrom: i.figures.periodFrom, periodTo: i.figures.periodTo, tradeName: i.company.activity,
  }, computation, i.figures);
  const ct600 = buildCt600FromComputation({
    companyName: i.company.name, companyNo: i.company.number, utr: i.company.utr,
    periodFrom: i.figures.periodFrom, periodTo: i.figures.periodTo, associatedCompanies: i.figures.associatedCompanies,
    turnover: i.figures.pl.turnover, declarantName: i.declarant.name, declarantStatus: i.declarant.status,
  }, computation, { accountsIxbrl: accountsHtml, computationIxbrl: computationHtml });

  return { ok: true, problems: [], warnings: check.warnings, computation, accountsHtml, computationHtml, ct600 };
}
