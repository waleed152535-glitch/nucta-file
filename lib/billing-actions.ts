"use server";

/**
 * The filing fee, from the browser: paying for a return, checking a payment
 * when the customer comes back from Stripe, the account's payment history,
 * and the administrators' Payments page. Each action checks who is signed in
 * and what they own first.
 */
import { revalidatePath } from "next/cache";
import { currentUser, emailCheckNeeded, emailReady } from "./auth";
import { store, ownedReturn, SIGNED_OUT, problem, siteUrl } from "./store";
import {
  feeState, startCheckout, syncCheckoutSession, accountPayments, recentPayments, getBillingSettings, saveBillingSettings,
  stripeReady, webhookReady, stripeMode, chargingOn, getPlans, savePlans, accountMemberships, recentMemberships, startMembershipCheckout,
  type FeeState, type PaymentRow, type BillingSettings, type MembershipRow,
} from "./billing";
import { checkPlans, currentMembership, nextMembership, purchaseWindow, type Plan } from "./membership-rules";
import { PRICES } from "./site";

export async function payFilingFee(returnId: string): Promise<{ ok: boolean; url?: string; problem?: string; alreadyPaid?: boolean }> {
  const u = await currentUser();
  if (!u) return { ok: false, problem: SIGNED_OUT };
  if (emailCheckNeeded(u)) return { ok: false, problem: `Confirm your email address first: open the link we sent to ${u.email}. The payment confirmation goes there.` };
  try {
    const s = await store();
    const r = await ownedReturn(s, u, returnId);
    if (!r) return { ok: false, problem: "That return isn't in Nucta File." };
    const fee = await feeState(s, u, returnId);
    if (fee.status === "paid") return { ok: false, alreadyPaid: true, problem: "This return's fee is already paid." };
    if (fee.status !== "due") return { ok: false, problem: fee.words };
    const [c] = await s.db.select({ name: s.companies.name }).from(s.companies).where(s.eq(s.companies.id, r.companyId));
    return await startCheckout(u, { id: r.id, companyName: c?.name ?? "Company", periodStart: r.periodStart, periodEnd: r.periodEnd }, fee.amount);
  } catch (e) {
    return { ok: false, problem: `The payment page couldn't be opened. ${problem(e)}` };
  }
}

/**
 * When the customer comes back from Stripe: asks Stripe whether the payment
 * went through, rather than taking the address bar's word for it. Called by
 * the return's page as it loads, so nothing here may revalidate.
 */
export async function checkFilingFee(returnId: string, sessionId: string): Promise<{ ok: boolean; status: string; words: string; fee?: FeeState }> {
  const u = await currentUser();
  if (!u) return { ok: false, status: "signed-out", words: SIGNED_OUT };
  try {
    const s = await store();
    const r = await ownedReturn(s, u, returnId);
    if (!r) return { ok: false, status: "missing", words: "That return isn't in Nucta File." };
    const synced = await syncCheckoutSession(sessionId);
    if (synced.status === "ignored" || synced.returnId !== returnId || synced.accountId !== u.accountId) {
      return { ok: false, status: "mismatch", words: "That payment isn't for this return." };
    }
    const fee = await feeState(s, u, returnId);
    if (synced.status === "paid") return { ok: true, status: "paid", fee, words: `Payment received${emailReady() ? `. A confirmation is on its way to ${u.email}` : ""}. Now file the return with HMRC.` };
    if (synced.status === "pending") return { ok: false, status: "pending", fee, words: "Stripe haven't confirmed the payment yet. If you paid, it will show here within a minute — check again shortly." };
    return { ok: false, status: synced.status, fee, words: synced.status === "refunded" ? "This payment was refunded." : "That payment page expired before it was paid. Nothing was charged." };
  } catch (e) {
    return { ok: false, status: "error", words: `Couldn't check the payment with Stripe. ${problem(e)}` };
  }
}

export async function myPayments(): Promise<PaymentRow[]> {
  const u = await currentUser();
  if (!u) return [];
  try { return await accountPayments(u.accountId); } catch { return []; }
}

// ——— Memberships, for practices ———

export interface MembershipView {
  ok: boolean;
  problem?: string;
  /** Whether this account can have one at all: practices only. */
  forThisAccount: boolean;
  /** Whether this person may buy one: the account's owner. */
  canPay: boolean;
  charging: boolean;
  testMode: boolean;
  plans: Plan[];
  current: MembershipRow | null;
  next: MembershipRow | null;
  history: MembershipRow[];
  window: { canBuy: boolean; startsOn: string; renewal: boolean; why?: string };
}

const today = () => new Date().toISOString().slice(0, 10);

export async function myMembership(): Promise<MembershipView> {
  const u = await currentUser();
  const empty = { forThisAccount: false, canPay: false, charging: false, testMode: false, plans: [], current: null, next: null, history: [], window: { canBuy: false, startsOn: today(), renewal: false } };
  if (!u) return { ok: false, problem: SIGNED_OUT, ...empty };
  try {
    const s = await store();
    const [plans, charging, list] = await Promise.all([getPlans(), chargingOn(), accountMemberships(s, u.accountId)]);
    const t = today();
    return {
      ok: true, forThisAccount: u.accountKind !== "company", canPay: u.role === "owner", charging, testMode: stripeMode() === "test",
      plans: plans.filter((p) => p.on), current: currentMembership(list, t) as MembershipRow | null, next: nextMembership(list, t) as MembershipRow | null,
      history: [...list].reverse(), window: purchaseWindow(list, t),
    };
  } catch (e) {
    return { ok: false, problem: problem(e), ...empty };
  }
}

export async function buyMembership(planKey: string): Promise<{ ok: boolean; url?: string; problem?: string }> {
  const u = await currentUser();
  if (!u) return { ok: false, problem: SIGNED_OUT };
  if (u.accountKind === "company") return { ok: false, problem: "Memberships are for practices filing for clients. A company filing its own return pays per return." };
  if (u.role !== "owner") return { ok: false, problem: "Only the account's owner can buy a membership." };
  if (emailCheckNeeded(u)) return { ok: false, problem: `Confirm your email address first: open the link we sent to ${u.email}. The payment confirmation goes there.` };
  if (!(await chargingOn())) return { ok: false, problem: "Filing is free while Nucta File launches, so there's nothing to buy yet." };
  try {
    const s = await store();
    const plan = (await getPlans()).find((p) => p.key === planKey && p.on);
    if (!plan) return { ok: false, problem: "That plan isn't on offer any more. Reload the page to see the plans." };
    const w = purchaseWindow(await accountMemberships(s, u.accountId), today());
    if (!w.canBuy) return { ok: false, problem: w.why ?? "A membership can't be bought right now." };
    return await startMembershipCheckout(u, plan, w.startsOn);
  } catch (e) {
    return { ok: false, problem: `The payment page couldn't be opened. ${problem(e)}` };
  }
}

/** Back from Stripe after buying a membership: asks Stripe how it went. Called while the account page loads. */
export async function checkMembershipPayment(sessionId: string): Promise<{ ok: boolean; status: string; words: string }> {
  const u = await currentUser();
  if (!u) return { ok: false, status: "signed-out", words: SIGNED_OUT };
  try {
    const synced = await syncCheckoutSession(sessionId);
    if (synced.status === "ignored" || synced.kind !== "membership" || synced.accountId !== u.accountId) return { ok: false, status: "mismatch", words: "That payment isn't a membership for this account." };
    if (synced.status === "paid") return { ok: true, status: "paid", words: `Membership paid${emailReady() ? `. A confirmation is on its way to ${u.email}` : ""}. Returns you file with HMRC now use it.` };
    if (synced.status === "pending") return { ok: false, status: "pending", words: "Stripe haven't confirmed the payment yet. If you paid, it will show here within a minute — reload shortly." };
    return { ok: false, status: synced.status, words: synced.status === "refunded" ? "This payment was refunded." : "That payment page expired before it was paid. Nothing was charged." };
  } catch (e) {
    return { ok: false, status: "error", words: `Couldn't check the payment with Stripe. ${problem(e)}` };
  }
}

export async function updatePlans(plans: unknown): Promise<{ ok: boolean; problems: string[]; plans?: Plan[] }> {
  const u = await currentUser();
  if (!u?.admin) return { ok: false, problems: ["This is for Nucta File's administrators only."] };
  const r = checkPlans(plans);
  if (!r.ok) return { ok: false, problems: r.problems };
  if (!r.plans.some((p) => p.on)) return { ok: false, problems: ["Keep at least one plan on offer, or practices can only pay per return."] };
  try {
    await savePlans(r.plans, u.email);
    revalidatePath("/payments"); revalidatePath("/account");
    for (const page of SITE_PRICE_PAGES) revalidatePath(page);
    return { ok: true, problems: [], plans: r.plans };
  } catch (e) {
    return { ok: false, problems: [problem(e)] };
  }
}

// ——— The administrators' Payments page ———

export interface PaymentsAdminView {
  ok: boolean;
  problem?: string;
  settings: BillingSettings;
  mode: "test" | "live" | null;
  checks: { label: string; ok: boolean; detail: string }[];
  webhookUrl: string;
  prices: typeof PRICES;
  payments: PaymentRow[];
  plans: Plan[];
  memberships: MembershipRow[];
}

export async function getPaymentsAdmin(): Promise<PaymentsAdminView> {
  const u = await currentUser();
  const settings = await getBillingSettings();
  const webhookUrl = `${siteUrl()}/api/stripe/webhook`;
  const base = { settings, mode: stripeMode(), webhookUrl, prices: PRICES, plans: await getPlans() };
  if (!u?.admin) return { ok: false, problem: "This is for Nucta File's administrators only.", ...base, checks: [], payments: [], memberships: [] };
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  const mode = stripeMode();
  const checks = [
    {
      label: "Stripe secret key", ok: stripeReady(),
      detail: mode === "live" ? "A live key: real cards are charged." : mode === "test" ? "A test key: use Stripe's test cards (4242 4242 4242 4242); no money moves." : key ? "STRIPE_SECRET_KEY doesn't look like a Stripe secret key (it starts sk_live_ or sk_test_)." : "Add STRIPE_SECRET_KEY in the hosting settings (Vercel → Settings → Environment Variables), then redeploy. It's in Stripe under Developers → API keys.",
    },
    {
      label: "Webhook signing secret", ok: webhookReady(),
      detail: webhookReady() ? "Stripe's messages about payments are checked with it." : "In Stripe, add a webhook endpoint for the address below, then put its signing secret (whsec_…) in STRIPE_WEBHOOK_SECRET and redeploy. Without it, payments are still confirmed when the customer comes back from Stripe, but not if they close the page first.",
    },
    {
      label: "Payment confirmations by email", ok: emailReady(),
      detail: emailReady() ? "Each payment is confirmed by email once Stripe confirm it." : "Set up email (RESEND_API_KEY and EMAIL_FROM) so customers get a confirmation.",
    },
  ];
  let payments: PaymentRow[] = [];
  let memberships: MembershipRow[] = [];
  try { payments = await recentPayments(); } catch { /* shown as none */ }
  try { memberships = await recentMemberships(); } catch { /* shown as none */ }
  return { ok: true, ...base, checks, payments, memberships };
}

/** Website pages whose wording depends on whether charging is on, and on the plans. */
const SITE_PRICE_PAGES = ["/", "/pricing", "/accountants"];

export async function updateCharging(next: { charging: boolean; confirm?: boolean }): Promise<{ ok: boolean; problem?: string; settings?: BillingSettings }> {
  const u = await currentUser();
  if (!u?.admin) return { ok: false, problem: "This is for Nucta File's administrators only." };
  if (next.charging && !stripeReady()) return { ok: false, problem: "Add the Stripe secret key first: charging can't start without it." };
  const before = await getBillingSettings();
  if (next.charging && !before.charging && !next.confirm) return { ok: false, problem: "Tick the box to confirm customers should pay before filing." };
  try {
    const settings = await saveBillingSettings(Boolean(next.charging), u.email);
    revalidatePath("/payments");
    // The website's prices say whether filing is free: rebuild the pages that show them.
    for (const page of SITE_PRICE_PAGES) revalidatePath(page);
    return { ok: true, settings };
  } catch (e) {
    return { ok: false, problem: problem(e) };
  }
}
