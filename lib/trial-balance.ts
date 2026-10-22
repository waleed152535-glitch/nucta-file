/**
 * Reading a trial balance exported from bookkeeping software (Xero,
 * QuickBooks, FreeAgent, Sage and most others export one as CSV) and turning
 * it into the year's figures: the profit and loss lines and the balance
 * sheet. Each account is matched to a figure by its name, its type when the
 * export has one, and its code; every match is shown so it can be changed.
 *
 * Signs: a trial balance shows debits and credits. Expenses and assets are
 * debits, income, liabilities and capital are credits, so each figure takes
 * (debit − credit) or (credit − debit) as its kind requires.
 */

export type PlKey = "turnover" | "otherIncome" | "interestReceived" | "costOfSales" | "staffCosts" | "depreciation" | "otherCharges";
export type BsKey = "fixedAssets" | "stock" | "debtors" | "cash" | "prepayments" | "creditorsWithin" | "owedToDirectors" | "corporationTaxOwed"
  | "creditorsAfter" | "provisions" | "shareCapital" | "reservesBroughtForward" | "dividendsPaid";
export type Target = PlKey | BsKey | "ignore";

export const TARGETS: { key: Target; label: string; group: "Profit and loss" | "Balance sheet" | "Leave out"; sign: 1 | -1 }[] = [
  { key: "turnover", label: "Turnover", group: "Profit and loss", sign: -1 },
  { key: "otherIncome", label: "Other income", group: "Profit and loss", sign: -1 },
  { key: "interestReceived", label: "Interest received", group: "Profit and loss", sign: -1 },
  { key: "costOfSales", label: "Cost of goods sold", group: "Profit and loss", sign: 1 },
  { key: "staffCosts", label: "Staff costs", group: "Profit and loss", sign: 1 },
  { key: "depreciation", label: "Depreciation", group: "Profit and loss", sign: 1 },
  { key: "otherCharges", label: "Other expenses", group: "Profit and loss", sign: 1 },
  { key: "fixedAssets", label: "Equipment and vehicles (net)", group: "Balance sheet", sign: 1 },
  { key: "stock", label: "Stock", group: "Balance sheet", sign: 1 },
  { key: "debtors", label: "Owed to the company", group: "Balance sheet", sign: 1 },
  { key: "cash", label: "Cash at bank", group: "Balance sheet", sign: 1 },
  { key: "prepayments", label: "Prepayments", group: "Balance sheet", sign: 1 },
  { key: "creditorsWithin", label: "Owed within a year", group: "Balance sheet", sign: -1 },
  { key: "owedToDirectors", label: "Owed to directors", group: "Balance sheet", sign: -1 },
  { key: "corporationTaxOwed", label: "Corporation Tax owed", group: "Balance sheet", sign: -1 },
  { key: "creditorsAfter", label: "Owed after more than a year", group: "Balance sheet", sign: -1 },
  { key: "provisions", label: "Provisions", group: "Balance sheet", sign: -1 },
  { key: "shareCapital", label: "Share capital", group: "Balance sheet", sign: -1 },
  { key: "reservesBroughtForward", label: "Profit and loss reserve brought forward", group: "Balance sheet", sign: -1 },
  { key: "dividendsPaid", label: "Dividends paid", group: "Balance sheet", sign: 1 },
  { key: "ignore", label: "Leave out", group: "Leave out", sign: 1 },
];
export const SIGN = Object.fromEntries(TARGETS.map((t) => [t.key, t.sign])) as Record<Target, 1 | -1>;
export const PL_KEYS: PlKey[] = ["turnover", "otherIncome", "interestReceived", "costOfSales", "staffCosts", "depreciation", "otherCharges"];

export interface TbRow {
  code: string;
  name: string;
  type: string;
  /** Debit minus credit, in pounds. */
  net: number;
}
export interface TbMatch extends TbRow { target: Target; why: "name" | "type" | "code" | "guess" }

/** Splits CSV text into rows of cells, honouring quotes; the separator is whichever of , ; or tab the text uses most. */
export function parseCsv(text: string): string[][] {
  const t = text.replace(/^﻿/, "");
  const firstLines = t.split(/\r?\n/).slice(0, 15).join("\n");
  const count = (c: string) => (firstLines.match(new RegExp(c === "\t" ? "\t" : `\\${c}`, "g")) ?? []).length;
  const sep = ["\t", ";", ","].reduce((best, c) => (count(c) > count(best) ? c : best), ",");
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) {
      if (ch === '"' && t[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some(Boolean));
}

/** "1,234.56", "(1,234.56)", "-£12", "12.00 Cr" as numbers. */
export function money(raw: string): number {
  let s = (raw ?? "").trim();
  if (!s || s === "-" || s === "–") return 0;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (/\bcr\b/i.test(s)) { neg = !neg; s = s.replace(/\bcr\b/i, ""); }
  s = s.replace(/\bdr\b/i, "").replace(/[£$€,\s]/g, "");
  if (s.startsWith("-")) { neg = !neg; s = s.slice(1); }
  const n = Number(s);
  return Number.isFinite(n) ? (neg ? -n : n) : NaN;
}

const H = {
  code: /^(account )?(code|no\.?|number)$|nominal|^n\/c$|^ref|account code/i,
  name: /^account$|account name|^name$|description|^category|^account title/i,
  type: /type|class|group/i,
  debit: /debit|^dr$/i,
  credit: /credit|^cr$/i,
  balance: /balance|amount|^net|^total$|^value/i,
};

export interface Columns { header: number; code: number; name: number; type: number; debit: number; credit: number; balance: number }

/** Finds the header row and which column is which. Year-to-date columns win over the period's own when both are there. */
export function findColumns(rows: string[][]): Columns | null {
  for (let h = 0; h < Math.min(rows.length, 25); h++) {
    const r = rows[h].map((c) => c.toLowerCase());
    const pick = (re: RegExp, prefer?: RegExp) => {
      const all = r.map((c, i) => (re.test(c) ? i : -1)).filter((i) => i >= 0);
      if (!all.length) return -1;
      const p = prefer ? all.find((i) => prefer.test(r[i])) : undefined;
      return p ?? all[0];
    };
    const ytd = /ytd|year to date|year-to-date/i;
    const name = pick(H.name);
    const debit = pick(H.debit, ytd), credit = pick(H.credit, ytd), balance = pick(H.balance, ytd);
    if (name >= 0 && ((debit >= 0 && credit >= 0) || balance >= 0)) {
      const code = r.findIndex((c, i) => i !== name && H.code.test(c));
      const type = r.findIndex((c, i) => i !== name && H.type.test(c) && !H.debit.test(c) && !H.credit.test(c));
      return { header: h, code, name, type, debit, credit, balance: debit >= 0 && credit >= 0 ? -1 : balance };
    }
  }
  return null;
}

export function readRows(rows: string[][], c: Columns): TbRow[] {
  const out: TbRow[] = [];
  for (const r of rows.slice(c.header + 1)) {
    let name = (r[c.name] ?? "").trim();
    let code = c.code >= 0 ? (r[c.code] ?? "").trim() : "";
    // "200 - Sales" or "Sales (200)": the code inside the name.
    const m = name.match(/^(\d{3,5})\s*[-–:]\s*(.+)$/) ?? name.match(/^(.+?)\s*\((\d{3,5})\)$/);
    if (!code && m) { if (/^\d/.test(m[1])) { code = m[1]; name = m[2]; } else { name = m[1]; code = m[2]; } }
    if (!name || /^(total|totals|net (profit|loss)|grand total)\b/i.test(name)) continue;
    const net = c.balance >= 0 ? money(r[c.balance] ?? "") : money(r[c.debit] ?? "") - money(r[c.credit] ?? "");
    if (!Number.isFinite(net) || Math.abs(net) < 0.005) continue;
    out.push({ code, name, type: c.type >= 0 ? (r[c.type] ?? "").trim() : "", net: Math.round(net * 100) / 100 });
  }
  return out;
}

const RULES: [RegExp, Target][] = [
  [/current year (earnings|profit)|profit for the (year|period)|suspense|rounding/, "ignore"],
  [/dividend/, "dividendsPaid"],
  [/retained (earnings|profits?)|profit and loss (reserve|account)|p ?& ?l reserve|revenue reserve|accumulated (profits?|loss)|reserves? b\/?f|brought forward/, "reservesBroughtForward"],
  [/share capital|ordinary shares|called up|share premium/, "shareCapital"],
  [/corporation tax.*(payable|liabilit|owed|creditor|due)|ct (payable|liabilit)/, "corporationTaxOwed"],
  [/corporation tax/, "ignore"],
  [/director'?s?'? (loan|current account)|loan (from|to) director|\bdla\b/, "owedToDirectors"],
  [/(accumulated|acc\.?|provision for) (depreciation|amorti[sz]ation)|depreciation (b\/f|charge to date|reserve)/, "fixedAssets"],
  [/depreciation|amorti[sz]ation/, "depreciation"],
  [/interest (received|receivable|income|earned)|bank interest (received|income)/, "interestReceived"],
  [/cost of (sales|goods)|\bcogs\b|purchases|direct costs?|materials|subcontract|carriage in|opening stock|closing stock|stock (adjustment|movement)|cost of revenue/, "costOfSales"],
  [/(paye|nic?|national insurance|pension|wages|vat|corporation).*(payable|control|liabilit)|(payable|control) account|accounts payable|trade creditors|creditors?\b|accruals?\b|credit card|deferred income|hmrc|\bvat\b|\bpaye\b/, "creditorsWithin"],
  [/wages|salar|payroll|employer'?s? (ni|nic|national insurance)|staff|pension|directors'? (remuneration|salar|fees)|subsistence of staff/, "staffCosts"],
  [/(bank )?loan|mortgage|hire purchase|finance lease|bounce back|\bcbils\b/, "creditorsAfter"],
  [/provision/, "provisions"],
  [/prepayments?|accrued income/, "prepayments"],
  [/bank (fees|charges)|merchant (fees|charges)|card (fees|charges)|transaction fees/, "otherCharges"],
  [/paypal|stripe|wise\b|amazon.*(balance|reserve|account)|petty cash|\bcash\b|bank|current account|savings|deposit account|business account/, "cash"],
  [/debtors?|receivable|accounts receivable|trade debtors|vat refund/, "debtors"],
  [/^stock$|stock (on hand|in trade)|inventory|work in progress|\bwip\b/, "stock"],
  [/fixed assets?|equipment|computer|plant|machinery|vehicle|motor|furniture|fixtures|fittings|property|land|buildings?|intangible|goodwill|software (asset|licen)|tools/, "fixedAssets"],
  [/other (income|revenue)|sundry income|grants?\b|rebates?|commission (received|income)|insurance (claim|receipt)|gain on/, "otherIncome"],
  [/sales|turnover|revenue|fees (received|earned|income)|takings|income from|^income$/, "turnover"],
  [/rent|rates|insurance|telephone|phone|internet|software|subscription|advertis|marketing|travel|motor expenses|fuel|accountan|legal|professional|bank charges|fees|postage|stationery|office|repairs|cleaning|light|heat|utilities|training|entertain|sundry|general|expenses?|charges|website|hosting|consult|freight|carriage|packaging|commission/, "otherCharges"],
];

/** Account types as Xero, QuickBooks and FreeAgent name them. */
const TYPES: [RegExp, Target][] = [
  [/^(revenue|sales|income)$/, "turnover"],
  [/other income/, "otherIncome"],
  [/direct cost|cost of (sales|goods)/, "costOfSales"],
  [/depreciation/, "depreciation"],
  [/expense|overhead/, "otherCharges"],
  [/^bank$|^cash/, "cash"],
  [/inventory|stock/, "stock"],
  [/current asset|receivable/, "debtors"],
  [/prepayment/, "prepayments"],
  [/fixed asset|non-current asset/, "fixedAssets"],
  [/current liabilit|payable|credit card/, "creditorsWithin"],
  [/non-current liabilit|long term liabilit|^liabilit/, "creditorsAfter"],
  [/equity/, "reservesBroughtForward"],
];

/** Sage's standard UK nominal codes, used only when nothing else matches. */
function bySageCode(code: string): Target | null {
  if (!/^\d{4}$/.test(code)) return null;
  const n = Number(code);
  if (n >= 10 && n < 1000) return "fixedAssets";
  if (n < 1100) return "stock";
  if (n < 1200) return "debtors";
  if (n < 1300) return "cash";
  if (n >= 2100 && n < 2300) return "creditorsWithin";
  if (n >= 2300 && n < 2400) return "creditorsAfter";
  if (n >= 3000 && n < 3100) return "shareCapital";
  if (n >= 3100 && n < 3300) return "reservesBroughtForward";
  if (n >= 4000 && n < 4900) return "turnover";
  if (n >= 4900 && n < 5000) return "otherIncome";
  if (n >= 5000 && n < 7000) return "costOfSales";
  if (n >= 7000 && n < 7300) return "staffCosts";
  if (n >= 8000 && n < 8100) return "depreciation";
  if (n >= 7000 && n < 10000) return "otherCharges";
  return null;
}

export function matchRow(r: TbRow): TbMatch {
  const name = r.name.toLowerCase().replace(/\s+/g, " ");
  for (const [re, t] of RULES) if (re.test(name)) return { ...r, target: t, why: "name" };
  const type = r.type.toLowerCase();
  if (type) for (const [re, t] of TYPES) if (re.test(type)) return { ...r, target: t, why: "type" };
  const byCode = bySageCode(r.code);
  if (byCode) return { ...r, target: byCode, why: "code" };
  return { ...r, target: r.net > 0 ? "otherCharges" : "otherIncome", why: "guess" };
}

export interface TbRead { ok: boolean; problem?: string; rows: TbMatch[]; debits: number; credits: number }

export function readTrialBalance(text: string): TbRead {
  const rows = parseCsv(text);
  if (!rows.length) return { ok: false, problem: "The file is empty.", rows: [], debits: 0, credits: 0 };
  const c = findColumns(rows);
  if (!c) return { ok: false, problem: "Couldn't find the columns: the trial balance needs an account name column and either debit and credit columns or one balance column.", rows: [], debits: 0, credits: 0 };
  const read = readRows(rows, c).map(matchRow);
  if (!read.length) return { ok: false, problem: "No accounts with a balance were found under the headings.", rows: [], debits: 0, credits: 0 };
  const debits = read.filter((r) => r.net > 0).reduce((s, r) => s + r.net, 0);
  const credits = -read.filter((r) => r.net < 0).reduce((s, r) => s + r.net, 0);
  return { ok: true, rows: read, debits: Math.round(debits * 100) / 100, credits: Math.round(credits * 100) / 100 };
}

/** The figures the matches add up to, rounded to pounds as the return wants them. */
export function totals(rows: { target: Target; net: number }[]): Record<Exclude<Target, "ignore">, number> {
  const out = Object.fromEntries(TARGETS.filter((t) => t.key !== "ignore").map((t) => [t.key, 0])) as Record<Exclude<Target, "ignore">, number>;
  for (const r of rows) if (r.target !== "ignore") out[r.target] += SIGN[r.target] * r.net;
  for (const k of Object.keys(out) as (keyof typeof out)[]) out[k] = Math.round(out[k]);
  return out;
}
