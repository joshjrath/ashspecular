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
import { DEADLINE_TIME, ORG_TZ, dateIn, instantIn } from "../parse/derive.js";

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
export async function openBatchesFor(date = dateIn(ORG_TZ)): Promise<OpenResult> {
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

/** Tomorrow, in the studio's zone. */
export function tomorrow(): string {
  const d = new Date(`${dateIn(ORG_TZ)}T12:00:00Z`);
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
