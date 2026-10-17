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
 * The accounts envelope is validated locally against Companies House's live
 * schemas, Egov_ch-v2-0.xsd (the envelope) and FormSubmission-v2-11.xsd (the
 * form header), both "live" on xmlgw.companieshouse.gov.uk/SchemaStatus.
 * The status and acknowledgement bodies are validated against
 * GetSubmissionStatus-v2-9.xsd and GetStatusAck-v1-1.xsd once those are in
 * hand; until then they follow the TIS wording and are marked "schema to
 * confirm".
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
  else if (!chEmailOk(email)) missing.push("CH_CONTACT_EMAIL can only use letters, numbers, dots, hyphens and underscores — Companies House's format has no room for a + sign.");
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
 * TIS 2.1: "Only Limited companies with a company number starting with a 0
 * (zero) or 1, SC, NI or R0 are allowed to file electronically." Numbers are
 * eight characters in full, so an England and Wales number is 8 digits.
 */
export function companyNumberProblem(n: string): string | null {
  const v = n.trim().toUpperCase();
  if (/^[01]\d{7}$/.test(v) || /^SC\d{6}$/.test(v) || /^NI\d{6}$/.test(v) || /^R0\d{6}$/.test(v)) return null;
  return "Company number must be the full 8 characters as on the register — 8 digits starting 0 or 1, or SC, NI or R0 followed by digits. Only UK limited companies can file accounts this way.";
}

/**
 * The jurisdiction code for the form header. FormSubmission-v2-11.xsd
 * enumerates EW, SC, NI, R, OC, SO and NC; TIS Appendix A gives NI and R
 * numbers both as Northern Ireland companies.
 */
export function companyTypeFor(n: string): "EW" | "SC" | "NI" {
  const v = n.trim().toUpperCase();
  if (v.startsWith("SC")) return "SC";
  if (v.startsWith("NI") || v.startsWith("R")) return "NI";
  return "EW";
}

/**
 * The company number as the form header wants it. FormSubmission-v2-11.xsd
 * types <CompanyNumber> as xs:integer — "digits only" — and TIS 2.1 says:
 * "if a Scottish company number is 'SC123456', it should be '123456' in the
 * company number and choose 'SC' in the company type element." The prefix
 * travels in <CompanyType> instead. (The accounts themselves keep the full
 * registered number.)
 */
export function formCompanyNumber(n: string): string {
  return n.trim().toUpperCase().replace(/^(SC|NI|R)/, "");
}

/**
 * FormSubmission-v2-11.xsd nameAddressString: the only characters Companies
 * House accept in a company or contact name — A-Z, a-z, digits, common
 * punctuation and accented capitals. Generated from the schema's own pattern.
 */
const NAME_CHARS =
  "\\u002D\\u002C\\u002E\\u003A\\u003B\\u0020\\u0030-\\u0039\\u0041-\\u005A\\u0026\\u0040\\u0024\\u00A3\\u00A5\\u20AC\\u0027\\u0022\\u00AB\\u00BB\\u2018\\u2019\\u201C\\u201D\\u003F\\u0021\\u002F\\u005C\\u0028\\u0029\\u005B\\u005D\\u007B\\u007D\\u003C\\u003E\\u002A\\u003D\\u0023\\u0025\\u002B" +
  "\\u00C0\\u00C1\\u00C2\\u00C3\\u00C4\\u00C5\\u0100\\u0102\\u0104\\u00C6\\u01FC\\u00C7\\u0106\\u0108\\u010A\\u010C\\u00DE\\u010E\\u00D0\\u00C8\\u00C9\\u00CA\\u00CB\\u0112\\u0114\\u0116\\u0118\\u011A\\u011C\\u011E\\u0120\\u0122\\u0124\\u0126\\u00CC\\u00CD\\u00CE\\u00CF\\u0128\\u012A\\u012C\\u012E\\u0130\\u0134\\u0136\\u0139\\u013B\\u013D\\u013F\\u0141\\u00D1\\u0143\\u0145\\u0147\\u014A\\u00D2\\u00D3\\u00D4\\u00D5\\u00D6\\u00D8\\u014C\\u014E\\u0150\\u01FE\\u0152\\u0154\\u0156\\u0158\\u015A\\u015C\\u015E\\u0160\\u0162\\u0164\\u0166\\u00D9\\u00DA\\u00DB\\u00DC\\u0168\\u016A\\u016C\\u016E\\u0170\\u0172\\u0174\\u1E80\\u1E82\\u1E84\\u1EF2\\u00DD\\u0176\\u0178\\u0179\\u017B\\u017D" +
  "\\u0061-\\u007A\\u00C0\\u00D6\\u00D8\\u017F\\u0192\\u01FA\\u01FF\\u1E80\\u1E85\\u1EF2\\u1EF3";
const NAME_RE = new RegExp(`^[${NAME_CHARS}]*$`, "u");

/** The company name as sent: spaces collapsed (the schema's whiteSpace="collapse"), capitals. */
export const formCompanyName = (v: string): string => v.trim().replace(/\s+/g, " ").toUpperCase();

/** FormHeader limits from FormSubmission-v2-11.xsd, checked before anything is sent. */
export function formHeaderProblems(s: {
  companyName: string; contactName: string; contactNumber: string; customerReference?: string;
}): string[] {
  const out: string[] = [];
  const name = formCompanyName(s.companyName);
  if (name.length < 3 || name.length > 160) out.push("Companies House need the company name to be between 3 and 160 characters.");
  else if (!NAME_RE.test(name)) out.push("The company name has a character Companies House don't accept. Use letters, numbers and ordinary punctuation, as it appears on the register.");
  if (!NAME_RE.test(s.contactName.trim())) {
    out.push("The contact name has a character Companies House don't accept. Use plain letters (accented capitals are fine, accented small letters are not).");
  }
  if (s.contactNumber.trim().length > 25) out.push("The contact phone number can be at most 25 characters.");
  if (s.customerReference && !/^[A-Za-z0-9]{0,25}$/.test(s.customerReference)) {
    out.push("Your reference can only use letters and numbers, up to 25.");
  }
  return out;
}

/** Egov_ch-v2-0.xsd EmailAddress: 3–129 characters, letters, digits, dot, hyphen and underscore either side of the @. */
export const chEmailOk = (e: string): boolean =>
  e.length >= 3 && e.length <= 129 && /^[A-Za-z0-9.\-_]{1,64}@[A-Za-z0-9.\-_]{1,64}$/.test(e);

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
 * submission". FormSubmission-v2-11.xsd: exactly six characters. These are
 * A-Z and 0-9, counted in seconds since 1 January 2026 so a new one is
 * always new. The caller also checks it against every number already used.
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

/**
 * The GovTalk header. <Function> is optional in Egov_ch-v2-0.xsd; it is sent
 * with accounts (as in envelopes Companies House's gateway has answered on
 * their forum) and left out of status requests and acknowledgements, as in
 * Companies House's own examples GetSubmissionStatus_request.xml and
 * GetStatusAck.xml.
 */
function header(p: ChPresenter, cls: string, fn: "submit" | null, transactionId: string): string {
  return `  <EnvelopeVersion>2.0</EnvelopeVersion>
  <Header>
    <MessageDetails>
      <Class>${cls}</Class>
      <Qualifier>request</Qualifier>${fn ? `
      <Function>${fn}</Function>` : ""}
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
 * Class is "Accounts". TIS 2.0 lists the form as "AA", but Companies House's
 * gateway answers accounts submissions under the class "Accounts" (their
 * forum, threads 346 and 1788, show replies with <Class>Accounts</Class> and
 * errors "Raised By: Accounts"), and FormIdentifier repeats it as TIS 2.1
 * requires.
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
        <CompanyNumber>${esc(formCompanyNumber(s.companyNumber))}</CompanyNumber>
        <CompanyType>${companyTypeFor(s.companyNumber)}</CompanyType>
        <CompanyName>${esc(formCompanyName(s.companyName))}</CompanyName>
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
 * GetSubmissionStatus-v2-9.xsd: an optional SubmissionNumber (or
 * CompanyNumber), then PresenterID. Companies House staff advise polling by
 * submission number where possible, "as this usually works" (forum, 226).
 *
 * PresenterID carries the same lowercase MD5 value as SenderID (schema to
 * confirm on the first test poll: the schema types it only as a string, and
 * Companies House's example uses a placeholder).
 */
export function buildChStatusEnvelope(p: ChPresenter, transactionId: string, submissionNumber?: string): string {
  return `${open}
${header(p, "GetSubmissionStatus", null, transactionId)}
  <GovTalkDetails>
    <Keys/>
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
 * Please ensure you … use this in the 'Class' element." GetStatusAck-v1-1.xsd:
 * "This element must be empty."
 */
export function buildChAckEnvelope(p: ChPresenter, transactionId: string): string {
  return `${open}
${header(p, "StatusAck", null, transactionId)}
  <GovTalkDetails>
    <Keys/>
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
  /** GetSubmissionStatus-v2-9.xsd: ACCEPT, REJECT, PENDING, PARKED or INTERNAL_FAILURE. */
  statusCode: string;
  companyNumber: string;
  /** Reasons given for a rejection, in Companies House's words. */
  reasons: string[];
  /** The examiner's note, when there is one. */
  comment: string;
  /** What the status means, in plain words. */
  meaning: string;
}

/** What each status means, for the screen. */
export const CH_STATUS_TEXT: Record<string, string> = {
  ACCEPT: "Accepted — the accounts are on the public register.",
  REJECT: "Rejected — see the reasons. The accounts have not been filed.",
  PENDING: "Still being examined.",
  PARKED: "On hold — Companies House need more information before they carry on.",
  INTERNAL_FAILURE: "Companies House had a fault processing it. Contact them with the submission number.",
};

/**
 * TIS Appendix B, in plain words, for the errors a filing is likely to meet.
 * The gateway's own text is always shown alongside.
 */
export function chErrorHelp(number: string): string | null {
  const n = Number(number);
  if (!Number.isFinite(n) || number === "") return null;
  if (n <= 16 || [1002, 1100, 1101, 1201, 6001, 6002, 6003, 6004, 6005].includes(n)) return "Companies House's service is down at the moment. Nothing was filed; try again later.";
  const help: Record<number, string> = {
    500: "The message was sent with the wrong content type. This is a software fault — report it.",
    501: "Companies House didn't recognise the type of filing. This is a software fault — report it.",
    502: "The presenter ID or authentication code wasn't accepted. Check the two Companies House settings are exactly as issued, then redeploy.",
    503: "The transaction ID wasn't higher than the last one. Sending again fixes this.",
    504: "Too many requests in a short time. Wait a few minutes and try again.",
    604: "The request had a missing or invalid field.",
    702: "Companies House are busy. Try again shortly.",
    705: "The message was sent with the wrong content type. This is a software fault — report it.",
    800: "Companies House's gateway had an internal fault. Try again later.",
    900: "Companies House have a temporary system fault, and their engineers have been told. Try again later.",
    1200: "Companies House's services are having problems, which may not last. Try again shortly.",
    9001: "That company number isn't on the live register.",
    9101: "The company number isn't in a valid format.",
  };
  return help[n] ?? null;
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
 * received at all. Results from polling follow GetSubmissionStatus-v2-9.xsd:
 * <SubmissionStatus><Status> blocks, each with SubmissionNumber, StatusCode,
 * CompanyNumber, and for a rejection <Rejections><Reject><RejectCode>
 * <Description>. TIS 2.5 also names <Reject_message> ("No Transaction Found")
 * and <message> ("Undefined Error"), so those are read too.
 */
export function parseChReply(xml: string): ChReply {
  const doc = new DOMParser({ onError: () => undefined }).parseFromString(xml, "text/xml");
  const root = doc.documentElement as unknown as Element | null;
  if (!root) return { qualifier: null, timestamp: null, errors: [{ number: "", type: "fatal", text: "The reply wasn't readable XML." }], statuses: [] };
  const errors = local(root, "Error").map((e) => ({
    number: text(local(e, "Number")[0]),
    type: text(local(e, "Type")[0]),
    text: local(e, "Text").map(text).filter(Boolean).join(" "),
  }));
  const statuses = local(root, "Status").filter((s) => local(s, "StatusCode").length > 0).map((s) => ({
    submissionNumber: text(local(s, "SubmissionNumber")[0]).toUpperCase(),
    statusCode: text(local(s, "StatusCode")[0]).toUpperCase(),
    companyNumber: text(local(s, "CompanyNumber")[0]),
    reasons: [
      ...local(s, "Reject").map((r) => {
        const d = text(local(r, "Description")[0]);
        const c = text(local(r, "RejectCode")[0]);
        return d ? (c ? `${d} (code ${c})` : d) : "";
      }),
      ...["Reject_message", "RejectMessage", "message", "Message"].flatMap((n) => local(s, n).map(text)),
    ].filter(Boolean),
    comment: text(local(local(s, "Examiner")[0] ?? s, "Comment")[0]),
    meaning: CH_STATUS_TEXT[text(local(s, "StatusCode")[0]).toUpperCase()] ?? "",
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
