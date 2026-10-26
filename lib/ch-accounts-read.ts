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
import type { PriorYear } from "./ixbrl";

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
const WANT: Record<keyof PriorYear, Want> = {
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
  for (const [k, w] of Object.entries(WANT) as [keyof PriorYear, Want][]) {
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
  return { prior: { from: start, to, figures }, found, netAssets, equity, shareCapital, microShape };
}
