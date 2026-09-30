/**
 * The daily posting check. Once a day, as soon as every channel can be seen
 * clearly, each video scheduled to air yesterday is checked against what its
 * channel actually uploaded:
 *
 *   went up     it's marked uploaded (cleared), with the video it matched
 *   didn't      it's pushed to today and the rest of the channel's schedule
 *               moves a day with it — the same cascade as a calendar drag —
 *               and you're told, with a way to put it back
 *
 * "Seen clearly" is per channel: its YouTube link resolved, and read without
 * an error after 1 AM ET (so anything posted late last night has reached the
 * feed). A channel that can't be read is left alone and tried again next
 * hour, never pushed on a guess. Each channel's day is judged once. Daily
 * batches (Bits, Reading, the Specular movie) aren't checked: they're their
 * own day's work. Only yesterday is ever judged, so switching this on doesn't
 * push weeks of history.
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

export interface CheckResult {
  day: string;
  checked: string[];
  waiting: string[];
  posted: Array<{ recordId: number; videoId: string }>;
  missed: MissedPost[];
}

/** Channels to judge for a day: linked, read cleanly since `since`, with something scheduled, not judged yet. */
async function ready(day: string, since: Date): Promise<{ ready: string[]; waiting: string[] }> {
  const { rows } = await pool.query<{ channel: string; ok: boolean }>(
    `SELECT DISTINCT r.channel,
            (y.youtube_id IS NOT NULL AND y.error IS NULL AND y.checked_at >= $2) AS ok
       FROM records r
       JOIN youtube_channels y ON y.channel = r.channel
      WHERE r.air_date = $1::date AND r.batch_no IS NULL AND r.kind = 'assignment'
        AND r.status <> 'removed' AND r.paused_at IS NULL AND r.uploaded_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM post_checks p WHERE p.channel = r.channel AND p.day = $1::date)`,
    [day, since],
  );
  return { ready: rows.filter((r) => r.ok).map((r) => r.channel), waiting: rows.filter((r) => !r.ok).map((r) => r.channel) };
}

/**
 * Run the check for yesterday. `push` moves a record (and the rest of its
 * channel) to a day — the calendar's own move, handed in by the server.
 */
export async function checkPosts(
  push: (record: StoredRecord, to: string, alone: boolean) => Promise<{ ok: boolean; moved: number }>,
  now: Date = new Date(),
): Promise<CheckResult> {
  const today = dateIn(ORG_TZ, now);
  const day = shiftDate(today, -1);
  const result: CheckResult = { day, checked: [], waiting: [], posted: [], missed: [] };
  // Late-night uploads take a while to reach the feed: judge after 1 AM.
  const since = instantIn(today, "01:00", ORG_TZ);
  if (!since || now < since) return result;
  const { ready: channels, waiting } = await ready(day, since);
  result.waiting = waiting;
  for (const channel of channels) {
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
    const match = matchPosts(due.map((d) => ({ id: Number(d.id), title: d.title ?? d.code ?? "" })), candidates);
    for (const [recordId, videoId] of match.posted) {
      await setUploaded(recordId, true);
      await pool.query("UPDATE records SET posted_video_id = $2 WHERE id = $1", [recordId, videoId]);
      result.posted.push({ recordId, videoId });
    }
    // Missed: push the first to today; the rest of the channel (the others missed included) follows.
    const missedRecords = (await Promise.all(match.missed.map((id) => getRecord(id)))).filter((r): r is StoredRecord => r !== null);
    let pushedOnce = false;
    for (const record of missedRecords) {
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
        const res = await push(record, today, false);
        if (!res.ok) continue;
        moved = res.moved;
        pushedOnce = true;
      } else {
        // A second video missed the same day moves itself only: the channel already moved.
        const res = await push(record, today, true);
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
    await pool.query(
      `INSERT INTO post_checks (channel, day, posted, missed) VALUES ($1, $2, $3, $4) ON CONFLICT (channel, day) DO NOTHING`,
      [channel, day, match.posted.size, match.missed.length],
    );
    result.checked.push(channel);
  }
  return result;
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

/** "Not posted: X (Specular Anime, due 9/29) — pushed to 9/30, and 3 later videos with it." */
export function missedLine(m: MissedPost, title: string, usDate: (d: string) => string): string {
  return `**${title}** · ${m.channel} — wasn't posted ${usDate(m.day)}. Pushed to ${usDate(m.pushedTo)}${
    m.moved ? `, with ${m.moved} later video${m.moved === 1 ? "" : "s"} a day later too` : ""
  }.`;
}

