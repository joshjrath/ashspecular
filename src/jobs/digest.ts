/**
 * The morning digest.
 *
 * One message a day naming what actually has to happen: the story videos
 * whose voiceover is closest, then everything else that is late or due today,
 * then how the bits batches stand. It is the answer to the original problem —
 * not having to look through every server to find out what today is.
 *
 * It picks by voiceover deadline, not by when something was filed, because the
 * VO time is what the day is built around.
 */
import { EmbedBuilder, MessageFlags, type SendableChannels } from "discord.js";
import { CATEGORIES } from "../catalog.js";
import { config } from "../config.js";
import { pool } from "../db/pool.js";
import { listBatchesOn, type StoredRecord } from "../db/records.js";
import { ORG_TZ, TEAM_TZ, VO_BUFFER_DAYS, dateIn, renderIn, shiftDate } from "../parse/derive.js";

const COLOUR = Number.parseInt(
  (CATEGORIES.find((c) => c.id === "stories")?.color ?? "#4A5CD4").slice(1),
  16,
);

export interface Digest {
  date: string;
  priorities: StoredRecord[];
  late: StoredRecord[];
  dueToday: StoredRecord[];
  batches: { total: number; done: number; late: number };
  /** Days off in the week ahead (today included), and the deadlines each moved. */
  daysOff?: Array<{ day: string; moved: StoredRecord[] }>;
}

const DUE = "COALESCE(vo_due, deadline, script_due)";

const SELECT = `SELECT id, kind, category, channel, code, title, tag, stage,
  air_date, script_due, vo_due, vo_source, deadline, word_count, assignee,
  version, links, brief, note, status, parsed_by, confidence, warnings,
  source_url, source_author, raw_content, created_at FROM records`;

/** Everything the digest says, gathered in one place so it can be previewed. */
export async function buildDigest(date = dateIn(ORG_TZ)): Promise<Digest> {
  const { listOpen } = await import("../db/records.js");
  const open = await listOpen(400);

  const now = Date.now();
  const due = (r: StoredRecord) => r.voDue ?? r.deadline ?? r.scriptDue;

  const priorities = open
    .filter((r) => r.category === "stories" && r.voDue)
    .sort((a, b) => (a.voDue!.getTime() - b.voDue!.getTime()))
    .slice(0, config.digestCount);

  // Recurring batches (bits and reading) are summarised on their own line, so
  // they stay out of these two or a dozen batches would drown the four things
  // that actually need deciding.
  const rest = open.filter((r) => r.parsedBy !== "recurring");

  const late = rest
    .filter((r) => {
      const at = due(r);
      return at !== null && at.getTime() < now;
    })
    .sort((a, b) => due(a)!.getTime() - due(b)!.getTime());

  const dueToday = rest.filter((r) => {
    const at = due(r);
    return at !== null && at.getTime() >= now && dateIn(ORG_TZ, at) === date;
  });

  const batchRows = await listBatchesOn(date);
  // Counted in uploads, as the Recurring page counts them.
  const target = (r: StoredRecord) => r.batchTarget ?? 1;
  const batches = {
    total: batchRows.reduce((n, r) => n + target(r), 0),
    done: batchRows.reduce((n, r) => n + (r.status === "done" ? target(r) : r.batchDone), 0),
    late: batchRows.filter(
      (r) => r.status === "open" && r.deadline !== null && r.deadline.getTime() < now,
    ).length,
  };

  // Days off this week: say so, and what they brought forward.
  const { listDaysOff, listOffShifted } = await import("../db/records.js");
  const [offDays, shifted] = await Promise.all([listDaysOff(), listOffShifted()]);
  const week = offDays.filter((d) => d >= date && d <= shiftDate(date, 7));
  const daysOff = week.map((day) => ({
    day,
    moved: shifted.map((x) => x.record).filter((r) => r.offFrom && dateIn(ORG_TZ, r.offFrom) === day),
  }));

  return { date, priorities, late, dueToday, batches, daysOff };
}

function line(r: StoredRecord): string {
  const when = r.voDue
    ? `VO ${renderIn(r.voDue, ORG_TZ, "ET")}`
    : r.deadline
      ? `due ${renderIn(r.deadline, ORG_TZ, "ET")}`
      : "no deadline";
  const derived = r.voSource === "calculated" ? ` *(${VO_BUFFER_DAYS} days before air)*` : "";
  const where = r.channel ? ` · ${r.channel}` : "";
  const link = config.publicUrl ? ` · [open](${config.publicUrl}/r/${r.id})` : "";
  return `**${r.code ? `${r.code} ` : ""}${r.title ?? "(untitled)"}**${where}\n${when}${derived}${link}`;
}

export function renderDigestEmbed(d: Digest): EmbedBuilder {
  const pretty = new Intl.DateTimeFormat("en-US", {
    weekday: "long", day: "numeric", month: "long", timeZone: ORG_TZ,
  }).format(new Date(`${d.date}T12:00:00Z`));

  const embed = new EmbedBuilder()
    .setTitle(`Today · ${pretty}`)
    .setColor(COLOUR)
    .setFooter({ text: `${ORG_TZ} · second zone ${TEAM_TZ}` });

  if (d.daysOff?.length) {
    const short = (day: string) =>
      new Intl.DateTimeFormat("en-US", { weekday: "short", month: "numeric", day: "numeric", year: "numeric", timeZone: "UTC" })
        .format(new Date(`${day}T12:00:00Z`));
    embed.addFields({
      name: "🌙 Days off",
      value: d.daysOff
        .map(({ day, moved }) => {
          const head = day === d.date ? "**Today is a day off.**" : `**${short(day)}** is a day off.`;
          if (!moved.length) return head;
          const due = moved[0]!.voDue ?? moved[0]!.deadline ?? moved[0]!.scriptDue;
          return `${head} ${moved.length} deadline${moved.length === 1 ? "" : "s"} due the working day before${
            due ? ` (${renderIn(due, ORG_TZ, "ET")})` : ""
          }: ${moved.slice(0, 4).map((r) => r.code ?? r.title ?? "untitled").join(", ")}${moved.length > 4 ? ` and ${moved.length - 4} more` : ""}.`;
        })
        .join("\n"),
    });
  }

  embed.addFields({
    name: `Voiceover — the next ${d.priorities.length || config.digestCount}`,
    value: d.priorities.length
      ? d.priorities.map(line).join("\n\n")
      : "_Nothing waiting on a voiceover._",
  });

  if (d.late.length) {
    embed.addFields({
      name: `Late · ${d.late.length}`,
      value: d.late.slice(0, 5).map(line).join("\n\n") +
        (d.late.length > 5 ? `\n\n_and ${d.late.length - 5} more_` : ""),
    });
  }

  if (d.dueToday.length) {
    embed.addFields({
      name: `Due today · ${d.dueToday.length}`,
      value: d.dueToday.slice(0, 5).map(line).join("\n\n") +
        (d.dueToday.length > 5 ? `\n\n_and ${d.dueToday.length - 5} more_` : ""),
    });
  }

  embed.addFields({
    name: "Recurring",
    value: d.batches.total
      ? `${d.batches.done}/${d.batches.total} done${
          d.batches.late ? ` · **${d.batches.late} past their time**` : ""
        }`
      : "_No batches open yet._",
  });

  if (config.publicUrl) embed.setURL(config.publicUrl);
  return embed;
}

/** Posts the digest, and records that it went out so a restart can't double-post. */
export async function postDigest(
  channel: SendableChannels,
  date = dateIn(ORG_TZ),
): Promise<boolean> {
  const { rowCount } = await pool.query(
    `INSERT INTO digests (local_date) VALUES ($1) ON CONFLICT (local_date) DO NOTHING`,
    [date],
  );
  if (!rowCount) return false; // already went out today

  const digest = await buildDigest(date);
  await channel.send({ embeds: [renderDigestEmbed(digest)], flags: MessageFlags.SuppressNotifications });
  return true;
}
