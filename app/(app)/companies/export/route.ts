/** The signed-in account's companies as a spreadsheet (CSV), each with its next deadline. */
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { getDashboard, listCompanies } from "@/lib/return-actions";

export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = {
  draft: "Draft", "accepted-test": "Passed HMRC's test service", "rejected-test": "Turned down by the test service", "submitted-test": "With the test service",
  "partly-sent-test": "One of two tested", accepted: "Filed with HMRC", "submitted-live": "Filed, waiting for HMRC", "partly-filed": "One of two filed",
};

/** A cell, quoted, and made safe from being read as a formula. */
const cell = (v: unknown) => {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

export async function GET() {
  const u = await currentUser();
  if (!u) redirect("/sign-in?next=/companies");
  const [list, dash] = await Promise.all([listCompanies(), getDashboard()]);
  const next = new Map(dash.companies.map((c) => [c.id, c.next]));
  const overdue = (id: string) => dash.deadlines.filter((d) => d.companyId === id && d.state === "overdue").length;
  const rows = [["Company", "Company number", "Corporation Tax UTR", "Returns in Nucta File", "Latest return", "Latest return's year end", "Next deadline", "Due", "Days left", "Overdue deadlines"]];
  for (const c of list.companies) {
    const n = next.get(c.id);
    rows.push([c.name, c.companyNo ?? "", c.utr ?? "", String(c.returns), c.latest ? STATUS[c.latest.status] ?? c.latest.status : "", c.latest?.periodEnd ?? "",
      n?.label ?? "", n?.due ?? "", n ? String(n.daysLeft) : "", String(overdue(c.id))]);
  }
  const csv = "\uFEFF" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="nucta-file-companies-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" },
  });
}
