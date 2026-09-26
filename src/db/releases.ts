import { pool } from "./pool.js";

/**
 * Record these releases as live (the first time only: now, or when it went
 * live for one written after it shipped), and return when each went live.
 */
export async function markReleases(list: Array<{ id: string; liveSince?: string }>): Promise<Map<string, Date>> {
  if (list.length) {
    await pool.query(
      `INSERT INTO releases (id, seen_at)
       SELECT id, LEAST(COALESCE(since, now()), now()) FROM unnest($1::text[], $2::timestamptz[]) AS t(id, since)
       ON CONFLICT (id) DO NOTHING`,
      [list.map((r) => r.id), list.map((r) => r.liveSince ?? null)],
    );
  }
  const { rows } = await pool.query<{ id: string; seen_at: Date }>("SELECT id, seen_at FROM releases");
  return new Map(rows.map((r) => [r.id, r.seen_at]));
}
