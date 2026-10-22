/**
 * The approval pack: a page for the director to sign, then the accounts, each
 * computation and each CT600, as one PDF. Used by the signed-in download and
 * by the director's approval link.
 */
import { makePdf, htmlToBlocks, type PdfDoc } from "./pdf";
import { ct600Blocks, approvalBlocks, longDate } from "./documents";
import type { ReturnDocs } from "./return-docs";

export async function approvalPackPdf(d: ReturnDocs): Promise<Uint8Array> {
  const period = (p: { from: string; to: string }) => `${longDate(p.from)} to ${longDate(p.to)}`;
  const label = (p: ReturnDocs["parts"][number]) => p.source === "filed" ? "As filed with HMRC" : p.source === "tested" ? "As accepted by HMRC's test service" : "Not yet filed — as it would be sent now";
  const docs: PdfDoc[] = [
    { footer: `${d.company.name} · for approval`, blocks: approvalBlocks({
      company: d.company.name, companyNo: d.company.companyNo, periodFrom: d.periodFrom, periodTo: d.periodTo, director: d.director,
      parts: d.parts.map((p) => ({ from: p.from, to: p.to, tax: p.tax, loansTax: p.loansTax, due: p.due })), filingDue: d.filingDue, preparedBy: d.preparedBy,
      ...(d.dormant ? { dormant: d.dormant } : {}),
    }), font: "sans" },
  ];
  if (d.accountsHtml) docs.push({ footer: `${d.company.name} · accounts to ${longDate(d.periodTo)}`, blocks: htmlToBlocks(d.accountsHtml) });
  for (const p of d.parts) {
    if (p.computationHtml) docs.push({ footer: `${d.company.name} · Corporation Tax computation, ${period(p)}`, blocks: htmlToBlocks(p.computationHtml) });
    if (p.ct600Xml && (!d.dormant || d.dormant.returnNeeded)) docs.push({ footer: `${d.company.name} · CT600, ${period(p)}`, blocks: ct600Blocks(p.ct600Xml, { company: `${d.company.name} · company ${d.company.companyNo}`, period: period(p), status: label(p) }), font: "sans" });
  }
  return makePdf(docs, { title: `${d.company.name} — accounts and tax return for approval` });
}
