/**
 * Whether live filing is open, and for whom: set by Nucta File's
 * administrators on the Live filing page, kept in the database so it changes
 * without touching the hosting settings or redeploying.
 *
 * Server only; not a "use server" file. The page that changes it is in
 * live-actions.ts and checks the administrator first.
 *
 * Until an administrator saves a choice, NUCTA_LIVE_FILING in the hosting
 * settings decides the mode (off by default), for administrators only.
 */
import { liveFiling, type LiveFiling } from "./hmrc";
import type { SignedInUser } from "./auth";
import { store } from "./store";

export type LiveWho = "admins" | "everyone";

export interface LiveSettings {
  /** off: HMRC's test service only. til: also HMRC's Test in Live check. on: real filing too. */
  mode: LiveFiling;
  /** Who can use it: Nucta File's administrators only (a pilot), or every account. */
  who: LiveWho;
  /** A real filing needs a passed Test in Live check of the same figures first. */
  requireTil: boolean;
  /** A real filing needs these figures to have passed HMRC's test service first. */
  requireTest: boolean;
  /** Email HMRC's receipt to the person who filed, as soon as it arrives. */
  emailReceipt: boolean;
  changedBy: string | null;
  changedAt: string | null;
}

export interface LiveChange { at: string; by: string; summary: string }

const KEY = "live_filing";
const LOG_KEY = "live_filing_changes";

export const defaultLiveSettings = (): LiveSettings => ({
  mode: liveFiling(), who: "admins", requireTil: false, requireTest: false, emailReceipt: true, changedBy: null, changedAt: null,
});

function clean(v: unknown): LiveSettings {
  const d = defaultLiveSettings();
  const o = (v && typeof v === "object" ? v : {}) as Partial<LiveSettings>;
  return {
    mode: o.mode === "on" || o.mode === "til" || o.mode === "off" ? o.mode : d.mode,
    who: o.who === "everyone" ? "everyone" : "admins",
    requireTil: typeof o.requireTil === "boolean" ? o.requireTil : d.requireTil,
    requireTest: typeof o.requireTest === "boolean" ? o.requireTest : d.requireTest,
    emailReceipt: typeof o.emailReceipt === "boolean" ? o.emailReceipt : d.emailReceipt,
    changedBy: typeof o.changedBy === "string" ? o.changedBy : null,
    changedAt: typeof o.changedAt === "string" ? o.changedAt : null,
  };
}

/** The saved settings, or the defaults when none have been saved or the database can't be reached. */
export async function getLiveSettings(): Promise<LiveSettings> {
  try {
    const s = await store();
    const [row] = await s.db.select().from(s.settings).where(s.eq(s.settings.key, KEY));
    return row ? clean(row.value) : defaultLiveSettings();
  } catch {
    return defaultLiveSettings();
  }
}

export async function getLiveChanges(): Promise<LiveChange[]> {
  try {
    const s = await store();
    const [row] = await s.db.select().from(s.settings).where(s.eq(s.settings.key, LOG_KEY));
    return Array.isArray(row?.value) ? (row.value as LiveChange[]) : [];
  } catch {
    return [];
  }
}

const MODE_WORDS: Record<LiveFiling, string> = { off: "off (test service only)", til: "Test in Live only", on: "live filing on" };

/** Saves new settings and notes the change. Callers check the administrator first. */
export async function saveLiveSettings(next: Omit<LiveSettings, "changedBy" | "changedAt">, by: string): Promise<LiveSettings> {
  const s = await store();
  const before = await getLiveSettings();
  const at = new Date().toISOString();
  const value: LiveSettings = { ...clean(next), changedBy: by, changedAt: at };
  const parts: string[] = [];
  if (before.mode !== value.mode) parts.push(`mode ${MODE_WORDS[before.mode]} → ${MODE_WORDS[value.mode]}`);
  if (before.who !== value.who) parts.push(value.who === "everyone" ? "opened to every account" : "limited to administrators");
  if (before.requireTil !== value.requireTil) parts.push(value.requireTil ? "Test in Live required before filing" : "Test in Live no longer required");
  if (before.requireTest !== value.requireTest) parts.push(value.requireTest ? "test service required before filing" : "test service no longer required");
  if (before.emailReceipt !== value.emailReceipt) parts.push(value.emailReceipt ? "receipts emailed to the filer" : "receipts not emailed");
  await s.db.insert(s.settings).values({ key: KEY, value, updatedBy: by, updatedAt: new Date() })
    .onConflictDoUpdate({ target: s.settings.key, set: { value, updatedBy: by, updatedAt: new Date() } });
  if (parts.length) {
    const log = [{ at, by, summary: parts.join("; ") }, ...(await getLiveChanges())].slice(0, 50);
    await s.db.insert(s.settings).values({ key: LOG_KEY, value: log, updatedBy: by, updatedAt: new Date() })
      .onConflictDoUpdate({ target: s.settings.key, set: { value: log, updatedBy: by, updatedAt: new Date() } });
  }
  return value;
}

/** The live filing mode for one signed-in person, and why, in words. */
export async function liveModeFor(u: SignedInUser | null): Promise<{ mode: LiveFiling; settings: LiveSettings; why: string }> {
  const settings = await getLiveSettings();
  if (!u) return { mode: "off", settings, why: "Sign in first." };
  if (settings.mode === "off") return { mode: "off", settings, why: "Live filing is switched off. Returns can be checked with HMRC's test service." };
  if (settings.who === "admins" && !u.admin) {
    return { mode: "off", settings, why: "Live filing is open to a small group first, and isn't open for your account yet. Everything else works: prepare the return and test it with HMRC's test service, and it's ready to file the moment it opens." };
  }
  return {
    mode: settings.mode, settings,
    why: settings.mode === "til" ? "HMRC's Test in Live check is open: HMRC's live service checks the return with the real sign-in, and files nothing." : "Live filing is open.",
  };
}
