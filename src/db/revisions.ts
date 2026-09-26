import { pool } from "./pool.js";
import type { PastVideo, RevComment, ScoreBreakdown } from "../revisions/score.js";

export interface RevisionReview {
  recordId: number;
  channel: string | null;
  video: string;
  title: string;
  version: number | null;
  versions: number;
  comments: RevComment[];
  source: string;
  summary: string;
  summaryBy: string;
  ownSummary: string | null;
  ownScore: number | null;
  autoScore: number;
  score: number;
  breakdown: ScoreBreakdown;
  summarizedAt: Date;
}

function row(r: Record<string, unknown>): RevisionReview {
  return {
    recordId: Number(r.record_id),
    channel: (r.channel as string | null) ?? null,
    video: r.video as string,
    title: r.title as string,
    version: (r.version as number | null) ?? null,
    versions: r.versions as number,
    comments: r.comments as RevComment[],
    source: r.source as string,
    summary: r.summary as string,
    summaryBy: r.summary_by as string,
    ownSummary: (r.own_summary as string | null) ?? null,
    ownScore: r.own_score === null ? null : Number(r.own_score),
    autoScore: Number(r.auto_score),
    score: Number(r.score),
    breakdown: r.breakdown as ScoreBreakdown,
    summarizedAt: r.summarized_at as Date,
  };
}

/** The versions of one video share a key: its code, or its title without the version. */
export function videoKey(code: string | null, title: string): string {
  if (code) return code.toUpperCase();
  return title
    .toLowerCase()
    .replace(/\bv(?:er|ersion)?\.?\s*\d{1,2}\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export async function getReview(recordId: number): Promise<RevisionReview | null> {
  const { rows } = await pool.query("SELECT * FROM revision_reviews WHERE record_id = $1", [recordId]);
  return rows[0] ? row(rows[0]) : null;
}

/** Scores for many revisions at once, for their cards. */
export async function scoresFor(ids: number[]): Promise<Map<number, number>> {
  if (!ids.length) return new Map();
  const { rows } = await pool.query<{ record_id: string; score: string }>(
    "SELECT record_id, score FROM revision_reviews WHERE record_id = ANY($1::bigint[])",
    [ids],
  );
  return new Map(rows.map((r) => [Number(r.record_id), Number(r.score)]));
}

export async function saveReview(r: Omit<RevisionReview, "summarizedAt">): Promise<void> {
  await pool.query(
    `INSERT INTO revision_reviews (record_id, channel, video, title, version, versions, comments, source, summary, summary_by, own_summary, own_score, auto_score, score, breakdown)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     ON CONFLICT (record_id) DO UPDATE SET channel = EXCLUDED.channel, video = EXCLUDED.video, title = EXCLUDED.title,
       version = EXCLUDED.version, versions = EXCLUDED.versions, comments = EXCLUDED.comments, source = EXCLUDED.source,
       summary = EXCLUDED.summary, summary_by = EXCLUDED.summary_by, own_summary = EXCLUDED.own_summary, own_score = EXCLUDED.own_score,
       auto_score = EXCLUDED.auto_score, score = EXCLUDED.score, breakdown = EXCLUDED.breakdown, summarized_at = now()`,
    [
      r.recordId, r.channel, r.video, r.title, r.version, r.versions, JSON.stringify(r.comments), r.source, r.summary, r.summaryBy,
      r.ownSummary, r.ownScore, r.autoScore, r.score, JSON.stringify(r.breakdown),
    ],
  );
}

/** The channel's earlier videos' notes, newest first: one entry a video (its latest review), not this one. */
export async function pastForChannel(channel: string | null, video: string, before: Date = new Date()): Promise<PastVideo[]> {
  if (!channel) return [];
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (video) * FROM revision_reviews
      WHERE channel = $1 AND video <> $2 AND summarized_at <= $3
      ORDER BY video, summarized_at DESC`,
    [channel, video, before],
  );
  return rows
    .map(row)
    .sort((a, b) => b.summarizedAt.getTime() - a.summarizedAt.getTime())
    .map((r) => ({
      title: r.title,
      themes: [...new Set(r.breakdown.themes?.map((t) => t.id) ?? [])].filter((t) => t !== "other"),
      comments: r.comments.map((c) => c.text),
    }));
}

/** Every reviewed video, a point each (its latest version's score), oldest first. */
export async function revisionHistory(): Promise<Array<RevisionReview & { at: Date }>> {
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (rr.channel, rr.video) rr.*, r.created_at AS first_at
       FROM revision_reviews rr JOIN records r ON r.id = rr.record_id
      ORDER BY rr.channel, rr.video, rr.version DESC NULLS LAST, rr.summarized_at DESC`,
  );
  // A video sits on the timeline where it first came in for review.
  const firsts = await pool.query<{ video: string; channel: string | null; at: Date }>(
    `SELECT rr.video, rr.channel, MIN(r.created_at) AS at FROM revision_reviews rr JOIN records r ON r.id = rr.record_id GROUP BY rr.video, rr.channel`,
  );
  const at = new Map(firsts.rows.map((f) => [`${f.channel}|${f.video}`, f.at]));
  return rows
    .map((r) => ({ ...row(r), at: at.get(`${r.channel}|${r.video}`) ?? (r.first_at as Date) }))
    .sort((a, b) => a.at.getTime() - b.at.getTime());
}

export async function channelMarks(): Promise<Map<string, "flag" | "trophy">> {
  const { rows } = await pool.query<{ channel: string; mark: "flag" | "trophy" }>("SELECT channel, mark FROM channel_marks");
  return new Map(rows.map((r) => [r.channel, r.mark]));
}

export async function setChannelMark(channel: string, mark: "flag" | "trophy" | null): Promise<void> {
  if (!mark) await pool.query("DELETE FROM channel_marks WHERE channel = $1", [channel]);
  else {
    await pool.query(
      "INSERT INTO channel_marks (channel, mark) VALUES ($1, $2) ON CONFLICT (channel) DO UPDATE SET mark = EXCLUDED.mark, marked_at = now()",
      [channel, mark],
    );
  }
}
