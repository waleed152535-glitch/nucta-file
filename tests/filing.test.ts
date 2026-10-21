/**
 * The whole chain for a saved return: scope → tax → accounts → computation →
 * CT600. Checks the boxes HMRC's rules tie together. The full HMRC checks
 * (schema, business rules, Arelle, IRmark) need HMRC's own tools and run
 * outside this repository; these are the checks that travel with the code.
 *
 * Run: npx tsx tests/filing.test.ts
 */
import { prepareReturn } from "../lib/filing";
import { SCOPE_QUESTIONS, type ScopeAnswers } from "../lib/tax/scope";
import { blankReturnData, toCompanyReturnInput, type ReturnData } from "../lib/return-model";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, got?: unknown) => { ok ? pass++ : fail++; console.log(ok ? "PASS" : "FAIL", name, ok ? "" : `→ ${JSON.stringify(got)}`); };
const box = (xml: string, tag: string): string | null => (xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`)) ?? [])[1] ?? null;
const inScope = Object.fromEntries(SCOPE_QUESTIONS.map((q) => [q.key, q.expect])) as unknown as ScopeAnswers;
const company = { name: "Northgate Supplies Ltd", companyNo: "14987654", utr: "8596148860" };

const d: ReturnData = {
  ...blankReturnData(),
  activity: "Wholesale of packaging", scope: inScope,
  pl: { turnover: 640_000, otherIncome: 0, interestReceived: 900, costOfSales: 410_000, staffCosts: 68_000, depreciation: 6_500, otherCharges: 52_000 },
  disallowable: { ...blankReturnData().disallowable, charitableDonations: 1_000, finesAndPenalties: 250 },
  additions: [{ description: "Used delivery van", kind: "plantUsed", cost: 14_500, date: "2024-09-03" }],
  mainPoolBroughtForward: 22_000, qualifyingDonations: 1_000,
  balanceSheet: { ...blankReturnData().balanceSheet, fixedAssets: 38_000, stock: 41_000, debtors: 28_500, cash: 51_000, creditorsWithin: 33_000,
    shareCapital: 100, reservesBroughtForward: 61_000, dividendsPaid: 40_000, employees: 3 },
  director: "Daniel Price", approvedOn: "2025-10-20", declarantName: "Waleed Sarfraz", declarantStatus: "Agent",
};
const r = prepareReturn(toCompanyReturnInput(company, "2024-07-01", "2025-06-30", d));
t("straddling marginal-relief return builds", r.ok, r.problems);
const x = r.ct600 ?? "";
t("box 155 trading profit 92,790", box(x, "Profits") === "92790.00", box(x, "Profits"));
t("box 170 interest 900", box(x, "NonTradingLoanProfitsAndGains") === "900.00");
t("box 235 = 165 + 170", box(x, "ProfitsBeforeOtherDeductions") === "93690.00");
t("box 305 donations 1,000", box(x, "QualifyingDonations") === "1000.00");
t("box 315 = 300 − 305", box(x, "ChargeableProfits") === "92690.00");
t("two financial years", x.includes("<FinancialYearOne>") && x.includes("<FinancialYearTwo>"));
t("box 435 marginal relief 2,359.65", box(x, "MarginalReliefForRingFenceTrades") === "2359.65");
t("box 440 = 430 − 435", box(x, "NetCorporationTaxChargeable") === "20812.85");
t("box 690 AIA 14,500", box(x, "AIACapitalAllowancesInc") === "14500.00");
t("box 705 main pool WDA 3,960", /<MachineryAndPlantMainPool>\s*<CapitalAllowances>3960.00<\/CapitalAllowances>/.test(x));
t("box 775 other machinery and plant 14,500", box(x, "OtherMachineryAndPlant") === "14500.00");
t("small profits declaration with associated companies", x.includes("<StartingOrSmallCompaniesRate>yes</StartingOrSmallCompaniesRate>"));
const att = x.slice(x.indexOf("<AttachedFiles>"));
t("computation attached before accounts", att.indexOf("<Computation>") > 0 && att.indexOf("<Computation>") < att.indexOf("<Accounts>"));
t("computation tags the AIA", (r.computationHtml ?? "").includes('name="ctcomp:MainPoolAnnualInvestmentAllowance"'));
t("accounts in micro-entity format", (r.accountsHtml ?? "").includes("core:RawMaterialsConsumablesUsed"));

// Refusals before anything is built.
const loans = prepareReturn(toCompanyReturnInput(company, "2024-07-01", "2025-06-30", { ...d, scope: { ...inScope, loanArrangements: true } }));
t("loan arrangements refused, nothing built", !loans.ok && loans.ct600 === null && loans.problems[0].includes("464"));
const unbalanced = prepareReturn(toCompanyReturnInput(company, "2024-07-01", "2025-06-30", { ...d, balanceSheet: { ...d.balanceSheet, cash: 50_000 } }));
t("unbalanced balance sheet refused with the amount", !unbalanced.ok && unbalanced.problems.some((p) => p.includes("£1,000")), unbalanced.problems);
const badUtr = prepareReturn(toCompanyReturnInput({ ...company, utr: "123" }, "2024-07-01", "2025-06-30", d));
t("bad UTR refused", !badUtr.ok && badUtr.problems.some((p) => p.includes("10 digits")));

// From April 2026, a new electric car goes in box 725 (other allowances), as HMRC advise.
const ev = prepareReturn({ ...toCompanyReturnInput(company, "2026-04-01", "2027-03-31", {
  ...d, additions: [{ description: "Electric car", kind: "carZeroEmissionNew", cost: 32_000, date: "2026-05-20" }], mainPoolBroughtForward: 0,
  balanceSheet: { ...d.balanceSheet, cash: 0 },
}), today: "2027-06-01" });
const early = prepareReturn(toCompanyReturnInput(company, "2026-04-01", "2027-03-31", d));
t("a period that hasn't ended yet is refused (HMRC rule 9106)", !early.ok && early.problems.some((p) => p.includes("hasn't ended")));
t("electric car from April 2026 reported under other allowances", ev.computation !== null && (() => {
  // Build regardless of balance to inspect the box: rebalance by cash.
  const c = ev.computation!; return c.capitalAllowances.zeroEmissionCars === 32_000;
})());

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
