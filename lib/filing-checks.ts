/**
 * Everything the filing screen needs to know before a return is filed with
 * HMRC for real, worked out on the server: whether live filing is open for
 * this person, what's been checked, how the director approved, whether too
 * many sign-ins have failed, what the tax is and what's been paid.
 *
 * The same rules are enforced again by fileReturnLive; this is what the
 * screen shows. Server only; not a "use server" file.
 */
import type { SignedInUser } from "./auth";
import { emailReady } from "./auth";
import { store, ownedReturn, type Store } from "./store";
import { normaliseReturnData, toCompanyReturnInput, type ReturnData, type SentRecord, type PaymentRecord } from "./return-model";
import { prepareReturn } from "./filing";
import { figuresHash } from "./approval-core";
import { liveModeFor } from "./live-settings";
import type { LiveFiling } from "./hmrc";
import { lateFiling, leftToPay, type LateFiling } from "./filing-rules";

export interface FilingCheck { key: string; state: "ok" | "warn" | "bad" | "info"; title: string; detail?: string }

export interface OnlineApprovalState {
  status: "approved" | "waiting" | "query" | "stale";
  name: string;
  email: string | null;
  at: string | null;
  ip: string | null;
  query: string | null;
}

export interface FilingPart {
  n: number;
  periodFrom: string;
  periodTo: string;
  passedTest: boolean;
  til: { outcome: string; at: string } | null;
  filed: SentRecord | null;
  taxDue: string;
  /** Corporation Tax and tax on director's loans. */
  payable: number;
  paid: PaymentRecord[];
  left: number;
}

export interface FilingPicture {
  ok: boolean;
  problem?: string;
  mode: LiveFiling;
  why: string;
  requireTil: boolean;
  /** Whether these figures must pass HMRC's test service before a real filing. */
  requireTest: boolean;
  checks: FilingCheck[];
  approval: OnlineApprovalState | null;
  /** Set when failed sign-ins mean filing should wait, to protect the HMRC account. */
  lockedUntil: string | null;
  parts: FilingPart[];
  company: { name: string; utr: string | null; companyNo: string | null };
  filingDue: string;
  late: LateFiling | null;
  emailReady: boolean;
  userEmail: string;
  amendment: boolean;
}

/** HMRC's error for a user ID or password that doesn't work for Corporation Tax. */
const AUTH_ERRORS = new Set(["1046", "5012"]);
const LOCK_AFTER = 2;
const LOCK_MINUTES = 60;

/**
 * Two failed sign-ins on a return within an hour stop further tries for the
 * rest of that hour: a few more wrong passwords can lock the company's
 * Government Gateway account, which takes days to undo.
 */
export async function signInLock(s: Store, returnId: string, now = Date.now()): Promise<string | null> {
  const since = new Date(now - LOCK_MINUTES * 60_000);
  const rows = await s.db.select({ at: s.submissions.startedAt, errors: s.submissions.errors }).from(s.submissions)
    .where(s.and(s.eq(s.submissions.returnId, returnId), s.eq(s.submissions.gatewayTest, false), s.gte(s.submissions.startedAt, since)))
    .orderBy(s.desc(s.submissions.startedAt));
  const failed = rows.filter((r) => (r.errors ?? []).some((e) => e.number && AUTH_ERRORS.has(String(e.number))));
  if (failed.length < LOCK_AFTER) return null;
  return new Date(failed[LOCK_AFTER - 1].at.getTime() + LOCK_MINUTES * 60_000).toISOString();
}

/** The latest online approval of this return, if one was asked for. */
export async function onlineApproval(s: Store, returnId: string, periodStart: string, periodEnd: string, data: ReturnData): Promise<OnlineApprovalState | null> {
  const rows = await s.db.select().from(s.approvals).where(s.eq(s.approvals.returnId, returnId)).orderBy(s.desc(s.approvals.createdAt));
  const a = rows.find((x) => x.status !== "cancelled");
  if (!a) return null;
  const stale = a.figuresHash !== figuresHash(periodStart, periodEnd, data);
  return {
    status: a.status === "approved" ? (stale ? "stale" : "approved") : a.status === "query" ? "query" : "waiting",
    name: a.approvedName || a.directorName, email: a.directorEmail, at: a.approvedAt?.toISOString() ?? null, ip: a.approvedIp, query: a.query,
  };
}

/** The return payments are kept on: the original, for an amendment. */
export async function paymentHome(s: Store, returnId: string): Promise<{ id: string; data: ReturnData } | null> {
  let id = returnId;
  for (let i = 0; i < 6; i++) {
    const [r] = await s.db.select({ id: s.returns.id, data: s.returns.data }).from(s.returns).where(s.eq(s.returns.id, id));
    if (!r) return null;
    const d = normaliseReturnData(r.data as Partial<ReturnData>);
    if (!d.amends?.returnId) return { id: r.id, data: d };
    id = d.amends.returnId;
  }
  return null;
}

const shortDate = (iso: string) => new Date(iso + (iso.length === 10 ? "T12:00:00Z" : "")).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const money = (n: number) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export async function filingPicture(u: SignedInUser, returnId: string, today = new Date().toISOString().slice(0, 10)): Promise<FilingPicture> {
  const blank = (problem: string): FilingPicture => ({
    ok: false, problem, mode: "off", why: "", requireTil: false, requireTest: false, checks: [], approval: null, lockedUntil: null, parts: [],
    company: { name: "", utr: null, companyNo: null }, filingDue: "", late: null, emailReady: emailReady(), userEmail: u.email, amendment: false,
  });
  const s = await store();
  const r = await ownedReturn(s, u, returnId);
  if (!r) return blank("That return isn't in Nucta File.");
  const [c] = await s.db.select().from(s.companies).where(s.eq(s.companies.id, r.companyId));
  const data = normaliseReturnData(r.data as Partial<ReturnData>);
  const p = prepareReturn(toCompanyReturnInput({ name: c.name, companyNo: c.companyNo, utr: c.utr }, r.periodStart, r.periodEnd, data));
  const live = await liveModeFor(u);
  const approval = await onlineApproval(s, returnId, r.periodStart, r.periodEnd, data);
  const lockedUntil = await signInLock(s, returnId);
  const home = await paymentHome(s, returnId);

  const parts: FilingPart[] = p.parts.map((pp, n) => {
    const rec = data.sent?.[String(n)] ?? null;
    const payable = Math.round((pp.computation.taxChargeable + (pp.loans?.needed ? pp.loans.a80 : 0)) * 100) / 100;
    const paid = home?.data.paid?.[String(n)] ?? [];
    return {
      n, periodFrom: pp.periodFrom, periodTo: pp.periodTo,
      passedTest: rec?.status === "accepted-test",
      til: data.til?.[String(n)] ? { outcome: data.til[String(n)].outcome, at: data.til[String(n)].at } : null,
      filed: rec && (rec.status === "accepted" || rec.status === "submitted-live") ? rec : null,
      taxDue: pp.taxDue, payable, paid, left: leftToPay(payable, paid),
    };
  });
  const allFiled = parts.length > 0 && parts.every((x) => x.filed?.status === "accepted");
  const late = !allFiled && p.filingDue && !(data.dormant && data.ctNoticeReceived === false) ? lateFiling(p.filingDue, today) : null;

  const checks: FilingCheck[] = [];
  checks.push(live.mode === "off"
    ? { key: "open", state: "info", title: "Live filing isn't open for this account yet", detail: live.why }
    : { key: "open", state: "ok", title: live.mode === "til" ? "HMRC's Test in Live check is open" : "Live filing is open", detail: live.mode === "til" ? "A return can be checked by HMRC's live service with the real sign-in. Nothing is filed until real filing is switched on." : undefined });
  checks.push(p.ok ? { key: "ready", state: "ok", title: "The return is complete" } : { key: "ready", state: "bad", title: "The return isn't complete yet", detail: p.problems.slice(0, 3).join(" ") });
  checks.push(c.utr && /^\d{10}$/.test(c.utr)
    ? { key: "utr", state: "ok", title: `Corporation Tax UTR ${c.utr.slice(0, 5)} ${c.utr.slice(5)}`, detail: "Check it against HMRC's letters to the company: a return filed under the wrong UTR is refused or lands on the wrong company." }
    : { key: "utr", state: "bad", title: "The company's 10-digit Corporation Tax UTR is missing", detail: "Add it on the company's page. It's on HMRC's letters to the company." });
  const untested = parts.filter((x) => !x.passedTest && !x.filed);
  if (!untested.length) {
    checks.push({ key: "tested", state: "ok", title: parts.length > 1 ? "Both returns passed HMRC's test service with these figures" : "Passed HMRC's test service with these figures" });
  } else if (live.settings.requireTest) {
    checks.push({ key: "tested", state: "bad", title: `Send ${parts.length > 1 ? `return ${untested.map((x) => x.n + 1).join(" and ")}` : "the return"} to HMRC's test service first`, detail: "Your administrator requires these exact figures to pass HMRC's test service before filing. Changing any figure means testing again." });
  }
  checks.push(!approval ? { key: "approval", state: "info", title: "Director's approval: confirm it below", detail: "Or send it for approval online in the step before, and the approval is recorded here with the date and time." }
    : approval.status === "approved" ? { key: "approval", state: "ok", title: `Approved online by ${approval.name}`, detail: approval.at ? `On ${new Date(approval.at).toLocaleString("en-GB")}${approval.ip ? `, from ${approval.ip}` : ""}.` : undefined }
      : approval.status === "stale" ? { key: "approval", state: "warn", title: `${approval.name} approved earlier figures`, detail: "The figures changed after the approval. Send the new version for approval, or confirm below that the director has approved these figures." }
        : approval.status === "query" ? { key: "approval", state: "warn", title: `${approval.name} sent a question instead of approving`, detail: approval.query ?? undefined }
          : { key: "approval", state: "warn", title: `Waiting for ${approval.name} to approve online`, detail: "You can still file if the director has approved another way — confirm it below." });
  checks.push(data.declarantName ? { key: "declarant", state: "ok", title: `Declaration by ${data.declarantName} (${data.declarantStatus})` } : { key: "declarant", state: "bad", title: "Name the person making the declaration", detail: "In the approval step." });
  // A dormant company HMRC haven't sent a notice to file doesn't have to file, so it can't be late.
  const notRequired = data.dormant && data.ctNoticeReceived === false;
  if (p.filingDue && !allFiled && !notRequired) {
    checks.push(late
      ? { key: "deadline", state: "warn", title: `Filing deadline ${shortDate(p.filingDue)}: ${late.daysLate} day${late.daysLate === 1 ? "" : "s"} late`, detail: late.words.join(" ") }
      : { key: "deadline", state: "ok", title: `Due at HMRC by ${shortDate(p.filingDue)}` });
  }
  for (const x of parts) {
    if (x.payable <= 0) continue;
    const overdue = x.left > 0 && x.taxDue < today;
    checks.push({
      key: `tax-${x.n}`, state: x.left <= 0 ? "ok" : overdue ? "warn" : "info",
      title: x.left <= 0 ? `Tax of ${money(x.payable)}${parts.length > 1 ? ` for return ${x.n + 1}` : ""} recorded as paid`
        : `${money(x.left)} of tax${parts.length > 1 ? ` for return ${x.n + 1}` : ""} ${overdue ? `was due by ${shortDate(x.taxDue)}` : `due by ${shortDate(x.taxDue)}`}`,
      detail: x.left > 0 ? (overdue ? "HMRC charge interest on tax paid late, from the day after it was due. Paying is separate from filing: see Pay the tax below." : "Paying is separate from filing: see Pay the tax below.") : undefined,
    });
  }
  if (lockedUntil) checks.push({ key: "lock", state: "bad", title: "Two sign-ins failed in the last hour", detail: `To protect the HMRC account from being locked, Nucta File won't try again until ${new Date(lockedUntil).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}. Check the user ID and password by signing in on GOV.UK first.` });
  checks.push({ key: "account", state: "info", title: "The HMRC sign-in", detail: "Use the company's own HMRC organisation account with Corporation Tax added to it, or an agent's account authorised for this company's Corporation Tax. If Corporation Tax hasn't been added, HMRC refuse the sign-in: add it in the HMRC account (an activation code comes by post to the registered office)." });

  return {
    ok: true, mode: live.mode, why: live.why, requireTil: live.settings.requireTil, requireTest: live.settings.requireTest, checks, approval, lockedUntil, parts,
    company: { name: c.name, utr: c.utr, companyNo: c.companyNo }, filingDue: p.filingDue, late,
    emailReady: emailReady(), userEmail: u.email, amendment: Boolean(data.amends),
  };
}
