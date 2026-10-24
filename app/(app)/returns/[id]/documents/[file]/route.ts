import { returnDocuments } from "@/lib/return-docs";
import { makePdf, htmlToBlocks, blocksToHtml, type PdfDoc } from "@/lib/pdf";
import { ct600Blocks, receiptBlocks, longDate } from "@/lib/documents";
import { approvalPackPdf } from "@/lib/approval-pack";
import { companiesHouseCopy } from "@/lib/accounts/ch-form";

export const dynamic = "force-dynamic";

/**
 * A return's documents: /returns/<id>/documents/<name>
 *
 *   accounts.html | .pdf | .xhtml          the accounts (iXBRL)
 *   accounts-ch.html | .pdf                the Companies House copy: balance sheet and notes
 *   computation-1.html | .pdf | .xhtml     each period's computation (iXBRL)
 *   ct600-1.html | .pdf | .xml             each CT600: box by box, or the XML
 *   submission-1.xml                       what was sent to HMRC, password removed
 *   receipt-1.pdf                          HMRC's receipt for a filed return
 *   approval-pack.pdf                      everything, with a page for the director to sign
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string; file: string }> }) {
  const { id, file } = await ctx.params;
  const m = file.match(/^(accounts-ch|accounts|computation-(\d)|ct600-(\d)|submission-(\d)|receipt-(\d)|approval-pack)\.(html|pdf|xhtml|xml)$/);
  if (!m) return new Response("Not found", { status: 404 });
  const d = await returnDocuments(id);
  if (!d.ok) return new Response(d.error ?? "Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });

  const kind = m[1].replace(/-\d$/, ""), ext = m[6];
  const n = Number(m[2] ?? m[3] ?? m[4] ?? m[5] ?? 1) - 1;
  const part = d.parts[n];
  const slug = d.company.name.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const period = (p: { from: string; to: string }) => `${longDate(p.from)} to ${longDate(p.to)}`;
  const label = (p: typeof part) => p.source === "filed" ? "As filed with HMRC" : p.source === "tested" ? "As accepted by HMRC's test service" : "Not yet filed — as it would be sent now";
  const many = d.parts.length > 1;
  const name = (what: string, x: string) => `${slug}-${what}-${d.periodTo}.${x}`;

  const send = (body: string | Uint8Array, type: string, download?: string) => new Response(body as BodyInit, {
    headers: { "Content-Type": type, "Cache-Control": "private, no-store", ...(download ? { "Content-Disposition": `attachment; filename="${download}"` } : { "Content-Disposition": "inline" }) },
  });
  const pdf = async (docs: PdfDoc[], title: string, fileName: string) => send(await makePdf(docs, { title }), "application/pdf", fileName);
  const html = "text/html; charset=utf-8";

  if (kind === "accounts-ch") {
    if (!d.accountsHtml) return new Response("No accounts", { status: 404 });
    const ch = companiesHouseCopy(d.accountsHtml);
    if (ext === "html") return send(ch, html);
    if (ext === "pdf") return pdf([{ footer: `${d.company.name} · accounts to ${longDate(d.periodTo)} · Companies House copy`, blocks: htmlToBlocks(ch) }], `${d.company.name} accounts — Companies House copy`, name("accounts-companies-house", "pdf"));
    return new Response("Not found", { status: 404 });
  }
  if (kind === "accounts") {
    if (!d.accountsHtml) return new Response("No accounts", { status: 404 });
    if (ext === "html") return send(d.accountsHtml, html);
    if (ext === "xhtml") return send(d.accountsHtml, "application/xhtml+xml; charset=utf-8", name("accounts", "xhtml"));
    if (ext === "pdf") return pdf([{ footer: `${d.company.name} · accounts to ${longDate(d.periodTo)}`, blocks: htmlToBlocks(d.accountsHtml) }], `${d.company.name} accounts`, name("accounts", "pdf"));
  }
  if (!part && kind !== "approval-pack") return new Response("No such return", { status: 404 });
  if (kind === "computation") {
    const c = part.computationHtml;
    if (!c) return new Response("No computation", { status: 404 });
    if (ext === "html") return send(c, html);
    if (ext === "xhtml") return send(c, "application/xhtml+xml; charset=utf-8", name(`computation${many ? `-${n + 1}` : ""}`, "xhtml"));
    if (ext === "pdf") return pdf([{ footer: `${d.company.name} · Corporation Tax computation, ${period(part)}`, blocks: htmlToBlocks(c) }], `${d.company.name} computation`, name(`computation${many ? `-${n + 1}` : ""}`, "pdf"));
  }
  if (kind === "ct600") {
    const x = part.ct600Xml;
    if (!x) return new Response("No return", { status: 404 });
    const blocks = ct600Blocks(x, { company: `${d.company.name} · company ${d.company.companyNo}`, period: period(part), status: label(part) });
    if (ext === "html") return send(blocksToHtml(`${d.company.name} CT600`, blocks), html);
    if (ext === "xml") return send(`<?xml version="1.0" encoding="UTF-8"?>\n${x}`, "application/xml; charset=utf-8", name(`ct600${many ? `-${n + 1}` : ""}`, "xml"));
    if (ext === "pdf") return pdf([{ footer: `${d.company.name} · CT600, ${period(part)}`, blocks, font: "sans" }], `${d.company.name} CT600`, name(`ct600${many ? `-${n + 1}` : ""}`, "pdf"));
  }
  if (kind === "submission" && ext === "xml") {
    if (!part.envelope) return new Response("This return hasn't been sent yet.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    return send(part.envelope, "application/xml; charset=utf-8", name(`submission${many ? `-${n + 1}` : ""}`, "xml"));
  }
  if (kind === "receipt" && ext === "pdf") {
    const s = part.sent;
    if (!s || s.status !== "accepted") return new Response("This return hasn't been filed with HMRC yet.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    return pdf([{ footer: `${d.company.name} · HMRC receipt`, blocks: receiptBlocks({ company: d.company.name, period: period(part), at: s.at, correlationId: s.correlationId, irmark: s.irmark, receiptText: s.receiptText ?? null, filedBy: s.filedBy }), font: "sans" }], `${d.company.name} HMRC receipt`, name(`hmrc-receipt${many ? `-${n + 1}` : ""}`, "pdf"));
  }
  if (kind === "approval-pack" && ext === "pdf") {
    return send(await approvalPackPdf(d), "application/pdf", name("approval-pack", "pdf"));
  }
  return new Response("Not found", { status: 404 });
}
