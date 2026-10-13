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

/**
 * HMRC runs two test routes and one live one.
 *
 * The Local Test Service validates XML on your own machine without a network
 * call. Test in Live posts to the real Transaction Engine with GatewayTest
 * set to 1, so the whole handshake happens for real but nothing is filed.
 * Live is live.
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
      email: process.env.HMRC_CONTACT_EMAIL,
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

/** Whether the app is configured well enough to attempt a test submission. */
export function readiness(): { label: string; ok: boolean; detail: string }[] {
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
      label: "CT600 schema",
      ok: Boolean(process.env.HMRC_SCHEMA_VALIDATED),
      detail: process.env.HMRC_SCHEMA_VALIDATED
        ? "Validated against HMRC's published schema."
        : "The XML follows the published CT600 v3 structure but hasn't been checked against HMRC's own schema file yet. The test service will tell us.",
    },
  ];
}
