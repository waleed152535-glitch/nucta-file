/**
 * The figures for Companies House's online micro-entity accounts form,
 * box by box, in the form's own words and order — this year and last year.
 *
 * They come from the same accounts Nucta File sends HMRC with the CT600, so
 * what Companies House receive matches what HMRC have. The form wants plain
 * whole numbers: no commas, no brackets, a minus sign for a negative.
 */
import type { AccountsInput } from "../ixbrl";

export interface ChFormRow {
  /** The box's name on Companies House's form. */
  label: string;
  now: number;
  /** Last year's figure, or null in a company's first accounts. */
  then: number | null;
  /** A total the form works out from the boxes above it (still typed in). */
  total?: boolean;
}

export interface CompaniesHouseForm {
  madeUpTo: string;
  priorTo: string | null;
  dormant: boolean;
  rows: ChFormRow[];
  director: string;
  approvedOn: string;
  /** For the "advances and credits to directors" page. */
  directorsLoans: { name: string; advanced: number; repaid: number; closing: number; terms: string }[];
}

const totals = (b: { shareCapitalNotPaid: number; fixedAssets: number; currentAssets: number; prepayments: number; creditorsWithin: number; creditorsAfter: number; provisions: number; accruals: number }) => {
  const netCurrent = b.currentAssets + b.prepayments - b.creditorsWithin;
  const totalLessCurrent = b.shareCapitalNotPaid + b.fixedAssets + netCurrent;
  const net = totalLessCurrent - b.creditorsAfter - b.provisions - b.accruals;
  return { netCurrent, totalLessCurrent, net };
};

export function companiesHouseForm(a: AccountsInput): CompaniesHouseForm {
  const now = totals(a);
  const p = a.prior && a.priorFrom && a.priorTo ? a.prior : null;
  const then = p ? totals(p) : null;
  const pv = <T extends number>(v: T | undefined): number | null => (p ? Math.round(v ?? 0) : null);
  const rows: ChFormRow[] = [
    { label: "Called up share capital not paid", now: a.shareCapitalNotPaid, then: pv(p?.shareCapitalNotPaid) },
    { label: "Total fixed assets", now: a.fixedAssets, then: pv(p?.fixedAssets) },
    { label: "Total current assets", now: a.currentAssets, then: pv(p?.currentAssets) },
    { label: "Prepayments and accrued income", now: a.prepayments, then: pv(p?.prepayments) },
    { label: "Creditors: amounts falling due within one year", now: a.creditorsWithin, then: pv(p?.creditorsWithin) },
    { label: "Net current assets (liabilities)", now: now.netCurrent, then: then ? then.netCurrent : null, total: true },
    { label: "Total assets less current liabilities", now: now.totalLessCurrent, then: then ? then.totalLessCurrent : null, total: true },
    { label: "Creditors: amounts falling due after more than one year", now: a.creditorsAfter, then: pv(p?.creditorsAfter) },
    { label: "Provisions for liabilities", now: a.provisions, then: pv(p?.provisions) },
    { label: "Accruals and deferred income", now: a.accruals, then: pv(p?.accruals) },
    { label: "Total net assets (liabilities)", now: now.net, then: then ? then.net : null, total: true },
    { label: "Capital and reserves", now: now.net, then: then ? then.net : null, total: true },
    { label: "Average number of employees", now: a.employees, then: p ? Math.round(p.employees ?? 0) : null },
  ].map((r) => ({ ...r, now: Math.round(r.now) }));
  return {
    madeUpTo: a.periodTo, priorTo: p ? a.priorTo! : null, dormant: a.dormant, rows,
    director: a.approvedBy, approvedOn: a.approvedOn,
    directorsLoans: (a.directorsLoans ?? []).map((l) => ({ name: l.name, advanced: l.advanced, repaid: l.repaid, closing: l.closing, terms: l.terms })),
  };
}

/**
 * The accounts as delivered to Companies House: a micro-entity may leave out
 * the profit and loss account (Companies Act 2006, s444), and must say so.
 */
export function companiesHouseCopy(accountsHtml: string): string {
  const start = accountsHtml.indexOf("<h2>Profit and loss account</h2>");
  const end = accountsHtml.indexOf("<h2>Balance sheet as at");
  const body = start >= 0 && end > start ? accountsHtml.slice(0, start) + accountsHtml.slice(end) : accountsHtml;
  const said = "These accounts have been prepared and delivered in accordance with the provisions applicable to companies subject to the micro-entity provisions.";
  return start >= 0 && end > start
    ? body.replace(said, `${said} In accordance with section 444 of the Companies Act 2006, the profit and loss account has not been delivered to the Registrar of Companies.`)
    : body;
}
