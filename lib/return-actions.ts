"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { buildEnvelope, markWasCanonical } from "./ct600-xml";
import { submitAndWait, explain, type RunResult } from "./govtalk";
import { gatewayConfig, messageClass, redact } from "./hmrc";
import { prepareReturn } from "./filing";
import { compute } from "./tax/computation";
import { companyNumberProblem } from "./companies-house";
import { checkMicroAccounts } from "./accounts/micro";
import { normaliseReturnData, toCompanyReturnInput, toFigures, blankReturnData, type ReturnData } from "./return-model";
import { fromDay, toDay } from "./tax/dates";

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

export interface ReturnRow { id: string; periodStart: string; periodEnd: string; status: string; updatedAt: string }

export async function getCompany(id: string): Promise<{ ok: boolean; error?: string; company?: { id: string; name: string; companyNo: string | null; utr: string | null; incorporatedOn: string | null }; returns: ReturnRow[] }> {
  try {
    const s = await store();
    const [c] = await s.db.select().from(s.companies).where(s.eq(s.companies.id, id));
    if (!c) return { ok: false, error: "That company isn't in Nucta File.", returns: [] };
    const rets = await s.db.select().from(s.returns).where(s.eq(s.returns.companyId, id)).orderBy(s.desc(s.returns.periodEnd));
    return {
      ok: true,
      company: { id: c.id, name: c.name, companyNo: c.companyNo, utr: c.utr, incorporatedOn: c.incorporatedOn },
      returns: rets.map((r) => ({ id: r.id, periodStart: r.periodStart, periodEnd: r.periodEnd, status: r.status, updatedAt: r.updatedAt.toISOString() })),
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
  try {
    const s = await store();
    const existing = await s.db.select().from(s.returns).where(s.eq(s.returns.companyId, companyId));
    if (existing.some((r) => r.periodStart === periodStart && r.periodEnd === periodEnd)) {
      return { ok: false, problems: ["There's already a return for exactly this period. Open that one instead."] };
    }
    const data = blankReturnData();
    const before = existing.find((r) => r.periodEnd === fromDay(toDay(periodStart) - 1));
    if (before) {
      const prev = normaliseReturnData(before.data as Partial<ReturnData>);
      const r = compute(toFigures(before.periodStart, before.periodEnd, prev));
      const acc = checkMicroAccounts({
        companyName: "", companyNo: "", periodFrom: before.periodStart, periodTo: before.periodEnd, principalActivities: prev.activity,
        pl: prev.pl, taxCharge: r.taxChargeable, balanceSheet: prev.balanceSheet, director: prev.director, approvedOn: prev.approvedOn,
      });
      const b = prev.balanceSheet;
      Object.assign(data, {
        activity: prev.activity,
        scope: prev.scope,
        associatedCompanies: prev.associatedCompanies,
        mainPoolBroughtForward: r.carryForward.mainPool,
        specialPoolBroughtForward: r.carryForward.specialPool,
        tradingLossesBroughtForward: r.carryForward.tradingLosses,
        director: prev.director,
        declarantName: prev.declarantName,
        declarantStatus: prev.declarantStatus,
        balanceSheet: { ...data.balanceSheet, shareCapital: b.shareCapital, shareCapitalNotPaid: b.shareCapitalNotPaid, reservesBroughtForward: acc.reservesCarriedForward, employees: b.employees },
        prior: {
          from: before.periodStart, to: before.periodEnd,
          figures: {
            turnover: prev.pl.turnover, otherIncome: prev.pl.otherIncome + prev.pl.interestReceived, rawMaterials: prev.pl.costOfSales,
            staffCosts: prev.pl.staffCosts, depreciation: prev.pl.depreciation, otherCharges: prev.pl.otherCharges,
            profitBeforeTax: acc.profitBeforeTax, tax: Math.round(r.taxChargeable),
            shareCapitalNotPaid: b.shareCapitalNotPaid, fixedAssets: b.fixedAssets, currentAssets: b.stock + b.debtors + b.cash,
            prepayments: b.prepayments, creditorsWithin: b.creditorsWithin + b.owedToDirectors + Math.round(b.corporationTaxOwed ?? r.taxChargeable),
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
  submissions?: { at: string; outcome: string; correlationId: string | null; test: boolean; receipt: boolean }[];
}

export async function getReturn(id: string): Promise<LoadedReturn> {
  try {
    const s = await store();
    const [r] = await s.db.select().from(s.returns).where(s.eq(s.returns.id, id));
    if (!r) return { ok: false, error: "That return isn't in Nucta File." };
    const [c] = await s.db.select().from(s.companies).where(s.eq(s.companies.id, r.companyId));
    const subs = await s.db.select().from(s.submissions).where(s.eq(s.submissions.returnId, id)).orderBy(s.desc(s.submissions.startedAt));
    return {
      ok: true, id: r.id, status: r.status, periodStart: r.periodStart, periodEnd: r.periodEnd,
      company: { id: c.id, name: c.name, companyNo: c.companyNo, utr: c.utr },
      data: normaliseReturnData(r.data as Partial<ReturnData>),
      submissions: subs.map((x) => ({ at: x.startedAt.toISOString(), outcome: x.outcome, correlationId: x.correlationId, test: x.gatewayTest, receipt: Boolean(x.receipt) })),
    };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
}

export async function saveReturn(id: string, data: ReturnData): Promise<{ ok: boolean; error?: string }> {
  try {
    const s = await store();
    const [r] = await s.db.select({ status: s.returns.status }).from(s.returns).where(s.eq(s.returns.id, id));
    if (!r) return { ok: false, error: "That return isn't in Nucta File." };
    if (r.status === "accepted") return { ok: false, error: "This return has been accepted by HMRC, so it can't be changed. Start an amended return instead." };
    await s.db.update(s.returns).set({ data: data as unknown as Record<string, unknown>, updatedAt: new Date(), status: "draft" }).where(s.eq(s.returns.id, id));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
}

export interface ReturnPreview {
  ok: boolean;
  problems: string[];
  warnings: string[];
  lines: { label: string; amount: number; kind: string; note?: string }[];
  summary: {
    accountingProfit: number; tradingProfit: number; tradingLoss: number; chargeableProfits: number;
    corporationTax: number; marginalRelief: number; taxChargeable: number;
    carryForward: { tradingLosses: number; mainPool: number; specialPool: number };
  } | null;
  accountsHtml: string | null;
  computationHtml: string | null;
}

async function prepared(id: string) {
  const r = await getReturn(id);
  if (!r.ok || !r.data || !r.company) return { r, p: null };
  return { r, p: prepareReturn(toCompanyReturnInput(r.company, r.periodStart!, r.periodEnd!, r.data)) };
}

export async function previewReturn(id: string): Promise<ReturnPreview> {
  const { r, p } = await prepared(id);
  if (!p) return { ok: false, problems: [r.error ?? "The return couldn't be opened."], warnings: [], lines: [], summary: null, accountsHtml: null, computationHtml: null };
  const c = p.computation;
  return {
    ok: p.ok, problems: p.problems, warnings: p.warnings,
    lines: c?.lines ?? [],
    summary: c ? {
      accountingProfit: c.accountingProfit, tradingProfit: c.tradingProfit, tradingLoss: c.tradingLoss, chargeableProfits: c.chargeableProfits,
      corporationTax: c.corporationTax, marginalRelief: c.marginalRelief, taxChargeable: c.taxChargeable, carryForward: c.carryForward,
    } : null,
    accountsHtml: p.accountsHtml, computationHtml: p.computationHtml,
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
 * Sends the return to HMRC's test service.
 *
 * Live filing is not offered here: it needs HMRC's recognition of Nucta
 * File, and then the company's (or agent's) own Government Gateway sign-in
 * entered at the moment of filing. Until then every send is a test, and the
 * screen says so.
 */
export async function sendReturnToTest(id: string): Promise<SendResult> {
  const blocked = (headline: string, detail: string[]): SendResult => ({ ok: false, outcome: "blocked", headline, detail, correlationId: null, irmark: null, receipt: false });
  const { r, p } = await prepared(id);
  if (!p) return blocked("The return couldn't be opened.", [r.error ?? ""]);
  if (!p.ok || !p.ct600) return blocked("The return isn't ready to send.", p.problems);
  const { config, missing } = gatewayConfig("test");
  if (!config) return blocked("The HMRC test credentials aren't set up yet.", missing);

  const cls = messageClass("test");
  const envelope = buildEnvelope({
    messageClass: cls, senderId: config.senderId, vendorId: config.vendorId, body: p.ct600,
    utr: r.company!.utr ?? "", periodEnd: r.periodEnd!, test: true,
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

  const status = run.outcome === "accepted" ? "accepted-test" : run.outcome === "rejected" ? "rejected-test" : run.outcome === "timeout" ? "submitted-test" : "draft";
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
    await s.db.update(s.returns).set({ status, irmark, accountsHtml: p.accountsHtml, computationHtml: p.computationHtml, updatedAt: new Date() }).where(s.eq(s.returns.id, id));
  } catch {
    // The record is best effort for a test; the answer still goes back to the screen.
  }

  return {
    ok: run.outcome === "accepted",
    outcome: run.outcome,
    headline: run.outcome === "accepted" ? "Accepted by HMRC's test service."
      : run.outcome === "rejected" ? "HMRC's test service rejected the return."
        : run.outcome === "timeout" ? "Still processing at HMRC." : "The submission failed before HMRC could answer.",
    detail: run.errors.length ? run.errors.map(explain)
      : run.outcome === "accepted" ? ["This was a test: nothing has been filed for the company. The same return will be sent live once HMRC recognise Nucta File."]
        : run.outcome === "timeout" ? ["HMRC are still working on it. The Submission log can ask again with the correlation ID."] : [],
    correlationId: run.correlationId,
    irmark,
    receipt: Boolean(run.receipt),
  };
}
