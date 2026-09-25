/**
 * The overdue nudge.
 *
 * A deadline that passes quietly is the failure this whole system exists to
 * prevent, so once something is past its time the bot says so — once. Every
 * nudge is recorded against the record, which is what stops an hourly check
 * turning into an hourly nag about the same late video.
 *
 * Recurring batches (bits and reading) are left out: they go past 6pm most
 * days by design, and a notification you learn to ignore is worse than none.
 */
import { EmbedBuilder, type SendableChannels } from "discord.js";
import { config } from "../config.js";
import { pool } from "../db/pool.js";
import { ORG_TZ, renderIn } from "../parse/derive.js";

interface LateRow {
  id: number;
  code: string | null;
  title: string | null;
  channel: string | null;
  due: Date;
}

/** Records past their time that nobody has been told about yet. */
export async function unNudged(): Promise<LateRow[]> {
  const { rows } = await pool.query<LateRow>(
    `SELECT r.id, r.code, r.title, r.channel,
            COALESCE(r.vo_due, r.deadline, r.script_due) AS due
     FROM records r
     LEFT JOIN nudges n ON n.record_id = r.id
     WHERE r.status = 'open'
       AND r.batch_no IS NULL
       AND n.record_id IS NULL
       AND COALESCE(r.vo_due, r.deadline, r.script_due) < now()
     ORDER BY due ASC
     LIMIT 10`,
  );
  return rows;
}

export async function markNudged(ids: number[]): Promise<void> {
  if (!ids.length) return;
  await pool.query(
    `INSERT INTO nudges (record_id) SELECT unnest($1::bigint[])
     ON CONFLICT (record_id) DO NOTHING`,
    [ids],
  );
}

/** Posts one message covering everything newly late. Returns how many. */
export async function postNudge(channel: SendableChannels): Promise<number> {
  const late = await unNudged();
  if (!late.length) return 0;

  const embed = new EmbedBuilder()
    .setColor(0xd4453a)
    .setTitle(late.length === 1 ? "Past its time" : `${late.length} past their time`)
    .setDescription(
      late
        .map((r) => {
          const link = config.publicUrl ? ` · [open](${config.publicUrl}/r/${r.id})` : "";
          const where = r.channel ? ` · ${r.channel}` : "";
          return `**${r.code ? `${r.code} ` : ""}${r.title ?? "(untitled)"}**${where}\n${renderIn(
            r.due,
            ORG_TZ,
            "ET",
          )}${link}`;
        })
        .join("\n\n"),
    );

  await channel.send({ embeds: [embed] });
  await markNudged(late.map((r) => r.id));
  return late.length;
}
