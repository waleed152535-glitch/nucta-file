/**
 * Stripe's messages about payments. Each is checked against the endpoint's
 * signing secret (STRIPE_WEBHOOK_SECRET) before anything is read from it, and
 * even then the payment itself is fetched from Stripe rather than taken from
 * the message. Messages about other sales on the same Stripe account are
 * acknowledged and ignored.
 */
import { verifyStripeSignature } from "@/lib/billing-rules";
import { syncCheckoutSession, markRefunded } from "@/lib/billing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface StripeEvent { id: string; type: string; data: { object: { id?: string; payment_intent?: string | null; refunded?: boolean } } }

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
  if (!secret) return new Response("The webhook signing secret isn't set.", { status: 503 });
  const raw = await req.text();
  const check = verifyStripeSignature(raw, req.headers.get("stripe-signature"), secret);
  if (!check.ok) return new Response(check.problem, { status: 400 });
  let ev: StripeEvent;
  try { ev = JSON.parse(raw) as StripeEvent; } catch { return new Response("Not JSON.", { status: 400 }); }
  try {
    switch (ev.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
      case "checkout.session.async_payment_failed":
      case "checkout.session.expired":
        if (ev.data.object.id) await syncCheckoutSession(ev.data.object.id);
        break;
      case "charge.refunded":
        if (ev.data.object.payment_intent) await markRefunded(ev.data.object.payment_intent, Boolean(ev.data.object.refunded));
        break;
      default:
        break;
    }
  } catch (e) {
    // Stripe try again later when the answer isn't a success.
    console.error("stripe webhook", ev.type, String((e as Error)?.message ?? e).slice(0, 300));
    return new Response("Couldn't process it yet.", { status: 500 });
  }
  return Response.json({ received: true });
}

export async function GET() {
  return new Response("Stripe's payment messages are sent here. Nothing to see in a browser.", { status: 405, headers: { Allow: "POST" } });
}
