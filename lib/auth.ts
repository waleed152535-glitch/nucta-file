/**
 * Accounts and sign-in. Server only.
 *
 * Passwords are hashed with scrypt (a random salt each, the parameters stored
 * alongside) and never kept or logged. A signed-in browser holds a random
 * token in an HttpOnly cookie; the database keeps only the token's SHA-256,
 * so a copy of the database can't be used to sign in. Ten wrong passwords in
 * a row lock the account for 15 minutes.
 *
 * Every page and action that touches a customer's data asks `currentUser()`
 * and limits itself to that user's account.
 *
 * A new account's email address is confirmed by a link sent to it. Until it
 * is, everything works except filing with HMRC and paying — so receipts and
 * payment confirmations only ever go to an address someone has shown is
 * theirs. When email isn't set up there's no way to confirm, so nothing waits.
 */

import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual, randomUUID } from "crypto";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { ensureSchema } from "./db-ensure";
import { SITE } from "./site";

export const SESSION_COOKIE = "nf_session";
/**
 * A hint for the public website that someone is signed in, so its header can
 * offer "Open Nucta File". It holds nothing secret and proves nothing: the
 * app itself checks the real session.
 */
export const SIGNED_IN_HINT = "nf_in";
const SESSION_DAYS = 30;
const LOCK_AFTER = 10, LOCK_MINUTES = 15;

const scrypt = (pw: string, salt: Buffer, n: number, r: number, p: number) =>
  new Promise<Buffer>((res, rej) => scryptCb(pw.normalize("NFKC"), salt, 64, { N: n, r, p, maxmem: 64 * 1024 * 1024 }, (e, k) => (e ? rej(e) : res(k))));

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16), n = 16384, r = 8, p = 1;
  const key = await scrypt(pw, salt, n, r, p);
  return `scrypt$${n}$${r}$${p}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [kind, n, r, p, salt, key] = stored.split("$");
  if (kind !== "scrypt" || !salt || !key) return false;
  const want = Buffer.from(key, "base64");
  const got = await scrypt(pw, Buffer.from(salt, "base64"), Number(n), Number(r), Number(p));
  return got.length === want.length && timingSafeEqual(got, want);
}

export const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

/** What a password must be: long enough to resist guessing, and not the email. */
export function passwordProblem(pw: string, email = ""): string | null {
  if (pw.length < 10) return "Use at least 10 characters for the password.";
  if (pw.length > 200) return "That password is too long.";
  if (email && pw.toLowerCase().includes(email.toLowerCase().split("@")[0]) && email.split("@")[0].length > 3) return "Don't use your email address in the password.";
  if (/^(.)\1+$/.test(pw) || /^(0123456789|1234567890|password1?2?3?|qwertyuiop)/i.test(pw)) return "That password is too easy to guess.";
  return null;
}

export const normaliseEmail = (e: string) => e.trim().toLowerCase();
export const emailProblem = (e: string) => (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) ? null : "Enter a valid email address.");

export interface SignedInUser {
  id: string;
  name: string;
  email: string;
  accountId: string;
  accountName: string;
  accountKind: string;
  /** "owner" can invite and remove colleagues. */
  role: string;
  admin: boolean;
  /** Whether the email address has been confirmed by its link. */
  emailVerified: boolean;
}

/** The people who can use the developer consoles: NUCTA_ADMIN_EMAILS, comma separated. */
export const adminEmails = (): string[] => (process.env.NUCTA_ADMIN_EMAILS ?? "").split(/[,\s]+/).map(normaliseEmail).filter(Boolean);

async function store() {
  await ensureSchema();
  const { db } = await import("./db");
  const schema = await import("./schema");
  const orm = await import("drizzle-orm");
  return { db, ...schema, ...orm };
}

/** The signed-in user for this request, or null. */
export const currentUser = cache(async (): Promise<SignedInUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const s = await store();
    const [row] = await s.db.select({
      expiresAt: s.sessions.expiresAt, id: s.users.id, name: s.users.name, email: s.users.email,
      accountId: s.accounts.id, accountName: s.accounts.name, accountKind: s.accounts.kind, role: s.users.role,
      emailVerifiedAt: s.users.emailVerifiedAt,
    }).from(s.sessions)
      .innerJoin(s.users, s.eq(s.users.id, s.sessions.userId))
      .innerJoin(s.accounts, s.eq(s.accounts.id, s.users.accountId))
      .where(s.eq(s.sessions.id, sha256(token)));
    if (!row || row.expiresAt.getTime() < Date.now()) return null;
    return { id: row.id, name: row.name, email: row.email, accountId: row.accountId, accountName: row.accountName, accountKind: row.accountKind, role: row.role, admin: adminEmails().includes(row.email), emailVerified: Boolean(row.emailVerifiedAt) };
  } catch {
    return null;
  }
});

async function startSession(userId: string): Promise<void> {
  const s = await store();
  const token = randomBytes(32).toString("base64url");
  const ua = (await headers()).get("user-agent")?.slice(0, 300) ?? null;
  await s.db.insert(s.sessions).values({ id: sha256(token), userId, expiresAt: new Date(Date.now() + SESSION_DAYS * 86_400_000), userAgent: ua });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_DAYS * 86_400,
  });
  (await cookies()).set(SIGNED_IN_HINT, "1", { secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_DAYS * 86_400 });
}

/** An admin signing in for the first time takes over the companies added before accounts existed. */
async function claimOldCompanies(accountId: string, email: string) {
  if (!adminEmails().includes(email)) return;
  const s = await store();
  await s.db.update(s.companies).set({ accountId }).where(s.isNull(s.companies.accountId));
}

export interface SignUpInput { name: string; email: string; password: string; firm: string; kind: "practice" | "company"; agreed: boolean }

export async function createAccount(i: SignUpInput): Promise<{ ok: boolean; problems: string[]; userId?: string }> {
  const problems: string[] = [];
  const email = normaliseEmail(i.email);
  if (i.name.trim().length < 2) problems.push("Enter your name.");
  const ep = emailProblem(email); if (ep) problems.push(ep);
  if (i.firm.trim().length < 2) problems.push(i.kind === "company" ? "Enter the company's name." : "Enter your firm's name.");
  const pp = passwordProblem(i.password, email); if (pp) problems.push(pp);
  if (!i.agreed) problems.push("Agree to the terms and the privacy notice to create an account.");
  if (problems.length) return { ok: false, problems };
  const s = await store();
  const [existing] = await s.db.select({ id: s.users.id }).from(s.users).where(s.eq(s.users.email, email));
  if (existing) return { ok: false, problems: ["There's already an account with this email. Sign in instead, or reset the password."] };
  const accountId = randomUUID(), userId = randomUUID();
  await s.db.insert(s.accounts).values({ id: accountId, name: i.firm.trim(), kind: i.kind });
  await s.db.insert(s.users).values({ id: userId, accountId, email, name: i.name.trim(), passwordHash: await hashPassword(i.password), lastLoginAt: new Date() });
  await claimOldCompanies(accountId, email);
  await startSession(userId);
  return { ok: true, problems: [], userId };
}

/**
 * A colleague joining an existing account from an invitation: a new user in
 * that account, signed in straight away. The invitation itself is checked by
 * the caller (lib/team-core.ts).
 */
export async function joinAccount(i: { accountId: string; email: string; name: string; password: string; role: string }): Promise<{ ok: boolean; problems: string[] }> {
  const problems: string[] = [];
  const email = normaliseEmail(i.email);
  if (i.name.trim().length < 2) problems.push("Enter your name.");
  const pp = passwordProblem(i.password, email); if (pp) problems.push(pp);
  if (problems.length) return { ok: false, problems };
  const s = await store();
  const [existing] = await s.db.select({ id: s.users.id }).from(s.users).where(s.eq(s.users.email, email));
  if (existing) return { ok: false, problems: ["There's already a Nucta File account with this email. Ask whoever invited you to use a different email, or sign in with that account."] };
  const userId = randomUUID();
  // The invitation went to this address and was opened from it, so the address is confirmed.
  await s.db.insert(s.users).values({ id: userId, accountId: i.accountId, email, name: i.name.trim(), passwordHash: await hashPassword(i.password), lastLoginAt: new Date(), role: i.role === "owner" ? "owner" : "member", emailVerifiedAt: new Date() });
  await startSession(userId);
  return { ok: true, problems: [] };
}

export async function signIn(emailRaw: string, password: string): Promise<{ ok: boolean; problem?: string }> {
  const email = normaliseEmail(emailRaw);
  const wrong = { ok: false, problem: "That email and password don't match an account." };
  if (!email || !password) return { ok: false, problem: "Enter your email and password." };
  const s = await store();
  const [u] = await s.db.select().from(s.users).where(s.eq(s.users.email, email));
  if (!u) { await verifyPassword(password, "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA"); return wrong; }
  if (u.lockedUntil && u.lockedUntil.getTime() > Date.now()) {
    return { ok: false, problem: `Too many wrong passwords. Try again after ${u.lockedUntil.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" })} (UK time), or reset the password.` };
  }
  if (!(await verifyPassword(password, u.passwordHash))) {
    const fails = u.failedLogins + 1;
    await s.db.update(s.users).set({ failedLogins: fails >= LOCK_AFTER ? 0 : fails, lockedUntil: fails >= LOCK_AFTER ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null }).where(s.eq(s.users.id, u.id));
    return wrong;
  }
  await s.db.update(s.users).set({ failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() }).where(s.eq(s.users.id, u.id));
  await claimOldCompanies(u.accountId, email);
  await startSession(u.id);
  return { ok: true };
}

export async function signOut(everywhere = false): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const s = await store();
    if (everywhere) {
      const [row] = await s.db.select({ userId: s.sessions.userId }).from(s.sessions).where(s.eq(s.sessions.id, sha256(token)));
      if (row) await s.db.delete(s.sessions).where(s.eq(s.sessions.userId, row.userId));
    } else await s.db.delete(s.sessions).where(s.eq(s.sessions.id, sha256(token)));
  }
  jar.delete(SESSION_COOKIE);
  jar.delete(SIGNED_IN_HINT);
}

export async function changePassword(user: SignedInUser, current: string, next: string): Promise<{ ok: boolean; problem?: string }> {
  const s = await store();
  const [u] = await s.db.select().from(s.users).where(s.eq(s.users.id, user.id));
  if (!u || !(await verifyPassword(current, u.passwordHash))) return { ok: false, problem: "The current password isn't right." };
  const pp = passwordProblem(next, u.email); if (pp) return { ok: false, problem: pp };
  await s.db.update(s.users).set({ passwordHash: await hashPassword(next) }).where(s.eq(s.users.id, u.id));
  // Other browsers signed in with the old password are signed out.
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  await s.db.delete(s.sessions).where(s.and(s.eq(s.sessions.userId, u.id), s.ne(s.sessions.id, sha256(token ?? ""))));
  return { ok: true };
}

export async function updateProfile(user: SignedInUser, name: string, firm: string): Promise<{ ok: boolean; problem?: string }> {
  if (name.trim().length < 2) return { ok: false, problem: "Enter your name." };
  if (firm.trim().length < 2) return { ok: false, problem: "Enter the firm or company name." };
  const s = await store();
  await s.db.update(s.users).set({ name: name.trim() }).where(s.eq(s.users.id, user.id));
  await s.db.update(s.accounts).set({ name: firm.trim() }).where(s.eq(s.accounts.id, user.accountId));
  return { ok: true };
}

// ---- password reset by email ----

/** Whether reset emails can be sent: RESEND_API_KEY and EMAIL_FROM set. */
export const emailReady = () => Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);

export async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  return (await sendEmailChecked(to, subject, text)).ok;
}

/** Sends an email and, if it fails, says why in the email service's own words. */
export async function sendEmailChecked(to: string, subject: string, text: string): Promise<{ ok: boolean; error?: string }> {
  if (!emailReady()) return { ok: false, error: "RESEND_API_KEY and EMAIL_FROM aren't both set in the hosting settings." };
  try {
    const r = await fetch(`${process.env.RESEND_API_BASE ?? "https://api.resend.com"}/emails`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to, subject, text }),
    });
    if (r.ok) return { ok: true };
    const body = await r.text().catch(() => "");
    let said = body.slice(0, 300);
    try { said = (JSON.parse(body) as { message?: string }).message ?? said; } catch { /* not JSON */ }
    return { ok: false, error: `The email service said (${r.status}): ${said || "no reason given"}` };
  } catch (e) {
    return { ok: false, error: `The email service couldn't be reached: ${String((e as Error)?.message ?? e).slice(0, 200)}` };
  }
}

/** Sends a reset link if the email has an account. Says the same either way, so it can't be used to find accounts. */
export async function requestPasswordReset(emailRaw: string, origin: string): Promise<void> {
  const email = normaliseEmail(emailRaw);
  const s = await store();
  const [u] = await s.db.select({ id: s.users.id, name: s.users.name }).from(s.users).where(s.eq(s.users.email, email));
  if (!u) return;
  const token = randomBytes(32).toString("base64url");
  await s.db.insert(s.passwordResets).values({ id: sha256(token), userId: u.id, expiresAt: new Date(Date.now() + 60 * 60_000) });
  await sendEmail(email, "Reset your Nucta File password",
    `Hello ${u.name},\n\nTo choose a new password for Nucta File, open this link within the next hour:\n\n${origin}/reset-password?token=${token}\n\nIf you didn't ask for this, ignore this email — your password stays as it is.\n\nNucta File`);
}

export async function resetPassword(token: string, next: string): Promise<{ ok: boolean; problem?: string }> {
  const s = await store();
  const [r] = await s.db.select().from(s.passwordResets).where(s.eq(s.passwordResets.id, sha256(token)));
  if (!r || r.usedAt || r.expiresAt.getTime() < Date.now()) return { ok: false, problem: "That link has expired or has already been used. Ask for a new one." };
  const [u] = await s.db.select().from(s.users).where(s.eq(s.users.id, r.userId));
  if (!u) return { ok: false, problem: "That account no longer exists." };
  const pp = passwordProblem(next, u.email); if (pp) return { ok: false, problem: pp };
  // The reset link came to this address, so it's confirmed too.
  await s.db.update(s.users).set({ passwordHash: await hashPassword(next), failedLogins: 0, lockedUntil: null, emailVerifiedAt: u.emailVerifiedAt ?? new Date() }).where(s.eq(s.users.id, u.id));
  await s.db.update(s.passwordResets).set({ usedAt: new Date() }).where(s.eq(s.passwordResets.id, r.id));
  await s.db.delete(s.sessions).where(s.eq(s.sessions.userId, u.id));
  await startSession(u.id);
  return { ok: true };
}

/**
 * Where links in emails point: NUCTA_SITE_URL, else the hosting's own
 * address. Never the request's Host header alone in production, since a forged
 * one could send a link somewhere else.
 */
export async function siteOrigin(): Promise<string> {
  const configured = process.env.NUCTA_SITE_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  if (configured) return configured.replace(/\/+$/, "");
  const h = await headers();
  return `http://${h.get("host") ?? "localhost:3000"}`;
}

// ---- confirming the email address ----

const CHECK_HOURS = 48;
const CHECKS_PER_DAY = 5;

/** Whether this person still has to confirm their email before filing or paying. */
export const emailCheckNeeded = (u: SignedInUser) => emailReady() && !u.emailVerified;

/**
 * Emails a link that confirms the address. At most one a minute and five a
 * day, so the button can't be used to flood someone's inbox.
 */
export async function sendEmailCheck(userId: string, origin: string): Promise<{ ok: boolean; problem?: string; already?: boolean }> {
  if (!emailReady()) return { ok: false, problem: "Email isn't set up for Nucta File yet, so there's nothing to confirm." };
  const s = await store();
  const [u] = await s.db.select({ id: s.users.id, email: s.users.email, name: s.users.name, verified: s.users.emailVerifiedAt }).from(s.users).where(s.eq(s.users.id, userId));
  if (!u) return { ok: false, problem: "That account no longer exists." };
  if (u.verified) return { ok: true, already: true };
  const recent = await s.db.select({ at: s.emailChecks.createdAt }).from(s.emailChecks)
    .where(s.and(s.eq(s.emailChecks.userId, u.id), s.gte(s.emailChecks.createdAt, new Date(Date.now() - 86_400_000))))
    .orderBy(s.desc(s.emailChecks.createdAt));
  if (recent[0] && Date.now() - recent[0].at.getTime() < 60_000) return { ok: false, problem: "A link was sent less than a minute ago. Check your inbox and the spam folder, or try again in a minute." };
  if (recent.length >= CHECKS_PER_DAY) return { ok: false, problem: `${CHECKS_PER_DAY} links have been sent today. Check the spam folder, or email ${SITE.email} and we'll confirm it for you.` };
  const token = randomBytes(32).toString("base64url");
  await s.db.insert(s.emailChecks).values({ id: sha256(token), userId: u.id, email: u.email, expiresAt: new Date(Date.now() + CHECK_HOURS * 3_600_000) });
  const sent = await sendEmailChecked(u.email, "Confirm your email for Nucta File", emailCheckText(u.name, `${origin}/verify-email?token=${token}`));
  return sent.ok ? { ok: true } : { ok: false, problem: "The email couldn't be sent just now. Try again in a few minutes." };
}

export function emailCheckText(name: string, link: string): string {
  return `Hello ${name},

Welcome to Nucta File. Please confirm that this is your email address by opening this link:

${link}

The link works for ${CHECK_HOURS} hours. Once your email is confirmed you can file returns with HMRC, and HMRC's receipts and your payment confirmations come here.

If you didn't create a Nucta File account, ignore this email and nothing more will happen.

${SITE.product}
${SITE.company}`;
}

export type EmailCheckOutcome = "confirmed" | "already" | "expired" | "invalid";

/** Confirms an address from its link. Opening the link twice is fine. */
export async function confirmEmail(token: string): Promise<{ outcome: EmailCheckOutcome; email?: string }> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return { outcome: "invalid" };
  const s = await store();
  const [c] = await s.db.select().from(s.emailChecks).where(s.eq(s.emailChecks.id, sha256(token)));
  if (!c) return { outcome: "invalid" };
  const [u] = await s.db.select({ id: s.users.id, email: s.users.email, verified: s.users.emailVerifiedAt }).from(s.users).where(s.eq(s.users.id, c.userId));
  if (!u || u.email !== c.email) return { outcome: "invalid" };
  if (u.verified || c.usedAt) return { outcome: "already", email: u.email };
  if (c.expiresAt.getTime() < Date.now()) return { outcome: "expired", email: u.email };
  await s.db.update(s.users).set({ emailVerifiedAt: new Date() }).where(s.eq(s.users.id, u.id));
  await s.db.update(s.emailChecks).set({ usedAt: new Date() }).where(s.eq(s.emailChecks.id, c.id));
  return { outcome: "confirmed", email: u.email };
}
