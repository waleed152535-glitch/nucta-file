/**
 * Filing accounts with Companies House for real (build 53): test and live
 * kept apart, the checks before a filing, the Companies House copy that is
 * sent, and the plain-words help for rejections.
 *
 * Run: npx tsx tests/ch-filing.test.ts
 */
import { DOMParser } from "@xmldom/xmldom";
import { buildChAccountsEnvelope, chLiveReady, chPresenter, chRejectHelp, ixbrlForCompaniesHouse } from "../lib/companies-house";
import { accountsKindOf, chFilingChecks, chFilingFormProblems, FROM_CH_STATUS, CH_ACTIVE, CH_STATUS_WORDS, type ChFilingCheckInput } from "../lib/ch-filing";
import { buildAccounts } from "../lib/ixbrl";
import { accountsFromFigures } from "../lib/accounts-from-figures";
import { companiesHouseCopy } from "../lib/accounts/ch-form";

let passed = 0, failed = 0;
const t = (name: string, ok: boolean, got?: unknown) => { if (ok) passed++; else { failed++; console.log("FAIL", name, got === undefined ? "" : JSON.stringify(got)); } };

const KEYS = ["CH_PRESENTER_ID", "CH_PRESENTER_AUTH", "CH_PACKAGE_REFERENCE", "CH_LIVE_PRESENTER_ID", "CH_LIVE_PRESENTER_AUTH", "CH_LIVE_PACKAGE_REFERENCE", "CH_CONTACT_EMAIL", "HMRC_CONTACT_EMAIL"];
const keep = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
for (const k of KEYS) delete process.env[k];

console.log("— test and live kept apart");
process.env.CH_CONTACT_EMAIL = "info@example.com";
process.env.CH_PRESENTER_ID = "TESTID00001";
process.env.CH_PRESENTER_AUTH = "TESTAUTH001";
t("live off until its own codes are set", !chLiveReady() && chPresenter("live").presenter === null);
t("says which settings are missing", chPresenter("live").missing.some((m) => m.includes("CH_LIVE_PRESENTER_ID")) && chPresenter("live").missing.some((m) => m.includes("CH_LIVE_PRESENTER_AUTH")));
const test = chPresenter("test").presenter!;
t("test: package 0012 by default, test flag", test.packageReference === "0012" && test.test === true);
t("test codes are never used for live", chPresenter("live").presenter === null);
process.env.CH_LIVE_PRESENTER_ID = "E0000000000";
process.env.CH_LIVE_PRESENTER_AUTH = "LIVEAUTH001";
const live = chPresenter("live").presenter!;
t("live on once both are set", chLiveReady());
t("live: package 4356, not a test", live.packageReference === "4356" && live.test === false);
t("live uses the live codes", live.presenterId === "E0000000000" && live.authCode === "LIVEAUTH001");
t("test still uses the test codes", chPresenter("test").presenter!.presenterId === "TESTID00001");
process.env.CH_LIVE_PACKAGE_REFERENCE = "9999";
t("live package can be changed in the settings", chPresenter("live").presenter!.packageReference === "9999");
delete process.env.CH_LIVE_PACKAGE_REFERENCE;

console.log("— the envelope");
const accounts = buildAccounts(accountsFromFigures({
  companyName: "Brito Trades Ltd", companyNo: "16682318", periodFrom: "2025-08-29", periodTo: "2026-08-31",
  turnover: 48600, tradingProfits: 6150, corporationTax: 1168.5, marginalRelief: 0, taxPayable: 1168.5, approvedBy: "Umar Hayat", approvedOn: "2026-11-10",
}));
const sub = { companyNumber: "16682318", companyName: "Brito Trades Ltd", companyAuthCode: "abc123", contactName: "Waleed Sarfraz", contactNumber: "02079460000", dateSigned: "2026-11-10", submissionNumber: "0GCK00", transactionId: "000001A1D0D17CF2", ixbrl: ixbrlForCompaniesHouse(companiesHouseCopy(accounts)) };
const liveEnv = buildChAccountsEnvelope(live, sub);
const testEnv = buildChAccountsEnvelope(test, sub);
t("live: GatewayTest 0", liveEnv.includes("<GatewayTest>0</GatewayTest>"));
t("test: GatewayTest 1", testEnv.includes("<GatewayTest>1</GatewayTest>"));
t("live: package 4356", liveEnv.includes("<PackageReference>4356</PackageReference>"));
t("test: package 0012", testEnv.includes("<PackageReference>0012</PackageReference>"));
t("auth code sent in capitals", liveEnv.includes("<CompanyAuthenticationCode>ABC123</CompanyAuthenticationCode>"));
t("envelope is well-formed XML", new DOMParser({ onError: () => { throw new Error("bad xml"); } }).parseFromString(liveEnv, "text/xml") !== null);

console.log("— the Companies House copy that is sent");
const ch = companiesHouseCopy(accounts);
t("no profit and loss account", !ch.includes("<h2>Profit and loss account</h2>"));
t("keeps the balance sheet", ch.includes("Balance sheet as at"));
t("says so, under section 444", ch.includes("section 444"));
let bad = "";
const doc = new DOMParser({ onError: (_l: string, m: string) => { bad = m; } }).parseFromString(ixbrlForCompaniesHouse(ch).replace(/^<\?xml[^>]*\?>\s*/, ""), "text/xml");
t("still well-formed XHTML", !bad, bad);
const ids = new Set(Array.from(doc.getElementsByTagName("xbrli:context")).map((c) => c.getAttribute("id")));
const units = new Set(Array.from(doc.getElementsByTagName("xbrli:unit")).map((c) => c.getAttribute("id")));
const facts = [...Array.from(doc.getElementsByTagName("ix:nonFraction")), ...Array.from(doc.getElementsByTagName("ix:nonNumeric"))];
t("has tagged facts", facts.length > 10, facts.length);
t("every fact's context is still there", facts.every((f) => ids.has(f.getAttribute("contextRef"))));
t("every amount's unit is still there", Array.from(doc.getElementsByTagName("ix:nonFraction")).every((f) => units.has(f.getAttribute("unitRef"))));
t("no turnover tagged in the public copy", !/name="[^"]*TurnoverRevenue"/.test(ch));
t("micro", accountsKindOf(accounts, false) === "micro");
t("dormant", accountsKindOf(accounts, true) === "dormant");
t("small", accountsKindOf("… subject to the small companies regime …", false) === "small");

console.log("— checks before filing");
const base: ChFilingCheckInput = { companyNo: "16682318", companyName: "BRITO TRADES LTD", periodTo: "2026-08-31", director: "Umar Hayat", approvedOn: "2026-11-10", accountsReady: true, today: "2026-11-19", latest: null, profile: null };
const ok = chFilingChecks(base);
t("a ready return can be filed", ok.problems.length === 0, ok.problems);
const p = (over: Partial<ChFilingCheckInput>) => chFilingChecks({ ...base, ...over }).problems;
t("not twice while one is with Companies House", p({ latest: { status: "pending", submissionNumber: "0GCK00" } }).some((x) => x.includes("still with Companies House")));
t("not after acceptance", p({ latest: { status: "accepted", submissionNumber: "0GCK00" } }).some((x) => x.includes("already accepted")));
t("again after a rejection", p({ latest: { status: "rejected", submissionNumber: "0GCK00" } }).length === 0);
t("again after the gateway refused it", p({ latest: { status: "refused", submissionNumber: "0GCK00" } }).length === 0);
t("not while receipt is unconfirmed", p({ latest: { status: "unknown", submissionNumber: "0GCK00" } }).length === 1);
t("needs a company number", p({ companyNo: null }).some((x) => x.includes("company number")));
t("needs a valid company number", p({ companyNo: "OC123456" }).length > 0);
t("needs the director", p({ director: "" }).some((x) => x.includes("director")));
t("needs an approval date", p({ approvedOn: "" }).some((x) => x.includes("approved")));
t("approval after the year end", p({ approvedOn: "2026-08-31" }).some((x) => x.includes("after the year end")));
t("approval not in the future", p({ approvedOn: "2026-12-01" }).some((x) => x.includes("future")));
t("needs the accounts", p({ accountsReady: false }).some((x) => x.includes("accounts aren't ready")));
const profile = { number: "16682318", name: "BRITO TRADES LTD", status: "active", type: "ltd", incorporatedOn: "2025-08-29", registeredOffice: "", sic: [], ard: { day: 31, month: 8 }, nextAccountsMadeUpTo: "2026-08-31", nextAccountsDue: "2027-05-31", accountsOverdue: false, lastAccountsMadeUpTo: null, confirmationStatementDue: null, fetchedAt: "2026-11-19" };
t("register agrees: nothing to say", chFilingChecks({ ...base, profile }).warnings.length === 0 && chFilingChecks({ ...base, profile }).problems.length === 0);
t("already filed for this date", p({ profile: { ...profile, lastAccountsMadeUpTo: "2026-08-31", nextAccountsMadeUpTo: "2027-08-31" } }).some((x) => x.includes("already have accounts")));
t("dissolved company", p({ profile: { ...profile, status: "dissolved" } }).some((x) => x.includes("dissolved")));
t("different year end: a warning", chFilingChecks({ ...base, profile: { ...profile, nextAccountsMadeUpTo: "2026-09-30" } }).warnings.some((x) => x.includes("2026-09-30")));
t("Ltd and Limited are the same name", chFilingChecks({ ...base, companyName: "Brito Trades Limited", profile }).warnings.length === 0);
t("a different name: a warning", chFilingChecks({ ...base, companyName: "Brito Trading Ltd", profile }).warnings.some((x) => x.includes("isn't exactly the name")));

console.log("— what the person filing types");
const form = { authCode: "ABC123", contactName: "Waleed Sarfraz", contactPhone: "020 7946 0000", confirmed: true };
t("complete form passes", chFilingFormProblems(form).length === 0, chFilingFormProblems(form));
t("code must be 6", chFilingFormProblems({ ...form, authCode: "ABC12" }).length === 1);
t("needs a contact", chFilingFormProblems({ ...form, contactName: " " }).some((x) => x.includes("contact name")));
t("needs a phone", chFilingFormProblems({ ...form, contactPhone: "call me" }).some((x) => x.includes("phone")));
t("needs the confirmation", chFilingFormProblems({ ...form, confirmed: false }).some((x) => x.includes("Tick")));

console.log("— statuses and rejections");
t("every Companies House status has words", Object.values(FROM_CH_STATUS).every((s) => CH_STATUS_WORDS[s]));
t("accepted counts as done", CH_ACTIVE.includes("accepted"));
t("auth code", /authentication code/.test(chRejectHelp("Company authentication code is invalid") ?? ""));
t("name", /name/.test(chRejectHelp("Company name does not match our records") ?? ""));
t("made up date", /AA01/.test(chRejectHelp("Made up date does not match accounting reference date") ?? ""));
t("already filed", /already hold/.test(chRejectHelp("Accounts already filed for this period") ?? ""));
t("software fault", /software problem/.test(chRejectHelp("iXBRL failed taxonomy validation") ?? ""));
t("unknown reason: no guess", chRejectHelp("Admin Rejected: (code 1)") === null);

for (const k of KEYS) { if (keep[k] === undefined) delete process.env[k]; else process.env[k] = keep[k]; }
console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
