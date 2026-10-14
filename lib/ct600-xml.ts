import { createHash } from "crypto";
import { DOMParser } from "@xmldom/xmldom";
import { ExclusiveCanonicalization } from "xml-crypto/lib/exclusive-canonicalization.js";
import { C14nCanonicalization } from "xml-crypto/lib/c14n-canonicalization.js";

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

  /**
   * The iXBRL documents themselves, embedded in the return.
   *
   * HMRC want the accounts and computations inside the CT600, as inline XML
   * rather than base64. Saying "yes" in ReturnInfoSummary without supplying
   * them is refused: "You must provide a set of iXBRL accounts if the 'No
   * accounts reason' is absent."
   */
  accountsIxbrl?: string;
  computationIxbrl?: string;
  /** Why no accounts are attached, when there genuinely aren't any. */
  noAccountsReason?: string;
  noComputationsReason?: string;
  /** Reliefs and deductions in total (box 275). */
  totalReliefs?: number;
  /**
   * How many associated companies the company had in the period.
   *
   * HMRC cannot accept a claim to the small profits rate without this. The
   * business rule that enforces it (a_F034.4 in HMRC's own Schematron) only
   * admits the 19% rate when AssociatedCompanies/StartingOrSmallCompaniesRate
   * is present, because eligibility depends on how many associated companies
   * share the limits. Leave the rate at 25% and none of this is needed.
   */
  associatedCompanies?: number;
  /** How the two attachments are arranged inside XBRLsubmission. */
  attachLayout?: AttachLayout;
}

/**
 * How the iXBRL attachments are arranged.
 *
 * HMRC publish one sample with accounts attached and another with
 * computations attached, but none showing both together, and the technical
 * pack doesn't give the order. Since a real return carries both, the
 * arrangement is offered as a choice and the test service decides. A wrong
 * one produces "Invalid content found at element 'Computation'".
 */
export type AttachLayout = "comp-first" | "accounts-first" | "separate";

export const ATTACH_LAYOUTS: { key: AttachLayout; label: string; detail: string }[] = [
  {
    key: "comp-first",
    label: "Computation, then accounts",
    detail: "Both inside one XBRLsubmission, with the computation first. HMRC's rejection pointed at the Computation element when accounts came first, which suggests this order.",
  },
  {
    key: "accounts-first",
    label: "Accounts, then computation",
    detail: "Both inside one XBRLsubmission, accounts first — matching the order ReturnInfoSummary uses. This is what HMRC rejected.",
  },
  {
    key: "separate",
    label: "Two separate XBRLsubmission blocks",
    detail: "One block per document. Right if the schema allows only a single attachment per block, which would also explain why HMRC publish the two samples separately.",
  },
];

const esc = (v: string): string =>
  String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");

const money = (v: number): string => (Math.round(v * 100) / 100).toFixed(2);
const whole = (v: number): string => String(Math.round(v));
/** A tax rate as HMRC want it: a percentage to two places, so 19.00. */
const rate = (v: number): string => (Math.round(v * 100) / 100).toFixed(2);
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

/**
 * Strips the XML declaration from an iXBRL document so it can be nested.
 *
 * A document can only carry one declaration, and it has to be the first
 * thing in the file. An embedded one makes the whole envelope invalid.
 */
function nestable(doc: string): string {
  return doc.replace(/^\s*<\?xml[^>]*\?>\s*/, "").trim();
}

/**
 * The CT600 itself.
 *
 * The element names, their order and the number formats all follow HMRC's
 * published valid sample. Order matters: the schema defines sequences, so a
 * correctly named element in the wrong position is still rejected.
 */
export function buildCt600(i: Ct600Input): string {
  const netTrading = Math.max(0, i.tradingProfits - (i.lossesBroughtForward ?? 0));
  const beforeOther = netTrading + (i.otherIncome ?? 0);
  const beforeDonations = beforeOther;
  const chargeable = Math.max(0, beforeDonations - (i.qualifyingDonations ?? 0));

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

  // Either the document is attached or there's a reason it isn't. HMRC check
  // the two against each other.
  p(`  <ReturnInfoSummary>`);
  p(`    <Accounts>`);
  if (i.accountsAttached) p(`      <ThisPeriodAccounts>yes</ThisPeriodAccounts>`);
  else p(`      <NoAccountsReason>${esc(i.noAccountsReason ?? "Accounts will be submitted separately")}</NoAccountsReason>`);
  p(`    </Accounts>`);
  p(`    <Computations>`);
  if (i.computationsAttached) p(`      <ThisPeriodComputations>yes</ThisPeriodComputations>`);
  else p(`      <NoComputationsReason>${esc(i.noComputationsReason ?? "Computations will be submitted separately")}</NoComputationsReason>`);
  p(`    </Computations>`);
  p(`  </ReturnInfoSummary>`);

  p(`  <Turnover>`);
  p(`    <Total>${money(i.turnover)}</Total>`);
  p(`  </Turnover>`);

  p(`  <CompanyTaxCalculation>`);
  p(`    <Income>`);
  p(`      <Trading>`);
  p(`        <Profits>${money(i.tradingProfits)}</Profits>`);
  p(`        <LossesBroughtForward>${money(i.lossesBroughtForward ?? 0)}</LossesBroughtForward>`);
  p(`        <NetProfits>${money(netTrading)}</NetProfits>`);
  p(`      </Trading>`);
  p(`    </Income>`);
  // Box 235.
  p(`    <ProfitsBeforeOtherDeductions>${money(beforeOther)}</ProfitsBeforeOtherDeductions>`);
  // Box 300, which HMRC require whenever box 235 is above zero.
  p(`    <ChargesAndReliefs>`);
  p(`      <ProfitsBeforeDonationsAndGroupRelief>${money(beforeDonations)}</ProfitsBeforeDonationsAndGroupRelief>`);
  p(`    </ChargesAndReliefs>`);
  p(`    <ChargeableProfits>${money(chargeable)}</ChargeableProfits>`);
  p(`    <CorporationTaxChargeable>`);
  // A claim to the small profits rate has to be declared here, before the
  // financial year, and the element order is enforced by the schema.
  if (i.rate < 25) {
    p(`      <AssociatedCompanies>`);
    p(`        <ThisPeriod>${Math.max(0, Math.round(i.associatedCompanies ?? 0))}</ThisPeriod>`);
    p(`        <StartingOrSmallCompaniesRate>yes</StartingOrSmallCompaniesRate>`);
    p(`      </AssociatedCompanies>`);
  }
  p(`      <FinancialYearOne>`);
  p(`        <Year>${i.financialYear}</Year>`);
  p(`        <Details>`);
  p(`          <Profit>${money(Math.round(chargeable))}</Profit>`);
  // A percentage, not a fraction: 19.00 rather than 0.19. HMRC multiply the
  // profit by this and refuse the return if the answer isn't the tax shown.
  p(`          <TaxRate>${rate(i.rate)}</TaxRate>`);
  p(`          <Tax>${money(i.corporationTax)}</Tax>`);
  p(`        </Details>`);
  p(`      </FinancialYearOne>`);
  p(`    </CorporationTaxChargeable>`);
  p(`    <CorporationTax>${money(i.corporationTax)}</CorporationTax>`);
  p(`    <NetCorporationTaxChargeable>${money(i.corporationTax - (i.marginalRelief ?? 0))}</NetCorporationTaxChargeable>`);
  p(`    <TaxReliefsAndDeductions>`);
  p(`      <TotalReliefsAndDeductions>${money(i.totalReliefs ?? 0)}</TotalReliefsAndDeductions>`);
  p(`    </TaxReliefsAndDeductions>`);
  p(`  </CompanyTaxCalculation>`);

  p(`  <CalculationOfTaxOutstandingOrOverpaid>`);
  p(`    <NetCorporationTaxLiability>${money(i.corporationTax - (i.marginalRelief ?? 0))}</NetCorporationTaxLiability>`);
  p(`    <TaxChargeable>${money(i.corporationTax - (i.marginalRelief ?? 0))}</TaxChargeable>`);
  p(`    <TaxPayable>${money(i.taxPayable)}</TaxPayable>`);
  p(`  </CalculationOfTaxOutstandingOrOverpaid>`);

  p(`  <Declaration>`);
  p(`    <AcceptDeclaration>yes</AcceptDeclaration>`);
  p(`    <Name>${esc(i.declarantName)}</Name>`);
  p(`    <Status>${esc(i.declarantStatus)}</Status>`);
  p(`  </Declaration>`);

  // The attachments come last, after the declaration, and the iXBRL goes in
  // as live XML rather than encoded text.
  const acc = i.accountsAttached && i.accountsIxbrl ? nestable(i.accountsIxbrl) : null;
  const comp = i.computationsAttached && i.computationIxbrl ? nestable(i.computationIxbrl) : null;

  const block = (tag: "Accounts" | "Computation", doc: string) => {
    p(`      <${tag}>`);
    p(`        <Instance>`);
    p(`          <InlineXBRLDocument>`);
    p(doc);
    p(`          </InlineXBRLDocument>`);
    p(`        </Instance>`);
    p(`      </${tag}>`);
  };

  if (acc || comp) {
    const layout = i.attachLayout ?? "comp-first";
    p(`  <AttachedFiles>`);
    if (layout === "separate") {
      if (comp) { p(`    <XBRLsubmission>`); block("Computation", comp); p(`    </XBRLsubmission>`); }
      if (acc) { p(`    <XBRLsubmission>`); block("Accounts", acc); p(`    </XBRLsubmission>`); }
    } else {
      p(`    <XBRLsubmission>`);
      if (layout === "comp-first") {
        if (comp) block("Computation", comp);
        if (acc) block("Accounts", acc);
      } else {
        if (acc) block("Accounts", acc);
        if (comp) block("Computation", comp);
      }
      p(`    </XBRLsubmission>`);
    }
    p(`  </AttachedFiles>`);
  }

  p(`</CompanyTaxReturn>`);
  return L.join("\n");
}

/**
 * How the IRmark digest is produced.
 *
 * HMRC's specification is precise, but the published wording leaves room for
 * more than one reading, and working implementations in the wild disagree.
 * Rather than pick one and hope, all three readings are available and the
 * test service decides. A wrong choice shows up as error 9001 and nothing
 * else, so trying the next one costs a single resubmission.
 */
export type MarkMethod = "spec" | "exc-c14n" | "inc-c14n" | "inc-c14n-body";

export const MARK_METHODS: { key: MarkMethod; label: string; detail: string }[] = [
  {
    key: "spec",
    label: "HMRC specification",
    detail: "The algorithm from HMRC's own IRmark step-by-step guide: start at the Body element including its tags, copy GovTalkMessage's namespace declarations onto it, remove the IRmark element but keep the whitespace around it, canonicalise with inclusive Canonical XML 1.0, then SHA-1 and base64. Use this one.",
  },
  {
    key: "exc-c14n",
    label: "Exclusive C14N over IRenvelope",
    detail: "Exclusive XML Canonicalisation of the IRenvelope with the IRmark element removed. This is the reading HMRC's own wording suggests.",
  },
  {
    key: "inc-c14n",
    label: "Inclusive C14N over IRenvelope",
    detail: "The same, but Canonical XML 1.0 rather than exclusive. These two differ only in how inherited namespace declarations are carried, so for a return of this shape they produce an identical fingerprint — there are really two values to try, not three.",
  },
  {
    key: "inc-c14n-body",
    label: "Inclusive C14N over Body wrapper",
    detail: "Inclusive C14N over a Body element wrapping the IRenvelope, with both namespaces declared on it. This is what at least one working open-source submitter does.",
  },
];

/**
 * The IRmark: a SHA-1 digest of the canonicalised return, base64 encoded.
 *
 * HMRC repeat the calculation on arrival and refuse the submission with error
 * 9001 if their answer differs from ours.
 *
 * The important thing about canonicalisation is what it does *not* do: it does
 * not strip whitespace between elements, and the IRmark element is removed
 * from the parsed tree rather than cut out of the text, so the newline and
 * indentation that surrounded it survive — exactly as they do when HMRC delete
 * the node at their end.
 */
export function irMark(bodyXml: string, method: MarkMethod = "exc-c14n"): string {
  const canonical = canonicalWithoutMark(bodyXml, method);
  return createHash("sha1").update(canonical, "utf8").digest("base64");
}

/**
 * Whether the last digest was produced by real canonicalisation.
 *
 * Worth showing on screen: if HMRC return error 9001 and this says false,
 * the cause is a missing parser rather than anything in the return.
 */
let canonicalRan = false;
export const markWasCanonical = (): boolean => canonicalRan;

/**
 * The IRmark in the form HMRC quote back.
 *
 * The same twenty bytes appear twice in a filing: base64 inside the XML, and
 * base32 in the receipt and anywhere a person reads it. A client querying a
 * filing will cite the base32 form, so it has to be derivable from what we
 * stored. HMRC's specification calls for exactly this pairing.
 */
export function markForPeople(base64Mark: string): string {
  const bytes = Buffer.from(base64Mark, "base64");
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const b of bytes) bits += b.toString(2).padStart(8, "0");
  while (bits.length % 5 !== 0) bits += "0";
  let out = "";
  for (let i = 0; i < bits.length; i += 5) out += alphabet[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}

/** The canonical text that was digested, kept so it can be inspected. */
let lastCanonical = "";
export const markCanonicalText = (): string => lastCanonical;

function canonicalWithoutMark(bodyXml: string, method: MarkMethod): string {
  // The Body wrapper variant needs the IRenvelope nested inside a Body element
  // carrying both namespace declarations, so it is built as text before
  // parsing rather than assembled afterwards.
  // For "spec" the caller has already assembled the Body element exactly as it
  // will be serialised, so it is canonicalised as given — the whitespace
  // inside it is part of the digest.
  const source = method === "inc-c14n-body"
    ? `<Body xmlns="${GOVTALK_NAMESPACE}" xmlns:ct="${CT_NAMESPACE}">${bodyXml.trim()}</Body>`
    : method === "spec"
      ? bodyXml
      : bodyXml.trim();

  const doc = new DOMParser().parseFromString(source, "text/xml");
  const root = doc.documentElement;
  if (!root) throw new Error("The return isn't valid XML, so no IRmark can be calculated.");

  for (const m of Array.from(root.getElementsByTagName("IRmark"))) {
    m.parentNode?.removeChild(m);
  }

  const engine = method === "exc-c14n"
    ? new ExclusiveCanonicalization()
    : new C14nCanonicalization();

  // The signature varies between xml-crypto versions; only the node matters.
  const out = String((engine as unknown as { process(n: unknown, o: object): string }).process(root, {}));
  canonicalRan = true;
  lastCanonical = out;
  return out;
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
  /** Which reading of the IRmark specification to use. */
  markMethod?: MarkMethod;
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
  const method = i.markMethod ?? "spec";

  /**
   * The Body exactly as the envelope will carry it.
   *
   * HMRC's IRmark guide starts from the Body element, tags included, with
   * GovTalkMessage's namespace declarations copied onto it — and only those,
   * which here is the single default declaration. The whitespace inside Body
   * counts too, because HMRC recompute the digest from the document they
   * receive, so this has to be byte-for-byte what gets sent.
   */
  const bodyForMark = `<Body xmlns="${GOVTALK_NAMESPACE}">\n${inner}\n  </Body>`;

  const mark = method === "spec" ? irMark(bodyForMark, "spec") : irMark(inner, method);
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
    <TargetDetails>
      <Organisation>HMRC</Organisation>
    </TargetDetails>
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
