/**
 * Dormant accounts in bulk: the period suggested from Companies House's
 * record, the checks on each company, and the return and accounts made.
 * Run: npx tsx tests/dormant-bulk.test.ts
 */
import { dormantReturnData, dormantRowProblems, suggestedPeriod, type DormantRow } from "../lib/dormant";
import { prepareReturn } from "../lib/filing";
import { toCompanyReturnInput } from "../lib/return-model";
import { companiesHouseCopy } from "../lib/accounts/ch-form";

let passed = 0, failed = 0;
const t = (name: string, ok: boolean, got?: unknown) => { if (ok) passed++; else { failed++; console.log("FAIL", name, got === undefined ? "" : JSON.stringify(got)); } };
const profile = { number: "15345678", name: "OAKMERE HOLDINGS LTD", status: "active", type: "ltd", incorporatedOn: "2024-01-10", registeredOffice: "", sic: [], ard: { day: 31, month: 1 }, nextAccountsMadeUpTo: "2026-01-31", nextAccountsDue: "2026-10-31", accountsOverdue: true, lastAccountsMadeUpTo: "2025-01-31", lastAccountsType: "dormant", confirmationStatementDue: null, fetchedAt: "2026-11-19" };

console.log("— the period");
t("after the last accounts", JSON.stringify(suggestedPeriod(profile, null)) === JSON.stringify({ start: "2025-02-01", end: "2026-01-31" }), suggestedPeriod(profile, null));
t("first accounts start at incorporation", suggestedPeriod({ ...profile, lastAccountsMadeUpTo: null, nextAccountsMadeUpTo: "2025-01-31" }, null)?.start === "2024-01-10");
t("no record: no guess", suggestedPeriod(null, "2024-01-10") === null);

console.log("— checks on each company");
const row: DormantRow = { companyId: "c1", periodStart: "2025-02-01", periodEnd: "2026-01-31", shareCapital: 1, paid: false, everTraded: false, director: "Hannah Webb", first: false };
t("a plain dormant company passes", dormantRowProblems(row, "2026-11-01", "2026-11-19").length === 0, dormantRowProblems(row, "2026-11-01", "2026-11-19"));
t("approval after the year end", dormantRowProblems(row, "2026-01-31", "2026-11-19").some((p) => p.includes("after the year end")));
t("year not over", dormantRowProblems({ ...row, periodEnd: "2026-12-31" }, "2026-11-01", "2026-11-19").some((p) => p.includes("hasn't ended")));
t("no share capital", dormantRowProblems({ ...row, shareCapital: 0 }, "2026-11-01", "2026-11-19").some((p) => p.includes("share capital")));
t("no director", dormantRowProblems({ ...row, director: " " }, "2026-11-01", "2026-11-19").some((p) => p.includes("director")));
t("too long for a later year", dormantRowProblems({ ...row, periodEnd: "2026-04-30" }, "2026-11-01", "2026-11-19").some((p) => p.includes("12 months")));
t("first accounts may be longer", !dormantRowProblems({ ...row, first: true, periodStart: "2024-01-10", periodEnd: "2025-01-31" }, "2026-11-01", "2026-11-19").some((p) => p.includes("12 months")));

console.log("— the return and the accounts");
const co = { name: "Oakmere Holdings Ltd", companyNo: "15345678", utr: null };
for (const paid of [false, true]) {
  const d = dormantReturnData({ ...row, shareCapital: 100, paid }, "2026-11-01");
  const r = prepareReturn({ ...toCompanyReturnInput({ ...co, utr: "0000000000" }, row.periodStart, row.periodEnd, d), today: "2026-11-19" });
  const label = paid ? "paid shares" : "unpaid shares";
  t(`${label}: builds`, r.ok, r.problems);
  const a = r.accountsHtml ?? "";
  t(`${label}: dormant statement`, a.includes("dormant throughout the period"));
  t(`${label}: never traded`, a.includes("bus:EntityHasNeverTraded"));
  t(`${label}: last year's column`, /contextRef="P[^"]*"/.test(a) || a.includes("2025"), null);
  t(`${label}: no HMRC notice assumed`, d.ctNoticeReceived === false);
  const ch = companiesHouseCopy(a);
  t(`${label}: Companies House copy keeps the balance sheet`, ch.includes("Balance sheet as at"));
}
const traded = dormantReturnData({ ...row, everTraded: true }, "2026-11-01");
const rt = prepareReturn({ ...toCompanyReturnInput({ ...co, utr: "0000000000" }, row.periodStart, row.periodEnd, traded), today: "2026-11-19" });
t("traded before: not 'never traded'", rt.ok && !(rt.accountsHtml ?? "").includes("bus:EntityHasNeverTraded"), rt.problems);
const first = dormantReturnData({ ...row, first: true, periodStart: "2024-01-10", periodEnd: "2025-01-31" }, "2026-11-01");
t("first accounts: no last year", first.prior === null);

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
