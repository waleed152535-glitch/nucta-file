/**
 * Deadlines for the dashboard. Run: npx tsx tests/deadlines.test.ts
 */
import { accountsDue, deadlinesFor, firstPeriodEnd, monthsAfter, type DeadlineCompany, type DeadlineReturn } from "../lib/deadlines";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, got?: unknown) => { ok ? pass++ : fail++; console.log(ok ? "PASS" : "FAIL", name, ok ? "" : `→ ${JSON.stringify(got)}`); };

t("month end stays a month end: 30 June + 9 months = 31 March", monthsAfter("2025-06-30", 9) === "2026-03-31", monthsAfter("2025-06-30", 9));
t("31 March + 9 months = 31 December", monthsAfter("2025-03-31", 9) === "2025-12-31");
t("28 February + 9 months = 30 November", monthsAfter("2025-02-28", 9) === "2025-11-30");
t("a mid-month date keeps its day", monthsAfter("2025-03-15", 9) === "2025-12-15");
t("first accounts end on the last day of the anniversary month", firstPeriodEnd("2025-01-15") === "2026-01-31");
t("long first accounts: 21 months from incorporation", accountsDue("2025-01-15", "2026-01-31", "2025-01-15") === "2026-10-15", accountsDue("2025-01-15", "2026-01-31", "2025-01-15"));
t("ordinary accounts: 9 months after the year end", accountsDue("2024-04-01", "2025-03-31", "2019-04-01") === "2025-12-31");
t("first accounts of exactly 12 months: 9 months", accountsDue("2024-04-01", "2025-03-31", "2024-04-01") === "2025-12-31");

const co: DeadlineCompany = { id: "c1", name: "Brightshelf Trading Ltd", companyNo: "15123456", incorporatedOn: "2019-04-01" };
const draft: DeadlineReturn = { id: "r1", companyId: "c1", periodStart: "2024-04-01", periodEnd: "2025-03-31", status: "draft", amendment: false, taxByPart: [{ to: "2025-03-31", tax: 5097.7 }] };
const d1 = deadlinesFor([co], [draft], "2025-12-15");
const kinds = (ds: typeof d1) => ds.map((d) => `${d.kind}@${d.due}:${d.state}`).join(" ");
t("draft return: accounts, tax and return deadlines, soonest first", kinds(d1).startsWith("ch-accounts@2025-12-31:soon ct-payment@2026-01-01:soon ct600@2026-03-31:later"), kinds(d1));
t("tax amount shown", d1.find((d) => d.kind === "ct-payment")?.amount === 5097.7);
t("the next year shows as in progress", d1.some((d) => d.kind === "not-started" && d.label === "Year in progress" && d.periodFrom === "2025-04-01"), kinds(d1));
const late = deadlinesFor([co], [draft], "2026-04-10");
t("past the date: overdue", late.find((d) => d.kind === "ct600")?.state === "overdue" && (late.find((d) => d.kind === "ct600")?.daysLeft ?? 0) < 0);
t("the next year, now ended, is a return not started", late.some((d) => d.kind === "not-started" && d.label === "Return not started" && d.periodTo === "2026-03-31"), kinds(late));

const filedRet = { ...draft, status: "accepted" };
const f = deadlinesFor([co], [filedRet], "2025-12-15");
t("a filed return has no return deadline", !f.some((d) => d.kind === "ct600"));
t("its tax still shows until it falls due", f.some((d) => d.kind === "ct-payment"));
t("…and not after", !deadlinesFor([co], [filedRet], "2026-01-05").some((d) => d.kind === "ct-payment" && d.periodTo === "2025-03-31"));
t("no tax to pay, no payment deadline", !deadlinesFor([co], [{ ...draft, taxByPart: [{ to: "2025-03-31", tax: 0 }] }], "2025-12-15").some((d) => d.kind === "ct-payment"));
t("amendments add no deadlines of their own", deadlinesFor([co], [filedRet, { ...draft, id: "r2", amendment: true }], "2025-12-15").filter((d) => d.kind === "ct600").length === 0);

const fresh: DeadlineCompany = { id: "c2", name: "Larkspur Home Ltd", companyNo: "15234567", incorporatedOn: "2025-01-15" };
const n = deadlinesFor([fresh], [], "2026-03-01");
t("new company: first accounts not started", n.some((d) => d.kind === "not-started" && d.periodFrom === "2025-01-15" && d.periodTo === "2026-01-31" && d.due === "2027-01-31"), kinds(n));
t("new company: accounts due 21 months from incorporation (estimated)", n.some((d) => d.kind === "ch-accounts" && d.due === "2026-10-15" && d.estimated), kinds(n));
const withCh = deadlinesFor([{ ...fresh, ch: { nextAccountsMadeUpTo: "2026-01-31", nextAccountsDue: "2026-10-15" } }], [], "2026-03-01");
t("Companies House's own date is used when known", withCh.some((d) => d.kind === "ch-accounts" && d.due === "2026-10-15" && !d.estimated), kinds(withCh));
const chKnown = deadlinesFor([{ ...co, ch: { lastAccountsMadeUpTo: "2024-03-31", nextAccountsMadeUpTo: "2025-03-31", nextAccountsDue: "2025-12-31" } }], [], "2026-10-20");
t("no returns yet: next accounts come after Companies House's last", chKnown.some((d) => d.kind === "not-started" && d.periodFrom === "2024-04-01" && d.periodTo === "2025-03-31"), kinds(chKnown));
t("…and Companies House's due date is used, overdue", chKnown.some((d) => d.kind === "ch-accounts" && d.due === "2025-12-31" && d.state === "overdue" && !d.estimated), kinds(chKnown));
const chFiled = deadlinesFor([{ ...co, ch: { nextAccountsMadeUpTo: "2026-03-31", nextAccountsDue: "2026-12-31" } }], [draft], "2025-12-15");
t("accounts Companies House already have aren't listed", !chFiled.some((d) => d.kind === "ch-accounts" && d.periodTo === "2025-03-31"), kinds(chFiled));
const longRet: DeadlineReturn = { id: "r3", companyId: "c2", periodStart: "2025-01-15", periodEnd: "2026-01-31", status: "draft", amendment: false, taxByPart: [{ to: "2026-01-14", tax: 900 }, { to: "2026-01-31", tax: 40 }] };
const l = deadlinesFor([fresh], [longRet], "2026-03-01");
t("long period: one return deadline, labelled as two returns", l.filter((d) => d.kind === "ct600").length === 1 && Boolean(l.find((d) => d.kind === "ct600")?.label.includes("two")));
t("long period: tax due for each period", l.filter((d) => d.kind === "ct-payment").map((d) => d.due).join() === "2026-10-15,2026-11-01", l.filter((d) => d.kind === "ct-payment").map((d) => d.due));
t("no incorporation date and no returns: nothing guessed", deadlinesFor([{ ...fresh, incorporatedOn: null }], [], "2026-03-01").length === 0);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
