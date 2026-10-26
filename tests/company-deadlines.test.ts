import { companyPicture, whenWords, asCompanyNumber } from "../lib/company-deadlines";
import { makeLimiter, makeCache, visitorFrom } from "../lib/lookup-limits";
import { profileFrom, type ChProfile } from "../lib/ch-api";

let passed = 0, failed = 0;
const t = (name: string, ok: boolean, got?: unknown) => { if (ok) passed++; else { failed++; console.log("FAIL", name, got === undefined ? "" : JSON.stringify(got)); } };
const eq = (name: string, got: unknown, want: unknown) => t(name, JSON.stringify(got) === JSON.stringify(want), { got, want });

const base: ChProfile = {
  number: "15123456", name: "BRIGHTSHELF TRADING LTD", status: "active", type: "ltd", incorporatedOn: "2019-04-01", registeredOffice: "12 High Street, Leeds",
  sic: [], ard: { day: 31, month: 3 }, nextAccountsMadeUpTo: "2025-03-31", nextAccountsDue: "2025-12-31", accountsOverdue: true,
  lastAccountsMadeUpTo: "2024-03-31", lastAccountsType: "micro-entity", confirmationStatementDue: "2026-11-14", fetchedAt: "2026-10-26T10:00:00Z",
};
const rows = (p: ChProfile, today: string) => companyPicture(p, today).deadlines.map((d) => [d.kind, d.date, d.state]);

console.log("— a company behind with its accounts");
eq("dates in order, with their states", rows(base, "2026-10-26"), [
  ["ch-accounts", "2025-12-31", "late"],
  ["ct-payment", "2026-01-01", "passed"],
  ["ct600", "2026-03-31", "passed"],
  ["confirmation", "2026-11-14", "soon"],
]);
eq("the overdue accounts lead", companyPicture(base, "2026-10-26").lead?.kind, "ch-accounts");
{
  const d = companyPicture(base, "2026-10-26").deadlines;
  eq("the accounts period runs from the day after the last accounts", d[0].period, { from: "2024-04-01", to: "2025-03-31" });
  eq("days are counted from today", d[3].days, 19);
  eq("the return for the period already at Companies House has passed, so it isn't listed", d.filter((x) => x.kind === "ct600").length, 1);
}

console.log("— first accounts longer than 12 months");
{
  const p: ChProfile = { ...base, incorporatedOn: "2024-01-06", nextAccountsMadeUpTo: "2025-01-31", nextAccountsDue: "2025-10-06", accountsOverdue: false, lastAccountsMadeUpTo: null, lastAccountsType: null, confirmationStatementDue: "2025-01-19" };
  const pic = companyPicture(p, "2025-06-01");
  eq("two tax payments and one filing date", pic.deadlines.filter((d) => d.kind !== "confirmation").map((d) => [d.kind, d.date]), [
    ["ch-accounts", "2025-10-06"], ["ct-payment", "2025-10-06"], ["ct-payment", "2025-11-01"], ["ct600", "2026-01-31"],
  ]);
  const tax = pic.deadlines.filter((d) => d.kind === "ct-payment");
  eq("first tax period: the first 12 months", tax[0].period, { from: "2024-01-06", to: "2025-01-05" });
  eq("second tax period: the rest", tax[1].period, { from: "2025-01-06", to: "2025-01-31" });
  t("the return says there are two", /two of them/.test(pic.deadlines.find((d) => d.kind === "ct600")!.title));
  t("a note says when trading is assumed to start", pic.notes.some((n) => /started trading/.test(n)), pic.notes);
}

console.log("— the confirmation statement goes in date order");
{
  const p: ChProfile = { ...base, incorporatedOn: "2024-01-06", nextAccountsMadeUpTo: "2025-01-31", nextAccountsDue: "2025-10-06", accountsOverdue: false, lastAccountsMadeUpTo: null, confirmationStatementDue: "2025-01-19" };
  const d = companyPicture(p, "2025-06-01").deadlines;
  eq("a confirmation statement past its date is overdue, and comes first", [d[0].kind, d[0].state], ["confirmation", "late"]);
  eq("so it leads", companyPicture(p, "2025-06-01").lead?.kind, "confirmation");
  eq("accounts past their due date are overdue even without the flag", companyPicture({ ...p, confirmationStatementDue: null }, "2025-10-07").deadlines[0].state, "late");
  const calm = companyPicture({ ...p, confirmationStatementDue: null }, "2025-06-01");
  eq("with nothing overdue, the next date to come leads", calm.lead?.date, "2025-10-06");
}

console.log("— a return can still be due after the accounts are at Companies House");
{
  const p: ChProfile = { ...base, incorporatedOn: "2020-05-01", ard: { day: 31, month: 1 }, nextAccountsMadeUpTo: "2027-01-31", nextAccountsDue: "2027-10-31", accountsOverdue: false, lastAccountsMadeUpTo: "2026-01-31", confirmationStatementDue: "2027-05-14" };
  const d = companyPicture(p, "2026-10-26").deadlines;
  eq("last year's tax and return come first", d.slice(0, 2).map((x) => [x.kind, x.date, x.state]), [["ct-payment", "2026-11-01", "soon"], ["ct600", "2027-01-31", "later"]]);
  eq("a passed tax date that might have been met doesn't lead", companyPicture({ ...base, accountsOverdue: false, nextAccountsDue: "2026-12-31", confirmationStatementDue: "2027-01-10" }, "2026-10-26").lead?.kind, "ch-accounts");
  t("it says Companies House already have those accounts", /already have these accounts/.test(d[1].note ?? ""), d[1].note);
  eq("last year's return has no known start", d[1].period, { from: null, to: "2026-01-31" });
  eq("this year's period starts after last year's", d.find((x) => x.kind === "ch-accounts")!.period, { from: "2026-02-01", to: "2027-01-31" });
  eq("six dates in all", d.length, 6);
}

console.log("— kinds of company");
{
  const llp = companyPicture({ ...base, type: "llp" }, "2026-10-26");
  eq("an LLP has no Corporation Tax dates", llp.deadlines.filter((d) => d.to === "HMRC").length, 0);
  t("and says why", llp.notes.some((n) => /members are taxed/.test(n)));
  eq("an LLP still has its accounts", llp.deadlines.some((d) => d.kind === "ch-accounts"), true);
  const gone = companyPicture({ ...base, status: "dissolved" }, "2026-10-26");
  eq("a dissolved company has no dates", gone.deadlines.length, 0);
  t("and says it's dissolved", /dissolved/.test(gone.notes[0] ?? ""), gone.notes);
  eq("not active", gone.active, false);
  const dormant = companyPicture({ ...base, lastAccountsType: "dormant" }, "2026-10-26");
  t("dormant accounts bring a note about HMRC's notice", dormant.notes.some((n) => /notice to deliver/.test(n)));
  eq("no dates at all when Companies House give none", companyPicture({ ...base, nextAccountsMadeUpTo: null, nextAccountsDue: null, lastAccountsMadeUpTo: null, confirmationStatementDue: null }, "2026-10-26").deadlines.length, 0);
}

console.log("— reading the record");
{
  const p = profileFrom({ company_number: "1", company_name: "X", accounts: { last_accounts: { made_up_to: "2024-03-31", type: "dormant" } } });
  eq("the type of the last accounts is kept", p.lastAccountsType, "dormant");
  eq("missing type is null", profileFrom({}).lastAccountsType, null);
}

console.log("— words and numbers");
eq("in some days", whenWords(34), "in 34 days");
eq("today", whenWords(0), "today");
eq("tomorrow", whenWords(1), "tomorrow");
eq("ago", whenWords(-12), "12 days ago");
eq("an eight-digit number", asCompanyNumber("15123456"), "15123456");
eq("spaces are ignored", asCompanyNumber(" 1512 3456 "), "15123456");
eq("a short number is padded", asCompanyNumber("123456"), "00123456");
eq("a Scottish number", asCompanyNumber("sc612345"), "SC612345");
eq("too short to be a number: searched as a name", asCompanyNumber("1512"), null);
eq("a name", asCompanyNumber("brightshelf"), null);
eq("letters and digits in the wrong shape", asCompanyNumber("ABC12345"), null);

console.log("— lookup limits");
{
  const lim = makeLimiter({ perVisitor: 3, overall: 5, windowMs: 60_000 });
  const at = 1_000_000;
  eq("three for one visitor", [lim.take("a", at), lim.take("a", at + 1), lim.take("a", at + 2)].map((r) => r.ok), [true, true, true]);
  const fourth = lim.take("a", at + 3);
  eq("the fourth waits", fourth.ok ? null : fourth.who, "visitor");
  eq("for the rest of the window", fourth.ok ? null : fourth.retryInSeconds, 60);
  eq("another visitor still can", [lim.take("b", at + 4).ok, lim.take("b", at + 5).ok], [true, true]);
  const full = lim.take("c", at + 6);
  eq("then everyone waits", full.ok ? null : full.who, "everyone");
  eq("a refused lookup isn't counted", lim.take("c", at + 60_001).ok, true);
  eq("after the window, the first visitor can again", lim.take("a", at + 60_003).ok, true);
}
{
  const c = makeCache<number>(1000, 2);
  c.set("a", 1, 0); c.set("b", 2, 10);
  eq("kept", c.get("a", 500), 1);
  eq("forgotten after its time", c.get("a", 1000), undefined);
  c.set("c", 3, 20); c.set("d", 4, 30);
  eq("the oldest go when it's full", [c.get("b", 40), c.get("c", 40), c.get("d", 40)], [undefined, 3, 4]);
  eq("never more than its size", c.size, 2);
}
{
  const h = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null });
  eq("first forwarded address", visitorFrom(h({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" })), "203.0.113.9");
  eq("real ip", visitorFrom(h({ "x-real-ip": "198.51.100.2" })), "198.51.100.2");
  eq("nothing", visitorFrom(h({})), "unknown");
}

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
