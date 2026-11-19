"use server";

/**
 * Filing a return's accounts with Companies House, from the return's last
 * step. Every action checks the person is signed in and the return belongs
 * to their account. The company's authentication code is used for the one
 * submission and never stored or logged.
 */
import { SIGNED_OUT, ownedReturn, problem, signedIn, store } from "./store";
import { chLiveReady, chPresenter } from "./companies-house";
import { accountsHash, accountsKindOf, chFilingChecks, checkOne, sendAccounts, viewOf, waiting, type ChAccountsKind, type ChFilingStatus, type ChFilingView, type FileInput, type FileOutcome } from "./ch-filing";
import { normaliseReturnData, type ReturnData } from "./return-model";
import type { ChProfile } from "./ch-api";

export interface ChFilingState {
  ok: boolean;
  error?: string;
  /** The live account is set up, so filing is possible at all. */
  available: boolean;
  company: { name: string; companyNo: string | null };
  periodTo: string;
  kind: ChAccountsKind | null;
  director: string;
  approvedOn: string;
  problems: string[];
  warnings: string[];
  filings: ChFilingView[];
  canFile: boolean;
  /** Last contact details used in this account, to fill the form. */
  contact: { name: string; phone: string };
}

const today = () => new Date().toISOString().slice(0, 10);
const AUTO_CHECK_MS = 10 * 60_000;

/** Everything the return's Companies House panel shows. Checks on anything still waiting, at most every ten minutes. */
export async function chFilingState(returnId: string): Promise<ChFilingState> {
  const blank: ChFilingState = { ok: false, available: chLiveReady(), company: { name: "", companyNo: null }, periodTo: "", kind: null, director: "", approvedOn: "", problems: [], warnings: [], filings: [], canFile: false, contact: { name: "", phone: "" } };
  const u = await signedIn();
  if (!u) return { ...blank, error: SIGNED_OUT };
  try {
    const s = await store();
    const r = await ownedReturn(s, u, returnId);
    if (!r) return { ...blank, error: "That return isn't in Nucta Filings." };
    const [c] = await s.db.select().from(s.companies).where(s.eq(s.companies.id, r.companyId));
    const data = normaliseReturnData(r.data as Partial<ReturnData>);

    let rows = await s.db.select().from(s.chFilings).where(s.eq(s.chFilings.returnId, returnId)).orderBy(s.desc(s.chFilings.createdAt));
    const { presenter } = chPresenter("live");
    const stale = rows.filter((x) => waiting(x.status) && x.env === "live" && (!x.lastCheckedAt || Date.now() - x.lastCheckedAt.getTime() > AUTO_CHECK_MS) && Date.now() - x.createdAt.getTime() > 60_000);
    if (presenter && stale.length) {
      for (const x of stale.slice(0, 3)) await checkOne(s, x, presenter);
      rows = await s.db.select().from(s.chFilings).where(s.eq(s.chFilings.returnId, returnId)).orderBy(s.desc(s.chFilings.createdAt));
    }

    const { accountsForCompaniesHouse } = await import("./return-docs");
    const built = await accountsForCompaniesHouse(returnId);
    const accountsHtml = built.accountsHtml;
    let hash: string | null = null;
    if (accountsHtml) {
      const { companiesHouseCopy } = await import("./accounts/ch-form");
      const { ixbrlForCompaniesHouse } = await import("./companies-house");
      hash = accountsHash(ixbrlForCompaniesHouse(companiesHouseCopy(accountsHtml)));
    }
    const latest = rows[0] ? { status: rows[0].status as ChFilingStatus, submissionNumber: rows[0].submissionNumber } : null;
    const checked = chFilingChecks({
      companyNo: c.companyNo, companyName: c.name, periodTo: r.periodEnd, director: data.director, approvedOn: data.approvedOn,
      accountsReady: Boolean(accountsHtml), today: today(), latest, profile: (c.chProfile as ChProfile | null) ?? null,
    });
    // Say what's wrong with the accounts, not just that they aren't ready.
    const problems = !accountsHtml && built.problems.length
      ? [...checked.problems.filter((x) => !x.startsWith("The accounts aren't ready")), ...built.problems.map((x) => `In the accounts: ${x}`)]
      : checked.problems;
    const warnings = checked.warnings;
    const [last] = await s.db.select({ name: s.chFilings.contactName, phone: s.chFilings.contactPhone }).from(s.chFilings)
      .where(s.eq(s.chFilings.accountId, u.accountId)).orderBy(s.desc(s.chFilings.createdAt)).limit(1);
    return {
      ok: true, available: Boolean(presenter),
      company: { name: c.name, companyNo: c.companyNo }, periodTo: r.periodEnd,
      kind: accountsHtml ? accountsKindOf(accountsHtml, data.dormant) : null,
      director: data.director, approvedOn: data.approvedOn,
      problems, warnings, filings: rows.map((x) => viewOf(x, hash)),
      canFile: Boolean(presenter) && problems.length === 0,
      contact: { name: last?.name ?? u.name, phone: last?.phone ?? "" },
    };
  } catch (e) {
    return { ...blank, error: problem(e) };
  }
}

/** Files the accounts. */
export async function fileWithCompaniesHouse(returnId: string, f: FileInput): Promise<FileOutcome> {
  const u = await signedIn();
  if (!u) return { ok: false, headline: SIGNED_OUT, detail: [], filing: null };
  try {
    const s = await store();
    const r = await ownedReturn(s, u, returnId);
    if (!r) return { ok: false, headline: "That return isn't in Nucta Filings.", detail: [], filing: null };
    const [c] = await s.db.select().from(s.companies).where(s.eq(s.companies.id, r.companyId));
    const data = normaliseReturnData(r.data as Partial<ReturnData>);
    const { accountsForCompaniesHouse } = await import("./return-docs");
    const docs = await accountsForCompaniesHouse(returnId);
    if (!docs.accountsHtml) return { ok: false, headline: "The accounts aren't ready yet.", detail: docs.problems.length ? docs.problems : ["Finish the figures so the accounts can be built."], filing: null };
    if (!c.companyNo) return { ok: false, headline: "The company has no company number in Nucta Filings.", detail: ["Add it in the company's details."], filing: null };

    // The register as it is now, where Nucta Filings can read it; otherwise what was read last.
    let profile = (c.chProfile as ChProfile | null) ?? null;
    const { chApiReady, companyProfile } = await import("./ch-api");
    if (chApiReady()) {
      const fresh = await companyProfile(c.companyNo).catch(() => null);
      if (fresh?.ok) {
        profile = fresh.value;
        await s.db.update(s.companies).set({ chProfile: fresh.value }).where(s.eq(s.companies.id, c.id)).catch(() => undefined);
      }
    }
    return await sendAccounts(s, u, {
      returnId, companyId: c.id, companyNo: c.companyNo, companyName: c.name, periodTo: r.periodEnd,
      director: data.director, approvedOn: data.approvedOn, kind: accountsKindOf(docs.accountsHtml, data.dormant),
      accountsHtml: docs.accountsHtml, profile, today: today(),
    }, f);
  } catch (e) {
    return { ok: false, headline: "Something went wrong before the accounts were sent.", detail: [problem(e)], filing: null };
  }
}

/** Asks Companies House now about this return's filings that are still waiting. */
export async function checkChFiling(returnId: string): Promise<{ ok: boolean; problem?: string }> {
  const u = await signedIn();
  if (!u) return { ok: false, problem: SIGNED_OUT };
  try {
    const s = await store();
    const r = await ownedReturn(s, u, returnId);
    if (!r) return { ok: false, problem: "That return isn't in Nucta Filings." };
    const { presenter, missing } = chPresenter("live");
    if (!presenter) return { ok: false, problem: missing.join(" ") };
    const rows = await s.db.select().from(s.chFilings).where(s.eq(s.chFilings.returnId, returnId));
    const open = rows.filter((x) => waiting(x.status) && x.env === "live");
    // Not more than once every half minute per submission: Companies House ask presenters not to poll hard.
    const due = open.filter((x) => !x.lastCheckedAt || Date.now() - x.lastCheckedAt.getTime() > 30_000);
    if (open.length && !due.length) return { ok: true, problem: "Checked less than a minute ago. Try again shortly." };
    for (const x of due) {
      const res = await checkOne(s, x, presenter);
      if (!res.ok) return res;
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, problem: problem(e) };
  }
}
