"use server";

import { redirect } from "next/navigation";
import {
  createAccount, signIn, signOut, changePassword, updateProfile, requestPasswordReset, resetPassword, currentUser, emailReady,
  sendEmailCheck, siteOrigin,
} from "./auth";

/** Only paths inside the software, so a sign-in link can't send someone elsewhere. */
const safeNext = (v: FormDataEntryValue | null) => {
  const n = String(v ?? "");
  return /^\/(dashboard|companies|returns|deadlines|gateway|live-filing|payments|companies-house|log|settings|status|account)(\/|\?|$)/.test(n) ? n : "/dashboard";
};

export interface FormState { problems: string[]; done?: string }

export async function signUpAction(_: FormState, f: FormData): Promise<FormState> {
  const r = await createAccount({
    name: String(f.get("name") ?? ""), email: String(f.get("email") ?? ""), password: String(f.get("password") ?? ""),
    firm: String(f.get("firm") ?? ""), kind: f.get("kind") === "company" ? "company" : "practice", agreed: f.get("agreed") === "yes",
  });
  if (!r.ok) return { problems: r.problems };
  // The link to confirm the email. If it can't go now, the app offers to send it again.
  if (r.userId && emailReady()) await sendEmailCheck(r.userId, await siteOrigin()).catch(() => undefined);
  redirect("/dashboard");
}

/** "Send the link again", from the bar at the top of the software. */
export async function resendEmailCheckAction(): Promise<FormState> {
  const u = await currentUser();
  if (!u) return { problems: ["You're signed out. Sign in again to carry on."] };
  const r = await sendEmailCheck(u.id, await siteOrigin());
  if (!r.ok) return { problems: [r.problem ?? "Couldn't send the link."] };
  return { problems: [], done: r.already ? "Your email is already confirmed." : `Sent to ${u.email}. Open the link in that email.` };
}

export async function signInAction(_: FormState, f: FormData): Promise<FormState> {
  const r = await signIn(String(f.get("email") ?? ""), String(f.get("password") ?? ""));
  if (!r.ok) return { problems: [r.problem ?? "Couldn't sign in."] };
  redirect(safeNext(f.get("next")));
}

export async function signOutAction(): Promise<void> {
  await signOut();
  redirect("/");
}

export async function signOutEverywhereAction(): Promise<void> {
  await signOut(true);
  redirect("/sign-in");
}

export async function forgotPasswordAction(_: FormState, f: FormData): Promise<FormState> {
  if (!emailReady()) return { problems: ["Password reset by email isn't switched on yet. Email us from the contact page and we'll reset it for you."] };
  // The link's address comes from the settings, never from the request: a
  // forged Host header could otherwise send the reset link somewhere else.
  await requestPasswordReset(String(f.get("email") ?? ""), await siteOrigin());
  return { problems: [], done: "If that email has an account, a link to choose a new password is on its way. It works for one hour." };
}

export async function resetPasswordAction(_: FormState, f: FormData): Promise<FormState> {
  const pw = String(f.get("password") ?? ""), again = String(f.get("again") ?? "");
  if (pw !== again) return { problems: ["The two passwords don't match."] };
  const r = await resetPassword(String(f.get("token") ?? ""), pw);
  if (!r.ok) return { problems: [r.problem ?? "Couldn't reset the password."] };
  redirect("/dashboard");
}

export async function updateProfileAction(_: FormState, f: FormData): Promise<FormState> {
  const u = await currentUser();
  if (!u) return { problems: ["You're signed out."] };
  const r = await updateProfile(u, String(f.get("name") ?? ""), String(f.get("firm") ?? ""));
  return r.ok ? { problems: [], done: "Saved." } : { problems: [r.problem ?? "Couldn't save."] };
}

export async function changePasswordAction(_: FormState, f: FormData): Promise<FormState> {
  const u = await currentUser();
  if (!u) return { problems: ["You're signed out."] };
  const next = String(f.get("next") ?? ""), again = String(f.get("again") ?? "");
  if (next !== again) return { problems: ["The two new passwords don't match."] };
  const r = await changePassword(u, String(f.get("current") ?? ""), next);
  return r.ok ? { problems: [], done: "Password changed. Other browsers signed in to this account have been signed out." } : { problems: [r.problem ?? "Couldn't change it."] };
}

/** A colleague accepting an invitation: choose a password, join the account, signed in. */
export async function joinAction(_: FormState, f: FormData): Promise<FormState> {
  const { acceptInvite } = await import("./team-core");
  const pw = String(f.get("password") ?? ""), again = String(f.get("again") ?? "");
  if (pw !== again) return { problems: ["The two passwords don't match."] };
  const r = await acceptInvite(String(f.get("token") ?? ""), String(f.get("name") ?? ""), pw);
  if (!r.ok) return { problems: r.problems };
  redirect("/dashboard");
}
