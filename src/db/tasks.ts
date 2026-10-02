import { pool } from "./pool.js";
import type { Priority, TaskCategory } from "../tasks/parse.js";
import { nextOccurrence, type Repeat } from "../tasks/repeat.js";
import { DEADLINE_TIME, ORG_TZ, dateIn, instantIn } from "../parse/derive.js";

export interface Task {
  id: number;
  title: string;
  body: string;
  category: TaskCategory;
  priority: Priority;
  person: string | null;
  due: Date | null;
  estMin: number | null;
  status: "open" | "done";
  snoozedUntil: Date | null;
  sourceUrl: string | null;
  captureUrl: string | null;
  author: string | null;
  createdAt: Date;
  doneAt: Date | null;
  /** Your own notes, apart from the message it came from. */
  notes: string;
  /** How often it comes back; null for a one-off. */
  repeat: Repeat | null;
}

function row(r: Record<string, unknown>): Task {
  return {
    id: Number(r.id),
    title: r.title as string,
    body: r.body as string,
    category: r.category as TaskCategory,
    priority: r.priority as Priority,
    person: (r.person as string | null) ?? null,
    due: (r.due as Date | null) ?? null,
    estMin: r.est_min === null ? null : Number(r.est_min),
    status: r.status as "open" | "done",
    snoozedUntil: (r.snoozed_until as Date | null) ?? null,
    sourceUrl: (r.source_url as string | null) ?? null,
    captureUrl: (r.capture_url as string | null) ?? null,
    author: (r.author as string | null) ?? null,
    createdAt: r.created_at as Date,
    doneAt: (r.done_at as Date | null) ?? null,
    notes: (r.notes as string | null) ?? "",
    repeat: (r.repeat as Repeat | null) ?? null,
  };
}

const ORDER = `CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, due ASC NULLS LAST, created_at ASC`;

/** Open tasks: those to do now, and those snoozed for later. */
export async function listTasks(): Promise<{ todo: Task[]; snoozed: Task[]; done: Task[] }> {
  const [open, done] = await Promise.all([
    pool.query(`SELECT * FROM tasks WHERE status = 'open' ORDER BY ${ORDER}`),
    pool.query(`SELECT * FROM tasks WHERE status = 'done' ORDER BY done_at DESC LIMIT 30`),
  ]);
  const now = Date.now();
  const all = open.rows.map(row);
  return {
    todo: all.filter((t) => !t.snoozedUntil || t.snoozedUntil.getTime() <= now),
    snoozed: all.filter((t) => t.snoozedUntil && t.snoozedUntil.getTime() > now).sort((a, b) => a.snoozedUntil!.getTime() - b.snoozedUntil!.getTime()),
    done: done.rows.map(row),
  };
}

export async function getTask(id: number): Promise<Task | null> {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const { rows } = await pool.query("SELECT * FROM tasks WHERE id = $1", [id]);
  return rows[0] ? row(rows[0]) : null;
}

/** Tasks to do now (not snoozed), for counts and My Day. */
export async function openTasks(): Promise<Task[]> {
  const { rows } = await pool.query(
    `SELECT * FROM tasks WHERE status = 'open' AND (snoozed_until IS NULL OR snoozed_until <= now()) ORDER BY ${ORDER}`,
  );
  return rows.map(row);
}

/** Tasks cleared today, in a zone. */
export async function tasksDoneToday(zone: string): Promise<Task[]> {
  const { rows } = await pool.query(
    `SELECT * FROM tasks WHERE status = 'done' AND (done_at AT TIME ZONE $1)::date = (now() AT TIME ZONE $1)::date ORDER BY done_at DESC`,
    [zone],
  );
  return rows.map(row);
}

/** Every person a task has named, most used first — so the reader recognises them next time. */
export async function knownPeople(): Promise<string[]> {
  const { rows } = await pool.query<{ person: string }>(
    "SELECT person FROM tasks WHERE person IS NOT NULL GROUP BY person ORDER BY COUNT(*) DESC LIMIT 200",
  );
  return rows.map((r) => r.person);
}

export interface NewTask {
  title: string;
  body: string;
  category: TaskCategory;
  priority: Priority;
  person: string | null;
  due: string | Date | null;
  sourceUrl: string | null;
  captureUrl: string | null;
  sourceMessageId: string | null;
  author: string | null;
  notes?: string;
  repeat?: Repeat | null;
}

export async function addTask(t: NewTask): Promise<number> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO tasks (title, body, category, priority, person, due, source_url, capture_url, source_message_id, author, notes, repeat)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (source_message_id) DO UPDATE SET updated_at = now()
     RETURNING id`,
    [t.title, t.body, t.category, t.priority, t.person, t.due, t.sourceUrl, t.captureUrl, t.sourceMessageId, t.author, t.notes ?? "", t.repeat ?? null],
  );
  return Number(rows[0]!.id);
}

export async function editTask(
  id: number,
  f: { title: string; category: TaskCategory; priority: Priority; person: string | null; due: Date | null; estMin: number | null; notes: string; repeat: Repeat | null },
): Promise<void> {
  await pool.query(
    `UPDATE tasks SET title = $2, category = $3, priority = $4, person = $5, due = $6, est_min = $7, notes = $8, repeat = $9, updated_at = now() WHERE id = $1`,
    [id, f.title, f.category, f.priority, f.person, f.due, f.estMin, f.notes, f.repeat],
  );
}

/**
 * A repeating task is done: open its next occurrence — same everything, due
 * on the next day it falls, at the same time of day. Returns the new id.
 */
export async function repeatTask(id: number, now = new Date()): Promise<number | null> {
  const { rows } = await pool.query("SELECT * FROM tasks WHERE id = $1", [id]);
  const t = rows[0] ? row(rows[0]) : null;
  if (!t?.repeat) return null;
  const today = dateIn(ORG_TZ, now);
  const from = t.due ? dateIn(ORG_TZ, t.due) : today;
  const time = t.due
    ? new Intl.DateTimeFormat("en-GB", { timeZone: ORG_TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(t.due)
    : DEADLINE_TIME;
  const due = instantIn(nextOccurrence(from, t.repeat, today), time, ORG_TZ);
  const { rows: out } = await pool.query<{ id: string }>(
    `INSERT INTO tasks (title, body, category, priority, person, due, est_min, author, notes, repeat)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
    [t.title, t.body, t.category, t.priority, t.person, due, t.estMin, t.author, t.notes, t.repeat],
  );
  // The finished one stays in Done, but only the new one repeats.
  await pool.query("UPDATE tasks SET repeat = NULL WHERE id = $1", [id]);
  return Number(out[0]!.id);
}

export async function setTaskStatus(id: number, done: boolean): Promise<void> {
  await pool.query(
    `UPDATE tasks SET status = $2, done_at = CASE WHEN $2 = 'done' THEN now() END, snoozed_until = NULL, updated_at = now() WHERE id = $1`,
    [id, done ? "done" : "open"],
  );
  if (done) await pool.query("UPDATE time_entries SET ended_at = now() WHERE task_id = $1 AND ended_at IS NULL", [id]);
}

export async function snoozeTask(id: number, until: Date | null): Promise<void> {
  await pool.query("UPDATE tasks SET snoozed_until = $2, updated_at = now() WHERE id = $1", [id, until]);
}

export async function deleteTask(id: number): Promise<void> {
  await pool.query("DELETE FROM tasks WHERE id = $1", [id]);
}
