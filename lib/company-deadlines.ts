/**
 * A company's coming deadlines, worked out from its public Companies House
 * record alone, for the deadline checker on the website.
 *
 * Companies House give the accounts and confirmation statement dates. The
 * Corporation Tax dates follow from the accounts period: the return is due
 * 12 months after the period of account ends, and the tax nine months and a
 * day after each accounting period ends. HMRC's own records aren't public,
 * so the page can say when a return is due but never whether it was filed.
 */
import type { ChProfile } from "./ch-api";
import { accountingPeriodsOf, filingDeadline, taxDueDate } from "./tax/long-period";
import { addMonths, fromDay, isIsoDate, toDay } from "./tax/dates";

export type PublicDeadlineKind = "ch-accounts" | "ct600" | "ct-payment" | "confirmation";

export interface PublicDeadline {
  kind: PublicDeadlineKind;
  /** What is due, in a few words: "Company Tax Return (CT600)". */
  title: string;
  /** Who it goes to. */
  to: "Companies House" | "HMRC";
  /** The period it covers, when it covers one. */
  period: { from: string | null; to: string } | null;
  date: string;
  /** Whole days from today: negative once the date has passed. */
  days: number;
  /**
   * late: Companies House say it's overdue. passed: the date has gone, and
   * whether it was met isn't public. soon: within 60 days. later: further off.
   */
  state: "late" | "passed" | "soon" | "later";
  note?: string;
}

export interface CompanyPicture {
  deadlines: PublicDeadline[];
  /** The one to show first: the earliest overdue one, or else the next still to come. */
  lead: PublicDeadline | null;
  /** Things to know about the company before reading the dates. */
  notes: string[];
  /** Whether a Company Tax Return applies to this kind of company at all. */
  corporationTax: boolean;
  /** Whether the company is still on the register. */
  active: boolean;
}

/** Types of entity on the register that don't pay Corporation Tax themselves. */
const NOT_CT = /^(llp|limited-partnership|scottish-partnership|converted-or-closed|further-education-or-sixth-form-college-corporation|protected-cell-company|assurance-company|oversea-company|uk-establishment|registered-overseas-entity)$/;

const SOON_DAYS = 60;

const dayAfter = (iso: string) => fromDay(toDay(iso) + 1);

/** The accounting periods inside a period of account, when its start is known. */
function periodsOf(from: string | null, to: string): { from: string | null; to: string }[] {
  if (!from || !isIsoDate(from) || toDay(from) > toDay(to)) return [{ from: null, to }];
  return accountingPeriodsOf(from, to).map((p) => ({ from: p.from, to: p.to }));
}

/**
 * Where the period of account ending `to` began: the day after the previous
 * accounts, or the day the company was formed for its first accounts.
 */
function periodStart(p: ChProfile, to: string, previousTo: string | null): { from: string | null; first: boolean } {
  if (previousTo && isIsoDate(previousTo) && toDay(previousTo) < toDay(to)) return { from: dayAfter(previousTo), first: false };
  // No earlier accounts: these are the first, from incorporation, as long as
  // the dates fit a first period (accounts can't run past 18 months).
  if (p.incorporatedOn && isIsoDate(p.incorporatedOn) && toDay(p.incorporatedOn) <= toDay(to) && toDay(to) < toDay(addMonths(p.incorporatedOn, 18))) {
    return { from: p.incorporatedOn, first: true };
  }
  return { from: null, first: false };
}

export function companyPicture(p: ChProfile, today: string): CompanyPicture {
  const out: PublicDeadline[] = [];
  const notes: string[] = [];
  const active = p.status === "active";
  const corporationTax = !NOT_CT.test(p.type);
  const t = toDay(today);
  const add = (d: Omit<PublicDeadline, "days" | "state">, overdue = false) => {
    if (!isIsoDate(d.date)) return;
    const days = toDay(d.date) - t;
    const state: PublicDeadline["state"] = overdue ? "late" : days < 0 ? "passed" : days <= SOON_DAYS ? "soon" : "later";
    out.push({ ...d, days, state });
  };

  if (!active) {
    notes.push(`Companies House show this company as ${p.status ? p.status.replace(/-/g, " ") : "not active"}, so the usual deadlines may not apply.`);
    return { deadlines: [], lead: null, notes, corporationTax, active };
  }
  if (!corporationTax) notes.push("This kind of entity doesn't file a Company Tax Return of its own: its members are taxed on their shares of the profit.");
  if (p.lastAccountsType === "dormant") notes.push("Its last accounts were dormant accounts. A dormant company only files a Company Tax Return when HMRC send it a notice to deliver one.");

  const next = p.nextAccountsMadeUpTo;
  if (next && p.nextAccountsDue) {
    const start = periodStart(p, next, p.lastAccountsMadeUpTo);
    // Companies House move the due date on once accounts arrive, so a date in the past means they're overdue.
    add({ kind: "ch-accounts", title: "Annual accounts", to: "Companies House", period: { from: start.from, to: next }, date: p.nextAccountsDue }, p.accountsOverdue || toDay(p.nextAccountsDue) < t);
  }

  // The Company Tax Return and the tax, for the accounts Companies House are
  // waiting for and, while it can still be due, the period before.
  const ctFor = (to: string, previousTo: string | null, alreadyAtCh: boolean) => {
    const start = periodStart(p, to, previousTo);
    const parts = periodsOf(start.from, to);
    const filing = filingDeadline(to);
    const split = parts.length > 1;
    const atCh = alreadyAtCh ? " Companies House already have these accounts; HMRC's records aren't public, so check the return was sent." : "";
    parts.forEach((ap, n) => {
      const which = split ? (n === 0 ? " for the first 12 months" : " for the rest of the period") : "";
      if (!alreadyAtCh || toDay(taxDueDate(ap.to)) >= t) {
        add({ kind: "ct-payment", title: `Corporation Tax to pay${which}`, to: "HMRC", period: ap, date: taxDueDate(ap.to),
          note: "Only if there's tax to pay: nine months and a day after the period ends." });
      }
    });
    if (!alreadyAtCh || toDay(filing) >= t) {
      add({ kind: "ct600", title: split ? "Company Tax Returns (CT600), two of them" : "Company Tax Return (CT600)", to: "HMRC", period: { from: start.from, to }, date: filing,
        note: (split ? "The accounts run past 12 months, so HMRC need a return for each part. Both are due on the same day." : "Due 12 months after the period ends, with the accounts and computation attached.") + atCh });
    }
    if (start.first && split) notes.push("The first accounts run for more than 12 months. The tax dates assume the company started trading on the day it was formed; if it started later, its first tax period starts then.");
  };
  if (corporationTax) {
    if (next) ctFor(next, p.lastAccountsMadeUpTo, false);
    if (p.lastAccountsMadeUpTo) ctFor(p.lastAccountsMadeUpTo, null, true);
  }

  if (p.confirmationStatementDue) {
    add({ kind: "confirmation", title: "Confirmation statement", to: "Companies House", period: null, date: p.confirmationStatementDue }, toDay(p.confirmationStatementDue) < t);
  }

  out.sort((a, b) => toDay(a.date) - toDay(b.date) || order(a.kind) - order(b.kind));
  const lead = out.find((d) => d.state === "late") ?? out.find((d) => d.days >= 0) ?? out[0] ?? null;
  return { deadlines: out, lead, notes: [...new Set(notes)], corporationTax, active };
}

const order = (k: PublicDeadlineKind) => ["ch-accounts", "ct-payment", "ct600", "confirmation"].indexOf(k);

/** "in 34 days", "today", "12 days ago". */
export function whenWords(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}

/**
 * A company number as typed, if it looks like one: up to eight digits, or
 * two letters (SC, NI, OC and so on) and six digits.
 */
export function asCompanyNumber(raw: string): string | null {
  const n = raw.replace(/\s/g, "").toUpperCase();
  if (/^\d{1,8}$/.test(n) && n.length >= 6) return n.padStart(8, "0");
  if (/^[A-Z]{2}\d{6}$/.test(n)) return n;
  return null;
}
