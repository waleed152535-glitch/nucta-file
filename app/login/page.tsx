import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

async function signIn(formData: FormData) {
  "use server";
  const code = process.env.NUCTA_FILE_PASSCODE;
  const given = String(formData.get("code") ?? "");
  if (!code || given !== code) redirect("/login?wrong=1");

  (await cookies()).set("nf_pass", code, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  redirect("/");
}

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ wrong?: string; unset?: string }>;
}) {
  const sp = await searchParams;

  return (
    <div style={{ gridColumn: "1 / -1", display: "grid", placeItems: "center", minHeight: "100vh", padding: 20 }}>
      <div className="card" style={{ maxWidth: 400, width: "100%", marginBottom: 0 }}>
        <div className="bd" style={{ padding: 28 }}>
          <h1 style={{ margin: "0 0 4px", fontSize: 20, fontFamily: "var(--display)" }}>Nucta File</h1>
          <p className="note" style={{ marginTop: 0, marginBottom: 20 }}>
            Corporation Tax, accounts and VAT filing.
          </p>

          {sp.unset && (
            <div className="banner warn" style={{ marginBottom: 16 }}>
              <span>⚠</span>
              <span>
                No passcode has been set, so nothing can be unlocked. Add an environment variable
                called <span className="mono">NUCTA_FILE_PASSCODE</span> where the app is hosted,
                then redeploy.
              </span>
            </div>
          )}
          {sp.wrong && (
            <div className="banner bad" style={{ marginBottom: 16 }}>
              <span>✕</span>
              <span>That passcode didn&apos;t match.</span>
            </div>
          )}

          <form action={signIn}>
            <div className="field">
              <label>Passcode</label>
              <input name="code" type="password" autoFocus autoComplete="current-password" />
            </div>
            <button className="btn" style={{ width: "100%", justifyContent: "center" }} type="submit">
              Unlock
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
