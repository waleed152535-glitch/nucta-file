/**
 * Reading last year's figures from accounts filed at Companies House: Nucta
 * File's own accounts read back exactly, and another program's filleted
 * micro-entity accounts (balance sheet only), as Companies House hold them.
 */
import { readFileSync } from "node:fs";
import { compute, type ReturnFigures } from "../lib/tax/computation";
import { microAccounts } from "../lib/accounts/micro";
import { buildAccounts } from "../lib/ixbrl";
import { factValue, priorFromAccounts, readFacts } from "../lib/ch-accounts-read";

let passed = 0, failed = 0;
const t = (name: string, ok: boolean, got?: unknown) => { if (ok) passed++; else { failed++; console.log("FAIL", name, got === undefined ? "" : JSON.stringify(got)); } };
const eq = (name: string, got: unknown, want: unknown) => t(name, JSON.stringify(got) === JSON.stringify(want), { got, want });

console.log("— numbers as tagged");
eq("grouped", factValue("19,420", "ixt2:numdotdecimal", null, null), 19420);
eq("pence", factValue("1,234.56", "ixt4:num-dot-decimal", null, null), 1234.56);
eq("a dash means nothing", factValue("-", "ixt2:fixedzero", null, null), 0);
eq("zero dash", factValue("–", "ixt:zerodash", null, null), 0);
eq("thousands", factValue("12", "ixt2:numdotdecimal", "3", null), 12000);
eq("signed", factValue("500", null, null, "-"), -500);
eq("comma decimals", factValue("1.234,50", "ixt2:numcommadecimal", null, null), 1234.5);
eq("words aren't numbers", factValue("n/a", "ixt2:numdotdecimal", null, null), null);

console.log("— Nucta File's own accounts, read back");
const figures: ReturnFigures = {
  periodFrom: "2024-04-01", periodTo: "2025-03-31", associatedCompanies: 0,
  pl: { turnover: 182_400, otherIncome: 1_250, interestReceived: 140, costOfSales: 104_300, staffCosts: 12_570, depreciation: 900, otherCharges: 38_620 },
  disallowable: { entertainment: 380, finesAndPenalties: 0, charitableDonations: 0, politicalDonations: 0, privateExpenses: 0, capitalItemsExpensed: 0, lossOnDisposals: 0, other: 0 },
  profitOnDisposals: 0, capitalAllowances: { additions: [], disposals: [], mainPoolBroughtForward: 0, specialPoolBroughtForward: 0 }, tradingLossesBroughtForward: 0, qualifyingDonations: 0,
};
const a = microAccounts({
  companyName: "Brightshelf Trading Ltd", companyNo: "15123456", utr: "8596148860", periodFrom: "2024-04-01", periodTo: "2025-03-31", principalActivities: "Online retail",
  pl: figures.pl, taxCharge: compute(figures).taxChargeable,
  balanceSheet: { fixedAssets: 2_600, stock: 9_800, debtors: 3_150, cash: 14_960, prepayments: 500, creditorsWithin: 6_400, owedToDirectors: 3_200, creditorsAfter: 1_000, provisions: 0, shareCapital: 100, shareCapitalNotPaid: 0, reservesBroughtForward: 8_410, dividendsPaid: 15_000, employees: 2 },
  director: "Amina Khan", approvedOn: "2025-07-15",
  prior: { from: "2023-04-01", to: "2024-03-31", figures: { turnover: 141_000, otherIncome: 600, rawMaterials: 83_100, staffCosts: 12_570, depreciation: 700, otherCharges: 33_950, profitBeforeTax: 11_280, tax: 2_143, shareCapitalNotPaid: 0, fixedAssets: 1_650, currentAssets: 19_420, prepayments: 0, creditorsWithin: 12_560, creditorsAfter: 0, provisions: 0, accruals: 0, employees: 2 } },
});
const own = priorFromAccounts(buildAccounts(a), "2025-03-31");
eq("the year read is the one made up to", [own.prior.from, own.prior.to], ["2024-04-01", "2025-03-31"]);
const f = own.prior.figures;
eq("profit and loss read back", [f.turnover, f.otherIncome, f.rawMaterials, f.staffCosts, f.depreciation, f.otherCharges, f.profitBeforeTax, f.tax], [a.turnover, a.otherIncome, a.micro!.rawMaterials, a.micro!.staffCosts, a.micro!.depreciation, a.micro!.otherCharges, a.profitBeforeTax, a.taxCharge]);
eq("balance sheet read back", [f.fixedAssets, f.currentAssets, f.prepayments, f.creditorsWithin, f.creditorsAfter, f.provisions, f.accruals], [a.fixedAssets, a.currentAssets, a.prepayments, a.creditorsWithin, a.creditorsAfter, a.provisions, a.accruals]);
eq("employees", f.employees, 2);
t("the comparative column isn't mistaken for this year", f.fixedAssets !== 1_650 && f.currentAssets !== 19_420);
eq("micro-entity shape recognised", own.microShape, true);
t("the prior year can be read too, by its date", priorFromAccounts(buildAccounts(a), "2024-03-31").prior.figures.fixedAssets === 1_650);

console.log("— another program's filleted accounts");
const foreign = readFileSync(new URL("./fixtures/ch-filleted-micro.xhtml", import.meta.url), "utf8");
const r = priorFromAccounts(foreign, "2024-03-31");
eq("dates", [r.prior.from, r.prior.to], ["2023-04-01", "2024-03-31"]);
eq("balance sheet", [r.prior.figures.fixedAssets, r.prior.figures.currentAssets, r.prior.figures.prepayments, r.prior.figures.creditorsWithin, r.prior.figures.creditorsAfter], [1_650, 19_420, 0, 12_560, 0]);
eq("no profit and loss: zero, and not found", [r.prior.figures.turnover, r.found.includes("turnover"), r.found.includes("profitBeforeTax")], [0, false, false]);
eq("employees", r.prior.figures.employees, 2);
eq("net assets and equity", [r.netAssets, r.equity], [8_510, 8_510]);
eq("when the date asked for isn't there, the latest is used", priorFromAccounts(foreign, "2025-03-31").prior.to, "2024-03-31");
eq("facts read, with their contexts", readFacts(foreign).facts.length, 14);

console.log("— small-company accounts: prepayments are inside debtors");
const small = foreign
  .replace('format="ixt2:fixedzero">-</ix:nonFraction>', 'format="ixt2:numdotdecimal">800</ix:nonFraction>');
const s = priorFromAccounts(small, "2024-03-31");
eq("counted once, not twice", [s.prior.figures.prepayments, s.microShape], [0, false]);

let threw = false;
try { priorFromAccounts("<html><body>not xbrl", null); } catch { threw = true; }
t("broken documents are refused", threw);

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
