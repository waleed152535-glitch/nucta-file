"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signInAction, signUpAction, forgotPasswordAction, resetPasswordAction, joinAction, type FormState } from "@/lib/session-actions";

const start: FormState = { problems: [] };

function Problems({ s }: { s: FormState }) {
  if (!s.problems.length) return null;
  return <div className="err" role="alert">{s.problems.length === 1 ? s.problems[0] : <ul>{s.problems.map((p, i) => <li key={i}>{p}</li>)}</ul>}</div>;
}

export function SignInForm({ next }: { next: string }) {
  const [s, act, busy] = useActionState(signInAction, start);
  return (
    <form action={act} className="auth-card">
      <h1>Sign in</h1>
      <p className="sub">to Nucta File</p>
      <Problems s={s} />
      <input type="hidden" name="next" value={next} />
      <label className="f"><span>Email</span><input name="email" type="email" autoComplete="email" required autoFocus /></label>
      <label className="f"><span>Password</span><input name="password" type="password" autoComplete="current-password" required /></label>
      <button className="s-btn big" type="submit" disabled={busy} style={{ width: "100%" }}>{busy ? "Signing in…" : "Sign in"}</button>
      <p className="switch"><Link href="/forgot-password">Forgotten your password?</Link></p>
      <p className="switch">New to Nucta File? <Link href="/sign-up">Create an account</Link></p>
    </form>
  );
}

export function SignUpForm() {
  const [s, act, busy] = useActionState(signUpAction, start);
  return (
    <form action={act} className="auth-card">
      <h1>Create your account</h1>
      <p className="sub">Free while Nucta File is in testing.</p>
      <Problems s={s} />
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="f" style={{ marginBottom: 6 }}><span style={{ marginBottom: 0 }}>Who is it for?</span></legend>
        <div className="choice">
          <label><input type="radio" name="kind" value="practice" defaultChecked /><b>A practice</b>Accountants and formation agents with clients</label>
          <label><input type="radio" name="kind" value="company" /><b>My company</b>A director filing their own company&apos;s return</label>
        </div>
      </fieldset>
      <label className="f"><span>Your name</span><input name="name" autoComplete="name" required /></label>
      <label className="f"><span>Firm or company name</span><input name="firm" autoComplete="organization" required /></label>
      <label className="f"><span>Email</span><input name="email" type="email" autoComplete="email" required /></label>
      <label className="f"><span>Password<em>at least 10 characters</em></span><input name="password" type="password" autoComplete="new-password" minLength={10} required /></label>
      <label className="agree"><input type="checkbox" name="agreed" value="yes" required /><span>I agree to the <Link href="/terms" target="_blank">terms</Link> and have read the <Link href="/privacy" target="_blank">privacy notice</Link>.</span></label>
      <button className="s-btn big" type="submit" disabled={busy} style={{ width: "100%" }}>{busy ? "Creating your account…" : "Create account"}</button>
      <p className="switch">Already have an account? <Link href="/sign-in">Sign in</Link></p>
    </form>
  );
}

export function ForgotForm() {
  const [s, act, busy] = useActionState(forgotPasswordAction, start);
  return (
    <form action={act} className="auth-card">
      <h1>Reset your password</h1>
      <p className="sub">We&apos;ll email a link to choose a new one.</p>
      <Problems s={s} />
      {s.done ? <div className="ok">{s.done}</div> : (
        <>
          <label className="f"><span>Email</span><input name="email" type="email" autoComplete="email" required autoFocus /></label>
          <button className="s-btn big" type="submit" disabled={busy} style={{ width: "100%" }}>{busy ? "Sending…" : "Email me a link"}</button>
        </>
      )}
      <p className="switch"><Link href="/sign-in">Back to sign in</Link></p>
    </form>
  );
}

export function ResetForm({ token }: { token: string }) {
  const [s, act, busy] = useActionState(resetPasswordAction, start);
  return (
    <form action={act} className="auth-card">
      <h1>Choose a new password</h1>
      <p className="sub">At least 10 characters.</p>
      <Problems s={s} />
      <input type="hidden" name="token" value={token} />
      <label className="f"><span>New password</span><input name="password" type="password" autoComplete="new-password" minLength={10} required autoFocus /></label>
      <label className="f"><span>New password again</span><input name="again" type="password" autoComplete="new-password" minLength={10} required /></label>
      <button className="s-btn big" type="submit" disabled={busy} style={{ width: "100%" }}>{busy ? "Saving…" : "Save new password"}</button>
    </form>
  );
}

export function JoinForm({ token, name, email, accountName }: { token: string; name: string; email: string; accountName: string }) {
  const [s, act, busy] = useActionState(joinAction, start);
  return (
    <form action={act} className="auth-card">
      <h1>Join {accountName}</h1>
      <p className="sub">on Nucta File, as {email}</p>
      <Problems s={s} />
      <input type="hidden" name="token" value={token} />
      <label className="f"><span>Your name</span><input name="name" autoComplete="name" defaultValue={name} required /></label>
      <label className="f"><span>Choose a password<em>at least 10 characters</em></span><input name="password" type="password" autoComplete="new-password" minLength={10} required /></label>
      <label className="f"><span>The password again</span><input name="again" type="password" autoComplete="new-password" minLength={10} required /></label>
      <button className="s-btn big" type="submit" disabled={busy} style={{ width: "100%" }}>{busy ? "Joining…" : "Join the account"}</button>
      <p className="switch">By joining you agree to the <Link href="/terms" target="_blank">terms</Link>.</p>
    </form>
  );
}
