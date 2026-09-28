import { pool } from "./pool.js";

/** The timer running now, if any — on a record or a task. */
export async function runningTimer(): Promise<{ id: number; recordId: number | null; taskId: number | null; startedAt: Date } | null> {
  const { rows } = await pool.query<{ id: number; record_id: string | null; task_id: string | null; started_at: Date }>(
    "SELECT id, record_id, task_id, started_at FROM time_entries WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1",
  );
  const r = rows[0];
  return r
    ? { id: r.id, recordId: r.record_id === null ? null : Number(r.record_id), taskId: r.task_id === null ? null : Number(r.task_id), startedAt: r.started_at }
    : null;
}

/** Start timing a piece of work. Whatever was running stops first. */
export async function startTimer(recordId: number): Promise<void> {
  await pool.query("UPDATE time_entries SET ended_at = now() WHERE ended_at IS NULL");
  await pool.query("INSERT INTO time_entries (record_id) VALUES ($1)", [recordId]);
}

/** Start timing a task. */
export async function startTaskTimer(taskId: number): Promise<void> {
  await pool.query("UPDATE time_entries SET ended_at = now() WHERE ended_at IS NULL");
  await pool.query("INSERT INTO time_entries (task_id) VALUES ($1)", [taskId]);
}

/** Minutes tracked on each of these tasks, the running timer included. */
export async function taskMinutesSpent(ids: number[]): Promise<Map<number, number>> {
  if (!ids.length) return new Map();
  const { rows } = await pool.query<{ task_id: string; secs: string }>(
    `SELECT task_id, SUM(EXTRACT(EPOCH FROM (COALESCE(ended_at, now()) - started_at))) AS secs
       FROM time_entries WHERE task_id = ANY($1::bigint[]) GROUP BY task_id`,
    [ids],
  );
  return new Map(rows.map((r) => [Number(r.task_id), Number(r.secs) / 60]));
}

/** Stop whatever is running. */
export async function stopTimer(): Promise<void> {
  await pool.query("UPDATE time_entries SET ended_at = now() WHERE ended_at IS NULL");
}

/** Minutes tracked on each of these records, the running timer included. */
export async function minutesSpent(ids: number[]): Promise<Map<number, number>> {
  if (!ids.length) return new Map();
  const { rows } = await pool.query<{ record_id: string; secs: string }>(
    `SELECT record_id, SUM(EXTRACT(EPOCH FROM (COALESCE(ended_at, now()) - started_at))) AS secs
       FROM time_entries WHERE record_id = ANY($1::bigint[]) GROUP BY record_id`,
    [ids],
  );
  return new Map(rows.map((r) => [Number(r.record_id), Number(r.secs) / 60]));
}

/** Minutes tracked per day (in a zone), from a day on. */
export async function minutesByDay(zone: string, from: string): Promise<Map<string, number>> {
  const { rows } = await pool.query<{ day: string; secs: string }>(
    `SELECT to_char(started_at AT TIME ZONE $1, 'YYYY-MM-DD') AS day,
            SUM(EXTRACT(EPOCH FROM (COALESCE(ended_at, now()) - started_at))) AS secs
       FROM time_entries WHERE (started_at AT TIME ZONE $1)::date >= $2::date GROUP BY 1`,
    [zone, from],
  );
  return new Map(rows.map((r) => [r.day, Number(r.secs) / 60]));
}

/**
 * Log a piece done with no time on it — someone else did it: whatever was
 * tracked on it goes (a timer running on it stops), and it's marked so Done
 * today doesn't count it as your work.
 */
export async function clearTime(item: { recordId?: number; taskId?: number }, untracked = true): Promise<void> {
  const col = item.taskId ? "task_id" : "record_id";
  const id = item.taskId ?? item.recordId;
  if (!id) return;
  await pool.query(`DELETE FROM time_entries WHERE ${col} = $1`, [id]);
  if (untracked) await pool.query("INSERT INTO untracked_done (key) VALUES ($1) ON CONFLICT DO NOTHING", [`${item.taskId ? "t" : "r"}${id}`]);
}

/** Work logged with no time, by key ("r12", "t5"). */
export async function untrackedKeys(): Promise<Set<string>> {
  const { rows } = await pool.query<{ key: string }>("SELECT key FROM untracked_done");
  return new Set(rows.map((r) => r.key));
}

/** Timing it again means it's yours after all. */
export async function forgetUntracked(key: string): Promise<void> {
  await pool.query("DELETE FROM untracked_done WHERE key = $1", [key]);
}
