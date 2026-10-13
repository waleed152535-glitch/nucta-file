"use server";

import { randomUUID } from "crypto";
import { buildCt600, buildEnvelope, checkCt600, markWasCanonical, type Ct600Input, type MarkMethod } from "./ct600-xml";
import { buildAccounts, buildComputation, type AccountsInput } from "./ixbrl";
import { submitAndWait, poll, remove, explain, type RunResult } from "./govtalk";
import { gatewayConfig, messageClass, redact, type Mode } from "./hmrc";

/**
 * Everything the gateway console needs back after an attempt.
 *
 * The envelope comes back redacted so the password never appears on a screen
 * or in a browser's network tab, and each exchange is returned whole so a
 * rejection can be read in HMRC's own words.
 */
export interface AttemptResult {
  ok: boolean;
  outcome: "accepted" | "rejected" | "timeout" | "error" | "blocked";
  /** What to tell the user, in plain English. */
  headline: string;
  detail: string[];
  irmark: string | null;
  /** False means the IRmark fell back to text digesting, which HMRC will refuse. */
  canonical: boolean;
  correlationId: string | null;
  receipt: string | null;
  envelope: string | null;
  steps: { stage: string; at: string; qualifier: string; httpStatus: number; raw: string }[];
}

export interface TestFormInput {
  mode: Mode;
  companyName: string;
  companyNo: string;
  utr: string;
  periodFrom: string;
  periodTo: string;
  turnover: number;
  tradingProfits: number;
  corporationTax: number;
  taxPayable: number;
  rate: number;
  financialYear: number;
  declarantName: string;
  declarantStatus: string;
  attachAccounts: boolean;
  /** Which reading of the IRmark spec to use. */
  markMethod: MarkMethod;
  /** Send as "Test in Live" instead: the live endpoint, with a -TIL class. */
  testInLive: boolean;
}

function toCt600(f: TestFormInput, docs?: { accounts: string; computation: string }): Ct600Input {
  return {
    companyName: f.companyName,
    companyNo: f.companyNo,
    utr: f.utr,
    periodFrom: f.periodFrom,
    periodTo: f.periodTo,
    turnover: f.turnover,
    tradingProfits: f.tradingProfits,
    corporationTax: f.corporationTax,
    taxPayable: f.taxPayable,
    rate: f.rate,
    financialYear: f.financialYear,
    smallProfitsRate: f.rate <= 19,
    declarantName: f.declarantName,
    declarantStatus: f.declarantStatus,
    accountsAttached: f.attachAccounts,
    computationsAttached: f.attachAccounts,
    accountsIxbrl: docs?.accounts,
    computationIxbrl: docs?.computation,
  };
}

/** Builds the two iXBRL documents that travel inside the return. */
function buildDocs(f: TestFormInput): { accounts: string; computation: string } {
  const acc = toAccounts(f);
  return {
    accounts: buildAccounts(acc),
    computation: buildComputation({ ...acc, taxRate: f.rate, taxPayable: f.taxPayable }),
  };
}

/**
 * Turns the console's handful of figures into a full set of accounts.
 *
 * The console deliberately asks for very little — the point is to test the
 * wire, not to prepare a real year end — so the rest of the balance sheet is
 * derived to something internally consistent: the only asset is the cash the
 * profit left behind, and the only creditor is the tax still owed.
 */
function toAccounts(f: TestFormInput): AccountsInput {
  const profit = f.tradingProfits;
  const retained = profit - f.corporationTax;
  return {
    companyName: f.companyName,
    companyNo: f.companyNo,
    periodFrom: f.periodFrom,
    periodTo: f.periodTo,
    dormant: f.turnover === 0 && profit === 0,

    turnover: f.turnover,
    costOfSales: Math.max(0, f.turnover - profit),
    grossProfit: profit,
    adminExpenses: 0,
    staffCosts: 0,
    otherIncome: 0,
    profitBeforeTax: profit,
    taxCharge: f.corporationTax,

    shareCapitalNotPaid: 0,
    fixedAssets: 0,
    currentAssets: Math.max(0, retained + f.taxPayable + 1),
    prepayments: 0,
    creditorsWithin: f.taxPayable,
    creditorsAfter: 0,
    provisions: 0,
    accruals: 0,
    shareCapital: 1,
    employees: 1,

    approvedBy: f.declarantName,
    approvedOn: f.periodTo,
  };
}

/** Builds the envelope without sending it, so the XML can be read first. */
export async function previewEnvelope(f: TestFormInput): Promise<{
  ok: boolean; problems: string[]; warnings: string[];
  envelope: string | null; irmark: string | null; canonical: boolean;
  accounts: string | null; computation: string | null;
}> {
  const docs = f.attachAccounts ? buildDocs(f) : undefined;
  const input = toCt600(f, docs);
  const check = checkCt600(input);
  if (!check.ok) {
    return {
      ok: false, problems: check.problems, warnings: check.warnings,
      envelope: null, irmark: null, canonical: false, accounts: null, computation: null,
    };
  }

  let envelope: string;
  try {
    envelope = buildEnvelope({
      messageClass: messageClass(f.mode, f.testInLive),
      senderId: process.env.HMRC_SENDER_ID ?? "CTUser100",
      vendorId: process.env.HMRC_VENDOR_ID ?? "9754",
      body: buildCt600(input),
      utr: f.utr,
      periodEnd: f.periodTo,
      test: f.mode === "test",
      markMethod: f.markMethod,
    });
  } catch (e) {
    return {
      ok: false,
      problems: [`Couldn't build the submission: ${String((e as Error)?.message ?? e).slice(0, 200)}`],
      warnings: [], envelope: null, irmark: null, canonical: false, accounts: null, computation: null,
    };
  }

  const mark = (envelope.match(/<IRmark[^>]*>([\s\S]*?)<\/IRmark>/) ?? [])[1] ?? null;

  return {
    ok: true,
    problems: [],
    warnings: check.warnings,
    envelope: redact(envelope),
    irmark: mark,
    canonical: markWasCanonical(),
    accounts: docs?.accounts ?? null,
    computation: docs?.computation ?? null,
  };
}

/**
 * Sends a return to HMRC and waits for the verdict.
 *
 * This is the moment of truth for the IRmark. If the digest or the
 * canonicalisation is wrong, HMRC refuses the message and says so, and the
 * transcript shows exactly what they said.
 */
export async function runSubmission(f: TestFormInput): Promise<AttemptResult> {
  const input = toCt600(f, f.attachAccounts ? buildDocs(f) : undefined);
  const check = checkCt600(input);
  if (!check.ok) {
    return {
      ok: false, outcome: "blocked",
      headline: "The return isn't ready to send.",
      detail: check.problems,
      irmark: null, canonical: false, correlationId: null, receipt: null, envelope: null, steps: [],
    };
  }

  const { config, missing } = gatewayConfig(f.mode);
  if (!config) {
    return {
      ok: false, outcome: "blocked",
      headline: "The gateway credentials aren't set up yet.",
      detail: missing,
      irmark: null, canonical: false, correlationId: null, receipt: null, envelope: null, steps: [],
    };
  }

  const cls = messageClass(f.mode, f.testInLive);
  let envelope: string;
  try {
    envelope = buildEnvelope({
      messageClass: cls,
      senderId: config.senderId,
      vendorId: config.vendorId,
      body: buildCt600(input),
      utr: f.utr,
      periodEnd: f.periodTo,
      test: f.mode === "test",
      productName: config.productName,
      productVersion: config.productVersion,
      email: config.email,
      markMethod: f.markMethod,
    });
  } catch (e) {
    return {
      ok: false, outcome: "error",
      headline: "Couldn't build the submission.",
      detail: [String((e as Error)?.message ?? e).slice(0, 300)],
      irmark: null, canonical: false, correlationId: null, receipt: null, envelope: null, steps: [],
    };
  }

  const mark = (envelope.match(/<IRmark[^>]*>([\s\S]*?)<\/IRmark>/) ?? [])[1] ?? null;

  let run: RunResult;
  try {
    run = await submitAndWait({ ...config, messageClass: cls }, envelope, { maxWaitSeconds: 40 });
  } catch (e) {
    return {
      ok: false, outcome: "error",
      headline: "Couldn't complete the exchange with HMRC.",
      detail: [String((e as Error)?.message ?? e).slice(0, 300)],
      irmark: mark, canonical: markWasCanonical(), correlationId: null, receipt: null, envelope: redact(envelope), steps: [],
    };
  }

  const detail = run.errors.length > 0
    ? run.errors.map(explain)
    : run.outcome === "accepted"
      ? ["HMRC accepted the return and issued a receipt."]
      : run.outcome === "timeout"
        ? ["HMRC is still processing. The correlation ID below can be polled again."]
        : [];

  const headline =
    run.outcome === "accepted" ? "Accepted by HMRC."
      : run.outcome === "rejected" ? "HMRC rejected the submission."
        : run.outcome === "timeout" ? "Still processing at HMRC."
          : "The submission failed before HMRC could answer.";

  const result: AttemptResult = {
    ok: run.outcome === "accepted",
    outcome: run.outcome,
    headline,
    detail,
    irmark: mark,
    canonical: markWasCanonical(),
    correlationId: run.correlationId,
    receipt: run.receipt,
    envelope: redact(envelope),
    steps: run.steps,
  };

  // Keeping the record is best effort — a database that isn't migrated yet
  // must not cost the user the result they were waiting for.
  try {
    await record(f, result, run);
  } catch {
    /* deliberately ignored */
  }

  return result;
}

async function record(f: TestFormInput, r: AttemptResult, run: RunResult): Promise<void> {
  const { db } = await import("./db");
  const { submissions, submissionSteps } = await import("./schema");
  const sid = randomUUID();

  await db.insert(submissions).values({
    id: sid,
    returnId: f.utr,          // console attempts are keyed on the UTR used
    gatewayTest: f.mode === "test",
    messageClass: messageClass(f.mode, f.testInLive),
    outcome: run.outcome,
    correlationId: run.correlationId,
    irmark: r.irmark,
    receipt: run.receipt,
    envelope: r.envelope,
    errors: run.errors,
    finishedAt: new Date(),
  });

  if (run.steps.length > 0) {
    await db.insert(submissionSteps).values(
      run.steps.map((s) => ({
        id: randomUUID(),
        submissionId: sid,
        stage: s.stage,
        qualifier: s.qualifier,
        httpStatus: s.httpStatus,
        raw: s.raw,
      })),
    );
  }
}

/**
 * Asks HMRC again about a submission already sent.
 *
 * A Company Tax Return isn't processed instantly, and a web request can't sit
 * waiting indefinitely — the host cuts it off after a minute. So the first
 * attempt waits as long as it safely can, and after that the correlation ID
 * is used to ask again. This is one exchange, not a loop, so it returns at
 * once however long HMRC are taking.
 *
 * When HMRC have finished, the message is cleared from their queue in the
 * same call, which they ask developers to do.
 */
export async function pollAgain(
  correlationId: string,
  mode: Mode = "test",
  testInLive = false,
): Promise<AttemptResult> {
  const { config, missing } = gatewayConfig(mode);
  if (!config) {
    return {
      ok: false, outcome: "blocked",
      headline: "The gateway credentials aren't set up yet.",
      detail: missing,
      irmark: null, canonical: false, correlationId, receipt: null, envelope: null, steps: [],
    };
  }

  const cls = messageClass(mode, testInLive);
  const steps: AttemptResult["steps"] = [];
  const withClass = { ...config, messageClass: cls };

  let r;
  try {
    r = await poll(withClass, correlationId);
  } catch (e) {
    return {
      ok: false, outcome: "error",
      headline: "Couldn't reach HMRC to ask again.",
      detail: [String((e as Error)?.message ?? e).slice(0, 300)],
      irmark: null, canonical: false, correlationId, receipt: null, envelope: null, steps,
    };
  }
  steps.push({ stage: "poll", at: new Date().toISOString(), qualifier: r.qualifier, httpStatus: r.httpStatus, raw: r.raw });

  const stillGoing = r.qualifier === "acknowledgement" && r.errors.length === 0;
  const rejected = r.qualifier === "error" || r.errors.length > 0;

  // Tidy up once HMRC have given a verdict either way.
  if (!stillGoing) {
    try {
      const d = await remove(withClass, correlationId, r.pollEndpoint ?? undefined);
      steps.push({ stage: "delete", at: new Date().toISOString(), qualifier: d.qualifier, httpStatus: d.httpStatus, raw: d.raw });
    } catch {
      /* a failed tidy-up doesn't change the filing's outcome */
    }
  }

  const outcome = stillGoing ? "timeout" : rejected ? "rejected" : "accepted";

  return {
    ok: outcome === "accepted",
    outcome,
    headline:
      outcome === "accepted" ? "Accepted by HMRC."
        : outcome === "rejected" ? "HMRC rejected the submission."
          : "Still processing at HMRC.",
    detail: rejected
      ? r.errors.map(explain)
      : outcome === "accepted"
        ? ["HMRC have finished and issued a receipt. The message has been cleared from their queue."]
        : ["HMRC are still working on it. Wait a few seconds and ask again."],
    irmark: null,
    canonical: true,
    correlationId,
    receipt: r.receipt,
    envelope: null,
    steps,
  };
}
