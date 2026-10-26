"use server";

/**
 * VAT returns under Making Tax Digital, from the browser: the company's VAT
 * page, its VAT number, the figures from a spreadsheet, and sending a return.
 * Each action checks who is signed in and that the company is theirs first,
 * and passes on what the browser reports about itself, because HMRC require
 * it with every call (lib/vat-rules.ts, fraud prevention headers).
 */
import { headers } from "next/headers";
import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { currentUser, emailCheckNeeded, type SignedInUser } from "./auth";
import { store, SIGNED_OUT, problem, type Store } from "./store";
import { mtdReady, mtdEnv, connectionFor, obligations, submitVat, money, validateFraudHeaders, redirectUri, MtdError, type Obligation, type Caller, type Liability, type Payment, type MtdEnv } from "./hmrc-mtd";
import { boxesFromRows, checkBoxes, checkClientInfo, cleanVrn, completeBoxes, periodKeyOk, returnBody, vrnCheckDigitsOk, type VatBoxes } from "./vat-rules";
import { parseCsv } from "./trial-balance";

const today = () => new Date().toISOString().slice(0, 10);

async function ownCompany(s: Store, u: SignedInUser, companyId: string) {
  const [c] = await s.db.select().from(s.companies).where(s.and(s.eq(s.companies.id, companyId), s.eq(s.companies.accountId, u.accountId)));
  return c ?? null;
}

async function caller(u: SignedInUser, client: unknown): Promise<Caller | null> {
  const info = checkClientInfo(client);
  if (!info) return null;
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || (h.get("x-real-ip") ?? "").trim() || null;
  // The host doesn't pass on the browser's port, so Gov-Client-Public-Port is left out.
  return { userId: u.id, client: info, ip, port: null };
}

const NO_CLIENT = "Your browser didn't send the details HMRC require with every VAT request (screen size, time zone and so on). Reload the page and try again.";

export interface SubmittedVat {
  id: string; periodKey: string; periodStart: string | null; periodEnd: string | null; boxes: VatBoxes; source: string; sourceName: string | null;
  receipt: Record<string, unknown> | null; submittedAt: string; submittedByName: string | null; env: string;
}

export interface VatView {
  ok: boolean;
  problem?: string;
  company?: { id: string; name: string; vrn: string | null };
  ready: boolean;
  env: MtdEnv;
  /** Which HMRC sign-in is in use for this company, if any. */
  connection: { kind: "company" | "agent"; by: string | null; at: string } | null;
  practice: boolean;
  obligations: Obligation[];
  obligationsProblem?: string;
  liabilities: Liability[];
  payments: Payment[];
  submitted: SubmittedVat[];
  admin: boolean;
  redirectUri: string;
}

/** Everything the company's VAT page shows. Asks HMRC for the obligations when connected. */
export async function vatView(companyId: string, client: unknown): Promise<VatView> {
  const base = { ready: mtdReady(), env: mtdEnv(), connection: null, practice: false, obligations: [], liabilities: [], payments: [], submitted: [], admin: false, redirectUri: redirectUri() };
  const u = await currentUser();
  if (!u) return { ok: false, problem: SIGNED_OUT, ...base };
  try {
    const s = await store();
    const c = await ownCompany(s, u, companyId);
    if (!c) return { ok: false, problem: "That company isn't in Nucta File.", ...base };
    const rows = await s.db.select().from(s.vatReturns).where(s.eq(s.vatReturns.companyId, c.id)).orderBy(s.desc(s.vatReturns.submittedAt));
    const submitted: SubmittedVat[] = rows.map((r) => ({
      id: r.id, periodKey: r.periodKey, periodStart: r.periodStart, periodEnd: r.periodEnd, boxes: r.boxes, source: r.source, sourceName: r.sourceName,
      receipt: r.receipt ?? null, submittedAt: r.submittedAt.toISOString(), submittedByName: r.submittedByName, env: r.env,
    }));
    const conn = base.ready ? await connectionFor(s, u.accountId, c.id) : null;
    const view: VatView = {
      ...base, ok: true, company: { id: c.id, name: c.name, vrn: c.vrn ?? null }, practice: u.accountKind !== "company", submitted, admin: u.admin,
      connection: conn ? { kind: conn.scopeKey === "agent" ? "agent" : "company", by: conn.connectedByName, at: conn.createdAt.toISOString() } : null,
    };
    if (!conn || !c.vrn) return view;
    const who = await caller(u, client);
    if (!who) return { ...view, obligationsProblem: NO_CLIENT };
    try {
      view.obligations = await obligations(s, conn, c.vrn, who, today());
      const m = await money(s, conn, c.vrn, who, today()).catch(() => ({ liabilities: [], payments: [] }));
      view.liabilities = m.liabilities; view.payments = m.payments;
    } catch (e) {
      view.obligationsProblem = e instanceof MtdError ? e.message : problem(e);
    }
    return view;
  } catch (e) {
    return { ok: false, problem: problem(e), ...base };
  }
}

export async function saveVrn(companyId: string, raw: string): Promise<{ ok: boolean; problem?: string; vrn?: string | null }> {
  const u = await currentUser();
  if (!u) return { ok: false, problem: SIGNED_OUT };
  const vrn = raw.trim() ? cleanVrn(raw) : null;
  if (raw.trim() && !vrn) return { ok: false, problem: "A UK VAT number is nine digits, like 123 4567 89 (GB in front is fine)." };
  if (vrn && !vrnCheckDigitsOk(vrn)) return { ok: false, problem: "That VAT number's check digits don't work out. Check it against the VAT registration certificate." };
  try {
    const s = await store();
    const c = await ownCompany(s, u, companyId);
    if (!c) return { ok: false, problem: "That company isn't in Nucta File." };
    await s.db.update(s.companies).set({ vrn }).where(s.eq(s.companies.id, c.id));
    revalidatePath(`/companies/${c.id}/vat`); revalidatePath(`/companies/${c.id}`);
    return { ok: true, vrn };
  } catch (e) {
    return { ok: false, problem: problem(e) };
  }
}

/**
 * The nine boxes from a spreadsheet exported from the bookkeeping: CSV or
 * Excel. Nothing is saved; the figures come back to be checked and sent.
 */
export async function vatFromSheet(form: FormData): Promise<{ ok: boolean; problems: string[]; boxes?: VatBoxes; found?: string[]; name?: string }> {
  const u = await currentUser();
  if (!u) return { ok: false, problems: [SIGNED_OUT] };
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, problems: ["Choose the spreadsheet first."] };
  if (file.size > 5_000_000) return { ok: false, problems: ["That file is too large: a VAT return sheet is usually a few kilobytes."] };
  let rows: unknown[][];
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    if (/\.(xlsx|xls|ods)$/i.test(file.name)) {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(buf, { type: "buffer" });
      rows = wb.SheetNames.flatMap((n) => XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], { header: 1, raw: true, blankrows: false }));
    } else {
      rows = parseCsv(buf.toString("utf8"));
    }
  } catch {
    return { ok: false, problems: ["That file couldn't be read. Save it as CSV or Excel (.xlsx) from the bookkeeping software and try again."] };
  }
  const r = boxesFromRows(rows);
  if (!r.found.length) return { ok: false, problems: r.problems };
  return { ok: true, problems: r.problems, boxes: completeBoxes(r.boxes), found: r.found, name: file.name.slice(0, 120) };
}

export interface SubmitVatInput {
  companyId: string;
  periodKey: string;
  boxes: VatBoxes;
  source: "import" | "typed";
  sourceName?: string | null;
  declared: boolean;
  client: unknown;
}

export async function submitVatReturn(i: SubmitVatInput): Promise<{ ok: boolean; problems: string[]; receipt?: Record<string, unknown>; id?: string }> {
  const u = await currentUser();
  if (!u) return { ok: false, problems: [SIGNED_OUT] };
  if (emailCheckNeeded(u)) return { ok: false, problems: [`Confirm your email address first: open the link we sent to ${u.email}.`] };
  if (!mtdReady()) return { ok: false, problems: ["VAT returns aren't set up on this site yet (HMRC_MTD_CLIENT_ID and HMRC_MTD_CLIENT_SECRET)."] };
  if (!periodKeyOk(i.periodKey)) return { ok: false, problems: ["Choose the VAT period from HMRC's list."] };
  if (!i.declared) return { ok: false, problems: ["Tick the declaration first."] };
  const boxes = completeBoxes(i.boxes ?? {});
  const issues = checkBoxes(boxes);
  if (issues.length) return { ok: false, problems: issues };
  try {
    const s = await store();
    const c = await ownCompany(s, u, i.companyId);
    if (!c) return { ok: false, problems: ["That company isn't in Nucta File."] };
    if (!c.vrn) return { ok: false, problems: ["Add the company's VAT number first."] };
    const conn = await connectionFor(s, u.accountId, c.id);
    if (!conn) return { ok: false, problems: ["Connect to HMRC first."] };
    const who = await caller(u, i.client);
    if (!who) return { ok: false, problems: [NO_CLIENT] };
    // The period must be one HMRC are waiting for: read it from HMRC, not the browser.
    const obs = await obligations(s, conn, c.vrn, who, today());
    const ob = obs.find((o) => o.periodKey === i.periodKey);
    if (!ob) return { ok: false, problems: ["HMRC don't list that VAT period for this business."] };
    if (ob.status !== "O") return { ok: false, problems: ["HMRC already have the return for that period."] };
    if (ob.end >= today()) return { ok: false, problems: [`This period runs to ${ob.end}: its return can be sent once it has ended.`] };
    const sent = await submitVat(s, conn, c.vrn, who, returnBody(i.periodKey, boxes));
    const receipt = { ...(sent.data as unknown as Record<string, unknown>) };
    const id = randomUUID();
    await s.db.insert(s.vatReturns).values({
      id, accountId: u.accountId, companyId: c.id, vrn: c.vrn, periodKey: i.periodKey, periodStart: ob.start, periodEnd: ob.end, due: ob.due,
      boxes, source: i.source === "import" ? "import" : "typed", sourceName: i.sourceName ?? null, receipt, correlationId: sent.correlationId,
      env: mtdEnv(), submittedBy: u.id, submittedByName: u.name,
    }).onConflictDoNothing();
    revalidatePath(`/companies/${c.id}/vat`);
    return { ok: true, problems: [], receipt, id };
  } catch (e) {
    return { ok: false, problems: [e instanceof MtdError ? e.message : `The return couldn't be sent: ${problem(e)}`] };
  }
}

/** Forgets an HMRC connection. HMRC's own record of the authority stays until it's removed there or runs out. */
export async function disconnectVat(companyId: string, kind: "company" | "agent"): Promise<{ ok: boolean; problem?: string }> {
  const u = await currentUser();
  if (!u) return { ok: false, problem: SIGNED_OUT };
  try {
    const s = await store();
    const c = await ownCompany(s, u, companyId);
    if (!c) return { ok: false, problem: "That company isn't in Nucta File." };
    await s.db.delete(s.vatConnections).where(s.and(s.eq(s.vatConnections.accountId, u.accountId), s.eq(s.vatConnections.scopeKey, kind === "agent" ? "agent" : c.id), s.eq(s.vatConnections.env, mtdEnv())));
    revalidatePath(`/companies/${c.id}/vat`);
    return { ok: true };
  } catch (e) {
    return { ok: false, problem: problem(e) };
  }
}

/** For the administrators: HMRC's own check of the fraud prevention headers (sandbox only). */
export async function checkFraudHeaders(client: unknown): Promise<{ ok: boolean; text: string[] }> {
  const u = await currentUser();
  if (!u?.admin) return { ok: false, text: ["This is for Nucta File's administrators only."] };
  if (!mtdReady()) return { ok: false, text: ["Add HMRC_MTD_CLIENT_ID and HMRC_MTD_CLIENT_SECRET first."] };
  if (mtdEnv() !== "sandbox") return { ok: false, text: ["HMRC's header check only works in the sandbox."] };
  const who = await caller(u, client);
  if (!who) return { ok: false, text: [NO_CLIENT] };
  try {
    const r = await validateFraudHeaders(who);
    const lines = [r.message ?? (r.ok ? "HMRC say the headers are valid." : "HMRC found problems."),
      ...(r.errors ?? []).map((e) => `Error — ${e.message}${e.headers?.length ? ` (${e.headers.join(", ")})` : ""}`),
      ...(r.warnings ?? []).map((w) => `Warning — ${w.message}${w.headers?.length ? ` (${w.headers.join(", ")})` : ""}`)];
    return { ok: r.ok, text: lines };
  } catch (e) {
    return { ok: false, text: [problem(e)] };
  }
}
