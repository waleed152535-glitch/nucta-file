"use server";

import { randomUUID } from "crypto";
import { buildCt600, buildEnvelope, checkCt600, markWasCanonical, type Ct600Input } from "./ct600-xml";
import { buildAccounts, buildComputation, type AccountsInput } from "./ixbrl";
import { submitAndWait, explain, type RunResult } from "./govtalk";
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
}

function toCt600(f: TestFormInput): Ct600Input {
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
  const input = toCt600(f);
  const check = checkCt600(input);
  if (!check.ok) {
    return {
      ok: false, problems: check.problems, warnings: check.warnings,
      envelope: null, irmark: null, canonical: false, accounts: null, computation: null,
    };
  }

  const body = buildCt600(input);
  const envelope = buildEnvelope({
    messageClass: messageClass(f.mode),
    senderId: process.env.HMRC_SENDER_ID ?? "CTUser100",
    vendorId: process.env.HMRC_VENDOR_ID ?? "9754",
    body,
    utr: f.utr,
    periodEnd: f.periodTo,
    test: f.mode === "test",
  });

  const mark = (envelope.match(/<IRmark[^>]*>([\s\S]*?)<\/IRmark>/) ?? [])[1] ?? null;
  const acc = toAccounts(f);

  return {
    ok: true,
    problems: [],
    warnings: check.warnings,
    envelope: redact(envelope),
    irmark: mark,
    canonical: markWasCanonical(),
    accounts: f.attachAccounts ? buildAccounts(acc) : null,
    computation: f.attachAccounts
      ? buildComputation({ ...acc, taxRate: f.rate, taxPayable: f.taxPayable })
      : null,
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
  const input = toCt600(f);
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

  const body = buildCt600(input);
  const envelope = buildEnvelope({
    messageClass: messageClass(f.mode),
    senderId: config.senderId,
    vendorId: config.vendorId,
    body,
    utr: f.utr,
    periodEnd: f.periodTo,
    test: f.mode === "test",
    productName: config.productName,
    productVersion: config.productVersion,
    email: config.email,
  });

  const mark = (envelope.match(/<IRmark[^>]*>([\s\S]*?)<\/IRmark>/) ?? [])[1] ?? null;

  let run: RunResult;
  try {
    run = await submitAndWait(config, envelope, { maxWaitSeconds: 60 });
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
    messageClass: messageClass(f.mode),
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
