/**
 * A director approving a return online, by a link. Everything here is reached
 * by the link's token alone (only its hash is stored), so it is server only
 * and never a "use server" file.
 *
 * What is recorded on approval: the name typed, the time, the IP address and
 * browser, and a fingerprint of the figures as they were sent. If the figures
 * change afterwards, the approval no longer matches and Nucta File says so.
 */
import { createHash } from "crypto";
import { sha256, sendEmail } from "./auth";
import { store } from "./store";
import { normaliseReturnData, toCompanyReturnInput, type ReturnData } from "./return-model";
import { prepareReturn } from "./filing";
import type { LoadedReturn } from "./return-actions";

/** Approval and filing details don't change what is being approved. */
const NOT_FIGURES = new Set(["director", "approvedOn", "declarantName", "declarantStatus", "sent", "filing", "til", "paid", "carriedFrom"]);

export function figuresHash(periodStart: string, periodEnd: string, data: ReturnData): string {
  const sorted = (v: unknown): unknown => Array.isArray(v) ? v.map(sorted)
    : v && typeof v === "object" ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, sorted((v as Record<string, unknown>)[k])])) : v;
  const figures = Object.fromEntries(Object.entries(data).filter(([k]) => !NOT_FIGURES.has(k)));
  return createHash("sha256").update(JSON.stringify(sorted({ periodStart, periodEnd, figures }))).digest("hex");
}

/** A return by its id, without asking who is signed in: callers check access first. */
export async function loadReturnUnchecked(id: string): Promise<LoadedReturn> {
  const s = await store();
  const [r] = await s.db.select().from(s.returns).where(s.eq(s.returns.id, id));
  if (!r) return { ok: false, error: "That return no longer exists." };
  const [c] = await s.db.select().from(s.companies).where(s.eq(s.companies.id, r.companyId));
  return {
    ok: true, id: r.id, status: r.status, periodStart: r.periodStart, periodEnd: r.periodEnd,
    company: { id: c.id, name: c.name, companyNo: c.companyNo, utr: c.utr },
    data: normaliseReturnData(r.data as Partial<ReturnData>), submissions: [],
  };
}

export interface ApprovalView {
  ok: boolean;
  problem?: string;
  status?: string;
  returnId?: string;
  company?: string;
  companyNo?: string;
  periodFrom?: string;
  periodTo?: string;
  directorName?: string;
  preparedBy?: string;
  parts?: { from: string; to: string; tax: number; loansTax: number; due: string }[];
  filingDue?: string;
  dormant?: boolean;
  approvedAt?: string | null;
  approvedName?: string | null;
  /** The figures changed after the link was sent. */
  changed?: boolean;
}

async function find(token: string) {
  if (!token || token.length < 20) return null;
  const s = await store();
  const [a] = await s.db.select().from(s.approvals).where(s.eq(s.approvals.tokenHash, sha256(token)));
  return a ?? null;
}

export async function approvalByToken(token: string): Promise<ApprovalView> {
  const a = await find(token);
  if (!a || a.status === "cancelled") return { ok: false, problem: "This approval link isn't valid. It may have been replaced by a newer one: ask whoever sent it." };
  if (a.status !== "approved" && a.expiresAt.getTime() < Date.now()) return { ok: false, problem: "This approval link has expired. Ask whoever sent it for a new one." };
  const r = await loadReturnUnchecked(a.returnId);
  if (!r.ok || !r.data || !r.company) return { ok: false, problem: r.error };
  const p = prepareReturn(toCompanyReturnInput(r.company, r.periodStart!, r.periodEnd!, r.data));
  const s = await store();
  const [acct] = await s.db.select({ name: s.accounts.name }).from(s.accounts).where(s.eq(s.accounts.id, a.accountId));
  return {
    ok: true, status: a.status, returnId: a.returnId, company: r.company.name, companyNo: r.company.companyNo ?? "",
    periodFrom: r.periodStart, periodTo: r.periodEnd, directorName: a.directorName,
    preparedBy: acct?.name ?? "your accountant",
    parts: p.parts.map((x) => ({ from: x.periodFrom, to: x.periodTo, tax: x.computation.taxChargeable, loansTax: x.loans?.a80 ?? 0, due: x.taxDue })),
    filingDue: p.filingDue, dormant: Boolean(r.data.dormant),
    approvedAt: a.approvedAt?.toISOString() ?? null, approvedName: a.approvedName,
    changed: figuresHash(r.periodStart!, r.periodEnd!, r.data) !== a.figuresHash,
  };
}

/** The approval link's own copy of the return, for its documents. */
export async function returnForToken(token: string): Promise<LoadedReturn | null> {
  const a = await find(token);
  if (!a || a.status === "cancelled" || (a.status !== "approved" && a.expiresAt.getTime() < Date.now())) return null;
  const r = await loadReturnUnchecked(a.returnId);
  return r.ok ? r : null;
}

async function tellPreparer(a: { createdBy: string; accountId: string }, subject: string, text: string) {
  const s = await store();
  const [u] = await s.db.select({ email: s.users.email }).from(s.users).where(s.and(s.eq(s.users.id, a.createdBy), s.eq(s.users.accountId, a.accountId)));
  if (u) await sendEmail(u.email, subject, text);
}

export async function approveByToken(token: string, typedName: string, agreed: boolean, who: { ip: string | null; ua: string | null }): Promise<{ ok: boolean; problem?: string }> {
  const v = await approvalByToken(token);
  if (!v.ok) return { ok: false, problem: v.problem };
  if (v.status === "approved") return { ok: false, problem: "This return has already been approved." };
  if (v.changed) return { ok: false, problem: "The figures have changed since this link was sent, so it can't be approved as it stands. Ask for a new link." };
  const name = typedName.trim().replace(/\s+/g, " ");
  if (name.length < 3) return { ok: false, problem: "Type your full name to approve." };
  if (!agreed) return { ok: false, problem: "Tick the box to confirm." };
  const a = (await find(token))!;
  const s = await store();
  const now = new Date();
  await s.db.update(s.approvals).set({ status: "approved", approvedAt: now, approvedName: name, approvedIp: who.ip?.slice(0, 80) ?? null, approvedUa: who.ua?.slice(0, 300) ?? null })
    .where(s.eq(s.approvals.id, a.id));
  // Fill in the approval date and director on a return still being prepared, so the accounts show them.
  const [r] = await s.db.select().from(s.returns).where(s.eq(s.returns.id, a.returnId));
  if (r && (r.status === "draft" || r.status === "rejected-test")) {
    const d = normaliseReturnData(r.data as Partial<ReturnData>);
    const day = now.toISOString().slice(0, 10);
    const next = { ...d, approvedOn: d.approvedOn || day, director: d.director || name };
    if (next.approvedOn !== d.approvedOn || next.director !== d.director) {
      await s.db.update(s.returns).set({ data: next as unknown as Record<string, unknown>, updatedAt: now }).where(s.eq(s.returns.id, r.id));
    }
  }
  await tellPreparer(a, `${v.company}: approved by ${name}`,
    `${name} approved the accounts and Company Tax Return for ${v.company} (${v.periodFrom} to ${v.periodTo}) on ${now.toUTCString()}.\n\nThe approval is recorded with the return in Nucta File.`).catch(() => undefined);
  return { ok: true };
}

export async function queryByToken(token: string, message: string): Promise<{ ok: boolean; problem?: string }> {
  const v = await approvalByToken(token);
  if (!v.ok) return { ok: false, problem: v.problem };
  if (v.status === "approved") return { ok: false, problem: "This return has already been approved." };
  const text = message.trim();
  if (text.length < 3) return { ok: false, problem: "Write your question first." };
  const a = (await find(token))!;
  const s = await store();
  await s.db.update(s.approvals).set({ status: "query", query: text.slice(0, 2000) }).where(s.eq(s.approvals.id, a.id));
  await tellPreparer(a, `${v.company}: a question from ${v.directorName}`,
    `${v.directorName} has a question about the accounts and return for ${v.company} before approving:\n\n${text}\n\nOpen the return in Nucta File to reply and send a new link.`).catch(() => undefined);
  return { ok: true };
}
