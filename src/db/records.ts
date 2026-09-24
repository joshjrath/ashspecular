import type { CategoryId } from "../catalog.js";
import type { DerivedRecord } from "../parse/derive.js";
import type { Extraction } from "../parse/schema.js";
import { pool } from "./pool.js";

/** Where a record came from, so the board can link back to the message. */
export interface Source {
  messageId: string;
  channelId: string;
  guildId: string | null;
  author: string;
  url: string;
  raw: string;
  parsedBy: string;
}

export interface StoredRecord extends DerivedRecord {
  id: number;
  status: "open" | "done";
  parsedBy: string;
  sourceUrl: string | null;
  sourceAuthor: string | null;
  /** The message as it arrived, so a row with no title can show its own words. */
  raw: string;
  createdAt: Date;
}

/**
 * Upsert on the Discord message id, so re-parsing a message after a fix
 * corrects the row instead of adding a second one.
 */
export async function saveRecord(record: DerivedRecord, source: Source): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO records (
       kind, category, channel, code, title, tag, stage,
       air_date, script_due, vo_due, vo_source, deadline,
       word_count, assignee, version, links, brief, note,
       parsed_by, confidence, warnings,
       source_message_id, source_channel_id, source_guild_id,
       source_author, source_url, raw_content
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,
       $8,$9,$10,$11,$12,
       $13,$14,$15,$16,$17,$18,
       $19,$20,$21,
       $22,$23,$24,$25,$26,$27
     )
     ON CONFLICT (source_message_id) DO UPDATE SET
       kind = EXCLUDED.kind, category = EXCLUDED.category, channel = EXCLUDED.channel,
       code = EXCLUDED.code, title = EXCLUDED.title, tag = EXCLUDED.tag,
       stage = EXCLUDED.stage, air_date = EXCLUDED.air_date,
       script_due = EXCLUDED.script_due, vo_due = EXCLUDED.vo_due,
       vo_source = EXCLUDED.vo_source, deadline = EXCLUDED.deadline,
       word_count = EXCLUDED.word_count, assignee = EXCLUDED.assignee,
       version = EXCLUDED.version, links = EXCLUDED.links, brief = EXCLUDED.brief,
       note = EXCLUDED.note, parsed_by = EXCLUDED.parsed_by,
       confidence = EXCLUDED.confidence, warnings = EXCLUDED.warnings,
       updated_at = now()
     RETURNING id`,
    [
      record.kind, record.category, record.channel, record.code, record.title,
      record.tag, record.stage,
      record.airDate, record.scriptDue, record.voDue, record.voSource, record.deadline,
      record.wordCount, record.assignee, record.version, JSON.stringify(record.links),
      record.brief, record.note,
      source.parsedBy, record.confidence, record.warnings,
      source.messageId, source.channelId, source.guildId,
      source.author, source.url, source.raw,
    ],
  );
  return rows[0]!.id;
}

export async function setStatus(id: number, status: "open" | "done"): Promise<void> {
  await pool.query(
    `UPDATE records SET status = $2, done_at = CASE WHEN $2 = 'done' THEN now() END,
       updated_at = now() WHERE id = $1`,
    [id, status],
  );
}

interface Row {
  id: number;
  kind: string;
  category: string;
  channel: string | null;
  code: string | null;
  title: string | null;
  tag: string | null;
  stage: string | null;
  air_date: Date | null;
  script_due: Date | null;
  vo_due: Date | null;
  vo_source: string;
  deadline: Date | null;
  word_count: number | null;
  assignee: string | null;
  version: number | null;
  links: Extraction["links"];
  brief: string | null;
  note: string | null;
  status: string;
  parsed_by: string;
  confidence: number;
  warnings: string[];
  source_url: string | null;
  source_author: string | null;
  raw_content: string;
  created_at: Date;
}

function hydrate(r: Row): StoredRecord {
  return {
    id: r.id,
    kind: r.kind as DerivedRecord["kind"],
    category: r.category as CategoryId | "unknown",
    channel: r.channel,
    code: r.code,
    title: r.title,
    tag: r.tag,
    stage: r.stage as DerivedRecord["stage"],
    airDate: r.air_date ? r.air_date.toISOString().slice(0, 10) : null,
    scriptDue: r.script_due,
    voDue: r.vo_due,
    voSource: r.vo_source as DerivedRecord["voSource"],
    deadline: r.deadline,
    wordCount: r.word_count,
    assignee: r.assignee,
    version: r.version,
    links: r.links ?? [],
    brief: r.brief,
    note: r.note,
    confidence: r.confidence,
    warnings: r.warnings ?? [],
    status: r.status as "open" | "done",
    parsedBy: r.parsed_by,
    sourceUrl: r.source_url,
    sourceAuthor: r.source_author,
    raw: r.raw_content ?? "",
    createdAt: r.created_at,
  };
}

const SELECT = `SELECT id, kind, category, channel, code, title, tag, stage,
  air_date, script_due, vo_due, vo_source, deadline, word_count, assignee,
  version, links, brief, note, status, parsed_by, confidence, warnings,
  source_url, source_author, raw_content, created_at FROM records`;

/** Everything still open, newest first. */
export async function listOpen(limit = 200): Promise<StoredRecord[]> {
  const { rows } = await pool.query<Row>(
    `${SELECT} WHERE status = 'open' ORDER BY created_at DESC LIMIT $1`,
    [limit],
  );
  return rows.map(hydrate);
}

/** Open work with a voiceover deadline, soonest first — the spine of the day. */
export async function listVoQueue(limit = 50): Promise<StoredRecord[]> {
  const { rows } = await pool.query<Row>(
    `${SELECT} WHERE status = 'open' AND vo_due IS NOT NULL
     ORDER BY vo_due ASC LIMIT $1`,
    [limit],
  );
  return rows.map(hydrate);
}

/** Everything carrying a Frame.io link — the thing that used to live in DMs. */
export async function listReviews(limit = 50): Promise<StoredRecord[]> {
  const { rows } = await pool.query<Row>(
    `${SELECT} WHERE status = 'open'
       AND links @> '[{"kind":"frameio"}]'::jsonb
     ORDER BY created_at DESC LIMIT $1`,
    [limit],
  );
  return rows.map(hydrate);
}

/** One channel's everything — what you get by clicking a channel name. */
export async function listByChannel(channel: string, limit = 100): Promise<StoredRecord[]> {
  const { rows } = await pool.query<Row>(
    `${SELECT} WHERE channel = $1 ORDER BY status ASC, created_at DESC LIMIT $2`,
    [channel, limit],
  );
  return rows.map(hydrate);
}

export async function listByCategory(category: string, limit = 100): Promise<StoredRecord[]> {
  const { rows } = await pool.query<Row>(
    `${SELECT} WHERE category = $1 AND status = 'open' ORDER BY created_at DESC LIMIT $2`,
    [category, limit],
  );
  return rows.map(hydrate);
}

export async function getRecord(id: number): Promise<StoredRecord | null> {
  const { rows } = await pool.query<Row>(`${SELECT} WHERE id = $1`, [id]);
  return rows[0] ? hydrate(rows[0]) : null;
}

/** Open count per category, for the four tiles across the top. */
export async function categoryCounts(): Promise<Record<string, number>> {
  const { rows } = await pool.query<{ category: string; n: string }>(
    `SELECT category, COUNT(*) AS n FROM records WHERE status = 'open' GROUP BY category`,
  );
  return Object.fromEntries(rows.map((r) => [r.category, Number(r.n)]));
}

/** Open count per channel, so a channel with nothing in it can say so. */
export async function channelCounts(): Promise<Record<string, number>> {
  const { rows } = await pool.query<{ channel: string; n: string }>(
    `SELECT channel, COUNT(*) AS n FROM records
     WHERE status = 'open' AND channel IS NOT NULL GROUP BY channel`,
  );
  return Object.fromEntries(rows.map((r) => [r.channel, Number(r.n)]));
}
