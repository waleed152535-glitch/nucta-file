/**
 * Dormant accounts for many companies at once: the rules, without the
 * database, so they can be tested on their own.
 *
 * Bulk filing is for the plain case a formation agent sees most: a company
 * that did nothing all year and whose balance sheet is only its share
 * capital, either still unpaid or held as cash. Anything else goes through
 * the company's own return, where every figure can be entered.
 */
import { blankReturnData, type ReturnData } from "./return-model";
import type { ChProfile } from "./ch-api";

const addDays = (iso: string, n: number) => new Date(Date.parse(iso + "T12:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);
const addYears = (iso: string, n: number) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCFullYear(d.getUTCFullYear() + n); return d.toISOString().slice(0, 10); };

export interface DormantRow {
  companyId: string;
  periodStart: string;
  periodEnd: string;
  /** Share capital in pounds, e.g. 1 or 100. */
  shareCapital: number;
  /** Whether the shareholders paid for their shares (held as cash) or still owe for them. */
  paid: boolean;
  /** Whether the company has ever traded: dormant accounts say which. */
  everTraded: boolean;
  /** The director approving the accounts. */
  director: string;
  /** These are the company's first accounts (no comparative year). */
  first: boolean;
}

/** The period Companies House expect next, from the company's record. */
export function suggestedPeriod(p: ChProfile | null, incorporatedOn: string | null): { start: string; end: string } | null {
  const end = p?.nextAccountsMadeUpTo ?? null;
  if (!end) return null;
  const start = p?.lastAccountsMadeUpTo ? addDays(p.lastAccountsMadeUpTo, 1) : (p?.incorporatedOn ?? incorporatedOn ?? addDays(addYears(end, -1), 1));
  return { start, end };
}

export function dormantRowProblems(r: DormantRow, approvedOn: string, today: string): string[] {
  const out: string[] = [];
  const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
  if (!isDate(r.periodStart) || !isDate(r.periodEnd)) out.push("Both period dates are needed.");
  else {
    if (r.periodEnd <= r.periodStart) out.push("The period must end after it starts.");
    if (r.periodEnd > today) out.push("The period hasn't ended yet.");
    if (r.periodEnd > addDays(addYears(r.periodStart, 1), 6) && !r.first) out.push("Accounts after the first can't cover more than 12 months (a week either way).");
    if (r.periodEnd > addDays(addYears(r.periodStart, 1), 184)) out.push("Accounts can't cover more than 18 months.");
    if (isDate(approvedOn) && approvedOn <= r.periodEnd) out.push("The approval date must be after the year end.");
  }
  if (!(r.shareCapital > 0) || !Number.isFinite(r.shareCapital)) out.push("Enter the share capital, e.g. 1 or 100.");
  if (!r.director.trim()) out.push("Name the director approving the accounts.");
  return out;
}

/**
 * The return's figures for a dormant company: nothing in the profit and
 * loss, the share capital on the balance sheet (owed by the shareholders, or
 * as cash), and the same for last year unless these are the first accounts.
 * No notice from HMRC is assumed, so no CT600 is needed unless one arrives.
 */
export function dormantReturnData(r: DormantRow, approvedOn: string, keep?: ReturnData | null): ReturnData {
  const base = keep ?? blankReturnData();
  const cap = Math.round(r.shareCapital * 100) / 100;
  const priorFrom = addYears(r.periodStart, -1);
  const priorTo = addDays(r.periodStart, -1);
  return {
    ...base,
    dormant: true,
    everTraded: r.everTraded,
    ctNoticeReceived: keep?.ctNoticeReceived ?? false,
    activity: base.activity || "Dormant company",
    accountsFormat: "micro",
    balanceSheet: {
      ...blankReturnData().balanceSheet,
      shareCapital: cap,
      shareCapitalNotPaid: r.paid ? 0 : cap,
      cash: r.paid ? cap : 0,
      reservesBroughtForward: 0,
      employees: 0,
    },
    prior: r.first ? null : {
      from: priorFrom, to: priorTo,
      figures: {
        turnover: 0, otherIncome: 0, rawMaterials: 0, staffCosts: 0, depreciation: 0, otherCharges: 0, profitBeforeTax: 0, tax: 0,
        shareCapitalNotPaid: r.paid ? 0 : cap, fixedAssets: 0, currentAssets: r.paid ? cap : 0, prepayments: 0,
        creditorsWithin: 0, creditorsAfter: 0, provisions: 0, accruals: 0, employees: 0,
      },
    },
    director: r.director.trim(),
    approvedOn,
    declarantName: base.declarantName || r.director.trim(),
    declarantStatus: base.declarantStatus || "Director",
  };
}
