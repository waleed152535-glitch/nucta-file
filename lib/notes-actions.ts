"use server";

/**
 * Notes and tasks: a running record for each company (what was asked, sent
 * and agreed), and things to do, with or without a date. Everything is
 * limited to the signed-in account.
 */
import { randomUUID } from "crypto";
import { SIGNED_OUT, ownedCompany, problem, signedIn, store } from "./store";

export interface NoteRow { id: string; author: string; body: string; at: string }
export interface TaskRow { id: string; companyId: string | null; companyName: string | null; title: string; due: string | null; done: boolean; doneAt: string | null }

const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

export async function companyNotes(companyId: string): Promise<{ ok: boolean; problem?: string; notes: NoteRow[]; tasks: TaskRow[] }> {
  const u = await signedIn();
  if (!u) return { ok: false, problem: SIGNED_OUT, notes: [], tasks: [] };
  try {
    const s = await store();
    const c = await ownedCompany(s, u, companyId);
    if (!c) return { ok: false, problem: "That company isn't in Nucta File.", notes: [], tasks: [] };
    const notes = await s.db.select().from(s.notes).where(s.eq(s.notes.companyId, companyId)).orderBy(s.desc(s.notes.createdAt)).limit(100);
    const tasks = await s.db.select().from(s.tasks).where(s.and(s.eq(s.tasks.companyId, companyId), s.eq(s.tasks.accountId, u.accountId))).orderBy(s.asc(s.tasks.done), s.asc(s.tasks.due), s.desc(s.tasks.createdAt)).limit(100);
    return {
      ok: true,
      notes: notes.map((n) => ({ id: n.id, author: n.authorName, body: n.body, at: n.createdAt.toISOString() })),
      tasks: tasks.map((t) => ({ id: t.id, companyId: t.companyId, companyName: c.name, title: t.title, due: t.due, done: t.done, doneAt: t.doneAt?.toISOString() ?? null })),
    };
  } catch (e) {
    return { ok: false, problem: problem(e), notes: [], tasks: [] };
  }
}

export async function addNote(companyId: string, body: string): Promise<{ ok: boolean; problem?: string }> {
  const u = await signedIn();
  if (!u) return { ok: false, problem: SIGNED_OUT };
  const text = body.trim();
  if (!text) return { ok: false, problem: "Write the note first." };
  const s = await store();
  if (!(await ownedCompany(s, u, companyId))) return { ok: false, problem: "That company isn't in Nucta File." };
  await s.db.insert(s.notes).values({ id: randomUUID(), accountId: u.accountId, companyId, authorName: u.name, body: text.slice(0, 5000) });
  return { ok: true };
}

export async function deleteNote(id: string): Promise<{ ok: boolean }> {
  const u = await signedIn();
  if (!u) return { ok: false };
  const s = await store();
  await s.db.delete(s.notes).where(s.and(s.eq(s.notes.id, id), s.eq(s.notes.accountId, u.accountId)));
  return { ok: true };
}

/** Open tasks across the account, soonest first; for the dashboard. */
export async function openTasks(): Promise<{ ok: boolean; problem?: string; tasks: TaskRow[] }> {
  const u = await signedIn();
  if (!u) return { ok: false, problem: SIGNED_OUT, tasks: [] };
  try {
    const s = await store();
    const rows = await s.db.select({ t: s.tasks, companyName: s.companies.name }).from(s.tasks)
      .leftJoin(s.companies, s.eq(s.companies.id, s.tasks.companyId))
      .where(s.and(s.eq(s.tasks.accountId, u.accountId), s.eq(s.tasks.done, false))).orderBy(s.asc(s.tasks.due), s.desc(s.tasks.createdAt)).limit(50);
    const tasks = rows.map(({ t, companyName }) => ({ id: t.id, companyId: t.companyId, companyName: companyName ?? null, title: t.title, due: t.due, done: t.done, doneAt: null }));
    // Dated tasks first, soonest first; undated after.
    tasks.sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"));
    return { ok: true, tasks };
  } catch (e) {
    return { ok: false, problem: problem(e), tasks: [] };
  }
}

export async function addTask(companyId: string | null, titleRaw: string, dueRaw: string): Promise<{ ok: boolean; problem?: string }> {
  const u = await signedIn();
  if (!u) return { ok: false, problem: SIGNED_OUT };
  const title = titleRaw.trim(), due = dueRaw.trim();
  if (!title) return { ok: false, problem: "Say what needs doing." };
  if (due && !isDate(due)) return { ok: false, problem: "The date isn't a date." };
  const s = await store();
  if (companyId && !(await ownedCompany(s, u, companyId))) return { ok: false, problem: "That company isn't in Nucta File." };
  await s.db.insert(s.tasks).values({ id: randomUUID(), accountId: u.accountId, companyId: companyId || null, title: title.slice(0, 300), due: due || null, createdBy: u.name });
  return { ok: true };
}

export async function setTaskDone(id: string, done: boolean): Promise<{ ok: boolean }> {
  const u = await signedIn();
  if (!u) return { ok: false };
  const s = await store();
  await s.db.update(s.tasks).set({ done, doneAt: done ? new Date() : null }).where(s.and(s.eq(s.tasks.id, id), s.eq(s.tasks.accountId, u.accountId)));
  return { ok: true };
}

export async function deleteTask(id: string): Promise<{ ok: boolean }> {
  const u = await signedIn();
  if (!u) return { ok: false };
  const s = await store();
  await s.db.delete(s.tasks).where(s.and(s.eq(s.tasks.id, id), s.eq(s.tasks.accountId, u.accountId)));
  return { ok: true };
}
