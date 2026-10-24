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
/**
 * A customer: an accountancy practice or formation agent with many client
 * companies, or one company's owner. Every company belongs to one account,
 * and only that account's users can see it.
 */
export const accounts = pgTable("nf_accounts", {
  id: id(),
  name: text("name").notNull(),
  /** "practice" for accountants and agents, "company" for a company's own director. */
  kind: text("kind").notNull().default("practice"),
  createdAt: now(),
});

export const users = pgTable("nf_users", {
  id: id(),
  accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  /** Stored in lower case; unique. */
  email: text("email").notNull(),
  name: text("name").notNull(),
  /** scrypt, with its parameters and salt: never the password itself. */
  passwordHash: text("password_hash").notNull(),
  failedLogins: integer("failed_logins").default(0).notNull(),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  /** "owner" can invite and remove colleagues; "member" does everything else. */
  role: text("role").notNull().default("owner"),
  /** When the email address was confirmed by its link; empty until then. */
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  createdAt: now(),
}, (t) => [index("users_email_idx").on(t.email)]);

/** An invitation for a colleague to join an account. The id is the SHA-256 of the link's token. */
export const invites = pgTable("nf_invites", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull().default("member"),
  invitedBy: text("invited_by").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdAt: now(),
}, (t) => [index("invites_account_idx").on(t.accountId)]);

/** A signed-in browser. The cookie holds a random token; only its SHA-256 hash is stored. */
export const sessions = pgTable("nf_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  userAgent: text("user_agent"),
  createdAt: now(),
}, (t) => [index("sessions_user_idx").on(t.userId)]);

/** A one-time link to choose a new password, valid for an hour. Only the token's hash is stored. */
export const passwordResets = pgTable("nf_password_resets", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: now(),
});

export const companies = pgTable("nf_companies", {
  id: id(),
  /** The customer account the company belongs to. */
  accountId: text("account_id"),
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

/**
 * A request for a director to approve a return online. The director opens a
 * link (only its token's hash is kept), reads the approval pack and approves
 * by typing their name; when, from where and for which figures is recorded.
 */
export const approvals = pgTable("nf_approvals", {
  id: id(),
  tokenHash: text("token_hash").notNull(),
  returnId: text("return_id").notNull().references(() => returns.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  directorName: text("director_name").notNull(),
  directorEmail: text("director_email"),
  /** sent | approved | query | cancelled */
  status: text("status").notNull().default("sent"),
  /** A fingerprint of the figures sent for approval: a change afterwards means approving again. */
  figuresHash: text("figures_hash").notNull(),
  createdBy: text("created_by").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  lastSentAt: timestamp("last_sent_at", { withTimezone: true }),
  sentCount: integer("sent_count").default(0).notNull(),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  approvedName: text("approved_name"),
  approvedIp: text("approved_ip"),
  approvedUa: text("approved_ua"),
  /** A question the director sent back instead of approving. */
  query: text("query"),
  createdAt: now(),
}, (t) => [index("approvals_return_idx").on(t.returnId), index("approvals_token_idx").on(t.tokenHash)]);

/** Notes on a company: a running record of what was asked, sent and agreed. */
export const notes = pgTable("nf_notes", {
  id: id(),
  accountId: text("account_id").notNull(),
  companyId: text("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  authorName: text("author_name").notNull(),
  body: text("body").notNull(),
  createdAt: now(),
}, (t) => [index("notes_company_idx").on(t.companyId)]);

/** Things to do, for a company or for the practice as a whole. */
export const tasks = pgTable("nf_tasks", {
  id: id(),
  accountId: text("account_id").notNull(),
  companyId: text("company_id").references(() => companies.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  /** yyyy-mm-dd, or empty. */
  due: text("due"),
  done: boolean("done").default(false).notNull(),
  createdBy: text("created_by").notNull(),
  doneAt: timestamp("done_at", { withTimezone: true }),
  createdAt: now(),
}, (t) => [index("tasks_account_idx").on(t.accountId)]);

/**
 * Settings Nucta File's administrators change from inside the software, such
 * as whether live filing is open. One row per setting; the value is JSON.
 */
export const settings = pgTable("nf_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** A link to confirm an email address. The id is the SHA-256 of the link's token. */
export const emailChecks = pgTable("nf_email_checks", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: now(),
}, (t) => [index("email_checks_user_idx").on(t.userId)]);

/**
 * A payment for filing a return, taken by Stripe Checkout. Amounts are in
 * pence. A payment is "paid" only once Stripe confirm it — by the webhook,
 * or by asking Stripe when the customer comes back.
 */
export const payments = pgTable("nf_payments", {
  id: id(),
  accountId: text("account_id").notNull(),
  returnId: text("return_id").notNull(),
  userId: text("user_id").notNull(),
  stripeSessionId: text("stripe_session_id").notNull(),
  paymentIntent: text("payment_intent"),
  amount: integer("amount").notNull(),
  currency: text("currency").notNull().default("gbp"),
  description: text("description").notNull(),
  /** pending | paid | expired | refunded */
  status: text("status").notNull().default("pending"),
  email: text("email"),
  receiptUrl: text("receipt_url"),
  /** Set once the confirmation email has gone, so it goes once. */
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdAt: now(),
}, (t) => [index("payments_return_idx").on(t.returnId), index("payments_session_idx").on(t.stripeSessionId), index("payments_account_idx").on(t.accountId)]);
