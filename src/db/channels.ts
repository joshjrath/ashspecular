import { pool } from "./pool.js";

/** Channels with production paused, and since when. */
export async function pausedChannels(): Promise<Map<string, Date>> {
  const { rows } = await pool.query<{ channel: string; paused_at: Date }>("SELECT channel, paused_at FROM channel_pauses ORDER BY channel");
  return new Map(rows.map((r) => [r.channel, r.paused_at]));
}

/**
 * Pause a channel: every open video, revision and batch on it goes on pause,
 * marked as the channel's doing. Returns how many.
 */
export async function pauseChannel(channel: string): Promise<number> {
  await pool.query("INSERT INTO channel_pauses (channel) VALUES ($1) ON CONFLICT (channel) DO NOTHING", [channel]);
  const { rowCount } = await pool.query(
    `UPDATE records SET paused_at = now(), paused_by_channel = true, updated_at = now()
      WHERE channel = $1 AND status = 'open' AND paused_at IS NULL`,
    [channel],
  );
  return rowCount ?? 0;
}

/**
 * Resume a channel: what its pause paused comes back, deadlines as they were.
 * A video paused on its own before stays paused. Returns how many.
 */
export async function resumeChannel(channel: string): Promise<number> {
  await pool.query("DELETE FROM channel_pauses WHERE channel = $1", [channel]);
  const { rows } = await pool.query<{ id: string }>(
    `UPDATE records SET paused_at = NULL, paused_by_channel = false, updated_at = now()
      WHERE channel = $1 AND paused_by_channel RETURNING id`,
    [channel],
  );
  // Anything that went late while paused gets a fresh nudge, not a stale one.
  if (rows.length) await pool.query("DELETE FROM nudges WHERE record_id = ANY($1::bigint[])", [rows.map((r) => r.id)]);
  return rows.length;
}
