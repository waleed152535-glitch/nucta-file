/**
 * The database, and the checks every action makes before touching it: is
 * someone signed in, and does the thing belong to their account. Server only;
 * not a "use server" file, so nothing here can be called from a browser.
 */
import { ensureSchema } from "./db-ensure";
import { currentUser, type SignedInUser } from "./auth";

export async function store() {
  const { db } = await import("./db");
  const schema = await import("./schema");
  const orm = await import("drizzle-orm");
  await ensureSchema().catch(() => undefined);
  return { db, ...schema, ...orm };
}
export type Store = Awaited<ReturnType<typeof store>>;

export const SIGNED_OUT = "You're signed out. Sign in again to carry on.";

export async function signedIn(): Promise<SignedInUser | null> {
  return currentUser();
}

export async function ownedCompany(s: Store, u: SignedInUser, companyId: string) {
  const [c] = await s.db.select().from(s.companies).where(s.and(s.eq(s.companies.id, companyId), s.eq(s.companies.accountId, u.accountId)));
  return c ?? null;
}

export async function ownedReturn(s: Store, u: SignedInUser, returnId: string) {
  const [r] = await s.db.select({ r: s.returns }).from(s.returns)
    .innerJoin(s.companies, s.eq(s.companies.id, s.returns.companyId))
    .where(s.and(s.eq(s.returns.id, returnId), s.eq(s.companies.accountId, u.accountId)));
  return r?.r ?? null;
}

export const problem = (e: unknown): string => {
  const m = String((e as Error)?.message ?? e);
  return /does not exist/.test(m) ? "The database is being updated. Try again in a moment." : m.slice(0, 300);
};

/** The site's own address, for links in emails: from the settings, never from a request. */
export function siteUrl(fallbackHost?: string | null): string {
  const env = process.env.NUCTA_SITE_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  return (env || (fallbackHost ? `http://${fallbackHost}` : "https://nucta-file.vercel.app")).replace(/\/+$/, "");
}
