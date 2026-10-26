/**
 * HMRC's Making Tax Digital APIs, for VAT returns. Server only; not a
 * "use server" file — the browser reaches this through lib/vat-actions.ts
 * and the two /api/hmrc routes.
 *
 * Unlike the Company Tax Return, which is sent with a Government Gateway
 * password typed at the moment of filing, MTD works by sign-in on HMRC's own
 * page (OAuth 2.0): the business — or its agent, with an agent services
 * account — signs in there and grants Nucta File authority, and HMRC hand
 * back tokens. The password never reaches Nucta File. The tokens are kept,
 * encrypted, so returns can be sent for up to 18 months without signing in
 * again; the access token lasts four hours and is renewed as needed.
 *
 * Settings, in the hosting environment:
 *   HMRC_MTD_CLIENT_ID, HMRC_MTD_CLIENT_SECRET — from the application made on
 *     HMRC's Developer Hub, with this site's /api/hmrc/callback as its
 *     redirect URI;
 *   HMRC_MTD_ENV — "sandbox" (the default: HMRC's test service, test
 *     businesses only) or "production" once HMRC have approved the software.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "crypto";
import { lookup } from "dns/promises";
import { store, siteUrl, type Store } from "./store";
import { fraudHeaders, hmrcVatError, type ClientInfo } from "./vat-rules";

export type MtdEnv = "sandbox" | "production";
export const mtdEnv = (): MtdEnv => (process.env.HMRC_MTD_ENV === "production" ? "production" : "sandbox");
export const mtdReady = () => Boolean((process.env.HMRC_MTD_CLIENT_ID ?? "").trim() && (process.env.HMRC_MTD_CLIENT_SECRET ?? "").trim());
export const PRODUCT_VERSION = "50";

const BASES: Record<MtdEnv, { api: string; authorize: string }> = {
  sandbox: { api: "https://test-api.service.hmrc.gov.uk", authorize: "https://test-www.tax.service.gov.uk/oauth/authorize" },
  production: { api: "https://api.service.hmrc.gov.uk", authorize: "https://www.tax.service.gov.uk/oauth/authorize" },
};
const apiBase = () => (process.env.HMRC_MTD_API_BASE ?? BASES[mtdEnv()].api).replace(/\/+$/, "");
const authorizeBase = () => process.env.HMRC_MTD_AUTH_URL ?? BASES[mtdEnv()].authorize;
export const redirectUri = () => `${siteUrl()}/api/hmrc/callback`;
const clientId = () => (process.env.HMRC_MTD_CLIENT_ID ?? "").trim();
const clientSecret = () => (process.env.HMRC_MTD_CLIENT_SECRET ?? "").trim();
export const SCOPES = "read:vat write:vat";

// ---- the tokens, encrypted ----

/** The key the tokens are encrypted with: NUCTA_TOKEN_KEY if set, or else derived from the client secret. */
function tokenKey(): Buffer {
  const base = (process.env.NUCTA_TOKEN_KEY ?? "").trim() || clientSecret();
  if (!base) throw new Error("HMRC_MTD_CLIENT_SECRET isn't set.");
  return createHash("sha256").update(`nucta-file mtd tokens|${base}`).digest();
}

export function seal(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", tokenKey(), iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v1.${iv.toString("base64url")}.${c.getAuthTag().toString("base64url")}.${body.toString("base64url")}`;
}

export function unseal(sealed: string): string | null {
  try {
    const [v, iv, tag, body] = sealed.split(".");
    if (v !== "v1") return null;
    const d = createDecipheriv("aes-256-gcm", tokenKey(), Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(body, "base64url")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

// ---- signing in on HMRC's page ----

const sha = (v: string) => createHash("sha256").update(v).digest("hex");

/** Starts an HMRC sign-in: a one-time state kept for ten minutes, and HMRC's page to send the person to. */
export async function startSignIn(s: Store, x: { accountId: string; userId: string; companyId: string; scopeKey: string }): Promise<string> {
  const state = randomBytes(24).toString("base64url");
  await s.db.insert(s.oauthStates).values({ id: sha(state), ...x, expiresAt: new Date(Date.now() + 10 * 60_000) });
  const q = new URLSearchParams({ response_type: "code", client_id: clientId(), scope: SCOPES, state, redirect_uri: redirectUri() });
  return `${authorizeBase()}?${q.toString()}`;
}

/** Uses a state once, if it's ours, unexpired and unused. */
export async function takeState(s: Store, state: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(state)) return null;
  const [row] = await s.db.update(s.oauthStates).set({ usedAt: new Date() })
    .where(s.and(s.eq(s.oauthStates.id, sha(state)), s.isNull(s.oauthStates.usedAt), s.gt(s.oauthStates.expiresAt, new Date()))).returning();
  return row ?? null;
}

interface TokenReply { access_token: string; refresh_token: string; expires_in: number; scope?: string; token_type?: string }

async function tokenCall(form: Record<string, string>): Promise<TokenReply> {
  const r = await fetch(`${apiBase()}/oauth/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ client_id: clientId(), client_secret: clientSecret(), ...form }).toString(), cache: "no-store",
  });
  const text = await r.text();
  let j: Record<string, unknown> = {};
  try { j = JSON.parse(text); } catch { /* not JSON */ }
  if (!r.ok || typeof j.access_token !== "string") {
    const why = String(j.error_description ?? j.error ?? text.slice(0, 150));
    throw new Error(`HMRC didn't give access (${r.status}): ${why}`);
  }
  return j as unknown as TokenReply;
}

/** Swaps the code HMRC sent back for tokens, and keeps them. */
export async function finishSignIn(s: Store, st: { accountId: string; scopeKey: string; userId: string }, code: string, who: string): Promise<void> {
  const t = await tokenCall({ grant_type: "authorization_code", code, redirect_uri: redirectUri() });
  const values = {
    accessEnc: seal(t.access_token), refreshEnc: seal(t.refresh_token), expiresAt: new Date(Date.now() + (t.expires_in || 14_400) * 1000),
    scope: t.scope ?? SCOPES, connectedBy: st.userId, connectedByName: who, updatedAt: new Date(),
  };
  await s.db.insert(s.vatConnections).values({ id: randomUUID(), accountId: st.accountId, scopeKey: st.scopeKey, env: mtdEnv(), ...values })
    .onConflictDoUpdate({ target: [s.vatConnections.accountId, s.vatConnections.scopeKey, s.vatConnections.env], set: values });
}

export type Connection = typeof import("./schema").vatConnections.$inferSelect;

/** The connection to use for a company: its own sign-in, or else the practice's agent services account. */
export async function connectionFor(s: Store, accountId: string, companyId: string): Promise<Connection | null> {
  const rows = await s.db.select().from(s.vatConnections)
    .where(s.and(s.eq(s.vatConnections.accountId, accountId), s.eq(s.vatConnections.env, mtdEnv()), s.inArray(s.vatConnections.scopeKey, [companyId, "agent"])));
  return rows.find((r) => r.scopeKey === companyId) ?? rows.find((r) => r.scopeKey === "agent") ?? null;
}

/** Renewals under way, so calls made at the same moment share one rather than spending the refresh token twice. */
const renewing = new Map<string, Promise<string>>();

/**
 * A working access token, renewed first when it's within five minutes of
 * running out (or when HMRC have just refused it). The connection passed in
 * is brought up to date, so later calls with it use the new token.
 */
async function accessToken(s: Store, c: Connection, force = false): Promise<string> {
  if (!force && c.expiresAt.getTime() - Date.now() > 5 * 60_000) {
    const t = unseal(c.accessEnc);
    if (t) return t;
  }
  const running = renewing.get(c.id);
  if (running) return running;
  const job = (async () => {
    const refresh = unseal(c.refreshEnc);
    if (!refresh) throw new MtdError(401, "The HMRC connection can't be read any more (the client secret may have changed). Connect to HMRC again.");
    let t: TokenReply;
    try {
      t = await tokenCall({ grant_type: "refresh_token", refresh_token: refresh });
    } catch {
      throw new MtdError(401, "The HMRC connection has run out — connections last 18 months. Connect to HMRC again.");
    }
    const next = { accessEnc: seal(t.access_token), refreshEnc: seal(t.refresh_token ?? refresh), expiresAt: new Date(Date.now() + (t.expires_in || 14_400) * 1000), updatedAt: new Date() };
    await s.db.update(s.vatConnections).set(next).where(s.eq(s.vatConnections.id, c.id));
    Object.assign(c, next);
    return t.access_token;
  })().finally(() => renewing.delete(c.id));
  renewing.set(c.id, job);
  return job;
}

export class MtdError extends Error {
  constructor(public status: number, message: string, public body?: unknown) { super(message); }
}

/** This server's own address, as the browser reached it, for Gov-Vendor-Public-IP. */
let vendorIp: { at: number; ip: string | null } | null = null;
async function ourIp(): Promise<string | null> {
  if (vendorIp && Date.now() - vendorIp.at < 10 * 60_000) return vendorIp.ip;
  let ip: string | null = (process.env.NUCTA_VENDOR_IP ?? "").trim() || null;
  if (!ip) {
    try { ip = (await lookup(new URL(siteUrl()).hostname, { family: 4 })).address; } catch { ip = null; }
  }
  vendorIp = { at: Date.now(), ip };
  return ip;
}

export interface Caller { userId: string; client: ClientInfo; ip: string | null; port: string | null }

/** One call to HMRC's VAT API, with the fraud prevention headers it requires. */
export async function mtdCall<T>(s: Store, c: Connection, method: "GET" | "POST", path: string, who: Caller, body?: unknown, retried = false): Promise<{ data: T; correlationId: string | null; status: number }> {
  const token = await accessToken(s, c, retried);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`, Accept: "application/vnd.hmrc.1.0+json",
    ...fraudHeaders(who.client, { clientIp: who.ip, clientIpAt: new Date().toISOString(), clientPort: who.port, vendorIp: await ourIp(), userId: who.userId, productVersion: PRODUCT_VERSION }),
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (process.env.HMRC_MTD_TEST_SCENARIO && mtdEnv() === "sandbox") headers["Gov-Test-Scenario"] = process.env.HMRC_MTD_TEST_SCENARIO;
  let r: Response;
  try {
    r = await fetch(`${apiBase()}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store" });
  } catch (e) {
    throw new MtdError(0, `Couldn't reach HMRC: ${String((e as Error)?.message ?? e).slice(0, 120)}`);
  }
  const text = await r.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  // HMRC can end an access token early: renew it once and try again.
  if (r.status === 401 && !retried) return mtdCall<T>(s, c, method, path, who, body, true);
  if (!r.ok) throw new MtdError(r.status, hmrcVatError(r.status, data), data);
  return { data: data as T, correlationId: r.headers.get("x-correlationid"), status: r.status };
}

// ---- the VAT API ----

export interface Obligation { periodKey: string; start: string; end: string; due: string; status: "O" | "F"; received?: string }

export async function obligations(s: Store, c: Connection, vrn: string, who: Caller, today: string): Promise<Obligation[]> {
  const open = await mtdCall<{ obligations?: Obligation[] }>(s, c, "GET", `/organisations/vat/${vrn}/obligations?status=O`, who);
  // HMRC allow a year at a time: the past year's fulfilled ones, for the record.
  const from = new Date(Date.parse(today + "T00:00:00Z") - 365 * 86_400_000).toISOString().slice(0, 10);
  let done: Obligation[] = [];
  try {
    done = (await mtdCall<{ obligations?: Obligation[] }>(s, c, "GET", `/organisations/vat/${vrn}/obligations?from=${from}&to=${today}&status=F`, who)).data.obligations ?? [];
  } catch (e) {
    if (!(e instanceof MtdError && e.status === 404)) throw e;
  }
  const seen = new Set<string>();
  return [...(open.data.obligations ?? []), ...done].filter((o) => (seen.has(o.periodKey) ? false : (seen.add(o.periodKey), true)))
    .sort((a, b) => b.end.localeCompare(a.end));
}

export interface VatReceipt { processingDate: string; paymentIndicator?: string; formBundleNumber: string; chargeRefNumber?: string }

export async function submitVat(s: Store, c: Connection, vrn: string, who: Caller, body: unknown) {
  return mtdCall<VatReceipt>(s, c, "POST", `/organisations/vat/${vrn}/returns`, who, body);
}

export interface Liability { taxPeriod?: { from: string; to: string }; type: string; originalAmount: number; outstandingAmount?: number; due?: string }
export interface Payment { amount: number; received?: string }

/** What's owed and paid over the past year. HMRC answer 404 when there's nothing. */
export async function money(s: Store, c: Connection, vrn: string, who: Caller, today: string): Promise<{ liabilities: Liability[]; payments: Payment[] }> {
  const from = new Date(Date.parse(today + "T00:00:00Z") - 364 * 86_400_000).toISOString().slice(0, 10);
  const get = async <T,>(what: "liabilities" | "payments"): Promise<T[]> => {
    try {
      const r = await mtdCall<Record<string, T[]>>(s, c, "GET", `/organisations/vat/${vrn}/${what}?from=${from}&to=${today}`, who);
      return r.data[what] ?? [];
    } catch (e) {
      if (e instanceof MtdError && e.status === 404) return [];
      throw e;
    }
  };
  const [liabilities, payments] = await Promise.all([get<Liability>("liabilities"), get<Payment>("payments")]);
  return { liabilities, payments };
}

/**
 * HMRC's check of the fraud prevention headers (sandbox only), with an
 * application token. For the administrators, before asking HMRC for
 * production access.
 */
export async function validateFraudHeaders(who: Caller): Promise<{ ok: boolean; code?: string; message?: string; errors?: { code: string; message: string; headers?: string[] }[]; warnings?: { code: string; message: string; headers?: string[] }[] }> {
  const t = await fetch(`${apiBase()}/oauth/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId(), client_secret: clientSecret(), grant_type: "client_credentials" }).toString(), cache: "no-store",
  });
  const tj = (await t.json().catch(() => ({}))) as { access_token?: string; error_description?: string };
  if (!t.ok || !tj.access_token) return { ok: false, message: `HMRC didn't give an application token: ${tj.error_description ?? t.status}` };
  const headers = {
    Authorization: `Bearer ${tj.access_token}`, Accept: "application/vnd.hmrc.1.0+json",
    ...fraudHeaders(who.client, { clientIp: who.ip, clientIpAt: new Date().toISOString(), clientPort: who.port, vendorIp: await ourIp(), userId: who.userId, productVersion: PRODUCT_VERSION }),
  };
  const r = await fetch(`${apiBase()}/test/fraud-prevention-headers/validate`, { headers, cache: "no-store" });
  const j = (await r.json().catch(() => ({}))) as { code?: string; message?: string; errors?: never[]; warnings?: never[] };
  return { ok: r.ok && j.code === "VALID_HEADERS", ...j };
}
