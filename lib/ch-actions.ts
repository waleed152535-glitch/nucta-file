"use server";

import { randomUUID } from "crypto";
import { buildAccounts } from "./ixbrl";
import { accountsFromFigures } from "./accounts-from-figures";
import { taxProblems, type Ct600Input } from "./ct600-xml";
import {
  chPresenter, companyNumberProblem, authCodeProblem, formHeaderProblems, nextTransactionId, newSubmissionNumber,
  buildChAccountsEnvelope, buildChStatusEnvelope, buildChAckEnvelope, redactCh, parseChReply,
  postToCompaniesHouse, ixbrlForCompaniesHouse, chErrorHelp, CH_MAX_DATA_CHARS, type ChPresenter, type ChReply, type ChStatus,
} from "./companies-house";

/** One gateway error as a line for the screen: the number, Companies House's text, and what it means. */
const errLine = (e: { number: string; text: string }): string => {
  const help = chErrorHelp(e.number);
  return `${e.number ? `${e.number}: ` : ""}${e.text || "(no text given)"}${help ? ` — ${help}` : ""}`;
};

/** What the Companies House console asks for. */
export interface ChFormInput {
  companyName: string;
  companyNo: string;
  /** The company's 6-character Companies House authentication code. */
  companyAuthCode: string;
  periodFrom: string;
  periodTo: string;
  turnover: number;
  tradingProfits: number;
  rate: number;
  corporationTax: number;
  marginalRelief: number;
  taxPayable: number;
  associatedCompanies: number;
  /** The director who approves and signs the accounts. */
  director: string;
  /** The date the board approved them. */
  approvedOn: string;
  contactName: string;
  contactNumber: string;
}

/** How the log labels these, so they sit apart from the HMRC returns. */
const LOG_CLASS = "CH-Accounts";

const isDate = (v: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

/** The financial year a period starts in: April to March, named for the April. */
const financialYearOf = (from: string): number => {
  const d = new Date(from);
  return d.getUTCMonth() >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
};

function check(f: ChFormInput): { problems: string[]; warnings: string[] } {
  const problems: string[] = [];
  const warnings: string[] = [];
  if (!f.companyName.trim()) problems.push("Company name is missing.");
  const np = companyNumberProblem(f.companyNo); if (np) problems.push(np);
  const ap = authCodeProblem(f.companyAuthCode); if (ap) problems.push(ap);
  if (!isDate(f.periodFrom) || !isDate(f.periodTo)) problems.push("Both period dates are needed.");
  else if (f.periodFrom >= f.periodTo) problems.push("The period end must be after the period start.");
  if (!f.director.trim()) problems.push("The accounts need the name of the director approving them.");
  if (!isDate(f.approvedOn)) problems.push("The accounts need the date the board approved them.");
  else if (isDate(f.periodTo) && f.approvedOn <= f.periodTo) {
    problems.push("Accounts are approved after the year has ended, so the approval date must be later than the period end.");
  }
  if (!f.contactName.trim() || !f.contactNumber.trim()) {
    problems.push("A contact name and phone number are needed; Companies House show them against the filing.");
  }
  problems.push(...formHeaderProblems(f));
  // The same arithmetic guard as the tax return: these figures become the
  // company's public accounts, so a wrong tax charge is a wrong balance sheet.
  if (isDate(f.periodFrom) && isDate(f.periodTo)) {
    const asReturn = {
      tradingProfits: f.tradingProfits, rate: f.rate, corporationTax: f.corporationTax,
      marginalRelief: f.marginalRelief, taxPayable: f.taxPayable, financialYear: financialYearOf(f.periodFrom),
      periodFrom: f.periodFrom, periodTo: f.periodTo, associatedCompanies: f.associatedCompanies,
    } as Ct600Input;
    problems.push(...taxProblems(asReturn));
  }
  if (f.turnover === 0 && f.tradingProfits === 0) warnings.push("Turnover and profit are both zero, so these will be filed as dormant accounts.");
  return { problems, warnings };
}

function accountsFor(f: ChFormInput): string {
  return buildAccounts(accountsFromFigures({
    companyName: f.companyName,
    companyNo: f.companyNo.trim().toUpperCase(),
    periodFrom: f.periodFrom,
    periodTo: f.periodTo,
    turnover: f.turnover,
    tradingProfits: f.tradingProfits,
    corporationTax: f.corporationTax,
    marginalRelief: f.marginalRelief,
    taxPayable: f.taxPayable,
    approvedBy: f.director,
    approvedOn: f.approvedOn,
  }));
}

/** The envelope with the long Base64 accounts shortened, for showing on screen. */
const forScreen = (envelope: string): string =>
  redactCh(envelope).replace(/(<Data>)([A-Za-z0-9+/=]{80})[A-Za-z0-9+/=]+(<\/Data>)/,
    (_m, a, start, b) => `${a}${start}… (the accounts, Base64 encoded)${b}`);

export interface ChPreview {
  ok: boolean;
  problems: string[];
  warnings: string[];
  envelope: string | null;
  accounts: string | null;
  presenterReady: boolean;
}

export async function previewChAccounts(f: ChFormInput): Promise<ChPreview> {
  const { problems, warnings } = check(f);
  const { presenter } = chPresenter();
  if (problems.length) return { ok: false, problems, warnings, envelope: null, accounts: null, presenterReady: Boolean(presenter) };
  const accounts = ixbrlForCompaniesHouse(accountsFor(f));
  // Without credentials yet, show the envelope with stand-in values; they're
  // blanked on screen either way.
  const p: ChPresenter = presenter ?? { presenterId: "TESTPRESENTER", authCode: "TESTAUTH", email: "you@example.com", packageReference: "0012", test: true };
  const envelope = buildChAccountsEnvelope(p, {
    companyNumber: f.companyNo, companyName: f.companyName, companyAuthCode: f.companyAuthCode,
    contactName: f.contactName, contactNumber: f.contactNumber, dateSigned: f.approvedOn,
    submissionNumber: newSubmissionNumber(), transactionId: nextTransactionId(), ixbrl: accounts,
  });
  if (!presenter) warnings.push("Companies House credentials aren't set yet, so this preview uses stand-in values for them.");
  return { ok: true, problems: [], warnings, envelope: forScreen(envelope), accounts, presenterReady: Boolean(presenter) };
}

export interface ChAttempt {
  ok: boolean;
  outcome: "received" | "rejected" | "error" | "blocked";
  headline: string;
  detail: string[];
  submissionNumber: string | null;
  timestamp: string | null;
  envelope: string | null;
  reply: string | null;
  recorded: boolean;
}

/** Every SubmissionNumber already used, so a number is never sent twice (TIS 2.1.3). */
async function usedNumbers(): Promise<Set<string> | null> {
  try {
    const { db } = await import("./db");
    const { submissions } = await import("./schema");
    const { eq } = await import("drizzle-orm");
    const rows = await db.select({ n: submissions.correlationId }).from(submissions).where(eq(submissions.messageClass, LOG_CLASS));
    return new Set(rows.map((r) => r.n ?? "").filter(Boolean));
  } catch {
    return null;
  }
}

export async function sendChAccounts(f: ChFormInput): Promise<ChAttempt> {
  const blocked = (headline: string, detail: string[]): ChAttempt =>
    ({ ok: false, outcome: "blocked", headline, detail, submissionNumber: null, timestamp: null, envelope: null, reply: null, recorded: false });

  const { problems } = check(f);
  if (problems.length) return blocked("The accounts aren't ready to send.", problems);
  const { presenter, missing } = chPresenter();
  if (!presenter) return blocked("The Companies House credentials aren't set up yet.", missing);

  const used = await usedNumbers();
  let submissionNumber = newSubmissionNumber();
  while (used?.has(submissionNumber)) {
    await new Promise((r) => setTimeout(r, 1100));
    submissionNumber = newSubmissionNumber();
  }
  const accounts = ixbrlForCompaniesHouse(accountsFor(f));
  const envelope = buildChAccountsEnvelope(presenter, {
    companyNumber: f.companyNo, companyName: f.companyName, companyAuthCode: f.companyAuthCode,
    contactName: f.contactName, contactNumber: f.contactNumber, dateSigned: f.approvedOn,
    submissionNumber, transactionId: nextTransactionId(), ixbrl: accounts,
  });
  const data = envelope.match(/<Data>([\s\S]*?)<\/Data>/)?.[1] ?? "";
  if (data.length > CH_MAX_DATA_CHARS) {
    return blocked("The accounts are too large for Companies House.", [`They come to ${data.length.toLocaleString("en-GB")} characters once encoded; the limit is 1.2 million.`]);
  }

  let res: { status: number; text: string };
  try {
    res = await postToCompaniesHouse(envelope);
  } catch (e) {
    return { ...blocked("Couldn't reach Companies House.", [String((e as Error)?.message ?? e).slice(0, 300)]), outcome: "error", submissionNumber };
  }
  const reply = parseChReply(res.text);
  const failed = reply.errors.filter((e) => e.type !== "warning");
  const outcome: ChAttempt["outcome"] = res.status < 200 || res.status >= 300 ? "error" : failed.length ? "rejected" : "received";

  const attempt: ChAttempt = {
    ok: outcome === "received",
    outcome,
    headline: outcome === "received"
      ? "Received by Companies House. They now examine the accounts, usually within a day; check the status to see the result."
      : outcome === "rejected"
        ? "Companies House refused the submission. It has not been delivered."
        : `Companies House replied with HTTP ${res.status}.`,
    detail: [
      ...failed.map(errLine),
      ...reply.errors.filter((e) => e.type === "warning").map((e) => `Warning: ${e.text}`),
      ...(outcome === "received" && reply.timestamp ? [`Received at ${reply.timestamp} — the legal receipt time.`] : []),
    ],
    submissionNumber,
    timestamp: reply.timestamp,
    envelope: forScreen(envelope),
    reply: res.text,
    recorded: false,
  };
  attempt.recorded = await recordSend(f, attempt, redactCh(envelope), res, reply);
  if (!attempt.recorded) attempt.detail.push("This attempt couldn't be saved to the submission log. Note the submission number above.");
  return attempt;
}

async function recordSend(f: ChFormInput, a: ChAttempt, envelope: string, res: { status: number; text: string }, reply: ChReply): Promise<boolean> {
  try {
    const { db } = await import("./db");
    const { submissions, submissionSteps } = await import("./schema");
    const id = randomUUID();
    await db.insert(submissions).values({
      id,
      returnId: f.companyNo.trim().toUpperCase(),
      gatewayTest: true,
      messageClass: LOG_CLASS,
      outcome: a.outcome,
      correlationId: a.submissionNumber,
      irmark: null,
      receipt: reply.timestamp,
      envelope,
      errors: reply.errors.map((e) => ({ type: e.type, number: e.number || null, text: e.text, location: null })),
      finishedAt: new Date(),
    });
    await db.insert(submissionSteps).values({ id: randomUUID(), submissionId: id, stage: "submit", qualifier: reply.qualifier, httpStatus: res.status, raw: res.text });
    return true;
  } catch {
    return false;
  }
}

export interface ChPoll {
  ok: boolean;
  headline: string;
  detail: string[];
  statuses: ChStatus[];
  acknowledged: boolean;
  reply: string | null;
}

const OUTCOME: Record<string, string> = { ACCEPT: "accepted", REJECT: "rejected", PENDING: "pending", PARKED: "parked", INTERNAL_FAILURE: "failed" };

/**
 * Asks Companies House for results.
 *
 * With a submission number, that one submission. Without one, every result
 * not yet collected — which then has to be acknowledged straight away
 * (TIS 2.5.1), or the same results come back on the next poll.
 */
export async function checkChStatus(submissionNumber?: string): Promise<ChPoll> {
  const { presenter, missing } = chPresenter();
  if (!presenter) return { ok: false, headline: "The Companies House credentials aren't set up yet.", detail: missing, statuses: [], acknowledged: false, reply: null };
  const sn = submissionNumber?.trim().toUpperCase() || undefined;

  let res: { status: number; text: string };
  try {
    res = await postToCompaniesHouse(buildChStatusEnvelope(presenter, nextTransactionId(), sn));
  } catch (e) {
    return { ok: false, headline: "Couldn't reach Companies House.", detail: [String((e as Error)?.message ?? e).slice(0, 300)], statuses: [], acknowledged: false, reply: null };
  }
  const reply = parseChReply(res.text);
  const failed = reply.errors.filter((e) => e.type !== "warning");
  if (failed.length || res.status < 200 || res.status >= 300) {
    return { ok: false, headline: "Companies House refused the status request.", detail: failed.map(errLine), statuses: reply.statuses, acknowledged: false, reply: res.text };
  }

  await recordPoll(reply.statuses, res);

  let acknowledged = false;
  if (!sn && reply.statuses.some((s) => s.submissionNumber)) {
    try {
      const ack = await postToCompaniesHouse(buildChAckEnvelope(presenter, nextTransactionId()));
      acknowledged = ack.status >= 200 && ack.status < 300 && parseChReply(ack.text).errors.filter((e) => e.type !== "warning").length === 0;
    } catch {
      acknowledged = false;
    }
  }

  const found = reply.statuses.filter((s) => s.submissionNumber);
  // TIS 2.5: an unknown number comes back as "No Transaction Found".
  const notFound = reply.statuses.some((s) => s.reasons.some((r) => /no transaction found/i.test(r)));
  const one = sn ? found.find((s) => s.submissionNumber === sn) : undefined;
  const headline = sn
    ? notFound || !one
      ? `Companies House have no record of submission ${sn}. Results are kept for 90 days after examination finishes.`
      : `Submission ${sn}: ${one.meaning || one.statusCode}`
    : found.length ? `${found.length} result${found.length === 1 ? "" : "s"} from Companies House.` : "Nothing new from Companies House yet.";
  return {
    ok: true,
    headline,
    detail: [
      ...(one?.statusCode === "PENDING" && presenter.test
        ? ["In testing, Companies House staff often check submissions with attachments, such as accounts, by hand, so a result can take a while."]
        : []),
      ...(!sn && !found.length
        ? ["Collecting all results only shows submissions Companies House have finished with. To see one that's still being examined, check it by its number."]
        : []),
      ...(!sn && found.length && !acknowledged ? ["The results couldn't be acknowledged, so they'll be sent again next time. That's harmless."] : []),
    ],
    statuses: reply.statuses,
    acknowledged,
    reply: res.text,
  };
}

async function recordPoll(statuses: ChStatus[], res: { status: number; text: string }): Promise<void> {
  try {
    const { db } = await import("./db");
    const { submissions, submissionSteps } = await import("./schema");
    const { and, eq } = await import("drizzle-orm");
    for (const s of statuses) {
      if (!s.submissionNumber) continue;
      // The reply may prefix the number (e.g. with the presenter); match on the end.
      const sn = s.submissionNumber.split("-").pop()!.toUpperCase();
      const rows = await db.select({ id: submissions.id }).from(submissions)
        .where(and(eq(submissions.messageClass, LOG_CLASS), eq(submissions.correlationId, sn)));
      for (const r of rows) {
        await db.update(submissions).set({ outcome: OUTCOME[s.statusCode] ?? s.statusCode.toLowerCase() }).where(eq(submissions.id, r.id));
        await db.insert(submissionSteps).values({ id: randomUUID(), submissionId: r.id, stage: "poll", qualifier: s.statusCode, httpStatus: res.status, raw: res.text });
      }
    }
  } catch {
    // The log is a record, not a dependency: a failure to save it mustn't hide the answer.
  }
}
