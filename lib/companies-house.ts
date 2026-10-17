import { createHash } from "crypto";
import { DOMParser } from "@xmldom/xmldom";

/**
 * Filing accounts with Companies House through its XML Gateway.
 *
 * Every rule here comes from Companies House's own documents, cited by name:
 *
 *   TIS       Companies House Technical Interface Specification v5.3
 *   TIS-AA    Accounts Technical Interface Specification v6.0 (29/09/2026)
 *
 * Where the specifications leave a value to the schema files, the value used
 * matches an envelope Companies House's gateway is known to have parsed (a
 * micro-entity iXBRL submission on their developer forum, July 2025, which
 * got as far as checking credentials — parsing comes first). Those values are
 * marked "schema to confirm" until the XSDs from xmlgw.companieshouse.gov.uk/
 * SchemaStatus have been checked locally.
 *
 * Unlike HMRC, Companies House answers in two stages. The submission itself
 * is parsed and acknowledged within the same connection; the accounts are
 * then examined asynchronously, which "can take up to 5 days though the vast
 * majority are processed within 24 hours" (TIS 1.2.4.2). The result has to
 * be fetched later with GetSubmissionStatus.
 */

/** TIS 1.2.3.2: a single entry point for test and live; GatewayTest tells them apart. */
export const CH_GATEWAY = process.env.CH_GATEWAY_URL ?? "https://xmlgw.companieshouse.gov.uk/v1-0/xmlgw/Gateway";

const ENVELOPE_NS = "http://www.govtalk.gov.uk/CM/envelope";
const ENVELOPE_XSD = "http://xmlgw.companieshouse.gov.uk/v1-0/schema/Egov_ch-v2-0.xsd";
const FORM_NS = "http://xmlgw.companieshouse.gov.uk/Header";
const FORM_XSD = "http://xmlgw.companieshouse.gov.uk/v1-0/schema/forms/FormSubmission-v2-11.xsd";
const CH_NS = "http://xmlgw.companieshouse.gov.uk";

const esc = (v: string): string =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * TIS 1.2.7 and 3.1: the presenter ID becomes the SenderID, and the
 * presenter authentication code becomes the Value, each "through the
 * lowercase MD5 Hash algorithm". Companies House staff confirmed on their
 * forum that the usual 502 "Authorisation Failure" comes from getting this
 * wrong — hash the value as issued, and use the lowercase hex digest.
 */
export const md5lower = (v: string): string =>
  createHash("md5").update(v, "utf8").digest("hex").toLowerCase();

export interface ChPresenter {
  presenterId: string;
  authCode: string;
  email: string;
  /** Issued by Companies House on authorisation; "any" is accepted in test (TIS 4.3.2). */
  packageReference: string;
  test: boolean;
}

/** Reads the presenter credentials, which live only in the hosting environment. */
export function chPresenter(): { presenter: ChPresenter | null; missing: string[] } {
  const missing: string[] = [];
  const presenterId = process.env.CH_PRESENTER_ID?.trim();
  const authCode = process.env.CH_PRESENTER_AUTH?.trim();
  const email = (process.env.CH_CONTACT_EMAIL ?? process.env.HMRC_CONTACT_EMAIL ?? "").trim();
  if (!presenterId) missing.push("CH_PRESENTER_ID isn't set. It's the test presenter ID Companies House email you.");
  if (!authCode) missing.push("CH_PRESENTER_AUTH isn't set. It's the presenter authentication code from the same email.");
  if (!email) missing.push("CH_CONTACT_EMAIL isn't set. Companies House use it to tell you about submissions waiting.");
  if (missing.length) return { presenter: null, missing };
  return {
    presenter: {
      presenterId: presenterId!,
      authCode: authCode!,
      email,
      // TIS 4.3.2: "Any <PackageReference> … can be used" in test. Live
      // filings must carry the reference Companies House issue on authorisation.
      packageReference: process.env.CH_PACKAGE_REFERENCE?.trim() || "0012",
      test: true,
    },
    missing: [],
  };
}

/**
 * TIS-AA preconditions: only companies registered in England and Wales
 * (8 digits), Scotland (SC + 6 digits) or Northern Ireland (NI + 6 digits,
 * or R + 7 digits) can file accounts electronically.
 */
export function companyNumberProblem(n: string): string | null {
  const v = n.trim().toUpperCase();
  if (/^\d{8}$/.test(v) || /^SC\d{6}$/.test(v) || /^NI\d{6}$/.test(v) || /^R\d{7}$/.test(v)) return null;
  return "Company number must be 8 digits, or SC, NI or R followed by digits — only companies registered in the UK can file accounts electronically.";
}

/** The jurisdiction code for the form header (schema to confirm). */
export function companyTypeFor(n: string): "EW" | "SC" | "NI" {
  const v = n.trim().toUpperCase();
  if (v.startsWith("SC")) return "SC";
  if (v.startsWith("NI") || v.startsWith("R")) return "NI";
  return "EW";
}

/** TIS 3.2.2: "The code can be any 6 alphanumeric characters (A-Z, 0-9)." */
export function authCodeProblem(c: string): string | null {
  return /^[A-Z0-9]{6}$/.test(c.trim().toUpperCase())
    ? null
    : "The company authentication code is 6 letters or numbers. It comes from Companies House, not HMRC.";
}

/**
 * TIS 2.0 TransactionID: "unique … and each number should also be greater
 * than the last." Sixteen hexadecimal characters from the clock in
 * milliseconds always increases; the previous value is passed in so two
 * sends within the same millisecond still go upwards.
 */
export function nextTransactionId(previous?: string | null): string {
  const now = BigInt(Date.now());
  const prev = previous && /^[0-9A-F]{16}$/i.test(previous) ? BigInt("0x" + previous) : 0n;
  const next = now > prev ? now : prev + 1n;
  return next.toString(16).toUpperCase().padStart(16, "0");
}

/**
 * TIS 2.1.3: each document needs a SubmissionNumber the presenter allocates,
 * which must never be sent twice — "Companies House will reject the
 * submission". Six characters, A-Z and 0-9 (schema to confirm), counted in
 * seconds since 1 January 2026 so a new one is always new. The caller also
 * checks it against every number already used.
 */
export function newSubmissionNumber(): string {
  const seconds = Math.floor((Date.now() - Date.UTC(2026, 0, 1)) / 1000);
  return seconds.toString(36).toUpperCase().padStart(6, "0").slice(-6);
}

/**
 * TIS-AA 2: "iXBRL documents must contain <?xml version="1.0"?> with no
 * additional white spaces in the string declaration as the first line of the
 * Instance." The declaration is replaced with exactly that. With no encoding
 * named, XML reads the document as UTF-8, which it is.
 */
export function ixbrlForCompaniesHouse(doc: string): string {
  const body = doc.replace(/^﻿?\s*<\?xml[^>]*\?>\s*/, "").replace(/^\s+/, "");
  return `<?xml version="1.0"?>\n${body}`;
}

export interface ChAccountsSubmission {
  companyNumber: string;
  companyName: string;
  companyAuthCode: string;
  contactName: string;
  contactNumber: string;
  customerReference?: string;
  /** The date the accounts were signed, YYYY-MM-DD. */
  dateSigned: string;
  submissionNumber: string;
  transactionId: string;
  /** The complete iXBRL accounts. */
  ixbrl: string;
}

function header(p: ChPresenter, cls: string, fn: "submit" | "read", transactionId: string): string {
  return `  <EnvelopeVersion>2.0</EnvelopeVersion>
  <Header>
    <MessageDetails>
      <Class>${cls}</Class>
      <Qualifier>request</Qualifier>
      <Function>${fn}</Function>
      <TransactionID>${esc(transactionId)}</TransactionID>${p.test ? `
      <GatewayTest>1</GatewayTest>` : ""}
    </MessageDetails>
    <SenderDetails>
      <IDAuthentication>
        <SenderID>${md5lower(p.presenterId)}</SenderID>
        <Authentication>
          <Method>clear</Method>
          <Value>${md5lower(p.authCode)}</Value>
        </Authentication>
      </IDAuthentication>
      <EmailAddress>${esc(p.email)}</EmailAddress>
    </SenderDetails>
  </Header>`;
}

const open = `<?xml version="1.0" encoding="UTF-8"?>
<GovTalkMessage xmlns="${ENVELOPE_NS}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                xsi:schemaLocation="${ENVELOPE_NS} ${ENVELOPE_XSD}">`;

/**
 * An accounts filing.
 *
 * TIS-AA 2: the iXBRL "should be a self-contained 'file' transferred as a
 * Base 64 encoded string within the <Document> element of the
 * <FormSubmission> schema", and details such as the company number must
 * appear both here and inside the accounts. The <Form> element stays empty
 * for an iXBRL accounts submission.
 */
export function buildChAccountsEnvelope(p: ChPresenter, s: ChAccountsSubmission): string {
  const data = Buffer.from(ixbrlForCompaniesHouse(s.ixbrl), "utf8").toString("base64");
  return `${open}
${header(p, "Accounts", "submit", s.transactionId)}
  <GovTalkDetails>
    <Keys>
      <Key Type="FormType">Accounts</Key>
    </Keys>
    <TargetDetails>
      <Organisation>Companies House</Organisation>
    </TargetDetails>
  </GovTalkDetails>
  <Body>
    <FormSubmission xmlns="${FORM_NS}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                    xsi:schemaLocation="${FORM_NS} ${FORM_XSD}">
      <FormHeader>
        <CompanyNumber>${esc(s.companyNumber.trim().toUpperCase())}</CompanyNumber>
        <CompanyType>${companyTypeFor(s.companyNumber)}</CompanyType>
        <CompanyName>${esc(s.companyName.trim().toUpperCase())}</CompanyName>
        <CompanyAuthenticationCode>${esc(s.companyAuthCode.trim().toUpperCase())}</CompanyAuthenticationCode>
        <PackageReference>${esc(p.packageReference)}</PackageReference>
        <Language>EN</Language>
        <FormIdentifier>Accounts</FormIdentifier>
        <SubmissionNumber>${esc(s.submissionNumber)}</SubmissionNumber>
        <ContactName>${esc(s.contactName)}</ContactName>
        <ContactNumber>${esc(s.contactNumber)}</ContactNumber>${s.customerReference ? `
        <CustomerReference>${esc(s.customerReference)}</CustomerReference>` : ""}
      </FormHeader>
      <DateSigned>${esc(s.dateSigned)}</DateSigned>
      <Form></Form>
      <Document>
        <Data>${data}</Data>
        <Date>${esc(s.dateSigned)}</Date>
        <Filename>accounts.html</Filename>
        <ContentType>application/xml</ContentType>
        <Category>ACCOUNTS</Category>
      </Document>
    </FormSubmission>
  </Body>
</GovTalkMessage>`;
}

/**
 * GetSubmissionStatus (TIS 2.5): one submission by number, or — with no
 * number — every completed submission not yet acknowledged, up to 20.
 */
export function buildChStatusEnvelope(p: ChPresenter, transactionId: string, submissionNumber?: string): string {
  return `${open}
${header(p, "GetSubmissionStatus", "read", transactionId)}
  <GovTalkDetails>
    <Keys>
      <Key Type="FormType">GetSubmissionStatus</Key>
    </Keys>
    <TargetDetails>
      <Organisation>Companies House</Organisation>
    </TargetDetails>
  </GovTalkDetails>
  <Body>
    <GetSubmissionStatus xmlns="${CH_NS}">${submissionNumber ? `
      <SubmissionNumber>${esc(submissionNumber)}</SubmissionNumber>` : ""}
      <PresenterID>${md5lower(p.presenterId)}</PresenterID>
    </GetSubmissionStatus>
  </Body>
</GovTalkMessage>`;
}

/**
 * TIS 2.5.1: after a general poll, acknowledge it, or the same results come
 * back next time. "The root element of the GetStatusAck schema is StatusAck.
 * Please ensure you … use this in the 'Class' element."
 */
export function buildChAckEnvelope(p: ChPresenter, transactionId: string): string {
  return `${open}
${header(p, "StatusAck", "submit", transactionId)}
  <GovTalkDetails>
    <TargetDetails>
      <Organisation>Companies House</Organisation>
    </TargetDetails>
  </GovTalkDetails>
  <Body>
    <StatusAck xmlns="${CH_NS}"/>
  </Body>
</GovTalkMessage>`;
}

/** Blanks what must never be stored or shown: the password hash and the company's filing code. */
export function redactCh(envelope: string): string {
  return envelope
    .replace(/(<Value>)[\s\S]*?(<\/Value>)/g, "$1••••••••$2")
    .replace(/(<CompanyAuthenticationCode>)[\s\S]*?(<\/CompanyAuthenticationCode>)/g, "$1••••••$2");
}

export interface ChStatus {
  submissionNumber: string;
  statusCode: string;
  /** Reasons given for a rejection, in Companies House's words. */
  reasons: string[];
}

export interface ChReply {
  qualifier: string | null;
  /** TIS 2.0: "This time will be the legal receipt date of the transaction." */
  timestamp: string | null;
  errors: { number: string; type: string; text: string }[];
  statuses: ChStatus[];
}

const local = (el: Element, name: string): Element[] =>
  Array.from(el.getElementsByTagName("*")).filter((e) => (e.localName ?? e.nodeName.split(":").pop()) === name);
const text = (el: Element | undefined): string => (el?.textContent ?? "").trim();

/**
 * Reads a gateway reply.
 *
 * Errors in the envelope (TIS 2.0 GovTalkErrors) mean the submission was not
 * received at all. Results from polling sit in <Status> blocks with a
 * <StatusCode> such as ACCEPT, REJECT or PENDING. The names of the elements
 * carrying rejection reasons are confirmed against the schema separately, so
 * any Description, Text or Message inside a status is collected.
 */
export function parseChReply(xml: string): ChReply {
  const doc = new DOMParser({ onError: () => undefined }).parseFromString(xml, "text/xml");
  const root = doc.documentElement as unknown as Element | null;
  if (!root) return { qualifier: null, timestamp: null, errors: [{ number: "", type: "fatal", text: "The reply wasn't readable XML." }], statuses: [] };
  const errors = local(root, "Error").map((e) => ({
    number: text(local(e, "Number")[0]),
    type: text(local(e, "Type")[0]),
    text: text(local(e, "Text")[0]),
  }));
  const statuses = local(root, "Status").filter((s) => local(s, "StatusCode").length > 0).map((s) => ({
    submissionNumber: text(local(s, "SubmissionNumber")[0]),
    statusCode: text(local(s, "StatusCode")[0]).toUpperCase(),
    reasons: ["Description", "Text", "Message", "RejectMessage", "Reject_message"]
      .flatMap((n) => local(s, n).map(text)).filter(Boolean),
  }));
  return {
    qualifier: text(local(root, "Qualifier")[0]) || null,
    timestamp: text(local(root, "GatewayTimestamp")[0]) || null,
    errors,
    statuses,
  };
}

/** TIS 1.2.10: a submission's Base64 data "must be a maximum of 1.2 million characters". */
export const CH_MAX_DATA_CHARS = 1_200_000;

/** Posts an envelope; TIS 1.2.2.1: "HTTPS POST method, with a Content-Type of text/xml". */
export async function postToCompaniesHouse(envelope: string): Promise<{ status: number; text: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45_000);
  try {
    const res = await fetch(CH_GATEWAY, {
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=utf-8" },
      body: envelope,
      signal: ctrl.signal,
    });
    return { status: res.status, text: await res.text() };
  } finally {
    clearTimeout(timer);
  }
}
