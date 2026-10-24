"use server";

/**
 * Live filing, from the browser: the administrators' switch, the filing
 * screen's checklist, payments of the tax, and emailing HMRC's receipt.
 * Each action checks who is signed in and what they own before anything else.
 */
import { revalidatePath } from "next/cache";
import { currentUser, sendEmail, sendEmailChecked, emailReady } from "./auth";
import { store, ownedReturn, signedIn, SIGNED_OUT, problem } from "./store";
import { getLiveSettings, getLiveChanges, saveLiveSettings, type LiveSettings, type LiveChange, type LiveWho } from "./live-settings";
import { filingPicture, paymentHome, type FilingPicture } from "./filing-checks";
import { readiness, VENDOR_ID, PRODUCT_NAME, PRODUCT_VERSION, ENDPOINTS, type LiveFiling } from "./hmrc";
import { normaliseReturnData, type ReturnData, type PaymentRecord } from "./return-model";
import { paymentReferenceProblem, tidyReference, receiptEmailText } from "./filing-rules";
import { accountingPeriodsOf } from "./tax/long-period";

// ——— The administrators' switch ———

export interface LiveAdminView {
  ok: boolean;
  problem?: string;
  settings: LiveSettings;
  changes: LiveChange[];
  checks: { label: string; ok: boolean; detail: string; test?: boolean }[];
  filings: { at: string; company: string; outcome: string; kind: string; by: string | null; correlationId: string | null }[];
}

export async function getLiveAdmin(): Promise<LiveAdminView> {
  const u = await currentUser();
  const settings = await getLiveSettings();
  if (!u?.admin) return { ok: false, problem: "This is for Nucta File's administrators only.", settings, changes: [], checks: [], filings: [] };
  const contact = (process.env.HMRC_CONTACT_EMAIL ?? "").trim();
  const contactOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact);
  const from = (process.env.EMAIL_FROM ?? "").trim();
  const fromAddress = (from.match(/<([^>]+)>/)?.[1] ?? from).trim();
  const mailProblem = !process.env.RESEND_API_KEY && !from ? "Add RESEND_API_KEY and EMAIL_FROM in the hosting settings (Vercel → Settings → Environment Variables), then redeploy."
    : !process.env.RESEND_API_KEY ? "EMAIL_FROM is set; add RESEND_API_KEY too, then redeploy."
      : !from ? "RESEND_API_KEY is set; add EMAIL_FROM too, such as Nucta File <noreply@mail.nuctaformations.com>, then redeploy."
        : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromAddress) ? `EMAIL_FROM (${from}) isn't an email address. Use something like Nucta File <noreply@mail.nuctaformations.com>.` : null;
  let tested = { count: 0, last: null as string | null };
  try {
    const s = await store();
    const rows = await s.db.select({ at: s.submissions.startedAt, cls: s.submissions.messageClass }).from(s.submissions)
      .where(s.and(s.eq(s.submissions.gatewayTest, true), s.eq(s.submissions.outcome, "accepted"))).orderBy(s.desc(s.submissions.startedAt));
    tested = { count: rows.length, last: rows[0]?.at.toISOString() ?? null };
  } catch { /* shown as none */ }
  const checks = [
    { label: "Vendor ID", ok: Boolean(VENDOR_ID), detail: `${VENDOR_ID}, ${PRODUCT_NAME} ${PRODUCT_VERSION}.` },
    { label: "HMRC's live address", ok: /^https:\/\//.test(ENDPOINTS.live), detail: ENDPOINTS.live },
    {
      label: "Contact email", ok: contactOk,
      detail: (contactOk ? `${contact} goes with submissions to HMRC's test service.`
        : contact ? `HMRC_CONTACT_EMAIL (${contact}) isn't an email address, so it's left out. Correct it in the hosting settings, then redeploy.`
          : "Add HMRC_CONTACT_EMAIL in the hosting settings (Vercel → Settings → Environment Variables), then redeploy, for submissions to HMRC's test service.")
        + " For a real filing, HMRC's confirmation goes to the address chosen on the filing screen — by default the email on the HMRC account that signs in, so clients hear from HMRC directly.",
    },
    {
      label: "Receipts by email", ok: !mailProblem,
      detail: mailProblem ?? `Set up to send from ${from}. Use “Send a test email” below to check the email service accepts it.`,
      test: !mailProblem,
    },
    readiness(settings).find((c) => c.label === "CT600 schema")!,
    {
      label: "Accepted by HMRC's test service", ok: tested.count > 0,
      detail: tested.count ? `HMRC's test service has accepted ${tested.count} submission${tested.count === 1 ? "" : "s"} sent from this Nucta File, most recently on ${new Date(tested.last!).toLocaleString("en-GB", { timeZone: "Europe/London" })}.`
        : "No return sent from this Nucta File has been accepted by HMRC's test service yet. Send one from a return's Check and send step.",
    },
  ];
  let filings: LiveAdminView["filings"] = [];
  try {
    const s = await store();
    const rows = await s.db.select({
      at: s.submissions.startedAt, outcome: s.submissions.outcome, cls: s.submissions.messageClass, by: s.submissions.startedBy,
      correlationId: s.submissions.correlationId, company: s.companies.name,
    }).from(s.submissions)
      .leftJoin(s.returns, s.eq(s.returns.id, s.submissions.returnId))
      .leftJoin(s.companies, s.eq(s.companies.id, s.returns.companyId))
      .where(s.eq(s.submissions.gatewayTest, false)).orderBy(s.desc(s.submissions.startedAt)).limit(30);
    filings = rows.map((r) => ({ at: r.at.toISOString(), company: r.company ?? "—", outcome: r.outcome, kind: /-TIL$/.test(r.cls) ? "Test in Live" : "Live filing", by: r.by, correlationId: r.correlationId }));
  } catch { /* shown empty */ }
  return { ok: true, settings, changes: await getLiveChanges(), checks, filings };
}

export async function updateLiveFiling(next: { mode: LiveFiling; who: LiveWho; requireTil: boolean; requireTest?: boolean; emailReceipt: boolean; confirmLive?: boolean }): Promise<{ ok: boolean; problem?: string; settings?: LiveSettings }> {
  const u = await currentUser();
  if (!u?.admin) return { ok: false, problem: "This is for Nucta File's administrators only." };
  if (!["off", "til", "on"].includes(next.mode) || !["admins", "everyone"].includes(next.who)) return { ok: false, problem: "That isn't a setting Nucta File knows." };
  const before = await getLiveSettings();
  if (next.mode === "on" && before.mode !== "on" && !next.confirmLive) return { ok: false, problem: "Tick the box to confirm real filing should be switched on." };
  if (next.mode === "on" && next.who === "everyone" && !(before.mode === "on" && before.who === "everyone") && !next.confirmLive) return { ok: false, problem: "Tick the box to confirm real filing should open to every account." };
  try {
    const settings = await saveLiveSettings({ mode: next.mode, who: next.who, requireTil: Boolean(next.requireTil), requireTest: Boolean(next.requireTest), emailReceipt: Boolean(next.emailReceipt) }, u.email);
    revalidatePath("/live-filing");
    return { ok: true, settings };
  } catch (e) {
    return { ok: false, problem: problem(e) };
  }
}

/** Sends a test email to the administrator, to check the email service accepts Nucta File's address. */
export async function sendTestEmail(): Promise<{ ok: boolean; problem?: string; to?: string }> {
  const u = await currentUser();
  if (!u?.admin) return { ok: false, problem: "This is for Nucta File's administrators only." };
  const r = await sendEmailChecked(u.email, "Nucta File: test email",
    `Hello ${u.name},\n\nThis is a test from Nucta File's Live filing page. If it has reached you, HMRC receipts, approval links, invitations and password resets can be emailed.\n\nNucta File`);
  return r.ok ? { ok: true, to: u.email } : { ok: false, problem: r.error };
}

// ——— The filing screen ———

export async function getFilingPicture(returnId: string): Promise<FilingPicture> {
  const u = await signedIn();
  if (!u) {
    return { ok: false, problem: SIGNED_OUT, mode: "off", why: "", requireTil: false, requireTest: false, checks: [], approval: null, lockedUntil: null, parts: [], company: { name: "", utr: null, companyNo: null }, filingDue: "", late: null, emailReady: false, userEmail: "", amendment: false };
  }
  try {
    return await filingPicture(u, returnId);
  } catch (e) {
    return { ok: false, problem: problem(e), mode: "off", why: "", requireTil: false, requireTest: false, checks: [], approval: null, lockedUntil: null, parts: [], company: { name: "", utr: null, companyNo: null }, filingDue: "", late: null, emailReady: emailReady(), userEmail: u.email, amendment: false };
  }
}

/** Records a payment of the return's tax. For an amendment it is kept with the original return. */
export async function recordPayment(returnId: string, part: number, p: { on: string; amount: number; reference: string }): Promise<{ ok: boolean; problem?: string }> {
  const u = await signedIn();
  if (!u) return { ok: false, problem: SIGNED_OUT };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.on) || p.on > new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)) return { ok: false, problem: "Enter the date the payment was made, not one in the future." };
  const amount = Math.round(Number(p.amount) * 100) / 100;
  if (!(amount > 0) || amount > 100_000_000) return { ok: false, problem: "Enter the amount paid, in pounds." };
  try {
    const s = await store();
    const r = await ownedReturn(s, u, returnId);
    if (!r) return { ok: false, problem: "That return isn't in Nucta File." };
    const [c] = await s.db.select({ utr: s.companies.utr }).from(s.companies).where(s.eq(s.companies.id, r.companyId));
    const refProblem = paymentReferenceProblem(p.reference ?? "", c?.utr ?? null);
    if (refProblem) return { ok: false, problem: refProblem };
    if (!accountingPeriodsOf(r.periodStart, r.periodEnd)[part]) return { ok: false, problem: "There's no such return for this period." };
    const home = await paymentHome(s, returnId);
    if (!home) return { ok: false, problem: "The return couldn't be opened." };
    const rec: PaymentRecord = { on: p.on, amount, reference: tidyReference(p.reference ?? ""), recordedBy: u.name || u.email, at: new Date().toISOString() };
    const paid = { ...(home.data.paid ?? {}), [String(part)]: [...(home.data.paid?.[String(part)] ?? []), rec].slice(-20) };
    await s.db.update(s.returns).set({ data: { ...home.data, paid } as unknown as Record<string, unknown> }).where(s.eq(s.returns.id, home.id));
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return { ok: false, problem: problem(e) };
  }
}

export async function removePayment(returnId: string, part: number, index: number): Promise<{ ok: boolean; problem?: string }> {
  const u = await signedIn();
  if (!u) return { ok: false, problem: SIGNED_OUT };
  try {
    const s = await store();
    const r = await ownedReturn(s, u, returnId);
    if (!r) return { ok: false, problem: "That return isn't in Nucta File." };
    const home = await paymentHome(s, returnId);
    if (!home) return { ok: false, problem: "The return couldn't be opened." };
    const list = [...(home.data.paid?.[String(part)] ?? [])];
    if (!list[index]) return { ok: false, problem: "That payment has already been removed." };
    list.splice(index, 1);
    const paid = { ...(home.data.paid ?? {}), [String(part)]: list };
    await s.db.update(s.returns).set({ data: { ...home.data, paid } as unknown as Record<string, unknown> }).where(s.eq(s.returns.id, home.id));
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return { ok: false, problem: problem(e) };
  }
}

/** Emails HMRC's receipt for a filed return to someone the person filing chooses, such as the director. */
export async function emailReceipt(returnId: string, part: number, toRaw: string): Promise<{ ok: boolean; problem?: string }> {
  const u = await signedIn();
  if (!u) return { ok: false, problem: SIGNED_OUT };
  const to = toRaw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || to.length > 200) return { ok: false, problem: "Enter an email address." };
  if (!emailReady()) return { ok: false, problem: "Email isn't set up in Nucta File yet, so the receipt can't be sent. Download the receipt PDF instead." };
  try {
    const s = await store();
    const r = await ownedReturn(s, u, returnId);
    if (!r) return { ok: false, problem: "That return isn't in Nucta File." };
    const data = normaliseReturnData(r.data as Partial<ReturnData>);
    const rec = data.sent?.[String(part)];
    if (rec?.status !== "accepted") return { ok: false, problem: "This return hasn't been filed with HMRC, so there's no receipt to send." };
    const [c] = await s.db.select().from(s.companies).where(s.eq(s.companies.id, r.companyId));
    const pic = await filingPicture(u, returnId);
    const pt = pic.parts[part];
    const mail = receiptEmailText({
      company: c.name, utr: c.utr, periodFrom: rec.periodFrom, periodTo: rec.periodTo, filedAt: rec.at, correlationId: rec.correlationId, irmark: rec.irmark,
      receiptText: rec.receiptText ?? null, payable: pt?.left ?? 0, taxDue: pt?.taxDue ?? "", sender: u.accountName || u.name,
    });
    const sent = await sendEmail(to, mail.subject, mail.text);
    return sent ? { ok: true } : { ok: false, problem: "The email couldn't be sent just now. Try again in a moment." };
  } catch (e) {
    return { ok: false, problem: problem(e) };
  }
}
