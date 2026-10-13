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
