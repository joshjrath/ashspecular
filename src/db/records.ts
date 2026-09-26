import type { CategoryId } from "../catalog.js";
import type { DerivedRecord } from "../parse/derive.js";
import { ORG_TZ, SHORTS_DAY_STARTS_HOUR } from "../parse/derive.js";
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

export type Status = "open" | "done" | "removed";

export interface StoredRecord extends DerivedRecord {
  id: number;
  /**
   * open → on the board. done → cleared, counted in "cleared this week".
   * removed → taken off without being counted: kept rather than deleted so it
   * can be restored, and so the 6 AM opener doesn't recreate a removed batch.
   */
  status: Status;
  parsedBy: string;
  sourceUrl: string | null;
  sourceAuthor: string | null;
  /** The message as it arrived, so a row with no title can show its own words. */
  raw: string;
  /** Set on recurring batches only. */
  batchNo: number | null;
  /** How many uploads the batch holds, and how many are done. */
  batchTarget: number | null;
  batchDone: number;
  /** When it was pinned to the top of the dashboard; null when it isn't. */
  pinnedAt: Date | null;
  /** When it was paused — out of the workflow, no deadline anywhere; null when it isn't. */
  pausedAt: Date | null;
  /** When it was marked "no script" — the VO is waiting on a script; null when it isn't. */
  noScriptAt: Date | null;
  /** When it was marked uploaded — live on its channel; null when it isn't. */
  uploadedAt: Date | null;
  /**
   * The deadline as it was set, when a day off brought it forward. The
   * deadline fields themselves (voDue, deadline, scriptDue) are always the
   * ones that stand — a day off already taken into account.
   */
  offFrom: Date | null;
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
       vo_source = EXCLUDED.vo_source,
       deadline = CASE WHEN EXCLUDED.kind = 'review' THEN COALESCE(records.deadline, EXCLUDED.deadline) ELSE EXCLUDED.deadline END,
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

/**
 * Replace what a record says with a fresh reading of the same message — the
 * Re-read button. Everything the parser decides is rewritten; its status, its
 * history and where it came from are not.
 */
export async function refile(id: number, r: DerivedRecord, parsedBy: string): Promise<void> {
  await pool.query(
    `UPDATE records SET
       kind = $2, category = $3, channel = $4, code = $5, title = $6, tag = $7,
       stage = $8, air_date = $9, script_due = $10, vo_due = $11, vo_source = $12,
       deadline = $13, word_count = $14, assignee = $15, version = $16,
       links = $17, brief = $18, note = $19, parsed_by = $20, confidence = $21,
       warnings = $22, updated_at = now()
     WHERE id = $1`,
    [
      id, r.kind, r.category, r.channel, r.code, r.title, r.tag, r.stage,
      r.airDate, r.scriptDue, r.voDue, r.voSource, r.deadline, r.wordCount,
      r.assignee, r.version, JSON.stringify(r.links), r.brief, r.note, parsedBy,
      r.confidence, r.warnings,
    ],
  );
}

/**
 * Move a record's air date — a drag on the calendar, or the date box on its
 * page. A VO deadline that was worked out from the old air date is worked out
 * again from the new one; one that someone stated is theirs and is left alone.
 * Recurring batches never get a VO. Null clears the air date.
 */
export async function moveAir(id: number, airDate: string | null, calculatedVo: Date | null): Promise<void> {
  await pool.query(
    `UPDATE records SET
       air_date = $2::date,
       vo_due = CASE
         WHEN batch_no IS NOT NULL THEN vo_due
         WHEN vo_source IN ('calculated', 'none') THEN $3::timestamptz
         ELSE vo_due END,
       vo_source = CASE
         WHEN batch_no IS NOT NULL THEN vo_source
         WHEN vo_source IN ('calculated', 'none') THEN CASE WHEN $3::timestamptz IS NULL THEN 'none' ELSE 'calculated' END
         ELSE vo_source END,
       updated_at = now()
     WHERE id = $1`,
    [id, airDate, calculatedVo],
  );
  // Moved means it may no longer be late — and if it goes late again, it
  // deserves a fresh nudge rather than silence.
  await pool.query(`DELETE FROM nudges WHERE record_id = $1`, [id]);
}

/**
 * Move whichever deadline the calendar is showing for a record — the VO time
 * if it has one, then any other deadline, then the script's — to another day,
 * keeping its time of day. A hand-moved VO time is a stated one from then on.
 */
export async function moveDue(
  id: number,
  field: "vo_due" | "deadline" | "script_due",
  at: Date,
): Promise<void> {
  const extra = field === "vo_due" ? ", vo_source = 'stated'" : "";
  await pool.query(`UPDATE records SET ${field} = $2${extra}, updated_at = now() WHERE id = $1`, [id, at]);
  await pool.query(`DELETE FROM nudges WHERE record_id = $1`, [id]);
}

/**
 * A channel's schedule from `since` on, for moving the rest along with one
 * video. Posting is by air date, cleared videos included (they haven't aired);
 * Deadlines is by the day the deadline falls, open work only. Daily batches
 * and paused videos never move with anything.
 */
export async function channelSchedule(channel: string, mode: CalendarMode, since: string): Promise<StoredRecord[]> {
  const where =
    mode === "posting"
      ? `air_date >= $2::date AND status IN ('open', 'done')`
      : `(${DUE} AT TIME ZONE '${ORG_TZ}')::date >= $2::date AND status = 'open'`;
  const { rows } = await pool.query<Row>(
    `${SELECT} WHERE channel = $1 AND batch_no IS NULL AND paused_at IS NULL AND ${where} LIMIT 500`,
    [channel, since],
  );
  return rows.map(hydrate);
}

/** What a move changes on a record, kept so Undo can put it back exactly. */
export interface MoveSnapshot {
  id: number;
  airDate: string | null;
  voDue: Date | null;
  voSource: string;
  deadline: Date | null;
  scriptDue: Date | null;
  nudged: boolean;
}

export async function snapshotMoves(ids: number[]): Promise<MoveSnapshot[]> {
  const { rows } = await pool.query<{
    id: number; air_date: string | null; vo_due: Date | null; vo_source: string;
    deadline: Date | null; script_due: Date | null; nudged: boolean;
  }>(
    `SELECT r.id, to_char(r.air_date, 'YYYY-MM-DD') AS air_date, r.vo_due, r.vo_source, r.deadline, r.script_due,
       (n.record_id IS NOT NULL) AS nudged
     FROM records r LEFT JOIN nudges n ON n.record_id = r.id WHERE r.id = ANY($1::bigint[])`,
    [ids],
  );
  return rows.map((r) => ({
    id: Number(r.id), airDate: r.air_date, voDue: r.vo_due, voSource: r.vo_source,
    deadline: r.deadline, scriptDue: r.script_due, nudged: r.nudged,
  }));
}

/** Undo a move: every record back to its dates, in one transaction. */
export async function restoreMoves(snaps: MoveSnapshot[]): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const s of snaps) {
      await client.query(
        `UPDATE records SET air_date = $2::date, vo_due = $3, vo_source = $4, deadline = $5, script_due = $6,
           updated_at = now() WHERE id = $1`,
        [s.id, s.airDate, s.voDue, s.voSource, s.deadline, s.scriptDue],
      );
      // Told about once already: don't tell again because it went back.
      if (s.nudged) {
        await client.query(`INSERT INTO nudges (record_id) VALUES ($1) ON CONFLICT (record_id) DO NOTHING`, [s.id]);
      }
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// ── days off ──────────────────────────────────────────────────────────────

/** Every day marked off, as YYYY-MM-DD, earliest first. A handful a year. */
export async function listDaysOff(): Promise<string[]> {
  const { rows } = await pool.query<{ day: string }>(
    `SELECT to_char(day, 'YYYY-MM-DD') AS day FROM days_off ORDER BY day`,
  );
  return rows.map((r) => r.day);
}

/**
 * Mark a day off, or make it a working day again. Deadlines on it move to the
 * working day before (or back) wherever they're read; nothing stored changes.
 */
export async function setDayOff(day: string, on: boolean): Promise<void> {
  if (on) await pool.query(`INSERT INTO days_off (day) VALUES ($1::date) ON CONFLICT (day) DO NOTHING`, [day]);
  else await pool.query(`DELETE FROM days_off WHERE day = $1::date`, [day]);
  // A deadline that moved may be late now, or no longer late: either way it
  // gets a fresh nudge if it goes past its time.
  await pool.query(
    `DELETE FROM nudges n USING records r
     WHERE n.record_id = r.id AND r.status = 'open' AND r.batch_no IS NULL
       AND (${SET_DUE} AT TIME ZONE '${ORG_TZ}')::date = $1::date`,
    [day],
  );
}

/**
 * Open work whose deadline a day off brought forward, and when that became
 * so (the day was marked, or the work filed, whichever was later). Only while
 * the day off is still ahead or today.
 */
export async function listOffShifted(limit = 60): Promise<Array<{ record: StoredRecord; at: Date }>> {
  const { rows } = await pool.query<Row & { marked_at: Date }>(
    `SELECT x.*, GREATEST(d.created_at, x.created_at) AS marked_at
     FROM (${SELECT} WHERE status = 'open' AND batch_no IS NULL AND paused_at IS NULL
             AND (${SET_DUE} AT TIME ZONE '${ORG_TZ}')::date >= (now() AT TIME ZONE '${ORG_TZ}')::date) x
     JOIN days_off d ON d.day = (x.off_from AT TIME ZONE '${ORG_TZ}')::date
     ORDER BY x.off_from ASC LIMIT $1`,
    [limit],
  );
  return rows.map((r) => ({ record: hydrate(r), at: r.marked_at }));
}

/**
 * Pause a video, or resume it. Paused, it has no deadline anywhere — it leaves
 * late, due, the calendar, the columns and the bell — and waits on the Paused
 * page; resumed, its deadline comes back as it was.
 */
export async function setPaused(id: number, on: boolean): Promise<void> {
  await pool.query(
    `UPDATE records SET paused_at = CASE WHEN $2 THEN COALESCE(paused_at, now()) END, updated_at = now() WHERE id = $1`,
    [id, on],
  );
  await pool.query(`DELETE FROM nudges WHERE record_id = $1`, [id]);
}

/** Mark a video as waiting on its script (the VO is needed, the script isn't here), or clear it. */
export async function setNoScript(id: number, on: boolean): Promise<void> {
  await pool.query(
    `UPDATE records SET no_script_at = CASE WHEN $2 THEN COALESCE(no_script_at, now()) END, updated_at = now() WHERE id = $1`,
    [id, on],
  );
}

/**
 * Mark a video uploaded — live on its channel, so it's cleared too — or take
 * the mark off again (it stays cleared).
 */
export async function setUploaded(id: number, on: boolean): Promise<void> {
  await pool.query(
    `UPDATE records SET uploaded_at = CASE WHEN $2 THEN COALESCE(uploaded_at, now()) END,
       status = CASE WHEN $2 THEN 'done' ELSE status END,
       no_script_at = CASE WHEN $2 THEN NULL ELSE no_script_at END,
       paused_at = CASE WHEN $2 THEN NULL ELSE paused_at END,
       updated_at = now() WHERE id = $1`,
    [id, on],
  );
  if (on) await pool.query(`DELETE FROM nudges WHERE record_id = $1`, [id]);
}

/** Each channel's days with a video on (an air date), from a day on — for the upload gaps. Paused and removed work doesn't count. */
export async function channelAirDays(from: string): Promise<Array<{ channel: string; day: string }>> {
  const { rows } = await pool.query<{ channel: string; day: string }>(
    `SELECT DISTINCT channel, to_char(air_date, 'YYYY-MM-DD') AS day FROM records
      WHERE channel IS NOT NULL AND air_date >= $1::date AND status <> 'removed' AND paused_at IS NULL`,
    [from],
  );
  return rows;
}

/** Everything paused, most recently paused first. */
export async function listPaused(limit = 200): Promise<StoredRecord[]> {
  const { rows } = await pool.query<Row>(
    `${SELECT} WHERE paused_at IS NOT NULL AND status = 'open' ORDER BY paused_at DESC LIMIT $1`,
    [limit],
  );
  return rows.map(hydrate);
}

export async function pausedCount(): Promise<number> {
  const { rows } = await pool.query<{ n: string }>(
    `SELECT COUNT(*) AS n FROM records WHERE paused_at IS NOT NULL AND status = 'open'`,
  );
  return Number(rows[0]?.n ?? 0);
}

/** Correct where a record is filed, from the Discord card. */
export async function updateFiling(
  id: number,
  category: string,
  channel: string | null,
): Promise<void> {
  await pool.query(
    `UPDATE records SET category = $2, channel = $3, updated_at = now() WHERE id = $1`,
    [id, category, channel],
  );
}

export async function setStatus(id: number, status: Status): Promise<void> {
  // A batch cleared by its tick is all its uploads done; one reopened from
  // cleared starts its count again rather than sitting at 5/5 but open.
  // Finishing a paused video un-pauses it: it's done, not waiting.
  await pool.query(
    `UPDATE records SET status = $2, done_at = CASE WHEN $2 = 'done' THEN now() END,
       paused_at = CASE WHEN $2 = 'done' THEN NULL ELSE paused_at END,
       batch_done = CASE
         WHEN batch_no IS NULL THEN batch_done
         WHEN $2 = 'done' THEN COALESCE(batch_target, 1)
         WHEN $2 = 'open' AND batch_done >= COALESCE(batch_target, 1) THEN 0
         ELSE batch_done END,
       updated_at = now() WHERE id = $1`,
    [id, status],
  );
}

/** Pin to, or unpin from, the top of the dashboard. Status is untouched. */
export async function setPinned(id: number, pinned: boolean): Promise<void> {
  await pool.query(
    `UPDATE records SET pinned_at = CASE WHEN $2 THEN COALESCE(pinned_at, now()) END,
       updated_at = now() WHERE id = $1`,
    [id, pinned],
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
  batch_no: number | null;
  batch_target: number | null;
  batch_done: number | null;
  pinned_at: Date | null;
  paused_at: Date | null;
  no_script_at: Date | null;
  uploaded_at: Date | null;
  off_from?: Date | null;
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
    status: r.status as Status,
    parsedBy: r.parsed_by,
    sourceUrl: r.source_url,
    sourceAuthor: r.source_author,
    raw: r.raw_content ?? "",
    batchNo: r.batch_no ?? null,
    batchTarget: r.batch_target ?? null,
    batchDone: r.batch_done ?? 0,
    pinnedAt: r.pinned_at ?? null,
    pausedAt: r.paused_at ?? null,
    noScriptAt: r.no_script_at ?? null,
    uploadedAt: r.uploaded_at ?? null,
    offFrom: r.off_from ?? null,
    createdAt: r.created_at,
  };
}

/**
 * A deadline as it stands: one that falls on a day off is due at the same
 * time on the last working day before it (off_adjusted, migration 020).
 * Recurring batches keep theirs — each is its own day's work.
 */
const standing = (col: string) => `CASE WHEN batch_no IS NULL THEN off_adjusted(${col}) ELSE ${col} END`;

/** The deadline as set: the voiceover time, then any other deadline, then the script's. */
const SET_DUE = "COALESCE(vo_due, deadline, script_due)";

/**
 * The effective deadline for a row: the voiceover time if there is one, then
 * any other stated deadline, then the script deadline, with days off taken
 * into account. One expression, used everywhere, so the bar chart and the
 * counts can never disagree.
 */
const DUE = `(${standing(SET_DUE)})`;

/** Every column a record is read with; its deadlines as they stand. */
const COLUMNS = `id, kind, category, channel, code, title, tag, stage,
  air_date, ${standing("script_due")} AS script_due, ${standing("vo_due")} AS vo_due, vo_source,
  ${standing("deadline")} AS deadline, word_count, assignee,
  version, links, brief, note, status, parsed_by, confidence, warnings,
  source_url, source_author, raw_content, batch_no, batch_target, batch_done, pinned_at, paused_at, no_script_at, uploaded_at,
  CASE WHEN ${DUE} IS DISTINCT FROM ${SET_DUE} THEN ${SET_DUE} END AS off_from, created_at`;

const SELECT = `SELECT ${COLUMNS} FROM records`;

/** Everything still open, newest first. */
export async function listOpen(limit = 200): Promise<StoredRecord[]> {
  const { rows } = await pool.query<Row>(
    `${SELECT} WHERE status = 'open' AND ${LIVE} ORDER BY created_at DESC LIMIT $1`,
    [limit],
  );
  return rows.map(hydrate);
}

/** Open work with a voiceover deadline, soonest first — the spine of the day. */
export async function listVoQueue(limit = 50): Promise<StoredRecord[]> {
  const { rows } = await pool.query<Row>(
    `${SELECT} WHERE status = 'open' AND ${LIVE} AND vo_due IS NOT NULL
     ORDER BY vo_due ASC LIMIT $1`,
    [limit],
  );
  return rows.map(hydrate);
}

/** Everything carrying a Frame.io link — the thing that used to live in DMs. */
/**
 * Open revisions — new cuts to review, soonest deadline first. Their own
 * thing: not in the category columns or counts, and never a VO.
 */
export async function listReviews(limit = 50): Promise<StoredRecord[]> {
  const { rows } = await pool.query<Row>(
    `${SELECT} WHERE status = 'open' AND ${LIVE} AND kind = 'review'
     ORDER BY ${DUE} ASC NULLS LAST, created_at DESC LIMIT $1`,
    [limit],
  );
  return rows.map(hydrate);
}

/** Other open work that carries a Frame.io link — assignments sent with a cut to watch. */
export async function listFrameioWork(limit = 50): Promise<StoredRecord[]> {
  const { rows } = await pool.query<Row>(
    `${SELECT} WHERE status = 'open' AND ${LIVE} AND kind <> 'review'
       AND links @> '[{"kind":"frameio"}]'::jsonb
     ORDER BY created_at DESC LIMIT $1`,
    [limit],
  );
  return rows.map(hydrate);
}

/** One channel's everything — what you get by clicking a channel name. */
export async function listByChannel(channel: string, limit = 100): Promise<StoredRecord[]> {
  const { rows } = await pool.query<Row>(
    `${SELECT} WHERE channel = $1 AND status <> 'removed'
     ORDER BY status DESC, created_at DESC LIMIT $2`,
    [channel, limit],
  );
  return rows.map(hydrate);
}

export async function listByCategory(category: string, limit = 100): Promise<StoredRecord[]> {
  const { rows } = await pool.query<Row>(
    `${SELECT} WHERE category = $1 AND status = 'open' AND ${LIVE} AND kind <> 'review' ORDER BY created_at DESC LIMIT $2`,
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
    `SELECT category, COUNT(*) AS n FROM records WHERE status = 'open' AND ${LIVE} AND kind <> 'review' GROUP BY category`,
  );
  return Object.fromEntries(rows.map((r) => [r.category, Number(r.n)]));
}

/** Open count per channel, so a channel with nothing in it can say so. */
export async function channelCounts(): Promise<Record<string, number>> {
  const { rows } = await pool.query<{ channel: string; n: string }>(
    `SELECT channel, COUNT(*) AS n FROM records
     WHERE status = 'open' AND ${LIVE} AND channel IS NOT NULL GROUP BY channel`,
  );
  return Object.fromEntries(rows.map((r) => [r.channel, Number(r.n)]));
}

// ── the dashboard's numbers ───────────────────────────────────────────────


/**
 * Open work that is live today. A recurring batch opened ahead for a later day
 * is real, but it isn't today's work: it stays on Recurring and the calendar,
 * and joins the dashboard, the lists and every count when its day begins —
 * 3 AM for the Bits/Reading day, midnight for a long-form channel's (Specular).
 * Paused work is never live: it waits on the Paused page with no deadline.
 */
const LIVE = `paused_at IS NULL AND NOT (batch_no IS NOT NULL AND air_date > (CASE WHEN category IN ('bits', 'reading')
  THEN ((now() - interval '${SHORTS_DAY_STARTS_HOUR} hours') AT TIME ZONE '${ORG_TZ}')::date
  ELSE (now() AT TIME ZONE '${ORG_TZ}')::date END))`;

export interface Stats {
  late: number;
  dueToday: number;
  voToRecord: number;
  shippedThisWeek: number;
}

export async function stats(zone: string): Promise<Stats> {
  const { rows } = await pool.query<Record<string, string>>(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'open' AND ${LIVE} AND ${DUE} < now()) AS late,
       COUNT(*) FILTER (WHERE status = 'open' AND ${LIVE}
         AND (${DUE} AT TIME ZONE $1)::date = (now() AT TIME ZONE $1)::date) AS due_today,
       COUNT(*) FILTER (WHERE status = 'open' AND ${LIVE} AND vo_due IS NOT NULL) AS vo,
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
     WHERE status = 'open' AND ${LIVE} AND ${DUE} IS NOT NULL
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
    `${SELECT} WHERE status = 'open' AND ${LIVE}
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
    `${SELECT} WHERE batch_no IS NOT NULL AND air_date = $1 AND status <> 'removed'
     ORDER BY channel ASC, batch_no ASC`,
    [date],
  );
  return rows.map(hydrate);
}

/**
 * Search across the things you would actually remember: the title, the code,
 * the channel, the brief, and the message as it arrived. ILIKE rather than
 * full-text search — at this size it is instant, and it matches partial words
 * the way people actually type them ("deadp", "VIDEO-0").
 */
export async function search(query: string, limit = 60): Promise<StoredRecord[]> {
  const q = `%${query.trim()}%`;
  const { rows } = await pool.query<Row>(
    `${SELECT} WHERE title ILIKE $1 OR code ILIKE $1 OR channel ILIKE $1
       OR brief ILIKE $1 OR note ILIKE $1 OR raw_content ILIKE $1
     ORDER BY (status = 'removed') ASC, (status = 'done') ASC, created_at DESC LIMIT $2`,
    [q, limit],
  );
  return rows.map(hydrate);
}

/** Clear a whole channel's batches for one day — the Recurring page's tick. */
export async function clearBatches(channel: string, date: string): Promise<number> {
  const { rowCount } = await pool.query(
    `UPDATE records SET status = 'done', done_at = now(), updated_at = now(),
       batch_done = COALESCE(batch_target, 1)
     WHERE channel = $1 AND air_date = $2 AND batch_no IS NOT NULL AND status = 'open'`,
    [channel, date],
  );
  return rowCount ?? 0;
}

/** Today's recurring batches still open — the Recurring count in the rail. */
export async function openBatchCount(date: string): Promise<number> {
  const { rows } = await pool.query<{ n: string }>(
    `SELECT COUNT(*) AS n FROM records WHERE batch_no IS NOT NULL AND air_date = $1 AND status = 'open'`,
    [date],
  );
  return Number(rows[0]?.n ?? 0);
}

/** What has been removed, newest first — where Restore lives. */
/**
 * Everything the calendar feed covers: anything airing or due in the window,
 * cleared work included (it shows with a ✓), removed work never. Recurring
 * batches only when asked for — a dozen a day would bury the videos.
 */
export async function feedRecords(from: string, to: string, batches: boolean): Promise<StoredRecord[]> {
  const { rows } = await pool.query<Row>(
    `${SELECT} WHERE status <> 'removed' AND paused_at IS NULL ${batches ? "" : "AND batch_no IS NULL"}
       AND (air_date BETWEEN $1 AND $2 OR (${DUE} AT TIME ZONE '${ORG_TZ}')::date BETWEEN $1 AND $2)
     ORDER BY COALESCE(air_date, (${DUE})::date) ASC LIMIT 5000`,
    [from, to],
  );
  return rows.map(hydrate);
}

/** Open work past its time, most overdue first — the chart's LATE column. */
export async function listLate(limit = 300): Promise<StoredRecord[]> {
  const { rows } = await pool.query<Row>(
    `${SELECT} WHERE status = 'open' AND ${LIVE} AND ${DUE} < now() ORDER BY ${DUE} ASC LIMIT $1`,
    [limit],
  );
  return rows.map(hydrate);
}

/**
 * What the dashboard's bell rings for, by kind:
 *
 *   revision  a Frame.io revision came in           — when it arrived
 *   overdue   work went past its time               — when the deadline passed
 *   upcoming  work is due within the next 24 hours  — when it came into that window
 *   airing    a video airs today or tomorrow        — the start of the day before
 *   new       an assignment was filed (last 3 days) — when it was filed
 *   dayoff    a day off brought a deadline forward  — when the day was marked
 *
 * Each carries the moment it happened, so "unread" is simply anything after
 * the last time the bell was opened. Recurring batches are left out: they
 * fall due every evening and would drown the rest.
 */
export type NoticeKind = "revision" | "overdue" | "upcoming" | "airing" | "new" | "dayoff" | "gap" | "update";
/** Something about one piece of work. */
export interface RecordNotice {
  kind: Exclude<NoticeKind, "update" | "gap">;
  at: Date;
  record: StoredRecord;
}
/** A change to the board itself: "What's new". */
export interface UpdateNotice {
  kind: "update";
  at: Date;
  release: { id: string; title: string; changes: Array<{ text: string; href?: string }> };
}
/** A channel expected to post with nothing on that day, within eight days. */
export interface GapNotice {
  kind: "gap";
  at: Date;
  gap: { channel: string; date: string; inDays: number; after: string };
}
export type Notice = RecordNotice | UpdateNotice | GapNotice;

export async function listNotices(zone: string, limit = 60): Promise<RecordNotice[]> {
  const q = (where: string, order: string) =>
    pool.query<Row>(`${SELECT} WHERE ${where} ORDER BY ${order} LIMIT 30`).then((r) => r.rows.map(hydrate));
  const open = "status = 'open' AND batch_no IS NULL AND paused_at IS NULL";
  const [revisions, overdue, upcoming, airing, fresh, shifted] = await Promise.all([
    q("kind = 'review' AND status = 'open' AND paused_at IS NULL", "created_at DESC"),
    q(`${open} AND ${DUE} < now()`, `${DUE} DESC`),
    q(`${open} AND ${DUE} >= now() AND ${DUE} < now() + interval '24 hours'`, `${DUE} ASC`),
    pool
      .query<Row>(
        `${SELECT} WHERE ${open} AND air_date BETWEEN (now() AT TIME ZONE $1)::date
           AND (now() AT TIME ZONE $1)::date + 1 ORDER BY air_date ASC LIMIT 30`,
        [zone],
      )
      .then((r) => r.rows.map(hydrate)),
    q("kind = 'assignment' AND status <> 'removed' AND created_at > now() - interval '3 days'", "created_at DESC"),
    listOffShifted(30),
  ]);
  const due = (r: StoredRecord) => (r.voDue ?? r.deadline ?? r.scriptDue)!;
  const dayBefore = (air: string) => {
    const d = new Date(`${air}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return new Date(`${d.toISOString().slice(0, 10)}T04:00:00Z`);
  };
  const notices: RecordNotice[] = [
    ...revisions.map((record) => ({ kind: "revision" as const, at: record.createdAt, record })),
    ...overdue.map((record) => ({ kind: "overdue" as const, at: due(record), record })),
    ...upcoming.map((record) => ({ kind: "upcoming" as const, at: new Date(due(record).getTime() - 86_400_000), record })),
    ...airing.map((record) => ({ kind: "airing" as const, at: dayBefore(record.airDate!), record })),
    ...fresh.map((record) => ({ kind: "new" as const, at: record.createdAt, record })),
    ...shifted.map(({ record, at }) => ({ kind: "dayoff" as const, at, record })),
  ];
  return notices.sort((x, y) => y.at.getTime() - x.at.getTime()).slice(0, limit);
}

export async function listRemoved(limit = 100): Promise<StoredRecord[]> {
  const { rows } = await pool.query<Row>(
    `${SELECT} WHERE status = 'removed' ORDER BY updated_at DESC LIMIT $1`,
    [limit],
  );
  return rows.map(hydrate);
}

export async function removedCount(): Promise<number> {
  const { rows } = await pool.query<{ n: string }>(
    `SELECT COUNT(*) AS n FROM records WHERE status = 'removed'`,
  );
  return Number(rows[0]?.n ?? 0);
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
    `SELECT ${day} AS day, ${COLUMNS}
     FROM records
     WHERE ${day} BETWEEN $1 AND $2 AND status <> 'removed' AND paused_at IS NULL
     -- Recurring batches sort last within a day: a dozen of them would
     -- otherwise bury the one video that is actually airing.
     ORDER BY 1 ASC, (batch_no IS NOT NULL) ASC, category ASC, created_at ASC
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
