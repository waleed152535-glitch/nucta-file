/**
 * Gathers a return's documents for viewing and download. Server only.
 *
 * Parts already sent and accepted — by HMRC for real, or by the test
 * service — are read back from the submission stored at the time, so the
 * documents are exactly what HMRC received. Anything else is built afresh
 * from the figures as they stand.
 */

import { getReturn, type LoadedReturn } from "./return-actions";
import { prepareReturn } from "./filing";
import { toCompanyReturnInput, type SentRecord } from "./return-model";

export interface PartDocs {
  n: number;
  from: string;
  to: string;
  computationHtml: string | null;
  /** The CompanyTaxReturn XML, attachments included. */
  ct600Xml: string | null;
  /** The whole submission as sent, password removed — only for a part that has been sent. */
  envelope: string | null;
  sent: SentRecord | null;
  /** Where the documents came from. */
  source: "filed" | "tested" | "current";
  tax: number;
  loansTax: number;
  due: string;
}

export interface ReturnDocs {
  ok: boolean;
  error?: string;
  company: { name: string; companyNo: string };
  periodFrom: string;
  periodTo: string;
  director: string;
  preparedBy: string;
  accountsHtml: string | null;
  parts: PartDocs[];
  filingDue: string;
  amended: boolean;
  /** Dormant, and whether HMRC need a return at all (they do only once they've sent a notice). */
  dormant: { returnNeeded: boolean } | null;
}

const pick = (env: string, tag: "Computation" | "Accounts") =>
  (env.match(new RegExp(`<${tag}>\\s*<Instance>\\s*<InlineXBRLDocument>\\s*([\\s\\S]*?)\\s*</InlineXBRLDocument>`)) ?? [])[1] ?? null;

export async function returnDocuments(id: string): Promise<ReturnDocs> {
  return returnDocumentsFor(id, await getReturn(id));
}

/**
 * The same, for a return already loaded and checked by the caller: the
 * director's approval link loads it by the link's token rather than by a
 * signed-in user (lib/approval-core.ts).
 */
export async function returnDocumentsFor(id: string, r: LoadedReturn): Promise<ReturnDocs> {
  const blank: ReturnDocs = { ok: false, company: { name: "", companyNo: "" }, periodFrom: "", periodTo: "", director: "", preparedBy: "", accountsHtml: null, parts: [], filingDue: "", amended: false, dormant: null };
  if (!r.ok || !r.data || !r.company) return { ...blank, error: r.error ?? "That return isn't in Nucta File." };
  const data = r.data;
  const p = prepareReturn(toCompanyReturnInput(r.company, r.periodStart!, r.periodEnd!, data));

  // Submissions accepted for this return, to read back what was sent.
  const { db } = await import("./db");
  const schema = await import("./schema");
  const { eq } = await import("drizzle-orm");
  const subs = await db.select({ correlationId: schema.submissions.correlationId, envelope: schema.submissions.envelope, outcome: schema.submissions.outcome, test: schema.submissions.gatewayTest, cls: schema.submissions.messageClass })
    .from(schema.submissions).where(eq(schema.submissions.returnId, id));

  let accountsHtml = p.accountsHtml;
  const parts: PartDocs[] = (p.parts.length ? p.parts : []).map((pp, n) => {
    const sent = data.sent?.[String(n)] ?? null;
    const sub = sent?.correlationId ? subs.find((s) => s.correlationId === sent.correlationId && s.outcome === "accepted" && !String(s.cls).endsWith("-TIL") && s.envelope) : undefined;
    const env = sub?.envelope ?? null;
    const source: PartDocs["source"] = env ? (sent?.status === "accepted" ? "filed" : "tested") : "current";
    if (env && pick(env, "Accounts")) accountsHtml = pick(env, "Accounts");
    return {
      n, from: pp.periodFrom, to: pp.periodTo,
      computationHtml: env ? pick(env, "Computation") : pp.computationHtml,
      ct600Xml: env ? (env.match(/<CompanyTaxReturn\b[\s\S]*<\/CompanyTaxReturn>/) ?? [])[0] ?? null : pp.ct600,
      envelope: env, sent, source,
      tax: pp.computation.taxChargeable, loansTax: pp.loans?.a80 ?? 0, due: pp.taxDue,
    };
  });
  if (!parts.length) return { ...blank, error: p.problems.join(" ") || "The return can't be built yet." };
  return {
    ok: true, company: { name: r.company.name, companyNo: r.company.companyNo ?? "" },
    periodFrom: r.periodStart!, periodTo: r.periodEnd!, director: data.director,
    preparedBy: data.declarantStatus === "Agent" ? data.declarantName || "the agent" : "the company",
    accountsHtml, parts, filingDue: p.filingDue, amended: Boolean(data.amends),
    dormant: data.dormant ? { returnNeeded: data.ctNoticeReceived !== false } : null,
  };
}
