"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { addNote, addTask, companyNotes, deleteNote, deleteTask, setTaskDone, type NoteRow, type TaskRow } from "@/lib/notes-actions";

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
const day = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const today = () => new Date().toISOString().slice(0, 10);

/** A company's to-dos and its running notes. */
export default function CompanyNotes({ companyId }: { companyId: string }) {
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [note, setNote] = useState("");
  const [title, setTitle] = useState(""), [due, setDue] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const load = useCallback(async () => { const r = await companyNotes(companyId); setNotes(r.notes); setTasks(r.tasks); if (!r.ok) setErr(r.problem ?? null); }, [companyId]);
  useEffect(() => { load(); }, [load]);
  const run = (f: () => Promise<{ ok: boolean; problem?: string }>, after?: () => void) => start(async () => { const r = await f(); setErr(r.ok ? null : r.problem ?? "Couldn't save."); if (r.ok) after?.(); await load(); });

  return (
    <div className="grid2">
      <div className="card">
        <div className="hd"><h3>To do</h3><span className="note">{tasks.filter((t) => !t.done).length} open</span></div>
        <div className="bd">
          <div className="searchrow" style={{ marginBottom: 10 }}>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Ask for the bank statements" aria-label="New task" style={{ flex: 1, minWidth: 180, maxWidth: "none" }}
              onKeyDown={(e) => { if (e.key === "Enter" && title.trim()) run(() => addTask(companyId, title, due), () => { setTitle(""); setDue(""); }); }} />
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date" style={{ width: 160 }} />
            <button type="button" className="btn sm" disabled={pending || !title.trim()} onClick={() => run(() => addTask(companyId, title, due), () => { setTitle(""); setDue(""); })}>Add</button>
          </div>
          {!tasks.length && <p className="note">Nothing to do for this company yet.</p>}
          {tasks.map((t) => (
            <div key={t.id} className="check" style={{ alignItems: "center", opacity: t.done ? 0.55 : 1 }}>
              <input type="checkbox" checked={t.done} onChange={(e) => run(() => setTaskDone(t.id, e.target.checked))} aria-label={`Done: ${t.title}`} style={{ width: 18, height: 18 }} />
              <span style={{ flex: 1 }}><div className="t" style={{ textDecoration: t.done ? "line-through" : "none" }}>{t.title}</div>
                {t.due && <div className={`d ${!t.done && t.due < today() ? "late-t" : ""}`}>by {day(t.due)}</div>}</span>
              <button type="button" className="btn ghost sm" onClick={() => run(() => deleteTask(t.id))} aria-label={`Delete ${t.title}`}>Delete</button>
            </div>
          ))}
        </div>
      </div>
      <div className="card">
        <div className="hd"><h3>Notes</h3><span className="note">Seen by everyone on the team</span></div>
        <div className="bd">
          <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was asked, sent or agreed" aria-label="New note" style={{ resize: "vertical" }} />
          <div style={{ marginTop: 8, marginBottom: 6 }}><button type="button" className="btn sm" disabled={pending || !note.trim()} onClick={() => run(() => addNote(companyId, note), () => setNote(""))}>Add the note</button></div>
          {err && <div className="banner bad"><span>✕</span><span>{err}</span></div>}
          {notes.map((n) => (
            <div key={n.id} className="check">
              <span style={{ flex: 1, minWidth: 0 }}>
                <div className="d" style={{ marginTop: 0 }}>{n.author}, {when(n.at)}</div>
                <div style={{ whiteSpace: "pre-wrap", marginTop: 4, fontSize: 13.5 }}>{n.body}</div>
              </span>
              <button type="button" className="btn ghost sm" onClick={() => run(() => deleteNote(n.id))} aria-label="Delete note">Delete</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
