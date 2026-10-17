/**
 * Real-figure micro-entity accounts: the balance check, and accounts built
 * from the tax engine's answer. Writes the iXBRL to the folder given as the
 * first argument so it can be validated with Arelle.
 *
 * Run: npx tsx tests/micro-accounts.test.ts <out-dir>
 */
import { writeFileSync, mkdirSync } from "fs";
import { compute, type ReturnFigures } from "../lib/tax/computation";
import { checkMicroAccounts, microAccounts, type MicroAccountsFigures } from "../lib/accounts/micro";
import { buildAccounts } from "../lib/ixbrl";

const out = process.argv[2]; if (out) mkdirSync(out, { recursive: true });
let pass = 0, fail = 0;
const t = (name: string, ok: boolean, got?: unknown) => { ok ? pass++ : fail++; console.log(ok ? "PASS" : "FAIL", name, ok ? "" : `→ ${JSON.stringify(got)}`); };

// An Amazon seller, year to 31 March 2025.
const figures: ReturnFigures = {
  periodFrom: "2024-04-01", periodTo: "2025-03-31", associatedCompanies: 0,
  pl: { turnover: 182_400, otherIncome: 1_250, interestReceived: 140, costOfSales: 104_300, staffCosts: 12_570, depreciation: 900, otherCharges: 38_620 },
  disallowable: { entertainment: 380, finesAndPenalties: 0, charitableDonations: 0, politicalDonations: 0, privateExpenses: 0, capitalItemsExpensed: 0, lossOnDisposals: 0, other: 0 },
  profitOnDisposals: 0,
  capitalAllowances: { additions: [{ description: "Laptop and label printer", kind: "plantNew", cost: 1_850, date: "2024-06-12" }], disposals: [], mainPoolBroughtForward: 0, specialPoolBroughtForward: 0 },
  tradingLossesBroughtForward: 0, qualifyingDonations: 0,
};
const tax = compute(figures);
// Accounts profit 182,400 + 1,250 + 140 − 104,300 − 12,570 − 900 − 38,620 = 27,400.
// Adjusted: 27,400 − 140 + 900 + 380 = 28,540; less full expensing 1,850 → 26,690 trading; + 140 interest = 26,830 at 19% = 5,097.70.
t("accounts profit 27,400", tax.accountingProfit === 27_400, tax.accountingProfit);
t("chargeable 26,830", tax.chargeableProfits === 26_830, tax.chargeableProfits);
t("tax 5,097.70", Math.abs(tax.taxChargeable - 5_097.70) < 0.005, tax.taxChargeable);

// Balance sheet. Profit after tax 27,400 − 5,098 = 22,302. Reserves b/f 8,410; dividends 15,000 → c/f 15,712.
// Capital and reserves 100 + 15,712 = 15,812.
// Assets: fixed 2,600; stock 9,800; debtors 3,150; cash 14,960 = 30,510.
// Creditors within: suppliers/VAT 6,400 + director 3,200 + CT 5,098 = 14,698. Net assets 30,510 − 14,698 = 15,812. ✓
const ok: MicroAccountsFigures = {
  companyName: "Brightshelf Trading Ltd", companyNo: "15123456", utr: "8596148860",
  periodFrom: "2024-04-01", periodTo: "2025-03-31", principalActivities: "Online retail of household goods",
  pl: figures.pl, taxCharge: tax.taxChargeable,
  balanceSheet: { fixedAssets: 2_600, stock: 9_800, debtors: 3_150, cash: 14_960, prepayments: 0, creditorsWithin: 6_400, owedToDirectors: 3_200,
    creditorsAfter: 0, provisions: 0, shareCapital: 100, shareCapitalNotPaid: 0, reservesBroughtForward: 8_410, dividendsPaid: 15_000, employees: 2 },
  director: "Amina Khan", approvedOn: "2025-07-15",
  prior: { from: "2023-04-01", to: "2024-03-31", figures: {
    turnover: 141_000, otherIncome: 600, rawMaterials: 83_100, staffCosts: 12_570, depreciation: 700, otherCharges: 33_950,
    profitBeforeTax: 11_280, tax: 2_143, shareCapitalNotPaid: 0, fixedAssets: 1_650, currentAssets: 19_420, prepayments: 0,
    creditorsWithin: 12_560, creditorsAfter: 0, provisions: 0, accruals: 0, employees: 2 } },
};
const c = checkMicroAccounts(ok);
t("balanced balance sheet passes", c.problems.length === 0, c.problems);
t("net assets 15,812", c.netAssets === 15_812, c.netAssets);
t("reserves carried forward 15,712", c.reservesCarriedForward === 15_712, c.reservesCarriedForward);

const off = checkMicroAccounts({ ...ok, balanceSheet: { ...ok.balanceSheet, cash: 14_000 } });
t("£960 short is caught, with the amount", off.problems.some((p) => p.includes("doesn't balance") && p.includes("£960")), off.problems);
const div = checkMicroAccounts({ ...ok, balanceSheet: { ...ok.balanceSheet, reservesBroughtForward: -10_000, dividendsPaid: 15_000, cash: 14_960 - 18_410 } });
t("dividends beyond available profits warned", div.warnings.some((w) => w.includes("Dividends")), div);
t("approval before the year end refused", checkMicroAccounts({ ...ok, approvedOn: "2025-03-31" }).problems.length > 0);

const accounts = microAccounts(ok);
const html = buildAccounts(accounts);
t("profit and loss in micro-entity format", html.includes("Cost of raw materials and consumables") && html.includes("Other charges") && !html.includes("Gross profit"));
t("raw materials tagged", html.includes('name="core:RawMaterialsConsumablesUsed" contextRef="D"'));
t("comparatives tagged against the prior period", html.includes('name="core:TurnoverRevenue" contextRef="PD"') && html.includes('name="core:FixedAssets" contextRef="PE"'));
t("creditors carry the within-one-year dimension", html.includes('name="core:Creditors" contextRef="EW1"') && html.includes('name="core:Creditors" contextRef="PEW1"'));
t("tax line is the computation's tax, rounded", html.includes(">5,098<"));
t("England and Wales for an 8-digit number", html.includes("(England and Wales)"));
t("Scotland for an SC number", buildAccounts(microAccounts({ ...ok, companyNo: "SC123456" })).includes("(Scotland)"));
if (out) writeFileSync(`${out}/micro_full.xhtml`, html);

// First-year accounts: no comparative column at all, and a creditor due after one year.
const first = microAccounts({ ...ok, prior: undefined, balanceSheet: { ...ok.balanceSheet, creditorsAfter: 5_000, cash: 14_960 + 5_000 } });
const firstHtml = buildAccounts(first);
t("first accounts: no prior context", !firstHtml.includes('contextRef="PD"') && !firstHtml.includes('id="PD"'));
t("creditors after one year tagged with its dimension", firstHtml.includes('name="core:Creditors" contextRef="EA1"'));
t("first accounts balance with the loan", checkMicroAccounts({ ...ok, prior: undefined, balanceSheet: { ...ok.balanceSheet, creditorsAfter: 5_000, cash: 14_960 + 5_000 } }).problems.length === 0);
if (out) writeFileSync(`${out}/micro_first.xhtml`, firstHtml);

// A loss-making year: brackets and sign="-".
const lossFigures: ReturnFigures = { ...figures, pl: { ...figures.pl, otherCharges: 70_000 } };
const lossTax = compute(lossFigures);
const lossAcc = { ...ok, pl: lossFigures.pl, taxCharge: lossTax.taxChargeable };
const lc = checkMicroAccounts(lossAcc);
// The loss is funded the usual way for a small company: the director lends the shortfall.
const lossBalanced = { ...lossAcc, balanceSheet: { ...ok.balanceSheet, owedToDirectors: ok.balanceSheet.owedToDirectors + (lc.netAssets - lc.capitalAndReserves) } };
t("loss year balances after adjusting cash", checkMicroAccounts(lossBalanced).problems.length === 0, checkMicroAccounts(lossBalanced).problems);
const lossHtml = buildAccounts(microAccounts(lossBalanced));
t("loss shown in brackets with sign", /Loss before tax[\s\S]*?\(<ix:nonFraction name="core:ProfitLossOnOrdinaryActivitiesBeforeTax"[^>]*sign="-"/.test(lossHtml));
if (out) writeFileSync(`${out}/micro_loss.xhtml`, lossHtml);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
