/**
 * The morning digest.
 *
 * One message a day naming what actually has to happen: the long-form videos
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
import { ORG_TZ, TEAM_TZ, dateIn, renderIn } from "../parse/derive.js";

const COLOUR = Number.parseInt(
  (CATEGORIES.find((c) => c.id === "long_form")?.color ?? "#4A5CD4").slice(1),
  16,
);

export interface Digest {
  date: string;
  priorities: StoredRecord[];
  late: StoredRecord[];
  dueToday: StoredRecord[];
  batches: { total: number; done: number; late: number };
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
    .filter((r) => r.category === "long_form" && r.voDue)
    .sort((a, b) => (a.voDue!.getTime() - b.voDue!.getTime()))
    .slice(0, config.digestCount);

  // Bits are summarised on their own line, so they stay out of these two or
  // seven batches would drown the four things that actually need deciding.
  const rest = open.filter((r) => r.category !== "bits");

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
  const batches = {
    total: batchRows.length,
    done: batchRows.filter((r) => r.status === "done").length,
    late: batchRows.filter(
      (r) => r.status === "open" && r.deadline !== null && r.deadline.getTime() < now,
    ).length,
  };

  return { date, priorities, late, dueToday, batches };
}

function line(r: StoredRecord): string {
  const when = r.voDue
    ? `VO ${renderIn(r.voDue, ORG_TZ, "ET")}`
    : r.deadline
      ? `due ${renderIn(r.deadline, ORG_TZ, "ET")}`
      : "no deadline";
  const derived = r.voSource === "calculated" ? " *(air − 6d)*" : "";
  const where = r.channel ? ` · ${r.channel}` : "";
  const link = config.publicUrl ? ` · [open](${config.publicUrl}/r/${r.id})` : "";
  return `**${r.code ? `${r.code} ` : ""}${r.title ?? "(untitled)"}**${where}\n${when}${derived}${link}`;
}

export function renderDigestEmbed(d: Digest): EmbedBuilder {
  const pretty = new Intl.DateTimeFormat("en-GB", {
    weekday: "long", day: "numeric", month: "long", timeZone: ORG_TZ,
  }).format(new Date(`${d.date}T12:00:00Z`));

  const embed = new EmbedBuilder()
    .setTitle(`Today · ${pretty}`)
    .setColor(COLOUR)
    .setFooter({ text: `${ORG_TZ} · second zone ${TEAM_TZ}` });

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
    name: "Bits",
    value: d.batches.total
      ? `${d.batches.done}/${d.batches.total} batches cleared${
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
