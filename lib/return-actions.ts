"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { buildEnvelope, markWasCanonical } from "./ct600-xml";
import { submitAndWait, explain, type RunResult } from "./govtalk";
import { gatewayConfig, messageClass, redact } from "./hmrc";
import { prepareReturn, type PreparedReturn } from "./filing";
import { companyNumberProblem } from "./companies-house";
import { checkMicroAccounts } from "./accounts/micro";
import {
  normaliseReturnData, toCompanyReturnInput, toPeriodOfAccountInput, blankReturnData, SERVER_KEYS,
  type ReturnData, type SentRecord,
} from "./return-model";
import { exceedsEighteenMonths, fromDay, toDay } from "./tax/dates";
import { accountingPeriodsOf, amendmentDeadline, computePeriodOfAccount } from "./tax/long-period";

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
  return { db, ...schema, ...orm };
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
  try {
    const s = await store();
    const cos = await s.db.select().from(s.companies).where(s.eq(s.companies.archived, false)).orderBy(s.asc(s.companies.name));
    const rets = await s.db.select({ companyId: s.returns.companyId, periodEnd: s.returns.periodEnd, status: s.returns.status }).from(s.returns);
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

export interface NewCompany { name: string; companyNo: string; utr: string; incorporatedOn: string }

export async function addCompany(c: NewCompany): Promise<{ ok: boolean; id?: string; problems: string[] }> {
  const problems: string[] = [];
  const name = c.name.trim(), no = c.companyNo.trim().toUpperCase(), utr = c.utr.replace(/\s/g, "");
  if (name.length < 3) problems.push("Enter the company's name as it appears at Companies House.");
  const np = companyNumberProblem(no); if (np) problems.push(np);
  if (!/^\d{10}$/.test(utr)) problems.push("The Unique Taxpayer Reference is 10 digits. It's on HMRC's letters to the company (not the director's own UTR).");
  if (c.incorporatedOn && !/^\d{4}-\d{2}-\d{2}$/.test(c.incorporatedOn)) problems.push("The incorporation date isn't a date.");
  if (problems.length) return { ok: false, problems };
  try {
    const s = await store();
    const dup = await s.db.select({ id: s.companies.id }).from(s.companies).where(s.eq(s.companies.companyNo, no));
    if (dup.length) return { ok: false, problems: [`Company ${no} is already in Nucta File.`] };
    const id = randomUUID();
    await s.db.insert(s.companies).values({ id, name, companyNo: no, utr, incorporatedOn: c.incorporatedOn || null });
    revalidatePath("/companies");
    return { ok: true, id, problems: [] };
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
  if (recs.some((r) => r?.status === "rejected-test")) return "rejected-test";
  if (recs.every((r) => r?.status === "accepted-test" || r?.status === "accepted")) return "accepted-test";
  if (recs.some((r) => r?.status === "submitted-test")) return "submitted-test";
  if (recs.some((r) => r)) return "partly-sent-test";
  return "draft";
}

const accepted = (status: string) => status === "accepted" || status === "accepted-test";

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

export async function getCompany(id: string): Promise<{ ok: boolean; error?: string; company?: { id: string; name: string; companyNo: string | null; utr: string | null; incorporatedOn: string | null }; returns: ReturnRow[] }> {
  try {
    const s = await store();
    const [c] = await s.db.select().from(s.companies).where(s.eq(s.companies.id, id));
    if (!c) return { ok: false, error: "That company isn't in Nucta File.", returns: [] };
    const rets = await s.db.select().from(s.returns).where(s.eq(s.returns.companyId, id)).orderBy(s.desc(s.returns.periodEnd));
    return {
      ok: true,
      company: { id: c.id, name: c.name, companyNo: c.companyNo, utr: c.utr, incorporatedOn: c.incorporatedOn },
      returns: rets.map((r) => ({
        id: r.id, periodStart: r.periodStart, periodEnd: r.periodEnd, status: r.status, updatedAt: r.updatedAt.toISOString(),
        parts: accountingPeriodsOf(r.periodStart, r.periodEnd).length,
        amendment: Boolean((r.data as Partial<ReturnData> | null)?.amends),
      })),
    };
  } catch (e) {
    return { ok: false, error: msg(e), returns: [] };
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
  try {
    const s = await store();
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
      const carry = last?.result.carryForward ?? { mainPool: prev.mainPoolBroughtForward, specialPool: prev.specialPoolBroughtForward, tradingLosses: prev.tradingLossesBroughtForward };
      const acc = checkMicroAccounts({
        companyName: "", companyNo: "", periodFrom: before.periodStart, periodTo: before.periodEnd, principalActivities: prev.activity,
        pl: prev.pl, taxCharge: poa.corporationTax, balanceSheet: prev.balanceSheet, director: prev.director, approvedOn: prev.approvedOn,
      });
      const b = prev.balanceSheet;
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
        scope: prev.scope,
        associatedCompanies: prev.associatedCompanies,
        mainPoolBroughtForward: carry.mainPool,
        specialPoolBroughtForward: carry.specialPool,
        tradingLossesBroughtForward: carry.tradingLosses,
        director: prev.director,
        declarantName: prev.declarantName,
        declarantStatus: prev.declarantStatus,
        balanceSheet: { ...data.balanceSheet, shareCapital: b.shareCapital, shareCapitalNotPaid: b.shareCapitalNotPaid, reservesBroughtForward: acc.reservesCarriedForward, employees: b.employees },
        prior: {
          from: before.periodStart, to: before.periodEnd,
          figures: {
            turnover: prev.pl.turnover, otherIncome: prev.pl.otherIncome + prev.pl.interestReceived, rawMaterials: prev.pl.costOfSales,
            staffCosts: prev.pl.staffCosts, depreciation: prev.pl.depreciation, otherCharges: prev.pl.otherCharges,
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
  try {
    const s = await store();
    const [r] = await s.db.select().from(s.returns).where(s.eq(s.returns.id, id));
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
  try {
    const s = await store();
    const [r] = await s.db.select({ status: s.returns.status, data: s.returns.data }).from(s.returns).where(s.eq(s.returns.id, id));
    if (!r) return { ok: false, error: "That return isn't in Nucta File." };
    if (r.status === "accepted") return { ok: false, error: "This return has been accepted by HMRC, so it can't be changed. Start an amended return instead." };
    const old = normaliseReturnData(r.data as Partial<ReturnData>);
    const incoming = editable(normaliseReturnData(data));
    const changed = stable(incoming) !== stable(editable(old));
    if (!changed) return { ok: true, changed: false };
    const next = { ...incoming, amends: old.amends ?? null, sent: {} };
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
  if (!p) return { ok: false, problems: [r.error ?? "The return couldn't be opened."], warnings: [], long: false, amended: false, parts: [], accountsHtml: null, filingDue: "", amendBy: "" };
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
      };
    }),
    accountsHtml: p.accountsHtml, filingDue: p.filingDue, amendBy: p.amendBy,
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
 * Live filing is not offered here: it needs HMRC's recognition of Nucta
 * File, and then the company's (or agent's) own Government Gateway sign-in
 * entered at the moment of filing. Until then every send is a test, and the
 * screen says so.
 */
export async function sendReturnToTest(id: string, part = 0): Promise<SendResult> {
  const blocked = (headline: string, detail: string[]): SendResult => ({ ok: false, outcome: "blocked", headline, detail, correlationId: null, irmark: null, receipt: false });
  const { r, p } = await prepared(id);
  if (!p) return blocked("The return couldn't be opened.", [r.error ?? ""]);
  if (!p.ok) return blocked("The return isn't ready to send.", p.problems);
  const pp = p.parts[part];
  if (!pp?.ct600) return blocked("There's no such return for this period.", []);
  const { config, missing } = gatewayConfig("test");
  if (!config) return blocked("The HMRC test credentials aren't set up yet.", missing);

  const cls = messageClass("test");
  const envelope = buildEnvelope({
    messageClass: cls, senderId: config.senderId, vendorId: config.vendorId, body: pp.ct600,
    utr: r.company!.utr ?? "", periodEnd: pp.periodTo, test: true,
    productName: config.productName, productVersion: config.productVersion, email: config.email, markMethod: "spec",
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
        "This was a test: nothing has been filed for the company. The same return will be sent live once HMRC recognise Nucta File.",
        ...(other && !otherDone ? [`Now send the other return, for ${other.periodFrom} to ${other.periodTo}.`] : []),
      ]
        : run.outcome === "timeout" ? ["HMRC are still working on it. The Submission log can ask again with the correlation ID."] : [],
    correlationId: run.correlationId,
    irmark,
    receipt: Boolean(run.receipt),
  };
}

/**
 * Starts an amended return: a copy of an accepted return's figures, to
 * change and send again marked "amended". HMRC replace the original with
 * it. Amendments are allowed until 12 months after the filing deadline.
 */
export async function startAmendment(returnId: string, today = new Date().toISOString().slice(0, 10)): Promise<{ ok: boolean; id?: string; problems: string[] }> {
  try {
    const s = await store();
    const [r] = await s.db.select().from(s.returns).where(s.eq(s.returns.id, returnId));
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
    const copy: ReturnData = { ...data, sent: {}, amends: { returnId: r.id, correlationIds, acceptedAt, test: r.status === "accepted-test" } };
    const id = randomUUID();
    await s.db.insert(s.returns).values({ id, companyId: r.companyId, kind: r.kind, periodStart: r.periodStart, periodEnd: r.periodEnd, status: "draft", basis: r.basis, data: copy as unknown as Record<string, unknown> });
    revalidatePath(`/companies/${r.companyId}`);
    return { ok: true, id, problems: [] };
  } catch (e) {
    return { ok: false, problems: [msg(e)] };
  }
}
