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
  `ALTER TABLE "nf_users" ADD COLUMN IF NOT EXISTS "role" text DEFAULT 'owner' NOT NULL`,
  `CREATE TABLE IF NOT EXISTS "nf_invites" ("id" text PRIMARY KEY NOT NULL, "account_id" text NOT NULL REFERENCES "nf_accounts"("id") ON DELETE cascade, "email" text NOT NULL, "name" text NOT NULL, "role" text DEFAULT 'member' NOT NULL, "invited_by" text NOT NULL, "expires_at" timestamp with time zone NOT NULL, "accepted_at" timestamp with time zone, "created_at" timestamp with time zone DEFAULT now() NOT NULL)`,
  'CREATE INDEX IF NOT EXISTS "invites_account_idx" ON "nf_invites" USING btree ("account_id")',
  `CREATE TABLE IF NOT EXISTS "nf_approvals" ("id" text PRIMARY KEY NOT NULL, "token_hash" text NOT NULL, "return_id" text NOT NULL REFERENCES "nf_returns"("id") ON DELETE cascade, "account_id" text NOT NULL, "director_name" text NOT NULL, "director_email" text, "status" text DEFAULT 'sent' NOT NULL, "figures_hash" text NOT NULL, "created_by" text NOT NULL, "expires_at" timestamp with time zone NOT NULL, "last_sent_at" timestamp with time zone, "sent_count" integer DEFAULT 0 NOT NULL, "approved_at" timestamp with time zone, "approved_name" text, "approved_ip" text, "approved_ua" text, "query" text, "created_at" timestamp with time zone DEFAULT now() NOT NULL)`,
  'CREATE INDEX IF NOT EXISTS "approvals_return_idx" ON "nf_approvals" USING btree ("return_id")',
  'CREATE INDEX IF NOT EXISTS "approvals_token_idx" ON "nf_approvals" USING btree ("token_hash")',
  `CREATE TABLE IF NOT EXISTS "nf_notes" ("id" text PRIMARY KEY NOT NULL, "account_id" text NOT NULL, "company_id" text NOT NULL REFERENCES "nf_companies"("id") ON DELETE cascade, "author_name" text NOT NULL, "body" text NOT NULL, "created_at" timestamp with time zone DEFAULT now() NOT NULL)`,
  'CREATE INDEX IF NOT EXISTS "notes_company_idx" ON "nf_notes" USING btree ("company_id")',
  `CREATE TABLE IF NOT EXISTS "nf_tasks" ("id" text PRIMARY KEY NOT NULL, "account_id" text NOT NULL, "company_id" text REFERENCES "nf_companies"("id") ON DELETE cascade, "title" text NOT NULL, "due" text, "done" boolean DEFAULT false NOT NULL, "created_by" text NOT NULL, "done_at" timestamp with time zone, "created_at" timestamp with time zone DEFAULT now() NOT NULL)`,
  'CREATE INDEX IF NOT EXISTS "tasks_account_idx" ON "nf_tasks" USING btree ("account_id")',
  // Everyone who signed up before email confirmation existed counts as confirmed; new users start unconfirmed.
  `ALTER TABLE "nf_users" ADD COLUMN IF NOT EXISTS "email_verified_at" timestamp with time zone DEFAULT now()`,
  `ALTER TABLE "nf_users" ALTER COLUMN "email_verified_at" DROP DEFAULT`,
  `CREATE TABLE IF NOT EXISTS "nf_email_checks" ("id" text PRIMARY KEY NOT NULL, "user_id" text NOT NULL REFERENCES "nf_users"("id") ON DELETE cascade, "email" text NOT NULL, "expires_at" timestamp with time zone NOT NULL, "used_at" timestamp with time zone, "created_at" timestamp with time zone DEFAULT now() NOT NULL)`,
  'CREATE INDEX IF NOT EXISTS "email_checks_user_idx" ON "nf_email_checks" USING btree ("user_id")',
  `CREATE TABLE IF NOT EXISTS "nf_payments" ("id" text PRIMARY KEY NOT NULL, "account_id" text NOT NULL, "return_id" text NOT NULL, "user_id" text NOT NULL, "stripe_session_id" text NOT NULL, "payment_intent" text, "amount" integer NOT NULL, "currency" text DEFAULT 'gbp' NOT NULL, "description" text NOT NULL, "status" text DEFAULT 'pending' NOT NULL, "email" text, "receipt_url" text, "confirmed_at" timestamp with time zone, "paid_at" timestamp with time zone, "created_at" timestamp with time zone DEFAULT now() NOT NULL)`,
  'CREATE INDEX IF NOT EXISTS "payments_return_idx" ON "nf_payments" USING btree ("return_id")',
  'CREATE UNIQUE INDEX IF NOT EXISTS "payments_session_unique" ON "nf_payments" ("stripe_session_id")',
  'CREATE INDEX IF NOT EXISTS "payments_account_idx" ON "nf_payments" USING btree ("account_id")',
  `CREATE TABLE IF NOT EXISTS "nf_settings" ("key" text PRIMARY KEY NOT NULL, "value" jsonb NOT NULL, "updated_by" text, "updated_at" timestamp with time zone DEFAULT now() NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS "nf_password_resets" ("id" text PRIMARY KEY NOT NULL, "user_id" text NOT NULL REFERENCES "nf_users"("id") ON DELETE cascade, "expires_at" timestamp with time zone NOT NULL, "used_at" timestamp with time zone, "created_at" timestamp with time zone DEFAULT now() NOT NULL)`,
  // Memberships (build 49): a payment may be for a membership rather than a return.
  'ALTER TABLE "nf_payments" ALTER COLUMN "return_id" DROP NOT NULL',
  `ALTER TABLE "nf_payments" ADD COLUMN IF NOT EXISTS "kind" text DEFAULT 'filing' NOT NULL`,
  `CREATE TABLE IF NOT EXISTS "nf_memberships" ("id" text PRIMARY KEY NOT NULL, "account_id" text NOT NULL, "payment_id" text NOT NULL, "plan_key" text NOT NULL, "plan_name" text NOT NULL, "returns_included" integer NOT NULL, "amount" integer NOT NULL, "starts_on" text NOT NULL, "ends_on" text NOT NULL, "status" text DEFAULT 'active' NOT NULL, "created_at" timestamp with time zone DEFAULT now() NOT NULL)`,
  'CREATE INDEX IF NOT EXISTS "memberships_account_idx" ON "nf_memberships" USING btree ("account_id")',
  'CREATE UNIQUE INDEX IF NOT EXISTS "memberships_payment_unique" ON "nf_memberships" ("payment_id")',
  `CREATE TABLE IF NOT EXISTS "nf_membership_uses" ("return_id" text PRIMARY KEY NOT NULL, "membership_id" text NOT NULL, "used_at" timestamp with time zone DEFAULT now() NOT NULL)`,
  'CREATE INDEX IF NOT EXISTS "membership_uses_membership_idx" ON "nf_membership_uses" USING btree ("membership_id")',
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
