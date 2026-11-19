/**
 * Filing a return's accounts with Companies House, for real. Server only.
 *
 * The rules that don't need the database are at the top, so they can be
 * tested on their own: what stops a filing, what the statuses mean, and
 * which filing is the one that counts. Below them, the database and the
 * gateway: sending, checking a submission, collecting every result, and
 * emailing whoever filed when Companies House decide.
 *
 * What is sent is the Companies House copy of the same accounts HMRC
 * receive with the CT600: the profit and loss account (and for a small
 * company the directors' report) left out, as section 444 allows, and the
 * balance sheet saying so.
 */
import { createHash, randomUUID } from "crypto";
import type { ChProfile } from "./ch-api";
import type { SignedInUser } from "./auth";
import {
  authCodeProblem, buildChAccountsEnvelope, buildChAckEnvelope, buildChStatusEnvelope, chErrorHelp, chPresenter, chRejectHelp,
  companyNumberProblem, formHeaderProblems, ixbrlForCompaniesHouse, newSubmissionNumber, nextTransactionId, parseChReply,
  postToCompaniesHouse, redactCh, CH_MAX_DATA_CHARS, type ChPresenter, type ChStatus,
} from "./companies-house";

// ---------- rules ----------

export type ChFilingStatus = "sending" | "unknown" | "refused" | "not-received" | "received" | "pending" | "parked" | "accepted" | "rejected" | "failed";
export type ChAccountsKind = "micro" | "small" | "dormant";

/** Statuses that mean a filing is with Companies House, or done: no second filing while one of these stands. */
export const CH_ACTIVE: readonly ChFilingStatus[] = ["sending", "unknown", "received", "pending", "parked", "accepted"];
/** Statuses Companies House have finished with. */
export const CH_FINAL: readonly ChFilingStatus[] = ["accepted", "rejected", "failed"];

export const CH_STATUS_WORDS: Record<ChFilingStatus, { label: string; tone: "good" | "bad" | "info" | "warn"; meaning: string }> = {
  sending: { label: "Sending", tone: "info", meaning: "Being sent to Companies House now." },
  unknown: { label: "Not confirmed", tone: "warn", meaning: "The connection to Companies House dropped before they answered, so it isn't known whether they received it. Check the status before filing again." },
  refused: { label: "Not received", tone: "bad", meaning: "Companies House's gateway turned the submission away, so nothing was filed. See why below, put it right and file again." },
  "not-received": { label: "Not received", tone: "bad", meaning: "Companies House have no record of it, so nothing was filed. You can file again." },
  received: { label: "Received", tone: "info", meaning: "Companies House have the accounts and will examine them, usually within a day." },
  pending: { label: "Being examined", tone: "info", meaning: "Companies House are examining the accounts. Most are decided within a day; some take up to five working days." },
  parked: { label: "On hold", tone: "warn", meaning: "Companies House have paused the examination and may contact the presenter. Nothing to do unless they ask." },
  accepted: { label: "Accepted", tone: "good", meaning: "Companies House accepted the accounts. They'll appear on the public register shortly." },
  rejected: { label: "Rejected", tone: "bad", meaning: "Companies House didn't accept the accounts, so they aren't filed. See why below, put it right and file again before the deadline." },
  failed: { label: "Fault at Companies House", tone: "bad", meaning: "Companies House had a fault processing the submission. File again; if it happens twice, contact them with the submission number." },
};

/** Companies House's status codes as Nucta File's statuses. */
export const FROM_CH_STATUS: Record<string, ChFilingStatus> = { ACCEPT: "accepted", REJECT: "rejected", PENDING: "pending", PARKED: "parked", INTERNAL_FAILURE: "failed" };

export const accountsHash = (ixbrl: string): string => createHash("sha256").update(ixbrl, "utf8").digest("hex").slice(0, 32);

/** Which accounts a return's iXBRL is. */
export function accountsKindOf(accountsHtml: string, dormant: boolean): ChAccountsKind {
  if (dormant) return "dormant";
  return /subject to the small companies regime/.test(accountsHtml) ? "small" : "micro";
}

const normName = (n: string) => n.toUpperCase().replace(/\bLIMITED\b/g, "LTD").replace(/[^A-Z0-9]+/g, " ").trim();

export interface ChFilingCheckInput {
  companyNo: string | null;
  companyName: string;
  periodTo: string;
  director: string;
  approvedOn: string;
  accountsReady: boolean;
  today: string;
  /** The latest filing for this return, if any. */
  latest: { status: ChFilingStatus; submissionNumber: string } | null;
  profile: ChProfile | null;
}

/** What stops a filing (problems) and what's worth a second look (warnings). Nothing here is sent anywhere. */
export function chFilingChecks(c: ChFilingCheckInput): { problems: string[]; warnings: string[] } {
  const problems: string[] = [];
  const warnings: string[] = [];
  if (c.latest?.status === "accepted") problems.push(`Companies House have already accepted these accounts (submission ${c.latest.submissionNumber}).`);
  else if (c.latest && CH_ACTIVE.includes(c.latest.status)) problems.push(`Submission ${c.latest.submissionNumber} is still with Companies House. Wait for their answer before filing again.`);
  if (!c.companyNo) problems.push("The company has no company number in Nucta File. Add it in the company's details.");
  else {
    const np = companyNumberProblem(c.companyNo);
    if (np) problems.push(np);
  }
  if (!c.accountsReady) problems.push("The accounts aren't ready yet. Finish the figures so the accounts can be built.");
  if (!c.director.trim()) problems.push("The accounts need the name of the director who approved them (the Approval step).");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.approvedOn)) problems.push("The accounts need the date the director approved them (the Approval step).");
  else {
    if (c.approvedOn <= c.periodTo) problems.push("The approval date must be after the year end.");
    if (c.approvedOn > c.today) problems.push("The approval date is in the future. Accounts can only be filed once they've been approved.");
  }
  problems.push(...formHeaderProblems({ companyName: c.companyName, contactName: "", contactNumber: "" }).filter((p) => /company name/i.test(p)));
  const p = c.profile;
  if (p) {
    if (p.status && !/^active$/i.test(p.status)) problems.push(`Companies House show the company as ${p.status}, so it can't file accounts this way.`);
    if (p.lastAccountsMadeUpTo && p.lastAccountsMadeUpTo === c.periodTo) {
      problems.push("Companies House already have accounts made up to this date. Amended accounts can't be filed from Nucta File yet.");
    } else if (p.nextAccountsMadeUpTo && p.nextAccountsMadeUpTo !== c.periodTo) {
      warnings.push(`Companies House expect the next accounts made up to ${p.nextAccountsMadeUpTo}, but these are made up to ${c.periodTo}. Unless the year end has been changed at Companies House, they'll reject them.`);
    }
    if (p.name && normName(p.name) !== normName(c.companyName)) {
      warnings.push(`The name in Nucta File, “${c.companyName}”, isn't exactly the name on the register, “${p.name}”. Companies House may reject accounts whose name doesn't match.`);
    }
  }
  return { problems, warnings };
}

/** What the person filing types in: checked before anything is built. */
export function chFilingFormProblems(f: { authCode: string; contactName: string; contactPhone: string; confirmed: boolean }): string[] {
  const out: string[] = [];
  const ap = authCodeProblem(f.authCode);
  if (ap) out.push(ap);
  if (!f.contactName.trim()) out.push("Add a contact name: Companies House show it against the filing and use it if they have a question.");
  if (!/^[0-9+() -]{7,20}$/.test(f.contactPhone.trim())) out.push("Add a contact phone number (digits, spaces and + only).");
  out.push(...formHeaderProblems({ companyName: "ACME", contactName: f.contactName, contactNumber: f.contactPhone }).filter((p) => !/company name/i.test(p)));
  if (!f.confirmed) out.push("Tick the box to confirm the director approved these accounts and you're authorised to deliver them.");
  return out;
}

/** A reason with its plain-words help, for the screen and the email. */
export const reasonWithHelp = (r: string): { text: string; help: string | null } => ({ text: r, help: chRejectHelp(r) });

/** A gateway error as a reason: its number, Companies House's words and what it means. */
const gatewayReason = (e: { number: string; text: string }): string => {
  const help = chErrorHelp(e.number);
  return `${e.number ? `${e.number}: ` : ""}${e.text || "(no text given)"}${help ? ` — ${help}` : ""}`;
};

// ---------- the database and the gateway ----------

type Store = Awaited<ReturnType<typeof import("./store").store>>;
type Row = typeof import("./schema").chFilings.$inferSelect;

export interface ChFilingView {
  id: string;
  submissionNumber: string;
  status: ChFilingStatus;
  label: string;
  tone: "good" | "bad" | "info" | "warn";
  meaning: string;
  kind: ChAccountsKind;
  reasons: { text: string; help: string | null }[];
  examinerNote: string | null;
  receivedAt: string | null;
  sentAt: string;
  filedByName: string;
  checkedAt: string | null;
  /** The return's accounts have changed since these were sent. */
  changedSince: boolean;
}

export function viewOf(r: Row, currentHash: string | null): ChFilingView {
  const st = (CH_STATUS_WORDS[r.status as ChFilingStatus] ? r.status : "unknown") as ChFilingStatus;
  const w = CH_STATUS_WORDS[st];
  return {
    id: r.id, submissionNumber: r.submissionNumber, status: st, label: w.label, tone: w.tone, meaning: w.meaning,
    kind: r.kind as ChAccountsKind, reasons: (r.reasons ?? []).map(reasonWithHelp), examinerNote: r.examinerNote,
    receivedAt: r.receivedAt, sentAt: r.createdAt.toISOString(), filedByName: r.filedByName,
    checkedAt: r.lastCheckedAt?.toISOString() ?? null,
    changedSince: Boolean(currentHash && currentHash !== r.accountsHash && st === "accepted"),
  };
}

/** Every SubmissionNumber already used, test or live, so a number is never sent twice (TIS 2.1.3). */
async function usedNumbers(s: Store): Promise<Set<string>> {
  const a = await s.db.select({ n: s.chFilings.submissionNumber }).from(s.chFilings);
  const b = await s.db.select({ n: s.submissions.correlationId }).from(s.submissions).where(s.eq(s.submissions.messageClass, "CH-Accounts"));
  return new Set([...a, ...b].map((r) => (r.n ?? "").toUpperCase()).filter(Boolean));
}

export interface FileInput { authCode: string; contactName: string; contactPhone: string; confirmed: boolean }

export interface FileOutcome {
  ok: boolean;
  headline: string;
  detail: string[];
  filing: ChFilingView | null;
}

/**
 * Sends the accounts. The row is written first, with the number reserved,
 * so a double click or a dropped connection can't send the same accounts
 * twice without anyone knowing.
 */
export async function sendAccounts(s: Store, u: SignedInUser, a: {
  returnId: string; companyId: string; companyNo: string; companyName: string; periodTo: string; director: string; approvedOn: string;
  kind: ChAccountsKind; accountsHtml: string; profile: ChProfile | null; today: string;
}, f: FileInput): Promise<FileOutcome> {
  const fail = (headline: string, detail: string[]): FileOutcome => ({ ok: false, headline, detail, filing: null });
  const { presenter, missing } = chPresenter("live");
  if (!presenter) return fail("Filing with Companies House isn't switched on yet.", missing);

  const rows = await s.db.select().from(s.chFilings).where(s.eq(s.chFilings.returnId, a.returnId)).orderBy(s.desc(s.chFilings.createdAt));
  const latest = rows[0] ? { status: rows[0].status as ChFilingStatus, submissionNumber: rows[0].submissionNumber } : null;
  const { problems } = chFilingChecks({ ...a, accountsReady: true, latest });
  const formProblems = chFilingFormProblems(f);
  if (problems.length || formProblems.length) return fail("The accounts can't be filed yet.", [...problems, ...formProblems]);

  const { companiesHouseCopy } = await import("./accounts/ch-form");
  const ixbrl = ixbrlForCompaniesHouse(companiesHouseCopy(a.accountsHtml));
  const hash = accountsHash(ixbrl);

  // Reserve a number that has never been used.
  const used = await usedNumbers(s);
  let submissionNumber = newSubmissionNumber();
  while (used.has(submissionNumber)) {
    await new Promise((r) => setTimeout(r, 1100));
    submissionNumber = newSubmissionNumber();
  }
  const id = randomUUID();
  await s.db.insert(s.chFilings).values({
    id, accountId: u.accountId, returnId: a.returnId, companyId: a.companyId, companyNo: a.companyNo.trim().toUpperCase(), companyName: a.companyName,
    periodTo: a.periodTo, submissionNumber, env: "live", kind: a.kind, status: "sending", reasons: [], accountsHash: hash,
    contactName: f.contactName.trim(), contactPhone: f.contactPhone.trim(), filedBy: u.id, filedByName: u.name, filedByEmail: u.email,
  });

  const envelope = buildChAccountsEnvelope(presenter, {
    companyNumber: a.companyNo, companyName: a.companyName, companyAuthCode: f.authCode,
    contactName: f.contactName.trim(), contactNumber: f.contactPhone.trim(), dateSigned: a.approvedOn,
    submissionNumber, transactionId: nextTransactionId(), ixbrl,
  });
  const data = envelope.match(/<Data>([\s\S]*?)<\/Data>/)?.[1] ?? "";
  const update = async (v: Partial<Row>) => { await s.db.update(s.chFilings).set(v).where(s.eq(s.chFilings.id, id)); };
  if (data.length > CH_MAX_DATA_CHARS) {
    const reason = `The accounts come to ${data.length.toLocaleString("en-GB")} characters once encoded; Companies House take up to 1.2 million.`;
    await update({ status: "refused", reasons: [reason], envelope: null });
    return { ok: false, headline: "The accounts are too large for Companies House.", detail: [reason], filing: await one(s, id, hash) };
  }

  let res: { status: number; text: string };
  try {
    res = await postToCompaniesHouse(envelope);
  } catch (e) {
    await update({ status: "unknown", reasons: [`No answer from Companies House: ${String((e as Error)?.message ?? e).slice(0, 200)}`], envelope: redactCh(envelope), lastCheckedAt: new Date() });
    return {
      ok: false,
      headline: "Companies House didn't answer, so it isn't known whether they received the accounts.",
      detail: [`Press “Check with Companies House” in a few minutes. Don't file again until that says submission ${submissionNumber} wasn't received.`],
      filing: await one(s, id, hash),
    };
  }
  const reply = parseChReply(res.text);
  const failed = reply.errors.filter((e) => e.type !== "warning");
  const received = res.status >= 200 && res.status < 300 && failed.length === 0;
  await update({
    status: received ? "received" : "refused",
    reasons: received ? [] : failed.length ? failed.map(gatewayReason) : [`Companies House replied with HTTP ${res.status}.`],
    receivedAt: reply.timestamp, envelope: redactCh(envelope), reply: res.text, lastCheckedAt: new Date(),
  });
  return received
    ? { ok: true, headline: `Received by Companies House as submission ${submissionNumber}.`, detail: ["They now examine the accounts, usually within a day. You'll get an email when they decide, and the status here updates by itself."], filing: await one(s, id, hash) }
    : { ok: false, headline: "Companies House turned the submission away. Nothing was filed.", detail: [], filing: await one(s, id, hash) };
}

async function one(s: Store, id: string, currentHash: string | null): Promise<ChFilingView | null> {
  const [r] = await s.db.select().from(s.chFilings).where(s.eq(s.chFilings.id, id));
  return r ? viewOf(r, currentHash) : null;
}

/**
 * Applies results from Companies House to the filings they're about, and
 * emails whoever filed once a decision is in. Returns how many changed.
 */
export async function applyStatuses(s: Store, statuses: ChStatus[], raw: string): Promise<number> {
  let changed = 0;
  for (const st of statuses) {
    if (!st.submissionNumber) continue;
    // A reply may prefix the number; it is always the last six characters.
    const sn = st.submissionNumber.split("-").pop()!.toUpperCase().slice(-6);
    const [r] = await s.db.select().from(s.chFilings).where(s.eq(s.chFilings.submissionNumber, sn));
    if (!r) continue;
    const next = FROM_CH_STATUS[st.statusCode] ?? r.status as ChFilingStatus;
    const final = CH_FINAL.includes(next);
    const reasons = st.reasons.length ? st.reasons : r.reasons;
    await s.db.update(s.chFilings).set({
      status: next, reasons, examinerNote: st.comment || r.examinerNote, reply: raw, lastCheckedAt: new Date(),
      ...(final && !r.decidedAt ? { decidedAt: new Date() } : {}),
    }).where(s.eq(s.chFilings.id, r.id));
    if (next !== r.status) changed++;
    if (final && !r.notifiedAt) await notify(s, { ...r, status: next, reasons });
  }
  return changed;
}

async function notify(s: Store, r: Row): Promise<void> {
  if (!r.filedByEmail) return;
  try {
    const { sendEmail } = await import("./auth");
    const { absolute } = await import("./site");
    const link = absolute(`/returns/${r.returnId}?step=file`);
    const accepted = r.status === "accepted";
    const subject = accepted
      ? `Companies House accepted the accounts for ${r.companyName}`
      : `Companies House didn't accept the accounts for ${r.companyName}`;
    const lines = accepted
      ? [`Companies House have accepted the accounts for ${r.companyName} (${r.companyNo}), made up to ${r.periodTo}.`, "", `Submission number: ${r.submissionNumber}`, "", "They'll appear on the public register shortly. Nothing more needs doing for these accounts."]
      : [
        `Companies House didn't accept the accounts for ${r.companyName} (${r.companyNo}), made up to ${r.periodTo}, so they aren't filed yet.`, "",
        `Submission number: ${r.submissionNumber}`, "",
        ...(r.reasons.length ? ["Their reasons:", ...r.reasons.map((x) => `- ${x}${chRejectHelp(x) ? `\n  What to do: ${chRejectHelp(x)}` : ""}`), ""] : []),
        "Put it right and file again before the filing deadline.",
      ];
    const sent = await sendEmail(r.filedByEmail, subject, [...lines, "", `Open the return: ${link}`, "", "Nucta File"].join("\n"));
    if (sent) await s.db.update(s.chFilings).set({ notifiedAt: new Date() }).where(s.eq(s.chFilings.id, r.id));
  } catch {
    // The status on the return is what counts; an email that can't go now is tried again on the next check.
  }
}

/** Asks Companies House about one submission and records the answer. */
export async function checkOne(s: Store, r: Row, presenter: ChPresenter): Promise<{ ok: boolean; problem?: string }> {
  let res: { status: number; text: string };
  try {
    res = await postToCompaniesHouse(buildChStatusEnvelope(presenter, nextTransactionId(), r.submissionNumber));
  } catch (e) {
    return { ok: false, problem: `Couldn't reach Companies House: ${String((e as Error)?.message ?? e).slice(0, 200)}` };
  }
  const reply = parseChReply(res.text);
  const failed = reply.errors.filter((e) => e.type !== "warning");
  if (failed.length || res.status < 200 || res.status >= 300) {
    await s.db.update(s.chFilings).set({ lastCheckedAt: new Date() }).where(s.eq(s.chFilings.id, r.id));
    return { ok: false, problem: failed.length ? failed.map(gatewayReason).join(" ") : `Companies House replied with HTTP ${res.status}.` };
  }
  // TIS 2.5: an unknown number comes back as "No Transaction Found".
  const notFound = reply.statuses.some((x) => x.reasons.some((m) => /no transaction found/i.test(m)))
    || !reply.statuses.some((x) => x.submissionNumber && x.statusCode);
  if (notFound) {
    // Only a submission whose receipt was never confirmed can turn out not to exist.
    const next: ChFilingStatus = r.status === "unknown" || r.status === "sending" ? "not-received" : r.status as ChFilingStatus;
    await s.db.update(s.chFilings).set({ status: next, lastCheckedAt: new Date() }).where(s.eq(s.chFilings.id, r.id));
    return { ok: true };
  }
  await applyStatuses(s, reply.statuses, res.text);
  return { ok: true };
}

/** Filings still waiting on Companies House. */
export const waiting = (status: string): boolean => ["unknown", "received", "pending", "parked", "sending"].includes(status);

/**
 * Collects every finished result for the live presenter, acknowledges them
 * (TIS 2.5.1), then asks about anything still waiting that hasn't been asked
 * about for an hour. For the scheduled job.
 */
export async function collectLive(s: Store): Promise<{ ok: boolean; collected: number; checked: number; problem?: string }> {
  const { presenter, missing } = chPresenter("live");
  if (!presenter) return { ok: false, collected: 0, checked: 0, problem: missing.join(" ") };
  let collected = 0;
  try {
    const res = await postToCompaniesHouse(buildChStatusEnvelope(presenter, nextTransactionId()));
    const reply = parseChReply(res.text);
    const failed = reply.errors.filter((e) => e.type !== "warning" && e.number !== "8026");
    if (!failed.length && reply.statuses.some((x) => x.submissionNumber)) {
      collected = await applyStatuses(s, reply.statuses, res.text);
      await postToCompaniesHouse(buildChAckEnvelope(presenter, nextTransactionId())).catch(() => undefined);
    }
  } catch {
    // Carry on to the one-by-one checks.
  }
  const hourAgo = new Date(Date.now() - 3_600_000);
  const open = (await s.db.select().from(s.chFilings).where(s.eq(s.chFilings.env, "live")))
    .filter((r) => waiting(r.status) && (!r.lastCheckedAt || r.lastCheckedAt < hourAgo));
  let checked = 0;
  for (const r of open.slice(0, 25)) {
    if ((await checkOne(s, r, presenter)).ok) checked++;
  }
  // Decisions whose email couldn't go before.
  const unsent = (await s.db.select().from(s.chFilings).where(s.eq(s.chFilings.env, "live")))
    .filter((r) => CH_FINAL.includes(r.status as ChFilingStatus) && !r.notifiedAt && r.decidedAt && r.decidedAt > new Date(Date.now() - 7 * 86_400_000));
  for (const r of unsent.slice(0, 25)) await notify(s, r);
  return { ok: true, collected, checked };
}
