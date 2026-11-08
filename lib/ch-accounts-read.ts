/**
 * Reading last year's figures out of accounts already filed at Companies
 * House. Accounts filed through software are inline XBRL: an ordinary web
 * page with each figure tagged with what it is (core:FixedAssets…), the date
 * it's for, and any qualifier (creditors due within one year, say). This finds
 * the figures a micro-entity balance sheet and profit and loss account need,
 * for the year the accounts were made up to, so they can be the comparative
 * column in the next year's accounts.
 *
 * Plain logic, no network: lib/ch-api.ts fetches the document.
 */
import { DOMParser } from "@xmldom/xmldom";
import type { PriorSmall, PriorYear } from "./ixbrl";

export interface Fact { name: string; context: string; value: number }
interface Context { id: string; instant: string | null; start: string | null; end: string | null; dims: Record<string, string> }

const local = (qname: string | null | undefined) => String(qname ?? "").split(":").pop()!.trim();

/** A tagged number's value, from its text and its format, scale and sign. */
export function factValue(text: string, format: string | null, scale: string | null, sign: string | null): number | null {
  const f = local(format).toLowerCase();
  let t = text.replace(/\s+/g, "").replace(/[£$€]/g, "");
  if (/zero|dash/.test(f) && (!/\d/.test(t) || /fixed-?zero|zerodash/.test(f))) return 0;
  if (t === "" || t === "-" || t === "–" || t === "—") return /zero|dash/.test(f) || t !== "" ? 0 : null;
  if (/commadecimal|numcommadecimal|num-comma-decimal/.test(f)) t = t.replace(/[.\s ]/g, "").replace(",", ".");
  else t = t.replace(/[, ]/g, "");
  t = t.replace(/^\((.*)\)$/, "$1");
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t) * 10 ** (Number(scale) || 0);
  return Math.round((sign === "-" ? -n : n) * 100) / 100;
}

/** Every tagged number in an inline XBRL document, with the contexts they refer to. */
export function readFacts(xhtml: string): { facts: Fact[]; contexts: Map<string, Context> } {
  const errors: string[] = [];
  const doc = new DOMParser({ onError: (level: string, msg: string) => { if (level === "fatalError") errors.push(msg); } }).parseFromString(xhtml, "application/xhtml+xml");
  if (errors.length || !doc?.documentElement) throw new Error("The accounts couldn't be read as inline XBRL.");
  const all = (tag: string) => Array.from(doc.getElementsByTagNameNS("*", tag) as unknown as ArrayLike<Element>);
  const text = (el: Element | undefined) => (el?.textContent ?? "").trim();
  const contexts = new Map<string, Context>();
  for (const c of all("context")) {
    const id = c.getAttribute("id");
    if (!id) continue;
    const pick = (tag: string) => text(Array.from(c.getElementsByTagNameNS("*", tag) as unknown as ArrayLike<Element>)[0]) || null;
    const dims: Record<string, string> = {};
    for (const m of Array.from(c.getElementsByTagNameNS("*", "explicitMember") as unknown as ArrayLike<Element>)) dims[local(m.getAttribute("dimension"))] = local(text(m));
    for (const m of Array.from(c.getElementsByTagNameNS("*", "typedMember") as unknown as ArrayLike<Element>)) dims[local(m.getAttribute("dimension"))] = text(m);
    contexts.set(id, { id, instant: pick("instant"), start: pick("startDate"), end: pick("endDate"), dims });
  }
  const facts: Fact[] = [];
  for (const el of all("nonFraction")) {
    if (el.getAttribute("xsi:nil") === "true") continue;
    const v = factValue(el.textContent ?? "", el.getAttribute("format"), el.getAttribute("scale"), el.getAttribute("sign"));
    const context = el.getAttribute("contextRef");
    if (v === null || !context) continue;
    facts.push({ name: local(el.getAttribute("name")), context, value: v });
  }
  return { facts, contexts };
}

type Want = { names: string[]; dims?: Record<string, string>; when: "instant" | "duration" };
const W = (when: Want["when"], names: string[], dims?: Record<string, string>): Want => ({ when, names, dims });

/** Where each of last year's figures is found, in order of preference. */
type Totals = Exclude<keyof PriorYear, "small">;
const WANT: Record<Totals, Want> = {
  turnover: W("duration", ["TurnoverRevenue"]),
  otherIncome: W("duration", ["OtherOperatingIncomeFormat2", "OtherOperatingIncomeFormat1", "OtherIncome"]),
  rawMaterials: W("duration", ["RawMaterialsConsumablesUsed", "CostSales"]),
  staffCosts: W("duration", ["StaffCostsEmployeeBenefitsExpense"]),
  depreciation: W("duration", ["DepreciationAmortisationImpairmentExpense", "DepreciationOtherAmountsWrittenOffTangibleIntangibleFixedAssets"]),
  otherCharges: W("duration", ["OtherOperatingExpensesFormat2", "OtherOperatingExpensesFormat1", "OtherCharges", "AdministrativeExpenses"]),
  profitBeforeTax: W("duration", ["ProfitLossOnOrdinaryActivitiesBeforeTax", "ProfitLossBeforeTax"]),
  tax: W("duration", ["TaxTaxCreditOnProfitOrLossOnOrdinaryActivities", "TaxExpenseCredit"]),
  shareCapitalNotPaid: W("instant", ["CalledUpShareCapitalNotPaidNotExpressedAsCurrentAsset", "CalledUpShareCapitalNotPaid"]),
  fixedAssets: W("instant", ["FixedAssets"]),
  currentAssets: W("instant", ["CurrentAssets"]),
  prepayments: W("instant", ["PrepaymentsAccruedIncome"]),
  creditorsWithin: W("instant", ["Creditors"], { MaturitiesOrExpirationPeriodsDimension: "WithinOneYear" }),
  creditorsAfter: W("instant", ["Creditors"], { MaturitiesOrExpirationPeriodsDimension: "AfterOneYear" }),
  provisions: W("instant", ["ProvisionsForLiabilitiesBalanceSheetSubtotal", "Provisions"]),
  accruals: W("instant", ["AccruedLiabilitiesDeferredIncome"]),
  employees: W("duration", ["AverageNumberEmployeesDuringPeriod"]),
};
const WITHIN = { MaturitiesOrExpirationPeriodsDimension: "WithinOneYear" };
const AFTER = { MaturitiesOrExpirationPeriodsDimension: "AfterOneYear" };

/**
 * Where each line of small-company accounts is found. Lines inside creditors
 * are usually tagged with their maturity; within-a-year lines are also
 * looked for without it, as some software leaves it off.
 */
const WANT_SMALL: Partial<Record<keyof PriorSmall, Want>> = {
  costOfSales: W("duration", ["CostSales", "RawMaterialsConsumablesUsed"]),
  administrativeExpenses: W("duration", ["AdministrativeExpenses"]),
  otherOperatingIncome: W("duration", ["OtherOperatingIncomeFormat1", "OtherOperatingIncomeFormat2"]),
  interestReceivable: W("duration", ["OtherInterestReceivableSimilarIncomeFinanceIncome"]),
  interestPayable: W("duration", ["InterestPayableSimilarChargesFinanceCosts"]),
  currentTax: W("duration", ["CurrentTaxForPeriod", "TotalCurrentTaxExpenseCredit"]),
  deferredTax: W("duration", ["DeferredTaxExpenseCreditRelatingToOriginationReversalTimingDifferences"]),
  tangibleAssets: W("instant", ["PropertyPlantEquipment"]),
  investments: W("instant", ["InvestmentsFixedAssets"]),
  stocks: W("instant", ["TotalInventories"]),
  tradeDebtors: W("instant", ["TradeDebtorsTradeReceivables"]),
  owedByDirectors: W("instant", ["AmountsOwedByDirectors"]),
  otherDebtors: W("instant", ["OtherDebtors"]),
  prepayments: W("instant", ["PrepaymentsAccruedIncome"]),
  cash: W("instant", ["CashBankOnHand"]),
  bankWithin: W("instant", ["BankBorrowingsOverdrafts", "BankBorrowings", "BankOverdrafts"], WITHIN),
  tradeCreditors: W("instant", ["TradeCreditorsTradePayables"], WITHIN),
  corporationTax: W("instant", ["CorporationTaxPayable"], WITHIN),
  otherTaxation: W("instant", ["OtherTaxationSocialSecurityPayable", "TaxationSocialSecurityPayable"], WITHIN),
  owedToDirectors: W("instant", ["AmountsOwedToDirectors"], WITHIN),
  otherCreditorsWithin: W("instant", ["OtherCreditors"], WITHIN),
  accrualsWithin: W("instant", ["AccruedLiabilitiesDeferredIncome"], WITHIN),
  bankAfter: W("instant", ["BankBorrowingsOverdrafts", "BankBorrowings"], AFTER),
  otherAfter: W("instant", ["OtherCreditors"], AFTER),
  deferredTaxProvision: W("instant", ["NetDeferredTaxLiabilityAsset", "DeferredTaxLiabilities", "ProvisionsForLiabilitiesDeferredTax"]),
  dividendsPaid: W("duration", ["DividendsPaidOnShares", "DividendsPaid"]),
};
const r0 = (v: number) => Math.round(v);

const OLD_CREDITORS: Partial<Record<keyof PriorYear, string>> = { creditorsWithin: "CreditorsDueWithinOneYear", creditorsAfter: "CreditorsDueAfterOneYear" };

export interface PriorRead {
  prior: { from: string; to: string; figures: PriorYear };
  /** The figures found in the accounts; any others are 0 and should be checked. */
  found: (keyof PriorYear)[];
  /** Totals read for checking: net assets, and capital and reserves. */
  netAssets: number | null;
  equity: number | null;
  shareCapital: number | null;
  /** Whether the accounts look like micro-entity accounts: their total adds up the way FRS 105 lays it out. */
  microShape: boolean;
  /**
   * Last year line by line, for small-company accounts, made to add up to the
   * totals filed. What couldn't be found line by line is put on an "other"
   * line, and `smallNotes` says so.
   */
  small: PriorSmall;
  smallFound: (keyof PriorSmall)[];
  smallNotes: string[];
}

const sameDims = (a: Record<string, string>, b: Record<string, string> = {}) => {
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && kb.every((k) => a[k] === b[k]);
};

/**
 * Last year's figures from the accounts made up to `madeUpTo`. When that date
 * isn't in the document, the latest balance sheet date in it is used.
 */
export function priorFromAccounts(xhtml: string, madeUpTo: string | null): PriorRead {
  const { facts, contexts } = readFacts(xhtml);
  const instants = [...contexts.values()].map((c) => c.instant ?? c.end).filter((d): d is string => Boolean(d)).sort();
  const to = madeUpTo && instants.includes(madeUpTo) ? madeUpTo : instants[instants.length - 1];
  if (!to) throw new Error("The accounts have no dates in them that could be read.");
  const at = (c: Context, when: Want["when"]) => (when === "instant" ? (c.instant ?? null) === to : c.end === to && Boolean(c.start));
  const find = (names: string[], when: Want["when"], dims?: Record<string, string>): number | null => {
    for (const name of names) {
      for (const f of facts) {
        if (f.name !== name) continue;
        const c = contexts.get(f.context);
        if (c && at(c, when) && sameDims(c.dims, dims)) return f.value;
      }
    }
    return null;
  };
  const figures = {} as PriorYear;
  const found: (keyof PriorYear)[] = [];
  for (const [k, w] of Object.entries(WANT) as [Totals, Want][]) {
    let v = find(w.names, w.when, w.dims);
    if (v === null && OLD_CREDITORS[k]) v = find([OLD_CREDITORS[k]!], "instant");
    if (v !== null) found.push(k);
    figures[k] = v ?? 0;
  }
  // Costs and charges are shown as positive amounts in the profit and loss account, whatever sign the tag carries.
  for (const k of ["rawMaterials", "staffCosts", "depreciation", "otherCharges"] as const) figures[k] = Math.abs(figures[k]);
  figures.employees = Math.round(figures.employees);

  const netAssets = find(["NetAssetsLiabilities", "NetAssetsLiabilitiesIncludingPensionAssetLiability"], "instant");
  const equity = find(["Equity", "ShareholderFunds"], "instant");
  const shareCapital = find(["CalledUpShareCapital", "ShareCapital"], "instant") ?? find(["Equity"], "instant", { EquityClassesDimension: "ShareCapital" });
  // In micro-entity accounts, prepayments and accruals are lines of their own;
  // elsewhere they sit inside debtors and creditors, and counting them again
  // would throw the balance sheet out.
  const b = figures;
  const micro = (pp: number, ac: number) => b.fixedAssets + b.currentAssets + pp + b.shareCapitalNotPaid - b.creditorsWithin - ac - b.creditorsAfter - b.provisions;
  const microShape = netAssets !== null && Math.abs(micro(b.prepayments, b.accruals) - netAssets) < 1;
  if (netAssets !== null && !microShape && Math.abs(micro(0, 0) - netAssets) < 1) {
    figures.prepayments = 0; figures.accruals = 0;
  }
  const start = [...contexts.values()].filter((c) => c.end === to && c.start).map((c) => c.start!).sort()[0] ?? "";

  // Line by line, for small-company accounts.
  const lines = {} as Record<keyof PriorSmall, number>;
  const smallFound: (keyof PriorSmall)[] = [];
  for (const [k, w] of Object.entries(WANT_SMALL) as [keyof PriorSmall, Want][]) {
    let v = find(w.names, w.when, w.dims);
    if (v === null && w.dims === WITHIN) v = find(w.names, w.when);
    if (v !== null) smallFound.push(k);
    lines[k] = Math.abs(v ?? 0);
  }
  if (smallFound.includes("deferredTax")) lines.deferredTax = find(WANT_SMALL.deferredTax!.names, "duration") ?? 0;
  const { small, notes } = reconcileSmall(figures, lines, smallFound, microShape, shareCapital);
  return { prior: { from: start, to, figures }, found, netAssets, equity, shareCapital, microShape, small, smallFound, smallNotes: notes };
}

const pounds = (n: number) => `£${Math.abs(Math.round(n)).toLocaleString("en-GB")}`;

/**
 * Makes last year's lines add up to the totals filed. Micro-entity accounts
 * have totals only, so the whole of each goes on one line to be split by hand;
 * fuller accounts usually reconcile exactly.
 */
function reconcileSmall(f: PriorYear, l: Record<keyof PriorSmall, number>, found: (keyof PriorSmall)[], microShape: boolean, shareCapital: number | null): { small: PriorSmall; notes: string[] } {
  const notes: string[] = [];
  const s: PriorSmall = { ...l, otherProvisions: 0, shareCapital: r0(shareCapital ?? 0) };
  const put = <K extends keyof PriorSmall>(k: K, diff: number, what: string, line: string) => {
    if (Math.abs(diff) < 1) return;
    s[k] = r0(s[k] + diff) as PriorSmall[K];
    notes.push(`${pounds(diff)} of last year's ${what} couldn't be matched to a line, so it's shown as ${line}. Split it if the accounts show more detail.`);
  };
  // Profit and loss: micro-entity accounts have no administrative expenses line.
  if (!found.includes("administrativeExpenses")) s.administrativeExpenses = r0(f.staffCosts + f.depreciation + f.otherCharges);
  if (!found.includes("costOfSales")) s.costOfSales = r0(f.rawMaterials);
  if (!found.includes("otherOperatingIncome") && !found.includes("interestReceivable")) s.otherOperatingIncome = r0(f.otherIncome);
  if (!found.includes("currentTax")) s.currentTax = r0(f.tax - s.deferredTax);
  const profit = r0(f.turnover - s.costOfSales - s.administrativeExpenses + s.otherOperatingIncome + s.interestReceivable - s.interestPayable);
  if (Math.abs(profit - f.profitBeforeTax) >= 1) {
    s.administrativeExpenses = r0(s.administrativeExpenses + profit - f.profitBeforeTax);
    notes.push(`Last year's expenses were adjusted by ${pounds(profit - f.profitBeforeTax)} so the profit before tax matches the ${pounds(f.profitBeforeTax)} filed. Check them against the profit and loss account.`);
  }
  // Fixed assets.
  if (!found.includes("tangibleAssets") && !found.includes("investments")) s.tangibleAssets = r0(f.fixedAssets);
  else put("tangibleAssets", f.fixedAssets - s.tangibleAssets - s.investments, "fixed assets", "equipment");
  // Current assets: in micro-entity accounts prepayments are a line of their own.
  const current = f.currentAssets + (microShape ? f.prepayments : 0);
  if (microShape) s.prepayments = r0(f.prepayments);
  put("otherDebtors", current - s.stocks - s.tradeDebtors - s.owedByDirectors - s.otherDebtors - s.prepayments - s.cash, "current assets", "other debtors");
  // Creditors: micro-entity accruals move inside creditors due within a year.
  if (microShape && f.accruals) s.accrualsWithin = r0(f.accruals);
  const within = f.creditorsWithin + (microShape ? f.accruals : 0);
  put("otherCreditorsWithin", within - s.bankWithin - s.tradeCreditors - s.corporationTax - s.otherTaxation - s.owedToDirectors - s.otherCreditorsWithin - s.accrualsWithin, "creditors due within a year", "other creditors");
  put("otherAfter", f.creditorsAfter - s.bankAfter - s.otherAfter, "creditors due after a year", "other creditors due after a year");
  s.otherProvisions = r0(f.provisions - s.deferredTaxProvision);
  if (s.otherProvisions < 0) { s.deferredTaxProvision = r0(f.provisions); s.otherProvisions = 0; }
  return { small: s, notes };
}
