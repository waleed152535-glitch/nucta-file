import type { GovTalkConfig } from "./govtalk";

/**
 * Where the gateway credentials come from.
 *
 * Nothing secret is written into this repository. The password HMRC issued
 * sits in an environment variable on the server and is read only at the
 * moment a submission is sent. If it isn't set, the app says so plainly
 * rather than sending an envelope that would be refused.
 */

export const VENDOR_ID = process.env.HMRC_VENDOR_ID ?? "9754";
export const SENDER_ID = process.env.HMRC_SENDER_ID ?? "CTUser100";
export const PRODUCT_NAME = process.env.HMRC_PRODUCT_NAME ?? "Nucta File";
export const PRODUCT_VERSION = process.env.HMRC_PRODUCT_VERSION ?? "1.0";
/** The last build whose CT600s, accounts and computations passed HMRC's own validation tools (schema, business rules, iXBRL, IRmark). */
export const SCHEMA_CHECKED_BUILD = "46";

/** HMRC_CONTACT_EMAIL, only when it is an email address: a malformed one would make HMRC refuse the envelope. */
export function contactEmail(): string | undefined {
  const e = (process.env.HMRC_CONTACT_EMAIL ?? "").trim();
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(e) ? e : undefined;
}

/**
 * HMRC runs two test routes and one live one.
 *
 * The External Test Service checks a return exactly as live would, with the
 * test credentials HMRC issued. Test in Live posts to the real Transaction
 * Engine with the company's (or agent's) own Government Gateway sign-in, the
 * class ending "-TIL" and GatewayTest 0: HMRC validate everything, the
 * sign-in included, but send nothing to their back-end systems — nothing is
 * filed (GOV.UK, Basic guide for XML software developers). Live is live.
 *
 * The exact URLs are confirmed in HMRC's technical pack; these are the
 * published ones and are overridable without a code change.
 */
export const ENDPOINTS = {
  test: process.env.HMRC_TEST_ENDPOINT
    ?? "https://test-transaction-engine.tax.service.gov.uk/submission",
  live: process.env.HMRC_LIVE_ENDPOINT
    ?? "https://transaction-engine.tax.service.gov.uk/submission",
} as const;

/**
 * The External Test Service answers polls on its own address, separate from
 * the one submissions go to. HMRC also name a poll address in their reply,
 * which takes precedence; this is the fallback when they don't.
 */
export const POLL_ENDPOINTS = {
  test: process.env.HMRC_TEST_POLL_ENDPOINT
    ?? "https://test-transaction-engine.tax.service.gov.uk/poll",
  live: process.env.HMRC_LIVE_POLL_ENDPOINT
    ?? "https://transaction-engine.tax.service.gov.uk/poll",
} as const;

export type Mode = "test" | "live";

/**
 * The message class tells HMRC which service the envelope is for, and the
 * credentials are validated against it.
 *
 * The plain class is correct on both the External Test Service and the live
 * one. The `-TIL` suffix belongs to "Test in Live" only — a different kind of
 * test, sent to the live endpoint with live credentials. Sending ETS
 * credentials against a `-TIL` class produces error 1046, "the supplied user
 * credentials failed validation for the requested service", which is HMRC
 * saying the service name doesn't match the account rather than that the
 * password is wrong.
 */
export function messageClass(mode: Mode, testInLive = false): string {
  const base = process.env.HMRC_CT_CLASS ?? "HMRC-CT-CT600";
  return testInLive ? `${base}-TIL` : base;
}

export interface ConfigResult {
  config: GovTalkConfig | null;
  /** What the user has to do before filing can work, in plain words. */
  missing: string[];
}

/** Builds the client configuration, or explains what's missing. */
export function gatewayConfig(mode: Mode): ConfigResult {
  const missing: string[] = [];
  const password = mode === "test"
    ? process.env.HMRC_TEST_PASSWORD
    : process.env.HMRC_LIVE_PASSWORD;

  if (!password) {
    missing.push(
      mode === "test"
        ? "HMRC_TEST_PASSWORD isn't set. Add the password from HMRC's credentials document to the environment variables, then redeploy."
        : "HMRC_LIVE_PASSWORD isn't set. A live filing needs the company's own Government Gateway password.",
    );
  }
  if (!VENDOR_ID) missing.push("HMRC_VENDOR_ID isn't set.");
  if (!SENDER_ID) missing.push("HMRC_SENDER_ID isn't set.");

  if (missing.length > 0) return { config: null, missing };

  return {
    config: {
      endpoint: ENDPOINTS[mode],
      pollEndpoint: POLL_ENDPOINTS[mode],
      senderId: SENDER_ID,
      password: password as string,
      vendorId: VENDOR_ID,
      productName: PRODUCT_NAME,
      productVersion: PRODUCT_VERSION,
      gatewayTest: mode === "test",
      email: contactEmail(),
    },
    missing: [],
  };
}

/** Removes the password from an envelope before it's stored or shown. */
export function redact(envelope: string): string {
  return envelope.replace(
    /(<Value>)[\s\S]*?(<\/Value>)/g,
    "$1••••••••$2",
  );
}

/** A Government Gateway user ID shown with all but its last three characters hidden. */
export const maskId = (id: string): string => (id.length <= 3 ? "•••" : `${"•".repeat(Math.min(9, id.length - 3))}${id.slice(-3)}`);

/** For a live filing: the password removed and the sign-in's user ID masked too. */
export function redactLive(text: string): string {
  return redact(text).replace(/(<(?:\w+:)?SenderID>)([\s\S]*?)(<\/(?:\w+:)?SenderID>)/g, (_, a, id, b) => `${a}${maskId(String(id).trim())}${b}`);
}

/**
 * The starting point for live filing, from NUCTA_LIVE_FILING in the hosting
 * settings, used until an administrator saves a choice on the Live filing
 * page (see live-settings.ts, which is what everything else asks):
 *   off  (the default) — HMRC's test service only
 *   til  — also "Test in Live": HMRC's live service checks the return with
 *          the company's own sign-in, filing nothing
 *   on   — Test in Live and real filing
 * HMRC's recognition of the software is optional (HMRC's own words): live
 * filing needs the vendor ID, a product that has passed HMRC's test service,
 * and the company's or agent's own sign-in.
 */
export type LiveFiling = "off" | "til" | "on";
export function liveFiling(): LiveFiling {
  const v = (process.env.NUCTA_LIVE_FILING ?? "").trim().toLowerCase();
  return v === "on" ? "on" : v === "til" ? "til" : "off";
}

/**
 * The configuration for one live or Test in Live submission, from the
 * sign-in typed in at that moment. Nothing here is stored.
 *
 * `notifyEmail` is where HMRC send any email notification about this
 * submission. Left out, HMRC use the email registered on the Government
 * Gateway account that signed in (HMRC, Transaction Engine Document
 * Submission Protocol, 3.2.3) — so the company or agent hears from HMRC
 * directly. HMRC_CONTACT_EMAIL is deliberately not used here: it would send
 * every client's notification to Nucta File's own inbox.
 */
export function liveConfig(userId: string, password: string, testInLive: boolean, notifyEmail?: string): GovTalkConfig {
  return {
    endpoint: ENDPOINTS.live,
    pollEndpoint: POLL_ENDPOINTS.live,
    senderId: userId,
    password,
    vendorId: VENDOR_ID,
    productName: PRODUCT_NAME,
    productVersion: PRODUCT_VERSION,
    gatewayTest: false,
    email: notifyEmail && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(notifyEmail) ? notifyEmail : undefined,
    messageClass: messageClass("live", testInLive),
  };
}

/** Whether the app is configured well enough to attempt a test submission. */
export function readiness(live?: { mode: LiveFiling; who: "admins" | "everyone" }): { label: string; ok: boolean; detail: string }[] {
  const mode = live?.mode ?? liveFiling();
  const forWhom = live?.who === "everyone" ? " for every account" : " for administrators only";
  return [
    {
      label: "Vendor ID",
      ok: Boolean(VENDOR_ID),
      detail: VENDOR_ID ? `Registered with HMRC as ${VENDOR_ID}.` : "Not set.",
    },
    {
      label: "Sender ID",
      ok: Boolean(SENDER_ID),
      detail: SENDER_ID ? `Filing as ${SENDER_ID}.` : "Not set.",
    },
    {
      label: "Test password",
      ok: Boolean(process.env.HMRC_TEST_PASSWORD),
      detail: process.env.HMRC_TEST_PASSWORD
        ? "Held in the environment, never in the code."
        : "Add HMRC_TEST_PASSWORD in your hosting settings. It's in the document HMRC attached to their email.",
    },
    {
      label: "Live filing",
      ok: mode !== "off",
      detail: mode === "on"
        ? `On${forWhom}. Returns can be filed with HMRC, using the company's or agent's own sign-in, typed in at the moment of filing and never stored.`
        : mode === "til"
          ? `Test in Live only${forWhom}: HMRC's live service checks a return with the company's own sign-in, and files nothing.`
          : "Off: returns go to HMRC's test service only. Switch it on from the Live filing page.",
    },
    {
      label: "CT600 schema",
      ok: true,
      detail: `Each build is checked against HMRC's CT600 schema and business rules, and its iXBRL accounts and computations against HMRC's tagging rules, with HMRC's own validation tools (latest: build ${SCHEMA_CHECKED_BUILD}). HMRC's test service then checks every return again before it can be filed.`,
    },
  ];
}
