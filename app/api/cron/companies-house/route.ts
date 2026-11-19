import { collectLive } from "@/lib/ch-filing";
import { store } from "@/lib/store";

/**
 * The scheduled check on Companies House (vercel.json): collects the results
 * of accounts filed for real, records them on the returns and emails whoever
 * filed. Results also arrive whenever a return is opened; this catches the
 * ones nobody is looking at.
 *
 * Only Vercel's scheduler may run it: it sends CRON_SECRET as a bearer token,
 * so without that setting nothing runs.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ ok: false, error: "Not allowed." }, { status: 401 });
  }
  try {
    const s = await store();
    return Response.json(await collectLive(s));
  } catch (e) {
    return Response.json({ ok: false, error: String((e as Error)?.message ?? e).slice(0, 200) }, { status: 500 });
  }
}
