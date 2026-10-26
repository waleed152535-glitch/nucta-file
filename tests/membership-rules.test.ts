import {
  checkPlans, plansFrom, DEFAULT_PLANS, membershipEnds, currentMembership, nextMembership, purchaseWindow, coverWords, returnsLeft,
  membershipDescription, membershipEmail, type MembershipLike,
} from "../lib/membership-rules";

let passed = 0, failed = 0;
const t = (name: string, ok: boolean, got?: unknown) => { if (ok) passed++; else { failed++; console.log("FAIL", name, got === undefined ? "" : JSON.stringify(got)); } };
const eq = (name: string, got: unknown, want: unknown) => t(name, JSON.stringify(got) === JSON.stringify(want), { got, want });

console.log("— plans");
eq("the starting plans pass their own check", checkPlans(DEFAULT_PLANS).ok, true);
eq("nothing saved: the starting plans", plansFrom(null), DEFAULT_PLANS);
eq("rubbish saved: the starting plans", plansFrom({ x: 1 }), DEFAULT_PLANS);
eq("an empty list saved: the starting plans", plansFrom([]), DEFAULT_PLANS);
{
  const r = checkPlans([{ key: "p30", name: "Small", returns: 2, price: 49, on: true }]);
  eq("a good plan", [r.ok, r.plans[0]?.returns, r.plans[0]?.price], [true, 2, 49]);
  const bad = checkPlans([
    { key: "P 1", name: "", returns: 0, price: 0 },
    { key: "dup", name: "A", returns: 10, price: 10.555 },
    { key: "dup", name: "B", returns: 2.5, price: 30000 },
  ]);
  eq("bad plans refused", bad.ok, false);
  t("each problem says which plan", bad.problems.some((p) => p.startsWith("Plan 1: the code")) && bad.problems.some((p) => p.startsWith("Plan 1: give it a name")) && bad.problems.some((p) => p.startsWith("Plan 1: the number")) && bad.problems.some((p) => p.startsWith("Plan 2: the price")) && bad.problems.some((p) => p.startsWith("Plan 3: another plan already uses")) && bad.problems.some((p) => p.startsWith("Plan 3: the number")), bad.problems);
  eq("not a list", checkPlans("x").ok, false);
  eq("the code is lower-cased", checkPlans([{ key: "P100", name: "x", returns: 1, price: 1 }]).plans[0]?.key, "p100");
  eq("off unless said otherwise is on", checkPlans([{ key: "p1", name: "x", returns: 1, price: 1 }]).plans[0]?.on, true);
  eq("too many plans", checkPlans(Array.from({ length: 9 }, (_, i) => ({ key: `p${i}`, name: "x", returns: 1, price: 1 }))).ok, false);
}

console.log("— twelve months");
eq("1 November to 31 October", membershipEnds("2026-11-01"), "2027-10-31");
eq("26 October to 25 October", membershipEnds("2026-10-26"), "2027-10-25");
eq("29 February to 28 February", membershipEnds("2028-02-29"), "2029-02-28");
eq("31 January to 30 January", membershipEnds("2026-01-31"), "2027-01-30");

console.log("— which one is in force");
const m = (id: string, startsOn: string, used: number, included = 10, status = "active"): MembershipLike => ({ id, planName: "Practice", returnsIncluded: included, used, startsOn, endsOn: membershipEnds(startsOn), status });
eq("none", currentMembership([], "2026-10-26"), null);
eq("one running", currentMembership([m("a", "2026-01-01", 3)], "2026-10-26")?.id, "a");
eq("one ended", currentMembership([m("a", "2025-01-01", 3)], "2026-10-26"), null);
eq("one refunded", currentMembership([m("a", "2026-01-01", 3, 10, "refunded")], "2026-10-26"), null);
eq("two running: the earlier one with returns left is used first", currentMembership([m("b", "2026-06-01", 0), m("a", "2026-01-01", 4)], "2026-10-26")?.id, "a");
eq("two running: the earlier is used up, so the later", currentMembership([m("a", "2026-01-01", 10), m("b", "2026-06-01", 0)], "2026-10-26")?.id, "b");
eq("all used up: the latest, to say so", currentMembership([m("a", "2026-01-01", 10), m("b", "2026-06-01", 10)], "2026-10-26")?.id, "b");
eq("the last day still counts", currentMembership([m("a", "2025-10-27", 1)], "2026-10-26")?.id, "a");
eq("bought, not started", nextMembership([m("a", "2026-01-01", 1), m("n", "2026-12-31", 0)], "2026-10-26")?.id, "n");
eq("returns left never negative", returnsLeft(m("a", "2026-01-01", 12)), 0);

console.log("— when one can be bought");
eq("with none: from today", purchaseWindow([], "2026-10-26"), { canBuy: true, startsOn: "2026-10-26", renewal: false });
eq("used up: from today", purchaseWindow([m("a", "2026-01-01", 10)], "2026-10-26"), { canBuy: true, startsOn: "2026-10-26", renewal: false });
{
  const w = purchaseWindow([m("a", "2026-06-01", 2)], "2026-10-26");
  t("returns left, months to go: not yet, saying when", !w.canBuy && /runs to 31 May 2027\. You can renew it from 1 May 2027/.test(w.why ?? ""), w);
}
eq("in the last 30 days: a renewal from the day after", purchaseWindow([m("a", "2025-11-20", 2)], "2026-10-26"), { canBuy: true, startsOn: "2026-11-20", renewal: true });
{
  const w = purchaseWindow([m("a", "2025-11-20", 2), m("n", "2026-11-20", 0)], "2026-10-26");
  t("already renewed: not again", !w.canBuy && /already bought: it starts on 20 November 2026/.test(w.why ?? ""), w);
}
eq("an ended one doesn't stop a new one", purchaseWindow([m("a", "2024-01-01", 2)], "2026-10-26").canBuy, true);

console.log("— words");
eq("before filing", coverWords(m("a", "2026-01-01", 3), false), "Covered by your Practice membership: this return will be 4 of 10, to 31 December 2026.");
eq("already counted", coverWords(m("a", "2026-01-01", 4), true), "Covered by your Practice membership: this return is 4 of 10, to 31 December 2026.");
eq("the payment's description", membershipDescription("Practice", 100, "2026-11-01"), "Nucta File membership: Practice, 100 returns, 1 November 2026 to 31 October 2027");
{
  const e = membershipEmail({ name: "Hina", planName: "Practice", returns: 100, amountPence: 29900, startsOn: "2026-11-01", paidAt: new Date("2026-10-26T10:00:00Z"), paymentId: "0f3a9c2e-1111-2222-3333-444455556666", receiptUrl: "https://pay.stripe.com/receipts/x", accountUrl: "https://x/account#membership", testMode: true });
  eq("email subject, marked as a test", e.subject, "[Test] Membership paid: Practice, 100 returns");
  t("email body: plan, dates, amount, reference, receipt, link", /Plan: Practice, up to 100 returns/.test(e.text) && /Runs: 1 November 2026 to 31 October 2027/.test(e.text) && /Amount: £299\.00/.test(e.text) && /Reference: NF-0F3A9C2E/.test(e.text) && /Card receipt: https:\/\/pay\.stripe\.com/.test(e.text) && /https:\/\/x\/account#membership/.test(e.text) && /no money was taken/.test(e.text), e.text);
  const live = membershipEmail({ name: "Hina", planName: "Practice", returns: 100, amountPence: 29900, startsOn: "2026-11-01", paidAt: new Date(), paymentId: "x", receiptUrl: null, accountUrl: "u", testMode: false });
  t("a real payment isn't marked as a test", !live.subject.startsWith("[Test]") && /Thank you/.test(live.text) && !/Card receipt/.test(live.text));
}

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
