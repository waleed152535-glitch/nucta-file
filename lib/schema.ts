import {
  pgTable, text, timestamp, boolean, integer, numeric, jsonb, index,
} from "drizzle-orm/pg-core";

/**
 * Nucta File keeps its own records, separate from Nucta Desk.
 *
 * The reason is legal rather than technical. A filing is evidence: HMRC can
 * ask, years later, exactly what was sent, when, by whom, and what came back.
 * That record must not be entangled with a practice-management database that
 * gets edited every day. So every submission here stores the envelope that
 * went out and every reply that came back, verbatim, and nothing overwrites
 * them.
 */

const id = () => text("id").primaryKey();
const now = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();

/** A company a return is filed for. Mirrors just enough to file. */
export const companies = pgTable("nf_companies", {
  id: id(),
  name: text("name").notNull(),
  companyNo: text("company_no"),
  utr: text("utr"),
  /** Companies House incorporation date. */
  incorporatedOn: text("incorporated_on"),
  /** 0 close company, 1 investment, etc. — HMRC's CompanyType box. */
  companyType: text("company_type").default("0"),
  registeredOffice: text("registered_office"),
  /** Which Nucta Desk client this is, when the two are linked. */
  deskClientId: text("desk_client_id"),
  /** The company's record at Companies House when it was last looked up: accounts dates, address, status. */
  chProfile: jsonb("ch_profile").$type<import("./ch-api").ChProfile | null>(),
  archived: boolean("archived").default(false).notNull(),
  createdAt: now(),
}, (t) => [index("companies_name_idx").on(t.name)]);

/**
 * One return for one period.
 *
 * `data` holds the figures as entered — a JSON document rather than a hundred
 * columns, because the CT600 has several hundred boxes and which ones apply
 * depends on the company. The generated XML and iXBRL are stored alongside,
 * so what was filed can be reproduced byte for byte.
 */
export const returns = pgTable("nf_returns", {
  id: id(),
  companyId: text("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  /** ct600 for now; vat and accounts follow. */
  kind: text("kind").notNull().default("ct600"),
  periodStart: text("period_start").notNull(),
  periodEnd: text("period_end").notNull(),
  /** draft -> ready -> submitted -> accepted | rejected */
  status: text("status").notNull().default("draft"),
  /** Which accounts standard the iXBRL follows: frs105, frs102-1a, frs102. */
  basis: text("basis").notNull().default("frs105"),
  data: jsonb("data").$type<Record<string, unknown>>().default({}).notNull(),
  /** The iXBRL documents attached to the return. */
  accountsHtml: text("accounts_html"),
  computationHtml: text("computation_html"),
  /** The IRmark of the last envelope built, so it can be shown on screen. */
  irmark: text("irmark"),
  createdAt: now(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("returns_company_idx").on(t.companyId)]);

/**
 * A single attempt at filing.
 *
 * A return can be submitted more than once — a rejection is fixed and sent
 * again — so each attempt is its own row and none are deleted.
 */
export const submissions = pgTable("nf_submissions", {
  id: id(),
  /**
   * The return this attempt belongs to, when there is one. Attempts made from
   * the gateway console aren't tied to a saved return, so this is left open
   * rather than enforced — the console's whole purpose is to test the wire
   * before any real return exists.
   */
  returnId: text("return_id"),
  /** True when this went to HMRC's test service rather than the live one. */
  gatewayTest: boolean("gateway_test").notNull().default(true),
  messageClass: text("message_class").notNull(),
  /** accepted | rejected | timeout | error | running */
  outcome: text("outcome").notNull().default("running"),
  correlationId: text("correlation_id"),
  irmark: text("irmark"),
  /** HMRC's receipt, which is what proves the filing was made. */
  receipt: text("receipt"),
  /** The envelope as sent, with the password blanked out. */
  envelope: text("envelope"),
  errors: jsonb("errors").$type<{ type: string; number: string | null; text: string; location: string | null }[]>()
    .default([]).notNull(),
  startedAt: now(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  startedBy: text("started_by"),
}, (t) => [index("submissions_return_idx").on(t.returnId)]);

/** Every exchange with HMRC, in order, kept whole. */
export const submissionSteps = pgTable("nf_submission_steps", {
  id: id(),
  submissionId: text("submission_id").notNull().references(() => submissions.id, { onDelete: "cascade" }),
  /** submit | poll | delete */
  stage: text("stage").notNull(),
  qualifier: text("qualifier"),
  httpStatus: integer("http_status"),
  raw: text("raw"),
  at: now(),
}, (t) => [index("steps_submission_idx").on(t.submissionId)]);

/**
 * The gateway credentials in use.
 *
 * Passwords are never stored here. The test password lives in an environment
 * variable, and a real customer signs in with their own Government Gateway
 * details at the moment of filing. This table only records which sender ID
 * was used, so a submission can be traced back.
 */
export const credentials = pgTable("nf_credentials", {
  id: id(),
  label: text("label").notNull(),
  senderId: text("sender_id").notNull(),
  /** test | live */
  mode: text("mode").notNull().default("test"),
  /** Which environment variable holds the password. */
  secretKey: text("secret_key"),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  createdAt: now(),
});

/** Running figures kept next to a return, so arithmetic isn't repeated by hand. */
export const workings = pgTable("nf_workings", {
  id: id(),
  returnId: text("return_id").notNull().references(() => returns.id, { onDelete: "cascade" }),
  section: text("section").notNull(),
  label: text("label").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull().default("0"),
  note: text("note"),
  createdAt: now(),
}, (t) => [index("workings_return_idx").on(t.returnId)]);
