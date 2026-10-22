"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";
import { addTask, openTasks, setTaskDone, type TaskRow } from "@/lib/notes-actions";

const day = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/** Open to-dos across the account, soonest first, with a quick way to add one. */
export default function DashTasks({ today }: { today: string }) {
  const [tasks, setTasks] = useState<TaskRow[] | null>(null);
  const [title, setTitle] = useState(""), [due, setDue] = useState("");
  const [pending, start] = useTransition();
  const load = useCallback(async () => setTasks((await openTasks()).tasks), []);
  useEffect(() => { load(); }, [load]);
  const add = () => start(async () => { const r = await addTask(null, title, due); if (r.ok) { setTitle(""); setDue(""); } await load(); });
  return (
    <div className="card">
      <div className="hd"><h3>To do</h3><span className="note">{tasks ? `${tasks.length} open` : ""}</span></div>
      <div className="bd" style={{ paddingTop: 12 }}>
        <div className="searchrow" style={{ marginBottom: 6 }}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && title.trim()) add(); }} placeholder="Add a task" aria-label="New task" style={{ flex: 1, minWidth: 120, maxWidth: "none" }} />
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date" style={{ width: 150 }} />
          <button type="button" className="btn sm" disabled={pending || !title.trim()} onClick={add}>Add</button>
        </div>
        {tasks && !tasks.length && <p className="note" style={{ marginBottom: 0 }}>Nothing on the list. Tasks added on a company&apos;s page show here too.</p>}
        {tasks?.slice(0, 8).map((t) => (
          <div key={t.id} className="check" style={{ alignItems: "center" }}>
            <input type="checkbox" onChange={() => start(async () => { await setTaskDone(t.id, true); await load(); })} aria-label={`Done: ${t.title}`} style={{ width: 18, height: 18 }} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <div className="t">{t.title}</div>
              <div className="d">{t.companyId ? <Link href={`/companies/${t.companyId}`}>{t.companyName}</Link> : "General"}{t.due ? <span className={t.due < today ? "late-t" : ""}>, by {day(t.due)}</span> : null}</div>
            </span>
          </div>
        ))}
        {tasks && tasks.length > 8 && <p className="note" style={{ marginBottom: 0 }}>and {tasks.length - 8} more</p>}
      </div>
    </div>
  );
}
