import { readTrialBalance, totals, money, parseCsv, findColumns } from "../lib/trial-balance";

let passed = 0, failed = 0;
const t = (name: string, ok: boolean, got?: unknown) => { if (ok) passed++; else { failed++; console.log("FAIL", name, got === undefined ? "" : JSON.stringify(got)); } };
const eq = (name: string, got: unknown, want: unknown) => t(name, JSON.stringify(got) === JSON.stringify(want), { got, want });

console.log("— amounts");
eq("plain", money("1,234.56"), 1234.56);
eq("brackets", money("(1,234.56)"), -1234.56);
eq("pound and minus", money("-£12"), -12);
eq("Cr suffix", money("12.00 Cr"), -12);
eq("dash", money("-"), 0);

console.log("— Xero, with title rows and year-to-date columns");
const xero = `Trial Balance
Brightshelf Trading Ltd
As at 31 March 2025

Account,Account Code,Account Type,Debit,Credit,YTD Debit,YTD Credit
Sales,200,Revenue,,10000.00,,182400.00
Other Revenue,260,Revenue,,,,1250.00
Interest Income,270,Revenue,,,,140.00
Cost of Goods Sold,310,Direct Costs,,,104300.00,
Wages and Salaries,477,Expense,,,12570.00,
Depreciation,416,Expense,,,900.00,
Advertising,400,Expense,,,20000.00,
Entertainment,420,Expense,,,380.00,
Bank Fees,404,Expense,,,18240.00,
Business Bank Account,090,Bank,,,23450.00,
Accounts Receivable,610,Current Asset,,,6000.00,
Office Equipment,710,Fixed Asset,,,8000.00,
Less Accumulated Depreciation on Office Equipment,711,Fixed Asset,,,,2450.00
Accounts Payable,800,Current Liability,,,,5200.00
VAT,820,Current Liability,,,,3100.00
Director's Loan Account,835,Current Liability,,,,1500.00
Share Capital,970,Equity,,,,100.00
Retained Earnings,960,Equity,,,,3700.00
Dividends,980,Equity,,,6000.00,
Total,,,,,199840.00,199840.00`;
const x = readTrialBalance(xero);
t("read", x.ok, x.problem);
const xt = totals(x.rows);
eq("turnover", xt.turnover, 182400);
eq("other income", xt.otherIncome, 1250);
eq("interest", xt.interestReceived, 140);
eq("cost of sales", xt.costOfSales, 104300);
eq("staff", xt.staffCosts, 12570);
eq("depreciation", xt.depreciation, 900);
eq("other expenses", xt.otherCharges, 38620);
eq("fixed assets net", xt.fixedAssets, 5550);
eq("cash", xt.cash, 23450);
eq("debtors", xt.debtors, 6000);
eq("creditors within a year", xt.creditorsWithin, 8300);
eq("owed to directors", xt.owedToDirectors, 1500);
eq("share capital", xt.shareCapital, 100);
eq("reserves b/f", xt.reservesBroughtForward, 3700);
eq("dividends", xt.dividendsPaid, 6000);
eq("debits = credits", x.debits, x.credits);
t("total row skipped", !x.rows.some((r) => /total/i.test(r.name)));

console.log("— QuickBooks, one balance column, semicolons");
const qb = `Account;Balance
Sales income;-50,000.00
Purchases;20,000.00
Salaries;(0)
Rent or lease payments;6,000.00
Current account;12,345.67
"Trade debtors, UK";1,000
PAYE and NI payable;-800
Corporation Tax payable;-3,000
Corporation Tax;3,000`;
const q = readTrialBalance(qb);
t("read", q.ok, q.problem);
const qt = totals(q.rows);
eq("turnover", qt.turnover, 50000);
eq("cost of sales", qt.costOfSales, 20000);
eq("other expenses (rent)", qt.otherCharges, 6000);
eq("cash rounded", qt.cash, 12346);
eq("debtors with a comma in the name", qt.debtors, 1000);
eq("PAYE payable is a creditor, not staff costs", qt.creditorsWithin, 800);
eq("CT payable", qt.corporationTaxOwed, 3000);
t("the tax charge is left out", q.rows.find((r) => r.name === "Corporation Tax")?.target === "ignore");

console.log("— Sage nominal codes, tabs");
const sage = "N/C\tName\tDebit\tCredit\n4000\tSales Type A\t\t9,000.00\n5000\tMaterials Purchased\t3,000.00\t\n7000\tGross Wages\t2,000.00\t\n7502\tTelephone\t150.00\t\n1200\tBank Current Account\t3,850.00\t\n";
const sg = readTrialBalance(sage);
const st = totals(sg.rows);
eq("sage turnover", st.turnover, 9000);
eq("sage materials", st.costOfSales, 3000);
eq("sage wages", st.staffCosts, 2000);
eq("sage phone", st.otherCharges, 150);
eq("sage bank", st.cash, 3850);

console.log("— code inside the name, and unknown accounts");
const odd = parseCsv("Account,Debit,Credit\n200 - Sales,,500\nZebra crossings,40,\nWidgets received,,25\n");
const oc = findColumns(odd);
t("columns found", Boolean(oc));
const o = readTrialBalance("Account,Debit,Credit\n200 - Sales,,500\nZebra crossings,40,\nWidgets received,,25\n");
eq("code split from the name", o.rows[0].code, "200");
eq("unknown debit guessed as an expense", [o.rows[1].target, o.rows[1].why], ["otherCharges", "guess"]);
eq("unknown credit guessed as other income", [o.rows[2].target, o.rows[2].why], ["otherIncome", "guess"]);

console.log("— refusals");
t("no columns", !readTrialBalance("hello\nworld").ok);
t("empty", !readTrialBalance("").ok);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
