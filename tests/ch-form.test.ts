import { normaliseReturnData, toCompanyReturnInput } from "../lib/return-model";
import { prepareReturn } from "../lib/filing";
import { SCOPE_QUESTIONS } from "../lib/tax/scope";
import { companiesHouseCopy } from "../lib/accounts/ch-form";
import { parseMoney } from "../app/(app)/returns/[id]/fields";

let passed = 0, failed = 0;
const eq = (name: string, got: unknown, want: unknown) => { if (JSON.stringify(got) === JSON.stringify(want)) passed++; else { failed++; console.log("FAIL", name, JSON.stringify({ got, want })); } };

console.log("— Companies House form from a return (a small trading company with a loss)");
const scope = Object.fromEntries(SCOPE_QUESTIONS.map((q) => [q.key, q.expect]));
const d = normaliseReturnData({
  activity: "Online retail", scope,
  pl: { turnover: 14410, otherIncome: 104, interestReceived: 0, costOfSales: 13814, staffCosts: 0, depreciation: 0, otherCharges: 863 },
  disallowable: { entertainment: 0, finesAndPenalties: 0, charitableDonations: 0, politicalDonations: 0, privateExpenses: 0, capitalItemsExpensed: 0, lossOnDisposals: 0, other: 320 },
  balanceSheet: { fixedAssets: 0, stock: 0, debtors: 0, cash: 2910, prepayments: 0, creditorsWithin: 3018, owedToDirectors: 0, creditorsAfter: 0, provisions: 0, shareCapital: 100, shareCapitalNotPaid: 0, reservesBroughtForward: -45, dividendsPaid: 0, employees: 1 },
  participators: [],
  prior: { from: "2024-01-06", to: "2025-01-31", figures: { turnover: 0, otherIncome: 0, rawMaterials: 0, staffCosts: 0, depreciation: 0, otherCharges: 45, profitBeforeTax: -45, tax: 0, shareCapitalNotPaid: 0, fixedAssets: 0, currentAssets: 55, prepayments: 0, creditorsWithin: 0, creditorsAfter: 0, provisions: 0, accruals: 0, employees: 1 } },
  director: "A Director", approvedOn: "2026-10-22", declarantName: "A Director", declarantStatus: "Director",
} as never);
const p = prepareReturn({ ...toCompanyReturnInput({ name: "EXAMPLE LTD", companyNo: "15393003", utr: "1234567880" } as never, "2025-02-01", "2026-01-31", d), today: "2026-10-22" });
eq("return ok", p.ok, true);
const f = p.companiesHouse!;
const row = (label: string) => f.rows.find((r) => r.label === label)!;
eq("current assets", [row("Total current assets").now, row("Total current assets").then], [2910, 55]);
eq("creditors include the tax", [row("Creditors: amounts falling due within one year").now, row("Creditors: amounts falling due within one year").then], [3048, 0]);
eq("net current liabilities", [row("Net current assets (liabilities)").now, row("Net current assets (liabilities)").then], [-138, 55]);
eq("net assets", [row("Total net assets (liabilities)").now, row("Total net assets (liabilities)").then], [-138, 55]);
eq("capital and reserves", row("Capital and reserves").now, -138);
eq("employees", [row("Average number of employees").now, row("Average number of employees").then], [1, 1]);
eq("thirteen boxes, in the form's order", f.rows.length, 13);
eq("approval carried", [f.director, f.approvedOn], ["A Director", "2026-10-22"]);
const ch = companiesHouseCopy(p.accountsHtml!);
eq("Companies House copy leaves out the profit and loss account", ch.includes("Profit and loss account"), false);
eq("and says so (s444)", ch.includes("section 444"), true);
eq("keeps the balance sheet", ch.includes("Balance sheet as at"), true);

console.log("— amounts as typed or pasted");
for (const [v, want] of [["182,400", 182400], ["£1,250", 1250], ["-45", -45], ["−45", -45], ["(45)", -45], ["45-", -45], ["£-1,000", -1000], ["", 0], ["abc", 0]] as const) eq(`"${v}"`, parseMoney(v), want);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
