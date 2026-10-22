/**
 * Every deadline in the signed-in account as a calendar file (iCalendar), so
 * Outlook, Apple Calendar or Google Calendar show them, with reminders a week
 * and a day before. Only this account's companies are in it.
 */
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { getDashboard } from "@/lib/return-actions";

export const dynamic = "force-dynamic";

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
/** Lines longer than 75 octets are folded, as the format requires. */
const fold = (line: string) => {
  const out: string[] = [];
  let rest = line;
  while (Buffer.byteLength(rest) > 75) {
    let n = 75;
    while (Buffer.byteLength(rest.slice(0, n)) > 75) n--;
    out.push(rest.slice(0, n)); rest = " " + rest.slice(n);
  }
  out.push(rest);
  return out.join("\r\n");
};
const day = (iso: string) => iso.replace(/-/g, "");
const nextDay = (iso: string) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + 1); return day(d.toISOString().slice(0, 10)); };
const gbp = (n: number) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const long = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

export async function GET() {
  const u = await currentUser();
  if (!u) redirect("/sign-in?next=/deadlines");
  const d = await getDashboard();
  const site = (process.env.NUCTA_SITE_URL ?? "https://nucta-file.vercel.app").replace(/\/+$/, "");
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Nucta Formations Ltd//Nucta File//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(`Nucta File deadlines, ${u.accountName}`)}`, "X-WR-TIMEZONE:Europe/London"];
  for (const x of d.deadlines) {
    if (x.kind === "not-started" && x.label !== "Return not started") continue;
    const what = `${x.label}${x.amount != null ? ` (${gbp(x.amount)})` : ""}: ${x.companyName}`;
    const link = x.returnId ? `${site}/returns/${x.returnId}` : `${site}/companies/${x.companyId}`;
    lines.push("BEGIN:VEVENT",
      `UID:${x.companyId}-${x.kind}-${x.periodTo}@nucta-file`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${day(x.due)}`, `DTEND;VALUE=DATE:${nextDay(x.due)}`,
      `SUMMARY:${esc(what)}`,
      `DESCRIPTION:${esc(`${x.label} for ${x.companyName}, period ${long(x.periodFrom)} to ${long(x.periodTo)}.${x.estimated ? " Date worked out by Nucta File." : ""} Open in Nucta File: ${link}`)}`,
      `URL:${link}`, "TRANSP:TRANSPARENT",
      "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(what)}`, "TRIGGER:-P7D", "END:VALARM",
      "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(what)}`, "TRIGGER:-P1D", "END:VALARM",
      "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return new Response(lines.map(fold).join("\r\n") + "\r\n", {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'attachment; filename="nucta-file-deadlines.ics"', "Cache-Control": "no-store" },
  });
}
