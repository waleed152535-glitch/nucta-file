"use server";

/**
 * Colleagues on an account. The owner invites people by email; each gets a
 * one-time link (valid for 7 days) to choose a password and join. Everyone on
 * the account sees and works on the same companies. Only owners can invite
 * or remove.
 */
import { randomBytes } from "crypto";
import { headers } from "next/headers";
import { emailProblem, emailReady, normaliseEmail, sendEmail, sha256 } from "./auth";
import { SIGNED_OUT, problem, signedIn, siteUrl, store } from "./store";

export interface TeamView {
  ok: boolean; error?: string;
  you: { id: string; role: string } | null;
  members: { id: string; name: string; email: string; role: string; lastLoginAt: string | null; you: boolean }[];
  invites: { id: string; name: string; email: string; createdAt: string; expiresAt: string }[];
  emailReady: boolean;
}

export async function getTeam(): Promise<TeamView> {
  const u = await signedIn();
  const blank: TeamView = { ok: false, you: null, members: [], invites: [], emailReady: emailReady() };
  if (!u) return { ...blank, error: SIGNED_OUT };
  try {
    const s = await store();
    const members = await s.db.select({ id: s.users.id, name: s.users.name, email: s.users.email, role: s.users.role, lastLoginAt: s.users.lastLoginAt })
      .from(s.users).where(s.eq(s.users.accountId, u.accountId)).orderBy(s.asc(s.users.createdAt));
    const invites = await s.db.select().from(s.invites)
      .where(s.and(s.eq(s.invites.accountId, u.accountId), s.isNull(s.invites.acceptedAt), s.gt(s.invites.expiresAt, new Date())))
      .orderBy(s.desc(s.invites.createdAt));
    return {
      ok: true, you: { id: u.id, role: u.role }, emailReady: emailReady(),
      members: members.map((m) => ({ ...m, lastLoginAt: m.lastLoginAt?.toISOString() ?? null, you: m.id === u.id })),
      invites: invites.map((i) => ({ id: i.id, name: i.name, email: i.email, createdAt: i.createdAt.toISOString(), expiresAt: i.expiresAt.toISOString() })),
    };
  } catch (e) {
    return { ...blank, error: problem(e) };
  }
}

export async function inviteColleague(nameRaw: string, emailRaw: string): Promise<{ ok: boolean; problem?: string; link?: string; emailed?: boolean }> {
  const u = await signedIn();
  if (!u) return { ok: false, problem: SIGNED_OUT };
  if (u.role !== "owner") return { ok: false, problem: "Only the account's owner can invite people." };
  const name = nameRaw.trim(), email = normaliseEmail(emailRaw);
  if (name.length < 2) return { ok: false, problem: "Enter their name." };
  const ep = emailProblem(email); if (ep) return { ok: false, problem: ep };
  try {
    const s = await store();
    const [existing] = await s.db.select({ accountId: s.users.accountId }).from(s.users).where(s.eq(s.users.email, email));
    if (existing) return { ok: false, problem: existing.accountId === u.accountId ? "They're already on this account." : "That email already has its own Nucta File account. Use a different email for them." };
    // A fresh invitation replaces any earlier one to the same person.
    await s.db.delete(s.invites).where(s.and(s.eq(s.invites.accountId, u.accountId), s.eq(s.invites.email, email), s.isNull(s.invites.acceptedAt)));
    const token = randomBytes(32).toString("base64url");
    await s.db.insert(s.invites).values({ id: sha256(token), accountId: u.accountId, email, name, role: "member", invitedBy: u.name, expiresAt: new Date(Date.now() + 7 * 86_400_000) });
    const link = `${siteUrl((await headers()).get("host"))}/join?token=${token}`;
    const emailed = await sendEmail(email, `${u.name} has invited you to Nucta File`,
      `Hello ${name},\n\n${u.name} has invited you to join ${u.accountName} on Nucta File, to prepare and file Company Tax Returns together.\n\nTo accept, open this link within 7 days and choose a password:\n\n${link}\n\nIf you weren't expecting this, ignore this email.\n\nNucta File`);
    return { ok: true, link, emailed };
  } catch (e) {
    return { ok: false, problem: problem(e) };
  }
}

export async function cancelInvite(id: string): Promise<{ ok: boolean; problem?: string }> {
  const u = await signedIn();
  if (!u) return { ok: false, problem: SIGNED_OUT };
  if (u.role !== "owner") return { ok: false, problem: "Only the account's owner can do that." };
  const s = await store();
  await s.db.delete(s.invites).where(s.and(s.eq(s.invites.id, id), s.eq(s.invites.accountId, u.accountId)));
  return { ok: true };
}

export async function removeColleague(userId: string): Promise<{ ok: boolean; problem?: string }> {
  const u = await signedIn();
  if (!u) return { ok: false, problem: SIGNED_OUT };
  if (u.role !== "owner") return { ok: false, problem: "Only the account's owner can remove people." };
  if (userId === u.id) return { ok: false, problem: "You can't remove yourself." };
  const s = await store();
  // Their sessions go with them, so they're signed out everywhere at once.
  await s.db.delete(s.users).where(s.and(s.eq(s.users.id, userId), s.eq(s.users.accountId, u.accountId)));
  return { ok: true };
}
