"use client";

import { useActionState } from "react";
import { updateProfileAction, changePasswordAction, signOutEverywhereAction, type FormState } from "@/lib/session-actions";

const start: FormState = { problems: [] };

function Result({ s }: { s: FormState }) {
  if (s.problems.length) return <div className="banner bad"><span>✕</span><span>{s.problems.join(" ")}</span></div>;
  if (s.done) return <div className="banner good"><span>✓</span><span>{s.done}</span></div>;
  return null;
}

export default function AccountClient({ name, email, firm, kind }: { name: string; email: string; firm: string; kind: string }) {
  const [profile, saveProfile, savingProfile] = useActionState(updateProfileAction, start);
  const [pw, savePw, savingPw] = useActionState(changePasswordAction, start);
  return (
    <>
      <div className="topbar">
        <div>
          <h2>Your account</h2>
          <div className="sub">Signed in as {email}</div>
        </div>
      </div>
      <div className="content">
        <div className="grid2">
          <form className="card" action={saveProfile}>
            <div className="hd"><h3>Details</h3></div>
            <div className="bd">
              <div className="field"><label>Your name</label><input name="name" defaultValue={name} autoComplete="name" /></div>
              <div className="field"><label>{kind === "company" ? "Company name" : "Firm name"}<span className="hint">shown on approval packs</span></label><input name="firm" defaultValue={firm} autoComplete="organization" /></div>
              <div className="field"><label>Email</label><input value={email} disabled /></div>
              <Result s={profile} />
              <button className="btn" type="submit" disabled={savingProfile}>{savingProfile ? "Saving…" : "Save details"}</button>
            </div>
          </form>
          <form className="card" action={savePw}>
            <div className="hd"><h3>Password</h3></div>
            <div className="bd">
              <div className="field"><label>Current password</label><input name="current" type="password" autoComplete="current-password" /></div>
              <div className="field"><label>New password<span className="hint">at least 10 characters</span></label><input name="next" type="password" autoComplete="new-password" /></div>
              <div className="field"><label>New password again</label><input name="again" type="password" autoComplete="new-password" /></div>
              <Result s={pw} />
              <button className="btn" type="submit" disabled={savingPw}>{savingPw ? "Changing…" : "Change password"}</button>
            </div>
          </form>
        </div>
        <form className="card" action={signOutEverywhereAction}>
          <div className="hd"><h3>Signed-in browsers</h3></div>
          <div className="bd">
            <p className="note" style={{ marginTop: 0 }}>If you signed in on a computer that isn&apos;t yours, sign out everywhere. You&apos;ll need to sign in again here too.</p>
            <button className="btn ghost" type="submit">Sign out everywhere</button>
          </div>
        </form>
      </div>
    </>
  );
}
