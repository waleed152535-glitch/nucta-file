/**
 * Worked examples for the tax engine. Every expected figure is worked out by
 * hand from the rules (shown in the comment beside it), not copied from the
 * engine's own output.
 *
 * Run: npx tsx tests/tax-engine.test.ts
 */
import { compute, figureProblems, type ReturnFigures } from "../lib/tax/computation";
import { capitalAllowances, mainPoolRate } from "../lib/tax/capital-allowances";
import { isTwelveMonths, splitByFinancialYear, yearFraction } from "../lib/tax/dates";
import { scopeProblems, SCOPE_QUESTIONS, type ScopeAnswers } from "../lib/tax/scope";
import { taxProblems, type Ct600Input } from "../lib/ct600-xml";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, got?: unknown) => {
  ok ? pass++ : fail++;
  console.log(ok ? "PASS" : "FAIL", name, ok ? "" : `→ got ${JSON.stringify(got)}`);
};
const eq = (name: string, got: number, want: number) => t(`${name} = ${want}`, Math.abs(got - want) < 0.005, got);

const base = (o: Partial<ReturnFigures> = {}): ReturnFigures => ({
  periodFrom: "2024-04-01", periodTo: "2025-03-31", associatedCompanies: 0,
  pl: { turnover: 0, otherIncome: 0, interestReceived: 0, costOfSales: 0, staffCosts: 0, depreciation: 0, otherCharges: 0 },
  disallowable: { entertainment: 0, finesAndPenalties: 0, charitableDonations: 0, politicalDonations: 0, privateExpenses: 0, capitalItemsExpensed: 0, lossOnDisposals: 0, other: 0 },
  profitOnDisposals: 0,
  capitalAllowances: { additions: [], disposals: [], mainPoolBroughtForward: 0, specialPoolBroughtForward: 0 },
  tradingLossesBroughtForward: 0, qualifyingDonations: 0,
  ...o,
});
/** A company whose adjusted profit is simply `p`. */
const profitOf = (p: number, o: Partial<ReturnFigures> = {}) => base({ pl: { ...base().pl, turnover: p }, ...o });

console.log("— dates");
t("1 Apr 2024 – 31 Mar 2025 is twelve months", isTwelveMonths("2024-04-01", "2025-03-31"));
t("1 Feb 2024 – 31 Jan 2025 (366 days, includes 29 Feb) is twelve months", isTwelveMonths("2024-02-01", "2025-01-31"));
t("29 Feb 2024 – 28 Feb 2025 is twelve months", isTwelveMonths("2024-02-29", "2025-02-28"));
t("1 Apr 2025 – 30 Sep 2025 is not", !isTwelveMonths("2025-04-01", "2025-09-30"));
eq("6-month fraction 183/365", yearFraction("2025-04-01", "2025-09-30"), 183 / 365);
const split = splitByFinancialYear("2024-07-01", "2025-06-30");
t("1 Jul 2024 – 30 Jun 2025 splits 274 days FY2024 + 91 days FY2025", split.length === 2 && split[0].fy === 2024 && split[0].days === 274 && split[1].fy === 2025 && split[1].days === 91, split);

console.log("— simple small company");
{
  // Turnover 95,000; cost of sales 60,000; other charges 23,000 (incl. 500 entertaining); depreciation 1,000.
  // Accounts profit 11,000. Add back depreciation 1,000 and entertaining 500 → 12,500.
  // New laptop £1,200 → full expensing 1,200 → trading profit 11,300. 19% → £2,147.00.
  const r = compute(base({
    pl: { ...base().pl, turnover: 95_000, costOfSales: 60_000, otherCharges: 23_000, depreciation: 1_000 },
    disallowable: { ...base().disallowable, entertainment: 500 },
    capitalAllowances: { additions: [{ description: "Laptop", kind: "plantNew", cost: 1_200, date: "2024-09-01" }], disposals: [], mainPoolBroughtForward: 0, specialPoolBroughtForward: 0 },
  }));
  eq("accounts profit", r.accountingProfit, 11_000);
  eq("adjusted trading profit", r.adjustedTradingProfit, 12_500);
  eq("full expensing", r.capitalAllowances.fullExpensing, 1_200);
  eq("trading profit", r.tradingProfit, 11_300);
  eq("tax at 19%", r.taxChargeable, 2_147);
  t("rate 19, small profits rate claimed", r.rate === 19 && r.smallProfitsRateOrMarginalRelief);
}

console.log("— marginal relief");
{
  // 100,000 for 12 months: 25% = 25,000; MR = 3/200 × (250,000 − 100,000) = 2,250; tax 22,750 (accepted by HMRC on build 30).
  const r = compute(profitOf(100_000));
  eq("gross tax", r.corporationTax, 25_000); eq("marginal relief", r.marginalRelief, 2_250); eq("tax", r.taxChargeable, 22_750);
  t("rate 25 with marginal relief", r.rate === 25 && r.smallProfitsRateOrMarginalRelief);
}
{
  // Straddling 1 April, same profits: the split must not change the answer.
  const r = compute(profitOf(100_000, { periodFrom: "2024-07-01", periodTo: "2025-06-30" }));
  t("straddling period has two financial years", r.years.length === 2);
  eq("straddling: marginal relief still", r.marginalRelief, 2_250); eq("straddling: tax still", r.taxChargeable, 22_750);
}
{
  // 366-day twelve-month period: full limits, not 366/365 of them.
  const r = compute(profitOf(100_000, { periodFrom: "2024-02-01", periodTo: "2025-01-31" }));
  eq("leap-year twelve months: marginal relief", r.marginalRelief, 2_250);
}
{
  // Six months, 183 days, profit 30,000. Upper limit 250,000 × 183/365 = 125,342.47; lower 25,068.49.
  // MR = 0.015 × (125,342.47 − 30,000) = 1,430.14. Tax 7,500 − 1,430.14 = 6,069.86.
  const r = compute(profitOf(30_000, { periodFrom: "2025-04-01", periodTo: "2025-09-30" }));
  eq("short period marginal relief", r.marginalRelief, 1_430.14); eq("short period tax", r.taxChargeable, 6_069.86);
}
{
  // One associated company: limits halve to 25,000 / 125,000. Profit 30,000 → MR 0.015 × 95,000 = 1,425; tax 6,075.
  const r = compute(profitOf(30_000, { associatedCompanies: 1 }));
  eq("associated: marginal relief", r.marginalRelief, 1_425); eq("associated: tax", r.taxChargeable, 6_075);
}
{
  const r = compute(profitOf(50_000)); eq("exactly the lower limit: 19%", r.taxChargeable, 9_500);
  const s = compute(profitOf(250_000)); eq("exactly the upper limit: 25%, no relief", s.taxChargeable, 62_500);
}

console.log("— capital allowances");
eq("main rate before 1 April 2026", mainPoolRate("2025-04-01", "2026-03-31"), 18);
eq("main rate from 1 April 2026", mainPoolRate("2026-04-01", "2027-03-31"), 14);
eq("hybrid, GOV.UK's example (1 Jan – 31 Dec 2026)", mainPoolRate("2026-01-01", "2026-12-31"), 14.99);
{
  const p = { additions: [], disposals: [], specialPoolBroughtForward: 0 };
  const r = capitalAllowances({ periodFrom: "2026-01-01", periodTo: "2026-12-31", ...p, mainPoolBroughtForward: 10_000 });
  eq("hybrid WDA on 10,000 (14.99%)", r.main.allowance, 1_499); eq("pool carried forward", r.main.carriedForward, 8_501);
}
{
  // Used van 5,000 → AIA. Pool 20,000 at 14% → 2,800.
  const r = capitalAllowances({ periodFrom: "2026-04-01", periodTo: "2027-03-31", mainPoolBroughtForward: 20_000, specialPoolBroughtForward: 0,
    additions: [{ description: "Used van", kind: "plantUsed", cost: 5_000, date: "2026-05-01" }], disposals: [] });
  eq("AIA on used van", r.aia, 5_000); eq("WDA 14% of 20,000", r.main.allowance, 2_800); eq("total", r.totalAllowances, 7_800);
}
{
  const r = capitalAllowances({ periodFrom: "2025-04-01", periodTo: "2026-03-31", mainPoolBroughtForward: 900, specialPoolBroughtForward: 0, additions: [], disposals: [] });
  t("pool of 900 written off in full", r.main.allowance === 900 && r.main.smallPoolWriteOff && r.main.carriedForward === 0, r.main);
}
{
  // Pool 2,000, sold an asset for 5,000 → balancing charge 3,000.
  const r = capitalAllowances({ periodFrom: "2025-04-01", periodTo: "2026-03-31", mainPoolBroughtForward: 2_000, specialPoolBroughtForward: 0, additions: [],
    disposals: [{ description: "Old machine", pool: "main", proceeds: 5_000 }] });
  eq("balancing charge", r.main.balancingCharge, 3_000); eq("pool after", r.main.carriedForward, 0);
}
{
  // Selling a fully-expensed asset: the whole proceeds are charged.
  const r = capitalAllowances({ periodFrom: "2025-04-01", periodTo: "2026-03-31", mainPoolBroughtForward: 0, specialPoolBroughtForward: 0, additions: [],
    disposals: [{ description: "Laptop", pool: "fullExpensing", proceeds: 400 }] });
  eq("charge on selling a fully-expensed laptop", r.totalCharges, 400);
}
{
  // Cars: petrol car 30,000 (>50 g/km) → special pool 6% = 1,800. New electric car 40,000 in June 2026 → 100%.
  const r = capitalAllowances({ periodFrom: "2026-04-01", periodTo: "2027-03-31", mainPoolBroughtForward: 0, specialPoolBroughtForward: 0, disposals: [], additions: [
    { description: "Petrol car", kind: "carHighEmission", cost: 30_000, date: "2026-04-10" },
    { description: "Electric car", kind: "carZeroEmissionNew", cost: 40_000, date: "2026-06-01" },
  ] });
  eq("special pool WDA on petrol car", r.special.allowance, 1_800); eq("electric car 100%", r.zeroEmissionCars, 40_000); eq("no AIA on cars", r.aia, 0);
}
{
  // Electric car after the 100% allowance ends (31 March 2027) → main pool at 14% = 4,200.
  const r = capitalAllowances({ periodFrom: "2026-07-01", periodTo: "2027-06-30", mainPoolBroughtForward: 0, specialPoolBroughtForward: 0, disposals: [],
    additions: [{ description: "Electric car", kind: "carZeroEmissionNew", cost: 30_000, date: "2027-05-01" }] });
  eq("late electric car: no 100%", r.zeroEmissionCars, 0); eq("late electric car: main pool WDA (hybrid none: all after change) 14%", r.main.allowance, 4_200);
}
{
  // AIA goes to special-rate spending first. Shares 300,000 of AIA with its group; spends 250,000 special + 100,000 used plant.
  const r = capitalAllowances({ periodFrom: "2025-04-01", periodTo: "2026-03-31", mainPoolBroughtForward: 0, specialPoolBroughtForward: 0, disposals: [], aiaAvailable: 300_000, additions: [
    { description: "Heating system", kind: "specialRate", cost: 250_000, date: "2025-06-01" },
    { description: "Used machine", kind: "plantUsed", cost: 100_000, date: "2025-06-01" },
  ] });
  eq("AIA on special first", r.aiaOnSpecial, 250_000); eq("then main", r.aiaOnMain, 50_000);
  eq("remaining 50,000 in main pool at 18%", r.main.allowance, 9_000);
}
{
  // Three-month period: AIA limit 1,000,000 × 91/365 = 249,315 (rounded down).
  const r = capitalAllowances({ periodFrom: "2025-04-01", periodTo: "2025-06-30", mainPoolBroughtForward: 0, specialPoolBroughtForward: 0, additions: [], disposals: [] });
  eq("short-period AIA limit", r.aiaLimit, 249_315);
}

console.log("— losses, interest, donations");
{
  // Profit 10,000, losses b/f 15,000 → use 10,000, 5,000 left. Interest 200 → chargeable 200 → £38.
  const r = compute(base({ pl: { ...base().pl, turnover: 10_000, interestReceived: 200 }, tradingLossesBroughtForward: 15_000 }));
  eq("losses used", r.lossesUsed, 10_000); eq("interest", r.nonTradingInterest, 200); eq("chargeable", r.chargeableProfits, 200);
  eq("tax", r.taxChargeable, 38); eq("losses carried forward", r.carryForward.tradingLosses, 5_000);
}
{
  // Loss of 8,000 with interest 100 → tax on 100 = £19; losses c/f 8,000 + 2,000 b/f = 10,000.
  const r = compute(base({ pl: { ...base().pl, turnover: 20_000, otherCharges: 28_000, interestReceived: 100 }, tradingLossesBroughtForward: 2_000 }));
  eq("trading loss", r.tradingLoss, 8_000); eq("trading profit", r.tradingProfit, 0); eq("tax", r.taxChargeable, 19);
  eq("losses carried forward", r.carryForward.tradingLosses, 10_000);
}
{
  // Profit 20,000 after charging a 1,000 charity donation: add back, then deduct as a qualifying donation → 20,000 chargeable.
  const r = compute(base({ pl: { ...base().pl, turnover: 21_000, otherCharges: 1_000 }, disallowable: { ...base().disallowable, charitableDonations: 1_000 }, qualifyingDonations: 1_000 }));
  eq("adjusted profit", r.adjustedTradingProfit, 21_000); eq("donation relieved", r.qualifyingDonations, 1_000); eq("chargeable", r.chargeableProfits, 20_000);
}
{
  // Donations can't create a loss: capped at profits.
  const r = compute(base({ pl: { ...base().pl, turnover: 500 }, qualifyingDonations: 2_000 }));
  eq("donation capped at profits", r.qualifyingDonations, 500); eq("chargeable", r.chargeableProfits, 0);
}
{
  const r = compute(base());
  t("dormant: nothing chargeable, no tax", r.chargeableProfits === 0 && r.taxChargeable === 0 && r.tradingLoss === 0);
}

console.log("— agrees with the return's own checks");
for (const [name, f] of [
  ["small", profitOf(11_300)], ["marginal", profitOf(100_000)], ["main", profitOf(400_000)],
  ["short marginal", profitOf(30_000, { periodFrom: "2025-04-01", periodTo: "2025-09-30" })],
  ["associated", profitOf(30_000, { associatedCompanies: 1 })],
] as [string, ReturnFigures][]) {
  const r = compute(f);
  const asReturn = {
    tradingProfits: r.tradingProfit, rate: r.rate, corporationTax: r.corporationTax, marginalRelief: r.marginalRelief,
    taxPayable: r.taxChargeable, financialYear: r.years[0].fy, periodFrom: f.periodFrom, periodTo: f.periodTo,
    associatedCompanies: f.associatedCompanies,
  } as Ct600Input;
  const probs = taxProblems(asReturn);
  t(`${name}: the CT600 checks find nothing wrong`, probs.length === 0, probs);
}

console.log("— refusals");
t("13-month period refused", figureProblems(base({ periodFrom: "2024-04-01", periodTo: "2025-04-30" })).some((p) => p.includes("12 months")));
t("period before 1 April 2023 refused", figureProblems(base({ periodFrom: "2023-01-01", periodTo: "2023-12-31" })).some((p) => p.includes("1 April 2023")));
t("unchecked future rates refused", figureProblems(base({ periodFrom: "2026-06-01", periodTo: "2027-05-31" })).some((p) => p.includes("haven't been checked")));
t("addition outside the period refused", figureProblems(base({ capitalAllowances: { ...base().capitalAllowances, additions: [{ description: "Van", kind: "plantUsed", cost: 1, date: "2023-01-01" }] } })).length > 0);
t("ordinary figures pass", figureProblems(profitOf(10_000)).length === 0, figureProblems(profitOf(10_000)));
const fine = Object.fromEntries(SCOPE_QUESTIONS.map((q) => [q.key, q.expect])) as unknown as ScopeAnswers;
t("in-scope company passes", scopeProblems(fine).length === 0);
t("director's loan refused with the reason", scopeProblems({ ...fine, loansToParticipators: true })[0]?.includes("CT600A"));
t("unanswered question asked", scopeProblems({}).length === SCOPE_QUESTIONS.length);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
