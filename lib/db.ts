import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Reuse a single connection across hot reloads in dev.
const globalForDb = globalThis as unknown as { _sql?: ReturnType<typeof postgres> };

const sql =
  globalForDb._sql ??
  postgres(process.env.DATABASE_URL ?? "", { prepare: false, max: 5 });

if (process.env.NODE_ENV !== "production") globalForDb._sql = sql;

export const db = drizzle(sql, { schema });

/**
 * Where the app is connecting, without the password, for error messages.
 *
 * Nucta File shares its database with Nucta Desk, and a table missing "here"
 * but present "there" almost always means two different connection strings.
 * Showing the host and database name makes that visible at a glance.
 */
export function connectionTarget(): string {
  const raw = process.env.DATABASE_URL;
  if (!raw) return "DATABASE_URL is not set for this deployment";
  try {
    const u = new URL(raw);
    return `${u.hostname}${u.pathname}`;
  } catch {
    return "DATABASE_URL is set but isn't a valid connection string";
  }
}

/**
 * The real reason behind a database error.
 *
 * Drizzle wraps every failure as "Failed query: <the SQL>", and the actual
 * cause — a missing table, a wrong password, an unreachable host — sits in
 * the error's cause. This walks the chain and returns the innermost message.
 */
export function rootCause(e: unknown): string {
  let cur = e as { message?: string; code?: string; cause?: unknown } | undefined;
  let last = cur;
  for (let depth = 0; cur && depth < 6; depth++) {
    last = cur;
    cur = cur.cause as typeof cur;
  }
  const msg = last?.message ?? String(e);
  return last?.code ? `${msg} (${last.code})` : msg;
}
