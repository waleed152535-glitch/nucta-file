import { feeAmount, stripeKeyMode, stripeForm, signStripePayload, verifyStripeSignature, feeReference, feeEmail, pounds } from "../lib/billing-rules";
import { emailCheckText } from "../lib/auth";

let passed = 0, failed = 0;
const t = (name: string, ok: boolean, got?: unknown) => { if (ok) passed++; else { failed++; console.log("FAIL", name, got === undefined ? "" : JSON.stringify(got)); } };
const eq = (name: string, got: unknown, want: unknown) => t(name, JSON.stringify(got) === JSON.stringify(want), { got, want });

console.log("— the filing fee");
eq("company, trading", feeAmount("company", false), 39);
eq("company, dormant", feeAmount("company", true), 15);
eq("practice, trading", feeAmount("practice", false), 19);
eq("practice, dormant", feeAmount("practice", true), 9);
eq("an unknown kind is charged as a practice", feeAmount("other", false), 19);

console.log("— Stripe keys");
eq("live secret key", stripeKeyMode("sk_live_abc"), "live");
eq("test secret key", stripeKeyMode("sk_test_abc"), "test");
eq("restricted live key", stripeKeyMode("rk_live_abc"), "live");
eq("a publishable key is not a secret key", stripeKeyMode("pk_live_abc"), null);
eq("nothing", stripeKeyMode(undefined), null);
eq("rubbish", stripeKeyMode("hello"), null);

console.log("— Stripe's form encoding");
const form = stripeForm({ mode: "payment", line_items: [{ quantity: 1, price_data: { currency: "gbp", unit_amount: 3900, product_data: { name: "A & B" } } }], metadata: { a: "1" }, skip: undefined, empty: "" });
eq("nested fields", form.split("&").map(decodeURIComponent), ["mode=payment", "line_items[0][quantity]=1", "line_items[0][price_data][currency]=gbp", "line_items[0][price_data][unit_amount]=3900", "line_items[0][price_data][product_data][name]=A & B", "metadata[a]=1"]);
t("values are encoded", form.includes("A%20%26%20B"), form);
t("the success address keeps Stripe's placeholder", decodeURIComponent(stripeForm({ success_url: "https://x/r?fee=back&session_id={CHECKOUT_SESSION_ID}" })) === "success_url=https://x/r?fee=back&session_id={CHECKOUT_SESSION_ID}");

console.log("— webhook signatures");
const secret = "whsec_test_secret", body = '{"id":"evt_1","type":"checkout.session.completed"}', now = 1_800_000_000;
const sig = signStripePayload(body, secret, now);
eq("a good signature", verifyStripeSignature(body, `t=${now},v1=${sig}`, secret, now).ok, true);
eq("two signatures, one good (secret being rolled)", verifyStripeSignature(body, `t=${now},v1=${"0".repeat(64)},v1=${sig}`, secret, now).ok, true);
eq("a changed body", verifyStripeSignature(body.replace("evt_1", "evt_2"), `t=${now},v1=${sig}`, secret, now).ok, false);
eq("the wrong secret", verifyStripeSignature(body, `t=${now},v1=${signStripePayload(body, "whsec_other", now)}`, secret, now).ok, false);
eq("too old (more than 5 minutes)", verifyStripeSignature(body, `t=${now},v1=${sig}`, secret, now + 301).problem, "The signature is too old.");
eq("from the future, within tolerance", verifyStripeSignature(body, `t=${now},v1=${sig}`, secret, now - 200).ok, true);
eq("no header", verifyStripeSignature(body, null, secret, now).ok, false);
eq("only a v0 signature", verifyStripeSignature(body, `t=${now},v0=${sig}`, secret, now).ok, false);
eq("not hex", verifyStripeSignature(body, `t=${now},v1=zz${sig.slice(2)}`, secret, now).ok, false);
eq("a short signature", verifyStripeSignature(body, `t=${now},v1=${sig.slice(0, 20)}`, secret, now).ok, false);
eq("no secret set", verifyStripeSignature(body, `t=${now},v1=${sig}`, "", now).ok, false);

console.log("— the payment confirmation");
eq("reference", feeReference("3f2a9c1e-77aa-4b2b-9b1d-0c4e5f6a7b8c"), "NF-3F2A9C1E");
eq("pounds", pounds(3900), "£39.00");
const m = feeEmail({ name: "Abdul", amountPence: 3900, description: "Atnep Brand Ltd: Company Tax Return for 1 Feb 2025 to 31 Jan 2026", paidAt: new Date("2026-10-24T10:00:00Z"), paymentId: "3f2a9c1e-77aa-4b2b-9b1d-0c4e5f6a7b8c", receiptUrl: "https://pay.stripe.com/receipts/x", returnUrl: "https://file.nucta.test/returns/r1", testMode: false });
t("subject names the amount and the return", m.subject === "Payment received: £39.00 for Atnep Brand Ltd: Company Tax Return for 1 Feb 2025 to 31 Jan 2026", m.subject);
for (const want of ["Hello Abdul,", "Amount: £39.00", "Paid on: 24 October 2026", "Reference: NF-3F2A9C1E", "Card receipt: https://pay.stripe.com/receipts/x", "https://file.nucta.test/returns/r1", "Nucta Formations Ltd", "amending it later"]) t(`email says "${want}"`, m.text.includes(want), m.text);
const tm = feeEmail({ name: "A", amountPence: 900, description: "X", paidAt: new Date("2026-10-24T23:30:00Z"), paymentId: "abc", receiptUrl: null, returnUrl: null, testMode: true });
t("test payments say so", tm.subject.startsWith("[Test] ") && tm.text.includes("no money was taken"), tm);
t("no receipt line without a receipt", !tm.text.includes("Card receipt"), tm.text);
t("the date is the UK date", tm.text.includes("Paid on: 25 October 2026"), tm.text);

console.log("— the email confirmation");
const ec = emailCheckText("Waleed", "https://file.nucta.test/verify-email?token=abc");
t("has the link", ec.includes("https://file.nucta.test/verify-email?token=abc"), ec);
t("says how long it lasts", ec.includes("48 hours"), ec);
t("says what to do if it wasn't them", ec.includes("If you didn't create a Nucta File account"), ec);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
