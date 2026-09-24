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

// ── the dashboard's numbers ───────────────────────────────────────────────

/**
 * The effective deadline for a row: the voiceover time if there is one, then
 * any other stated deadline, then the script deadline. One expression, used
 * everywhere, so the bar chart and the counts can never disagree.
 */
const DUE = "COALESCE(vo_due, deadline, script_due)";

export interface Stats {
  late: number;
  dueToday: number;
  voToRecord: number;
  shippedThisWeek: number;
}

export async function stats(zone: string): Promise<Stats> {
  const { rows } = await pool.query<Record<string, string>>(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'open' AND ${DUE} < now()) AS late,
       COUNT(*) FILTER (WHERE status = 'open'
         AND (${DUE} AT TIME ZONE $1)::date = (now() AT TIME ZONE $1)::date) AS due_today,
       COUNT(*) FILTER (WHERE status = 'open' AND vo_due IS NOT NULL) AS vo,
       COUNT(*) FILTER (WHERE status = 'done' AND done_at > now() - interval '7 days') AS shipped
     FROM records`,
    [zone],
  );
  const r = rows[0]!;
  return {
    late: Number(r.late),
    dueToday: Number(r.due_today),
    voToRecord: Number(r.vo),
    shippedThisWeek: Number(r.shipped),
  };
}

export interface DayBucket {
  /** YYYY-MM-DD in the org's zone, or null for the overdue bucket. */
  date: string | null;
  counts: Record<string, number>;
  total: number;
}

/**
 * Work due per day for the next `days` days, split by category, with
 * everything already overdue collected into one bucket at the front.
 */
export async function dueByDay(zone: string, days = 14): Promise<DayBucket[]> {
  const { rows } = await pool.query<{ day: string | null; category: string; n: string }>(
    `SELECT
       CASE WHEN ${DUE} < now() THEN NULL
            ELSE to_char(${DUE} AT TIME ZONE $1, 'YYYY-MM-DD') END AS day,
       category, COUNT(*) AS n
     FROM records
     WHERE status = 'open' AND ${DUE} IS NOT NULL
       AND ${DUE} < (now() + ($2 || ' days')::interval)
     GROUP BY 1, 2`,
    [zone, days],
  );

  const byDay = new Map<string | null, Record<string, number>>();
  for (const r of rows) {
    const key = r.day;
    if (!byDay.has(key)) byDay.set(key, {});
    byDay.get(key)![r.category] = Number(r.n);
  }

  // Every day in the window appears, empty or not — gaps are information.
  const out: DayBucket[] = [];
  const overdue = byDay.get(null) ?? {};
  out.push({ date: null, counts: overdue, total: sum(overdue) });

  const today = new Date();
  for (let i = 0; i < days; i += 1) {
    const d = new Date(today.getTime() + i * 86_400_000);
    const key = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit",
    }).format(d);
    const counts = byDay.get(key) ?? {};
    out.push({ date: key, counts, total: sum(counts) });
  }
  return out;
}

function sum(counts: Record<string, number>): number {
  return Object.values(counts).reduce((a, b) => a + b, 0);
}

/** Everything open, grouped by category, soonest deadline first. */
export async function openByCategory(): Promise<Map<string, StoredRecord[]>> {
  const { rows } = await pool.query<Row>(
    `${SELECT} WHERE status = 'open'
     ORDER BY ${DUE} ASC NULLS LAST, created_at DESC LIMIT 300`,
  );
  const grouped = new Map<string, StoredRecord[]>();
  for (const r of rows.map(hydrate)) {
    if (!grouped.has(r.category)) grouped.set(r.category, []);
    grouped.get(r.category)!.push(r);
  }
  return grouped;
}

/** One day's batches, newest number first. Bounded by construction. */
export async function listBatchesOn(date: string): Promise<StoredRecord[]> {
  const { rows } = await pool.query<Row>(
    `${SELECT} WHERE batch_no IS NOT NULL AND air_date = $1
     ORDER BY channel ASC, batch_no ASC`,
    [date],
  );
  return rows.map(hydrate);
}

/** When the bot last filed anything — the "live" indicator's truth. */
export async function lastIntake(): Promise<Date | null> {
  const { rows } = await pool.query<{ at: Date | null }>(
    `SELECT MAX(created_at) AS at FROM records`,
  );
  return rows[0]?.at ?? null;
}

// ── the calendar ──────────────────────────────────────────────────────────

/**
 * What the calendar plots.
 *
 * "posting" is the air date — the day a video goes out, which is what a
 * content calendar is for. "deadlines" is the day the work is due, which is a
 * different question about the same records, so it is a mode rather than a
 * second page.
 */
export type CalendarMode = "posting" | "deadlines";

export interface CalendarEntry {
  /** YYYY-MM-DD in the org's zone. */
  day: string;
  record: StoredRecord;
}

function calendarExpr(mode: CalendarMode): string {
  return mode === "posting"
    ? "to_char(air_date, 'YYYY-MM-DD')"
    : `to_char(${DUE} AT TIME ZONE $3, 'YYYY-MM-DD')`;
}

/**
 * Every record falling inside a date range, tagged with the day it lands on.
 * Dates are inclusive at both ends, as YYYY-MM-DD.
 */
export async function calendarRange(
  from: string,
  to: string,
  mode: CalendarMode,
  zone: string,
): Promise<CalendarEntry[]> {
  const day = calendarExpr(mode);
  const params: unknown[] = mode === "posting" ? [from, to] : [from, to, zone];

  const { rows } = await pool.query<Row & { day: string }>(
    `SELECT ${day} AS day, id, kind, category, channel, code, title, tag, stage,
       air_date, script_due, vo_due, vo_source, deadline, word_count, assignee,
       version, links, brief, note, status, parsed_by, confidence, warnings,
       source_url, source_author, raw_content, created_at
     FROM records
     WHERE ${day} BETWEEN $1 AND $2
     -- Bits sort last within a day: 35 batches would otherwise bury the one
     -- video that is actually airing.
     ORDER BY 1 ASC, (category = 'bits') ASC, category ASC, created_at ASC
     LIMIT 1000`,
    params,
  );

  return rows.map((r) => ({ day: r.day, record: hydrate(r) }));
}

/** One day's worth, for the day page a calendar cell links to. */
export async function listByDay(
  date: string,
  mode: CalendarMode,
  zone: string,
): Promise<StoredRecord[]> {
  const entries = await calendarRange(date, date, mode, zone);
  return entries.map((e) => e.record);
}
