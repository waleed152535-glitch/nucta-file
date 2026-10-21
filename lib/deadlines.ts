/**
 * Every client's next deadlines, for the dashboard.
 *
 *   Company Tax Return    12 months after the end of the period the accounts
 *                         cover, when that is 18 months or less
 *                         (FA 1998 Sch 18 para 14)
 *   Corporation Tax       9 months and a day after the end of each accounting
 *                         period, for a company that isn't large
 *   Accounts to Companies House
 *                         9 months after the period end for a private
 *                         company; for first accounts longer than 12 months,
 *                         21 months from incorporation or 3 months after the
 *                         period end, whichever is later (Companies Act 2006
 *                         s442). Companies House's own date is used when it
 *                         is known, as it allows for any changes to the year end.
 *
 * A company's first accounts run from incorporation to the last day of the
 * month of its first anniversary (Companies Act 2006 s391(4)); later ones for
 * twelve months at a time. Periods with no return in Nucta File yet are shown
 * as "not started", so nothing is missed.
 */

import { addMonths, addYear, fromDay, isIsoDate, toDay } from "./tax/dates";
import { accountingPeriodsOf, filingDeadline, taxDueDate } from "./tax/long-period";

export interface DeadlineCompany {
  id: string;
  name: string;
  companyNo: string | null;
  incorporatedOn: string | null;
  /** From Companies House, when the company was looked up there. */
  ch?: { nextAccountsMadeUpTo?: string | null; nextAccountsDue?: string | null; lastAccountsMadeUpTo?: string | null } | null;
}

export interface DeadlineReturn {
  id: string;
  companyId: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  amendment: boolean;
  /** Corporation Tax and s455 for each accounting period, when the figures can be worked out. */
  taxByPart?: { to: string; tax: number }[];
}

export type DeadlineKind = "ct600" | "ct-payment" | "ch-accounts" | "not-started";

export interface Deadline {
  companyId: string;
  companyName: string;
  /** The return this belongs to, or null for a period with no return yet. */
  returnId: string | null;
  kind: DeadlineKind;
  label: string;
  periodFrom: string;
  periodTo: string;
  due: string;
  daysLeft: number;
  state: "overdue" | "soon" | "later";
  amount?: number;
  /** Worked out by Nucta File rather than taken from Companies House. */
  estimated?: boolean;
}

const lastDayOfMonth = (iso: string) => {
  const [y, m] = iso.split("-").map(Number);
  return `${y}-${String(m).padStart(2, "0")}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
};
const isMonthEnd = (iso: string) => lastDayOfMonth(iso) === iso;

/** Months after a date, keeping a month end a month end (30 June + 9 months = 31 March). */
export const monthsAfter = (iso: string, months: number): string => {
  const d = addMonths(iso, months);
  return isMonthEnd(iso) ? lastDayOfMonth(d) : d;
};

/** The end of a company's first accounts: the last day of the month of its first anniversary. */
export const firstPeriodEnd = (incorporatedOn: string): string => lastDayOfMonth(addYear(incorporatedOn));

/** When accounts are due at Companies House, for a private company. */
export function accountsDue(periodFrom: string, periodTo: string, incorporatedOn: string | null): string {
  const first = Boolean(incorporatedOn) && periodFrom === incorporatedOn;
  const longFirst = first && toDay(periodTo) > toDay(addYear(periodFrom)) - 1;
  if (longFirst) {
    const a = addMonths(incorporatedOn!, 21), b = monthsAfter(periodTo, 3);
    return a > b ? a : b;
  }
  return monthsAfter(periodTo, 9);
}

const filed = (status: string) => status === "accepted";

export function deadlinesFor(companies: DeadlineCompany[], returns: DeadlineReturn[], today: string, horizonDays = 550): Deadline[] {
  const out: Deadline[] = [];
  const t = toDay(today);
  const push = (c: DeadlineCompany, d: Omit<Deadline, "companyId" | "companyName" | "daysLeft" | "state">) => {
    const daysLeft = toDay(d.due) - t;
    if (daysLeft > horizonDays) return;
    out.push({ ...d, companyId: c.id, companyName: c.name, daysLeft, state: daysLeft < 0 ? "overdue" : daysLeft <= 30 ? "soon" : "later" });
  };
  const chItem = (c: DeadlineCompany, from: string, to: string, returnId: string | null) => {
    const ch = c.ch;
    if (ch?.nextAccountsMadeUpTo && isIsoDate(ch.nextAccountsMadeUpTo)) {
      // Companies House already have accounts for this period.
      if (to < ch.nextAccountsMadeUpTo) return;
      if (to === ch.nextAccountsMadeUpTo && ch.nextAccountsDue) {
        push(c, { returnId, kind: "ch-accounts", label: "Accounts to Companies House", periodFrom: from, periodTo: to, due: ch.nextAccountsDue });
        return;
      }
    }
    push(c, { returnId, kind: "ch-accounts", label: "Accounts to Companies House", periodFrom: from, periodTo: to, due: accountsDue(from, to, c.incorporatedOn), estimated: true });
  };

  for (const c of companies) {
    // One row per period: the original return, whose status says whether it was filed.
    const mine = returns.filter((r) => r.companyId === c.id && !r.amendment).sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
    for (const r of mine) {
      if (!filed(r.status)) {
        push(c, { returnId: r.id, kind: "ct600", label: accountingPeriodsOf(r.periodStart, r.periodEnd).length > 1 ? "Company Tax Returns (two)" : "Company Tax Return", periodFrom: r.periodStart, periodTo: r.periodEnd, due: filingDeadline(r.periodEnd) });
      }
      for (const p of accountingPeriodsOf(r.periodStart, r.periodEnd)) {
        const tax = r.taxByPart?.find((x) => x.to === p.to)?.tax;
        const due = taxDueDate(p.to);
        // Whether a filed return's tax was paid isn't known here, so it is shown only until it falls due.
        if (tax !== undefined && tax <= 0) continue;
        if (filed(r.status) && toDay(due) < t) continue;
        push(c, { returnId: r.id, kind: "ct-payment", label: "Corporation Tax to pay", periodFrom: p.from, periodTo: p.to, due, ...(tax !== undefined ? { amount: tax } : {}) });
      }
      chItem(c, r.periodStart, r.periodEnd, r.id);
    }

    // Periods after the last return (or from incorporation) with no return yet.
    let from: string | null = null, to: string | null = null;
    const last = mine[mine.length - 1];
    if (last) { from = fromDay(toDay(last.periodEnd) + 1); to = fromDay(toDay(addYear(from)) - 1); }
    else if (c.ch?.nextAccountsMadeUpTo && isIsoDate(c.ch.nextAccountsMadeUpTo)) {
      // Companies House know which accounts come next: from the day after the last ones they have.
      to = c.ch.nextAccountsMadeUpTo;
      from = c.ch.lastAccountsMadeUpTo && isIsoDate(c.ch.lastAccountsMadeUpTo) ? fromDay(toDay(c.ch.lastAccountsMadeUpTo) + 1) : c.incorporatedOn;
    } else if (c.incorporatedOn && isIsoDate(c.incorporatedOn)) {
      from = c.incorporatedOn; to = firstPeriodEnd(c.incorporatedOn);
    }
    for (let k = 0; from && to && k < 3; k++) {
      if (toDay(from) > t) break;
      push(c, { returnId: null, kind: "not-started", label: toDay(to) < t ? "Return not started" : "Year in progress", periodFrom: from, periodTo: to, due: filingDeadline(to) });
      if (toDay(to) < t) chItem(c, from, to, null);
      if (toDay(to) >= t) break;
      from = fromDay(toDay(to) + 1); to = fromDay(toDay(addYear(from)) - 1);
    }
  }
  return out.sort((a, b) => a.due.localeCompare(b.due) || a.companyName.localeCompare(b.companyName));
}
