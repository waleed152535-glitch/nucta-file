"use server";

import { revalidatePath } from "next/cache";
import { rawSql, rootCause, connectionTarget } from "@/lib/db";
import { SETUP_STATEMENTS } from "@/lib/setup-sql";

/**
 * Creates Nucta File's tables in the database this deployment connects to.
 *
 * Running the setup script by hand in Neon's SQL editor depends on the editor
 * being open on the same project and branch as DATABASE_URL — and Neon opens
 * whichever was used last, which is how the tables once ended up in the wrong
 * database. Going through the app's own connection removes that question.
 */
export async function createTables(): Promise<{ ok: boolean; message: string }> {
  const target = connectionTarget();
  try {
    for (const statement of SETUP_STATEMENTS) {
      await rawSql.unsafe(statement);
    }
    const found = await rawSql<{ n: number }[]>`
      select count(*)::int as n from information_schema.tables
      where table_schema = 'public' and table_name like 'nf\\_%'`;
    revalidatePath("/log");
    return { ok: true, message: `Done — ${found[0]?.n ?? 0} Nucta File tables now exist in ${target}.` };
  } catch (e) {
    return { ok: false, message: `Couldn't create the tables in ${target}: ${rootCause(e)}` };
  }
}
