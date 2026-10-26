/**
 * The filing fee, taken by Stripe Checkout. Server only; not a "use server"
 * file — the browser reaches this through billing-actions.ts and the webhook.
 *
 * How a payment goes:
 *   1. The customer presses "Pay" on a return. Nucta File asks Stripe for a
 *      Checkout page for that return's fee and sends the customer there.
 *      Card details are typed into Stripe's page only; Nucta File never sees them.
 *   2. Stripe tell Nucta File the payment went through, twice over: by the
 *      webhook (/api/stripe/webhook, signed with STRIPE_WEBHOOK_SECRET), and
 *      when the customer comes back, by Nucta File asking Stripe directly.
 *      Either way the payment is read from Stripe itself, never taken from
 *      the browser's word, and whichever comes first marks it paid.
 *   3. The first time a payment is seen as paid, the confirmation email goes,
 *      once (a database update that only one request can win).
 *
 * Charging is off until an administrator switches it on (Payments page), and
 * only works while STRIPE_SECRET_KEY is set. Administrators never pay. A fee
 * covers the return, sending it again, and any amendment of it.
 */
import { randomUUID } from "crypto";
import type { SignedInUser } from "./auth";
import { sendEmailChecked, emailReady } from "./auth";
import { store, siteUrl, type Store } from "./store";
import { normaliseReturnData, type ReturnData } from "./return-model";
import { feeAmount, feeEmail, feeReference, stripeForm, stripeKeyMode } from "./billing-rules";
import {
  coverWords, currentMembership, membershipDescription, membershipEmail, membershipEnds, plansFrom, returnsLeft,
  type MembershipLike, type Plan,
} from "./membership-rules";

export const STRIPE_VERSION = "2024-06-20";
const stripeBase = () => (process.env.STRIPE_API_BASE ?? "https://api.stripe.com").replace(/\/+$/, "");
export const stripeReady = () => stripeKeyMode(process.env.STRIPE_SECRET_KEY) !== null;
export const webhookReady = () => /^whsec_/.test(process.env.STRIPE_WEBHOOK_SECRET ?? "");
export const stripeMode = () => stripeKeyMode(process.env.STRIPE_SECRET_KEY);

// ---- the setting ----

export interface BillingSettings { charging: boolean; changedBy: string | null; changedAt: string | null }
const KEY = "billing";

export async function getBillingSettings(): Promise<BillingSettings> {
  try {
    const s = await store();
    const [row] = await s.db.select().from(s.settings).where(s.eq(s.settings.key, KEY));
    const v = (row?.value ?? {}) as Partial<BillingSettings>;
    return { charging: v.charging === true, changedBy: typeof v.changedBy === "string" ? v.changedBy : null, changedAt: typeof v.changedAt === "string" ? v.changedAt : null };
  } catch {
    return { charging: false, changedBy: null, changedAt: null };
  }
}

export async function saveBillingSettings(charging: boolean, by: string): Promise<BillingSettings> {
  const s = await store();
  const value: BillingSettings = { charging, changedBy: by, changedAt: new Date().toISOString() };
  await s.db.insert(s.settings).values({ key: KEY, value, updatedBy: by, updatedAt: new Date() })
    .onConflictDoUpdate({ target: s.settings.key, set: { value, updatedBy: by, updatedAt: new Date() } });
  return value;
}

/** Whether filing costs anything right now: switched on, and Stripe set up. */
export async function chargingOn(): Promise<boolean> {
  return stripeReady() && (await getBillingSettings()).charging;
}

// ---- memberships: the plans, and an account's memberships ----

const PLANS_KEY = "plans";

export async function getPlans(): Promise<Plan[]> {
  try {
    const s = await store();
    const [row] = await s.db.select().from(s.settings).where(s.eq(s.settings.key, PLANS_KEY));
    return plansFrom(row?.value);
  } catch {
    return plansFrom(null);
  }
}

export async function savePlans(plans: Plan[], by: string): Promise<void> {
  const s = await store();
  await s.db.insert(s.settings).values({ key: PLANS_KEY, value: plans, updatedBy: by, updatedAt: new Date() })
    .onConflictDoUpdate({ target: s.settings.key, set: { value: plans, updatedBy: by, updatedAt: new Date() } });
}

export interface MembershipRow extends MembershipLike { planKey: string; amount: number; paymentId: string; account?: string }

/** An account's memberships with how many returns each has used, oldest first. */
export async function accountMemberships(s: Store, accountId: string): Promise<MembershipRow[]> {
  const rows = await s.db.select().from(s.memberships).where(s.eq(s.memberships.accountId, accountId)).orderBy(s.asc(s.memberships.startsOn));
  return withUse(s, rows);
}

async function withUse(s: Store, rows: (typeof import("./schema").memberships.$inferSelect)[], names?: Map<string, string>): Promise<MembershipRow[]> {
  if (!rows.length) return [];
  const counts = await s.db.select({ id: s.membershipUses.membershipId, n: s.sql<number>`count(*)::int` }).from(s.membershipUses)
    .where(s.inArray(s.membershipUses.membershipId, rows.map((r) => r.id))).groupBy(s.membershipUses.membershipId);
  const used = new Map(counts.map((c) => [c.id, Number(c.n)]));
  return rows.map((r) => ({
    id: r.id, planKey: r.planKey, planName: r.planName, returnsIncluded: r.returnsIncluded, used: used.get(r.id) ?? 0,
    startsOn: r.startsOn, endsOn: r.endsOn, status: r.status, amount: r.amount / 100, paymentId: r.paymentId, account: names?.get(r.accountId),
  }));
}

/** Every account's memberships, newest first, for the administrators. */
export async function recentMemberships(limit = 50): Promise<MembershipRow[]> {
  const s = await store();
  const rows = await s.db.select().from(s.memberships).orderBy(s.desc(s.memberships.createdAt)).limit(limit);
  const accts = rows.length ? await s.db.select({ id: s.accounts.id, name: s.accounts.name }).from(s.accounts).where(s.inArray(s.accounts.id, [...new Set(rows.map((r) => r.accountId))])) : [];
  return withUse(s, rows, new Map(accts.map((a) => [a.id, a.name])));
}

/**
 * Counts a return against a membership, once. Refused when the membership's
 * returns are all used — unless this return was already counted.
 */
export async function useMembership(s: Store, membershipId: string, returnId: string): Promise<boolean> {
  const [m] = await s.db.select().from(s.memberships).where(s.eq(s.memberships.id, membershipId));
  if (!m || m.status !== "active") return false;
  const [already] = await s.db.select().from(s.membershipUses).where(s.eq(s.membershipUses.returnId, returnId));
  if (already) return already.membershipId === membershipId;
  const done = await s.db.execute(s.sql`
    INSERT INTO nf_membership_uses (return_id, membership_id)
    SELECT ${returnId}, ${membershipId}
    WHERE (SELECT count(*) FROM nf_membership_uses WHERE membership_id = ${membershipId}) < ${m.returnsIncluded}
    ON CONFLICT (return_id) DO NOTHING
    RETURNING return_id`);
  const rows = (done as unknown as { rows?: unknown[] }).rows ?? (done as unknown as unknown[]);
  return Array.isArray(rows) && rows.length > 0;
}

const isoToday = () => new Date().toISOString().slice(0, 10);

// ---- what a return owes ----

export interface FeeState {
  /**
   * free: not charging. admin: Nucta File's own staff. paid: this return or the one it amends is paid.
   * amendment/before: covered by an earlier filing. membership: covered by the practice's membership.
   * due: pay before filing.
   */
  status: "free" | "admin" | "paid" | "amendment" | "before" | "membership" | "due";
  /** The membership that covers it, when one does. */
  membershipId?: string;
  /** In pounds. */
  amount: number;
  words: string;
  paidAt: string | null;
  receiptUrl: string | null;
  reference: string | null;
  testMode: boolean;
}

const filedLive = (d: ReturnData) => Object.values(d.sent ?? {}).some((x) => x.status === "accepted" || x.status === "submitted-live");

/** This return and the returns it amends, newest first. */
async function chain(s: Store, returnId: string): Promise<{ id: string; status: string; data: ReturnData }[]> {
  const out: { id: string; status: string; data: ReturnData }[] = [];
  let id: string | null = returnId;
  for (let i = 0; i < 6 && id; i++) {
    const [r] = await s.db.select({ id: s.returns.id, status: s.returns.status, data: s.returns.data }).from(s.returns).where(s.eq(s.returns.id, id));
    if (!r) break;
    const d = normaliseReturnData(r.data as Partial<ReturnData>);
    out.push({ id: r.id, status: r.status, data: d });
    id = d.amends?.returnId ?? null;
  }
  return out;
}

export async function feeState(s: Store, u: SignedInUser, returnId: string): Promise<FeeState> {
  const testMode = stripeMode() === "test";
  const base = { paidAt: null, receiptUrl: null, reference: null, testMode };
  const links = await chain(s, returnId);
  const me = links[0];
  const amount = feeAmount(u.accountKind, Boolean(me?.data.dormant));
  if (links.length) {
    const [paid] = await s.db.select().from(s.payments)
      .where(s.and(s.inArray(s.payments.returnId, links.map((x) => x.id)), s.eq(s.payments.status, "paid")))
      .orderBy(s.desc(s.payments.paidAt)).limit(1);
    if (paid) {
      return {
        status: "paid", amount: paid.amount / 100, paidAt: paid.paidAt?.toISOString() ?? null, receiptUrl: paid.receiptUrl, reference: feeReference(paid.id), testMode,
        words: paid.returnId === returnId ? "The filing fee is paid." : "The fee paid for the original return covers this amendment.",
      };
    }
  }
  if (!(await chargingOn())) return { ...base, status: "free", amount: 0, words: "Filing is free while Nucta File launches." };
  if (u.admin) return { ...base, status: "admin", amount: 0, words: "Nucta File's administrators file without paying." };
  if (me && filedLive(me.data)) return { ...base, status: "before", amount: 0, words: "Part of this return was filed before charging started, so the rest is free too." };
  if (links.slice(1).some((x) => x.status === "accepted" || filedLive(x.data))) return { ...base, status: "amendment", amount: 0, words: "Amendments are included: the original return was filed with HMRC." };
  // A practice's membership: this return already counted against one, or the one in force with returns left.
  const mine = await accountMemberships(s, u.accountId);
  if (mine.length) {
    const [counted] = await s.db.select().from(s.membershipUses).where(s.inArray(s.membershipUses.returnId, links.map((x) => x.id)));
    const was = counted && mine.find((m) => m.id === counted.membershipId && m.status === "active");
    if (was) return { ...base, status: "membership", amount: 0, membershipId: was.id, words: coverWords(was, true) };
    const cur = currentMembership(mine, isoToday());
    if (cur && returnsLeft(cur) > 0) return { ...base, status: "membership", amount: 0, membershipId: cur.id, words: coverWords(cur, false) };
    if (cur) return { ...base, status: "due", amount, words: `Your ${cur.planName} membership's ${cur.returnsIncluded} returns are all used, so this one is £${amount} by card — or buy another membership from Your account.` };
  }
  return { ...base, status: "due", amount, words: `The filing fee is £${amount}, paid by card before filing.` };
}

// ---- Stripe ----

interface StripeError { error?: { message?: string; type?: string } }

async function stripe<T>(method: "GET" | "POST", path: string, body?: Record<string, unknown>, idempotencyKey?: string): Promise<T> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY isn't set.");
  const r = await fetch(`${stripeBase()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`, "Stripe-Version": STRIPE_VERSION,
      ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: body ? stripeForm(body) : undefined,
    cache: "no-store",
  });
  const text = await r.text();
  let json: unknown = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  if (!r.ok) throw new Error(`Stripe said (${r.status}): ${(json as StripeError)?.error?.message ?? text.slice(0, 200)}`);
  return json as T;
}

interface CheckoutSession {
  id: string;
  url: string | null;
  status: "open" | "complete" | "expired" | null;
  payment_status: "paid" | "unpaid" | "no_payment_required";
  amount_total: number | null;
  currency: string | null;
  client_reference_id: string | null;
  customer_email: string | null;
  customer_details?: { email?: string | null } | null;
  metadata?: Record<string, string> | null;
  payment_intent: string | { id: string; latest_charge?: string | { id: string; receipt_url?: string | null } | null } | null;
}

export interface StartedCheckout { ok: boolean; url?: string; problem?: string; alreadyPaid?: boolean }

/** Makes a Stripe Checkout page for a return's fee. The caller has checked the return belongs to the person. */
export async function startCheckout(u: SignedInUser, r: { id: string; companyName: string; periodStart: string; periodEnd: string }, amount: number): Promise<StartedCheckout> {
  const s = await store();
  // An unfinished payment for this return is checked first: if it went through
  // in another tab, there's nothing to pay; if it's still open, it's closed so
  // the fee can't be paid twice.
  const open = await s.db.select().from(s.payments).where(s.and(s.eq(s.payments.returnId, r.id), s.eq(s.payments.status, "pending")));
  for (const p of open) {
    const now = await syncCheckoutSession(p.stripeSessionId).catch(() => null);
    if (now?.status === "paid") return { ok: false, alreadyPaid: true, problem: "This return's fee has just been paid." };
    if (now?.status === "pending") {
      await stripe("POST", `/v1/checkout/sessions/${encodeURIComponent(p.stripeSessionId)}/expire`).catch(() => undefined);
      await s.db.update(s.payments).set({ status: "expired" }).where(s.and(s.eq(s.payments.id, p.id), s.eq(s.payments.status, "pending")));
    }
  }
  const paymentId = randomUUID();
  const day = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const description = `${r.companyName}: Company Tax Return for ${day(r.periodStart)} to ${day(r.periodEnd)}`;
  const origin = siteUrl();
  const back = `${origin}/returns/${r.id}`;
  const meta = { nf_app: "nucta-file", nf_payment: paymentId, nf_return: r.id, nf_account: u.accountId, nf_user: u.id };
  const cs = await stripe<CheckoutSession>("POST", "/v1/checkout/sessions", {
    mode: "payment",
    line_items: [{ quantity: 1, price_data: { currency: "gbp", unit_amount: Math.round(amount * 100), product_data: { name: "Company Tax Return filing (Nucta File)", description } } }],
    customer_email: u.email,
    client_reference_id: paymentId,
    metadata: { ...meta, nf_desc: description.slice(0, 450) },
    payment_intent_data: { description: `Nucta File: ${description}`.slice(0, 1000), metadata: meta },
    success_url: `${back}?fee=back&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${back}?fee=cancelled`,
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
  }, paymentId);
  if (!cs.url) return { ok: false, problem: "Stripe didn't give a payment page. Try again in a moment." };
  await s.db.insert(s.payments).values({
    id: paymentId, accountId: u.accountId, returnId: r.id, userId: u.id, stripeSessionId: cs.id,
    amount: cs.amount_total ?? Math.round(amount * 100), currency: cs.currency ?? "gbp", description, status: "pending", email: u.email,
  }).onConflictDoNothing();
  return { ok: true, url: cs.url };
}

/** Makes a Stripe Checkout page for a membership. The caller has checked the person may buy it, and when it starts. */
export async function startMembershipCheckout(u: SignedInUser, plan: Plan, startsOn: string): Promise<StartedCheckout> {
  const s = await store();
  // Close any unfinished membership payment first, so two can't both be paid.
  const open = await s.db.select().from(s.payments).where(s.and(s.eq(s.payments.accountId, u.accountId), s.eq(s.payments.kind, "membership"), s.eq(s.payments.status, "pending")));
  for (const p of open) {
    const now = await syncCheckoutSession(p.stripeSessionId).catch(() => null);
    if (now?.status === "paid") return { ok: false, alreadyPaid: true, problem: "A membership has just been paid for this account." };
    if (now?.status === "pending") {
      await stripe("POST", `/v1/checkout/sessions/${encodeURIComponent(p.stripeSessionId)}/expire`).catch(() => undefined);
      await s.db.update(s.payments).set({ status: "expired" }).where(s.and(s.eq(s.payments.id, p.id), s.eq(s.payments.status, "pending")));
    }
  }
  const paymentId = randomUUID();
  const description = membershipDescription(plan.name, plan.returns, startsOn);
  const back = `${siteUrl()}/account`;
  const meta = { nf_app: "nucta-file", nf_kind: "membership", nf_payment: paymentId, nf_account: u.accountId, nf_user: u.id, nf_plan: plan.key, nf_plan_name: plan.name.slice(0, 40), nf_returns: String(plan.returns), nf_starts: startsOn };
  const cs = await stripe<CheckoutSession>("POST", "/v1/checkout/sessions", {
    mode: "payment",
    line_items: [{ quantity: 1, price_data: { currency: "gbp", unit_amount: Math.round(plan.price * 100), product_data: { name: `Nucta File membership: ${plan.name}`, description } } }],
    customer_email: u.email,
    client_reference_id: paymentId,
    metadata: { ...meta, nf_desc: description.slice(0, 450) },
    payment_intent_data: { description: description.slice(0, 1000), metadata: meta },
    success_url: `${back}?membership=back&session_id={CHECKOUT_SESSION_ID}#membership`,
    cancel_url: `${back}?membership=cancelled#membership`,
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
  }, paymentId);
  if (!cs.url) return { ok: false, problem: "Stripe didn't give a payment page. Try again in a moment." };
  await s.db.insert(s.payments).values({
    id: paymentId, accountId: u.accountId, returnId: null, kind: "membership", userId: u.id, stripeSessionId: cs.id,
    amount: cs.amount_total ?? Math.round(plan.price * 100), currency: cs.currency ?? "gbp", description, status: "pending", email: u.email,
  }).onConflictDoNothing();
  return { ok: true, url: cs.url };
}

/** Makes the membership a paid payment bought, once. */
async function ensureMembership(s: Store, p: typeof import("./schema").payments.$inferSelect, m: Record<string, string>): Promise<void> {
  const returns = Number(m.nf_returns);
  const startsOn = /^\d{4}-\d{2}-\d{2}$/.test(m.nf_starts ?? "") ? m.nf_starts : (p.paidAt ?? new Date()).toISOString().slice(0, 10);
  if (!Number.isInteger(returns) || returns < 1) return;
  await s.db.insert(s.memberships).values({
    id: randomUUID(), accountId: p.accountId, paymentId: p.id, planKey: m.nf_plan || "plan", planName: m.nf_plan_name || "Membership",
    returnsIncluded: returns, amount: p.amount, startsOn, endsOn: membershipEnds(startsOn), status: "active",
  }).onConflictDoNothing();
}

export interface Synced { status: "paid" | "pending" | "expired" | "refunded" | "ignored"; kind?: "filing" | "membership"; paymentId?: string; returnId?: string | null; accountId?: string; emailed?: boolean }

/**
 * Reads a Checkout session from Stripe and brings the payment up to date.
 * Sessions that aren't Nucta File's (other sales on the same Stripe account)
 * are left alone.
 */
export async function syncCheckoutSession(sessionId: string): Promise<Synced> {
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return { status: "ignored" };
  const cs = await stripe<CheckoutSession>("GET", `/v1/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=payment_intent.latest_charge`);
  const m = cs.metadata ?? {};
  const kind = m.nf_kind === "membership" ? "membership" : "filing";
  if (m.nf_app !== "nucta-file" || !m.nf_account || (kind === "filing" && !m.nf_return)) return { status: "ignored" };
  const s = await store();
  const pi = cs.payment_intent && typeof cs.payment_intent === "object" ? cs.payment_intent : null;
  const paymentIntent = typeof cs.payment_intent === "string" ? cs.payment_intent : pi?.id ?? null;
  const charge = pi?.latest_charge && typeof pi.latest_charge === "object" ? pi.latest_charge : null;
  const paid = cs.payment_status === "paid" || cs.payment_status === "no_payment_required";
  const status = paid ? "paid" : cs.status === "expired" ? "expired" : "pending";

  let [row] = await s.db.select().from(s.payments).where(s.eq(s.payments.stripeSessionId, cs.id));
  if (!row) {
    // Paid, but the record wasn't written when the page was made: write it now from what Stripe hold.
    await s.db.insert(s.payments).values({
      id: m.nf_payment && /^[0-9a-f-]{36}$/.test(m.nf_payment) ? m.nf_payment : randomUUID(), accountId: m.nf_account, returnId: kind === "filing" ? m.nf_return : null, kind, userId: m.nf_user ?? "",
      stripeSessionId: cs.id, amount: cs.amount_total ?? 0, currency: cs.currency ?? "gbp", description: m.nf_desc ?? (kind === "membership" ? "Nucta File membership" : "Company Tax Return filing"),
      status: "pending", email: cs.customer_details?.email ?? cs.customer_email ?? null,
    }).onConflictDoNothing();
    [row] = await s.db.select().from(s.payments).where(s.eq(s.payments.stripeSessionId, cs.id));
    if (!row) return { status: "ignored" };
  }
  if (row.status === "refunded") return { status: "refunded", kind, paymentId: row.id, returnId: row.returnId, accountId: row.accountId };
  await s.db.update(s.payments).set({
    status, paymentIntent: paymentIntent ?? row.paymentIntent, receiptUrl: charge?.receipt_url ?? row.receiptUrl,
    amount: cs.amount_total ?? row.amount, paidAt: paid ? row.paidAt ?? new Date() : row.paidAt,
  }).where(s.eq(s.payments.id, row.id));

  let emailed = false;
  if (paid && kind === "membership") {
    const [now] = await s.db.select().from(s.payments).where(s.eq(s.payments.id, row.id));
    await ensureMembership(s, now ?? row, m);
  }
  if (paid) {
    // Only one request can set confirmed_at, so the email goes once.
    const [claimed] = await s.db.update(s.payments).set({ confirmedAt: new Date() })
      .where(s.and(s.eq(s.payments.id, row.id), s.isNull(s.payments.confirmedAt))).returning();
    if (claimed) {
      emailed = await sendFeeConfirmation(s, claimed, m);
      // If it couldn't go, the next look at this payment tries again.
      if (!emailed && emailReady()) await s.db.update(s.payments).set({ confirmedAt: null }).where(s.eq(s.payments.id, row.id));
    }
  }
  return { status, kind, paymentId: row.id, returnId: row.returnId, accountId: row.accountId, emailed };
}

async function sendFeeConfirmation(s: Store, p: typeof import("./schema").payments.$inferSelect, m: Record<string, string> = {}): Promise<boolean> {
  if (!emailReady()) return false;
  const [u] = p.userId ? await s.db.select({ name: s.users.name, email: s.users.email }).from(s.users).where(s.eq(s.users.id, p.userId)) : [];
  const to = u?.email ?? p.email;
  if (!to) return false;
  if (p.kind === "membership") {
    const [ms] = await s.db.select().from(s.memberships).where(s.eq(s.memberships.paymentId, p.id));
    const mail = membershipEmail({
      name: u?.name ?? "there", planName: ms?.planName ?? m.nf_plan_name ?? "Membership", returns: ms?.returnsIncluded ?? Number(m.nf_returns || 0),
      amountPence: p.amount, startsOn: ms?.startsOn ?? m.nf_starts ?? (p.paidAt ?? new Date()).toISOString().slice(0, 10), paidAt: p.paidAt ?? new Date(),
      paymentId: p.id, receiptUrl: p.receiptUrl, accountUrl: `${siteUrl()}/account#membership`, testMode: stripeMode() === "test",
    });
    return (await sendEmailChecked(to, mail.subject, mail.text)).ok;
  }
  const mail = feeEmail({
    name: u?.name ?? "there", amountPence: p.amount, description: p.description, paidAt: p.paidAt ?? new Date(), paymentId: p.id,
    receiptUrl: p.receiptUrl, returnUrl: `${siteUrl()}/returns/${p.returnId}`, testMode: stripeMode() === "test",
  });
  return (await sendEmailChecked(to, mail.subject, mail.text)).ok;
}

/** A refund made in Stripe's dashboard: a fully refunded fee no longer covers the return. */
export async function markRefunded(paymentIntent: string, fully: boolean): Promise<void> {
  if (!fully || !paymentIntent) return;
  const s = await store();
  const done = await s.db.update(s.payments).set({ status: "refunded" }).where(s.eq(s.payments.paymentIntent, paymentIntent)).returning({ id: s.payments.id });
  // A refunded membership stops covering returns.
  if (done.length) await s.db.update(s.memberships).set({ status: "refunded" }).where(s.inArray(s.memberships.paymentId, done.map((d) => d.id)));
}

export interface PaymentRow {
  id: string; reference: string; at: string; paidAt: string | null; description: string; amount: number; status: string; receiptUrl: string | null;
  returnId: string | null; kind: string; email: string | null; account?: string;
}

const toRow = (p: typeof import("./schema").payments.$inferSelect, account?: string): PaymentRow => ({
  id: p.id, reference: feeReference(p.id), at: p.createdAt.toISOString(), paidAt: p.paidAt?.toISOString() ?? null, description: p.description,
  amount: p.amount / 100, status: p.status, receiptUrl: p.receiptUrl, returnId: p.returnId, kind: p.kind, email: p.email, account,
});

/** An account's payments, newest first — the ones that got as far as Stripe. */
export async function accountPayments(accountId: string): Promise<PaymentRow[]> {
  const s = await store();
  const rows = await s.db.select().from(s.payments).where(s.and(s.eq(s.payments.accountId, accountId), s.ne(s.payments.status, "expired"))).orderBy(s.desc(s.payments.createdAt)).limit(100);
  return rows.filter((p) => p.status !== "pending" || Date.now() - p.createdAt.getTime() < 3_600_000).map((p) => toRow(p));
}

/** Every account's payments, for the administrators. */
export async function recentPayments(limit = 50): Promise<PaymentRow[]> {
  const s = await store();
  const rows = await s.db.select({ p: s.payments, account: s.accounts.name }).from(s.payments)
    .leftJoin(s.accounts, s.eq(s.accounts.id, s.payments.accountId))
    .orderBy(s.desc(s.payments.createdAt)).limit(limit);
  return rows.map((x) => toRow(x.p, x.account ?? undefined));
}
