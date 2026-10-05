/**
 * The daily posting check. As soon as a channel can be seen clearly, each
 * video it was due to air before today is checked against what the channel
 * actually uploaded:
 *
 *   went up     it's marked uploaded (cleared), with the video it matched
 *   didn't      it's pushed to today and the rest of the channel's schedule
 *               moves the same number of days with it, deadlines included —
 *               the same cascade as a calendar drag — and you're told, with a
 *               way to put it back
 *
 * "Seen clearly" is per channel: its YouTube link resolved, and read without
 * an error after 1 AM ET (so anything posted late last night has reached the
 * feed). A channel that can't be read is left alone and tried again next
 * hour, never pushed on a guess. Each channel's day is judged once.
 *
 * Normally that's yesterday. But a day the channel couldn't be read on (a
 * quota out, YouTube down, the board redeploying) is judged when it next can
 * be, up to CATCH_UP_DAYS back: before, it was skipped for good, and the
 * video's air date, and every VO deadline after it on the channel, stayed in
 * the past and counted up as overdue. Oldest first: pushing it to today moves
 * the channel's later videos too, so they're usually no longer behind.
 * Daily batches (Bits, Reading, the Specular movie) aren't checked: they're
 * their own day's work.
 */
import { pool } from "../db/pool.js";
import { ORG_TZ, dateIn, instantIn, shiftDate } from "../parse/derive.js";
import { getRecord, setUploaded, snapshotMoves, type MoveSnapshot, type StoredRecord } from "../db/records.js";
import { matchPosts, titleOverlap, type Uploaded } from "../web/postcheck.js";

export interface MissedPost {
  id: number;
  recordId: number;
  channel: string;
  day: string;
  pushedTo: string;
  moved: number;
  at: Date;
  undoneAt: Date | null;
}

/** How far back a day the check never got to is still judged. */
export const CATCH_UP_DAYS = 14;

export interface CheckResult {
  /** Yesterday: the day normally judged. */
  day: string;
  checked: string[];
  waiting: string[];
  posted: Array<{ recordId: number; videoId: string }>;
  missed: MissedPost[];
}

/** Pushes a record to a day; `from` is where the channel's catch-up starts (see moveWithRest). */
export type Push = (record: StoredRecord, to: string, alone: boolean, from: string) => Promise<{ ok: boolean; moved: number }>;

/**
 * Each channel's days still to judge, oldest first: a video due on it (from
 * CATCH_UP_DAYS ago to yesterday) not uploaded, and that day not judged yet.
 * Ready when the channel's linked and was read cleanly since `since`.
 */
async function daysToJudge(today: string, since: Date): Promise<{ ready: Array<{ channel: string; days: string[] }>; waiting: string[] }> {
  const { rows } = await pool.query<{ channel: string; days: string[]; ok: boolean }>(
    `SELECT r.channel, array_agg(DISTINCT to_char(r.air_date, 'YYYY-MM-DD') ORDER BY to_char(r.air_date, 'YYYY-MM-DD')) AS days,
            bool_and(y.youtube_id IS NOT NULL AND y.error IS NULL AND y.checked_at >= $3) AS ok
       FROM records r
       JOIN youtube_channels y ON y.channel = r.channel
      WHERE r.air_date < $1::date AND r.air_date >= $1::date - $2::int
        AND r.batch_no IS NULL AND r.kind = 'assignment'
        AND r.status <> 'removed' AND r.paused_at IS NULL AND r.uploaded_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM post_checks p WHERE p.channel = r.channel AND p.day = r.air_date)
      GROUP BY r.channel`,
    [today, CATCH_UP_DAYS, since],
  );
  return {
    ready: rows.filter((r) => r.ok).map((r) => ({ channel: r.channel, days: r.days })),
    waiting: rows.filter((r) => !r.ok).map((r) => r.channel),
  };
}

/**
 * Run the check. `push` moves a record (and the rest of its channel) to a
 * day — the calendar's own move, handed in by the server.
 */
export async function checkPosts(push: Push, now: Date = new Date()): Promise<CheckResult> {
  const today = dateIn(ORG_TZ, now);
  const result: CheckResult = { day: shiftDate(today, -1), checked: [], waiting: [], posted: [], missed: [] };
  // Late-night uploads take a while to reach the feed: judge after 1 AM.
  const since = instantIn(today, "01:00", ORG_TZ);
  if (!since || now < since) return result;
  const { ready, waiting } = await daysToJudge(today, since);
  result.waiting = waiting;
  for (const { channel, days } of ready) await judgeChannel(channel, days, today, push, result);
  return result;
}

/** Which of a day's videos went up: matched against the channel's uploads since the day before. */
async function judgeDay(channel: string, day: string): Promise<{ posted: Map<number, string>; missed: number[] }> {
  const { rows: due } = await pool.query<{ id: number; title: string | null; code: string | null }>(
    `SELECT id, title, code FROM records
      WHERE channel = $1 AND air_date = $2::date AND batch_no IS NULL AND kind = 'assignment'
        AND status <> 'removed' AND paused_at IS NULL AND uploaded_at IS NULL
      ORDER BY id`,
    [channel, day],
  );
  // Uploads that could be these: from the day before (posted early) to now, not already claimed.
  const { rows: ups } = await pool.query<{ video_id: string; title: string; day: string }>(
    `SELECT u.video_id, u.title, to_char(u.published_at AT TIME ZONE '${ORG_TZ}', 'YYYY-MM-DD') AS day
       FROM uploads u
      WHERE u.channel = $1 AND u.published_at >= $2 AND u.url NOT LIKE '%/shorts/%'
        AND NOT EXISTS (SELECT 1 FROM records r WHERE r.posted_video_id = u.video_id)
      ORDER BY u.published_at`,
    [channel, instantIn(shiftDate(day, -1), "00:00", ORG_TZ)],
  );
  // The channel's other scheduled videos: an upload that's clearly one of them isn't a stand-in for these.
  const { rows: others } = await pool.query<{ title: string }>(
    `SELECT title FROM records WHERE channel = $1 AND air_date <> $2::date AND batch_no IS NULL AND status <> 'removed'
       AND uploaded_at IS NULL AND title IS NOT NULL AND air_date >= $2::date - 3`,
    [channel, day],
  );
  const candidates: Uploaded[] = ups
    .filter((u) => {
      const clear = due.some((d) => titleOverlap(d.title ?? "", u.title) >= 0.5);
      if (clear) return true;
      // Only an upload from the day itself (or later) can stand in for a retitled video.
      return u.day >= day && !others.some((o) => titleOverlap(o.title, u.title) >= 0.5);
    })
    .map((u) => ({ videoId: u.video_id, title: u.title }));
  return matchPosts(due.map((d) => ({ id: Number(d.id), title: d.title ?? d.code ?? "" })), candidates);
}

/**
 * A channel's days, oldest first. What went up on each is cleared first; then
 * the oldest video that didn't is pushed to today, and everything after it on
 * the channel (later missed ones included, not ones already up) moves the
 * same number of days — what a check run every day would have done, in one
 * move. A second video missed the oldest day moves itself only.
 */
async function judgeChannel(channel: string, days: string[], today: string, push: Push, result: CheckResult): Promise<void> {
  const missed: Array<{ day: string; id: number }> = [];
  for (const day of days) {
    const match = await judgeDay(channel, day);
    for (const [recordId, videoId] of match.posted) {
      await setUploaded(recordId, true);
      await pool.query("UPDATE records SET posted_video_id = $2 WHERE id = $1", [recordId, videoId]);
      result.posted.push({ recordId, videoId });
    }
    missed.push(...match.missed.map((id) => ({ day, id })));
    await pool.query(
      `INSERT INTO post_checks (channel, day, posted, missed) VALUES ($1, $2, $3, $4) ON CONFLICT (channel, day) DO NOTHING`,
      [channel, day, match.posted.size, match.missed.length],
    );
  }
  result.checked.push(channel);
  const day = missed[0]?.day;
  if (!day) return;
  // The oldest day's misses are pushed; the later ones ride along in its cascade.
  const records = (await Promise.all(missed.filter((m) => m.day === day).map((m) => getRecord(m.id)))).filter((r): r is StoredRecord => r !== null);
  let pushedOnce = false;
  for (const record of records) {
    const snaps: MoveSnapshot[] = await snapshotMoves([record.id]);
    let moved = 0;
    if (!pushedOnce) {
      // Everything after it on the channel goes too, remembered so Undo can put it all back.
      const later = await pool.query<{ id: number }>(
        `SELECT id FROM records WHERE channel = $1 AND batch_no IS NULL AND paused_at IS NULL AND status IN ('open', 'done')
           AND air_date > $2::date AND id <> $3`,
        [channel, day, record.id],
      );
      snaps.push(...(await snapshotMoves(later.rows.map((r) => r.id))));
      const res = await push(record, today, false, day);
      if (!res.ok) continue;
      moved = res.moved;
      pushedOnce = true;
    } else {
      // A second video missed the same day moves itself only: the channel already moved.
      const res = await push(record, today, true, day);
      if (!res.ok) continue;
    }
    const { rows } = await pool.query<{ id: number; at: Date }>(
      `INSERT INTO missed_posts (record_id, channel, day, pushed_to, moved, snapshot) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (record_id, day) DO NOTHING RETURNING id, at`,
      [record.id, channel, day, today, moved, JSON.stringify(snaps)],
    );
    if (rows[0]) {
      result.missed.push({ id: Number(rows[0].id), recordId: record.id, channel, day, pushedTo: today, moved, at: rows[0].at, undoneAt: null });
    }
  }
}

/** Recent pushes, newest first — the bell and the record page read these. */
export async function listMissed(opts: { days?: number; recordId?: number } = {}): Promise<MissedPost[]> {
  const { rows } = await pool.query(
    `SELECT id, record_id, channel, to_char(day, 'YYYY-MM-DD') AS day, to_char(pushed_to, 'YYYY-MM-DD') AS pushed_to, moved, at, undone_at
       FROM missed_posts WHERE at > now() - make_interval(days => $1) ${opts.recordId ? "AND record_id = $2" : ""}
      ORDER BY at DESC LIMIT 60`,
    opts.recordId ? [opts.days ?? 30, opts.recordId] : [opts.days ?? 30],
  );
  return rows.map((r) => ({
    id: Number(r.id), recordId: Number(r.record_id), channel: r.channel, day: r.day, pushedTo: r.pushed_to, moved: Number(r.moved), at: r.at, undoneAt: r.undone_at,
  }));
}

/** It was posted after all: put the schedule back as it was, and mark it uploaded. */
export async function undoMissed(id: number, restore: (snaps: MoveSnapshot[]) => Promise<void>): Promise<number | null> {
  const { rows } = await pool.query<{ record_id: number; snapshot: MoveSnapshot[] }>(
    "UPDATE missed_posts SET undone_at = now() WHERE id = $1 AND undone_at IS NULL RETURNING record_id, snapshot",
    [id],
  );
  const row = rows[0];
  if (!row) return null;
  // JSON dates come back as strings.
  const snaps = row.snapshot.map((s) => ({
    ...s,
    voDue: s.voDue ? new Date(s.voDue) : null,
    deadline: s.deadline ? new Date(s.deadline) : null,
    scriptDue: s.scriptDue ? new Date(s.scriptDue) : null,
  }));
  await restore(snaps);
  await setUploaded(Number(row.record_id), true);
  return Number(row.record_id);
}

/** "X · Specular Anime — wasn't posted 9/29. Pushed to 9/30, with 3 later videos a day later too." */
export function missedLine(m: MissedPost, title: string, usDate: (d: string) => string): string {
  const days = Math.round((Date.parse(`${m.pushedTo}T12:00:00Z`) - Date.parse(`${m.day}T12:00:00Z`)) / 86_400_000);
  const later = days === 1 ? "a day later" : `${days} days later`;
  return `**${title}** · ${m.channel} — wasn't posted ${usDate(m.day)}. Pushed to ${usDate(m.pushedTo)}${
    m.moved ? `, with ${m.moved} later video${m.moved === 1 ? "" : "s"} ${later} too` : ""
  }.`;
}

