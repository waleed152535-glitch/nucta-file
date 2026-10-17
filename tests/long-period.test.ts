/**
 * Accounts longer than 12 months (two returns from one set of figures) and
 * amended returns.
 *
 * Run: npx tsx tests/long-period.test.ts
 */
import { prepareReturn, type CompanyReturnInput } from "../lib/filing";
import { SCOPE_QUESTIONS, type ScopeAnswers } from "../lib/tax/scope";
import { accountingPeriodsOf, amendmentDeadline, computePeriodOfAccount, filingDeadline, splitFigures, taxDueDate } from "../lib/tax/long-period";
import { exceedsEighteenMonths } from "../lib/tax/dates";
import type { ReturnFigures } from "../lib/tax/computation";
import type { ParticipatorAccount } from "../lib/tax/directors-loans";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, got?: unknown) => { ok ? pass++ : fail++; console.log(ok ? "PASS" : "FAIL", name, ok ? "" : `→ ${JSON.stringify(got)}`); };
const box = (xml: string, tag: string): string | null => (xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`)) ?? [])[1] ?? null;
const inScope = Object.fromEntries(SCOPE_QUESTIONS.map((q) => [q.key, q.expect])) as unknown as ScopeAnswers;
const zeroDis = { entertainment: 0, finesAndPenalties: 0, charitableDonations: 0, politicalDonations: 0, privateExpenses: 0, capitalItemsExpensed: 0, lossOnDisposals: 0, other: 0 };

// ── The periods ──────────────────────────────────────────────────────────
const p13 = accountingPeriodsOf("2024-03-01", "2025-03-31");
t("13 months make two periods", p13.length === 2, p13);
t("first period is the first 12 months", p13[0].from === "2024-03-01" && p13[0].to === "2025-02-28" && p13[0].days === 365, p13[0]);
t("second period is the rest", p13[1].from === "2025-03-01" && p13[1].to === "2025-03-31" && p13[1].days === 31, p13[1]);
t("exactly 12 months is one period", accountingPeriodsOf("2024-04-01", "2025-03-31").length === 1);
t("a leap-day start: first period ends 28 February", accountingPeriodsOf("2024-02-29", "2025-03-31")[0].to === "2025-02-28");
t("18 months is allowed", !exceedsEighteenMonths("2024-03-01", "2025-08-31"));
t("18 months and a day is not", exceedsEighteenMonths("2024-03-01", "2025-09-01"));
t("filing date: 12 months after the accounts end", filingDeadline("2025-03-31") === "2026-03-31");
t("amendments: 12 months after that", amendmentDeadline("2025-03-31") === "2027-03-31");
t("tax due 9 months and a day after each period", taxDueDate("2025-02-28") === "2025-12-01" && taxDueDate("2025-03-31") === "2026-01-01");

// ── Splitting the figures ───────────────────────────────────────────────
const base: ReturnFigures = {
  periodFrom: "2024-03-01", periodTo: "2025-03-31", associatedCompanies: 0,
  pl: { turnover: 168_300, otherIncome: 900, interestReceived: 330, costOfSales: 41_200, staffCosts: 25_140, depreciation: 1_650, otherCharges: 37_400 },
  disallowable: { ...zeroDis, entertainment: 720, charitableDonations: 600 }, profitOnDisposals: 0,
  capitalAllowances: {
    additions: [
      { description: "Laptops", kind: "plantNew", cost: 4_200, date: "2024-03-18" },
      { description: "Used van", kind: "plantUsed", cost: 9_800, date: "2025-03-10" },
    ],
    disposals: [], mainPoolBroughtForward: 0, specialPoolBroughtForward: 0,
  },
  tradingLossesBroughtForward: 0, qualifyingDonations: 600,
};
const [a, b] = splitFigures(base, { donationsInFirstPart: 400 });
t("every accounts line adds back up", (Object.keys(base.pl) as (keyof typeof base.pl)[]).every((k) => a.pl[k] + b.pl[k] === base.pl[k]));
t("every adjustment adds back up", (Object.keys(base.disallowable) as (keyof typeof base.disallowable)[]).every((k) => a.disallowable[k] + b.disallowable[k] === base.disallowable[k]));
t("turnover split by days: 365/396", a.pl.turnover === Math.round((168_300 * 365) / 396), a.pl.turnover);
t("purchases go to the period they were made in", a.capitalAllowances.additions.length === 1 && b.capitalAllowances.additions[0]?.description === "Used van");
t("donations by the date paid", a.qualifyingDonations === 400 && b.qualifyingDonations === 200);

const poa = computePeriodOfAccount({ figures: base, donationsInFirstPart: 400 });
const [r1, r2] = poa.parts.map((x) => x.result);
t("long period computes two parts", poa.long && poa.parts.length === 2 && poa.problems.length === 0, poa.problems);
t("first period: full expensing on the laptops", r1.capitalAllowances.fullExpensing === 4_200);
t("first period straddles 1 April 2024: two financial years", r1.years.length === 2 && r1.years[0].fy === 2023, r1.years.map((y) => y.fy));
t("first period has the full-year limits", r1.years.reduce((s, y) => s + y.upperLimit, 0) === 250_000, r1.years.map((y) => y.upperLimit));
t("second period: AIA reduced to 31 days", r2.capitalAllowances.aiaLimit === Math.floor((1_000_000 * 31) / 365), r2.capitalAllowances.aiaLimit);
t("second period: the van has the AIA", r2.capitalAllowances.aia === 9_800);
t("second period's limits are cut to 31 days", Math.abs(r2.years[0].lowerLimit - (50_000 * 31) / 365) < 0.01, r2.years[0].lowerLimit);
t("first period's tax £11,423.10", r1.taxChargeable === 11_423.1, r1.taxChargeable);
t("second period's loss carried forward", r2.tradingLoss === 4_573 && r2.carryForward.tradingLosses === 4_573, [r2.tradingLoss, r2.carryForward]);
t("the accounts' tax charge is both periods'", poa.corporationTax === Math.round((r1.taxChargeable + r2.taxChargeable) * 100) / 100);
t("a carry-back claim is mentioned, not made", poa.warnings.some((w) => w.includes("section 37")));

// Pools and losses run from the first period into the second.
const lossy: ReturnFigures = {
  ...base, pl: { ...base.pl, turnover: 140_000 }, qualifyingDonations: 0, disallowable: { ...zeroDis },
  capitalAllowances: { additions: [{ description: "Workshop lighting", kind: "specialRate", cost: 60_000, date: "2024-05-01" }], disposals: [], mainPoolBroughtForward: 20_000, specialPoolBroughtForward: 0 },
  tradingLossesBroughtForward: 1_000,
};
const lp = computePeriodOfAccount({ figures: lossy });
const [l1, l2] = lp.parts.map((x) => x.result);
t("first period makes a loss", l1.tradingLoss > 0, l1.tradingLoss);
t("losses brought forward unused in a loss period are kept", l1.carryForward.tradingLosses === 1_000 + l1.tradingLoss, l1.carryForward);
t("second period uses the first period's losses", l2.lossesUsed === Math.min(l1.carryForward.tradingLosses, l2.tradingProfit), [l2.lossesUsed, l2.tradingProfit]);
t("second period's main pool starts where the first ended", l2.capitalAllowances.main.broughtForward === l1.carryForward.mainPool, [l2.capitalAllowances.main.broughtForward, l1.carryForward.mainPool]);
t("second period's WDA is cut to 31 days", l2.capitalAllowances.main.allowance === Math.floor(l1.carryForward.mainPool * 0.18 * (31 / 365)), l2.capitalAllowances.main.allowance);

// Sales need a date in a long period, and go to their own period.
const undated = computePeriodOfAccount({ figures: { ...lossy, capitalAllowances: { ...lossy.capitalAllowances, disposals: [{ description: "Old lathe", pool: "main", proceeds: 2_000 }] } } });
t("an undated sale is refused in a long period", undated.problems.some((p) => p.includes("Old lathe") && p.includes("date")), undated.problems);
const dated = computePeriodOfAccount({ figures: { ...lossy, capitalAllowances: { ...lossy.capitalAllowances, disposals: [{ description: "Old lathe", pool: "main", proceeds: 2_000, date: "2025-03-15" }] } } });
t("a dated sale goes to the second period", dated.parts[1]?.result.capitalAllowances.main.disposals === 2_000 && dated.parts[0]?.result.capitalAllowances.main.disposals === 0);
t("over 18 months is refused", computePeriodOfAccount({ figures: { ...base, periodTo: "2025-09-30" } }).problems.some((p) => p.includes("18 months")));
t("donations in the first 12 months can't exceed the total", computePeriodOfAccount({ figures: base, donationsInFirstPart: 900 }).problems.length > 0);

// ── Director's loans across the two periods ─────────────────────────────
const priya: ParticipatorAccount = {
  name: "Priya Shah", isDirector: true, openingOwed: 0, openingCredit: 0, advances: 13_000, advancesFrom6April2026: 0, repaid: 6_000,
  later: [{ amount: 3_000, date: "2025-06-30", how: "repaid" }], interestCharged: false, terms: "",
  firstPart: { advances: 12_000, repaid: 2_000, advancesFrom6April2026: 0, lastRepaidDate: "2025-03-20" },
};
const lo = computePeriodOfAccount({ figures: base, donationsInFirstPart: 400, participators: [priya], today: "2026-10-17" });
const [L1, L2] = lo.parts.map((x) => x.loans!);
t("first period: £10,000 lent and still owed at its end", L1.a15 === 10_000, L1.a15);
t("first period: relief for the £4,000 repaid in March and £2,000 of June's", L1.a40 === 6_000 && L1.a45 === 2_025, [L1.a40, L1.a45]);
t("first period: s455 £1,350", L1.a80 === 1_350, L1.a80);
t("Part 2 rows dated with the repayments", L1.people[0].relief.map((r) => r.date).join() === "2025-03-20,2025-06-30", L1.people[0].relief);
t("second period opens with the first period's balance", L2.people[0].opening === 10_000, L2.people[0].opening);
t("second period: the £1,000 lent in March is repaid in June", L2.a15 === 1_000 && L2.a40 === 1_000 && L2.a80 === 0, [L2.a15, L2.a40, L2.a80]);
t("owed at the end of the accounts £7,000", lo.closingLoans?.a75 === 7_000, lo.closingLoans?.a75);
t("no double reclaim suggested for repayments already relieved", !lo.warnings.some((w) => w.includes("can be reclaimed")), lo.warnings);
const noSplit = computePeriodOfAccount({ figures: base, participators: [{ ...priya, firstPart: undefined }], today: "2026-10-17" });
t("loans need the first 12 months' figures", noSplit.problems.some((p) => p.includes("first 12 months")), noSplit.problems);
const noDate = computePeriodOfAccount({ figures: base, participators: [{ ...priya, firstPart: { ...priya.firstPart!, lastRepaidDate: "" } }], today: "2026-10-17" });
t("repayments after the first 12 months need a date", noDate.problems.some((p) => p.includes("date of the last")), noDate.problems);

// ── The returns ──────────────────────────────────────────────────────────
const input: CompanyReturnInput = {
  company: { name: "Larkspur Home Ltd", number: "15234567", utr: "8596148860", activity: "Interior design services" },
  figures: base, donationsInFirstPart: 400, participators: [priya], today: "2026-10-17",
  balanceSheet: { fixedAssets: 12_350, stock: 0, debtors: 14_200, cash: 0, prepayments: 0, creditorsWithin: 8_900, owedToDirectors: 0, creditorsAfter: 0, provisions: 0,
    shareCapital: 100, shareCapitalNotPaid: 0, reservesBroughtForward: 0, dividendsPaid: 20_000, employees: 2 },
  director: "Priya Shah", approvedOn: "2025-08-12", declarant: { name: "Waleed Sarfraz", status: "Agent" }, scope: inScope,
};
// Balance the balance sheet by its cash figure.
const first = prepareReturn(input);
const pbt = 64_140, tax = Math.round(first.corporationTax);
const cash = (100 + pbt - tax - 20_000) - (12_350 + 14_200 + 7_000 - 8_900 - tax);
const pr = prepareReturn({ ...input, balanceSheet: { ...input.balanceSheet, cash } });
t("the long return builds", pr.ok && pr.parts.length === 2, pr.problems);
const [x1, x2] = pr.parts.map((x) => x.ct600 ?? "");
t("each return covers its own period", x1.includes("<From>2024-03-01</From>") && x1.includes("<To>2025-02-28</To>") && x2.includes("<From>2025-03-01</From>") && x2.includes("<To>2025-03-31</To>"));
t("box 50: more than one return made now", box(x1, "MultipleReturns") === "yes" && box(x2, "MultipleReturns") === "yes");
t("box 85: accounts for a different period, not box 80", box(x1, "DifferentPeriod") === "yes" && !x1.includes("<ThisPeriodAccounts>") && box(x2, "DifferentPeriod") === "yes");
t("box 80B: each has its own computation", box(x1, "ThisPeriodComputations") === "yes" && box(x2, "ThisPeriodComputations") === "yes");
t("the same accounts are attached to both", pr.accountsHtml !== null && x1.includes("<Accounts>\n        <Instance>") && x2.includes("<Accounts>\n        <Instance>"));
t("box 145 turnover is each period's share", Number(box(x1, "Total")) + Number(box(x2, "Total")) === 168_300, [box(x1, "Total"), box(x2, "Total")]);
t("CT600A on the first return: s455 £1,350", box(x1, "LoansToParticipators") === "1350.00", box(x1, "LoansToParticipators"));
t("box 510 on the first return = 440 + 480", box(x1, "TaxPayable") === "12773.10", box(x1, "TaxPayable"));
t("both returns are new", x1.startsWith('<CompanyTaxReturn ReturnType="new">') && x2.startsWith('<CompanyTaxReturn ReturnType="new">'));
const c1 = pr.parts[0].computationHtml ?? "";
t("computation: period of account dates are the accounts'", /PeriodOfAccountStartDate"[^>]*>2024-03-01/.test(c1) && /PeriodOfAccountEndDate"[^>]*>2025-03-31/.test(c1), c1.match(/PeriodOfAccount[^<]*<[^<]*/g));
t("computation: period covered is the return's", /StartOfPeriodCoveredByReturn"[^>]*>2024-03-01/.test(c1) && /EndOfPeriodCoveredByReturn"[^>]*>2025-02-28/.test(c1));
t("computation explains the split", c1.includes("Accounts for more than 12 months") && c1.includes("365/396"));
t("accounts tax charge is both periods' tax", (pr.accountsHtml ?? "").includes("11,423"), null);
t("filing date and amendment window", pr.filingDue === "2026-03-31" && pr.amendBy === "2027-03-31");
t("an unfinished long period is refused", !prepareReturn({ ...input, today: "2025-03-30" }).ok);

// ── Amended returns ──────────────────────────────────────────────────────
const am = prepareReturn({ ...input, balanceSheet: { ...input.balanceSheet, cash }, returnType: "amended" });
t("an amendment builds", am.ok, am.problems);
t("both returns are marked amended", (am.parts[0].ct600 ?? "").startsWith('<CompanyTaxReturn ReturnType="amended">') && (am.parts[1].ct600 ?? "").startsWith('<CompanyTaxReturn ReturnType="amended">'));
t("an amendment differs only in its marker", (am.parts[0].ct600 ?? "").replace('ReturnType="amended"', "") === x1.replace('ReturnType="new"', ""));
const late = prepareReturn({ ...input, balanceSheet: { ...input.balanceSheet, cash }, returnType: "amended", today: "2027-04-01" });
t("an amendment after the window is refused", !late.ok && late.problems.some((p) => p.includes("amend")), late.problems);
const lateNew = prepareReturn({ ...input, balanceSheet: { ...input.balanceSheet, cash }, today: "2027-04-01" });
t("a late new return is still allowed", lateNew.ok, lateNew.problems);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
