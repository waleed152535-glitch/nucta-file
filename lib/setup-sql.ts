/**
 * Nucta File's tables, as one list of statements.
 *
 * This is drizzle/0000_nucta_file_init.sql, split on drizzle's statement
 * markers. It lives in code rather than being read from the .sql file at run
 * time because the hosting bundle doesn't reliably include loose files. If the
 * schema changes, regenerate this from the migration rather than editing it.
 *
 * Every statement is safe to run again: tables and indexes use IF NOT EXISTS,
 * and the foreign keys are added inside blocks that ignore "already exists".
 * Nothing here drops, empties or alters an existing table outside nf_.
 */
export const SETUP_STATEMENTS: readonly string[] = [
  "CREATE TABLE IF NOT EXISTS \"nf_companies\" (\n\t\"id\" text PRIMARY KEY NOT NULL,\n\t\"name\" text NOT NULL,\n\t\"company_no\" text,\n\t\"utr\" text,\n\t\"incorporated_on\" text,\n\t\"company_type\" text DEFAULT '0',\n\t\"registered_office\" text,\n\t\"desk_client_id\" text,\n\t\"archived\" boolean DEFAULT false NOT NULL,\n\t\"created_at\" timestamp with time zone DEFAULT now() NOT NULL\n);",
  "CREATE TABLE IF NOT EXISTS \"nf_credentials\" (\n\t\"id\" text PRIMARY KEY NOT NULL,\n\t\"label\" text NOT NULL,\n\t\"sender_id\" text NOT NULL,\n\t\"mode\" text DEFAULT 'test' NOT NULL,\n\t\"secret_key\" text,\n\t\"last_used_at\" timestamp with time zone,\n\t\"created_at\" timestamp with time zone DEFAULT now() NOT NULL\n);",
  "CREATE TABLE IF NOT EXISTS \"nf_returns\" (\n\t\"id\" text PRIMARY KEY NOT NULL,\n\t\"company_id\" text NOT NULL,\n\t\"kind\" text DEFAULT 'ct600' NOT NULL,\n\t\"period_start\" text NOT NULL,\n\t\"period_end\" text NOT NULL,\n\t\"status\" text DEFAULT 'draft' NOT NULL,\n\t\"basis\" text DEFAULT 'frs105' NOT NULL,\n\t\"data\" jsonb DEFAULT '{}'::jsonb NOT NULL,\n\t\"accounts_html\" text,\n\t\"computation_html\" text,\n\t\"irmark\" text,\n\t\"created_at\" timestamp with time zone DEFAULT now() NOT NULL,\n\t\"updated_at\" timestamp with time zone DEFAULT now() NOT NULL\n);",
  "CREATE TABLE IF NOT EXISTS \"nf_submission_steps\" (\n\t\"id\" text PRIMARY KEY NOT NULL,\n\t\"submission_id\" text NOT NULL,\n\t\"stage\" text NOT NULL,\n\t\"qualifier\" text,\n\t\"http_status\" integer,\n\t\"raw\" text,\n\t\"created_at\" timestamp with time zone DEFAULT now() NOT NULL\n);",
  "CREATE TABLE IF NOT EXISTS \"nf_submissions\" (\n\t\"id\" text PRIMARY KEY NOT NULL,\n\t\"return_id\" text,\n\t\"gateway_test\" boolean DEFAULT true NOT NULL,\n\t\"message_class\" text NOT NULL,\n\t\"outcome\" text DEFAULT 'running' NOT NULL,\n\t\"correlation_id\" text,\n\t\"irmark\" text,\n\t\"receipt\" text,\n\t\"envelope\" text,\n\t\"errors\" jsonb DEFAULT '[]'::jsonb NOT NULL,\n\t\"created_at\" timestamp with time zone DEFAULT now() NOT NULL,\n\t\"finished_at\" timestamp with time zone,\n\t\"started_by\" text\n);",
  "CREATE TABLE IF NOT EXISTS \"nf_workings\" (\n\t\"id\" text PRIMARY KEY NOT NULL,\n\t\"return_id\" text NOT NULL,\n\t\"section\" text NOT NULL,\n\t\"label\" text NOT NULL,\n\t\"amount\" numeric(14, 2) DEFAULT '0' NOT NULL,\n\t\"note\" text,\n\t\"created_at\" timestamp with time zone DEFAULT now() NOT NULL\n);",
  "DO $$ BEGIN\n  ALTER TABLE \"nf_returns\" ADD CONSTRAINT \"nf_returns_company_id_nf_companies_id_fk\" FOREIGN KEY (\"company_id\") REFERENCES \"public\".\"nf_companies\"(\"id\") ON DELETE cascade ON UPDATE no action;\nEXCEPTION WHEN duplicate_object THEN NULL;\nEND $$;",
  "DO $$ BEGIN\n  ALTER TABLE \"nf_submission_steps\" ADD CONSTRAINT \"nf_submission_steps_submission_id_nf_submissions_id_fk\" FOREIGN KEY (\"submission_id\") REFERENCES \"public\".\"nf_submissions\"(\"id\") ON DELETE cascade ON UPDATE no action;\nEXCEPTION WHEN duplicate_object THEN NULL;\nEND $$;",
  "DO $$ BEGIN\n  ALTER TABLE \"nf_workings\" ADD CONSTRAINT \"nf_workings_return_id_nf_returns_id_fk\" FOREIGN KEY (\"return_id\") REFERENCES \"public\".\"nf_returns\"(\"id\") ON DELETE cascade ON UPDATE no action;\nEXCEPTION WHEN duplicate_object THEN NULL;\nEND $$;",
  "CREATE INDEX IF NOT EXISTS \"companies_name_idx\" ON \"nf_companies\" USING btree (\"name\");",
  "CREATE INDEX IF NOT EXISTS \"returns_company_idx\" ON \"nf_returns\" USING btree (\"company_id\");",
  "CREATE INDEX IF NOT EXISTS \"steps_submission_idx\" ON \"nf_submission_steps\" USING btree (\"submission_id\");",
  "CREATE INDEX IF NOT EXISTS \"submissions_return_idx\" ON \"nf_submissions\" USING btree (\"return_id\");",
  "CREATE INDEX IF NOT EXISTS \"workings_return_idx\" ON \"nf_workings\" USING btree (\"return_id\");"
];
