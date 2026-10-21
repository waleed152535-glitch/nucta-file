/**
 * Dormant companies: dormant accounts and a nil return with no computation.
 * Run: npx tsx tests/dormant.test.ts
 */
import { prepareReturn } from "../lib/filing";
import { blankReturnData, toCompanyReturnInput, toPeriodOfAccountInput, type ReturnData } from "../lib/return-model";
import { computePeriodOfAccount } from "../lib/tax/long-period";
import { deadlinesFor } from "../lib/deadlines";
import { approvalBlocks } from "../lib/documents";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, got?: unknown) => { ok ? pass++ : fail++; console.log(ok ? "PASS" : "FAIL", name, ok ? "" : `→ ${JSON.stringify(got)}`); };
const co = { name: "Oakmere Holdings Ltd", companyNo: "15345678", utr: "8596148860" };
const base = blankReturnData();
const d: ReturnData = {
  ...base, dormant: true, everTraded: false, ctNoticeReceived: true, activity: "",
  // Left over from before it was marked dormant — must be ignored.
  pl: { ...base.pl, turnover: 5_000, otherCharges: 900 }, additions: [{ description: "Old laptop", kind: "plantNew", cost: 800, date: "2024-07-01" }],
  participators: [{ name: "Hannah Webb", isDirector: true, openingOwed: 0, openingCredit: 0, advances: 3_000, advancesFrom6April2026: 0, repaid: 0, later: [], interestCharged: false, terms: "" }],
  balanceSheet: { ...base.balanceSheet, shareCapital: 100, shareCapitalNotPaid: 100, stock: 400, employees: 0 },
  tradingLossesBroughtForward: 2_000,
  director: "Hannah Webb", approvedOn: "2025-09-01", declarantName: "Waleed Sarfraz", declarantStatus: "Agent",
};
const input = { ...toCompanyReturnInput(co, "2024-06-01", "2025-05-31", d), today: "2026-10-21" };
const r = prepareReturn(input);
t("a dormant return builds without the scope questions answered", r.ok, r.problems);
const x = r.ct600 ?? "";
t("box 90B: no computation, company dormant", x.includes("<NoComputationsReason>Company dormant</NoComputationsReason>") && !x.includes("<ThisPeriodComputations>"));
t("no computation attached", !x.includes("<Computation>") && r.computationHtml === null);
t("accounts attached, for this period", x.includes("<ThisPeriodAccounts>yes</ThisPeriodAccounts>") && x.includes("<Accounts>\n        <Instance>"));
t("nil figures: turnover, profits, tax", x.includes("<Total>0.00</Total>") && x.includes("<Profits>0.00</Profits>") && x.includes("<TaxPayable>0.00</TaxPayable>"));
t("leftover loans ignored: no CT600A", !x.includes("<LoansByCloseCompanies>"));
const a = r.accountsHtml ?? "";
t("accounts: dormant statement", a.includes("dormant throughout the period"));
t("accounts: audit exemption under section 480", a.includes("section 480"));
t("accounts: never traded", a.includes("bus:EntityHasNeverTraded"));
t("accounts: dormant flag true", /EntityDormantTruefalse"[^>]*>true/.test(a));
t("accounts: leftover stock not shown", !/>400</.test(a.slice(a.indexOf("<body"))));
t("losses carried forward unchanged", r.computation?.carryForward.tradingLosses === 2_000, r.computation?.carryForward);
t("activity defaults to dormant company", a.includes("Dormant company"));

const traded = prepareReturn({ ...toCompanyReturnInput(co, "2024-06-01", "2025-05-31", { ...d, everTraded: true }), today: "2026-10-21" });
t("traded before: no longer trading", (traded.accountsHtml ?? "").includes("bus:EntityNoLongerTradingButTradedInPast"));

const unbalanced = prepareReturn({ ...toCompanyReturnInput(co, "2024-06-01", "2025-05-31", { ...d, balanceSheet: { ...d.balanceSheet, shareCapitalNotPaid: 0 } }), today: "2026-10-21" });
t("an unbalanced dormant balance sheet is still refused", !unbalanced.ok && unbalanced.problems.some((p) => p.includes("doesn't balance")), unbalanced.problems);

const long = computePeriodOfAccount(toPeriodOfAccountInput("2024-03-12", "2025-03-31", { ...d, balanceSheet: { ...d.balanceSheet } }, "2026-10-21"));
t("13 dormant months: two nil returns", long.long && long.parts.length === 2 && long.corporationTax === 0);
const lr = prepareReturn({ ...toCompanyReturnInput(co, "2024-03-12", "2025-03-31", d), today: "2026-10-21" });
t("…each with accounts for a different period and no computation", lr.ok && lr.parts.every((p) => (p.ct600 ?? "").includes("<DifferentPeriod>yes</DifferentPeriod>") && (p.ct600 ?? "").includes("Company dormant") && p.computationHtml === null), lr.problems);

const dl = deadlinesFor([{ id: "c", name: "Oakmere", companyNo: "15345678", incorporatedOn: "2023-06-01" }],
  [{ id: "r", companyId: "c", periodStart: "2024-06-01", periodEnd: "2025-05-31", status: "draft", amendment: false, taxByPart: [{ to: "2025-05-31", tax: 0 }], ctNotRequired: true }], "2025-12-01");
t("no notice from HMRC: no return deadline", !dl.some((x) => x.kind === "ct600" && x.periodTo === "2025-05-31"), dl.map((x) => x.kind));
t("…but the accounts are still due at Companies House", dl.some((x) => x.kind === "ch-accounts" && x.periodTo === "2025-05-31" && x.due === "2026-02-28"), dl.map((x) => `${x.kind}@${x.due}`));

const ap = approvalBlocks({ company: "Oakmere", companyNo: "15345678", periodFrom: "2024-06-01", periodTo: "2025-05-31", director: "Hannah Webb", parts: [{ from: "2024-06-01", to: "2025-05-31", tax: 0, loansTax: 0, due: "2026-03-01" }], filingDue: "2026-05-31", preparedBy: "Waleed Sarfraz", dormant: { returnNeeded: false } });
t("approval page: dormant accounts only when no return is needed", ap[0].t === "title" && ap[0].text.includes("dormant accounts") && !ap.some((b) => b.t === "h2" && b.text === "Tax to pay"));
t("approval page: says no return is filed", ap.some((b) => b.t === "p" && b.text.includes("haven't asked")));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
