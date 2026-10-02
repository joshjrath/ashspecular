/**
 * Competitors, stored: niches (groups), the channels in each, their videos
 * and views over time, each video's concepts, alerts, the daily AI read and
 * quota spent. A "my channel" that's one of the board's own reads its videos
 * from the board's uploads, so nothing is fetched twice.
 */
import { pool } from "./pool.js";
import { ORG_TZ, dateIn } from "../parse/derive.js";
import type { VideoInfo, ChannelInfo } from "../competitors/youtube.js";
import type { Snapshot } from "../jobs/youtube.js";

// ── groups ──────────────────────────────────────────────────────────────────

export interface Group { id: number; name: string; position: number; channels: number; mine: number }

export async function listGroups(): Promise<Group[]> {
  const { rows } = await pool.query(
    `SELECT g.id, g.name, g.position,
            COUNT(c.id) FILTER (WHERE NOT c.mine) AS channels, COUNT(c.id) FILTER (WHERE c.mine) AS mine
       FROM comp_groups g LEFT JOIN comp_channels c ON c.group_id = g.id
      GROUP BY g.id ORDER BY g.position, g.id`,
  );
  return rows.map((r) => ({ id: Number(r.id), name: String(r.name), position: Number(r.position), channels: Number(r.channels), mine: Number(r.mine) }));
}

const cleanName = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 60);

export async function addGroup(name: string): Promise<{ id: number } | { error: string }> {
  const n = cleanName(name);
  if (!n) return { error: "Give the niche a name." };
  try {
    const { rows } = await pool.query("INSERT INTO comp_groups (name, position) VALUES ($1, COALESCE((SELECT MAX(position) + 1 FROM comp_groups), 0)) RETURNING id", [n]);
    return { id: Number(rows[0].id) };
  } catch {
    return { error: `There's already a niche called ${n}.` };
  }
}

export async function renameGroup(id: number, name: string): Promise<{ ok: true } | { error: string }> {
  const n = cleanName(name);
  if (!n) return { error: "Give the niche a name." };
  try {
    await pool.query("UPDATE comp_groups SET name = $2 WHERE id = $1", [id, n]);
    return { ok: true };
  } catch {
    return { error: `There's already a niche called ${n}.` };
  }
}

export async function deleteGroup(id: number): Promise<void> {
  await pool.query("DELETE FROM comp_groups WHERE id = $1", [id]);
}

// ── channels ────────────────────────────────────────────────────────────────

export interface CompChannel {
  id: number;
  groupId: number;
  youtubeId: string | null;
  input: string;
  mine: boolean;
  boardChannel: string | null;
  title: string | null;
  handle: string | null;
  avatar: string | null;
  subscribers: number | null;
  videoCount: number | null;
  backfilledAt: Date | null;
  refreshedAt: Date | null;
  error: string | null;
}

const channelOf = (r: Record<string, unknown>): CompChannel => ({
  id: Number(r.id), groupId: Number(r.group_id), youtubeId: (r.youtube_id as string) ?? null, input: String(r.input), mine: Boolean(r.mine),
  boardChannel: (r.board_channel as string) ?? null, title: (r.title as string) ?? null, handle: (r.handle as string) ?? null,
  avatar: (r.avatar_url as string) ?? null, subscribers: r.subscribers === null ? null : Number(r.subscribers), videoCount: r.video_count === null ? null : Number(r.video_count),
  backfilledAt: (r.backfilled_at as Date) ?? null, refreshedAt: (r.refreshed_at as Date) ?? null, error: (r.error as string) ?? null,
});

export async function listChannels(groupId?: number): Promise<CompChannel[]> {
  const { rows } = await pool.query(`SELECT * FROM comp_channels ${groupId ? "WHERE group_id = $1" : ""} ORDER BY mine DESC, lower(COALESCE(title, input))`, groupId ? [groupId] : []);
  return rows.map(channelOf);
}

export async function getChannel(id: number): Promise<CompChannel | null> {
  const { rows } = await pool.query("SELECT * FROM comp_channels WHERE id = $1", [id]);
  return rows[0] ? channelOf(rows[0]) : null;
}

export async function addChannel(c: { groupId: number; input: string; youtubeId: string | null; mine: boolean; boardChannel: string | null }): Promise<{ id: number } | { error: string }> {
  if (c.youtubeId) {
    const { rows } = await pool.query("SELECT id FROM comp_channels WHERE group_id = $1 AND youtube_id = $2", [c.groupId, c.youtubeId]);
    if (rows.length) return { error: "That channel is already in this niche." };
  }
  const { rows } = await pool.query(
    "INSERT INTO comp_channels (group_id, input, youtube_id, mine, board_channel, title) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
    [c.groupId, c.input.slice(0, 300), c.youtubeId, c.mine, c.boardChannel, c.boardChannel],
  );
  return { id: Number(rows[0].id) };
}

export async function updateChannel(id: number, c: { groupId?: number; mine?: boolean }): Promise<void> {
  if (c.groupId !== undefined) await pool.query("UPDATE comp_channels SET group_id = $2 WHERE id = $1", [id, c.groupId]);
  if (c.mine !== undefined) await pool.query("UPDATE comp_channels SET mine = $2 WHERE id = $1", [id, c.mine]);
}

export async function removeChannel(id: number): Promise<void> {
  await pool.query("DELETE FROM comp_channels WHERE id = $1", [id]);
}

/** Channels due a read (fetched ones only: the board's own are kept current by Uploads). */
export async function dueChannels(limit: number): Promise<CompChannel[]> {
  const { rows } = await pool.query(
    "SELECT * FROM comp_channels WHERE board_channel IS NULL AND next_refresh_at <= now() ORDER BY next_refresh_at LIMIT $1",
    [limit],
  );
  return rows.map(channelOf);
}

export async function saveChannelRead(id: number, r: { youtubeId?: string; info?: ChannelInfo | null; title?: string | null; ok: boolean; error?: string; backfilled?: boolean; nextHours: number }): Promise<void> {
  const i = r.info;
  await pool.query(
    `UPDATE comp_channels SET
       youtube_id = COALESCE($2, youtube_id),
       title = COALESCE($3, title), handle = COALESCE($4, handle), avatar_url = COALESCE($5, avatar_url),
       subscribers = CASE WHEN $6::boolean THEN $7 ELSE subscribers END, video_count = COALESCE($8, video_count),
       backfilled_at = CASE WHEN $9 THEN now() ELSE backfilled_at END,
       refreshed_at = CASE WHEN $10 THEN now() ELSE refreshed_at END,
       error = $11, next_refresh_at = now() + ($12 || ' hours')::interval
     WHERE id = $1`,
    [id, r.youtubeId ?? null, i?.title ?? r.title ?? null, i?.handle ?? null, i?.avatar ?? null, Boolean(i), i?.subscribers ?? null, i?.videoCount ?? null,
      Boolean(r.backfilled), r.ok, r.ok ? null : (r.error ?? "Couldn't read this channel.").slice(0, 300), String(r.nextHours)],
  );
}

export async function refreshNow(id: number): Promise<void> {
  await pool.query("UPDATE comp_channels SET next_refresh_at = now() WHERE id = $1", [id]);
}

// ── videos ──────────────────────────────────────────────────────────────────

/** Keep videos and, for young ones, a views snapshot (hourly to 2 days, six-hourly to 10). */
export async function saveVideos(youtubeId: string, videos: VideoInfo[]): Promise<number> {
  let added = 0;
  for (const v of videos) {
    const { rows } = await pool.query(
      `INSERT INTO comp_videos (video_id, youtube_id, title, published_at, duration_s, is_short, thumbnail, views, likes, comments, views_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CASE WHEN $8::bigint IS NULL THEN NULL ELSE now() END)
       ON CONFLICT (video_id) DO UPDATE SET title = EXCLUDED.title,
         duration_s = COALESCE(EXCLUDED.duration_s, comp_videos.duration_s), is_short = COALESCE(EXCLUDED.is_short, comp_videos.is_short),
         thumbnail = COALESCE(EXCLUDED.thumbnail, comp_videos.thumbnail), views = COALESCE(EXCLUDED.views, comp_videos.views),
         likes = COALESCE(EXCLUDED.likes, comp_videos.likes), comments = COALESCE(EXCLUDED.comments, comp_videos.comments),
         views_at = CASE WHEN EXCLUDED.views IS NULL THEN comp_videos.views_at ELSE now() END
       RETURNING (xmax = 0) AS inserted`,
      [v.videoId, youtubeId, v.title.slice(0, 300), v.publishedAt, v.durationS, v.isShort, v.thumbnail, v.views, v.likes, v.comments],
    );
    if (rows[0]?.inserted) added++;
    if (v.views !== null) {
      const ageH = (Date.now() - v.publishedAt.getTime()) / 3_600_000;
      if (ageH <= 240) {
        await pool.query(
          `INSERT INTO comp_video_views (video_id, at, views) SELECT $1, now(), $2
           WHERE NOT EXISTS (SELECT 1 FROM comp_video_views WHERE video_id = $1 AND at > now() - $3::interval)`,
          [v.videoId, v.views, ageH < 48 ? "40 minutes" : "330 minutes"],
        );
      }
    }
  }
  return added;
}

/** Fetched videos of a channel from the last `days` days (for refreshing views). */
export async function recentVideoIds(youtubeId: string, days: number): Promise<string[]> {
  const { rows } = await pool.query("SELECT video_id FROM comp_videos WHERE youtube_id = $1 AND published_at > now() - ($2 || ' days')::interval", [youtubeId, String(days)]);
  return rows.map((r) => String(r.video_id));
}

export interface NicheVideo {
  videoId: string;
  channelId: number;
  title: string;
  publishedAt: Date;
  durationS: number | null;
  isShort: boolean;
  thumbnail: string;
  views: number | null;
  url: string;
  snapshots: Snapshot[];
}

/** Every video of these channels, with its snapshots: fetched ones from comp_videos, the board's own from Uploads. */
export async function loadVideos(channels: CompChannel[]): Promise<NicheVideo[]> {
  const out: NicheVideo[] = [];
  const fetched = channels.filter((c) => !c.boardChannel && c.youtubeId);
  if (fetched.length) {
    const byYt = new Map(fetched.map((c) => [c.youtubeId!, c.id]));
    const { rows } = await pool.query("SELECT * FROM comp_videos WHERE youtube_id = ANY($1)", [[...byYt.keys()]]);
    const snaps = await snapshotsOf("comp_video_views", rows.map((r) => String(r.video_id)));
    for (const r of rows) {
      const short = r.is_short === null ? false : Boolean(r.is_short);
      out.push({
        videoId: String(r.video_id), channelId: byYt.get(String(r.youtube_id))!, title: String(r.title), publishedAt: r.published_at as Date,
        durationS: r.duration_s === null ? null : Number(r.duration_s), isShort: short, thumbnail: (r.thumbnail as string) ?? `https://i.ytimg.com/vi/${r.video_id}/mqdefault.jpg`,
        views: r.views === null ? null : Number(r.views), url: short ? `https://www.youtube.com/shorts/${r.video_id}` : `https://www.youtube.com/watch?v=${r.video_id}`,
        snapshots: snaps.get(String(r.video_id)) ?? [],
      });
    }
  }
  const board = channels.filter((c) => c.boardChannel);
  if (board.length) {
    const byName = new Map(board.map((c) => [c.boardChannel!, c.id]));
    const { rows } = await pool.query("SELECT video_id, channel, title, published_at, url, views, duration_s FROM uploads WHERE channel = ANY($1)", [[...byName.keys()]]);
    const snaps = await snapshotsOf("video_views", rows.map((r) => String(r.video_id)));
    for (const r of rows) {
      const url = String(r.url);
      out.push({
        videoId: String(r.video_id), channelId: byName.get(String(r.channel))!, title: String(r.title), publishedAt: r.published_at as Date,
        durationS: r.duration_s === null ? null : Number(r.duration_s), isShort: /\/shorts\//.test(url), thumbnail: `https://i.ytimg.com/vi/${r.video_id}/mqdefault.jpg`,
        views: r.views === null ? null : Number(r.views), url, snapshots: snaps.get(String(r.video_id)) ?? [],
      });
    }
  }
  return out;
}

async function snapshotsOf(table: "comp_video_views" | "video_views", ids: string[]): Promise<Map<string, Snapshot[]>> {
  const out = new Map<string, Snapshot[]>();
  if (!ids.length) return out;
  const { rows } = await pool.query(`SELECT video_id, at, views FROM ${table} WHERE video_id = ANY($1) ORDER BY at`, [ids]);
  for (const r of rows) {
    const k = String(r.video_id);
    if (!out.has(k)) out.set(k, []);
    out.get(k)!.push({ at: r.at as Date, views: Number(r.views) });
  }
  return out;
}

/** Videos on the board not uploaded yet, for "planned" coverage. */
export async function plannedTitles(boardChannels: string[]): Promise<Array<{ ref: string; title: string; channel: string; date: string | null }>> {
  if (!boardChannels.length) return [];
  const { rows } = await pool.query(
    `SELECT id, title, channel, air_date FROM records WHERE channel = ANY($1) AND status = 'open' AND uploaded_at IS NULL AND batch_no IS NULL AND kind <> 'review' AND title IS NOT NULL`,
    [boardChannels],
  );
  return rows.map((r) => ({ ref: `rec:${r.id}`, title: String(r.title), channel: String(r.channel), date: r.air_date ? dateIn(ORG_TZ, r.air_date as Date) : null }));
}

// ── concepts ────────────────────────────────────────────────────────────────

export interface Concept {
  ref: string;
  title: string;
  lead: string | null;
  other: string | null;
  characters: string[];
  franchises: string[];
  format: string | null;
  trend: string | null;
  shape: string | null;
  source: "ai" | "rules";
}

export async function loadConcepts(refs: string[]): Promise<Map<string, Concept>> {
  const out = new Map<string, Concept>();
  if (!refs.length) return out;
  const { rows } = await pool.query("SELECT * FROM comp_concepts WHERE ref = ANY($1)", [refs]);
  for (const r of rows) {
    out.set(String(r.ref), {
      ref: String(r.ref), title: String(r.title), lead: (r.lead as string) ?? null, other: (r.other as string) ?? null,
      characters: (r.characters as string[]) ?? [], franchises: (r.franchises as string[]) ?? [], format: (r.format as string) ?? null,
      trend: (r.trend as string) ?? null, shape: (r.shape as string) ?? null, source: r.source === "ai" ? "ai" : "rules",
    });
  }
  return out;
}

/** Refs whose concept is missing, or was only read by rules / an older version while AI can do better. */
export async function conceptsToRead(refs: string[], version: string, wantAi: boolean): Promise<Set<string>> {
  if (!refs.length) return new Set();
  const { rows } = await pool.query("SELECT ref, source, version FROM comp_concepts WHERE ref = ANY($1)", [refs]);
  const have = new Map(rows.map((r) => [String(r.ref), { source: String(r.source), version: String(r.version) }]));
  return new Set(refs.filter((r) => {
    const h = have.get(r);
    return !h || h.version !== version || (wantAi && h.source !== "ai");
  }));
}

export async function saveConcepts(list: Concept[], version: string): Promise<void> {
  for (const c of list) {
    await pool.query(
      `INSERT INTO comp_concepts (ref, title, lead, other, characters, franchises, format, trend, shape, source, version, read_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
       ON CONFLICT (ref) DO UPDATE SET title = $2, lead = $3, other = $4, characters = $5, franchises = $6, format = $7, trend = $8, shape = $9, source = $10, version = $11, read_at = now()`,
      [c.ref, c.title, c.lead, c.other, c.characters, c.franchises, c.format, c.trend, c.shape, c.source, version],
    );
  }
}

// ── alerts, reads, usage, settings ──────────────────────────────────────────

export interface Alert { id: number; groupId: number | null; kind: string; key: string; text: string; href: string | null; at: Date; seenAt: Date | null }

/** Raise an alert once per (niche, kind, key). Returns whether it's new. */
export async function raiseAlert(a: { groupId: number; kind: string; key: string; text: string; href: string | null }): Promise<boolean> {
  const { rowCount } = await pool.query(
    "INSERT INTO comp_alerts (group_id, kind, key, text, href) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (group_id, kind, key) DO NOTHING",
    [a.groupId, a.kind, a.key.slice(0, 300), a.text.slice(0, 400), a.href],
  );
  return (rowCount ?? 0) > 0;
}

export async function listAlerts(limit = 30, groupId?: number): Promise<Alert[]> {
  const { rows } = await pool.query(
    `SELECT * FROM comp_alerts WHERE at > now() - interval '30 days' ${groupId ? "AND group_id = $2" : ""} ORDER BY at DESC LIMIT $1`,
    groupId ? [limit, groupId] : [limit],
  );
  return rows.map((r) => ({ id: Number(r.id), groupId: r.group_id === null ? null : Number(r.group_id), kind: String(r.kind), key: String(r.key), text: String(r.text), href: (r.href as string) ?? null, at: r.at as Date, seenAt: (r.seen_at as Date) ?? null }));
}

export async function unseenAlerts(): Promise<number> {
  const { rows } = await pool.query("SELECT COUNT(*) AS n FROM comp_alerts WHERE seen_at IS NULL AND at > now() - interval '7 days'");
  return Number(rows[0].n);
}

export async function markAlertsSeen(groupId: number): Promise<void> {
  await pool.query("UPDATE comp_alerts SET seen_at = now() WHERE group_id = $1 AND seen_at IS NULL", [groupId]);
}

export interface Read { facts: unknown; notes: Array<{ text: string; cites: string[] }>; model: string | null; at: Date }

export async function latestRead(groupId: number): Promise<Read | null> {
  const { rows } = await pool.query("SELECT * FROM comp_reads WHERE group_id = $1 ORDER BY day DESC LIMIT 1", [groupId]);
  return rows[0] ? { facts: rows[0].facts, notes: rows[0].notes as Read["notes"], model: (rows[0].model as string) ?? null, at: rows[0].at as Date } : null;
}

export async function hasReadToday(groupId: number): Promise<boolean> {
  const { rows } = await pool.query("SELECT 1 FROM comp_reads WHERE group_id = $1 AND day = $2", [groupId, dateIn(ORG_TZ)]);
  return rows.length > 0;
}

export async function saveRead(groupId: number, facts: unknown, notes: Read["notes"], model: string | null): Promise<void> {
  await pool.query(
    `INSERT INTO comp_reads (group_id, day, facts, notes, model) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (group_id, day) DO UPDATE SET facts = $3, notes = $4, model = $5, at = now()`,
    [groupId, dateIn(ORG_TZ), JSON.stringify(facts), JSON.stringify(notes), model],
  );
}

export async function addUsage(kind: "youtube" | "ai", units: number): Promise<void> {
  if (!units) return;
  await pool.query(
    "INSERT INTO comp_usage (day, kind, units) VALUES ($1, $2, $3) ON CONFLICT (day, kind) DO UPDATE SET units = comp_usage.units + $3",
    [dateIn(ORG_TZ), kind, units],
  );
}

export async function usageToday(): Promise<{ youtube: number; ai: number }> {
  const { rows } = await pool.query("SELECT kind, units FROM comp_usage WHERE day = $1", [dateIn(ORG_TZ)]);
  const m = new Map(rows.map((r) => [String(r.kind), Number(r.units)]));
  return { youtube: m.get("youtube") ?? 0, ai: m.get("ai") ?? 0 };
}

export interface CompSettings {
  /** Months after which my coverage of a concept counts as stale. */
  staleMonths: number;
  /** An outlier: this many times the channel's normal. */
  outlier: number;
  /** A major outlier, worth an alert. */
  major: number;
  /** Quota units a day the refresh may spend (YouTube allows 10,000). */
  quota: number;
  /** Claude calls a day for concepts and the daily read. */
  aiCalls: number;
}
export const DEFAULT_COMP: CompSettings = { staleMonths: 9, outlier: 2, major: 4, quota: 6000, aiCalls: 40 };
/** The range each setting may take, wherever it's set: Competitors → Manage, or Settings → Limits. */
export const COMP_BOUNDS: Record<keyof CompSettings, { min: number; max: number; whole: boolean }> = {
  staleMonths: { min: 1, max: 60, whole: true },
  outlier: { min: 1.2, max: 10, whole: false },
  major: { min: 1.5, max: 50, whole: false },
  quota: { min: 100, max: 10000, whole: true },
  aiCalls: { min: 0, max: 500, whole: true },
};
/** A setting as typed into a form, kept in its range; the current value when it isn't a number. */
export function compSetting(k: keyof CompSettings, raw: unknown, current: number): number {
  const text = String(raw ?? "").trim();
  const v = Number(text);
  if (!text || !Number.isFinite(v)) return current;
  const b = COMP_BOUNDS[k];
  const kept = Math.max(b.min, Math.min(b.max, v));
  return b.whole ? Math.round(kept) : kept;
}

export async function getCompSettings(): Promise<CompSettings> {
  const { rows } = await pool.query("SELECT key, value FROM comp_settings");
  const s = { ...DEFAULT_COMP };
  for (const r of rows) {
    const k = String(r.key) as keyof CompSettings;
    const n = Number(r.value);
    if (k in s && Number.isFinite(n)) s[k] = n;
  }
  return s;
}

export async function saveCompSettings(s: CompSettings): Promise<void> {
  for (const [k, v] of Object.entries(s)) {
    await pool.query("INSERT INTO comp_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2", [k, String(v)]);
  }
}
