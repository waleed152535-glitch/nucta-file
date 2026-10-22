import Link from "next/link";
import type { Deadline } from "@/lib/deadlines";

const short = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const gbp = (n: number) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const ICON: Record<Deadline["kind"], string> = { ct600: "▤", "ct-payment": "£", "ch-accounts": "⌂", confirmation: "✓", "not-started": "○" };

function when(d: Deadline): string {
  if (d.daysLeft < 0) return `${-d.daysLeft} day${d.daysLeft === -1 ? "" : "s"} overdue`;
  if (d.daysLeft === 0) return "due today";
  return `in ${d.daysLeft} day${d.daysLeft === 1 ? "" : "s"}`;
}

/** A list of deadlines, soonest first, each linking to where it's dealt with. */
export default function DeadlineList({ deadlines, showCompany = true, empty = "Nothing due." }: { deadlines: Deadline[]; showCompany?: boolean; empty?: string }) {
  if (!deadlines.length) return <p className="note">{empty}</p>;
  return (
    <>
      {deadlines.map((d, i) => {
        const href = d.returnId ? `/returns/${d.returnId}` : d.kind === "confirmation" ? `/companies/${d.companyId}` : `/companies/${d.companyId}?from=${d.periodFrom}&to=${d.periodTo}#start`;
        const tone = d.state === "overdue" ? "var(--red)" : d.state === "soon" ? "var(--amber)" : "inherit";
        return (
          <Link key={i} href={href} className="check" style={{ textDecoration: "none", color: "inherit" }}>
            <span className={`mark ${d.state}`}>{ICON[d.kind]}</span>
            <span style={{ flex: 1 }}>
              <div className="t">
                {d.label}{d.amount !== undefined ? ` · ${gbp(d.amount)}` : ""}{showCompany ? <> — {d.companyName}</> : null}
              </div>
              <div className="d">
                {d.kind === "confirmation" ? "Confirms the company's details at Companies House" : <>Period {short(d.periodFrom)} to {short(d.periodTo)}</>}
                {d.kind === "not-started" ? (d.label === "Return not started" ? " · start the return" : " · the year hasn't ended") : ""}
                {d.estimated ? " · date worked out by Nucta File" : ""}
              </div>
            </span>
            <span style={{ textAlign: "right", minWidth: 120 }}>
              <div className="t" style={{ color: tone }}>{short(d.due)}</div>
              <div className="d" style={{ color: tone }}>{when(d)}</div>
            </span>
          </Link>
        );
      })}
    </>
  );
}
