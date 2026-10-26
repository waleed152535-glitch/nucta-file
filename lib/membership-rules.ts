/**
 * Yearly memberships for practices: a number of returns to file over twelve
 * months, paid once by card, instead of a fee per return. The rules, with
 * nothing that touches the network or the database, so each can be tested.
 *
 *  - The plans are set by Nucta File's administrators on the Payments page;
 *    these are the ones to start from.
 *  - A membership runs for twelve months from the day it starts.
 *  - Each return filed live with HMRC uses one of its returns, once: sending
 *    it again, filing both parts of a long period, and amending it later use
 *    nothing more.
 *  - A new one can be bought when there's none, when the current one's
 *    returns are used up (it starts straight away), or in the last 30 days
 *    (it starts the day after the current one ends).
 */
import { addYear, fromDay, isIsoDate, toDay } from "./tax/dates";
import { SITE } from "./site";
import { feeReference, pounds } from "./billing-rules";

export interface Plan {
  /** Short and unchanging, kept on each membership: "p100". */
  key: string;
  name: string;
  /** Returns that can be filed in the twelve months. */
  returns: number;
  /** In pounds, for the twelve months. */
  price: number;
  /** Whether practices can buy it now. */
  on: boolean;
}

export const DEFAULT_PLANS: Plan[] = [
  { key: "p30", name: "Small practice", returns: 30, price: 149, on: true },
  { key: "p100", name: "Practice", returns: 100, price: 299, on: true },
  { key: "p300", name: "Large practice", returns: 300, price: 749, on: true },
];

export const RENEW_DAYS = 30;

/** Checks plans typed on the Payments page; the problems are in words for the person typing. */
export function checkPlans(raw: unknown): { ok: boolean; plans: Plan[]; problems: string[] } {
  const problems: string[] = [];
  if (!Array.isArray(raw)) return { ok: false, plans: [], problems: ["The plans weren't a list."] };
  if (raw.length > 8) problems.push("Keep it to eight plans or fewer.");
  const plans: Plan[] = [];
  const keys = new Set<string>();
  raw.forEach((x, i) => {
    const o = (x ?? {}) as Record<string, unknown>;
    const n = `Plan ${i + 1}`;
    const key = String(o.key ?? "").trim().toLowerCase();
    const name = String(o.name ?? "").trim();
    const returns = Number(o.returns);
    const price = Number(o.price);
    if (!/^[a-z0-9-]{2,20}$/.test(key)) problems.push(`${n}: the code needs 2 to 20 letters, numbers or dashes.`);
    else if (keys.has(key)) problems.push(`${n}: another plan already uses the code "${key}".`);
    keys.add(key);
    if (!name || name.length > 40) problems.push(`${n}: give it a name of up to 40 characters.`);
    if (!Number.isInteger(returns) || returns < 1 || returns > 5000) problems.push(`${n}: the number of returns should be a whole number from 1 to 5,000.`);
    if (!Number.isFinite(price) || price < 1 || price > 20000 || Math.round(price * 100) !== price * 100) problems.push(`${n}: the price should be in pounds, from £1 to £20,000, with at most two decimal places.`);
    plans.push({ key, name, returns, price, on: o.on !== false });
  });
  return { ok: problems.length === 0, plans: problems.length ? [] : plans, problems };
}

/** Saved plans, or the starting ones when nothing usable is saved. */
export function plansFrom(saved: unknown): Plan[] {
  const r = checkPlans(saved);
  return r.ok && r.plans.length ? r.plans : DEFAULT_PLANS;
}

/** The last day of a membership that starts on `start`: twelve months, so 1 November to 31 October. */
export const membershipEnds = (start: string): string => fromDay(toDay(addYear(start)) - 1);

export interface MembershipLike {
  id: string;
  planName: string;
  returnsIncluded: number;
  used: number;
  startsOn: string;
  endsOn: string;
  /** active | refunded */
  status: string;
}

const running = (m: MembershipLike, today: string) => m.status === "active" && isIsoDate(m.startsOn) && isIsoDate(m.endsOn) && m.startsOn <= today && today <= m.endsOn;
export const returnsLeft = (m: MembershipLike) => Math.max(0, m.returnsIncluded - m.used);

/**
 * The membership in force today: of those running, the earliest with returns
 * left (it's used first), or else the latest one.
 */
export function currentMembership(list: MembershipLike[], today: string): MembershipLike | null {
  const now = list.filter((m) => running(m, today)).sort((a, b) => a.startsOn.localeCompare(b.startsOn));
  return now.find((m) => returnsLeft(m) > 0) ?? now[now.length - 1] ?? null;
}

/** One already bought that hasn't started. */
export const nextMembership = (list: MembershipLike[], today: string): MembershipLike | null =>
  list.filter((m) => m.status === "active" && m.startsOn > today).sort((a, b) => a.startsOn.localeCompare(b.startsOn))[0] ?? null;

/** Whether a membership can be bought today, and if so when it would start. */
export function purchaseWindow(list: MembershipLike[], today: string): { canBuy: boolean; startsOn: string; renewal: boolean; why?: string } {
  const up = nextMembership(list, today);
  if (up) return { canBuy: false, startsOn: up.startsOn, renewal: false, why: `Your next membership is already bought: it starts on ${long(up.startsOn)}.` };
  const cur = currentMembership(list, today);
  if (!cur) return { canBuy: true, startsOn: today, renewal: false };
  if (returnsLeft(cur) === 0) return { canBuy: true, startsOn: today, renewal: false };
  const daysLeft = toDay(cur.endsOn) - toDay(today);
  if (daysLeft <= RENEW_DAYS) return { canBuy: true, startsOn: fromDay(toDay(cur.endsOn) + 1), renewal: true };
  return {
    canBuy: false, startsOn: today, renewal: false,
    why: `Your membership runs to ${long(cur.endsOn)}. You can renew it from ${long(fromDay(toDay(cur.endsOn) - RENEW_DAYS))}, or straight away once its returns are used. To move to a bigger plan now, email ${SITE.email}.`,
  };
}

/** What the filing panel says about a membership that covers a return. */
export function coverWords(m: MembershipLike, alreadyCounted: boolean): string {
  const used = alreadyCounted ? m.used : m.used + 1;
  return `Covered by your ${m.planName} membership: this return ${alreadyCounted ? "is" : "will be"} ${used} of ${m.returnsIncluded}, to ${long(m.endsOn)}.`;
}

export const perReturn = (p: Plan) => p.price / p.returns;

export function long(iso: string): string {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export const membershipDescription = (planName: string, returns: number, startsOn: string) =>
  `Nucta File membership: ${planName}, ${returns.toLocaleString("en-GB")} returns, ${long(startsOn)} to ${long(membershipEnds(startsOn))}`;

export interface MembershipEmail {
  name: string;
  planName: string;
  returns: number;
  amountPence: number;
  startsOn: string;
  paidAt: Date;
  paymentId: string;
  receiptUrl: string | null;
  accountUrl: string;
  testMode: boolean;
}

/** The confirmation sent once Stripe confirm a membership's payment. */
export function membershipEmail(e: MembershipEmail): { subject: string; text: string } {
  const seller = [SITE.company, SITE.companyNumber ? `company number ${SITE.companyNumber}` : "", SITE.registeredOffice].filter(Boolean).join(", ");
  const on = e.paidAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });
  const lines = [
    `Hello ${e.name},`,
    "",
    e.testMode ? "This was a test payment: no money was taken." : "Thank you — your membership is paid.",
    "",
    `Plan: ${e.planName}, up to ${e.returns.toLocaleString("en-GB")} returns`,
    `Runs: ${long(e.startsOn)} to ${long(membershipEnds(e.startsOn))}`,
    `Amount: ${pounds(e.amountPence)}`,
    `Paid on: ${on}`,
    `Reference: ${feeReference(e.paymentId)}`,
    ...(e.receiptUrl ? [`Card receipt: ${e.receiptUrl}`] : []),
    "",
    "Each return you file with HMRC in that time uses one. Sending a return again, filing both parts of a period over 12 months, and amending it later use nothing more.",
    "",
    `See how many are left: ${e.accountUrl}`,
    "",
    `Questions about this payment: ${SITE.email}`,
    "",
    SITE.product,
    seller,
  ];
  return { subject: `${e.testMode ? "[Test] " : ""}Membership paid: ${e.planName}, ${e.returns} returns`, text: lines.join("\n") };
}
