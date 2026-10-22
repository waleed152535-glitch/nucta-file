/**
 * Accepting an invitation: the only team step that happens before anyone is
 * signed in, so it's guarded by the link's token alone. Server only.
 */
import { joinAccount, sha256 } from "./auth";
import { store } from "./store";

export interface InviteView { ok: boolean; problem?: string; accountName?: string; email?: string; name?: string; invitedBy?: string }

async function find(token: string) {
  if (!token || token.length < 20) return null;
  const s = await store();
  const [i] = await s.db.select({ inv: s.invites, accountName: s.accounts.name }).from(s.invites)
    .innerJoin(s.accounts, s.eq(s.accounts.id, s.invites.accountId)).where(s.eq(s.invites.id, sha256(token)));
  return i ?? null;
}

export async function inviteByToken(token: string): Promise<InviteView> {
  const i = await find(token);
  if (!i) return { ok: false, problem: "This invitation link isn't complete, or has been replaced by a newer one." };
  if (i.inv.acceptedAt) return { ok: false, problem: "This invitation has already been used. Sign in instead." };
  if (i.inv.expiresAt.getTime() < Date.now()) return { ok: false, problem: "This invitation has expired. Ask for a new one." };
  return { ok: true, accountName: i.accountName, email: i.inv.email, name: i.inv.name, invitedBy: i.inv.invitedBy };
}

export async function acceptInvite(token: string, name: string, password: string): Promise<{ ok: boolean; problems: string[] }> {
  const i = await find(token);
  const v = await inviteByToken(token);
  if (!i || !v.ok) return { ok: false, problems: [v.problem ?? "This invitation can't be used."] };
  const r = await joinAccount({ accountId: i.inv.accountId, email: i.inv.email, name, password, role: i.inv.role });
  if (!r.ok) return r;
  const s = await store();
  await s.db.update(s.invites).set({ acceptedAt: new Date() }).where(s.eq(s.invites.id, i.inv.id));
  return r;
}
