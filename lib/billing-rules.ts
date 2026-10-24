/**
 * The filing fee's rules and Stripe's formats, with nothing that touches the
 * network or the database — so each can be tested on its own.
 *
 *  - what a return costs: by the kind of account and whether it's dormant;
 *  - Stripe's form encoding (nested fields as `a[b][c]=…`);
 *  - checking that a webhook really came from Stripe: an HMAC-SHA256 of
 *    "<timestamp>.<body>" with the endpoint's signing secret, no older than
 *    five minutes;
 *  - the payment confirmation email.
 */
import { createHmac, timingSafeEqual } from "crypto";
import { PRICES, SITE } from "./site";

/** The filing fee in pounds, for one return (two-part returns over 12 months count as one). */
export function feeAmount(kind: string, dormant: boolean): number {
  const p = kind === "company" ? PRICES.company : PRICES.practice;
  return dormant ? p.dormant : p.perReturn;
}

/** "Test" or "live" from the key's prefix; null for something that isn't a Stripe secret key. */
export function stripeKeyMode(key: string | undefined | null): "test" | "live" | null {
  if (!key) return null;
  if (/^(sk|rk)_live_/.test(key)) return "live";
  if (/^(sk|rk)_test_/.test(key)) return "test";
  return null;
}

/** Stripe's form encoding: nested objects and arrays become `a[b][0][c]=…`. Empty values are left out. */
export function stripeForm(o: Record<string, unknown>): string {
  const out: string[] = [];
  const walk = (v: unknown, key: string) => {
    if (v === undefined || v === null || v === "") return;
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${key}[${i}]`)); return; }
    if (typeof v === "object") { for (const [k, x] of Object.entries(v as Record<string, unknown>)) walk(x, key ? `${key}[${k}]` : k); return; }
    out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  };
  walk(o, "");
  return out.join("&");
}

export const signStripePayload = (payload: string, secret: string, t: number) =>
  createHmac("sha256", secret).update(`${t}.${payload}`, "utf8").digest("hex");

/**
 * Checks a Stripe-Signature header ("t=…,v1=…[,v1=…]") against the raw body.
 * Any v1 signature may match (Stripe sends two while a secret is being rolled).
 */
export function verifyStripeSignature(payload: string, header: string | null | undefined, secret: string, nowSeconds = Math.floor(Date.now() / 1000), toleranceSeconds = 300): { ok: boolean; problem?: string } {
  if (!secret) return { ok: false, problem: "No webhook signing secret is set." };
  if (!header) return { ok: false, problem: "No Stripe-Signature header." };
  let t = NaN;
  const sigs: string[] = [];
  for (const part of header.split(",")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim(), v = part.slice(i + 1).trim();
    if (k === "t") t = Number(v);
    else if (k === "v1") sigs.push(v);
  }
  if (!Number.isFinite(t) || !sigs.length) return { ok: false, problem: "The Stripe-Signature header isn't in Stripe's format." };
  if (Math.abs(nowSeconds - t) > toleranceSeconds) return { ok: false, problem: "The signature is too old." };
  const want = Buffer.from(signStripePayload(payload, secret, t), "hex");
  const match = sigs.some((s) => {
    if (!/^[0-9a-f]+$/i.test(s)) return false;
    const got = Buffer.from(s, "hex");
    return got.length === want.length && timingSafeEqual(got, want);
  });
  return match ? { ok: true } : { ok: false, problem: "The signature doesn't match." };
}

/** The reference a customer can quote: NF- and the start of the payment's id. */
export const feeReference = (paymentId: string) => `NF-${paymentId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;

export const pounds = (pence: number) => `£${(pence / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export interface FeeEmail {
  name: string;
  amountPence: number;
  description: string;
  paidAt: Date;
  paymentId: string;
  receiptUrl: string | null;
  returnUrl: string | null;
  testMode: boolean;
}

/** The payment confirmation Nucta File sends once Stripe confirm the payment. */
export function feeEmail(e: FeeEmail): { subject: string; text: string } {
  const on = e.paidAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });
  const seller = [SITE.company, SITE.companyNumber ? `company number ${SITE.companyNumber}` : "", SITE.registeredOffice].filter(Boolean).join(", ");
  const lines = [
    `Hello ${e.name},`,
    "",
    e.testMode ? "This was a test payment: no money was taken." : "Thank you — your payment has been received.",
    "",
    `Amount: ${pounds(e.amountPence)}`,
    `For: ${e.description}`,
    `Paid on: ${on}`,
    `Reference: ${feeReference(e.paymentId)}`,
    ...(e.receiptUrl ? [`Card receipt: ${e.receiptUrl}`] : []),
    "",
    "The fee covers filing this return with HMRC, sending it again if HMRC find something to fix, and amending it later.",
    "",
    e.returnUrl ? `Next, file the return with HMRC:\n${e.returnUrl}` : "Next, open the return in Nucta File and file it with HMRC.",
    "",
    `Questions about this payment: ${SITE.email}`,
    "",
    SITE.product,
    seller,
  ];
  return { subject: `${e.testMode ? "[Test] " : ""}Payment received: ${pounds(e.amountPence)} for ${e.description}`, text: lines.join("\n") };
}
