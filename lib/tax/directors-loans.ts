/**
 * Loans to participators (directors, shareholders and their families) by a
 * close company: the s455 charge and the CT600A supplementary page.
 *
 * Sources:
 *   HMRC, Supplementary pages CT600A guidance — what each box holds; A10 is
 *     "after deducting any credit balance brought forward" and "must exclude
 *     any credit entries that represent repayment … of loans made in earlier
 *     return periods", so repayments clear the oldest borrowing first.
 *   HMRC CT600 v1-994 business rules — SA012 to SA078 (the box arithmetic),
 *     SA018 (Part 2 dates), F093/F097/SA078.1 (box 480 and 510).
 *   Rate: 33.75% for loans from 6 April 2022, 35.75% for loans on or after
 *     6 April 2026. HMRC's systems accept only 33.75% until 6 April 2027;
 *     returns filed before then report 33.75% and are amended afterwards
 *     (ATT; Ross Martin Tax Consultancy, April 2026). HMRC's own rule SA014
 *     checks box A20 against 33.75% for any period from 6 April 2022.
 *
 * Not handled, and refused by the scope questions: arrangements conferring
 * benefits (s464A), "bed and breakfasting" (s464C), and relief for loans of
 * earlier periods (claimed on those periods' returns or with HMRC's tool).
 */

import { fromDay, isIsoDate, toDay } from "./dates";

/** The rate HMRC's systems accept now for a period starting on or after 6 April 2022. */
export const S455_RATE_FILED = 0.3375;
/** The rate the law charges on loans made on or after 6 April 2026. */
export const S455_RATE_FROM_2026 = 0.3575;
export const S455_HIGHER_RATE_FROM = "2026-04-06";
/** When HMRC expect to accept the higher rate. */
export const S455_SYSTEMS_UPDATED = "2027-04-06";
/** An interest-free loan above this at any time in the tax year is a benefit in kind for an employee or director. */
export const BENEFIT_IN_KIND_THRESHOLD = 10_000;

export interface LaterRepayment {
  amount: number;
  /** When it was repaid, released or written off — after the period end. */
  date: string;
  how: "repaid" | "released";
  /**
   * Set by the long-period split: a repayment made in the next Corporation
   * Tax period of the same accounts, counted here for Part 2 relief.
   */
  inNextPeriod?: boolean;
}

/**
 * For accounts longer than 12 months: the part of the period's lending and
 * repayments that fell in the first 12 months. The rest fell in the second
 * Corporation Tax period.
 */
export interface FirstPartLoans {
  advances: number;
  repaid: number;
  /** Of `advances`, made on or after 6 April 2026 — asked only when the first 12 months include that date. */
  advancesFrom6April2026: number;
  /** The date of the last repayment after the first 12 months, when there were any. */
  lastRepaidDate: string;
}

export interface ParticipatorAccount {
  name: string;
  isDirector: boolean;
  /** Owed to the company at the start of the period, from earlier periods. */
  openingOwed: number;
  /** If instead the company owed them money at the start (account in credit). */
  openingCredit: number;
  /** Lent to them, or paid on their behalf, during the period. */
  advances: number;
  /** The part of `advances` made on or after 6 April 2026, when the period includes that date. */
  advancesFrom6April2026: number;
  /** Repaid during the period — in cash, or by salary, dividends or expenses credited to their account. */
  repaid: number;
  /** Repaid, released or written off after the period end, before the return is filed. */
  later: LaterRepayment[];
  /** Whether interest is charged on the loan at the official rate or more. */
  interestCharged: boolean;
  /** The loan's terms, for the accounts note. */
  terms: string;
  /** Only for accounts longer than 12 months: the first 12 months' share. */
  firstPart?: FirstPartLoans;
  /**
   * Set by the long-period split: repayments in this period already given
   * relief on the previous period's return, so no reclaim is suggested.
   */
  reliefAlreadyGiven?: number;
  /**
   * Set by the long-period split: repayments after the year end that went
   * against the first period's loans on that period's own return.
   */
  laterUsedByEarlierPeriod?: number;
}

export interface ParticipatorResult {
  name: string;
  isDirector: boolean;
  opening: number;
  advanced: number;
  repaidInPeriod: number;
  /** This period's loans still outstanding at the end (their row in A10). */
  newOutstanding: number;
  /** Earlier periods' loans still outstanding at the end. */
  oldOutstanding: number;
  /** Owed to the company at the end, from all periods (part of A75). */
  closingOwed: number;
  /** Owed by the company to them at the end, when their account ends in credit. */
  closingCredit: number;
  /** Rows for Part 2 (A25). */
  relief: LaterRepayment[];
  /** Later repayments that go against earlier periods' loans instead. */
  appliedToEarlierLoans: number;
  /** This period's loans still outstanding after Part 2 relief. */
  taxable: number;
  taxableAtHigherRate: number;
}

export interface LoansResult {
  /** Whether a CT600A is needed at all. */
  needed: boolean;
  people: ParticipatorResult[];
  /** A5: loans were made in the period and all were cleared before it ended. */
  allClearedBeforeEnd: boolean;
  a15: number;
  /** A20: tax at the rate HMRC accept now. */
  a20: number;
  a30: number;
  a35: number;
  a40: number;
  a45: number;
  a75: number;
  /** A80 = A20 − A45 (never below nil); also CT600 box 480. */
  a80: number;
  /** What the law charges once loans from 6 April 2026 are taxed at 35.75%. */
  legalTax: number;
  /** The extra to add by amending the return after HMRC's systems change. */
  amendmentDue: number;
  /** When the s455 tax is due (9 months and a day after the period end). */
  dueDate: string;
  problems: string[];
  warnings: string[];
}

const pounds = (v: number) => Math.max(0, Math.round(v || 0));
/** £1,234.50, and 1 January 2026, for the messages. */
const money = (v: number) => `£${v.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const longDate = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
/** Tax in pounds and pence on a whole-pound amount, rounded half up (rules SA014, SA043). */
const taxAt = (amount: number, rate: number): number => Math.round(amount * rate * 100) / 100;

/** The last day of the month a date falls in. */
const monthEnd = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

/** A date plus some months, clamped to the end of the month (31 May + 9 months = 28/29 February). */
function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const total = (m - 1) + months;
  const ny = y + Math.floor(total / 12), nm = ((total % 12) + 12) % 12;
  const day = Math.min(d, monthEnd(ny, nm));
  return `${ny}-${String(nm + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * The first day on which a repayment no longer counts for Part 2 relief.
 * Rule SA018.0: "[A25D] must be before nine months and one day after [35].
 * If [35] is on the last day of the month, [A25D] must be before the first
 * day of the month ten months after [35]."
 */
export function reliefWindowEnds(periodTo: string): string {
  const [y, m, d] = periodTo.split("-").map(Number);
  if (d === monthEnd(y, m - 1)) return addMonths(`${y}-${String(m).padStart(2, "0")}-01`, 10);
  return fromDay(toDay(addMonths(periodTo, 9)) + 1);
}

export function directorsLoans(periodFrom: string, periodTo: string, people: ParticipatorAccount[], today = new Date().toISOString().slice(0, 10)): LoansResult {
  const problems: string[] = [];
  const warnings: string[] = [];
  const windowEnds = reliefWindowEnds(periodTo);
  const straddlesHigherRate = periodTo >= S455_HIGHER_RATE_FROM;
  // A period that starts on or after 6 April 2026 has every loan at the higher rate.
  const whollyAtHigherRate = periodFrom >= S455_HIGHER_RATE_FROM;

  const results: ParticipatorResult[] = people.map((p) => {
    const opening = pounds(p.openingOwed), credit = pounds(p.openingCredit), advanced = pounds(p.advances);
    const repaid = pounds(p.repaid);
    if (!p.name.trim() || p.name.trim().length < 2) problems.push("Each person with a director's loan needs their name.");
    if (p.name.trim().length > 56) problems.push(`"${p.name.slice(0, 20)}…": HMRC allow at most 56 characters for a name.`);
    if (opening > 0 && credit > 0) problems.push(`${p.name}: an account can't both owe the company and be owed by it at the start — enter one or the other.`);

    // An opening credit balance is used up by the first new advances.
    const netNew = Math.max(0, advanced - credit);
    const creditLeft = Math.max(0, credit - advanced);
    // Repayments clear the oldest borrowing first.
    const repaidOld = Math.min(opening, repaid);
    const repaidNew = Math.min(netNew, repaid - repaidOld);
    const overpaid = repaid - repaidOld - repaidNew;
    const newOutstanding = netNew - repaidNew;
    const oldOutstanding = opening - repaidOld;

    // Repayments after the period end: Part 2 relief against this period's loans, within the window.
    const relief: LaterRepayment[] = [];
    let reliefLeft = newOutstanding, appliedToEarlier = 0;
    for (const r of p.later) {
      const amount = pounds(r.amount);
      if (!amount) continue;
      if (!isIsoDate(r.date)) { problems.push(`${p.name}: a later repayment needs its date.`); continue; }
      if (r.date <= periodTo) { problems.push(`${p.name}: a repayment dated ${r.date} falls within the period — include it in "repaid during the period" instead.`); continue; }
      if (r.date > today) { problems.push(`${p.name}: a repayment dated ${r.date} is in the future. Since April 2025 HMRC won't accept a future repayment date — file after it's made, or claim the relief later.`); continue; }
      if (r.date >= windowEnds) {
        warnings.push(`${p.name}: the repayment on ${r.date} is more than 9 months after the year end, so it doesn't reduce this return's tax. Relief is claimed later, from 9 months after the end of the period it was repaid in — HMRC's loans-to-participators tool or a claim covers it.`);
        continue;
      }
      const used = Math.min(amount, reliefLeft);
      if (used > 0) relief.push({ amount: used, date: r.date, how: r.how, ...(r.inNextPeriod ? { inNextPeriod: true } : {}) });
      reliefLeft -= used;
      // A repayment in the next period that this period's loans don't need
      // is that period's business, not a relief for earlier years.
      if (!r.inNextPeriod) appliedToEarlier += amount - used;
    }
    const taxable = reliefLeft;
    // The higher rate falls on the latest advances, which are the last to be repaid.
    const higher = whollyAtHigherRate ? taxable : straddlesHigherRate ? Math.min(taxable, pounds(p.advancesFrom6April2026)) : 0;
    if (pounds(p.advancesFrom6April2026) > advanced) problems.push(`${p.name}: lending from 6 April 2026 can't be more than the total lent in the period.`);
    const leftForEarlier = appliedToEarlier - Math.min(appliedToEarlier, pounds(p.laterUsedByEarlierPeriod ?? 0));
    if (leftForEarlier > 0) {
      warnings.push(`${p.name}: £${leftForEarlier.toLocaleString("en-GB")} repaid after the year end goes against loans from earlier years. Relief for it belongs to those years' returns, not this one.`);
    }
    const reclaimable = repaidOld - Math.min(repaidOld, pounds(p.reliefAlreadyGiven ?? 0));
    if (reclaimable > 0) {
      warnings.push(`${p.name}: £${reclaimable.toLocaleString("en-GB")} of an earlier year's loan was repaid this year. The tax paid on it for that year can be reclaimed — on that year's return if repaid within 9 months of its year end, otherwise with HMRC's loans-to-participators tool.`);
    }
    const peak = Math.max(opening + advanced, opening + netNew);
    if (!p.interestCharged && peak > BENEFIT_IN_KIND_THRESHOLD && p.isDirector) {
      warnings.push(`${p.name}: an interest-free loan above £10,000 at any time in the tax year is a taxable benefit for a director. It's reported on form P11D and the company pays Class 1A National Insurance — outside this return.`);
    }
    if (p.later.some((r) => r.how === "released")) {
      warnings.push(`${p.name}: a loan released or written off is taxed on them as income, and the company can't deduct it. Make sure it isn't included in the expenses.`);
    }
    return {
      name: p.name.trim(), isDirector: p.isDirector, opening, advanced, repaidInPeriod: repaid,
      newOutstanding, oldOutstanding, closingOwed: newOutstanding + oldOutstanding, closingCredit: creditLeft + overpaid,
      relief, appliedToEarlierLoans: appliedToEarlier, taxable, taxableAtHigherRate: higher,
    };
  });

  const a15 = results.reduce((s, r) => s + r.newOutstanding, 0);
  const a20 = taxAt(a15, S455_RATE_FILED);
  const a30 = results.reduce((s, r) => s + r.relief.filter((x) => x.how === "repaid").reduce((t, x) => t + x.amount, 0), 0);
  const a35 = results.reduce((s, r) => s + r.relief.filter((x) => x.how === "released").reduce((t, x) => t + x.amount, 0), 0);
  const a40 = a30 + a35;
  const a45 = Math.min(taxAt(a40, S455_RATE_FILED), a20);
  const a75 = results.reduce((s, r) => s + r.closingOwed, 0);
  const a80 = Math.max(0, Math.round((a20 - a45) * 100) / 100);

  const higher = results.reduce((s, r) => s + r.taxableAtHigherRate, 0);
  const taxableTotal = results.reduce((s, r) => s + r.taxable, 0);
  const legalTax = taxAt(taxableTotal - higher, S455_RATE_FILED) + taxAt(higher, S455_RATE_FROM_2026);
  const amendmentDue = Math.max(0, Math.round((legalTax - a80) * 100) / 100);
  if (amendmentDue > 0) {
    warnings.push(
      `£${higher.toLocaleString("en-GB")} of the loans was made on or after 6 April 2026, when the rate rose to 35.75%. HMRC's systems take only 33.75% until 6 April 2027, ` +
      `so this return reports 33.75% as HMRC instruct. After 6 April 2027 the return must be amended to add ${money(amendmentDue)}.`,
    );
  }
  const needed = results.some((r) => r.opening > 0 || r.advanced > 0 || r.closingOwed > 0);
  // The tax falls due on the day the relief window closes: nine months and a
  // day on, month-end to month-end (a 30 June year end is due 1 April).
  const dueDate = windowEnds;
  if (a80 > 0) warnings.push(`Tax of ${money(a80)} on director's loans is due by ${longDate(dueDate)}, with the Corporation Tax. It is repaid to the company once the loan is repaid.`);

  return {
    needed, people: results,
    allClearedBeforeEnd: results.some((r) => r.advanced > 0) && a15 === 0,
    a15, a20, a30, a35, a40, a45, a75, a80, legalTax, amendmentDue, dueDate, problems, warnings,
  };
}
