import { createHash } from "crypto";

/**
 * Builds a Company Tax Return as XML for HMRC's Corporation Tax service.
 *
 * Corporation Tax filing doesn't use HMRC's modern REST APIs. A return is a
 * GovTalk message posted to the Transaction Engine, carrying a CT600, signed
 * with an IRmark so HMRC can prove the content hasn't been altered.
 *
 * IMPORTANT: the element names below follow the published CT600 version 3
 * structure, but HMRC releases the authoritative schema only to registered
 * developers. Everything here must be validated against their test service
 * once the vendor ID arrives. Treat it as a working draft.
 */

export const CT_NAMESPACE = "http://www.govtalk.gov.uk/taxation/CT/5";
export const GOVTALK_NAMESPACE = "http://www.govtalk.gov.uk/CM/envelope";

export interface Ct600Input {
  companyName: string;
  companyNo: string;
  utr: string;
  periodFrom: string;
  periodTo: string;
  companyType?: string;

  turnover: number;               // box 145
  tradingProfits: number;         // box 155
  lossesBroughtForward?: number;  // box 160
  otherIncome?: number;           // box 205
  qualifyingDonations?: number;   // box 305
  corporationTax: number;         // box 430
  marginalRelief?: number;        // box 435
  taxPayable: number;             // box 525
  taxAlreadyPaid?: number;        // box 595
  rate: number;
  financialYear: number;
  smallProfitsRate: boolean;      // box 329

  declarantName: string;
  declarantStatus: string;
  accountsAttached: boolean;
  computationsAttached: boolean;
}

const esc = (v: string): string =>
  String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");

const money = (v: number): string => (Math.round(v * 100) / 100).toFixed(2);
const whole = (v: number): string => String(Math.round(v));
const ymd = (v: string): string => String(v ?? "").slice(0, 10);

export interface Ct600Check { ok: boolean; problems: string[]; warnings: string[] }

/** Refuses to build a return HMRC would reject outright. */
export function checkCt600(i: Partial<Ct600Input>): Ct600Check {
  const problems: string[] = [];
  const warnings: string[] = [];

  if (!i.companyName?.trim()) problems.push("Company name is missing.");
  if (!/^[A-Z0-9]{8}$/i.test(String(i.companyNo ?? "").trim())) {
    problems.push("Company registration number must be 8 characters, e.g. 12345678 or SC123456.");
  }
  if (!/^\d{10}$/.test(String(i.utr ?? "").replace(/\s/g, ""))) {
    problems.push("Corporation Tax UTR must be 10 digits. It's on HMRC's notice to deliver.");
  }
  if (!ymd(i.periodFrom ?? "")) problems.push("Accounting period start is missing.");
  if (!ymd(i.periodTo ?? "")) problems.push("Accounting period end is missing.");
  if (i.periodFrom && i.periodTo) {
    if (i.periodFrom >= i.periodTo) problems.push("The period end must be after the period start.");
    const days = (new Date(i.periodTo).getTime() - new Date(i.periodFrom).getTime()) / 86400000;
    if (days > 366) {
      problems.push("A Corporation Tax period can't exceed 12 months. Longer accounts split into two returns.");
    }
  }
  if (!i.declarantName?.trim()) problems.push("The declaration needs a name.");
  if (!i.accountsAttached) warnings.push("No accounts attached. HMRC expects iXBRL accounts with the return.");
  if (!i.computationsAttached) warnings.push("No computations attached. HMRC expects an iXBRL computation.");
  if ((i.turnover ?? 0) === 0) warnings.push("Turnover is zero — right for a dormant company, otherwise check.");

  return { ok: problems.length === 0, problems, warnings };
}

/** The CT600 itself. */
export function buildCt600(i: Ct600Input): string {
  const netTrading = Math.max(0, i.tradingProfits - (i.lossesBroughtForward ?? 0));
  const beforeReliefs = netTrading + (i.otherIncome ?? 0);
  const chargeable = Math.max(0, beforeReliefs - (i.qualifyingDonations ?? 0));

  const L: string[] = [];
  const p = (s: string) => L.push(s);

  p(`<CompanyTaxReturn ReturnType="new">`);
  p(`  <CompanyInformation>`);
  p(`    <CompanyName>${esc(i.companyName)}</CompanyName>`);
  p(`    <RegistrationNumber>${esc(i.companyNo.toUpperCase())}</RegistrationNumber>`);
  p(`    <Reference>${esc(i.utr.replace(/\s/g, ""))}</Reference>`);
  p(`    <CompanyType>${esc(i.companyType ?? "0")}</CompanyType>`);
  p(`    <PeriodCovered>`);
  p(`      <From>${ymd(i.periodFrom)}</From>`);
  p(`      <To>${ymd(i.periodTo)}</To>`);
  p(`    </PeriodCovered>`);
  p(`  </CompanyInformation>`);

  p(`  <ReturnInfoSummary>`);
  p(`    <Accounts><ThisPeriodAccounts>${i.accountsAttached ? "yes" : "no"}</ThisPeriodAccounts></Accounts>`);
  p(`    <Computations><ThisPeriodComputations>${i.computationsAttached ? "yes" : "no"}</ThisPeriodComputations></Computations>`);
  p(`  </ReturnInfoSummary>`);

  p(`  <Turnover><Total>${money(i.turnover)}</Total></Turnover>`);

  p(`  <CompanyTaxCalculation>`);
  p(`    <Income>`);
  p(`      <Trading>`);
  p(`        <Profits>${money(i.tradingProfits)}</Profits>`);
  if (i.lossesBroughtForward) p(`        <LossesBroughtForward>${money(i.lossesBroughtForward)}</LossesBroughtForward>`);
  p(`        <NetProfits>${money(netTrading)}</NetProfits>`);
  p(`      </Trading>`);
  if (i.otherIncome) p(`      <IncomeNotFallingUnderAnyOtherHeading>${money(i.otherIncome)}</IncomeNotFallingUnderAnyOtherHeading>`);
  p(`    </Income>`);
  p(`    <ProfitsBeforeOtherDeductions>${money(beforeReliefs)}</ProfitsBeforeOtherDeductions>`);
  if (i.qualifyingDonations) p(`    <QualifyingDonations>${money(i.qualifyingDonations)}</QualifyingDonations>`);
  p(`    <ChargeableProfits>${money(chargeable)}</ChargeableProfits>`);
  p(`    <CorporationTaxChargeable>`);
  p(`      <FinancialYearOne>`);
  p(`        <Year>${whole(i.financialYear)}</Year>`);
  p(`        <Details>`);
  p(`          <Profit>${money(chargeable)}</Profit>`);
  p(`          <TaxRate>${(i.rate / 100).toFixed(2)}</TaxRate>`);
  p(`          <Tax>${money(i.corporationTax)}</Tax>`);
  p(`        </Details>`);
  p(`      </FinancialYearOne>`);
  p(`    </CorporationTaxChargeable>`);
  p(`    <CorporationTax>${money(i.corporationTax)}</CorporationTax>`);
  if (i.marginalRelief) p(`    <MarginalRateRelief>${money(i.marginalRelief)}</MarginalRateRelief>`);
  p(`    <NetCorporationTaxChargeable>${money(i.corporationTax - (i.marginalRelief ?? 0))}</NetCorporationTaxChargeable>`);
  p(`  </CompanyTaxCalculation>`);

  p(`  <CalculationOfTaxOutstandingOrOverpaid>`);
  p(`    <NetCorporationTaxLiability>${money(i.taxPayable)}</NetCorporationTaxLiability>`);
  p(`    <TaxChargeable>${money(i.taxPayable)}</TaxChargeable>`);
  p(`    <TaxPayable>${money(i.taxPayable)}</TaxPayable>`);
  if (i.taxAlreadyPaid) {
    p(`    <TaxAlreadyPaid>${money(i.taxAlreadyPaid)}</TaxAlreadyPaid>`);
    const out = i.taxPayable - i.taxAlreadyPaid;
    if (out >= 0) p(`    <TaxOutstanding>${money(out)}</TaxOutstanding>`);
    else p(`    <TaxOverpaid>${money(-out)}</TaxOverpaid>`);
  }
  p(`  </CalculationOfTaxOutstandingOrOverpaid>`);

  p(`  <Declaration>`);
  p(`    <AcceptDeclaration>yes</AcceptDeclaration>`);
  p(`    <Name>${esc(i.declarantName)}</Name>`);
  p(`    <Status>${esc(i.declarantStatus || "Director")}</Status>`);
  p(`  </Declaration>`);
  p(`</CompanyTaxReturn>`);

  return L.join("\n");
}

/**
 * The IRmark.
 *
 * HMRC's specification is precise and unforgiving: take the IRenvelope,
 * remove the IRmark element entirely, canonicalise the result using
 * Exclusive XML Canonicalisation (http://www.w3.org/2001/10/xml-exc-c14n#),
 * take a SHA-1 digest of the UTF-8 bytes, and base64 encode it. HMRC repeat
 * the calculation on arrival and refuse the submission with error 9001 if
 * their answer differs from ours.
 *
 * The important thing about canonicalisation is what it does *not* do: it
 * does not strip whitespace between elements. An earlier version of this
 * function normalised whitespace away, which would have produced a digest
 * that could never match. Real canonicalisation is used instead, with a
 * documented fallback only so the rest of the app still loads if the parser
 * is unavailable.
 */
export function irMark(bodyXml: string): string {
  const canonical = canonicalWithoutMark(bodyXml);
  return createHash("sha1").update(canonical, "utf8").digest("base64");
}

/**
 * Whether the last digest was produced by real canonicalisation.
 *
 * Worth showing on screen: if HMRC return error 9001 and this says false,
 * the cause is the missing parser rather than anything in the return.
 */
let canonicalRan = false;
export const markWasCanonical = (): boolean => canonicalRan;

/**
 * Removes the IRmark element and canonicalises what's left.
 *
 * The removal happens in the parsed tree rather than in the text, and that
 * distinction matters. HMRC receive a document, find the IRmark element and
 * delete that node; the newline and indentation around it are separate text
 * nodes and survive. Cutting the element out of the string with a regular
 * expression would also take that whitespace, giving a different digest from
 * theirs over something as trivial as an indent.
 */
function canonicalWithoutMark(bodyXml: string): string {
  try {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { DOMParser } = require("@xmldom/xmldom") as typeof import("@xmldom/xmldom");
    const { ExclusiveCanonicalization } =
      require("xml-crypto/lib/exclusive-canonicalization.js") as {
        ExclusiveCanonicalization: new () => { process(node: unknown, opts: object): string };
      };
    /* eslint-enable @typescript-eslint/no-require-imports */

    const doc = new DOMParser().parseFromString(bodyXml.trim(), "text/xml");
    const root = doc.documentElement;
    if (!root) throw new Error("no root element");

    const marks = Array.from(root.getElementsByTagName("IRmark"));
    for (const m of marks) m.parentNode?.removeChild(m);

    const out = new ExclusiveCanonicalization().process(root, {});
    canonicalRan = true;
    return String(out);
  } catch {
    // Without a parser the best that can be done is to digest the text as
    // written. It may not match, and the test service will say so.
    canonicalRan = false;
    return bodyXml.replace(/<IRmark\b[^>]*>[\s\S]*?<\/IRmark>/g, "").replace(/\r\n/g, "\n").trim();
  }
}

export interface EnvelopeInput {
  messageClass: string;   // HMRC-CT-CT600, or HMRC-CT-CT600-TIL to test against live
  senderId: string;
  vendorId: string;
  body: string;
  utr: string;
  /** The accounting period end, which HMRC's header requires. */
  periodEnd: string;
  correlationId?: string;
  qualifier?: "request" | "poll" | "delete";
  fn?: "submit" | "list";
  email?: string;
  test?: boolean;
  productName?: string;
  productVersion?: string;
}

/** Wraps a return in the GovTalk envelope the Transaction Engine expects. */
export function buildEnvelope(i: EnvelopeInput): string {
  const inner = `<IRenvelope xmlns="${CT_NAMESPACE}">
<IRheader>
  <Keys><Key Type="UTR">${esc(i.utr)}</Key></Keys>
  <PeriodEnd>${ymd(i.periodEnd)}</PeriodEnd>
  <DefaultCurrency>GBP</DefaultCurrency>
  <IRmark Type="generic">PLACEHOLDER</IRmark>
  <Sender>Company</Sender>
</IRheader>
${i.body}
</IRenvelope>`;
  const mark = irMark(inner);
  const signed = inner.replace("PLACEHOLDER", mark);

  return `<?xml version="1.0" encoding="UTF-8"?>
<GovTalkMessage xmlns="${GOVTALK_NAMESPACE}">
  <EnvelopeVersion>2.0</EnvelopeVersion>
  <Header>
    <MessageDetails>
      <Class>${esc(i.messageClass)}</Class>
      <Qualifier>${i.qualifier ?? "request"}</Qualifier>
      <Function>${i.fn ?? "submit"}</Function>
      ${i.correlationId ? `<CorrelationID>${esc(i.correlationId)}</CorrelationID>` : "<CorrelationID/>"}
      <Transformation>XML</Transformation>
      <GatewayTest>${i.test ? "1" : "0"}</GatewayTest>
    </MessageDetails>
    <SenderDetails>
      <IDAuthentication>
        <SenderID>${esc(i.senderId)}</SenderID>
        <Authentication>
          <Method>clear</Method>
          <Role>principal</Role>
          <Value>__PASSWORD__</Value>
        </Authentication>
      </IDAuthentication>
      ${i.email ? `<EmailAddress>${esc(i.email)}</EmailAddress>` : ""}
    </SenderDetails>
  </Header>
  <GovTalkDetails>
    <Keys><Key Type="UTR">${esc(i.utr)}</Key></Keys>
    <ChannelRouting>
      <Channel>
        <URI>${esc(i.vendorId)}</URI>
        <Product>${esc(i.productName ?? "Nucta File")}</Product>
        <Version>${esc(i.productVersion ?? "1.0")}</Version>
      </Channel>
    </ChannelRouting>
  </GovTalkDetails>
  <Body>
${signed}
  </Body>
</GovTalkMessage>`;
}

/** What still has to be true before any of this can be filed for real. */
export const READINESS = [
  { key: "vendor", label: "Government Gateway vendor ID",
    detail: "Request from HMRC's Software Developers Support Team. Free, takes a few weeks." },
  { key: "schema", label: "Official CT600 schema",
    detail: "Released to registered developers only. The XML here follows the published structure but must be validated against it." },
  { key: "ixbrl", label: "iXBRL accounts and computations",
    detail: "Tagged against FRS 105 and HMRC's computational taxonomy. The largest remaining piece." },
  { key: "irmark", label: "IRmark verified",
    detail: "The digest must match HMRC's own calculation exactly. Check against the test service first." },
  { key: "recognition", label: "HMRC recognition",
    detail: "SDST sends test scenarios; every one must pass before you're listed on GOV.UK." },
  { key: "aml", label: "AML supervision and an agent account",
    detail: "Recognition permits the software. Filing for clients is a separate legal requirement." },
];
