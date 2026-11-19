"use server";

/**
 * Bulk dormant filing: list the account's companies with what Companies
 * House expect next, then file dormant accounts for each one chosen, one at
 * a time so each gets its own answer. Each filing makes (or reuses) the
 * company's dormant return for the period, so its accounts, approval and
 * Companies House result live on the return like any other.
 */
import { randomUUID } from "crypto";
import { SIGNED_OUT, ownedCompany, problem, signedIn, store } from "./store";
import { chLiveReady } from "./companies-house";
import { sendAccounts, CH_ACTIVE, type ChFilingStatus, type FileOutcome } from "./ch-filing";
import { dormantReturnData, dormantRowProblems, suggestedPeriod, type DormantRow } from "./dormant";
import { normaliseReturnData, type ReturnData } from "./return-model";
import type { ChProfile } from "./ch-api";

export interface DormantCandidate {
  companyId: string;
  name: string;
  companyNo: string | null;
  period: { start: string; end: string } | null;
  /** Companies House's record: when accounts are due, and what was filed last. */
  due: string | null;
  overdue: boolean;
  lastType: string | null;
  lastMadeUpTo: string | null;
  first: boolean;
  everTraded: boolean;
  directors: string[];
  /** Share capital from an earlier return in Nucta Filings, if any. */
  shareCapital: number | null;
  paid: boolean | null;
  /** A filing already made for this period, and how it stands. */
  filed: { status: string; submissionNumber: string; returnId: string } | null;
  /** Why it can't be filed in bulk, if so. */
  blocked: string | null;
}

const today = () => new Date().toISOString().slice(0, 10);

export async function dormantCandidates(): Promise<{ ok: boolean; error?: string; live: boolean; chReady: boolean; companies: DormantCandidate[] }> {
  const u = await signedIn();
  const { chApiReady, companyProfile, currentDirectors } = await import("./ch-api");
  const out = { ok: false, live: chLiveReady(), chReady: chApiReady(), companies: [] as DormantCandidate[] };
  if (!u) return { ...out, error: SIGNED_OUT };
  try {
    const s = await store();
    const cos = await s.db.select().from(s.companies).where(s.and(s.eq(s.companies.accountId, u.accountId), s.eq(s.companies.archived, false))).orderBy(s.asc(s.companies.name));
    const ids = cos.map((c) => c.id);
    const rets = ids.length ? await s.db.select().from(s.returns).where(s.inArray(s.returns.companyId, ids)) : [];
    const filings = ids.length ? await s.db.select().from(s.chFilings).where(s.inArray(s.chFilings.companyId, ids)).orderBy(s.desc(s.chFilings.createdAt)) : [];
    const week = Date.now() - 7 * 86_400_000;

    const list = await Promise.all(cos.map(async (c): Promise<DormantCandidate> => {
      let profile = (c.chProfile as ChProfile | null) ?? null;
      let directors: string[] = [];
      if (chApiReady() && c.companyNo) {
        if (!profile || Date.parse(profile.fetchedAt) < week) {
          const p = await companyProfile(c.companyNo).catch(() => null);
          if (p?.ok) {
            profile = p.value;
            await s.db.update(s.companies).set({ chProfile: p.value }).where(s.eq(s.companies.id, c.id)).catch(() => undefined);
          }
        }
        const d = await currentDirectors(c.companyNo).catch(() => null);
        if (d?.ok) directors = d.value;
      }
      const period = suggestedPeriod(profile, c.incorporatedOn);
      const mine = rets.filter((r) => r.companyId === c.id).sort((a, b) => b.periodEnd.localeCompare(a.periodEnd));
      const earlier = mine.map((r) => normaliseReturnData(r.data as Partial<ReturnData>)).find((d) => d.balanceSheet.shareCapital > 0);
      const f = period ? filings.find((x) => x.companyId === c.id && x.periodTo === period.end) : undefined;
      const lastType = profile?.lastAccountsType ?? null;
      return {
        companyId: c.id, name: c.name, companyNo: c.companyNo, period,
        due: profile?.nextAccountsDue ?? null, overdue: Boolean(profile?.accountsOverdue), lastType, lastMadeUpTo: profile?.lastAccountsMadeUpTo ?? null,
        first: !profile?.lastAccountsMadeUpTo,
        everTraded: Boolean(lastType && !/dormant/i.test(lastType)),
        directors,
        shareCapital: earlier ? earlier.balanceSheet.shareCapital : null,
        paid: earlier ? earlier.balanceSheet.shareCapitalNotPaid === 0 : null,
        filed: f ? { status: f.status, submissionNumber: f.submissionNumber, returnId: f.returnId } : null,
        blocked: !c.companyNo ? "No company number in Nucta Filings."
          : profile && !/^active$/i.test(profile.status) ? `Companies House show it as ${profile.status}.`
          : f && CH_ACTIVE.includes(f.status as ChFilingStatus) ? (f.status === "accepted" ? "Already filed for this period." : "Already with Companies House for this period.")
          : null,
      };
    }));
    return { ...out, ok: true, companies: list };
  } catch (e) {
    return { ...out, error: problem(e) };
  }
}

export interface DormantFileInput extends DormantRow {
  authCode: string;
}

/** Files one company's dormant accounts. The page calls this once per company, in turn. */
export async function fileDormant(row: DormantFileInput, common: { approvedOn: string; contactName: string; contactPhone: string; confirmed: boolean }): Promise<FileOutcome & { returnId?: string }> {
  const u = await signedIn();
  if (!u) return { ok: false, headline: SIGNED_OUT, detail: [], filing: null };
  try {
    const s = await store();
    const c = await ownedCompany(s, u, row.companyId);
    if (!c) return { ok: false, headline: "That company isn't in Nucta Filings.", detail: [], filing: null };
    if (!c.companyNo) return { ok: false, headline: "The company has no company number in Nucta Filings.", detail: [], filing: null };
    const rowProblems = dormantRowProblems(row, common.approvedOn, today());
    if (rowProblems.length) return { ok: false, headline: "Not filed: check this company's details.", detail: rowProblems, filing: null };

    // The return for exactly this period: reused if there is one, otherwise made.
    const existing = (await s.db.select().from(s.returns).where(s.and(s.eq(s.returns.companyId, c.id), s.eq(s.returns.periodStart, row.periodStart), s.eq(s.returns.periodEnd, row.periodEnd))))[0];
    let returnId: string;
    if (existing) {
      const old = normaliseReturnData(existing.data as Partial<ReturnData>);
      if (!old.dormant && (old.pl.turnover || old.pl.otherCharges)) {
        return { ok: false, headline: "Not filed: this company's return for the period has trading figures.", detail: ["Open its return and check it, or file it from there."], filing: null, returnId: existing.id };
      }
      if (existing.status === "accepted" && !old.dormant) {
        return { ok: false, headline: "Not filed: this period's return was filed with HMRC as a trading company.", detail: ["Open its return and file the accounts from there."], filing: null, returnId: existing.id };
      }
      const data = dormantReturnData(row, common.approvedOn, old);
      // A return HMRC already accepted keeps its figures; only its accounts go to Companies House.
      if (existing.status !== "accepted") await s.db.update(s.returns).set({ data: { ...data, sent: old.sent ?? {} } as unknown as Record<string, unknown>, basis: "frs105", updatedAt: new Date() }).where(s.eq(s.returns.id, existing.id));
      returnId = existing.id;
    } else {
      returnId = randomUUID();
      await s.db.insert(s.returns).values({ id: returnId, companyId: c.id, kind: "ct600", periodStart: row.periodStart, periodEnd: row.periodEnd, status: "draft", basis: "frs105", data: dormantReturnData(row, common.approvedOn) as unknown as Record<string, unknown> });
    }

    const { accountsForCompaniesHouse } = await import("./return-docs");
    const built = await accountsForCompaniesHouse(returnId);
    if (!built.accountsHtml) return { ok: false, headline: "Not filed: the dormant accounts couldn't be built.", detail: built.problems, filing: null, returnId };

    let profile = (c.chProfile as ChProfile | null) ?? null;
    const { chApiReady, companyProfile } = await import("./ch-api");
    if (chApiReady()) {
      const fresh = await companyProfile(c.companyNo).catch(() => null);
      if (fresh?.ok) profile = fresh.value;
    }
    const res = await sendAccounts(s, u, {
      returnId, companyId: c.id, companyNo: c.companyNo, companyName: c.name, periodTo: row.periodEnd,
      director: row.director.trim(), approvedOn: common.approvedOn, kind: "dormant", accountsHtml: built.accountsHtml, profile, today: today(),
    }, { authCode: row.authCode, contactName: common.contactName, contactPhone: common.contactPhone, confirmed: common.confirmed });
    return { ...res, returnId };
  } catch (e) {
    return { ok: false, headline: "Something went wrong before the accounts were sent.", detail: [problem(e)], filing: null };
  }
}
