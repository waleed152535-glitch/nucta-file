"use server";

/**
 * Sending a return to its director for approval online, from inside the
 * software: every action checks the return belongs to the signed-in account.
 */
import { randomBytes, randomUUID } from "crypto";
import { headers } from "next/headers";
import { emailProblem, emailReady, normaliseEmail, sendEmail, sha256 } from "./auth";
import { SIGNED_OUT, ownedReturn, problem, signedIn, siteUrl, store } from "./store";
import { figuresHash } from "./approval-core";
import { normaliseReturnData, toCompanyReturnInput, type ReturnData } from "./return-model";
import { prepareReturn } from "./filing";

export interface ApprovalRow {
  id: string; directorName: string; directorEmail: string | null; status: string; createdAt: string; lastSentAt: string | null; sentCount: number;
  approvedAt: string | null; approvedName: string | null; approvedIp: string | null; query: string | null; expiresAt: string;
  /** The figures changed after this was sent. */
  stale: boolean;
}

const LINK_DAYS = 30;
const long = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

export async function listApprovals(returnId: string): Promise<{ ok: boolean; problem?: string; rows: ApprovalRow[]; emailReady: boolean }> {
  const u = await signedIn();
  if (!u) return { ok: false, problem: SIGNED_OUT, rows: [], emailReady: emailReady() };
  try {
    const s = await store();
    const r = await ownedReturn(s, u, returnId);
    if (!r) return { ok: false, problem: "That return isn't in Nucta File.", rows: [], emailReady: emailReady() };
    const now = figuresHash(r.periodStart, r.periodEnd, normaliseReturnData(r.data as Partial<ReturnData>));
    const rows = await s.db.select().from(s.approvals).where(s.eq(s.approvals.returnId, returnId)).orderBy(s.desc(s.approvals.createdAt));
    return {
      ok: true, emailReady: emailReady(),
      rows: rows.filter((a) => a.status !== "cancelled").map((a) => ({
        id: a.id, directorName: a.directorName, directorEmail: a.directorEmail, status: a.status, createdAt: a.createdAt.toISOString(),
        lastSentAt: a.lastSentAt?.toISOString() ?? null, sentCount: a.sentCount, approvedAt: a.approvedAt?.toISOString() ?? null,
        approvedName: a.approvedName, approvedIp: a.approvedIp, query: a.query, expiresAt: a.expiresAt.toISOString(), stale: a.figuresHash !== now,
      })),
    };
  } catch (e) {
    return { ok: false, problem: problem(e), rows: [], emailReady: emailReady() };
  }
}

async function mail(to: string | null, link: string, d: { director: string; company: string; from: string; to: string; tax: number; preparer: string; reminder: boolean }) {
  if (!to) return false;
  return sendEmail(to, `${d.reminder ? "Reminder: " : ""}Please approve ${d.company}'s accounts and tax return`,
    `Hello ${d.director},\n\n${d.preparer} has prepared the accounts and Company Tax Return for ${d.company}, for ${long(d.from)} to ${long(d.to)}. Corporation Tax: £${d.tax.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.\n\nPlease read them and approve here:\n\n${link}\n\nThe link shows the approval pack to read or download. If anything looks wrong, you can send a question from the same page instead of approving.\n\nNucta File, for ${d.preparer}`);
}

/** Sends the return to a director for approval. Any earlier link for the same return stops working. */
export async function requestApproval(returnId: string, directorNameRaw: string, directorEmailRaw: string): Promise<{ ok: boolean; problem?: string; link?: string; emailed?: boolean }> {
  const u = await signedIn();
  if (!u) return { ok: false, problem: SIGNED_OUT };
  const directorName = directorNameRaw.trim(), directorEmail = normaliseEmail(directorEmailRaw);
  if (directorName.length < 3) return { ok: false, problem: "Enter the director's full name." };
  if (directorEmail && emailProblem(directorEmail)) return { ok: false, problem: "That email address doesn't look right. Leave it empty to send the link yourself." };
  try {
    const s = await store();
    const r = await ownedReturn(s, u, returnId);
    if (!r) return { ok: false, problem: "That return isn't in Nucta File." };
    const [c] = await s.db.select().from(s.companies).where(s.eq(s.companies.id, r.companyId));
    const data = normaliseReturnData(r.data as Partial<ReturnData>);
    const p = prepareReturn(toCompanyReturnInput({ name: c.name, companyNo: c.companyNo, utr: c.utr }, r.periodStart, r.periodEnd, data));
    if (!p.ok) return { ok: false, problem: `The return isn't ready to approve yet: ${p.problems.join(" ")}` };
    await s.db.update(s.approvals).set({ status: "cancelled" }).where(s.and(s.eq(s.approvals.returnId, returnId), s.inArray(s.approvals.status, ["sent", "query"])));
    const token = randomBytes(32).toString("base64url");
    const now = new Date();
    await s.db.insert(s.approvals).values({
      id: randomUUID(), tokenHash: sha256(token), returnId, accountId: u.accountId, directorName, directorEmail: directorEmail || null,
      figuresHash: figuresHash(r.periodStart, r.periodEnd, data), createdBy: u.id, expiresAt: new Date(now.getTime() + LINK_DAYS * 86_400_000),
      lastSentAt: directorEmail ? now : null, sentCount: directorEmail ? 1 : 0,
    });
    const link = `${siteUrl((await headers()).get("host"))}/approve/${token}`;
    const emailed = await mail(directorEmail || null, link, { director: directorName, company: c.name, from: r.periodStart, to: r.periodEnd, tax: p.corporationTax + p.loansTax, preparer: u.accountName, reminder: false });
    return { ok: true, link, emailed };
  } catch (e) {
    return { ok: false, problem: problem(e) };
  }
}

/**
 * A fresh link for an approval still waiting: the old one stops working. With
 * an email address, the director is reminded by email.
 */
export async function resendApproval(approvalId: string): Promise<{ ok: boolean; problem?: string; link?: string; emailed?: boolean }> {
  const u = await signedIn();
  if (!u) return { ok: false, problem: SIGNED_OUT };
  try {
    const s = await store();
    const [a] = await s.db.select().from(s.approvals).where(s.and(s.eq(s.approvals.id, approvalId), s.eq(s.approvals.accountId, u.accountId)));
    if (!a || a.status === "approved" || a.status === "cancelled") return { ok: false, problem: "That approval can't be sent again." };
    const r = await ownedReturn(s, u, a.returnId);
    if (!r) return { ok: false, problem: "That return isn't in Nucta File." };
    const data = normaliseReturnData(r.data as Partial<ReturnData>);
    if (figuresHash(r.periodStart, r.periodEnd, data) !== a.figuresHash) return { ok: false, problem: "The figures have changed since this was sent. Send a new approval instead." };
    const [c] = await s.db.select().from(s.companies).where(s.eq(s.companies.id, r.companyId));
    const p = prepareReturn(toCompanyReturnInput({ name: c.name, companyNo: c.companyNo, utr: c.utr }, r.periodStart, r.periodEnd, data));
    const token = randomBytes(32).toString("base64url");
    const now = new Date();
    await s.db.update(s.approvals).set({ tokenHash: sha256(token), status: "sent", expiresAt: new Date(now.getTime() + LINK_DAYS * 86_400_000), ...(a.directorEmail ? { lastSentAt: now, sentCount: a.sentCount + 1 } : {}) })
      .where(s.eq(s.approvals.id, a.id));
    const link = `${siteUrl((await headers()).get("host"))}/approve/${token}`;
    const emailed = await mail(a.directorEmail, link, { director: a.directorName, company: c.name, from: r.periodStart, to: r.periodEnd, tax: p.corporationTax + p.loansTax, preparer: u.accountName, reminder: a.sentCount > 0 });
    return { ok: true, link, emailed };
  } catch (e) {
    return { ok: false, problem: problem(e) };
  }
}

export async function cancelApproval(approvalId: string): Promise<{ ok: boolean }> {
  const u = await signedIn();
  if (!u) return { ok: false };
  const s = await store();
  await s.db.update(s.approvals).set({ status: "cancelled" }).where(s.and(s.eq(s.approvals.id, approvalId), s.eq(s.approvals.accountId, u.accountId), s.ne(s.approvals.status, "approved")));
  return { ok: true };
}
