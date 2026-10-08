/**
 * The Bits Idea Feed, stored: the feeds watched, every source post found, each
 * analysis run on it, what a person decided, and the ideas approved from it.
 * See src/ideas for how posts are read and judged.
 */
import { pool } from "./pool.js";
import { ORG_TZ, dateIn } from "../parse/derive.js";
import { ANALYSIS_VERSION, bitsChannels, type RawSource } from "../ideas/types.js";
import type { HistoryItem } from "../ideas/similar.js";
import type { ScoreBreakdown, SimilarMatch } from "../ideas/score.js";
import { normaliseText } from "../ideas/html.js";
import { createHash } from "node:crypto";
import { WEIGHT_MINUTES } from "../ideas/pace.js";

// ── feeds ─────────────────────────────────────────────────────────────────

export interface Feed {
  id: number;
  provider: string;
  query: string;
  channels: string[];
  enabled: boolean;
  weight: number;
  exclusions: string[];
  minNotes: number;
  cursor: { newest?: number };
  pollMinutes: number;
  nextPollAt: Date;
  lastAttemptAt: Date | null;
  lastSuccessAt: Date | null;
  lastError: string | null;
  lastPostAt: Date | null;
  found24h: number;
  found7d: number;
}

const feedOf = (r: Record<string, unknown>): Feed => ({
  id: Number(r.id), provider: String(r.provider), query: String(r.query), channels: (r.channels as string[]) ?? [], enabled: Boolean(r.enabled),
  weight: Number(r.weight), exclusions: (r.exclusions as string[]) ?? [], minNotes: Number(r.min_notes), cursor: (r.cursor as Feed["cursor"]) ?? {},
  pollMinutes: Number(r.poll_minutes), nextPollAt: r.next_poll_at as Date, lastAttemptAt: (r.last_attempt_at as Date) ?? null,
  lastSuccessAt: (r.last_success_at as Date) ?? null, lastError: (r.last_error as string) ?? null, lastPostAt: (r.last_post_at as Date) ?? null,
  found24h: Number(r.found_24h ?? 0), found7d: Number(r.found_7d ?? 0),
});

const FEED_SELECT = `SELECT f.*,
  (SELECT COUNT(*) FROM idea_source_hits h WHERE h.feed_id = f.id AND h.found_at > now() - interval '24 hours') AS found_24h,
  (SELECT COUNT(*) FROM idea_source_hits h WHERE h.feed_id = f.id AND h.found_at > now() - interval '7 days') AS found_7d
  FROM idea_feeds f`;

export async function listFeeds(): Promise<Feed[]> {
  const { rows } = await pool.query(`${FEED_SELECT} ORDER BY f.channels[1] NULLS LAST, lower(f.query)`);
  return rows.map(feedOf);
}
/** Enabled feeds due a read, the most overdue first. */
export async function dueFeeds(limit = 6): Promise<Feed[]> {
  const { rows } = await pool.query(`${FEED_SELECT} WHERE f.enabled AND f.next_poll_at <= now() ORDER BY f.next_poll_at LIMIT $1`, [limit]);
  return rows.map(feedOf);
}


export async function addFeed(f: { query: string; channels: string[]; weight: number; provider?: string }): Promise<number | null> {
  const query = f.query.trim().replace(/^#/, "").replace(/\s+/g, " ").slice(0, 120);
  if (!query) return null;
  const weight = Math.max(1, Math.min(5, Math.round(f.weight) || 3));
  const { rows } = await pool.query(
    `INSERT INTO idea_feeds (provider, query, channels, weight, poll_minutes) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT DO NOTHING RETURNING id`,
    [f.provider ?? "tumblr", query, f.channels, weight, WEIGHT_MINUTES[weight]],
  );
  return rows[0] ? Number(rows[0].id) : null;
}

export async function updateFeed(id: number, f: { channels: string[]; enabled: boolean; weight: number; exclusions: string[]; minNotes: number }): Promise<void> {
  const weight = Math.max(1, Math.min(5, Math.round(f.weight) || 3));
  await pool.query(
    `UPDATE idea_feeds SET channels = $2, enabled = $3, weight = $4, exclusions = $5, min_notes = $6,
       poll_minutes = CASE WHEN weight <> $4 THEN $7 ELSE poll_minutes END,
       next_poll_at = CASE WHEN $3 AND NOT enabled THEN now() ELSE next_poll_at END
     WHERE id = $1`,
    [id, f.channels, f.enabled, weight, f.exclusions.slice(0, 40), Math.max(0, Math.min(1_000_000, Math.round(f.minNotes) || 0)), WEIGHT_MINUTES[weight]],
  );
}
export async function deleteFeed(id: number): Promise<void> {
  await pool.query("DELETE FROM idea_feeds WHERE id = $1", [id]);
}
export async function pollFeedNow(id: number): Promise<void> {
  await pool.query("UPDATE idea_feeds SET next_poll_at = now() WHERE id = $1", [id]);
}

/** After a read: on success the cursor moves on; on failure it stays where it was. */
export async function feedRead(
  id: number,
  r: { ok: true; cursor: Feed["cursor"]; lastPostAt: Date | null; pollMinutes: number } | { ok: false; error: string; retryMinutes: number },
): Promise<void> {
  if (r.ok) {
    await pool.query(
      `UPDATE idea_feeds SET cursor = $2, last_post_at = GREATEST(last_post_at, $3), poll_minutes = $4,
         last_attempt_at = now(), last_success_at = now(), last_error = NULL, next_poll_at = now() + make_interval(mins => $4)
       WHERE id = $1`,
      [id, JSON.stringify(r.cursor), r.lastPostAt, r.pollMinutes],
    );
  } else {
    await pool.query(
      `UPDATE idea_feeds SET last_attempt_at = now(), last_error = $2, next_poll_at = now() + make_interval(mins => $3) WHERE id = $1`,
      [id, r.error.slice(0, 500), r.retryMinutes],
    );
  }
}

// ── sources ───────────────────────────────────────────────────────────────

export const textHash = (s: string) => {
  const n = normaliseText(s);
  return n.length >= 80 ? createHash("sha1").update(n).digest("hex") : null;
};

/**
 * Store a post as found. A post already stored gets its engagement and the
 * channels of the feed that found it again; nothing it had is lost.
 */
export async function upsertSource(s: RawSource, via: { feed?: Feed; manual?: boolean }): Promise<{ id: number; isNew: boolean }> {
  const channels = via.feed?.channels ?? [];
  const { rows } = await pool.query(
    `INSERT INTO idea_sources (provider, external_id, url, author, author_url, posted_at, post_type, title, body, media, tags,
       notes, likes, reblogs, replies, engagement_at, root_key, is_reblog, added_text, text_hash, channels, discovered_via, raw)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,now(),$16,$17,$18,$19,$20,$21,$22)
     ON CONFLICT (provider, external_id) DO UPDATE SET
       notes = GREATEST(idea_sources.notes, EXCLUDED.notes),
       engagement_at = CASE WHEN EXCLUDED.notes IS DISTINCT FROM idea_sources.notes THEN now() ELSE idea_sources.engagement_at END,
       channels = ARRAY(SELECT DISTINCT unnest(idea_sources.channels || EXCLUDED.channels)),
       updated_at = now()
     RETURNING id, (xmax = 0) AS inserted`,
    [
      s.provider, s.externalId, s.url, s.author, s.authorUrl, s.postedAt, s.postType, s.title, s.body, JSON.stringify(s.media), s.tags,
      s.notes, s.likes ?? null, s.reblogs ?? null, s.replies ?? null, s.rootKey, s.isReblog, s.addedText, textHash(s.body), channels,
      via.manual ? "manual" : "feed", JSON.stringify(s.raw ?? null),
    ],
  );
  const id = Number(rows[0].id);
  if (via.feed) {
    await pool.query("INSERT INTO idea_source_hits (source_id, feed_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [id, via.feed.id]);
  }
  return { id, isNew: Boolean(rows[0].inserted) };
}

/** An earlier source with the same original post, or the same words: what a new one duplicates. */
export async function findDuplicate(id: number, rootKey: string | null, hash: string | null): Promise<number | null> {
  const { rows } = await pool.query(
    `SELECT id FROM idea_sources WHERE id <> $1 AND id < $1 AND ((root_key IS NOT NULL AND root_key = $2) OR (text_hash IS NOT NULL AND text_hash = $3))
      ORDER BY id LIMIT 1`,
    [id, rootKey, hash],
  );
  return rows[0] ? Number(rows[0].id) : null;
}

export async function setFiltered(id: number, reason: string): Promise<void> {
  await pool.query("UPDATE idea_sources SET stage = 'filtered', filter_reason = $2, pending = NULL, updated_at = now() WHERE id = $1", [id, reason]);
}
export async function setDuplicate(id: number, of: number): Promise<void> {
  await pool.query(
    "UPDATE idea_sources SET duplicate_of = $2, decision = 'archived', decided_at = now(), pending = NULL, filter_reason = 'Same post as one already found', updated_at = now() WHERE id = $1",
    [id, of],
  );
}
/** Send posts (back) through the analysis: the quick look, or straight to the full read. */
export async function queueSources(ids: number[], depth: "triage" | "full"): Promise<number> {
  if (!ids.length) return 0;
  const { rowCount } = await pool.query(
    `UPDATE idea_sources SET pending = $2, processing_at = NULL, attempts = 0, error = NULL,
       stage = CASE WHEN stage IN ('filtered', 'error') THEN 'new' ELSE stage END, updated_at = now()
     WHERE id = ANY($1::bigint[]) AND (decision IS NULL OR decision IN ('saved', 'rejected'))`,
    [ids, depth],
  );
  return rowCount ?? 0;
}

export interface SourceRow {
  id: number;
  provider: string;
  externalId: string;
  url: string;
  author: string | null;
  authorUrl: string | null;
  postedAt: Date | null;
  ingestedAt: Date;
  postType: string | null;
  title: string | null;
  body: string;
  media: RawSource["media"];
  tags: string[];
  notes: number | null;
  likes: number | null;
  reblogs: number | null;
  replies: number | null;
  engagementAt: Date | null;
  rootKey: string | null;
  isReblog: boolean;
  addedText: string | null;
  channels: string[];
  discoveredVia: string;
  stage: string;
  pending: string | null;
  processingAt: Date | null;
  attempts: number;
  filterReason: string | null;
  error: string | null;
  duplicateOf: number | null;
  depth: string | null;
  score: number | null;
  channel: string | null;
  classification: string | null;
  classificationManual: boolean;
  canonCheck: boolean;
  canonVerifiedAt: Date | null;
  similarity: number | null;
  decision: string | null;
  decidedAt: Date | null;
  rejectReason: string | null;
  rejectNote: string | null;
  /** The latest analysis. */
  analysis: {
    id: number;
    depth: string;
    version: string;
    model: string | null;
    result: Record<string, unknown> | null;
    breakdown: ScoreBreakdown | null;
    similarity: SimilarMatch[] | null;
    similarityStatus: string;
    at: Date;
  } | null;
  ideaId: number | null;
  ideaStatus: string | null;
}

const sourceOf = (r: Record<string, unknown>): SourceRow => ({
  id: Number(r.id), provider: String(r.provider), externalId: String(r.external_id), url: String(r.url ?? ""), author: (r.author as string) ?? null,
  authorUrl: (r.author_url as string) ?? null, postedAt: (r.posted_at as Date) ?? null, ingestedAt: r.ingested_at as Date, postType: (r.post_type as string) ?? null,
  title: (r.title as string) ?? null, body: String(r.body ?? ""), media: (r.media as RawSource["media"]) ?? [], tags: (r.tags as string[]) ?? [],
  notes: r.notes === null || r.notes === undefined ? null : Number(r.notes), likes: r.likes == null ? null : Number(r.likes),
  reblogs: r.reblogs == null ? null : Number(r.reblogs), replies: r.replies == null ? null : Number(r.replies), engagementAt: (r.engagement_at as Date) ?? null,
  rootKey: (r.root_key as string) ?? null, isReblog: Boolean(r.is_reblog), addedText: (r.added_text as string) ?? null, channels: (r.channels as string[]) ?? [],
  discoveredVia: String(r.discovered_via ?? "feed"), stage: String(r.stage), pending: (r.pending as string) ?? null, processingAt: (r.processing_at as Date) ?? null,
  attempts: Number(r.attempts ?? 0), filterReason: (r.filter_reason as string) ?? null, error: (r.error as string) ?? null,
  duplicateOf: r.duplicate_of == null ? null : Number(r.duplicate_of), depth: (r.depth as string) ?? null, score: r.score == null ? null : Number(r.score),
  channel: (r.channel as string) ?? null, classification: (r.classification as string) ?? null, classificationManual: Boolean(r.classification_manual),
  canonCheck: Boolean(r.canon_check), canonVerifiedAt: (r.canon_verified_at as Date) ?? null, similarity: r.similarity == null ? null : Number(r.similarity),
  decision: (r.decision as string) ?? null, decidedAt: (r.decided_at as Date) ?? null, rejectReason: (r.reject_reason as string) ?? null,
  rejectNote: (r.reject_note as string) ?? null,
  analysis: r.a_id
    ? {
        id: Number(r.a_id), depth: String(r.a_depth), version: String(r.a_version), model: (r.a_model as string) ?? null,
        result: (r.a_result as Record<string, unknown>) ?? null, breakdown: (r.a_breakdown as ScoreBreakdown) ?? null,
        similarity: (r.a_similarity as SimilarMatch[]) ?? null, similarityStatus: String(r.a_similarity_status ?? "none"), at: r.a_at as Date,
      }
    : null,
  ideaId: r.idea_id == null ? null : Number(r.idea_id),
  ideaStatus: (r.idea_status as string) ?? null,
});

const SOURCE_SELECT = `SELECT s.*, a.id AS a_id, a.depth AS a_depth, a.version AS a_version, a.model AS a_model, a.result AS a_result,
    a.breakdown AS a_breakdown, a.similarity AS a_similarity, a.similarity_status AS a_similarity_status, a.created_at AS a_at,
    i.id AS idea_id, i.status AS idea_status
  FROM idea_sources s
  LEFT JOIN idea_analyses a ON a.id = s.analysis_id
  LEFT JOIN ideas i ON i.source_id = s.id`;

export async function getSource(id: number): Promise<SourceRow | null> {
  const { rows } = await pool.query(`${SOURCE_SELECT} WHERE s.id = $1`, [id]);
  return rows[0] ? sourceOf(rows[0]) : null;
}

/**
 * Take the next posts waiting for a pass, so no two workers take the same
 * one. A post taken but never finished (a restart mid-analysis) is taken
 * again after twenty minutes.
 */
export async function claimPending(depth: "triage" | "full", limit: number): Promise<SourceRow[]> {
  const order = depth === "triage" ? "discovered_via = 'manual' DESC, ingested_at DESC" : "discovered_via = 'manual' DESC, score DESC NULLS LAST, ingested_at DESC";
  const { rows } = await pool.query(
    `UPDATE idea_sources SET processing_at = now() WHERE id IN (
       SELECT id FROM idea_sources
        WHERE pending = $1 AND (processing_at IS NULL OR processing_at < now() - interval '20 minutes')
        ORDER BY ${order} LIMIT $2 FOR UPDATE SKIP LOCKED
     ) RETURNING id`,
    [depth, limit],
  );
  if (!rows.length) return [];
  const got = await pool.query(`${SOURCE_SELECT} WHERE s.id = ANY($1::bigint[])`, [rows.map((r) => r.id)]);
  return got.rows.map(sourceOf);
}

/** Keep an analysis, and what it says on the source for ranking — and what comes next for it. */
export async function saveAnalysis(
  sourceId: number,
  a: {
    depth: "triage" | "full";
    model: string;
    result: unknown;
    score: number;
    breakdown: ScoreBreakdown | null;
    similarity: SimilarMatch[] | null;
    similarityStatus: "ok" | "unavailable" | "none";
    channel: string | null;
    classification: string | null;
    canonCheck: boolean;
    next: "full" | null;
  },
): Promise<number> {
  const { rows } = await pool.query(
    `INSERT INTO idea_analyses (source_id, depth, version, model, result, score, breakdown, similarity, similarity_status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [sourceId, a.depth, ANALYSIS_VERSION, a.model, JSON.stringify(a.result), a.score, a.breakdown ? JSON.stringify(a.breakdown) : null,
      a.similarity ? JSON.stringify(a.similarity) : null, a.similarityStatus],
  );
  const analysisId = Number(rows[0].id);
  await pool.query(
    `UPDATE idea_sources SET analysis_id = $2, depth = $3, score = $4,
       channel = COALESCE($5, channel),
       classification = CASE WHEN classification_manual THEN classification ELSE COALESCE($6, classification) END,
       canon_check = $7, similarity = $8,
       stage = CASE WHEN $3 = 'full' THEN 'analyzed' ELSE 'triaged' END,
       pending = $9, processing_at = NULL, attempts = 0, error = NULL, updated_at = now()
     WHERE id = $1`,
    [sourceId, analysisId, a.depth, a.score, a.channel, a.classification, a.canonCheck, a.breakdown?.similarity ?? null, a.next],
  );
  return analysisId;
}

/** An analysis that failed: tried again later if it might work next time (three tries), else marked with its error. */
export async function failAnalysis(sourceId: number, error: string, retryable: boolean): Promise<void> {
  await pool.query(
    `UPDATE idea_sources SET attempts = attempts + 1, processing_at = NULL, error = $2,
       stage = CASE WHEN $3 AND attempts + 1 < 3 THEN stage ELSE 'error' END,
       pending = CASE WHEN $3 AND attempts + 1 < 3 THEN pending ELSE NULL END,
       updated_at = now()
     WHERE id = $1`,
    [sourceId, error.slice(0, 500), retryable],
  );
}
/** Put a claimed post back untouched (the day's budget ran out mid-batch). */
export async function releaseClaim(ids: number[]): Promise<void> {
  if (ids.length) await pool.query("UPDATE idea_sources SET processing_at = NULL WHERE id = ANY($1::bigint[])", [ids]);
}
export async function setEngagement(id: number, e: { likes: number | null; reblogs: number | null; replies: number | null }): Promise<void> {
  await pool.query("UPDATE idea_sources SET likes = $2, reblogs = $3, replies = $4, engagement_at = now() WHERE id = $1", [id, e.likes, e.reblogs, e.replies]);
}

// ── the feed ──────────────────────────────────────────────────────────────

export const FEED_TABS = ["foryou", "new", "high", "gems", "saved", "approved", "used", "rejected"] as const;
export type FeedTab = (typeof FEED_TABS)[number];

export interface FeedFilter {
  tab: FeedTab;
  channel?: string | null;
  classification?: string | null;
  canon?: boolean;
  minScore?: number | null;
  q?: string | null;
  limit?: number;
  offset?: number;
}

const TAB_WHERE: Record<FeedTab, string> = {
  foryou: "s.decision IS NULL AND s.depth = 'full' AND s.stage = 'analyzed'",
  new: "(s.decision IS NULL OR s.decision <> 'archived')",
  high: "s.decision IS NULL AND s.depth = 'full' AND s.score >= 85",
  gems: "s.decision IS NULL AND s.depth = 'full' AND s.score >= 70 AND (COALESCE(s.notes, 0) <= 50 OR s.posted_at < now() - interval '30 days')",
  saved: "s.decision = 'saved'",
  approved: "s.decision = 'approved'",
  used: "s.decision = 'used'",
  rejected: "s.decision = 'rejected'",
};
const TAB_ORDER: Record<FeedTab, string> = {
  // Best first, fading a little with age so the feed stays fresh.
  foryou: "(s.score - LEAST(10, EXTRACT(EPOCH FROM (now() - s.ingested_at)) / 172800)) DESC, s.id DESC",
  new: "s.ingested_at DESC, s.id DESC",
  high: "s.score DESC, s.ingested_at DESC",
  gems: "s.score DESC, s.ingested_at DESC",
  saved: "s.decided_at DESC",
  approved: "s.decided_at DESC",
  used: "s.decided_at DESC",
  rejected: "s.decided_at DESC",
};

function filterSql(f: Omit<FeedFilter, "tab" | "limit" | "offset">, args: unknown[]): string {
  const arg = (v: unknown) => (args.push(v), `$${args.length}`);
  const w: string[] = [];
  if (f.channel) {
    const a = arg(f.channel);
    w.push(`(s.channel = ${a} OR (s.channel IS NULL AND ${a} = ANY(s.channels)))`);
  }
  if (f.classification) w.push(`s.classification = ${arg(f.classification)}`);
  if (f.canon) w.push("s.canon_check AND s.canon_verified_at IS NULL");
  if (f.minScore) w.push(`s.score >= ${arg(f.minScore)}`);
  if (f.q) {
    const a = arg(`%${f.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
    w.push(`(s.body ILIKE ${a} OR s.title ILIKE ${a} OR array_to_string(s.tags, ' ') ILIKE ${a} OR s.author ILIKE ${a} OR a.result::text ILIKE ${a})`);
  }
  return w.length ? ` AND ${w.join(" AND ")}` : "";
}

export async function feedSources(f: FeedFilter): Promise<{ rows: SourceRow[]; total: number }> {
  const args: unknown[] = [];
  const where = `WHERE ${TAB_WHERE[f.tab]}${filterSql(f, args)}`;
  const limit = Math.max(1, Math.min(100, f.limit ?? 30));
  const offset = Math.max(0, f.offset ?? 0);
  const [list, count] = await Promise.all([
    pool.query(`${SOURCE_SELECT} ${where} ORDER BY ${TAB_ORDER[f.tab]} LIMIT ${limit} OFFSET ${offset}`, args),
    pool.query(`SELECT COUNT(*) AS n FROM idea_sources s LEFT JOIN idea_analyses a ON a.id = s.analysis_id ${where}`, args),
  ]);
  return { rows: list.rows.map(sourceOf), total: Number(count.rows[0].n) };
}

/** How many in each tab, with the same filters. */
export async function tabCounts(f: Omit<FeedFilter, "tab">): Promise<Record<FeedTab, number>> {
  const args: unknown[] = [];
  const extra = filterSql(f, args);
  const cols = FEED_TABS.map((t) => `COUNT(*) FILTER (WHERE ${TAB_WHERE[t]}) AS ${t}`).join(", ");
  const { rows } = await pool.query(`SELECT ${cols} FROM idea_sources s LEFT JOIN idea_analyses a ON a.id = s.analysis_id WHERE true${extra}`, args);
  return Object.fromEntries(FEED_TABS.map((t) => [t, Number(rows[0][t])])) as Record<FeedTab, number>;
}

/** The last day's scan: posts read, strong candidates, high priority, still waiting. */
export async function feedPulse(): Promise<{ scanned: number; strong: number; high: number; waiting: number; errors: number; filtered: number }> {
  const { rows } = await pool.query(
    `SELECT COUNT(*) FILTER (WHERE ingested_at > now() - interval '24 hours') AS scanned,
            COUNT(*) FILTER (WHERE ingested_at > now() - interval '24 hours' AND decision IS NULL AND depth = 'full' AND score >= 75) AS strong,
            COUNT(*) FILTER (WHERE ingested_at > now() - interval '24 hours' AND decision IS NULL AND depth = 'full' AND score >= 85) AS high,
            COUNT(*) FILTER (WHERE pending IS NOT NULL) AS waiting,
            COUNT(*) FILTER (WHERE stage = 'error' AND decision IS NULL) AS errors,
            COUNT(*) FILTER (WHERE ingested_at > now() - interval '24 hours' AND stage = 'filtered') AS filtered
       FROM idea_sources`,
  );
  const r = rows[0];
  return { scanned: Number(r.scanned), strong: Number(r.strong), high: Number(r.high), waiting: Number(r.waiting), errors: Number(r.errors), filtered: Number(r.filtered) };
}

/** Strong candidates nobody has looked at yet, for the sidebar. */
export async function strongUnseen(): Promise<number> {
  const { rows } = await pool.query(
    `SELECT COUNT(*) AS n FROM idea_sources WHERE decision IS NULL AND depth = 'full' AND score >= 75 AND ingested_at > now() - interval '3 days'`,
  );
  return Number(rows[0].n);
}

// ── decisions ─────────────────────────────────────────────────────────────

async function logDecision(d: { sourceId?: number | null; ideaId?: number | null; action: string; reason?: string | null; note?: string | null; detail?: unknown }): Promise<void> {
  await pool.query("INSERT INTO idea_decisions (source_id, idea_id, action, reason, note, detail) VALUES ($1,$2,$3,$4,$5,$6)", [
    d.sourceId ?? null, d.ideaId ?? null, d.action, d.reason ?? null, d.note ?? null, d.detail === undefined ? null : JSON.stringify(d.detail),
  ]);
}

/** Save, unsave, reject or restore a source. Approving goes through approveSource. */
export async function decide(id: number, action: "save" | "unsave" | "reject" | "restore" | "used", opts: { reason?: string | null; note?: string | null } = {}): Promise<void> {
  const decision = action === "save" ? "saved" : action === "reject" ? "rejected" : action === "used" ? "used" : null;
  await pool.query(
    `UPDATE idea_sources SET decision = $2, decided_at = CASE WHEN $2::text IS NULL THEN NULL ELSE now() END,
       reject_reason = CASE WHEN $2 = 'rejected' THEN $3 ELSE NULL END, reject_note = CASE WHEN $2 = 'rejected' THEN $4 ELSE NULL END,
       updated_at = now()
     WHERE id = $1`,
    [id, decision, opts.reason ?? null, opts.note ?? null],
  );
  await logDecision({ sourceId: id, action, reason: opts.reason, note: opts.note });
}

export async function reclassify(id: number, classification: string): Promise<void> {
  await pool.query("UPDATE idea_sources SET classification = $2, classification_manual = true, updated_at = now() WHERE id = $1", [id, classification]);
  await pool.query("UPDATE ideas SET classification = $2, updated_at = now() WHERE source_id = $1", [id, classification]);
  await logDecision({ sourceId: id, action: "reclassify", reason: classification });
}
export async function verifyCanon(id: number, on: boolean): Promise<void> {
  await pool.query("UPDATE idea_sources SET canon_verified_at = CASE WHEN $2 THEN now() END, updated_at = now() WHERE id = $1", [id, on]);
  await pool.query("UPDATE ideas SET canon_verified_at = CASE WHEN $2 THEN now() END, updated_at = now() WHERE source_id = $1", [id, on]);
  await logDecision({ sourceId: id, action: on ? "verify_canon" : "unverify_canon" });
}

export interface IdeaInput {
  channel: string;
  title: string;
  premise: string;
  direction: string;
  classification: string;
  notes?: string;
}

/**
 * Approve a source: it becomes an Idea, linked to the source and the
 * analysis it came from for good. Edits made on the way are the idea's; what
 * the AI suggested stays on the analysis, so both can be compared later.
 */
export async function approveSource(id: number, input: IdeaInput, by = "owner"): Promise<number> {
  const s = await getSource(id);
  if (!s) throw new Error("No such source");
  const r = (s.analysis?.depth === "full" ? s.analysis.result : null) ?? {};
  const edited = r.suggested_title !== input.title || r.suggested_premise !== input.premise || r.suggested_direction !== input.direction;
  const { rows } = await pool.query(
    `INSERT INTO ideas (source_id, analysis_id, channel, title, premise, direction, observation, classification, canon_confidence, canon_checks,
       characters, franchises, comedy_engines, fingerprint, similarity, status, approved_at, approved_by, notes, canon_verified_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'approved',now(),$16,$17,$18)
     ON CONFLICT (source_id) WHERE source_id IS NOT NULL DO UPDATE SET
       channel = EXCLUDED.channel, title = EXCLUDED.title, premise = EXCLUDED.premise, direction = EXCLUDED.direction,
       classification = EXCLUDED.classification, notes = EXCLUDED.notes,
       status = CASE WHEN ideas.status IN ('draft', 'cancelled') THEN 'approved' ELSE ideas.status END, updated_at = now()
     RETURNING id`,
    [
      id, s.analysis?.id ?? null, input.channel, input.title, input.premise, input.direction, String(r.irreplaceable_detail ?? ""),
      input.classification, typeof r.canon_confidence === "number" ? r.canon_confidence : null, (r.canon_checks as string[]) ?? [],
      (r.characters as string[]) ?? [], (r.franchises as string[]) ?? [], (r.comedy_engines as string[]) ?? [],
      r.fingerprint ? JSON.stringify(r.fingerprint) : null, s.analysis?.similarity ? JSON.stringify(s.analysis.similarity) : null, by,
      input.notes ?? "", s.canonVerifiedAt,
    ],
  );
  const ideaId = Number(rows[0].id);
  await pool.query(
    "UPDATE idea_sources SET decision = 'approved', decided_at = now(), channel = $2, classification = $3, classification_manual = true, updated_at = now() WHERE id = $1",
    [id, input.channel, input.classification],
  );
  await logDecision({ sourceId: id, ideaId, action: edited ? "approve_edited" : "approve", detail: edited ? { title: input.title, premise: input.premise, direction: input.direction } : undefined });
  return ideaId;
}

export interface IdeaRow {
  id: number;
  sourceId: number | null;
  channel: string;
  title: string;
  premise: string;
  direction: string;
  observation: string;
  classification: string;
  canonConfidence: number | null;
  canonChecks: string[];
  canonVerifiedAt: Date | null;
  characters: string[];
  status: string;
  approvedAt: Date | null;
  sourceUrl: string | null;
  sourceAuthor: string | null;
  similarity: SimilarMatch[] | null;
  videoId: string | null;
  notes: string;
}

export async function listIdeas(opts: { channel?: string | null; statuses?: string[] } = {}): Promise<IdeaRow[]> {
  const args: unknown[] = [];
  const w: string[] = [];
  if (opts.channel) (args.push(opts.channel), w.push(`i.channel = $${args.length}`));
  if (opts.statuses?.length) (args.push(opts.statuses), w.push(`i.status = ANY($${args.length})`));
  const { rows } = await pool.query(
    `SELECT i.*, s.url AS source_url, s.author AS source_author FROM ideas i LEFT JOIN idea_sources s ON s.id = i.source_id
      ${w.length ? `WHERE ${w.join(" AND ")}` : ""} ORDER BY i.approved_at DESC NULLS LAST, i.id DESC LIMIT 300`,
    args,
  );
  return rows.map((r) => ({
    id: Number(r.id), sourceId: r.source_id == null ? null : Number(r.source_id), channel: r.channel, title: r.title, premise: r.premise, direction: r.direction,
    observation: r.observation, classification: r.classification, canonConfidence: r.canon_confidence, canonChecks: r.canon_checks ?? [],
    canonVerifiedAt: r.canon_verified_at, characters: r.characters ?? [], status: r.status, approvedAt: r.approved_at, sourceUrl: r.source_url ?? null,
    sourceAuthor: r.source_author ?? null, similarity: r.similarity, videoId: r.video_id, notes: r.notes,
  }));
}

/** Move an idea through production. Published marks its source used, so it's never recommended again. */
export async function setIdeaStatus(id: number, status: string): Promise<void> {
  const { rows } = await pool.query("UPDATE ideas SET status = $2, updated_at = now() WHERE id = $1 RETURNING source_id", [id, status]);
  const sourceId = rows[0]?.source_id;
  if (sourceId) {
    if (status === "published") await pool.query("UPDATE idea_sources SET decision = 'used', decided_at = now() WHERE id = $1", [sourceId]);
    else await pool.query("UPDATE idea_sources SET decision = 'approved' WHERE id = $1 AND decision = 'used'", [sourceId]);
  }
  await logDecision({ ideaId: id, sourceId: sourceId ?? null, action: "status", reason: status });
}

/** The idea a post (or another post of the same original) already became, if any. */
export async function usedIdeaFor(sourceId: number, rootKey: string | null): Promise<string | null> {
  const { rows } = await pool.query(
    `SELECT i.title FROM ideas i JOIN idea_sources s ON s.id = i.source_id
      WHERE i.status <> 'cancelled' AND s.id <> $1 AND ($2::text IS NOT NULL AND s.root_key = $2) LIMIT 1`,
    [sourceId, rootKey],
  );
  return rows[0]?.title ?? null;
}

// ── history, for the similarity check ─────────────────────────────────────

let historyCache: { at: number; items: HistoryItem[] } | null = null;

/**
 * Everything a new idea could repeat: every Bits Short published (read from
 * the Bits channels' uploads), every idea approved, and every source turned
 * down. Kept for ten minutes between analyses.
 */
export async function loadHistory(): Promise<HistoryItem[]> {
  if (historyCache && Date.now() - historyCache.at < 10 * 60_000) return historyCache.items;
  const [bits, ideas, rejected] = await Promise.all([
    pool.query(
      `SELECT video_id, title, channel, to_char(published_at AT TIME ZONE '${ORG_TZ}', 'YYYY-MM-DD') AS day, url FROM uploads WHERE channel = ANY($1) AND board`,
      [bitsChannels()],
    ),
    pool.query(
      `SELECT i.id, i.title, i.premise, i.fingerprint, i.channel, i.status, to_char(i.approved_at AT TIME ZONE '${ORG_TZ}', 'YYYY-MM-DD') AS day
         FROM ideas i WHERE i.status <> 'cancelled'`,
    ),
    pool.query(
      `SELECT s.id, s.channel, to_char(s.decided_at AT TIME ZONE '${ORG_TZ}', 'YYYY-MM-DD') AS day, a.result->>'suggested_title' AS title,
              a.result->>'suggested_premise' AS premise
         FROM idea_sources s JOIN idea_analyses a ON a.id = s.analysis_id
        WHERE s.decision = 'rejected' AND a.depth = 'full' AND COALESCE(a.result->>'suggested_title', '') <> ''`,
    ),
  ]);
  const flat = (f: unknown) => (f && typeof f === "object" ? Object.values(f as Record<string, unknown>).map(String).join(" · ") : "");
  const items: HistoryItem[] = [
    ...bits.rows.map((r) => ({ kind: "bit" as const, ref: `bit:${r.video_id}`, title: r.title, channel: r.channel, date: r.day, href: r.url })),
    ...ideas.rows.map((r) => ({
      kind: "idea" as const, ref: `idea:${r.id}`, title: r.title, premise: r.premise, fingerprint: flat(r.fingerprint), channel: r.channel,
      // An idea not yet published is in the pipeline: as close as it gets.
      date: r.status === "published" ? r.day : null, href: `/ideas?tab=approved#i-${r.id}`,
    })),
    ...rejected.rows.map((r) => ({ kind: "rejected" as const, ref: `src:${r.id}`, title: r.title, premise: r.premise, channel: r.channel, date: r.day, href: `/ideas?tab=rejected#s-${r.id}` })),
  ];
  historyCache = { at: Date.now(), items };
  return items;
}
export const forgetHistory = () => {
  historyCache = null;
};

// ── usage and settings ────────────────────────────────────────────────────

export async function addUsage(kind: string, u: { calls?: number; items?: number; input?: number; output?: number; cacheRead?: number }): Promise<void> {
  await pool.query(
    `INSERT INTO idea_usage (day, kind, calls, items, input_tokens, output_tokens, cache_read_tokens) VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (day, kind) DO UPDATE SET calls = idea_usage.calls + EXCLUDED.calls, items = idea_usage.items + EXCLUDED.items,
       input_tokens = idea_usage.input_tokens + EXCLUDED.input_tokens, output_tokens = idea_usage.output_tokens + EXCLUDED.output_tokens,
       cache_read_tokens = idea_usage.cache_read_tokens + EXCLUDED.cache_read_tokens`,
    [dateIn(ORG_TZ), kind, u.calls ?? 0, u.items ?? 0, u.input ?? 0, u.output ?? 0, u.cacheRead ?? 0],
  );
}

export interface UsageRow { kind: string; calls: number; items: number; input: number; output: number; cacheRead: number }
export async function usageOn(day = dateIn(ORG_TZ)): Promise<Map<string, UsageRow>> {
  const { rows } = await pool.query("SELECT * FROM idea_usage WHERE day = $1", [day]);
  return new Map(rows.map((r) => [r.kind, { kind: r.kind, calls: Number(r.calls), items: Number(r.items), input: Number(r.input_tokens), output: Number(r.output_tokens), cacheRead: Number(r.cache_read_tokens) }]));
}

export interface IdeaSettings {
  polling: boolean;
  ai: boolean;
  triageCap: number;
  fullCap: number;
  fullThreshold: number;
  tumblrDailyCap: number;
}
export const DEFAULT_SETTINGS: IdeaSettings = { polling: true, ai: true, triageCap: 600, fullCap: 60, fullThreshold: 0.55, tumblrDailyCap: 4000 };
type NumericSetting = "triageCap" | "fullCap" | "fullThreshold" | "tumblrDailyCap";
/** The range each number may take, wherever it's set: Idea Feed → Sources, or Settings → Limits. */
export const IDEA_BOUNDS: Record<NumericSetting, { min: number; max: number }> = {
  triageCap: { min: 0, max: 20000 },
  fullCap: { min: 0, max: 2000 },
  fullThreshold: { min: 0, max: 1 },
  // Tumblr allows 5,000 calls a day; a little is left over for reading a pasted link.
  tumblrDailyCap: { min: 0, max: 4900 },
};
/** A number as typed into a form, kept in its range; the current value when it's empty or not a number. */
export function ideaSetting(k: NumericSetting, raw: unknown, current: number): number {
  const text = String(raw ?? "").trim();
  const v = Number(text);
  if (!text || !Number.isFinite(v)) return current;
  return Math.max(IDEA_BOUNDS[k].min, Math.min(IDEA_BOUNDS[k].max, v));
}

export async function getSettings(): Promise<IdeaSettings> {
  const { rows } = await pool.query("SELECT key, value FROM idea_settings");
  const m = new Map(rows.map((r) => [r.key as string, r.value as string]));
  const n = (k: NumericSetting) => ideaSetting(k, m.get(k), DEFAULT_SETTINGS[k]);
  return {
    polling: m.has("polling") ? m.get("polling") === "on" : DEFAULT_SETTINGS.polling,
    ai: m.has("ai") ? m.get("ai") === "on" : DEFAULT_SETTINGS.ai,
    triageCap: n("triageCap"),
    fullCap: n("fullCap"),
    fullThreshold: n("fullThreshold"),
    tumblrDailyCap: n("tumblrDailyCap"),
  };
}
export async function saveSettings(s: IdeaSettings): Promise<void> {
  for (const [k, v] of Object.entries(s)) {
    const value = typeof v === "boolean" ? (v ? "on" : "off") : String(v);
    await pool.query("INSERT INTO idea_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", [k, value]);
  }
}

/** Sources matching a re-score scope, for the Rescore action. */
export async function sourcesInScope(scope: { since?: Date | null; channel?: string | null; unusedOnly?: boolean; ids?: number[] }): Promise<number[]> {
  const args: unknown[] = [];
  const w: string[] = ["(decision IS NULL OR decision IN ('saved', 'rejected'))", "stage <> 'filtered'"];
  if (scope.ids?.length) (args.push(scope.ids), w.push(`id = ANY($${args.length}::bigint[])`));
  if (scope.since) (args.push(scope.since), w.push(`ingested_at >= $${args.length}`));
  if (scope.channel) (args.push(scope.channel), w.push(`(channel = $${args.length} OR $${args.length} = ANY(channels))`));
  if (scope.unusedOnly) w.push("decision IS NULL");
  const { rows } = await pool.query(`SELECT id FROM idea_sources WHERE ${w.join(" AND ")} ORDER BY ingested_at DESC LIMIT 5000`, args);
  return rows.map((r) => Number(r.id));
}

/** The channel a person says a pasted-in post is for. */
export async function setSourceChannels(id: number, channel: string): Promise<void> {
  await pool.query(
    "UPDATE idea_sources SET channels = ARRAY(SELECT DISTINCT unnest(channels || ARRAY[$2]::text[])), channel = COALESCE(channel, $2), updated_at = now() WHERE id = $1",
    [id, channel],
  );
}

export async function getIdea(id: number): Promise<IdeaRow | null> {
  const { rows } = await pool.query("SELECT id FROM ideas WHERE id = $1", [id]);
  if (!rows[0]) return null;
  return (await listIdeas()).find((i) => i.id === id) ?? null;
}

/** Every failed analysis, sent round again: to the full read if it had got that far, else the quick look. */
export async function retryErrors(): Promise<number> {
  const { rows } = await pool.query("SELECT id, depth FROM idea_sources WHERE stage = 'error' AND decision IS NULL");
  const full = rows.filter((r) => r.depth).map((r) => Number(r.id));
  const quick = rows.filter((r) => !r.depth).map((r) => Number(r.id));
  return (await queueSources(full, "full")) + (await queueSources(quick, "triage"));
}
