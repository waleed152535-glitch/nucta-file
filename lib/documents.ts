/**
 * The documents of a return, to view or download: the accounts, each
 * computation and each CT600, a box-by-box summary of the CT600, HMRC's
 * receipt, and an approval pack for the client to sign.
 *
 * A return that has been filed shows exactly what was filed — the documents
 * are read back out of the submission HMRC accepted. A return not yet filed
 * shows what would be sent now.
 */

import { DOMParser } from "@xmldom/xmldom";
import type { Block } from "./pdf";

/** What the CT600 elements Nucta File writes mean, by box number (HMRC CT600 v3 specification). */
const BOXES: { path: string; box: string; label: string; section: string; kind?: "money" | "yes" | "date" | "rate" | "text" }[] = [
  { section: "Company information", path: "CompanyInformation/CompanyName", box: "1", label: "Company name", kind: "text" },
  { section: "Company information", path: "CompanyInformation/RegistrationNumber", box: "2", label: "Company registration number", kind: "text" },
  { section: "Company information", path: "CompanyInformation/Reference", box: "3", label: "Tax reference (UTR)", kind: "text" },
  { section: "Company information", path: "CompanyInformation/CompanyType", box: "4", label: "Type of company", kind: "text" },
  { section: "Company information", path: "CompanyInformation/PeriodCovered/From", box: "30", label: "Return period from", kind: "date" },
  { section: "Company information", path: "CompanyInformation/PeriodCovered/To", box: "35", label: "Return period to", kind: "date" },
  { section: "About this return", path: "ReturnInfoSummary/MultipleReturns", box: "50", label: "Making more than one return for this company now", kind: "yes" },
  { section: "About this return", path: "ReturnInfoSummary/Accounts/ThisPeriodAccounts", box: "80", label: "Accounts for this period attached", kind: "yes" },
  { section: "About this return", path: "ReturnInfoSummary/Accounts/DifferentPeriod", box: "85", label: "Accounts for a different period attached", kind: "yes" },
  { section: "About this return", path: "ReturnInfoSummary/Computations/ThisPeriodComputations", box: "80B", label: "Computations for this period attached", kind: "yes" },
  { section: "About this return", path: "ReturnInfoSummary/SupplementaryPages/CT600A", box: "95", label: "Loans to participators (CT600A) included", kind: "yes" },
  { section: "Turnover", path: "Turnover/Total", box: "145", label: "Total turnover from trade" },
  { section: "Income and profits", path: "CompanyTaxCalculation/Income/Trading/Profits", box: "155", label: "Trading profits" },
  { section: "Income and profits", path: "CompanyTaxCalculation/Income/Trading/LossesBroughtForward", box: "160", label: "Trading losses brought forward set against them" },
  { section: "Income and profits", path: "CompanyTaxCalculation/Income/Trading/NetProfits", box: "165", label: "Net trading profits" },
  { section: "Income and profits", path: "CompanyTaxCalculation/Income/NonTradingLoanProfitsAndGains", box: "170", label: "Bank and other interest (non-trading loan relationships)" },
  { section: "Income and profits", path: "CompanyTaxCalculation/ProfitsBeforeOtherDeductions", box: "235", label: "Profits before other deductions and reliefs" },
  { section: "Income and profits", path: "CompanyTaxCalculation/ChargesAndReliefs/ProfitsBeforeDonationsAndGroupRelief", box: "300", label: "Profits before qualifying donations and group relief" },
  { section: "Income and profits", path: "CompanyTaxCalculation/ChargesAndReliefs/QualifyingDonations", box: "305", label: "Qualifying donations" },
  { section: "Income and profits", path: "CompanyTaxCalculation/ChargeableProfits", box: "315", label: "Profits chargeable to Corporation Tax" },
  { section: "Tax calculation", path: "CompanyTaxCalculation/CorporationTaxChargeable/AssociatedCompanies/ThisPeriod", box: "326", label: "Associated companies in this period", kind: "text" },
  { section: "Tax calculation", path: "CompanyTaxCalculation/CorporationTaxChargeable/AssociatedCompanies/StartingOrSmallCompaniesRate", box: "329", label: "Small profits rate or marginal relief claimed", kind: "yes" },
  { section: "Tax calculation", path: "CompanyTaxCalculation/CorporationTaxChargeable/FinancialYearOne/Year", box: "330", label: "Financial year", kind: "text" },
  { section: "Tax calculation", path: "CompanyTaxCalculation/CorporationTaxChargeable/FinancialYearOne/Details/Profit", box: "335", label: "Profits in that year" },
  { section: "Tax calculation", path: "CompanyTaxCalculation/CorporationTaxChargeable/FinancialYearOne/Details/TaxRate", box: "340", label: "Rate of tax", kind: "rate" },
  { section: "Tax calculation", path: "CompanyTaxCalculation/CorporationTaxChargeable/FinancialYearOne/Details/Tax", box: "345", label: "Tax" },
  { section: "Tax calculation", path: "CompanyTaxCalculation/CorporationTaxChargeable/FinancialYearTwo/Year", box: "380", label: "Second financial year", kind: "text" },
  { section: "Tax calculation", path: "CompanyTaxCalculation/CorporationTaxChargeable/FinancialYearTwo/Details/Profit", box: "385", label: "Profits in that year" },
  { section: "Tax calculation", path: "CompanyTaxCalculation/CorporationTaxChargeable/FinancialYearTwo/Details/TaxRate", box: "390", label: "Rate of tax", kind: "rate" },
  { section: "Tax calculation", path: "CompanyTaxCalculation/CorporationTaxChargeable/FinancialYearTwo/Details/Tax", box: "395", label: "Tax" },
  { section: "Tax calculation", path: "CompanyTaxCalculation/CorporationTax", box: "430", label: "Corporation Tax" },
  { section: "Tax calculation", path: "CompanyTaxCalculation/MarginalReliefForRingFenceTrades", box: "435", label: "Marginal relief" },
  { section: "Tax calculation", path: "CompanyTaxCalculation/NetCorporationTaxChargeable", box: "440", label: "Corporation Tax chargeable" },
  { section: "Tax calculation", path: "CompanyTaxCalculation/TaxReliefsAndDeductions/TotalReliefsAndDeductions", box: "470", label: "Total reliefs and deductions in terms of tax" },
  { section: "Tax to pay", path: "CalculationOfTaxOutstandingOrOverpaid/NetCorporationTaxLiability", box: "475", label: "Net Corporation Tax liability" },
  { section: "Tax to pay", path: "CalculationOfTaxOutstandingOrOverpaid/LoansToParticipators", box: "480", label: "Tax on loans to participators (s455)" },
  { section: "Tax to pay", path: "CalculationOfTaxOutstandingOrOverpaid/TaxChargeable", box: "510", label: "Tax chargeable" },
  { section: "Tax to pay", path: "CalculationOfTaxOutstandingOrOverpaid/TaxPayable", box: "525", label: "Tax payable" },
  { section: "Capital allowances and charges", path: "AllowancesAndCharges/FullExpensing/CapitalAllowances", box: "688/689", label: "Full expensing — allowances" },
  { section: "Capital allowances and charges", path: "AllowancesAndCharges/FullExpensing/BalancingCharges", box: "688/689", label: "Full expensing — balancing charges" },
  { section: "Capital allowances and charges", path: "AllowancesAndCharges/AIACapitalAllowancesInc", box: "690", label: "Annual Investment Allowance" },
  { section: "Capital allowances and charges", path: "AllowancesAndCharges/MachineryAndPlantSpecialRatePool/CapitalAllowances", box: "695/700", label: "Special rate pool — allowances" },
  { section: "Capital allowances and charges", path: "AllowancesAndCharges/MachineryAndPlantSpecialRatePool/BalancingCharges", box: "695/700", label: "Special rate pool — balancing charges" },
  { section: "Capital allowances and charges", path: "AllowancesAndCharges/MachineryAndPlantMainPool/CapitalAllowances", box: "705/710", label: "Main pool — allowances" },
  { section: "Capital allowances and charges", path: "AllowancesAndCharges/MachineryAndPlantMainPool/BalancingCharges", box: "705/710", label: "Main pool — balancing charges" },
  { section: "Capital allowances and charges", path: "AllowancesAndCharges/Others/CapitalAllowances", box: "725/730", label: "Other allowances" },
  { section: "Capital allowances and charges", path: "AllowancesAndCharges/ZeroEmissionsCars/CapitalAllowances", box: "726/727", label: "Zero-emission cars" },
  { section: "Capital allowances and charges", path: "QualifyingExpenditure/MachineryAndPlantExpenditure", box: "760", label: "Spending with a 100% first-year allowance" },
  { section: "Capital allowances and charges", path: "QualifyingExpenditure/MachineryAndPlantLongLife", box: "770", label: "Spending on long-life assets and integral features" },
  { section: "Capital allowances and charges", path: "QualifyingExpenditure/OtherMachineryAndPlant", box: "775", label: "Other machinery and plant" },
  { section: "Losses", path: "LossesDeficitsAndExcess/AmountArising/LossesOfTradesUK/Arising", box: "780", label: "Trading losses arising in the period" },
  { section: "Loans to participators (CT600A)", path: "LoansByCloseCompanies/BeforeEndPeriod", box: "A5", label: "All loans made in the period repaid before it ended", kind: "yes" },
  { section: "Loans to participators (CT600A)", path: "LoansByCloseCompanies/LoansInformation/TotalLoans", box: "A15", label: "Loans made in the period, still outstanding at its end" },
  { section: "Loans to participators (CT600A)", path: "LoansByCloseCompanies/LoansInformation/TaxChargeable", box: "A20", label: "Tax on those loans" },
  { section: "Loans to participators (CT600A)", path: "LoansByCloseCompanies/ReliefEarlierThan/TotalLoans", box: "A40", label: "Repaid or released within 9 months of the period end" },
  { section: "Loans to participators (CT600A)", path: "LoansByCloseCompanies/ReliefEarlierThan/ReliefDue", box: "A45", label: "Relief due" },
  { section: "Loans to participators (CT600A)", path: "LoansByCloseCompanies/TotalLoansOutstanding", box: "A75", label: "Total loans outstanding" },
  { section: "Loans to participators (CT600A)", path: "LoansByCloseCompanies/TaxPayable", box: "A80", label: "Tax payable on loans" },
  { section: "Declaration", path: "Declaration/Name", box: "975", label: "Name of the person declaring", kind: "text" },
  { section: "Declaration", path: "Declaration/Status", box: "985", label: "Their status", kind: "text" },
];

const COMPANY_TYPE: Record<string, string> = { "0": "Company (0)", "1": "Investment company (1)" };
const longDate = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
const pounds = (v: string) => `£${Number(v).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type Node = { nodeType: number; localName?: string; nodeName: string; childNodes: ArrayLike<Node>; textContent?: string | null };
const kids = (n: Node) => Array.from({ length: n.childNodes.length }, (_, i) => n.childNodes[i]).filter((c) => c.nodeType === 1);
const nameOf = (n: Node) => (n.localName ?? n.nodeName).replace(/^.*:/, "");

/** The CT600 element (a CompanyTaxReturn, or the whole envelope) without its attached documents. */
export function ct600Only(xml: string): string {
  const m = xml.match(/<CompanyTaxReturn\b[\s\S]*<\/CompanyTaxReturn>/);
  return (m ? m[0] : xml).replace(/<AttachedFiles>[\s\S]*<\/AttachedFiles>/, "");
}

/** The CT600 box by box, from the XML that is (or would be) sent. */
export function ct600Blocks(ct600Xml: string, heading: { company: string; period: string; status: string }): Block[] {
  const doc = new DOMParser({ onError: () => undefined }).parseFromString(ct600Only(ct600Xml), "text/xml") as unknown as Node & { documentElement: Node };
  const root = doc.documentElement;
  const find = (path: string): string | null => {
    let cur: Node | undefined = root;
    for (const part of path.split("/")) {
      cur = cur ? kids(cur).find((c) => nameOf(c) === part) : undefined;
      if (!cur) return null;
    }
    return (cur.textContent ?? "").trim();
  };
  const returnType = (ct600Xml.match(/ReturnType="([a-z]+)"/) ?? [])[1] ?? "new";
  const out: Block[] = [
    { t: "title", text: `Company Tax Return — CT600${returnType === "amended" ? " (amended)" : ""}` },
    { t: "sub", lines: [heading.company, `Accounting period ${heading.period}`, heading.status] },
  ];
  let section = "";
  for (const b of BOXES) {
    const v = find(b.path);
    if (v === null || v === "") continue;
    if (b.section !== section) { section = b.section; out.push({ t: "h2", text: section }); }
    const shown = b.kind === "yes" ? (v === "yes" ? "Yes" : "No") : b.kind === "date" ? longDate(v) : b.kind === "rate" ? `${Number(v)}%`
      : b.kind === "text" ? (b.path.endsWith("CompanyType") ? COMPANY_TYPE[v] ?? v : v) : pounds(v);
    out.push({ t: "row", label: `${b.box}   ${b.label}`, values: [shown] });
  }
  // Each loan named on the CT600A.
  const loans = ct600Xml.match(/<LoansInformation>[\s\S]*?<\/LoansInformation>/)?.[0] ?? "";
  const named = [...loans.matchAll(/<Loan>\s*<Name>([^<]*)<\/Name>\s*<AmountOfLoan>([^<]*)<\/AmountOfLoan>/g)];
  if (named.length) {
    out.push({ t: "p", small: true, text: "A10 — loans made in the period and still outstanding: " + named.map((m) => `${m[1].replace(/&amp;/g, "&")} ${pounds(m[2])}`).join("; ") + "." });
  }
  out.push({ t: "p", small: true, text: "Box numbers are those of HMRC's CT600 form. Boxes left empty are not shown. The accounts and the computation are sent with the return in iXBRL." });
  return out;
}

/** HMRC's receipt for a filed return, as a page to keep. */
export function receiptBlocks(r: { company: string; period: string; at: string; correlationId: string | null; irmark: string | null; receiptText: string | null; filedBy?: string }): Block[] {
  return [
    { t: "title", text: "HMRC receipt — Company Tax Return filed" },
    { t: "sub", lines: [r.company, `Accounting period ${r.period}`] },
    { t: "h2", text: "HMRC's confirmation" },
    { t: "p", text: r.receiptText ?? "HMRC accepted the return." },
    { t: "h2", text: "Details" },
    { t: "row", label: "Filed", values: [new Date(r.at).toLocaleString("en-GB", { timeZone: "Europe/London" })] },
    { t: "row", label: "Correlation ID", values: [r.correlationId ?? "—"] },
    { t: "row", label: "IRmark", values: [r.irmark ?? "—"] },
    ...(r.filedBy ? [{ t: "row" as const, label: "Government Gateway user ID", values: [r.filedBy] }] : []),
    { t: "p", small: true, text: "HMRC recommend keeping this receipt and the submission electronically as evidence of what was filed. Nucta File keeps both with the return." },
  ];
}

/** A cover page for the director to approve the accounts and the return. */
export function approvalBlocks(a: {
  company: string; companyNo: string; periodFrom: string; periodTo: string; director: string;
  parts: { from: string; to: string; tax: number; loansTax: number; due: string }[]; filingDue: string; preparedBy: string;
  /** Dormant: dormant accounts and a nil return; `returnNeeded` false when HMRC haven't asked for one. */
  dormant?: { returnNeeded: boolean };
}): Block[] {
  if (a.dormant) {
    const ret = a.dormant.returnNeeded;
    return [
      { t: "title", text: `${a.company} — dormant accounts for approval` },
      { t: "sub", lines: [`Company registration number ${a.companyNo}`, `Accounts for ${longDate(a.periodFrom)} to ${longDate(a.periodTo)}`, `Prepared by ${a.preparedBy}`] },
      { t: "p", text: `Attached are the company's dormant accounts${ret ? ` and its nil Company Tax Return${a.parts.length > 1 ? "s" : ""} (CT600)` : ""}. The company was dormant throughout the period, so there is no profit or loss and no tax to pay. Please read them and, if they are right, sign below. Once approved, the accounts are filed with Companies House${ret ? " and the return with HMRC" : ""}.` },
      ...(ret ? [] : [{ t: "p" as const, small: true, text: "HMRC haven't asked for a Company Tax Return for this period, so none is filed. If they send a notice to file one, the nil return is ready." }]),
      { t: "h2", text: "Approval" },
      { t: "p", text: `I approve the dormant accounts for the period ended ${longDate(a.periodTo)}${ret ? ` and the Company Tax Return${a.parts.length > 1 ? "s" : ""} attached` : ""}. To the best of my knowledge and belief the company was dormant throughout the period and the information given is correct and complete, and I authorise ${a.preparedBy} to file ${ret ? "them" : "the accounts"}.` },
      { t: "sign", lines: [`Signed (${a.director || "director"})`, "Date"] },
    ];
  }
  const money = (n: number) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const blocks: Block[] = [
    { t: "title", text: `${a.company} — accounts and Company Tax Return for approval` },
    { t: "sub", lines: [`Company registration number ${a.companyNo}`, `Accounts for ${longDate(a.periodFrom)} to ${longDate(a.periodTo)}`, `Prepared by ${a.preparedBy}`] },
    { t: "p", text: `Attached are the company's accounts, the Corporation Tax computation${a.parts.length > 1 ? "s" : ""} and the Company Tax Return${a.parts.length > 1 ? "s" : ""} (CT600). Please read them and, if they are right, sign below. Once approved, the accounts are filed with Companies House and the return${a.parts.length > 1 ? "s" : ""} with HMRC.` },
    { t: "h2", text: "Tax to pay" },
  ];
  a.parts.forEach((p, i) => {
    if (a.parts.length > 1) blocks.push({ t: "row", label: `Return ${i + 1}: ${longDate(p.from)} to ${longDate(p.to)}`, values: [""], bold: true });
    blocks.push({ t: "row", label: "Corporation Tax", values: [money(p.tax)] });
    if (p.loansTax) blocks.push({ t: "row", label: "Tax on director's loans (repaid to the company once the loans are repaid)", values: [money(p.loansTax)] });
    blocks.push({ t: "row", label: `Due by ${longDate(p.due)}`, values: [money(p.tax + p.loansTax)], bold: true });
  });
  blocks.push(
    { t: "p", small: true, text: `The return${a.parts.length > 1 ? "s are" : " is"} due at HMRC by ${longDate(a.filingDue)}. Tax is paid to HMRC separately, quoting the company's Corporation Tax reference.` },
    { t: "h2", text: "Approval" },
    { t: "p", text: `I approve the accounts for the period ended ${longDate(a.periodTo)} and the Company Tax Return${a.parts.length > 1 ? "s" : ""} attached. To the best of my knowledge and belief the information in them is correct and complete, and I authorise ${a.preparedBy} to file them.` },
    { t: "sign", lines: [`Signed (${a.director || "director"})`, "Date"] },
  );
  return blocks;
}

export { longDate };
