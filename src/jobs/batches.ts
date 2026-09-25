/**
 * The daily bits batches.
 *
 * Each bits and reading channel opens its day's batch every morning without
 * anyone sending a message. A batch has no number of its own — it is known by
 * its channel and its air date. The opener is idempotent: every batch has a
 * synthetic key of channel + date + index, and the records table already makes
 * that column unique, so running this twice — on a schedule, at boot, or by
 * hand — can never produce a duplicate.
 *
 * That property is what makes working ahead safe. Opening tomorrow's batches
 * early is the same call with a later date; when the schedule comes round it
 * finds them already there and does nothing.
 */
import { CHANNELS, type Channel } from "../catalog.js";
import { pool } from "../db/pool.js";
import { DEADLINE_TIME, ORG_TZ, instantIn, shiftDate, shortsDay } from "../parse/derive.js";

export { shortsDay };

/** Bits channels, in catalog order. */
export function recurringChannels(): Channel[] {
  return CHANNELS.filter((c) => c.recurring);
}

function key(channel: Channel, date: string, n: number): string {
  return `batch:${channel.id}:${date}:${n}`;
}

export interface OpenResult {
  date: string;
  opened: number;
  alreadyThere: number;
}

/**
 * Open every channel's batches for one day. Returns what it actually created,
 * so a scheduled run can stay quiet when there was nothing to do.
 */
export async function openBatchesFor(date = shortsDay()): Promise<OpenResult> {
  let opened = 0;
  let alreadyThere = 0;

  for (const channel of recurringChannels()) {
    const perDay = channel.recurring?.perDay ?? 1;
    const dueAt = channel.recurring?.dueAt ?? DEADLINE_TIME;
    const deadline = instantIn(date, dueAt, ORG_TZ);

    // No running number: a batch is its channel and its day. The title is
    // the channel alone; the board adds the air date wherever it shows one,
    // so a batch dragged to another day never carries a stale date.
    for (let i = 1; i <= perDay; i += 1) {
      const { rowCount } = await pool.query(
        `INSERT INTO records (
           kind, category, channel, code, title, air_date, deadline, vo_source,
           status, parsed_by, confidence, batch_no, source_message_id, raw_content, batch_target
         ) VALUES ($8, $9, $1, $2, $3, $4, $5, 'none', 'open', 'recurring', 1, $6, $7, '', $10)
         ON CONFLICT (source_message_id) DO NOTHING`,
        [
          channel.name,
          null,
          channel.name,
          date,
          deadline,
          i,
          key(channel, date, i),
          // A batch takes its channel's category — Reading batches are Reading.
          channel.category === "bits" ? "bits" : "update",
          channel.category,
          channel.recurring?.units ?? 1,
        ],
      );

      if (rowCount) opened += 1;
      else alreadyThere += 1;
    }
  }

  return { date, opened, alreadyThere };
}

/** The furthest ahead one press may open: a quarter of a year. */
export const MAX_AHEAD_DAYS = 90;

/**
 * Open every day from `from` to `to`, inclusive. The opener is idempotent, so
 * a day that is already open is left exactly as it is — and a day that is
 * only partly open (a channel added since) gets just the channels it lacks.
 */
export async function openBatchesThrough(from: string, to: string): Promise<{ opened: number; days: number }> {
  let opened = 0;
  let days = 0;
  for (let d = from; d <= to && days < MAX_AHEAD_DAYS; d = shiftDate(d, 1)) {
    opened += (await openBatchesFor(d)).opened;
    days += 1;
  }
  return { opened, days };
}

/** For each day in a range: how many channels are open, and uploads done of total. */
export async function batchDays(
  from: string,
  to: string,
): Promise<Array<{ date: string; channels: number; total: number; done: number }>> {
  const { rows } = await pool.query<{ date: string; channels: string; total: string; done: string }>(
    `SELECT to_char(air_date, 'YYYY-MM-DD') AS date,
            COUNT(DISTINCT channel) FILTER (WHERE status <> 'removed') AS channels,
            COALESCE(SUM(COALESCE(batch_target, 1)) FILTER (WHERE status <> 'removed'), 0) AS total,
            COALESCE(SUM(CASE WHEN status = 'done' THEN COALESCE(batch_target, 1)
                              WHEN status = 'open' THEN batch_done ELSE 0 END), 0) AS done
     FROM records
     WHERE batch_no IS NOT NULL AND air_date BETWEEN $1 AND $2
     GROUP BY air_date`,
    [from, to],
  );
  const byDate = new Map(rows.map((r) => [r.date, r]));
  const out: Array<{ date: string; channels: number; total: number; done: number }> = [];
  for (let d = from; d <= to; d = shiftDate(d, 1)) {
    const r = byDate.get(d);
    out.push({ date: d, channels: Number(r?.channels ?? 0), total: Number(r?.total ?? 0), done: Number(r?.done ?? 0) });
  }
  return out;
}

/** Tomorrow, on the Bits/Reading day. */
export function tomorrow(): string {
  const d = new Date(`${shortsDay()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * What a day's batches look like, for the Recurring page — counted in uploads,
 * so a reading channel reads 2/5 and a bits channel 0/1.
 */
export async function batchStatus(date: string): Promise<
  Array<{ channel: string; total: number; done: number; removed: number }>
> {
  // A removed batch leaves the count entirely, so a channel whose only batch
  // was removed reads "removed" rather than waiting to be done.
  const { rows } = await pool.query<{ channel: string; total: string; done: string; removed: string }>(
    `SELECT channel,
            COALESCE(SUM(COALESCE(batch_target, 1)) FILTER (WHERE status <> 'removed'), 0) AS total,
            COALESCE(SUM(CASE WHEN status = 'done' THEN COALESCE(batch_target, 1)
                              WHEN status = 'open' THEN batch_done ELSE 0 END), 0) AS done,
            COUNT(*) FILTER (WHERE status = 'removed') AS removed
     FROM records
     WHERE batch_no IS NOT NULL AND air_date = $1
     GROUP BY channel`,
    [date],
  );
  const byChannel = new Map(rows.map((r) => [r.channel, r]));
  return recurringChannels().map((c) => {
    const row = byChannel.get(c.name);
    return {
      channel: c.name,
      total: Number(row?.total ?? 0),
      done: Number(row?.done ?? 0),
      removed: Number(row?.removed ?? 0),
    };
  });
}

/**
 * Set how many of a channel's uploads are done that day. Reaching the target
 * clears the batch — which is what counts toward "cleared this week"; dropping
 * back below it reopens it.
 */
export async function setBatchProgress(channel: string, date: string, done: number): Promise<void> {
  await pool.query(
    `UPDATE records SET
       batch_done = LEAST(GREATEST($3, 0), COALESCE(batch_target, 1)),
       status = CASE WHEN $3 >= COALESCE(batch_target, 1) THEN 'done' ELSE 'open' END,
       done_at = CASE WHEN $3 >= COALESCE(batch_target, 1) THEN COALESCE(done_at, now()) ELSE NULL END,
       updated_at = now()
     WHERE id = (
       SELECT id FROM records
       WHERE channel = $1 AND air_date = $2 AND batch_no IS NOT NULL AND status <> 'removed'
       ORDER BY batch_no LIMIT 1
     )`,
    [channel, date, done],
  );
}
