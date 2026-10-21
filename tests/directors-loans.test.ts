/**
 * Director's loans (s455 and the CT600A): hand-worked examples.
 * Run: npx tsx tests/directors-loans.test.ts
 */
import { directorsLoans, reliefWindowEnds, type ParticipatorAccount } from "../lib/tax/directors-loans";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, got?: unknown) => { ok ? pass++ : fail++; console.log(ok ? "PASS" : "FAIL", name, ok ? "" : `→ ${JSON.stringify(got)}`); };
const eq = (name: string, got: number, want: number) => t(`${name} = ${want}`, Math.abs(got - want) < 0.005, got);
const person = (o: Partial<ParticipatorAccount>): ParticipatorAccount => ({
  name: "Amina Khan", isDirector: true, openingOwed: 0, openingCredit: 0, advances: 0, advancesFrom6April2026: 0,
  repaid: 0, later: [], interestCharged: false, terms: "", ...o,
});
const TODAY = "2026-10-17";

console.log("— the relief window (rule SA018.0)");
t("year end 31 March 2025: repayments before 1 January 2026", reliefWindowEnds("2025-03-31") === "2026-01-01", reliefWindowEnds("2025-03-31"));
t("year end 15 June 2025: before 16 March 2026", reliefWindowEnds("2025-06-15") === "2026-03-16", reliefWindowEnds("2025-06-15"));
t("year end 30 May 2025: 9 months is 28 February, so before 1 March 2026", reliefWindowEnds("2025-05-30") === "2026-03-01", reliefWindowEnds("2025-05-30"));
t("year end 30 June 2025 (month end): before 1 April 2026", reliefWindowEnds("2025-06-30") === "2026-04-01", reliefWindowEnds("2025-06-30"));

console.log("— lent, part repaid in the year, part after");
{
  // Lent 18,000, repaid 6,000 in the year → 12,000 outstanding (A15). A20 = 12,000 × 33.75% = 4,050.00.
  // Repaid 5,000 on 30 November 2025 (within 9 months) → A30/A40 5,000, A45 = 1,687.50. A80 = 2,362.50.
  const r = directorsLoans("2024-04-01", "2025-03-31", [person({ advances: 18_000, repaid: 6_000, later: [{ amount: 5_000, date: "2025-11-30", how: "repaid" }] })], TODAY);
  t("no problems", r.problems.length === 0, r.problems);
  eq("A15", r.a15, 12_000); eq("A20", r.a20, 4_050); eq("A30", r.a30, 5_000); eq("A40", r.a40, 5_000);
  eq("A45", r.a45, 1_687.5); eq("A80", r.a80, 2_362.5); eq("A75 (owed at the year end)", r.a75, 12_000);
  t("A5 is no (not all cleared)", !r.allClearedBeforeEnd);
  t("due date 1 January 2026", r.dueDate === "2026-01-01", r.dueDate);
  t("benefit-in-kind warning above £10,000 interest-free", r.warnings.some((w) => w.includes("P11D")));
}

console.log("— repayments clear the oldest loan first");
{
  // Owed 10,000 from last year; lent 8,000; repaid 12,000 → last year's 10,000 cleared, then 2,000 of this year's. A15 6,000 → 2,025.00.
  const r = directorsLoans("2024-04-01", "2025-03-31", [person({ openingOwed: 10_000, advances: 8_000, repaid: 12_000 })], TODAY);
  eq("A15", r.a15, 6_000); eq("A20", r.a20, 2_025); eq("A75", r.a75, 6_000);
  t("tells you last year's repayment can be reclaimed", r.warnings.some((w) => w.includes("£10,000 of an earlier year's loan")));
}
{
  // Account in credit by 3,000 at the start; lent 5,000 → only 2,000 is a new loan. 675.00.
  const r = directorsLoans("2024-04-01", "2025-03-31", [person({ openingCredit: 3_000, advances: 5_000 })], TODAY);
  eq("credit used first: A15", r.a15, 2_000); eq("A20", r.a20, 675);
}
{
  // Lent 4,000 and repaid it all in the year → page still filed, A5 yes, nothing to pay.
  const r = directorsLoans("2024-04-01", "2025-03-31", [person({ advances: 4_000, repaid: 4_000 })], TODAY);
  t("all cleared in the year: page needed, A5 yes", r.needed && r.allClearedBeforeEnd); eq("A80", r.a80, 0);
}
{
  // Repaid more than owed: the account ends in credit.
  const r = directorsLoans("2024-04-01", "2025-03-31", [person({ advances: 2_000, repaid: 2_500 })], TODAY);
  eq("credit at the end", r.people[0].closingCredit, 500);
}

console.log("— dates that can't be relieved");
{
  const future = directorsLoans("2024-04-01", "2025-03-31", [person({ advances: 5_000, later: [{ amount: 5_000, date: "2026-12-01", how: "repaid" }] })], TODAY);
  t("future repayment date refused", future.problems.some((p) => p.includes("future")));
  const inside = directorsLoans("2024-04-01", "2025-03-31", [person({ advances: 5_000, later: [{ amount: 1_000, date: "2025-03-15", how: "repaid" }] })], TODAY);
  t("'later' repayment inside the year refused", inside.problems.some((p) => p.includes("within the period")));
  const late = directorsLoans("2024-04-01", "2025-03-31", [person({ advances: 5_000, later: [{ amount: 5_000, date: "2026-02-10", how: "repaid" }] })], TODAY);
  t("repayment after 9 months gives no relief here", late.a45 === 0 && late.a80 === 1_687.5 && late.warnings.some((w) => w.includes("more than 9 months")), late);
  const over = directorsLoans("2024-04-01", "2025-03-31", [person({ openingOwed: 3_000, advances: 5_000, later: [{ amount: 7_000, date: "2025-06-01", how: "repaid" }] })], TODAY);
  t("relief capped at this year's loan; the rest goes to earlier loans", over.a40 === 5_000 && over.a80 === 0 && over.warnings.some((w) => w.includes("£2,000 repaid after the year end")), over);
}

console.log("— the 35.75% rate from 6 April 2026");
{
  // Calendar 2026: lent 20,000, of which 12,000 from 6 April; repaid 5,000 (from the earliest). Outstanding 15,000.
  // Filed at 33.75% (HMRC's systems): 5,062.50. Law: 3,000 × 33.75% + 12,000 × 35.75% = 1,012.50 + 4,290.00 = 5,302.50. Amend by 240.00.
  const r = directorsLoans("2026-01-01", "2026-12-31", [person({ advances: 20_000, advancesFrom6April2026: 12_000, repaid: 5_000 })], "2027-02-01");
  eq("filed A80", r.a80, 5_062.5); eq("legal tax", r.legalTax, 5_302.5); eq("amendment due", r.amendmentDue, 240);
  t("explains the amendment", r.warnings.some((w) => w.includes("6 April 2027") && w.includes("£240.00")));
}

console.log("— rounding and totals");
{
  // 1,001 × 33.75% = 337.8375 → 337.84 (half up to the penny).
  const r = directorsLoans("2024-04-01", "2025-03-31", [person({ advances: 1_001 })], TODAY);
  eq("A20 rounded half up", r.a20, 337.84);
  const two = directorsLoans("2024-04-01", "2025-03-31", [person({ advances: 3_000 }), person({ name: "Bilal Khan", isDirector: false, advances: 2_000 })], TODAY);
  eq("two people: A15", two.a15, 5_000); eq("two people: A20", two.a20, 1_687.5);
  t("shareholder who isn't a director: no benefit-in-kind warning", !two.warnings.some((w) => w.includes("Bilal") && w.includes("P11D")));
}
{
  const none = directorsLoans("2024-04-01", "2025-03-31", [person({})], TODAY);
  t("no loan activity: no page", !none.needed);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
