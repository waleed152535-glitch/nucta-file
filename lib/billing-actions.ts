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
  stripeReady, webhookReady, stripeMode, type FeeState, type PaymentRow, type BillingSettings,
} from "./billing";
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
}

export async function getPaymentsAdmin(): Promise<PaymentsAdminView> {
  const u = await currentUser();
  const settings = await getBillingSettings();
  const webhookUrl = `${siteUrl()}/api/stripe/webhook`;
  const base = { settings, mode: stripeMode(), webhookUrl, prices: PRICES };
  if (!u?.admin) return { ok: false, problem: "This is for Nucta File's administrators only.", ...base, checks: [], payments: [] };
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
  try { payments = await recentPayments(); } catch { /* shown as none */ }
  return { ok: true, ...base, checks, payments };
}

export async function updateCharging(next: { charging: boolean; confirm?: boolean }): Promise<{ ok: boolean; problem?: string; settings?: BillingSettings }> {
  const u = await currentUser();
  if (!u?.admin) return { ok: false, problem: "This is for Nucta File's administrators only." };
  if (next.charging && !stripeReady()) return { ok: false, problem: "Add the Stripe secret key first: charging can't start without it." };
  const before = await getBillingSettings();
  if (next.charging && !before.charging && !next.confirm) return { ok: false, problem: "Tick the box to confirm customers should pay before filing." };
  try {
    const settings = await saveBillingSettings(Boolean(next.charging), u.email);
    revalidatePath("/payments");
    return { ok: true, settings };
  } catch (e) {
    return { ok: false, problem: problem(e) };
  }
}
