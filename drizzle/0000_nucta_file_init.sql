CREATE TABLE IF NOT EXISTS "nf_companies" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"company_no" text,
	"utr" text,
	"incorporated_on" text,
	"company_type" text DEFAULT '0',
	"registered_office" text,
	"desk_client_id" text,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "nf_credentials" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"sender_id" text NOT NULL,
	"mode" text DEFAULT 'test' NOT NULL,
	"secret_key" text,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "nf_returns" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"kind" text DEFAULT 'ct600' NOT NULL,
	"period_start" text NOT NULL,
	"period_end" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"basis" text DEFAULT 'frs105' NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"accounts_html" text,
	"computation_html" text,
	"irmark" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "nf_submission_steps" (
	"id" text PRIMARY KEY NOT NULL,
	"submission_id" text NOT NULL,
	"stage" text NOT NULL,
	"qualifier" text,
	"http_status" integer,
	"raw" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "nf_submissions" (
	"id" text PRIMARY KEY NOT NULL,
	"return_id" text,
	"gateway_test" boolean DEFAULT true NOT NULL,
	"message_class" text NOT NULL,
	"outcome" text DEFAULT 'running' NOT NULL,
	"correlation_id" text,
	"irmark" text,
	"receipt" text,
	"envelope" text,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"started_by" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "nf_workings" (
	"id" text PRIMARY KEY NOT NULL,
	"return_id" text NOT NULL,
	"section" text NOT NULL,
	"label" text NOT NULL,
	"amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "nf_returns" ADD CONSTRAINT "nf_returns_company_id_nf_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."nf_companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "nf_submission_steps" ADD CONSTRAINT "nf_submission_steps_submission_id_nf_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."nf_submissions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "nf_workings" ADD CONSTRAINT "nf_workings_return_id_nf_returns_id_fk" FOREIGN KEY ("return_id") REFERENCES "public"."nf_returns"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "companies_name_idx" ON "nf_companies" USING btree ("name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "returns_company_idx" ON "nf_returns" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "steps_submission_idx" ON "nf_submission_steps" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "submissions_return_idx" ON "nf_submissions" USING btree ("return_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workings_return_idx" ON "nf_workings" USING btree ("return_id");