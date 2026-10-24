"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { buildEnvelope, markWasCanonical } from "./ct600-xml";
import { submitAndWait, askAgain, explain, receiptText, type RunResult } from "./govtalk";
import { gatewayConfig, messageClass, redact, redactLive, liveConfig, maskId, type LiveFiling } from "./hmrc";
import { liveModeFor } from "./live-settings";
import { signInLock, onlineApproval } from "./filing-checks";
import { receiptEmailText } from "./filing-rules";
import type { CompaniesHouseForm } from "./accounts/ch-form";
import { sendEmail } from "./auth";
import { prepareReturn, type PreparedReturn } from "./filing";
import { companyNumberProblem } from "./companies-house";
import { checkMicroAccounts } from "./accounts/micro";
import {
  normaliseReturnData, toCompanyReturnInput, toPeriodOfAccountInput, toFigures, dormantBalanceSheet, blankReturnData, SERVER_KEYS,
  type ReturnData, type SentRecord,
} from "./return-model";
import { exceedsEighteenMonths, fromDay, toDay } from "./tax/dates";
import { accountingPeriodsOf, amendmentDeadline, computePeriodOfAccount } from "./tax/long-period";
import { chApiReady, companyProfile, searchCompanies, type ChProfile, type ChSearchHit } from "./ch-api";
import { deadlinesFor, type Deadline } from "./deadlines";
import { ensureSchema } from "./db-ensure";
import { feeState } from "./billing";
import { currentUser, emailCheckNeeded, type SignedInUser } from "./auth";

/**
 * Companies and their returns, for the filing screens.
 *
 * The database is reached through dynamic imports so that a page can still
 * explain itself when DATABASE_URL isn't set, rather than failing to load.
 */

async function store() {
  const { db } = await import("./db");
  const schema = await import("./schema");
  const orm = await import("drizzle-orm");
  // Tables and columns added since the database was first set up.
  await ensureSchema().catch(() => undefined);
  return { db, ...schema, ...orm };
}

const SIGNED_OUT = "You're signed out. Sign in again to carry on.";
type Store = Awaited<ReturnType<typeof store>>;

/** A company, only if it belongs to the signed-in user's account. */
async function ownCompany(s: Store, u: SignedInUser, companyId: string) {
  const [c] = await s.db.select().from(s.companies).where(s.and(s.eq(s.companies.id, companyId), s.eq(s.companies.accountId, u.accountId)));
  return c ?? null;
}

/** A return, only if its company belongs to the signed-in user's account. */
async function ownReturn(s: Store, u: SignedInUser, returnId: string) {
  const [row] = await s.db.select({ r: s.returns }).from(s.returns)
    .innerJoin(s.companies, s.eq(s.companies.id, s.returns.companyId))
    .where(s.and(s.eq(s.returns.id, returnId), s.eq(s.companies.accountId, u.accountId)));
  return row?.r ?? null;
}

const msg = (e: unknown): string => {
  const m = String((e as Error)?.message ?? e);
  return /does not exist/.test(m)
    ? "The database tables aren't set up yet. Open the Submission log and press “Create the tables”."
    : m.slice(0, 300);
};

export interface CompanyRow {
  id: string; name: string; companyNo: string | null; utr: string | null; incorporatedOn: string | null;
  returns: number; latest: { periodEnd: string; status: string } | null;
}

export async function listCompanies(): Promise<{ ok: boolean; error?: string; companies: CompanyRow[] }> {
  const u = await currentUser();
  if (!u) return { ok: false, error: SIGNED_OUT, companies: [] };
  try {
    const s = await store();
    const cos = await s.db.select().from(s.companies).where(s.and(s.eq(s.companies.archived, false), s.eq(s.companies.accountId, u.accountId))).orderBy(s.asc(s.companies.name));
    const ids = cos.map((c) => c.id);
    const rets = ids.length ? await s.db.select({ companyId: s.returns.companyId, periodEnd: s.returns.periodEnd, status: s.returns.status }).from(s.returns).where(s.inArray(s.returns.companyId, ids)) : [];
    return {
      ok: true,
      companies: cos.map((c) => {
        const mine = rets.filter((r) => r.companyId === c.id).sort((a, b) => b.periodEnd.localeCompare(a.periodEnd));
        return { id: c.id, name: c.name, companyNo: c.companyNo, utr: c.utr, incorporatedOn: c.incorporatedOn, returns: mine.length, latest: mine[0] ?? null };
      }),
    };
  } catch (e) {
    return { ok: false, error: msg(e), companies: [] };
  }
}

export interface NewCompany { name: string; companyNo: string; utr: string; incorporatedOn: string; registeredOffice?: string; chProfile?: ChProfile | null }

/** Whether companies can be looked up at Companies House (a CH_API_KEY is set). */
export async function companiesHouseSearchReady(): Promise<boolean> {
  return chApiReady();
}

export async function searchCompaniesHouse(q: string): Promise<{ ok: boolean; error?: string; hits: ChSearchHit[] }> {
  if (!(await currentUser())) return { ok: false, error: SIGNED_OUT, hits: [] };
  const r = await searchCompanies(q);
  return r.ok ? { ok: true, hits: r.value } : { ok: false, error: r.error, hits: [] };
}

export async function lookupCompany(number: string): Promise<{ ok: boolean; error?: string; profile?: ChProfile }> {
  if (!(await currentUser())) return { ok: false, error: SIGNED_OUT };
  const r = await companyProfile(number);
  return r.ok ? { ok: true, profile: r.value } : { ok: false, error: r.error };
}

/** Reads the company's record from Companies House again: new accounts dates, address or status. */
export async function refreshFromCompaniesHouse(companyId: string): Promise<{ ok: boolean; error?: string }> {
  const u = await currentUser();
  if (!u) return { ok: false, error: SIGNED_OUT };
  try {
    const s = await store();
    const c = await ownCompany(s, u, companyId);
    if (!c?.companyNo) return { ok: false, error: "This company has no company number to look up." };
    const r = await companyProfile(c.companyNo);
    if (!r.ok) return { ok: false, error: r.error };
    await s.db.update(s.companies).set({
      chProfile: r.value, registeredOffice: r.value.registeredOffice || c.registeredOffice,
      incorporatedOn: c.incorporatedOn ?? r.value.incorporatedOn,
    }).where(s.eq(s.companies.id, companyId));
    revalidatePath(`/companies/${companyId}`); revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
}

export async function addCompany(c: NewCompany): Promise<{ ok: boolean; id?: string; problems: string[] }> {
  const u = await currentUser();
  if (!u) return { ok: false, problems: [SIGNED_OUT] };
  const problems: string[] = [];
  const name = c.name.trim(), no = c.companyNo.trim().toUpperCase(), utr = c.utr.replace(/\s/g, "");
  if (name.length < 3) problems.push("Enter the company's name as it appears at Companies House.");
  const np = companyNumberProblem(no); if (np) problems.push(np);
  if (!/^\d{10}$/.test(utr)) problems.push("The Unique Taxpayer Reference is 10 digits. It's on HMRC's letters to the company (not the director's own UTR).");
  if (c.incorporatedOn && !/^\d{4}-\d{2}-\d{2}$/.test(c.incorporatedOn)) problems.push("The incorporation date isn't a date.");
  if (problems.length) return { ok: false, problems };
  try {
    const s = await store();
    const dup = await s.db.select({ id: s.companies.id }).from(s.companies).where(s.and(s.eq(s.companies.companyNo, no), s.eq(s.companies.accountId, u.accountId)));
    if (dup.length) return { ok: false, problems: [`Company ${no} is already in Nucta File.`] };
    const id = randomUUID();
    await s.db.insert(s.companies).values({
      id, accountId: u.accountId, name, companyNo: no, utr, incorporatedOn: c.incorporatedOn || null,
      registeredOffice: c.registeredOffice?.trim() || c.chProfile?.registeredOffice || null, chProfile: c.chProfile ?? null,
    });
    revalidatePath("/companies"); revalidatePath("/dashboard");
    return { ok: true, id, problems: [] };
  } catch (e) {
    return { ok: false, problems: [msg(e)] };
  }
}

export interface ImportLine { line: string; number: string; name?: string; outcome: "added" | "exists" | "not-found" | "problem"; detail: string; id?: string }

/**
 * Adds many companies at once: one per line, the company number and,
 * optionally, its Corporation Tax UTR ("15123456, 1234567890" or with tabs
 * or spaces between). Each is looked up at Companies House for its name,
 * address and accounts dates. A company without a UTR can be added and the
 * UTR filled in later on its page.
 */
export async function importCompanies(text: string): Promise<{ ok: boolean; error?: string; results: ImportLine[] }> {
  const u = await currentUser();
  if (!u) return { ok: false, error: SIGNED_OUT, results: [] };
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 200);
  if (!lines.length) return { ok: false, error: "Paste at least one company number.", results: [] };
  const canLookUp = chApiReady();
  try {
    const s = await store();
    const have = new Set((await s.db.select({ no: s.companies.companyNo }).from(s.companies).where(s.eq(s.companies.accountId, u.accountId))).map((r) => (r.no ?? "").toUpperCase()));
    const results: ImportLine[] = [];
    for (const line of lines) {
      const cells = line.split(/[,;\t]+|\s{2,}/).map((x) => x.trim()).filter(Boolean);
      const words = line.split(/[\s,;]+/).filter(Boolean);
      const utr = (words.find((w) => /^\d{10}$/.test(w.replace(/\s/g, ""))) ?? "").replace(/\s/g, "");
      const rawNo = words.find((w) => /^([A-Z]{2}\d{6}|\d{1,8})$/i.test(w) && w !== utr) ?? "";
      const no = /^\d{1,8}$/.test(rawNo) ? rawNo.padStart(8, "0") : rawNo.toUpperCase();
      if (!no) { results.push({ line, number: "", outcome: "problem", detail: "No company number found on this line." }); continue; }
      if (have.has(no)) { results.push({ line, number: no, outcome: "exists", detail: "Already in your list." }); continue; }
      let name = cells.find((c) => /[A-Za-z]{2}/.test(c) && !/^[A-Z]{2}\d{6}$/i.test(c)) ?? "";
      let profile: ChProfile | null = null;
      if (canLookUp) {
        const p = await companyProfile(no);
        if (!p.ok) { results.push({ line, number: no, outcome: p.error.includes("no company") ? "not-found" : "problem", detail: p.error }); continue; }
        profile = p.value; name = p.value.name;
      }
      if (name.trim().length < 3) { results.push({ line, number: no, outcome: "problem", detail: "Companies House search isn't set up, so put the company's name on the line too." }); continue; }
      const id = randomUUID();
      await s.db.insert(s.companies).values({
        id, accountId: u.accountId, name: name.trim(), companyNo: no, utr: utr || null, incorporatedOn: profile?.incorporatedOn ?? null,
        registeredOffice: profile?.registeredOffice || null, chProfile: profile,
      });
      have.add(no);
      results.push({ line, number: no, name: name.trim(), id, outcome: "added", detail: utr ? `UTR ${utr}` : "Add the UTR on the company's page before starting a return." });
    }
    revalidatePath("/companies"); revalidatePath("/dashboard");
    return { ok: true, results };
  } catch (e) {
    return { ok: false, error: msg(e), results: [] };
  }
}

/** Corrects a company's own details: its name, UTR, incorporation date and registered office. */
export async function updateCompany(id: string, c: { name: string; utr: string; incorporatedOn: string; registeredOffice: string }): Promise<{ ok: boolean; problems: string[] }> {
  const u = await currentUser();
  if (!u) return { ok: false, problems: [SIGNED_OUT] };
  const problems: string[] = [];
  const name = c.name.trim(), utr = c.utr.replace(/\s/g, "");
  if (name.length < 3) problems.push("Enter the company's name as it appears at Companies House.");
  if (utr && !/^\d{10}$/.test(utr)) problems.push("The Unique Taxpayer Reference is 10 digits.");
  if (c.incorporatedOn && !/^\d{4}-\d{2}-\d{2}$/.test(c.incorporatedOn)) problems.push("The incorporation date isn't a date.");
  if (problems.length) return { ok: false, problems };
  try {
    const s = await store();
    const co = await ownCompany(s, u, id);
    if (!co) return { ok: false, problems: ["That company isn't in Nucta File."] };
    await s.db.update(s.companies).set({ name, utr: utr || null, incorporatedOn: c.incorporatedOn || null, registeredOffice: c.registeredOffice.trim() || null }).where(s.eq(s.companies.id, id));
    revalidatePath(`/companies/${id}`);
    return { ok: true, problems: [] };
  } catch (e) {
    return { ok: false, problems: [msg(e)] };
  }
}

export interface ReturnRow {
  id: string; periodStart: string; periodEnd: string; status: string; updatedAt: string;
  /** How many Corporation Tax returns the period makes: 2 when the accounts pass 12 months. */
  parts: number;
  /** Whether this is an amended return. */
  amendment: boolean;
}

/** The status of the whole period from the status of each of its returns. */
function overallStatus(sent: Record<string, SentRecord> | undefined, parts: number): string {
  const recs = Array.from({ length: parts }, (_, n) => sent?.[String(n)]);
  if (recs.every((r) => r?.status === "accepted")) return "accepted";
  if (recs.some((r) => r?.status === "submitted-live")) return "submitted-live";
  if (recs.some((r) => r?.status === "accepted")) return "partly-filed";
  if (recs.some((r) => r?.status === "rejected-test")) return "rejected-test";
  if (recs.every((r) => r?.status === "accepted-test" || r?.status === "accepted")) return "accepted-test";
  if (recs.some((r) => r?.status === "submitted-test")) return "submitted-test";
  if (recs.some((r) => r)) return "partly-sent-test";
  return "draft";
}

const accepted = (status: string) => status === "accepted" || status === "accepted-test";
/** Whether any of the period's returns has gone to HMRC for real. */
const filedLive = (d: ReturnData) => Object.values(d.sent ?? {}).some((x) => x.status === "accepted" || x.status === "submitted-live");
/** A live filing started less than ten minutes ago and not yet answered. */
const filingUnderWay = (d: ReturnData, part?: number) =>
  Object.entries(d.filing ?? {}).some(([k, at]) => (part === undefined || k === String(part)) && Date.now() - Date.parse(at) < 10 * 60_000);

/** JSON with keys sorted, so two copies of the same data compare equal whatever order their keys were written in. */
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v as object).sort().filter((k) => (v as Record<string, unknown>)[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(v);
}

/** The data without the keys the server keeps for itself. */
function editable(d: ReturnData): Record<string, unknown> {
  const c: Record<string, unknown> = { ...d };
  for (const k of SERVER_KEYS) delete c[k];
  return c;
}

export interface CompanyDetail {
  id: string; name: string; companyNo: string | null; utr: string | null; incorporatedOn: string | null;
  registeredOffice: string | null; chProfile: ChProfile | null;
}

export async function getCompany(id: string): Promise<{ ok: boolean; error?: string; company?: CompanyDetail; returns: ReturnRow[]; deadlines: Deadline[]; chReady: boolean }> {
  const u = await currentUser();
  if (!u) return { ok: false, error: SIGNED_OUT, returns: [], deadlines: [], chReady: chApiReady() };
  try {
    const s = await store();
    const c = await ownCompany(s, u, id);
    if (!c) return { ok: false, error: "That company isn't in Nucta File.", returns: [], deadlines: [], chReady: chApiReady() };
    const rets = await s.db.select().from(s.returns).where(s.eq(s.returns.companyId, id)).orderBy(s.desc(s.returns.periodEnd));
    const today = new Date().toISOString().slice(0, 10);
    return {
      ok: true, chReady: chApiReady(),
      deadlines: deadlinesFor([toDeadlineCompany(c)], rets.map(toDeadlineReturn), today),
      company: { id: c.id, name: c.name, companyNo: c.companyNo, utr: c.utr, incorporatedOn: c.incorporatedOn, registeredOffice: c.registeredOffice, chProfile: c.chProfile ?? null },
      returns: rets.map((r) => ({
        id: r.id, periodStart: r.periodStart, periodEnd: r.periodEnd, status: r.status, updatedAt: r.updatedAt.toISOString(),
        parts: accountingPeriodsOf(r.periodStart, r.periodEnd).length,
        amendment: Boolean((r.data as Partial<ReturnData> | null)?.amends),
      })),
    };
  } catch (e) {
    return { ok: false, error: msg(e), returns: [], deadlines: [], chReady: chApiReady() };
  }
}

type CompanyRowDb = { id: string; name: string; companyNo: string | null; incorporatedOn: string | null; chProfile?: ChProfile | null };
type ReturnRowDb = { id: string; companyId: string; periodStart: string; periodEnd: string; status: string; data: unknown };

const toDeadlineCompany = (c: CompanyRowDb) => ({
  id: c.id, name: c.name, companyNo: c.companyNo, incorporatedOn: c.incorporatedOn,
  ch: c.chProfile ? { nextAccountsMadeUpTo: c.chProfile.nextAccountsMadeUpTo, nextAccountsDue: c.chProfile.nextAccountsDue, lastAccountsMadeUpTo: c.chProfile.lastAccountsMadeUpTo, confirmationStatementDue: c.chProfile.confirmationStatementDue } : null,
});

/** A return for the deadline list, with the tax for each of its periods when the figures can be worked out. */
function toDeadlineReturn(r: ReturnRowDb) {
  const d = normaliseReturnData(r.data as Partial<ReturnData>);
  let taxByPart: { to: string; tax: number }[] | undefined;
  try {
    const poa = computePeriodOfAccount(toPeriodOfAccountInput(r.periodStart, r.periodEnd, d));
    if (poa.parts.length) taxByPart = poa.parts.map((x) => ({ to: x.to, tax: Math.round((x.result.taxChargeable + (x.loans?.a80 ?? 0)) * 100) / 100 }));
  } catch { /* figures not complete enough yet */ }
  const parts = accountingPeriodsOf(r.periodStart, r.periodEnd);
  const paidByPart = Object.entries(d.paid ?? {}).flatMap(([n, list]) => parts[Number(n)] ? list.map((x) => ({ to: parts[Number(n)].to, amount: x.amount })) : []);
  return { id: r.id, companyId: r.companyId, periodStart: r.periodStart, periodEnd: r.periodEnd, status: r.status, amendment: Boolean(d.amends), taxByPart, ctNotRequired: d.dormant && d.ctNoticeReceived === false, paidByPart };
}

export interface DashboardReturn {
  id: string; companyId: string; companyName: string; periodStart: string; periodEnd: string; status: string; updatedAt: string;
  parts: number; amendment: boolean;
  /** Corporation Tax and tax on loans, all parts together; null until the figures are complete enough. */
  tax: number | null;
  /** The director's online approval: waiting, approved or a question asked. */
  approval: "sent" | "approved" | "query" | null;
}
export interface ActivityItem { at: string; returnId: string; companyName: string; what: string; tone: "good" | "bad" | "info" }
export interface DashboardData {
  ok: boolean;
  error?: string;
  counts: { companies: number; filed: number; passedTest: number; overdue: number; dueSoon: number };
  deadlines: Deadline[];
  recent: DashboardReturn[];
  /** Every return, for the board of work in progress. */
  returns: DashboardReturn[];
  /** What happened lately: tests and filings with HMRC, newest first. */
  activity: ActivityItem[];
  companies: { id: string; name: string; companyNo: string | null; next: Deadline | null; returns: number }[];
}

export interface FoundItem { kind: "company" | "return"; id: string; title: string; detail: string; href: string }

/**
 * The search box in the top bar: this account's companies by name or number,
 * and their returns by company name or year end. With no words, the most
 * recently worked-on returns and the first companies.
 */
export async function quickFind(q: string): Promise<FoundItem[]> {
  const u = await currentUser();
  if (!u) return [];
  try {
    const s = await store();
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean).slice(0, 5);
    const cos = await s.db.select({ id: s.companies.id, name: s.companies.name, companyNo: s.companies.companyNo, utr: s.companies.utr })
      .from(s.companies).where(s.and(s.eq(s.companies.archived, false), s.eq(s.companies.accountId, u.accountId))).orderBy(s.asc(s.companies.name));
    const hit = (text: string) => words.every((w) => text.toLowerCase().includes(w));
    const companyHits = cos.filter((c) => !words.length || hit(`${c.name} ${c.companyNo ?? ""} ${c.utr ?? ""}`)).slice(0, words.length ? 8 : 5);
    const ids = cos.map((c) => c.id);
    const rets = ids.length ? await s.db.select({ id: s.returns.id, companyId: s.returns.companyId, periodStart: s.returns.periodStart, periodEnd: s.returns.periodEnd, status: s.returns.status, updatedAt: s.returns.updatedAt })
      .from(s.returns).where(s.inArray(s.returns.companyId, ids)).orderBy(s.desc(s.returns.updatedAt)).limit(400) : [];
    const nameOf = new Map(cos.map((c) => [c.id, c.name]));
    const year = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    const returnHits = rets.filter((r) => !words.length || hit(`${nameOf.get(r.companyId) ?? ""} ${r.periodEnd} ${year(r.periodEnd)} return`)).slice(0, words.length ? 8 : 5);
    return [
      ...returnHits.map((r) => ({ kind: "return" as const, id: r.id, title: `${nameOf.get(r.companyId) ?? ""}`, detail: `Return to ${year(r.periodEnd)}`, href: `/returns/${r.id}` })),
      ...companyHits.map((c) => ({ kind: "company" as const, id: c.id, title: c.name, detail: [c.companyNo, c.utr ? `UTR ${c.utr}` : ""].filter(Boolean).join(", "), href: `/companies/${c.id}` })),
    ];
  } catch {
    return [];
  }
}

/** Everything the dashboard shows: counts, every client's next deadlines, recent returns. */
export async function getDashboard(today = new Date().toISOString().slice(0, 10)): Promise<DashboardData> {
  const empty: DashboardData = { ok: false, counts: { companies: 0, filed: 0, passedTest: 0, overdue: 0, dueSoon: 0 }, deadlines: [], recent: [], returns: [], activity: [], companies: [] };
  const u = await currentUser();
  if (!u) return { ...empty, error: SIGNED_OUT };
  try {
    const s = await store();
    const cos = await s.db.select().from(s.companies).where(s.and(s.eq(s.companies.archived, false), s.eq(s.companies.accountId, u.accountId))).orderBy(s.asc(s.companies.name));
    const ids = cos.map((c) => c.id);
    const rets = ids.length ? await s.db.select({
      id: s.returns.id, companyId: s.returns.companyId, periodStart: s.returns.periodStart, periodEnd: s.returns.periodEnd,
      status: s.returns.status, data: s.returns.data, updatedAt: s.returns.updatedAt,
    }).from(s.returns).where(s.inArray(s.returns.companyId, ids)) : [];
    const forDeadlines = rets.map(toDeadlineReturn);
    const deadlines = deadlinesFor(cos.map(toDeadlineCompany), forDeadlines, today);
    const name = new Map(cos.map((c) => [c.id, c.name]));
    const taxOf = new Map(forDeadlines.map((r) => [r.id, r.taxByPart ? Math.round(r.taxByPart.reduce((t, x) => t + x.tax, 0) * 100) / 100 : null]));
    const retIds = rets.map((r) => r.id);
    const companyOfReturnName = (rid: string) => name.get(rets.find((r) => r.id === rid)?.companyId ?? "") ?? "";
    // Each return's latest online approval, and what directors did lately.
    const apps = retIds.length ? await s.db.select({ returnId: s.approvals.returnId, status: s.approvals.status, createdAt: s.approvals.createdAt, approvedAt: s.approvals.approvedAt, approvedName: s.approvals.approvedName, directorName: s.approvals.directorName })
      .from(s.approvals).where(s.and(s.inArray(s.approvals.returnId, retIds), s.ne(s.approvals.status, "cancelled"))).orderBy(s.desc(s.approvals.createdAt)) : [];
    const approvalOf = new Map<string, DashboardReturn["approval"]>();
    for (const a of apps) if (!approvalOf.has(a.returnId)) approvalOf.set(a.returnId, a.status as DashboardReturn["approval"]);
    const all: DashboardReturn[] = [...rets].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).map((r) => ({
      id: r.id, companyId: r.companyId, companyName: name.get(r.companyId) ?? "", periodStart: r.periodStart, periodEnd: r.periodEnd,
      status: r.status, updatedAt: r.updatedAt.toISOString(), parts: accountingPeriodsOf(r.periodStart, r.periodEnd).length,
      amendment: Boolean((r.data as Partial<ReturnData> | null)?.amends), tax: taxOf.get(r.id) ?? null, approval: approvalOf.get(r.id) ?? null,
    }));
    // Tests and filings with HMRC for this account's returns, newest first.
    const sent = retIds.length ? await s.db.select({
      returnId: s.submissions.returnId, gatewayTest: s.submissions.gatewayTest, messageClass: s.submissions.messageClass,
      outcome: s.submissions.outcome, startedAt: s.submissions.startedAt, finishedAt: s.submissions.finishedAt,
    }).from(s.submissions).where(s.inArray(s.submissions.returnId, retIds)).orderBy(s.desc(s.submissions.startedAt)).limit(20) : [];
    const companyOfReturn = new Map(rets.map((r) => [r.id, name.get(r.companyId) ?? ""]));
    const approvalsActivity: ActivityItem[] = apps.filter((a) => a.status === "approved" || a.status === "query").map((a) => ({
      at: (a.approvedAt ?? a.createdAt).toISOString(), returnId: a.returnId, companyName: companyOfReturnName(a.returnId),
      what: a.status === "approved" ? `Approved by ${a.approvedName ?? a.directorName}` : `${a.directorName} asked a question`, tone: a.status === "approved" ? "good" : "info",
    }));
    const activity: ActivityItem[] = [...approvalsActivity, ...sent.map((x) => {
      const test = x.gatewayTest || /-TIL$/.test(x.messageClass);
      const what = x.outcome === "accepted" ? (test ? "Passed HMRC's test service" : "Filed with HMRC")
        : x.outcome === "rejected" ? (test ? "Turned down by HMRC's test service" : "Turned down by HMRC")
        : x.outcome === "running" ? (test ? "Sent to HMRC's test service" : "Sent to HMRC") : (test ? "Test didn't complete" : "Filing didn't complete");
      return { at: (x.finishedAt ?? x.startedAt).toISOString(), returnId: x.returnId ?? "", companyName: companyOfReturn.get(x.returnId ?? "") ?? "",
        what, tone: x.outcome === "accepted" ? "good" : x.outcome === "rejected" || x.outcome === "error" ? "bad" : "info" } as ActivityItem;
    })].sort((a, b) => b.at.localeCompare(a.at));
    return {
      ok: true,
      counts: {
        companies: cos.length,
        filed: rets.filter((r) => r.status === "accepted").length,
        passedTest: rets.filter((r) => r.status === "accepted-test").length,
        overdue: deadlines.filter((d) => d.state === "overdue").length,
        dueSoon: deadlines.filter((d) => d.state === "soon").length,
      },
      deadlines,
      recent: all.slice(0, 12),
      returns: all,
      activity,
      companies: cos.map((c) => ({
        id: c.id, name: c.name, companyNo: c.companyNo, returns: rets.filter((r) => r.companyId === c.id).length,
        next: deadlines.find((d) => d.companyId === c.id) ?? null,
      })),
    };
  } catch (e) {
    return { ...empty, error: msg(e) };
  }
}

/**
 * Starts a return. When the company has a return for the period just
 * before, its closing figures become this one's opening figures: pool values
 * and losses carried forward, last year's accounts for the comparative
 * column, the trade description, reserves and share capital.
 */
export async function startReturn(companyId: string, periodStart: string, periodEnd: string): Promise<{ ok: boolean; id?: string; problems: string[] }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd)) return { ok: false, problems: ["Both dates are needed."] };
  if (periodEnd <= periodStart) return { ok: false, problems: ["The period must end after it starts."] };
  if (exceedsEighteenMonths(periodStart, periodEnd)) {
    return { ok: false, problems: ["Accounts can't cover more than 18 months, so these dates look wrong. Check the start date and the accounts year end."] };
  }
  const u = await currentUser();
  if (!u) return { ok: false, problems: [SIGNED_OUT] };
  try {
    const s = await store();
    if (!(await ownCompany(s, u, companyId))) return { ok: false, problems: ["That company isn't in Nucta File."] };
    const existing = await s.db.select().from(s.returns).where(s.eq(s.returns.companyId, companyId));
    if (existing.some((r) => r.periodStart === periodStart && r.periodEnd === periodEnd)) {
      return { ok: false, problems: ["There's already a return for exactly this period. Open that one instead."] };
    }
    const data = blankReturnData();
    // The return for the period just before; when it was amended, the latest
    // accepted version of it.
    const candidates = existing
      .filter((r) => r.periodEnd === fromDay(toDay(periodStart) - 1))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const before = candidates.find((r) => accepted(r.status)) ?? candidates[0];
    if (before) {
      const prev = normaliseReturnData(before.data as Partial<ReturnData>);
      // For accounts longer than 12 months, what carries forward is what the second period ends with.
      const poa = computePeriodOfAccount(toPeriodOfAccountInput(before.periodStart, before.periodEnd, prev));
      const last = poa.parts[poa.parts.length - 1];
      // A dormant year has no trade, so pools and losses pass through it unchanged.
      const unchanged = { mainPool: prev.mainPoolBroughtForward, specialPool: prev.specialPoolBroughtForward, tradingLosses: prev.tradingLossesBroughtForward };
      const carry = prev.dormant ? unchanged : last?.result.carryForward ?? unchanged;
      // What last year's accounts actually showed: a dormant year's profit and loss is nothing.
      const prevPl = toFigures(before.periodStart, before.periodEnd, prev).pl;
      const b = prev.dormant ? dormantBalanceSheet(prev.balanceSheet) : prev.balanceSheet;
      const acc = checkMicroAccounts({
        companyName: "", companyNo: "", periodFrom: before.periodStart, periodTo: before.periodEnd, principalActivities: prev.activity,
        pl: prevPl, taxCharge: poa.corporationTax, balanceSheet: b, director: prev.director, approvedOn: prev.approvedOn,
      });
      const prevLoans = poa.closingLoans;
      Object.assign(data, {
        // Each loan account opens where it closed; repayments made after last
        // year end happened in this year, so they start as this year's repayments.
        participators: prev.participators.map((x, n) => {
          const res = prevLoans?.people[n];
          return {
            ...x, openingOwed: res?.closingOwed ?? 0, openingCredit: res?.closingCredit ?? 0,
            advances: 0, advancesFrom6April2026: 0, repaid: x.later.reduce((t, l) => t + (l.amount || 0), 0), later: [],
            firstPart: undefined,
          };
        }),
        activity: prev.activity,
        dormant: prev.dormant, everTraded: prev.everTraded || !prev.dormant,
        scope: prev.scope,
        associatedCompanies: prev.associatedCompanies,
        mainPoolBroughtForward: carry.mainPool,
        specialPoolBroughtForward: carry.specialPool,
        tradingLossesBroughtForward: carry.tradingLosses,
        director: prev.director,
        declarantName: prev.declarantName,
        declarantStatus: prev.declarantStatus,
        balanceSheet: {
          ...data.balanceSheet, shareCapital: b.shareCapital, shareCapitalNotPaid: b.shareCapitalNotPaid, reservesBroughtForward: acc.reservesCarriedForward, employees: b.employees,
          // A dormant company's balance sheet doesn't move from one year to the next.
          ...(prev.dormant ? { cash: b.cash, debtors: b.debtors, creditorsWithin: b.creditorsWithin, owedToDirectors: b.owedToDirectors } : {}),
        },
        prior: {
          from: before.periodStart, to: before.periodEnd,
          figures: {
            turnover: prevPl.turnover, otherIncome: prevPl.otherIncome + prevPl.interestReceived, rawMaterials: prevPl.costOfSales,
            staffCosts: prevPl.staffCosts, depreciation: prevPl.depreciation, otherCharges: prevPl.otherCharges,
            profitBeforeTax: acc.profitBeforeTax, tax: Math.round(poa.corporationTax),
            shareCapitalNotPaid: b.shareCapitalNotPaid, fixedAssets: b.fixedAssets, currentAssets: b.stock + b.debtors + b.cash,
            prepayments: b.prepayments, creditorsWithin: b.creditorsWithin + b.owedToDirectors + Math.round(b.corporationTaxOwed ?? poa.corporationTax),
            creditorsAfter: b.creditorsAfter, provisions: b.provisions, accruals: 0, employees: b.employees,
          },
        },
        carriedFrom: `${before.periodStart} to ${before.periodEnd}`,
      } satisfies Partial<ReturnData>);
    }
    const id = randomUUID();
    await s.db.insert(s.returns).values({ id, companyId, kind: "ct600", periodStart, periodEnd, status: "draft", basis: "frs105", data: data as unknown as Record<string, unknown> });
    revalidatePath(`/companies/${companyId}`);
    return { ok: true, id, problems: [] };
  } catch (e) {
    return { ok: false, problems: [msg(e)] };
  }
}

export interface LoadedReturn {
  ok: boolean; error?: string;
  id?: string; status?: string; periodStart?: string; periodEnd?: string;
  company?: { id: string; name: string; companyNo: string | null; utr: string | null };
  data?: ReturnData;
  submissions?: { at: string; outcome: string; correlationId: string | null; test: boolean; receipt: boolean; period: string | null }[];
}

export async function getReturn(id: string): Promise<LoadedReturn> {
  const u = await currentUser();
  if (!u) return { ok: false, error: SIGNED_OUT };
  try {
    const s = await store();
    const r = await ownReturn(s, u, id);
    if (!r) return { ok: false, error: "That return isn't in Nucta File." };
    const [c] = await s.db.select().from(s.companies).where(s.eq(s.companies.id, r.companyId));
    const subs = await s.db.select({
      startedAt: s.submissions.startedAt, outcome: s.submissions.outcome, correlationId: s.submissions.correlationId,
      gatewayTest: s.submissions.gatewayTest, receipt: s.submissions.receipt,
    }).from(s.submissions).where(s.eq(s.submissions.returnId, id)).orderBy(s.desc(s.submissions.startedAt));
    const data = normaliseReturnData(r.data as Partial<ReturnData>);
    const periodOf = (cid: string | null) => {
      const rec = cid ? Object.values(data.sent ?? {}).find((x) => x.correlationId === cid) : undefined;
      return rec ? `${rec.periodFrom} to ${rec.periodTo}` : null;
    };
    return {
      ok: true, id: r.id, status: r.status, periodStart: r.periodStart, periodEnd: r.periodEnd,
      company: { id: c.id, name: c.name, companyNo: c.companyNo, utr: c.utr },
      data,
      submissions: subs.map((x) => ({ at: x.startedAt.toISOString(), outcome: x.outcome, correlationId: x.correlationId, test: x.gatewayTest, receipt: Boolean(x.receipt), period: periodOf(x.correlationId) })),
    };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
}

/**
 * Saves what was entered. Saving the same figures again changes nothing; a
 * real change makes the return a draft again, because what HMRC's test
 * service accepted is no longer what would be sent.
 */
export async function saveReturn(id: string, data: ReturnData): Promise<{ ok: boolean; error?: string; changed?: boolean }> {
  const u = await currentUser();
  if (!u) return { ok: false, error: SIGNED_OUT };
  try {
    const s = await store();
    const r = await ownReturn(s, u, id);
    if (!r) return { ok: false, error: "That return isn't in Nucta File." };
    if (r.status === "accepted") return { ok: false, error: "This return has been accepted by HMRC, so it can't be changed. Start an amended return instead." };
    const old = normaliseReturnData(r.data as Partial<ReturnData>);
    const incoming = editable(normaliseReturnData(data));
    const changed = stable(incoming) !== stable(editable(old));
    if (!changed) return { ok: true, changed: false };
    if (filedLive(old)) return { ok: false, error: "This return has been filed with HMRC, so it can't be changed. Start an amended return instead." };
    if (filingUnderWay(old)) return { ok: false, error: "This return is being filed with HMRC right now. Wait for HMRC's answer before changing it." };
    const next = { ...incoming, amends: old.amends ?? null, sent: {}, ...(old.paid ? { paid: old.paid } : {}) };
    await s.db.update(s.returns).set({ data: next as unknown as Record<string, unknown>, updatedAt: new Date(), status: "draft" }).where(s.eq(s.returns.id, id));
    return { ok: true, changed: true };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
}

export interface PartPreview {
  periodFrom: string;
  periodTo: string;
  days: number;
  lines: { label: string; amount: number; kind: string; note?: string }[];
  summary: {
    accountingProfit: number; tradingProfit: number; tradingLoss: number; chargeableProfits: number;
    corporationTax: number; marginalRelief: number; taxChargeable: number;
    carryForward: { tradingLosses: number; mainPool: number; specialPool: number };
  };
  /** Tax on director's loans (CT600A box A80 / CT600 box 480), when there are any. */
  loans: { a80: number; a75: number; amendmentDue: number; dueDate: string } | null;
  /** When this period's tax is due. */
  taxDue: string;
  computationHtml: string | null;
  /** What happened when this return was last sent, if it has been. */
  sent: SentRecord | null;
  /** For an amendment: whether this period's return differs from the one HMRC have. */
  changed: boolean | null;
  /** The last check of this return by HMRC's live service (Test in Live), if any. */
  til: { outcome: string; at: string; correlationId: string | null } | null;
}

export interface ReturnPreview {
  ok: boolean;
  problems: string[];
  warnings: string[];
  /** Two returns, for accounts longer than 12 months. */
  long: boolean;
  amended: boolean;
  parts: PartPreview[];
  accountsHtml: string | null;
  /** When the return(s) must reach HMRC, and the last day to amend. */
  filingDue: string;
  amendBy: string;
  /** Whether live filing is open for the person looking (see live-settings.ts). */
  liveFiling: LiveFiling;
  /** Who signs the return, for the declaration on the filing screen. */
  declarant: { name: string; status: string };
  director: string;
  /** The accounts as Companies House's online form asks for them. */
  companiesHouse: CompaniesHouseForm | null;
}

async function prepared(id: string) {
  const r = await getReturn(id);
  if (!r.ok || !r.data || !r.company) return { r, p: null };
  return { r, p: prepareReturn(toCompanyReturnInput(r.company, r.periodStart!, r.periodEnd!, r.data)) };
}

/** The CT600 without its new/amended marker, to compare a return with the one it amends. */
const body = (ct600: string | null) => (ct600 ?? "").replace(/^<CompanyTaxReturn ReturnType="[a-z]+">/, "");

/** The return an amendment replaces, prepared again from its saved figures. */
async function original(r: Awaited<ReturnType<typeof getReturn>>): Promise<PreparedReturn | null> {
  const link = r.data?.amends;
  if (!link || !r.company) return null;
  const o = await getReturn(link.returnId);
  if (!o.ok || !o.data) return null;
  return prepareReturn(toCompanyReturnInput(r.company, o.periodStart!, o.periodEnd!, o.data));
}

export async function previewReturn(id: string): Promise<ReturnPreview> {
  const { r, p } = await prepared(id);
  const liveFiling = (await liveModeFor(await currentUser())).mode;
  if (!p) return { ok: false, problems: [r.error ?? "The return couldn't be opened."], warnings: [], long: false, amended: false, parts: [], accountsHtml: null, filingDue: "", amendBy: "", liveFiling, declarant: { name: "", status: "" }, director: "", companiesHouse: null };
  const was = p.ok ? await original(r) : null;
  return {
    ok: p.ok, problems: p.problems, warnings: p.warnings, long: p.long, amended: p.returnType === "amended",
    parts: p.parts.map((x, n) => {
      const c = x.computation;
      return {
        periodFrom: x.periodFrom, periodTo: x.periodTo, days: x.days,
        lines: c.lines,
        summary: {
          accountingProfit: c.accountingProfit, tradingProfit: c.tradingProfit, tradingLoss: c.tradingLoss, chargeableProfits: c.chargeableProfits,
          corporationTax: c.corporationTax, marginalRelief: c.marginalRelief, taxChargeable: c.taxChargeable, carryForward: c.carryForward,
        },
        loans: x.loans?.needed ? { a80: x.loans.a80, a75: x.loans.a75, amendmentDue: x.loans.amendmentDue, dueDate: x.loans.dueDate } : null,
        taxDue: x.taxDue,
        computationHtml: x.computationHtml,
        sent: r.data?.sent?.[String(n)] ?? null,
        changed: was?.ok && was.parts[n] ? body(was.parts[n].ct600) !== body(x.ct600) : was ? true : null,
        til: r.data?.til?.[String(n)] ?? null,
      };
    }),
    accountsHtml: p.accountsHtml, filingDue: p.filingDue, amendBy: p.amendBy,
    liveFiling, declarant: { name: r.data!.declarantName, status: r.data!.declarantStatus }, director: r.data!.director,
    companiesHouse: p.companiesHouse,
  };
}

export interface SendResult {
  ok: boolean;
  outcome: "accepted" | "rejected" | "timeout" | "error" | "blocked";
  headline: string;
  detail: string[];
  correlationId: string | null;
  irmark: string | null;
  receipt: boolean;
}

/**
 * Sends one return to HMRC's test service: the only one, or — for accounts
 * longer than 12 months — the first or second (`part` 0 or 1).
 *
 * Live filing is separate (fileReturnLive): it needs the company's (or
 * agent's) own Government Gateway sign-in, entered at the moment of filing,
 * and only a return this test service has accepted can be filed.
 */
export async function sendReturnToTest(id: string, part = 0): Promise<SendResult> {
  const blocked = (headline: string, detail: string[]): SendResult => ({ ok: false, outcome: "blocked", headline, detail, correlationId: null, irmark: null, receipt: false });
  const { r, p } = await prepared(id);
  if (!p) return blocked("The return couldn't be opened.", [r.error ?? ""]);
  if (!p.ok) return blocked("The return isn't ready to send.", p.problems);
  const pp = p.parts[part];
  if (!pp?.ct600) return blocked("There's no such return for this period.", []);
  if (filedLive(r.data!)) return blocked("This return has already been filed with HMRC.", ["To change it, start an amended return."]);
  const { config, missing } = gatewayConfig("test");
  if (!config) return blocked("The HMRC test credentials aren't set up yet.", missing);

  // HMRC's test credentials only work with the test UTR HMRC issued with them: a
  // company's real UTR is refused as an authentication failure (error 1046). So
  // the test copy is built with the test UTR; the figures are exactly the same.
  // Live filing uses the company's own UTR and sign-in.
  const testUtr = testUtrFor();
  const tp = testUtr !== r.company!.utr ? prepareReturn(toCompanyReturnInput({ ...r.company!, utr: testUtr }, r.periodStart!, r.periodEnd!, r.data!)) : p;
  const tpp = tp.parts[part];
  if (!tp.ok || !tpp?.ct600) return blocked("The test copy of the return couldn't be built.", tp.problems);

  const cls = messageClass("test");
  const envelope = buildEnvelope({
    messageClass: cls, senderId: config.senderId, vendorId: config.vendorId, body: tpp.ct600,
    utr: testUtr, periodEnd: pp.periodTo, test: true,
    productName: config.productName, productVersion: config.productVersion, email: config.email, markMethod: "spec",
    sender: r.data!.declarantStatus === "Agent" ? "Agent" : "Company",
  });
  const irmark = (envelope.match(/<IRmark[^>]*>([\s\S]*?)<\/IRmark>/) ?? [])[1] ?? null;
  if (!markWasCanonical()) return blocked("The return's digital mark couldn't be calculated properly, so it wasn't sent.", ["Report this — it is a software fault."]);

  let run: RunResult;
  try {
    run = await submitAndWait({ ...config, messageClass: cls }, envelope, { maxWaitSeconds: 40 });
  } catch (e) {
    return { ok: false, outcome: "error", headline: "Couldn't complete the exchange with HMRC.", detail: [String((e as Error)?.message ?? e).slice(0, 300)], correlationId: null, irmark, receipt: false };
  }

  const partStatus = run.outcome === "accepted" ? "accepted-test" : run.outcome === "rejected" ? "rejected-test" : run.outcome === "timeout" ? "submitted-test" : null;
  try {
    const s = await store();
    const sid = randomUUID();
    await s.db.insert(s.submissions).values({
      id: sid, returnId: id, gatewayTest: true, messageClass: cls, outcome: run.outcome, correlationId: run.correlationId,
      irmark, receipt: run.receipt, envelope: redact(envelope), errors: run.errors, finishedAt: new Date(),
    });
    if (run.steps.length) {
      await s.db.insert(s.submissionSteps).values(run.steps.map((x) => ({ id: randomUUID(), submissionId: sid, stage: x.stage, qualifier: x.qualifier, httpStatus: x.httpStatus, raw: x.raw })));
    }
    if (partStatus) {
      // Re-read the row so a save made meanwhile isn't overwritten.
      const [row] = await s.db.select({ data: s.returns.data }).from(s.returns).where(s.eq(s.returns.id, id));
      const data = normaliseReturnData(row?.data as Partial<ReturnData>);
      const sent = { ...(data.sent ?? {}), [String(part)]: {
        outcome: run.outcome, status: partStatus, correlationId: run.correlationId, irmark, at: new Date().toISOString(),
        periodFrom: pp.periodFrom, periodTo: pp.periodTo,
      } satisfies SentRecord };
      await s.db.update(s.returns).set({
        status: overallStatus(sent, p.parts.length), irmark, accountsHtml: p.accountsHtml, computationHtml: pp.computationHtml,
        data: { ...data, sent } as unknown as Record<string, unknown>, updatedAt: new Date(),
      }).where(s.eq(s.returns.id, id));
    }
  } catch {
    // The record is best effort for a test; the answer still goes back to the screen.
  }

  const other = p.parts.length > 1 ? p.parts[part === 0 ? 1 : 0] : null;
  const otherDone = other ? r.data?.sent?.[String(part === 0 ? 1 : 0)]?.status === "accepted-test" : true;
  return {
    ok: run.outcome === "accepted",
    outcome: run.outcome,
    headline: run.outcome === "accepted" ? "Accepted by HMRC's test service."
      : run.outcome === "rejected" ? "HMRC's test service rejected the return."
        : run.outcome === "timeout" ? "Still processing at HMRC." : "The submission failed before HMRC could answer.",
    detail: run.errors.length ? run.errors.map(explain)
      : run.outcome === "accepted" ? [
        "This was a test: nothing has been filed for the company. When live filing is open for your account, this same return is filed from this screen.",
        ...(testUtr !== r.company!.utr ? [`HMRC's test service only accepts the test UTR HMRC issued (${testUtr}), so the test copy carried that; the real filing carries the company's own UTR, ${r.company!.utr}.`] : []),
        ...(other && !otherDone ? [`Now send the other return, for ${other.periodFrom} to ${other.periodTo}.`] : []),
      ]
        : run.outcome === "timeout" ? ["HMRC are still working on it. The Submission log can ask again with the correlation ID."] : [],
    correlationId: run.correlationId,
    irmark,
    receipt: Boolean(run.receipt),
  };
}

/** The UTR HMRC issued with Nucta File's test credentials (HMRC_TEST_UTR). */
function testUtrFor(): string {
  const v = (process.env.HMRC_TEST_UTR ?? "").replace(/\s/g, "");
  return /^\d{10}$/.test(v) ? v : "8596148860";
}

/**
 * Starts an amended return: a copy of an accepted return's figures, to
 * change and send again marked "amended". HMRC replace the original with
 * it. Amendments are allowed until 12 months after the filing deadline.
 */
export async function startAmendment(returnId: string, today = new Date().toISOString().slice(0, 10)): Promise<{ ok: boolean; id?: string; problems: string[] }> {
  const u = await currentUser();
  if (!u) return { ok: false, problems: [SIGNED_OUT] };
  try {
    const s = await store();
    const r = await ownReturn(s, u, returnId);
    if (!r) return { ok: false, problems: ["That return isn't in Nucta File."] };
    if (!accepted(r.status)) {
      return { ok: false, problems: ["Only a return HMRC have accepted can be amended. This one hasn't been accepted yet — change it and send it again instead."] };
    }
    const amendBy = amendmentDeadline(r.periodEnd);
    if (today > amendBy) {
      return { ok: false, problems: [`The last day to amend this return was ${amendBy} — 12 months after it was due. A change now has to go to HMRC by letter, or as a claim for overpayment relief.`] };
    }
    // An amendment already being prepared is opened rather than started twice.
    const siblings = await s.db.select().from(s.returns).where(s.and(s.eq(s.returns.companyId, r.companyId), s.eq(s.returns.periodStart, r.periodStart), s.eq(s.returns.periodEnd, r.periodEnd)));
    const open = siblings.find((x) => (x.data as Partial<ReturnData> | null)?.amends?.returnId === r.id && !accepted(x.status));
    if (open) return { ok: true, id: open.id, problems: [] };

    const data = normaliseReturnData(r.data as Partial<ReturnData>);
    let correlationIds = Object.values(data.sent ?? {}).filter((x) => accepted(x.status)).map((x) => x.correlationId).filter((x): x is string => Boolean(x));
    let acceptedAt = Object.values(data.sent ?? {}).map((x) => x.at).sort().pop() ?? null;
    if (!correlationIds.length) {
      // Returns accepted before each send was recorded on the return itself.
      const subs = await s.db.select({ correlationId: s.submissions.correlationId, startedAt: s.submissions.startedAt })
        .from(s.submissions).where(s.and(s.eq(s.submissions.returnId, r.id), s.eq(s.submissions.outcome, "accepted"))).orderBy(s.desc(s.submissions.startedAt));
      correlationIds = subs.map((x) => x.correlationId).filter((x): x is string => Boolean(x)).slice(0, accountingPeriodsOf(r.periodStart, r.periodEnd).length);
      acceptedAt = subs[0]?.startedAt.toISOString() ?? null;
    }
    const copy: ReturnData = { ...data, sent: {}, til: {}, filing: {}, paid: {}, amends: { returnId: r.id, correlationIds, acceptedAt, test: r.status === "accepted-test" } };
    const id = randomUUID();
    await s.db.insert(s.returns).values({ id, companyId: r.companyId, kind: r.kind, periodStart: r.periodStart, periodEnd: r.periodEnd, status: "draft", basis: r.basis, data: copy as unknown as Record<string, unknown> });
    revalidatePath(`/companies/${r.companyId}`);
    return { ok: true, id, problems: [] };
  } catch (e) {
    return { ok: false, problems: [msg(e)] };
  }
}

export interface LiveSignIn {
  /** The Government Gateway user ID: the company's own, or the agent's when filing as its agent. */
  userId: string;
  password: string;
  /** Whose HMRC account it is. Without it, the declarant's status decides. */
  as?: "company" | "agent";
  /** Where HMRC should send their notification of this submission. Empty: the email registered on the HMRC account. */
  notifyEmail?: string;
}

export interface LiveResult extends SendResult {
  /** True only when HMRC accepted a real filing. */
  filed: boolean;
  /** HMRC's receipt in words, for a real filing. */
  receiptText: string | null;
  /** Set when HMRC accepted but Nucta File couldn't save the receipt: keep the one on screen. */
  receiptNotSaved: boolean;
}

/**
 * Files one return with HMRC for real — or, with `testInLive`, has HMRC's
 * live service check it with the same sign-in while filing nothing.
 *
 * The rules, each checked before anything is sent:
 *   - live filing is open for this person (the Live filing page), and for a
 *     real filing set to "on";
 *   - fewer than two sign-ins have failed on this return in the last hour,
 *     so a few more wrong passwords can't lock the company's HMRC account;
 *   - when the administrators require it, HMRC's Test in Live check has
 *     passed with these exact figures;
 *   - when the administrators require it, this exact version of the return
 *     has passed HMRC's test service (otherwise HMRC's live checks are the
 *     test: a rejected return is simply not filed);
 *   - the director's approval and the declaration have been confirmed;
 *   - the filing can be recorded: a row is written before sending, so a
 *     filing never happens without a record of it;
 *   - the sign-in is used for this one exchange and never stored — the
 *     envelope is saved with the password removed and the user ID hidden.
 */
export async function fileReturnLive(
  id: string, part: number, signIn: LiveSignIn,
  opts: { testInLive: boolean; approved: boolean; declared: boolean },
): Promise<LiveResult> {
  const stop = (headline: string, detail: string[]): LiveResult =>
    ({ ok: false, outcome: "blocked", headline, detail, correlationId: null, irmark: null, receipt: false, filed: false, receiptText: null, receiptNotSaved: false });
  const til = opts.testInLive;
  const u = await currentUser();
  if (!u) return stop(SIGNED_OUT, []);
  const live = await liveModeFor(u);
  const mode = live.mode;
  if (mode === "off") return stop("Live filing isn't open for this account yet.", [live.why]);
  if (emailCheckNeeded(u)) return stop("Confirm your email address first.", [`Open the link we sent to ${u.email}, or press “Send the link again” at the top of the page. HMRC's receipt is emailed there.`]);
  if (!til && mode !== "on") return stop("Only HMRC's Test in Live check is open.", ["Real filing hasn't been switched on yet. Test in Live checks the return with HMRC's live service and files nothing."]);
  const userId = signIn.userId.trim(), password = signIn.password;
  const notifyEmail = (signIn.notifyEmail ?? "").trim();
  if (notifyEmail && (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(notifyEmail) || notifyEmail.length > 129)) return stop("That email address for HMRC's confirmation doesn't look right.", ["Leave it to the HMRC account's own email, or type a full address."]);
  if (!userId || !password) return stop("Enter the Government Gateway user ID and password.", []);
  if (/\s/.test(userId) || userId.length > 64) return stop("That user ID doesn't look right.", ["It's the Government Gateway user ID used to sign in to HMRC online services, with no spaces."]);

  const { r, p } = await prepared(id);
  if (!p) return stop("The return couldn't be opened.", [r.error ?? ""]);
  if (!p.ok) return stop("The return isn't ready to file.", p.problems);
  const s0 = await store();
  const lockedUntil = await signInLock(s0, id);
  if (lockedUntil) return stop("Two sign-ins have failed on this return in the last hour, so Nucta File won't try again yet.", [`A few more wrong passwords can lock the HMRC account. Check the user ID and password by signing in on GOV.UK, then try again after ${new Date(lockedUntil).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" })}.`]);
  const online = await onlineApproval(s0, id, r.periodStart!, r.periodEnd!, r.data!);
  const approvedOnline = online?.status === "approved";
  if (!(opts.approved || approvedOnline) || !opts.declared) return stop("Confirm the director's approval and the declaration first.", []);
  const approvalWords = approvedOnline ? `approved online by ${online!.name}${online!.at ? ` on ${online!.at.slice(0, 10)}` : ""}` : "confirmed by the person filing";
  const pp = p.parts[part];
  if (!pp?.ct600) return stop("There's no such return for this period.", []);
  const data = r.data!;
  const rec = data.sent?.[String(part)];
  if (rec?.status === "accepted") return stop("This return has already been filed with HMRC.", [rec.receiptText ?? "", "To change it, start an amended return."].filter(Boolean));
  if (rec?.status === "submitted-live") return stop("This return has been sent to HMRC and is waiting for their answer.", ["Use “Ask HMRC again” rather than filing it twice."]);
  if (!til) {
    const fee = await feeState(s0, u, id);
    if (fee.status === "due") return stop(`Pay the £${fee.amount} filing fee first.`, ["Use “Pay by card” on the filing screen. The fee covers filing this return, sending it again if HMRC find something to fix, and amending it later."]);
  }
  if (live.settings.requireTest && rec?.status !== "accepted-test") {
    return stop("Send this return to HMRC's test service first.", ["Your administrator requires these exact figures to pass HMRC's test service before filing."]);
  }
  if (filingUnderWay(data, part)) return stop("This return is being filed right now.", ["Wait a minute for HMRC's answer."]);
  if (!til && live.settings.requireTil && data.til?.[String(part)]?.outcome !== "accepted") {
    return stop("Run HMRC's Test in Live check first.", ["It uses the same sign-in, checks the return with HMRC's live service and files nothing — so a wrong password or an account without Corporation Tax shows up before the real filing."]);
  }

  const config = liveConfig(userId, password, til, notifyEmail || undefined);
  const cls = config.messageClass!;
  const envelope = buildEnvelope({
    messageClass: cls, senderId: userId, vendorId: config.vendorId, body: pp.ct600,
    utr: r.company!.utr ?? "", periodEnd: pp.periodTo, test: false,
    productName: config.productName, productVersion: config.productVersion, email: config.email, markMethod: "spec",
    sender: signIn.as === "agent" ? "Agent" : signIn.as === "company" ? "Company" : data.declarantStatus === "Agent" ? "Agent" : "Company",
  });
  const irmark = (envelope.match(/<IRmark[^>]*>([\s\S]*?)<\/IRmark>/) ?? [])[1] ?? null;
  if (!markWasCanonical()) return stop("The return's digital mark couldn't be calculated properly, so it wasn't sent.", ["Report this — it is a software fault."]);

  // Record first. If the record can't be written, nothing is sent.
  const s = await store().catch(() => null);
  const sid = randomUUID();
  try {
    if (!s) throw new Error("no database");
    await s.db.insert(s.submissions).values({
      id: sid, returnId: id, gatewayTest: false, messageClass: cls, outcome: "running", irmark,
      envelope: redactLive(envelope), errors: [], startedBy: maskId(userId),
    });
    if (!til) {
      await s.db.update(s.returns).set({ data: { ...data, filing: { ...(data.filing ?? {}), [String(part)]: new Date().toISOString() } } as unknown as Record<string, unknown> }).where(s.eq(s.returns.id, id));
    }
  } catch {
    return stop("Nucta File couldn't record the filing, so it hasn't sent it.", ["Nothing went to HMRC. Try again in a moment."]);
  }

  let run: RunResult;
  try {
    run = await submitAndWait(config, envelope, { maxWaitSeconds: 45 });
  } catch (e) {
    run = { outcome: "error", correlationId: null, receipt: null, errors: [{ type: "fatal", number: null, text: String((e as Error)?.message ?? e).slice(0, 300), location: null }], steps: [] };
  }
  const filedAs = signIn.as ?? (data.declarantStatus === "Agent" ? "agent" : "company");
  return finishLive(id, part, sid, run, {
    til, userId, irmark, pp, parts: p.parts.length, accountsHtml: p.accountsHtml, filedAs, approval: approvalWords, notified: notifyEmail,
    mail: live.settings.emailReceipt ? { to: u.email, sender: u.accountName || u.name, company: r.company!.name, utr: r.company!.utr } : null,
  });
}

/** Asks HMRC again about a live filing that was still processing. Needs the same sign-in. */
export async function checkLiveFiling(id: string, part: number, signIn: LiveSignIn): Promise<LiveResult> {
  const stop = (headline: string, detail: string[]): LiveResult =>
    ({ ok: false, outcome: "blocked", headline, detail, correlationId: null, irmark: null, receipt: false, filed: false, receiptText: null, receiptNotSaved: false });
  const { r, p } = await prepared(id);
  if (!p || !r.data) return stop("The return couldn't be opened.", [r.error ?? ""]);
  const rec = r.data.sent?.[String(part)];
  if (rec?.status !== "submitted-live" || !rec.correlationId) return stop("There's no filing of this return waiting for HMRC's answer.", []);
  if (!signIn.userId.trim() || !signIn.password) return stop("Enter the same Government Gateway user ID and password used to file it.", []);
  const config = liveConfig(signIn.userId.trim(), signIn.password, false);
  const run = await askAgain(config, rec.correlationId, { maxWaitSeconds: 40 });
  const s = await store();
  const sid = randomUUID();
  await s.db.insert(s.submissions).values({ id: sid, returnId: id, gatewayTest: false, messageClass: config.messageClass!, outcome: "running", correlationId: rec.correlationId, irmark: rec.irmark, errors: [], startedBy: maskId(signIn.userId.trim()) });
  const u = await currentUser();
  const live = await liveModeFor(u);
  return finishLive(id, part, sid, run, {
    til: false, userId: signIn.userId.trim(), irmark: rec.irmark, pp: p.parts[part], parts: p.parts.length, accountsHtml: p.accountsHtml,
    filedAs: rec.filedAs, approval: rec.approval, notified: rec.notified,
    mail: u && live.settings.emailReceipt ? { to: u.email, sender: u.accountName || u.name, company: r.company!.name, utr: r.company!.utr } : null,
  });
}

async function finishLive(
  id: string, part: number, sid: string, run: RunResult,
  x: {
    til: boolean; userId: string; irmark: string | null; parts: number; accountsHtml: string | null;
    pp: { periodFrom: string; periodTo: string; computationHtml: string | null; taxDue: string; computation: { taxChargeable: number }; loans: { needed: boolean; a80: number } | null };
    filedAs?: "company" | "agent"; approval?: string; notified?: string;
    mail: { to: string; sender: string; company: string; utr: string | null } | null;
  },
): Promise<LiveResult> {
  const words = receiptText(run.receipt);
  const filed = !x.til && run.outcome === "accepted";
  let saved = true;
  try {
    const s = await store();
    await s.db.update(s.submissions).set({
      outcome: run.outcome, correlationId: run.correlationId, receipt: run.receipt, errors: run.errors, finishedAt: new Date(),
    }).where(s.eq(s.submissions.id, sid));
    if (run.steps.length) {
      await s.db.insert(s.submissionSteps).values(run.steps.map((st) => ({ id: randomUUID(), submissionId: sid, stage: st.stage, qualifier: st.qualifier, httpStatus: st.httpStatus, raw: redactLive(st.raw) })));
    }
    const [row] = await s.db.select({ data: s.returns.data }).from(s.returns).where(s.eq(s.returns.id, id));
    const data = normaliseReturnData(row?.data as Partial<ReturnData>);
    const filing = { ...(data.filing ?? {}) }; delete filing[String(part)];
    const at = new Date().toISOString();
    if (x.til) {
      const til = { ...(data.til ?? {}), [String(part)]: { outcome: run.outcome, at, correlationId: run.correlationId } };
      await s.db.update(s.returns).set({ data: { ...data, filing, til } as unknown as Record<string, unknown> }).where(s.eq(s.returns.id, id));
    } else {
      const sent = { ...(data.sent ?? {}) };
      if (run.outcome === "accepted" || run.outcome === "timeout") {
        sent[String(part)] = {
          outcome: run.outcome, status: run.outcome === "accepted" ? "accepted" : "submitted-live", correlationId: run.correlationId, irmark: x.irmark, at,
          periodFrom: x.pp.periodFrom, periodTo: x.pp.periodTo, receiptText: words, filedBy: maskId(x.userId),
          ...(x.filedAs ? { filedAs: x.filedAs } : {}), ...(x.approval ? { approval: x.approval } : {}), ...(x.notified !== undefined ? { notified: x.notified } : {}),
        } satisfies SentRecord;
      }
      await s.db.update(s.returns).set({
        data: { ...data, filing, sent } as unknown as Record<string, unknown>, status: overallStatus(sent, x.parts), updatedAt: new Date(),
        ...(filed ? { irmark: x.irmark, accountsHtml: x.accountsHtml, computationHtml: x.pp.computationHtml } : {}),
      }).where(s.eq(s.returns.id, id));
    }
  } catch {
    saved = false;
  }
  const detail = run.errors.length ? run.errors.map(explain)
    : x.til && run.outcome === "accepted" ? ["HMRC's live service checked the return with this sign-in and found nothing wrong. Nothing has been filed."]
      : filed ? [words ?? "HMRC have received the return.", "Keep this receipt: it is HMRC's confirmation that the return was filed."]
        : run.outcome === "timeout" ? ["HMRC have the return and are still processing it. Press “Ask HMRC again” in a minute, with the same sign-in. Don't file it a second time."] : [];
  if (filed && !saved) detail.push("Nucta File couldn't save this receipt. Save or print this page now, and tell your administrator.");
  if (filed && x.mail) {
    const payable = Math.round((x.pp.computation.taxChargeable + (x.pp.loans?.needed ? x.pp.loans.a80 : 0)) * 100) / 100;
    const m = receiptEmailText({
      company: x.mail.company, utr: x.mail.utr, periodFrom: x.pp.periodFrom, periodTo: x.pp.periodTo, filedAt: new Date().toISOString(),
      correlationId: run.correlationId, irmark: x.irmark, receiptText: words, payable, taxDue: x.pp.taxDue, sender: x.mail.sender,
    });
    if (await sendEmail(x.mail.to, m.subject, m.text).catch(() => false)) detail.push(`A copy of the receipt has been emailed to ${x.mail.to}.`);
  }
  return {
    ok: run.outcome === "accepted",
    outcome: run.outcome,
    headline: x.til
      ? (run.outcome === "accepted" ? "Passed HMRC's live check (Test in Live). Nothing was filed." : run.outcome === "rejected" ? "HMRC's live check found a problem. Nothing was filed." : run.outcome === "timeout" ? "HMRC's live check is still running." : "The live check failed before HMRC could answer.")
      : (filed ? "Filed with HMRC." : run.outcome === "rejected" ? "HMRC rejected the return. It has not been filed." : run.outcome === "timeout" ? "Sent to HMRC — waiting for their answer." : "The filing failed before HMRC could answer. It has not been filed."),
    detail, correlationId: run.correlationId, irmark: x.irmark, receipt: Boolean(run.receipt),
    filed, receiptText: filed ? words : null, receiptNotSaved: filed && !saved,
  };
}
