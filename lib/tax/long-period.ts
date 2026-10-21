/**
 * Accounts that cover more than twelve months.
 *
 * A Corporation Tax accounting period ends twelve months after it begins
 * (CTA 2009 s10(1)(a)), so accounts made up for, say, thirteen months — a
 * company's first accounts, or a year end moved later — cover two
 * accounting periods: the first twelve months, then the rest. Each needs its
 * own return. Nucta File takes the accounts' figures once and splits them:
 *
 *   Trading profit: the profit of the period of account is apportioned by
 *     days (CTA 2009 s52, CTA 2010 s1172). Each line of the accounts and each
 *     adjustment is apportioned the same way, so the two computations add up
 *     to the accounts, line by line.
 *   Interest received: apportioned by days with the rest.
 *   Capital allowances: worked out for each accounting period on its own,
 *     by the date of each purchase and sale (CAA 2001 s6). The second, short
 *     period gets a reduced Annual Investment Allowance and writing down
 *     allowance, and starts from the first period's pool values.
 *   Losses brought forward are used in the first period first; what's left,
 *     and any loss of the first period, carries into the second.
 *   Qualifying charitable donations: in the period they were paid
 *     (CTA 2010 s189).
 *   Tax: each period has its own limits for the small profits rate and
 *     marginal relief, reduced for the short period.
 *   Director's loans: the s455 charge arises for each accounting period
 *     separately. Repayments in the second period, all within nine months of
 *     the first period's end, give relief against the first period's loans.
 *
 * Both returns are due 12 months after the end of the period of account when
 * it is 18 months or less (FA 1998 Sch 18 para 14(1)(b)); the tax for each is
 * due 9 months and a day after the end of its own accounting period.
 */

import { addMonths, addYear, daysInclusive, exceedsTwelveMonths, fromDay, isIsoDate, toDay } from "./dates";
import { compute, figureProblems, type ComputationResult, type ReturnFigures } from "./computation";
import { directorsLoans, reliefWindowEnds, S455_HIGHER_RATE_FROM, type LaterRepayment, type LoansResult, type ParticipatorAccount } from "./directors-loans";

export interface AccountingPeriod { from: string; to: string; days: number }

/** The Corporation Tax accounting periods within a period of account: one, or two when it passes 12 months. */
export function accountingPeriodsOf(from: string, to: string): AccountingPeriod[] {
  if (!isIsoDate(from) || !isIsoDate(to) || !exceedsTwelveMonths(from, to)) {
    return [{ from, to, days: isIsoDate(from) && isIsoDate(to) ? daysInclusive(from, to) : 0 }];
  }
  const firstEnd = fromDay(toDay(addYear(from)) - 1);
  const secondStart = fromDay(toDay(firstEnd) + 1);
  return [
    { from, to: firstEnd, days: daysInclusive(from, firstEnd) },
    { from: secondStart, to, days: daysInclusive(secondStart, to) },
  ];
}

/**
 * The filing date of the return(s) for a period of account of up to 18
 * months: 12 months after it ends (FA 1998 Sch 18 para 14).
 */
export const filingDeadline = (periodOfAccountTo: string): string => addMonths(periodOfAccountTo, 12);

/** The last day an amendment can be made: 12 months after the filing date (FA 1998 Sch 18 para 15). */
export const amendmentDeadline = (periodOfAccountTo: string): string => addMonths(filingDeadline(periodOfAccountTo), 12);

/**
 * When Corporation Tax for an accounting period is due, for a company that
 * isn't large: 9 months and a day after it ends, month end to month end.
 */
export const taxDueDate = (periodTo: string): string => reliefWindowEnds(periodTo);

/** A whole-pound share of an amount by days; the rest, to the penny, is the other share, so the two add up exactly. */
function split(v: number, days: number, total: number): [number, number] {
  const a = Math.round(((Number(v) || 0) * days) / total);
  return [a, Math.round(((Number(v) || 0) - a) * 100) / 100];
}

function splitEach<T extends object>(o: T, days: number, total: number): [T, T] {
  const a = {} as Record<string, number>, b = {} as Record<string, number>;
  for (const [k, v] of Object.entries(o)) [a[k], b[k]] = split(v as number, days, total);
  return [a as T, b as T];
}

export interface PeriodOfAccountExtras {
  /** For accounts longer than 12 months: qualifying donations paid in the first 12 months. */
  donationsInFirstPart?: number;
}

export interface PeriodPart extends AccountingPeriod {
  /** The figures of this accounting period alone — what its computation and return report. */
  figures: ReturnFigures;
  result: ComputationResult;
  loans: LoansResult | null;
  /** When this period's tax is due. */
  taxDue: string;
}

export interface PeriodOfAccountResult {
  /** Whether the accounts cover more than 12 months, and so need two returns. */
  long: boolean;
  problems: string[];
  warnings: string[];
  /** One per return; empty when the figures can't be computed. */
  parts: PeriodPart[];
  /** Corporation Tax for the whole period of account — the tax charge in the accounts. */
  corporationTax: number;
  /** Tax on director's loans for the whole period of account. */
  loansTax: number;
  /** The director's loan position at the end of the accounts (the last part's). */
  closingLoans: LoansResult | null;
  filingDue: string;
  amendBy: string;
}

/**
 * Splits the period of account's figures into its accounting periods. The
 * second period's pools and losses brought forward are left at nil here and
 * filled in from the first period's result.
 */
export function splitFigures(f: ReturnFigures, x: PeriodOfAccountExtras = {}): ReturnFigures[] {
  const ap = accountingPeriodsOf(f.periodFrom, f.periodTo);
  if (ap.length === 1) return [f];
  const [one, two] = ap;
  const total = one.days + two.days;
  const [pl1, pl2] = splitEach(f.pl, one.days, total);
  const [d1, d2] = splitEach(f.disallowable, one.days, total);
  const [pod1, pod2] = split(f.profitOnDisposals, one.days, total);
  const inFirst = (date: string | undefined) => !date || toDay(date) <= toDay(one.to);
  const ca = f.capitalAllowances;
  const donations1 = Math.min(Math.max(0, x.donationsInFirstPart ?? 0), f.qualifyingDonations);
  return [
    {
      ...f, periodFrom: one.from, periodTo: one.to, pl: pl1, disallowable: d1, profitOnDisposals: pod1,
      capitalAllowances: { ...ca, additions: ca.additions.filter((a) => inFirst(a.date)), disposals: ca.disposals.filter((d) => inFirst(d.date)) },
      qualifyingDonations: donations1,
    },
    {
      ...f, periodFrom: two.from, periodTo: two.to, pl: pl2, disallowable: d2, profitOnDisposals: pod2,
      capitalAllowances: {
        ...ca, additions: ca.additions.filter((a) => !inFirst(a.date)), disposals: ca.disposals.filter((d) => !inFirst(d.date)),
        mainPoolBroughtForward: 0, specialPoolBroughtForward: 0,
        // A shared allowance is given as the first 12 months'; the short period gets its share by days.
        ...(ca.aiaAvailable !== undefined ? { aiaAvailable: Math.floor((ca.aiaAvailable * two.days) / 365) } : {}),
      },
      tradingLossesBroughtForward: 0,
      qualifyingDonations: Math.round((f.qualifyingDonations - donations1) * 100) / 100,
    },
  ];
}

const longDate = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
const straddles = (p: AccountingPeriod) => p.from < S455_HIGHER_RATE_FROM && p.to >= S455_HIGHER_RATE_FROM;
const whole = (v: number) => Math.max(0, Math.round(v || 0));

/**
 * Director's loans for each accounting period. For a single period this is
 * just `directorsLoans`; for two, the first 12 months' lending and
 * repayments come from each person's `firstPart`, and the rest fall in the
 * second period.
 */
export function loansForPeriods(periods: AccountingPeriod[], people: ParticipatorAccount[], today?: string): { results: (LoansResult | null)[]; problems: string[] } {
  if (!people.length) return { results: periods.map(() => null), problems: [] };
  if (periods.length === 1) {
    const r = directorsLoans(periods[0].from, periods[0].to, people, today);
    return { results: [r], problems: r.problems };
  }
  const [one, two] = periods;
  const problems: string[] = [];
  const firsts = people.map((p) => {
    const name = p.name.trim() || "Each person";
    const fp = p.firstPart ?? { advances: 0, repaid: 0, advancesFrom6April2026: 0, lastRepaidDate: "" };
    if (!p.firstPart && (whole(p.advances) || whole(p.repaid))) {
      problems.push(`${name}: the accounts cover more than 12 months, so say how much was lent and repaid in the first 12 months, to ${longDate(one.to)}.`);
    }
    if (whole(fp.advances) > whole(p.advances)) problems.push(`${name}: the amount lent in the first 12 months can't be more than the amount lent in the whole period.`);
    if (whole(fp.repaid) > whole(p.repaid)) problems.push(`${name}: the amount repaid in the first 12 months can't be more than the amount repaid in the whole period.`);
    const repaidLater = Math.max(0, whole(p.repaid) - whole(fp.repaid));
    const dateOk = isIsoDate(fp.lastRepaidDate) && fp.lastRepaidDate >= two.from && fp.lastRepaidDate <= two.to;
    if (repaidLater > 0 && !dateOk) {
      problems.push(`${name}: £${repaidLater.toLocaleString("en-GB")} was repaid after the first 12 months — give the date of the last of those repayments, between ${longDate(two.from)} and ${longDate(two.to)}.`);
    }
    return { fp, repaidLater, dateOk };
  });
  if (problems.length) return { results: [null, null], problems };

  const firstPeriod = (extra: LaterRepayment[][]) => directorsLoans(one.from, one.to, people.map((p, n): ParticipatorAccount => {
    const { fp, repaidLater } = firsts[n];
    return {
      ...p, advances: whole(fp.advances), repaid: whole(fp.repaid),
      advancesFrom6April2026: straddles(one) ? whole(fp.advancesFrom6April2026) : 0,
      // Repayments in the second period are within nine months of the first
      // period's end, so they count for its Part 2 relief.
      later: [
        ...(repaidLater > 0 ? [{ amount: repaidLater, date: fp.lastRepaidDate, how: "repaid" as const, inNextPeriod: true }] : []),
        ...extra[n],
      ],
    };
  }), today);
  const secondPeriod = (r1: LoansResult, usedByFirst: number[]) => directorsLoans(two.from, two.to, people.map((p, n): ParticipatorAccount => {
    const { fp, repaidLater } = firsts[n];
    const res = r1.people[n];
    return {
      ...p, openingOwed: res.closingOwed, openingCredit: res.closingCredit,
      advances: Math.max(0, whole(p.advances) - whole(fp.advances)), repaid: repaidLater,
      advancesFrom6April2026: straddles(two) ? whole(p.advancesFrom6April2026) : 0,
      reliefAlreadyGiven: res.relief.filter((x) => x.inNextPeriod).reduce((s, x) => s + x.amount, 0),
      laterUsedByEarlierPeriod: usedByFirst[n],
      firstPart: undefined,
    };
  }), today);

  let r1 = firstPeriod(people.map(() => []));
  if (r1.problems.length) return { results: [r1, null], problems: r1.problems };
  let r2 = secondPeriod(r1, people.map(() => 0));
  if (r2.problems.length) return { results: [r1, r2], problems: r2.problems };

  // Repayments after the accounts' end go first against the second period's
  // own loans. Whatever those don't need clears the first period's loans —
  // and when it was made within nine months of the first period's end, it
  // reduces the first period's tax too, on its own return.
  const firstWindowEnds = reliefWindowEnds(one.to), secondWindowEnds = reliefWindowEnds(two.to);
  const extra: LaterRepayment[][] = people.map((p, n) => {
    let need = r2.people[n].newOutstanding;
    const rows: LaterRepayment[] = [];
    for (const r of p.later) {
      const amount = whole(r.amount);
      if (!amount || !isIsoDate(r.date) || r.date <= two.to || r.date >= secondWindowEnds) continue;
      const used = Math.min(amount, need); need -= used;
      if (amount > used && r.date < firstWindowEnds) rows.push({ amount: amount - used, date: r.date, how: r.how });
    }
    return rows;
  });
  if (extra.some((rows) => rows.length)) {
    r1 = firstPeriod(extra);
    const usedByFirst = people.map((_, n) => r1.people[n].relief.filter((x) => !x.inNextPeriod).reduce((s, x) => s + x.amount, 0));
    r2 = secondPeriod(r1, usedByFirst);
  }
  return { results: [r1, r2], problems: [...r1.problems, ...r2.problems] };
}

export interface PeriodOfAccountInput extends PeriodOfAccountExtras {
  /** The figures of the whole period of account, as in the accounts. */
  figures: ReturnFigures;
  participators?: ParticipatorAccount[];
  today?: string;
}

/** The tax for a whole period of account: one accounting period, or two. */
export function computePeriodOfAccount(i: PeriodOfAccountInput): PeriodOfAccountResult {
  const f = i.figures;
  const periods = accountingPeriodsOf(f.periodFrom, f.periodTo);
  const long = periods.length > 1;
  const empty = (problems: string[]): PeriodOfAccountResult => ({
    long, problems, warnings: [], parts: [], corporationTax: 0, loansTax: 0, closingLoans: null,
    filingDue: isIsoDate(f.periodTo) ? filingDeadline(f.periodTo) : "", amendBy: isIsoDate(f.periodTo) ? amendmentDeadline(f.periodTo) : "",
  });
  const problems = figureProblems(f, { periodOfAccount: true });
  if (long && (i.donationsInFirstPart ?? 0) > f.qualifyingDonations) {
    problems.push("The donations paid in the first 12 months can't be more than the donations for the whole period.");
  }
  if (problems.length) return empty(problems);

  const split = splitFigures(f, i);
  const figures: ReturnFigures[] = [];
  const results: ComputationResult[] = [];
  split.forEach((part, n) => {
    const prev = results[n - 1];
    const pf: ReturnFigures = prev ? {
      ...part,
      capitalAllowances: { ...part.capitalAllowances, mainPoolBroughtForward: prev.carryForward.mainPool, specialPoolBroughtForward: prev.carryForward.specialPool },
      tradingLossesBroughtForward: prev.carryForward.tradingLosses,
    } : part;
    figures.push(pf);
    results.push(compute(pf));
  });

  const people = (i.participators ?? []).filter((p) => p.name.trim() || p.openingOwed || p.advances || p.repaid);
  const loans = loansForPeriods(periods, people, i.today);
  const warnings: string[] = [];
  for (const l of loans.results) for (const w of l?.warnings ?? []) if (!warnings.includes(w)) warnings.push(w);
  if (long && results[1].tradingLoss > 0 && results[0].chargeableProfits > 0) {
    warnings.push(`The second period made a trading loss of £${results[1].tradingLoss.toLocaleString("en-GB")}. It is carried forward. It could instead be set against the first period's profits by a claim (section 37), which Nucta File doesn't make — ask if that would help.`);
  }
  const pence = (v: number) => Math.round(v * 100) / 100;
  const parts: PeriodPart[] = periods.map((p, n) => ({ ...p, figures: figures[n], result: results[n], loans: loans.results[n], taxDue: taxDueDate(p.to) }));
  return {
    long, problems: loans.problems, warnings, parts,
    corporationTax: pence(results.reduce((s, r) => s + r.taxChargeable, 0)),
    loansTax: pence(loans.results.reduce((s, l) => s + (l?.a80 ?? 0), 0)),
    closingLoans: loans.results[loans.results.length - 1] ?? null,
    filingDue: filingDeadline(f.periodTo), amendBy: amendmentDeadline(f.periodTo),
  };
}
