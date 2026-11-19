/**
 * Reading Amazon and eBay sellers' reports into the profit and loss.
 *
 * Accepted reports (CSV, as downloaded):
 *
 *   Amazon   Seller Central → Payments → Reports Repository → Transaction
 *            ("Date Range Reports", the transaction or "unified transaction"
 *            report). One row per order, refund, fee and payout, with columns
 *            such as "product sales", "selling fees", "fba fees", "total".
 *   eBay     Seller Hub → Payments → Reports → Transaction report. One row
 *            per order, refund, fee, postage label and payout, with columns
 *            such as "Item subtotal", "Final value fee – variable", "Net amount".
 *
 * Both start with a few lines of description before the column headings;
 * the heading row is found by its column names. Rows outside the return's
 * period are left out, and payouts to the bank are neither income nor
 * expense. Nothing here is sent anywhere: the file is read in the browser.
 *
 * What it can't know is said on screen: whether sales include VAT, what the
 * goods cost to buy, and money still held by the marketplace at the year end.
 */
import { money, parseCsv } from "./trial-balance";

export type Marketplace = "amazon" | "ebay";

export interface MarketplaceTotals {
  /** Sales of goods, postage charged and gift wrap, less refunds and promotions. */
  sales: number;
  /** Refunds included in sales (negative), shown separately. */
  refunds: number;
  /** Reimbursements from the marketplace (lost or damaged stock, claims). */
  reimbursements: number;
  /** Costs, each a positive number. */
  fees: { selling: number; fulfilment: number; advertising: number; subscription: number; storage: number; postage: number; other: number };
  /** Paid out to the bank (positive): not income or expense, for checking against the bank. */
  payouts: number;
  /** VAT or sales tax shown separately in the report, left out of sales. */
  taxSeparated: number;
}

export interface MarketplaceRead {
  ok: boolean;
  problem?: string;
  source: Marketplace | null;
  totals: MarketplaceTotals;
  rows: number;
  inPeriod: number;
  outside: number;
  undated: number;
  /** Row types found that weren't recognised, with their net total: shown so nothing disappears unseen. */
  unrecognised: { type: string; rows: number; total: number }[];
  currencies: string[];
  firstDate: string | null;
  lastDate: string | null;
  warnings: string[];
}

export const blankTotals = (): MarketplaceTotals => ({
  sales: 0, refunds: 0, reimbursements: 0,
  fees: { selling: 0, fulfilment: 0, advertising: 0, subscription: 0, storage: 0, postage: 0, other: 0 },
  payouts: 0, taxSeparated: 0,
});

const norm = (h: string) => h.toLowerCase().replace(/[‘’'"]/g, "").replace(/[–—-]/g, "-").replace(/\s+/g, " ").trim();
const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const iso = (y: number, m: number, d: number): string | null =>
  y > 1990 && y < 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` : null;

/**
 * A date as the reports write it: "1 Jan 2026 00:15:23 GMT", "Jan 1, 2026
 * 12:15:23 AM PST", "01/01/2026 00:15:23 UTC" (UK order: day first),
 * "2026-01-01T00:15:23Z", "01-Jan-26". The time is ignored: a sale at ten
 * past midnight on 1 April belongs to 1 April.
 */
export function reportDate(raw: string): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[ -]([A-Za-z]{3,4})[a-z]*[ ,-]+(\d{2,4})/);
  if (m && MONTHS[m[2].toLowerCase()]) return iso(m[3].length === 2 ? 2000 + +m[3] : +m[3], MONTHS[m[2].toLowerCase()], +m[1]);
  m = s.match(/^([A-Za-z]{3,4})[a-z]*\.? (\d{1,2}),? (\d{4})/);
  if (m && MONTHS[m[1].toLowerCase()]) return iso(+m[3], MONTHS[m[1].toLowerCase()], +m[2]);
  m = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})/);
  if (m) return iso(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  return null;
}

/** Finds the heading row: the first row naming enough of the columns expected. */
function findHeader(rows: string[][]): { at: number; source: Marketplace } | null {
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const h = rows[i].map(norm);
    const has = (x: string) => h.includes(x);
    if ((has("date/time") || has("date")) && has("type") && (has("product sales") || has("total")) && (has("selling fees") || has("fba fees"))) return { at: i, source: "amazon" };
    if (h.some((x) => x.startsWith("transaction creation date")) && has("type") && (has("net amount") || h.some((x) => x.startsWith("item subtotal")))) return { at: i, source: "ebay" };
  }
  return null;
}

export function readMarketplaceReport(text: string, periodFrom: string, periodTo: string): MarketplaceRead {
  const totals = blankTotals();
  const base: MarketplaceRead = { ok: false, source: null, totals, rows: 0, inPeriod: 0, outside: 0, undated: 0, unrecognised: [], currencies: [], firstDate: null, lastDate: null, warnings: [] };
  const rows = parseCsv(text);
  const found = findHeader(rows);
  if (!found) {
    return { ...base, problem: "This doesn't look like an Amazon transaction report or an eBay transaction report. Download the report as CSV, as described above, and choose that file without changing it." };
  }
  const head = rows[found.at].map(norm);
  const col = (...names: string[]): number => {
    for (const n of names) {
      const i = head.indexOf(n);
      if (i >= 0) return i;
    }
    for (const n of names) {
      const i = head.findIndex((h) => h.startsWith(n));
      if (i >= 0) return i;
    }
    return -1;
  };
  const get = (r: string[], i: number) => (i >= 0 ? r[i] ?? "" : "");
  const num = (r: string[], i: number) => { if (i < 0) return 0; const v = money(r[i] ?? ""); return Number.isFinite(v) ? v : 0; };
  const odd = new Map<string, { rows: number; total: number }>();
  const currencies = new Set<string>();
  let first: string | null = null, last: string | null = null;
  const body = rows.slice(found.at + 1).filter((r) => r.length > 2);

  if (found.source === "amazon") {
    const c = {
      date: col("date/time", "date"), type: col("type"), desc: col("description"),
      sales: col("product sales"), salesTax: col("product sales tax"),
      postage: col("postage credits", "shipping credits"), postageTax: col("shipping credits tax", "postage credits tax"),
      wrap: col("gift wrap credits"), wrapTax: col("giftwrap credits tax", "gift wrap credits tax"),
      promo: col("promotional rebates"), promoTax: col("promotional rebates tax"), withheld: col("marketplace withheld tax", "marketplace facilitator tax"),
      selling: col("selling fees"), fba: col("fba fees"), otherFees: col("other transaction fees"), other: col("other"),
      regFee: col("regulatory fee"), regTax: col("tax on regulatory fee"), total: col("total"),
    };
    for (const r of body) {
      base.rows++;
      const d = reportDate(get(r, c.date));
      if (!d) { base.undated++; continue; }
      if (d < periodFrom || d > periodTo) { base.outside++; continue; }
      base.inPeriod++;
      if (!first || d < first) first = d;
      if (!last || d > last) last = d;
      const type = norm(get(r, c.type));
      const desc = norm(get(r, c.desc));
      const total = num(r, c.total);
      const goods = num(r, c.sales) + num(r, c.postage) + num(r, c.wrap) + num(r, c.promo);
      const tax = num(r, c.salesTax) + num(r, c.postageTax) + num(r, c.wrapTax) + num(r, c.promoTax) + num(r, c.withheld);
      const fees = { selling: num(r, c.selling), fba: num(r, c.fba), other: num(r, c.otherFees) + num(r, c.other) + num(r, c.regFee) + num(r, c.regTax) };
      if (type === "transfer" || /^(disbursement|payout)/.test(type)) { totals.payouts += -total; continue; }
      if (type === "order" || type === "refund" || type === "liquidations" || type === "liquidation" || type === "chargeback refund" || type === "a-to-z guarantee claim") {
        totals.sales += goods;
        if (type !== "order" && type !== "liquidations" && type !== "liquidation") totals.refunds += goods;
        totals.taxSeparated += tax;
        totals.fees.selling -= fees.selling;
        totals.fees.fulfilment -= fees.fba;
        totals.fees.other -= fees.other;
        continue;
      }
      if (type === "service fee" || type === "amazon fees" || type === "fee adjustment") {
        if (/advert|sponsored|cost of advertising/.test(desc)) totals.fees.advertising -= total;
        else if (/subscription/.test(desc)) totals.fees.subscription -= total;
        else if (/storage|inventory|removal|disposal|placement|inbound/.test(desc)) totals.fees.storage -= total;
        else totals.fees.other -= total;
        continue;
      }
      if (type === "fba inventory fee" || type === "inventory fee") { totals.fees.storage -= total; continue; }
      if (type === "shipping services" || type === "postage services") { totals.fees.postage -= total; continue; }
      if (type === "adjustment" || type === "fba customer return fee") {
        if (total >= 0 && /reimburse|lost|damaged|warehouse|safe-t|claim/.test(desc + " " + type)) totals.reimbursements += total;
        else if (total >= 0) totals.reimbursements += total;
        else totals.fees.other -= total;
        continue;
      }
      if (type === "debt" || type === "deferred transaction" || type === "") { if (type === "debt") totals.payouts += -total; continue; }
      const k = get(r, c.type) || "(no type)";
      const o = odd.get(k) ?? { rows: 0, total: 0 };
      odd.set(k, { rows: o.rows + 1, total: o.total + total });
    }
  } else {
    const c = {
      date: col("transaction creation date"), type: col("type"), desc: col("description"),
      subtotal: col("item subtotal"), postage: col("postage and packaging", "shipping and handling"),
      sellerTax: col("seller collected tax"), ebayTax: col("ebay collected tax"),
      fvfFixed: col("final value fee - fixed"), fvfVar: col("final value fee - variable"),
      vhinad: col("very high item not as described fee"), belowStd: col("below standard performance fee"), intl: col("international fee"),
      net: col("net amount"), gross: col("gross transaction amount"), currency: col("transaction currency", "payout currency"),
    };
    for (const r of body) {
      base.rows++;
      const d = reportDate(get(r, c.date));
      if (!d) { base.undated++; continue; }
      if (d < periodFrom || d > periodTo) { base.outside++; continue; }
      base.inPeriod++;
      if (!first || d < first) first = d;
      if (!last || d > last) last = d;
      const cur = get(r, c.currency).toUpperCase();
      if (cur) currencies.add(cur);
      const type = norm(get(r, c.type));
      const desc = norm(get(r, c.desc));
      const net = num(r, c.net);
      if (type === "payout" || type === "transfer") { totals.payouts += Math.abs(net); continue; }
      if (type === "order" || type === "refund" || type === "claim" || type === "payment dispute") {
        const goods = num(r, c.subtotal) + num(r, c.postage);
        // eBay writes refunds' subtotals as positive amounts with a negative net.
        const signed = type === "order" ? Math.abs(goods) : -Math.abs(goods);
        const feesHere = Math.abs(num(r, c.fvfFixed)) + Math.abs(num(r, c.fvfVar)) + Math.abs(num(r, c.vhinad)) + Math.abs(num(r, c.belowStd)) + Math.abs(num(r, c.intl));
        if (goods) {
          totals.sales += signed;
          if (type !== "order") totals.refunds += signed;
          totals.taxSeparated += (type === "order" ? 1 : -1) * Math.abs(num(r, c.sellerTax));
          totals.fees.selling += type === "order" ? feesHere : -feesHere;
        } else {
          // A claim or dispute with only a net amount: money returned to the buyer.
          totals.sales += net;
          totals.refunds += net;
        }
        continue;
      }
      if (type === "shipping label" || type === "postage label") { totals.fees.postage += -net; continue; }
      if (type === "other fee" || type === "charge") {
        if (/promoted|advert|ad fee/.test(desc)) totals.fees.advertising += -net;
        else if (/subscription|shop|store/.test(desc)) totals.fees.subscription += -net;
        else totals.fees.other += -net;
        continue;
      }
      if (type === "adjustment" || type === "credit") { if (net >= 0) totals.reimbursements += net; else totals.fees.other += -net; continue; }
      if (type === "hold" || type === "reserve") continue;
      const k = get(r, c.type) || "(no type)";
      const o = odd.get(k) ?? { rows: 0, total: 0 };
      odd.set(k, { rows: o.rows + 1, total: o.total + net });
    }
  }

  const round = (n: number) => Math.round(n * 100) / 100;
  totals.sales = round(totals.sales); totals.refunds = round(totals.refunds); totals.reimbursements = round(totals.reimbursements);
  totals.payouts = round(totals.payouts); totals.taxSeparated = round(totals.taxSeparated);
  for (const k of Object.keys(totals.fees) as (keyof MarketplaceTotals["fees"])[]) totals.fees[k] = round(totals.fees[k]);

  const nice = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const warnings: string[] = [];
  const cs = [...currencies];
  if (cs.some((x) => x !== "GBP")) warnings.push(`Some amounts are in ${cs.filter((x) => x !== "GBP").join(", ")}. Accounts are in pounds, so convert those sales and fees at the rates used in the bookkeeping before relying on these totals.`);
  if (base.undated) warnings.push(`${base.undated} row${base.undated === 1 ? " has" : "s have"} no date that could be read, so ${base.undated === 1 ? "it was" : "they were"} left out.`);
  if (base.inPeriod === 0) warnings.push("None of the rows fall within this return's period. Check the report covers the right dates.");
  else {
    if (first && first > periodFrom) warnings.push(`The report starts on ${nice(first)}, after the period starts. If there were sales before then, add a report covering those dates.`);
    if (last && last < periodTo) warnings.push(`The report ends on ${nice(last)}, before the period ends. If there were sales after then, add a report covering those dates.`);
  }
  return {
    ...base, ok: true, source: found.source, totals,
    unrecognised: [...odd.entries()].map(([type, v]) => ({ type, rows: v.rows, total: round(v.total) })),
    currencies: cs, firstDate: first, lastDate: last, warnings,
  };
}

/** Several reports (Amazon and eBay, or several months) added together. */
export function addTotals(list: MarketplaceTotals[]): MarketplaceTotals {
  const t = blankTotals();
  for (const x of list) {
    t.sales += x.sales; t.refunds += x.refunds; t.reimbursements += x.reimbursements; t.payouts += x.payouts; t.taxSeparated += x.taxSeparated;
    for (const k of Object.keys(t.fees) as (keyof MarketplaceTotals["fees"])[]) t.fees[k] += x.fees[k];
  }
  return t;
}

export const totalFees = (t: MarketplaceTotals): number => Object.values(t.fees).reduce((a, b) => a + b, 0);

/**
 * The figures for the profit and loss. When the sales include VAT that the
 * company has to pay over (a VAT-registered company whose report doesn't
 * separate it), the VAT is taken out at the rate given — 20% standard —
 * because turnover in the accounts is without VAT.
 */
export function forProfitAndLoss(t: MarketplaceTotals, salesIncludeVatAt: number | null): { turnover: number; otherIncome: number; otherCharges: number; vatRemoved: number } {
  const gross = t.sales;
  const turnover = salesIncludeVatAt ? Math.round((gross / (1 + salesIncludeVatAt / 100)) * 100) / 100 : gross;
  return {
    turnover: Math.round(turnover),
    otherIncome: Math.round(t.reimbursements),
    otherCharges: Math.round(totalFees(t)),
    vatRemoved: Math.round(gross - turnover),
  };
}
