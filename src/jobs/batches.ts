/**
 * The daily bits batches.
 *
 * Each bits channel opens a fixed number of numbered batches every day without
 * anyone sending a message. The opener is idempotent: every batch has a
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

/** The highest batch number a channel has ever had. */
async function lastBatchNo(channel: string): Promise<number> {
  const { rows } = await pool.query<{ n: number | null }>(
    `SELECT MAX(batch_no) AS n FROM records WHERE channel = $1`,
    [channel],
  );
  return rows[0]?.n ?? 0;
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

    // Read the counter once per channel, then walk it forward locally.
    let n = await lastBatchNo(channel.name);

    for (let i = 1; i <= perDay; i += 1) {
      n += 1;
      const { rowCount } = await pool.query(
        `INSERT INTO records (
           kind, category, channel, code, title, air_date, deadline, vo_source,
           status, parsed_by, confidence, batch_no, source_message_id, raw_content
         ) VALUES ('bits', 'bits', $1, $2, $3, $4, $5, 'none', 'open', 'recurring', 1, $6, $7, '')
         ON CONFLICT (source_message_id) DO NOTHING`,
        [
          channel.name,
          channel.codePrefix ? `${channel.codePrefix}-${String(n).padStart(4, "0")}` : null,
          `${channel.name} batch ${n}`,
          date,
          deadline,
          n,
          key(channel, date, i),
        ],
      );

      if (rowCount) opened += 1;
      else {
        alreadyThere += 1;
        n -= 1; // nothing was created, so the counter must not advance
      }
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

/** What a day's batches currently look like, for the Recurring page. */
export async function batchStatus(date: string): Promise<
  Array<{ channel: string; total: number; done: number }>
> {
  const { rows } = await pool.query<{ channel: string; total: string; done: string }>(
    `SELECT channel,
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE status = 'done') AS done
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
    };
  });
}
