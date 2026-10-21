/**
 * Documents: the CT600 box summary, reading the iXBRL back for PDFs, and the PDFs themselves.
 * Run: npx tsx tests/documents.test.ts
 */
import { prepareReturn, type CompanyReturnInput } from "../lib/filing";
import { SCOPE_QUESTIONS, type ScopeAnswers } from "../lib/tax/scope";
import { ct600Blocks, approvalBlocks, receiptBlocks } from "../lib/documents";
import { htmlToBlocks, makePdf, pdfText, type Block } from "../lib/pdf";
import { PDFDocument } from "pdf-lib";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, got?: unknown) => { ok ? pass++ : fail++; console.log(ok ? "PASS" : "FAIL", name, ok ? "" : `→ ${JSON.stringify(got)}`); };
const inScope = Object.fromEntries(SCOPE_QUESTIONS.map((q) => [q.key, q.expect])) as unknown as ScopeAnswers;
const zeroDis = { entertainment: 0, finesAndPenalties: 0, charitableDonations: 0, politicalDonations: 0, privateExpenses: 0, capitalItemsExpensed: 0, lossOnDisposals: 0, other: 0 };
const input = (cash: number): CompanyReturnInput => ({
  company: { name: "Larkspur Home Ltd", number: "15234567", utr: "8596148860", activity: "Interior design services" },
  figures: { periodFrom: "2024-03-01", periodTo: "2025-03-31", associatedCompanies: 0,
    pl: { turnover: 168_300, otherIncome: 900, interestReceived: 330, costOfSales: 41_200, staffCosts: 25_140, depreciation: 1_650, otherCharges: 37_400 },
    disallowable: { ...zeroDis, entertainment: 720 }, profitOnDisposals: 0,
    capitalAllowances: { additions: [{ description: "Laptops", kind: "plantNew", cost: 4200, date: "2024-03-18" }, { description: "Used van", kind: "plantUsed", cost: 9800, date: "2025-03-10" }], disposals: [], mainPoolBroughtForward: 0, specialPoolBroughtForward: 0 },
    tradingLossesBroughtForward: 0, qualifyingDonations: 0 },
  balanceSheet: { fixedAssets: 12_350, stock: 0, debtors: 14_200, cash, prepayments: 0, creditorsWithin: 8_900, owedToDirectors: 0, creditorsAfter: 0, provisions: 0, shareCapital: 100, shareCapitalNotPaid: 0, reservesBroughtForward: 0, dividendsPaid: 20_000, employees: 2 },
  director: "Priya Shah", approvedOn: "2025-08-12", declarant: { name: "Waleed Sarfraz", status: "Agent" }, scope: inScope, today: "2026-10-20",
});
const r = prepareReturn(input(26_590));
t("the 13-month return builds", r.ok && r.parts.length === 2, r.problems);
const row = (bs: Block[], box: string) => (bs.find((b) => b.t === "row" && b.label.startsWith(`${box} `)) as Extract<Block, { t: "row" }> | undefined)?.values[0];
const c1 = ct600Blocks(r.parts[0].ct600!, { company: "Larkspur Home Ltd", period: "1 March 2024 to 28 February 2025", status: "Not yet filed" });
t("CT600 summary: box 1 company name", row(c1, "1") === "Larkspur Home Ltd", row(c1, "1"));
t("CT600 summary: box 30 and 35 dates", row(c1, "30") === "1 March 2024" && row(c1, "35") === "28 February 2025", [row(c1, "30"), row(c1, "35")]);
t("CT600 summary: box 50 and 85 for a long period", row(c1, "50") === "Yes" && row(c1, "85") === "Yes" && row(c1, "80") === undefined);
t("CT600 summary: box 155 matches the computation", row(c1, "155") === `£${r.parts[0].computation.tradingProfit.toLocaleString("en-GB")}.00`, row(c1, "155"));
t("CT600 summary: two financial years shown", row(c1, "330") === "2023" && row(c1, "380") === "2024", [row(c1, "330"), row(c1, "380")]);
t("CT600 summary: box 340 as a rate", /^(19|25)%$/.test(row(c1, "340") ?? ""), row(c1, "340"));
t("CT600 summary: box 525 tax payable", row(c1, "525") === `£${r.parts[0].computation.taxChargeable.toLocaleString("en-GB", { minimumFractionDigits: 2 })}`, row(c1, "525"));
t("CT600 summary: attachments not read as boxes", !c1.some((b) => b.t === "row" && b.label.includes("ix:")));
const amended = ct600Blocks(r.parts[0].ct600!.replace('ReturnType="new"', 'ReturnType="amended"'), { company: "x", period: "y", status: "z" });
t("an amended CT600 says so", amended[0].t === "title" && amended[0].text.includes("amended"));

const acc = htmlToBlocks(r.accountsHtml!);
const accRow = (label: string) => acc.find((b) => b.t === "row" && b.label === label) as Extract<Block, { t: "row" }> | undefined;
t("accounts read back: title", acc[0].t === "title" && acc[0].text === "Larkspur Home Ltd");
t("accounts read back: turnover", accRow("Turnover")?.values[0] === "168,300", accRow("Turnover"));
t("accounts read back: no hidden iXBRL header text", !acc.some((b) => b.t === "p" && /schemaRef|xbrldi|Micro-entities/.test(b.text)));
t("accounts read back: statements and notes", acc.some((b) => b.t === "p" && b.text.includes("section 477")) && acc.some((b) => b.t === "p" && b.lead?.startsWith("1.")));
const comp = htmlToBlocks(r.parts[0].computationHtml!);
t("computation read back: the long-period note", comp.some((b) => b.t === "h2" && b.text === "Accounts for more than 12 months"));
t("computation read back: trading profit row", comp.some((b) => b.t === "row" && b.label === "Trading profit"));

t("PDF text: minus sign becomes a hyphen", pdfText("−£4,573") === "-£4,573");
t("PDF text: £, — and • kept", pdfText("£1 — •") === "£1 — •");
t("PDF text: unknown characters replaced, not crashing", pdfText("✓ 漢") === " ?");

const approval = approvalBlocks({ company: "Larkspur Home Ltd", companyNo: "15234567", periodFrom: "2024-03-01", periodTo: "2025-03-31", director: "Priya Shah",
  parts: r.parts.map((p) => ({ from: p.periodFrom, to: p.periodTo, tax: p.computation.taxChargeable, loansTax: 0, due: p.taxDue })), filingDue: r.filingDue, preparedBy: "Waleed Sarfraz" });
t("approval page lists both returns", approval.filter((b) => b.t === "row" && b.label.startsWith("Return ")).length === 2);
t("approval page has a signature line for the director", approval.some((b) => b.t === "sign" && b.lines[0].includes("Priya Shah")));
const receipt = receiptBlocks({ company: "x", period: "y", at: "2026-10-20T10:00:00Z", correlationId: "ABC", irmark: "M=", receiptText: "HMRC has received …", filedBy: "•••012" });
t("receipt shows HMRC's words and the correlation ID", receipt.some((b) => b.t === "p" && b.text.startsWith("HMRC has received")) && receipt.some((b) => b.t === "row" && b.values[0] === "ABC"));

(async () => {
  const bytes = await makePdf([{ footer: "a", blocks: approval, font: "sans" }, { footer: "b", blocks: acc }, { footer: "c", blocks: comp }, { footer: "d", blocks: c1, font: "sans" }], { title: "Pack" });
  const doc = await PDFDocument.load(bytes);
  t("the pack is a real PDF with a page per document at least", doc.getPageCount() >= 4, doc.getPageCount());
  t("PDF title set", doc.getTitle() === "Pack");
  const long = await makePdf([{ footer: "x", blocks: Array.from({ length: 120 }, (_, i) => ({ t: "row" as const, label: `Line ${i}`, values: ["1,000"] })) }], { title: "Long" });
  t("long documents run onto more pages", (await PDFDocument.load(long)).getPageCount() >= 3);
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
})();
