/**
 * Tables and columns added after Nucta File's tables were first created.
 * Each statement is safe to run again, so they run once per server instance
 * and an existing database keeps working without anyone pressing "Create the
 * tables". The same statements are part of the full setup.
 */
export const LATER_STATEMENTS = [
  'ALTER TABLE "nf_companies" ADD COLUMN IF NOT EXISTS "ch_profile" jsonb',
  'ALTER TABLE "nf_companies" ADD COLUMN IF NOT EXISTS "account_id" text',
  'CREATE INDEX IF NOT EXISTS "companies_account_idx" ON "nf_companies" USING btree ("account_id")',
  `CREATE TABLE IF NOT EXISTS "nf_accounts" ("id" text PRIMARY KEY NOT NULL, "name" text NOT NULL, "kind" text DEFAULT 'practice' NOT NULL, "created_at" timestamp with time zone DEFAULT now() NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS "nf_users" ("id" text PRIMARY KEY NOT NULL, "account_id" text NOT NULL REFERENCES "nf_accounts"("id") ON DELETE cascade, "email" text NOT NULL, "name" text NOT NULL, "password_hash" text NOT NULL, "failed_logins" integer DEFAULT 0 NOT NULL, "locked_until" timestamp with time zone, "last_login_at" timestamp with time zone, "created_at" timestamp with time zone DEFAULT now() NOT NULL)`,
  'CREATE UNIQUE INDEX IF NOT EXISTS "users_email_unique" ON "nf_users" ("email")',
  'CREATE INDEX IF NOT EXISTS "users_email_idx" ON "nf_users" USING btree ("email")',
  `CREATE TABLE IF NOT EXISTS "nf_sessions" ("id" text PRIMARY KEY NOT NULL, "user_id" text NOT NULL REFERENCES "nf_users"("id") ON DELETE cascade, "expires_at" timestamp with time zone NOT NULL, "user_agent" text, "created_at" timestamp with time zone DEFAULT now() NOT NULL)`,
  'CREATE INDEX IF NOT EXISTS "sessions_user_idx" ON "nf_sessions" USING btree ("user_id")',
  `CREATE TABLE IF NOT EXISTS "nf_password_resets" ("id" text PRIMARY KEY NOT NULL, "user_id" text NOT NULL REFERENCES "nf_users"("id") ON DELETE cascade, "expires_at" timestamp with time zone NOT NULL, "used_at" timestamp with time zone, "created_at" timestamp with time zone DEFAULT now() NOT NULL)`,
];

let done: Promise<void> | null = null;

/**
 * Makes sure every table and column exists, once per server: the full setup
 * (each statement safe to repeat), so a new database needs no setup step and
 * an older one gains what was added since. A failure is retried next time.
 */
export function ensureSchema(): Promise<void> {
  done ??= (async () => {
    const { rawSql } = await import("./db");
    const { SETUP_STATEMENTS } = await import("./setup-sql");
    for (const st of SETUP_STATEMENTS) await rawSql.unsafe(st);
  })().catch((e) => { done = null; throw e; });
  return done;
}
