"use server";

/**
 * Live filing, from the browser: the administrators' switch, the filing
 * screen's checklist, payments of the tax, and emailing HMRC's receipt.
 * Each action checks who is signed in and what they own before anything else.
 */
import { revalidatePath } from "next/cache";
import { currentUser, sendEmail, emailReady } from "./auth";
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
  checks: { label: string; ok: boolean; detail: string }[];
  filings: { at: string; company: string; outcome: string; kind: string; by: string | null; correlationId: string | null }[];
}

export async function getLiveAdmin(): Promise<LiveAdminView> {
  const u = await currentUser();
  const settings = await getLiveSettings();
  if (!u?.admin) return { ok: false, problem: "This is for Nucta File's administrators only.", settings, changes: [], checks: [], filings: [] };
  const checks = [
    { label: "Vendor ID", ok: Boolean(VENDOR_ID), detail: `${VENDOR_ID}, ${PRODUCT_NAME} ${PRODUCT_VERSION}.` },
    { label: "HMRC's live address", ok: /^https:\/\//.test(ENDPOINTS.live), detail: ENDPOINTS.live },
    { label: "Contact email in each submission", ok: Boolean(process.env.HMRC_CONTACT_EMAIL), detail: process.env.HMRC_CONTACT_EMAIL ? `HMRC see ${process.env.HMRC_CONTACT_EMAIL}.` : "Optional. Add HMRC_CONTACT_EMAIL in the hosting settings so HMRC can reach you about a submission." },
    { label: "Receipts by email", ok: emailReady(), detail: emailReady() ? "On: HMRC's receipt can be emailed as soon as it arrives." : "Email isn't set up (RESEND_API_KEY and EMAIL_FROM), so receipts are shown and kept, but not emailed." },
    ...readiness(settings).filter((c) => c.label === "CT600 schema"),
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

export async function updateLiveFiling(next: { mode: LiveFiling; who: LiveWho; requireTil: boolean; emailReceipt: boolean; confirmLive?: boolean }): Promise<{ ok: boolean; problem?: string; settings?: LiveSettings }> {
  const u = await currentUser();
  if (!u?.admin) return { ok: false, problem: "This is for Nucta File's administrators only." };
  if (!["off", "til", "on"].includes(next.mode) || !["admins", "everyone"].includes(next.who)) return { ok: false, problem: "That isn't a setting Nucta File knows." };
  const before = await getLiveSettings();
  if (next.mode === "on" && before.mode !== "on" && !next.confirmLive) return { ok: false, problem: "Tick the box to confirm real filing should be switched on." };
  if (next.mode === "on" && next.who === "everyone" && !(before.mode === "on" && before.who === "everyone") && !next.confirmLive) return { ok: false, problem: "Tick the box to confirm real filing should open to every account." };
  try {
    const settings = await saveLiveSettings({ mode: next.mode, who: next.who, requireTil: Boolean(next.requireTil), emailReceipt: Boolean(next.emailReceipt) }, u.email);
    revalidatePath("/live-filing");
    return { ok: true, settings };
  } catch (e) {
    return { ok: false, problem: problem(e) };
  }
}

// ——— The filing screen ———

export async function getFilingPicture(returnId: string): Promise<FilingPicture> {
  const u = await signedIn();
  if (!u) {
    return { ok: false, problem: SIGNED_OUT, mode: "off", why: "", requireTil: true, checks: [], approval: null, lockedUntil: null, parts: [], company: { name: "", utr: null, companyNo: null }, filingDue: "", late: null, emailReady: false, userEmail: "", amendment: false };
  }
  try {
    return await filingPicture(u, returnId);
  } catch (e) {
    return { ok: false, problem: problem(e), mode: "off", why: "", requireTil: true, checks: [], approval: null, lockedUntil: null, parts: [], company: { name: "", utr: null, companyNo: null }, filingDue: "", late: null, emailReady: emailReady(), userEmail: u.email, amendment: false };
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
