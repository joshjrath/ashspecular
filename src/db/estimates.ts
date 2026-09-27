import { pool } from "./pool.js";

/** Every estimate changed from its default, by key ("type:reading", "channel:Specular DC", "task:payment"). */
export async function readEstimates(): Promise<Map<string, number>> {
  const { rows } = await pool.query<{ key: string; minutes: number }>("SELECT key, minutes FROM work_estimates");
  return new Map(rows.map((r) => [r.key, Number(r.minutes)]));
}

/** Set estimates; null puts one back to its default. */
export async function saveEstimates(entries: Array<[string, number | null]>): Promise<void> {
  for (const [key, minutes] of entries) {
    if (minutes === null) await pool.query("DELETE FROM work_estimates WHERE key = $1", [key]);
    else
      await pool.query(
        `INSERT INTO work_estimates (key, minutes) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET minutes = EXCLUDED.minutes, updated_at = now()`,
        [key, minutes],
      );
  }
}

/** Everything back to its default. */
export async function resetEstimates(): Promise<void> {
  await pool.query("DELETE FROM work_estimates");
}
