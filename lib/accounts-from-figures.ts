import { ACCOUNT_TAXONOMIES, COMP_TAXONOMIES, type AccountsInput } from "./ixbrl";

/**
 * The handful of figures the consoles ask for.
 *
 * Shared by the HMRC and Companies House consoles so that both file exactly
 * the same accounts. It is deliberately not in a "use server" file, which may
 * only export async functions.
 */
export interface Figures {
  companyName: string;
  companyNo: string;
  utr?: string;
  periodFrom: string;
  periodTo: string;
  turnover: number;
  tradingProfits: number;
  corporationTax: number;
  marginalRelief?: number;
  taxPayable: number;
  /** The director approving the accounts. */
  approvedBy: string;
  /** When the board approved them. Real accounts are approved after the year end. */
  approvedOn?: string;
  accountsTaxonomy?: string;
  compTaxonomy?: string;
}

/**
 * Turns the figures into a full set of accounts.
 *
 * The rest of the balance sheet is derived to something internally
 * consistent: the only asset is the cash the profit left behind, and the only
 * creditor is the tax still owed.
 */
export function accountsFromFigures(f: Figures): AccountsInput {
  const profit = f.tradingProfits;
  // The accounts show the tax the company actually owes, which is after
  // marginal relief — not the 25% figure before it.
  const taxCharged = f.corporationTax - (f.marginalRelief ?? 0);
  const retained = profit - taxCharged;
  // A profit leaves cash behind. A loss has to have been paid for by someone,
  // and for a small owner-managed company that is normally the director: the
  // loss is funded by a director's loan, shown in creditors, which keeps the
  // balance sheet balancing with the reserve equal to the loss.
  const cash = retained >= 0 ? retained + f.taxPayable + 1 : 1000;
  const directorLoan = retained >= 0 ? 0 : cash - 1 - retained;
  return {
    companyName: f.companyName,
    companyNo: f.companyNo,
    // The computation must carry the UTR as ct:TaxReference, and HMRC's
    // pattern for it is ten digits exactly.
    utr: (f.utr ?? "").replace(/\D/g, ""),
    periodFrom: f.periodFrom,
    periodTo: f.periodTo,
    dormant: f.turnover === 0 && profit === 0,

    turnover: f.turnover,
    costOfSales: Math.max(0, f.turnover - profit),
    grossProfit: profit,
    adminExpenses: 0,
    staffCosts: 0,
    otherIncome: 0,
    profitBeforeTax: profit,
    taxCharge: taxCharged,

    shareCapitalNotPaid: 0,
    fixedAssets: 0,
    currentAssets: cash,
    prepayments: 0,
    creditorsWithin: f.taxPayable + directorLoan,
    creditorsAfter: 0,
    provisions: 0,
    accruals: 0,
    shareCapital: 1,
    employees: 1,

    approvedBy: f.approvedBy,
    approvedOn: f.approvedOn ?? f.periodTo,
    principalActivities: "Online retail",
    // A dormant test company has never traded.
    tradingStatus: f.turnover === 0 && profit === 0 ? "neverTraded" : "trading",
    // The document has no accountant's report in it, so the status mustn't
    // claim one; the tags have to agree with what the accounts actually say.
    accountsStatus: "AuditExempt-NoAccountantsReport",
    taxonomy: ACCOUNT_TAXONOMIES.find((t) => t.key === f.accountsTaxonomy) ?? ACCOUNT_TAXONOMIES[0],
    compTaxonomy: COMP_TAXONOMIES.find((t) => t.key === f.compTaxonomy) ?? COMP_TAXONOMIES[0],
  };
}
