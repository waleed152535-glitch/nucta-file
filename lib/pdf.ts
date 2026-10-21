/**
 * PDFs of the accounts, computations and returns — real files to send a
 * client for approval, not a print of the screen.
 *
 * Nucta File's documents are built from a small set of parts (a title, a
 * subtitle, headings, paragraphs, and tables of a label with one to three
 * amounts), so they are laid out here directly on A4 pages with the PDF
 * standard fonts. `htmlToBlocks` reads those parts back out of the iXBRL
 * documents, so the PDF always shows exactly the figures that were tagged.
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { DOMParser } from "@xmldom/xmldom";

export type Block =
  | { t: "title"; text: string }
  | { t: "sub"; lines: string[] }
  | { t: "h2"; text: string }
  | { t: "p"; text: string; small?: boolean; lead?: string }
  | { t: "row"; label: string; values: string[]; bold?: boolean; head?: boolean; note?: string }
  | { t: "sign"; lines: string[] }
  | { t: "break" };

export interface PdfDoc {
  /** Shown in the footer of each page with the page number. */
  footer: string;
  blocks: Block[];
  font?: "serif" | "sans";
}

// ---- text the standard fonts can draw (Windows-1252) ----

const EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
const SWAP: Record<string, string> = { "−": "-", "‑": "-", "‐": "-", "→": "->", "≤": "<=", "≥": ">=", "✓": "", "✕": "x", "′": "'", " ": " ", " ": " ", " ": " ", "​": "" };

/** Text the PDF standard fonts can encode; anything else becomes its nearest plain equivalent. */
export function pdfText(s: string): string {
  let out = "";
  for (const ch of s.normalize("NFC")) {
    const c = ch.codePointAt(0)!;
    if (ch in SWAP) out += SWAP[ch];
    else if ((c >= 0x20 && c < 0x7f) || (c >= 0xa0 && c <= 0xff) || EXTRA.includes(ch)) out += ch;
    else if (ch === "\n") out += "\n";
    else if (c === 0x09) out += " ";
    else out += "?";
  }
  return out;
}

// ---- reading Nucta File's own HTML documents ----

type El = { nodeType: number; localName?: string; nodeName: string; childNodes: ArrayLike<El>; data?: string; getAttribute?: (n: string) => string | null };

function textOf(n: El, skipClass?: string): string {
  if (n.nodeType === 3) return n.data ?? "";
  if (n.nodeType !== 1) return "";
  const tag = (n.localName ?? n.nodeName).toLowerCase();
  if (tag === "br") return "\n";
  if (skipClass && (n.getAttribute?.("class") ?? "").split(/\s+/).includes(skipClass)) return "";
  let s = "";
  for (let i = 0; i < n.childNodes.length; i++) s += textOf(n.childNodes[i], skipClass);
  return s;
}
const tidy = (s: string) => s.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");
const children = (n: El): El[] => Array.from({ length: n.childNodes.length }, (_, i) => n.childNodes[i]).filter((c) => c.nodeType === 1);
const tagOf = (n: El) => (n.localName ?? n.nodeName).toLowerCase().replace(/^.*:/, "");
const cls = (n: El) => (n.getAttribute?.("class") ?? "").split(/\s+/);

/** The headings, paragraphs and tables of one of Nucta File's documents, as PDF blocks. */
export function htmlToBlocks(html: string): Block[] {
  const doc = new DOMParser({ onError: () => undefined }).parseFromString(html.replace(/^\s*<\?xml[^>]*\?>\s*/, ""), "text/html") as unknown as { getElementsByTagName(n: string): ArrayLike<El> };
  const body = doc.getElementsByTagName("body")[0];
  const out: Block[] = [];
  const walk = (node: El) => {
    for (const el of children(node)) {
      const tag = tagOf(el);
      const style = el.getAttribute?.("style") ?? "";
      if (/display\s*:\s*none/.test(style) || tag === "style" || tag === "script" || tag === "head") continue;
      if (tag === "h1") out.push({ t: "title", text: tidy(textOf(el)) });
      else if (tag === "h2" || tag === "h3") out.push({ t: "h2", text: tidy(textOf(el)) });
      else if (tag === "div" && cls(el).includes("sub")) out.push({ t: "sub", lines: tidy(textOf(el)).split("\n") });
      else if (tag === "p" || (tag === "div" && (cls(el).includes("note") || cls(el).includes("why")))) {
        const first = children(el)[0];
        const all = tidy(textOf(el)).replace(/\n/g, " ");
        if (first && tagOf(first) === "b" && all.startsWith(tidy(textOf(first)))) {
          const lead = tidy(textOf(first));
          out.push({ t: "p", lead, text: all.slice(lead.length).trim(), small: cls(el).includes("note") });
        } else if (all) out.push({ t: "p", text: all, small: cls(el).includes("note") && !cls(el).includes("stmt") });
      } else if (tag === "table") {
        const rows: El[] = [];
        const collect = (n: El) => { for (const c of children(n)) { const t = tagOf(c); if (t === "tr") rows.push(c); else if (t === "tbody" || t === "thead") collect(c); } };
        collect(el);
        for (const tr of rows) {
          const cells = children(tr).filter((c) => ["td", "th"].includes(tagOf(c)));
          if (!cells.length) continue;
          const why = children(cells[0]).find((c) => cls(c).includes("why"));
          out.push({
            t: "row", label: tidy(textOf(cells[0], "why")).replace(/\n/g, " "),
            values: cells.slice(1).map((c) => tidy(textOf(c))),
            bold: cls(tr).includes("b"), head: cls(tr).includes("hd"),
            ...(why ? { note: tidy(textOf(why)).replace(/\n/g, " ") } : {}),
          });
        }
      } else if (tag === "ul" || tag === "ol") {
        for (const li of children(el).filter((c) => tagOf(c) === "li")) out.push({ t: "p", text: `• ${tidy(textOf(li)).replace(/\n/g, " ")}` });
      } else walk(el);
    }
  };
  if (body) walk(body);
  return out;
}

// ---- laying out pages ----

const A4 = { w: 595.28, h: 841.89 };
const M = { l: 56, r: 56, t: 58, b: 62 };
const INK = rgb(0.07, 0.09, 0.13), GREY = rgb(0.38, 0.42, 0.48), RULE = rgb(0.75, 0.78, 0.82);

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const para of pdfText(text).split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width || !line) line = next;
      else { lines.push(line); line = word; }
    }
    lines.push(line);
  }
  return lines;
}

export async function makePdf(docs: PdfDoc[], meta: { title: string; author?: string }): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(pdfText(meta.title)); pdf.setAuthor(pdfText(meta.author ?? "Nucta File")); pdf.setCreator("Nucta File"); pdf.setProducer("Nucta File");
  const fonts = {
    serif: { r: await pdf.embedFont(StandardFonts.TimesRoman), b: await pdf.embedFont(StandardFonts.TimesRomanBold) },
    sans: { r: await pdf.embedFont(StandardFonts.Helvetica), b: await pdf.embedFont(StandardFonts.HelveticaBold) },
  };
  const W = A4.w - M.l - M.r;

  for (const d of docs) {
    const f = fonts[d.font ?? "serif"];
    const pages: PDFPage[] = [];
    let page!: PDFPage, y = 0;
    const newPage = () => { page = pdf.addPage([A4.w, A4.h]); pages.push(page); y = A4.h - M.t; };
    const need = (h: number) => { if (y - h < M.b) newPage(); };
    const text = (s: string, x: number, size: number, font: PDFFont, color = INK) => page.drawText(pdfText(s), { x, y, size, font, color });
    newPage();

    const cols = Math.max(1, ...d.blocks.filter((b): b is Extract<Block, { t: "row" }> => b.t === "row").map((b) => b.values.length));
    const cw = cols >= 3 ? 72 : 84;
    const labelW = W - cols * cw - 10;

    d.blocks.forEach((b, idx) => {
      if (b.t === "break") { newPage(); return; }
      if (b.t === "title") {
        const lines = wrap(b.text, f.b, 16, W);
        need(14 + lines.length * 19);
        lines.forEach((l) => { y -= 19; text(l, M.l, 16, f.b); });
        y -= 8;
      } else if (b.t === "sub") {
        for (const l of b.lines) for (const w of wrap(l, f.r, 9.5, W)) { need(13); y -= 12.5; text(w, M.l, 9.5, f.r, GREY); }
        y -= 8;
      } else if (b.t === "h2") {
        // Keep a heading with what follows it.
        const nextIsRow = d.blocks[idx + 1]?.t === "row";
        need(nextIsRow ? 58 : 44);
        y -= 18; text(b.text, M.l, 11.5, f.b);
        y -= 5; page.drawLine({ start: { x: M.l, y }, end: { x: M.l + W, y }, thickness: 0.6, color: RULE }); y -= 4;
      } else if (b.t === "p") {
        const size = b.small ? 9 : 9.6, lead = b.small ? 12.4 : 13.2;
        const full = b.lead ? `${b.lead} ${b.text}` : b.text;
        const lines = wrap(full, f.r, size, W);
        y -= 4;
        lines.forEach((l, i) => {
          need(lead); y -= lead;
          if (i === 0 && b.lead && l.startsWith(pdfText(b.lead))) {
            const leadText = pdfText(b.lead);
            text(leadText, M.l, size, f.b);
            text(l.slice(leadText.length), M.l + f.b.widthOfTextAtSize(leadText, size), size, f.r);
          } else text(l, M.l, size, f.r);
        });
      } else if (b.t === "sign") {
        need(18 * b.lines.length + 10); y -= 8;
        for (const l of b.lines) {
          y -= 22; text(l, M.l, 9.6, f.r);
          page.drawLine({ start: { x: M.l + 150, y: y - 2 }, end: { x: M.l + W, y: y - 2 }, thickness: 0.6, color: RULE });
        }
      } else if (b.t === "row") {
        const size = 9.6, font = b.bold || b.head ? f.b : f.r;
        const labelLines = wrap(b.label, font, size, labelW);
        const noteLines = b.note ? wrap(b.note, f.r, 8, labelW) : [];
        const valueLines = b.values.map((v) => pdfText(v).split("\n"));
        const tall = Math.max(labelLines.length * 12.5 + noteLines.length * 10.5, ...valueLines.map((v) => v.length * 12.5)) + 4;
        need(tall);
        const top = y;
        if (b.bold) {
          b.values.forEach((_, i) => {
            const x1 = M.l + labelW + 10 + i * cw;
            page.drawLine({ start: { x: x1 + 8, y: top - 1 }, end: { x: x1 + cw, y: top - 1 }, thickness: 0.6, color: RULE });
          });
        }
        labelLines.forEach((l, i) => { y = top - 12.5 * (i + 1); text(l, M.l, size, font); });
        noteLines.forEach((l, i) => { y = top - 12.5 * labelLines.length - 10.5 * (i + 1); text(l, M.l + 6, 8, f.r, GREY); });
        valueLines.forEach((vl, i) => {
          const right = M.l + labelW + 10 + (i + 1) * cw;
          vl.forEach((v, k) => {
            y = top - 12.5 * (k + 1);
            const w = font.widthOfTextAtSize(v, size);
            page.drawText(v, { x: right - w, y, size, font, color: INK });
          });
        });
        y = top - tall;
      }
    });

    // Footers, numbered within this document.
    pages.forEach((p, i) => {
      const foot = pdfText(d.footer);
      p.drawText(foot, { x: M.l, y: 34, size: 7.5, font: f.r, color: GREY });
      const n = `Page ${i + 1} of ${pages.length}`;
      p.drawText(n, { x: A4.w - M.r - f.r.widthOfTextAtSize(n, 7.5), y: 34, size: 7.5, font: f.r, color: GREY });
    });
  }
  return pdf.save();
}

/** The same blocks as a plain, printable web page, for viewing on screen. */
export function blocksToHtml(title: string, blocks: Block[]): string {
  const e = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const body = blocks.map((b) => {
    switch (b.t) {
      case "title": return `<h1>${e(b.text)}</h1>`;
      case "sub": return `<div class="sub">${b.lines.map(e).join("<br/>")}</div>`;
      case "h2": return `<h2>${e(b.text)}</h2>`;
      case "p": return `<p class="${b.small ? "note" : ""}">${b.lead ? `<b>${e(b.lead)}</b> ` : ""}${e(b.text)}</p>`;
      case "sign": return b.lines.map((l) => `<p class="sign">${e(l)} <span></span></p>`).join("");
      case "break": return "";
      case "row": return `<table><tr class="${b.bold ? "b" : ""}${b.head ? " hd" : ""}"><td class="lbl">${e(b.label)}${b.note ? `<div class="why">${e(b.note)}</div>` : ""}</td>${b.values.map((v) => `<td class="num">${e(v).replace(/\n/g, "<br/>")}</td>`).join("")}</tr></table>`;
    }
  }).join("\n");
  return `<!doctype html><html><head><meta charset="utf-8"/><title>${e(title)}</title><style>
body{font-family:Georgia,'Times New Roman',serif;font-size:11pt;color:#111;margin:36px auto;max-width:720px;padding:0 16px}
h1{font-size:15pt;margin:0 0 2px}h2{font-size:12pt;margin:22px 0 6px;border-bottom:1px solid #999;padding-bottom:3px}
.sub{font-size:10pt;color:#555;margin-bottom:16px}table{width:100%;border-collapse:collapse}td{padding:3px 0;vertical-align:top}
.lbl{width:74%}.num{text-align:right;font-variant-numeric:tabular-nums}tr.b td{font-weight:bold}.why{font-size:9pt;color:#666}
.note{font-size:9.5pt;color:#444}.sign span{display:inline-block;border-bottom:1px solid #999;width:60%;margin-left:8px}
</style></head><body>${body}</body></html>`;
}
