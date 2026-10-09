/**
 * YouTube Analytics connections and the days read through them. A connection
 * is a YouTube channel id with lasting Google access (sealed); the board's
 * channel is whichever is linked to that id, so renames need nothing here.
 */
import { pool, inTransaction } from "./pool.js";
import { seal, unseal } from "./keys.js";
import type { AnalyticsDay, AnalyticsReach } from "../network/types.js";

export interface AnalyticsLink {
  youtubeId: string;
  /** The board channel linked to this YouTube channel, if any. */
  channel: string | null;
  title: string;
  connectedAt: Date;
  syncedAt: Date | null;
  through: string | null;
  backfilled: boolean;
  revenue: boolean | null;
  error: string | null;
}

const linkOf = (r: Record<string, unknown>): AnalyticsLink => ({
  youtubeId: String(r.youtube_id),
  channel: (r.channel as string | null) ?? null,
  title: String(r.title ?? ""),
  connectedAt: r.connected_at as Date,
  syncedAt: (r.synced_at as Date | null) ?? null,
  through: (r.through as string | null) ?? null,
  backfilled: Boolean(r.backfilled),
  revenue: r.revenue === null || r.revenue === undefined ? null : Boolean(r.revenue),
  error: (r.error as string | null) ?? null,
});

export async function listAnalyticsLinks(): Promise<AnalyticsLink[]> {
  const { rows } = await pool.query(
    `SELECT l.youtube_id, y.channel, l.title, l.connected_at, l.synced_at, to_char(l.synced_through, 'YYYY-MM-DD') AS through, l.backfilled, l.revenue, l.error
       FROM network_analytics_links l LEFT JOIN youtube_channels y ON y.youtube_id = l.youtube_id
      ORDER BY y.channel NULLS LAST, l.title`,
  );
  return rows.map(linkOf);
}

/** A connection's lasting Google access, unsealed; null when it can't be read (SESSION_SECRET changed). */
export async function refreshTokenOf(youtubeId: string): Promise<string | null> {
  const { rows } = await pool.query("SELECT refresh_token FROM network_analytics_links WHERE youtube_id = $1", [youtubeId]);
  return rows[0] ? unseal(String(rows[0].refresh_token)) : null;
}

/** Connect (or reconnect) a YouTube channel: a new sign-in starts its reads again from the full history. */
export async function saveAnalyticsLink(l: { youtubeId: string; title: string; refreshToken: string; scopes: string }): Promise<void> {
  await pool.query(
    `INSERT INTO network_analytics_links (youtube_id, title, refresh_token, scopes) VALUES ($1, $2, $3, $4)
     ON CONFLICT (youtube_id) DO UPDATE SET title = $2, refresh_token = $3, scopes = $4, connected_at = now(),
       synced_at = NULL, backfilled = false, revenue = NULL, error = NULL`,
    [l.youtubeId, l.title.slice(0, 200), seal(l.refreshToken), l.scopes.slice(0, 1000)],
  );
}

/** Disconnect: the access and every day read through it go. */
export async function deleteAnalyticsLink(youtubeId: string): Promise<void> {
  await inTransaction(async (db) => {
    await db.query("DELETE FROM network_analytics_days WHERE youtube_id = $1", [youtubeId]);
    await db.query("DELETE FROM network_analytics_links WHERE youtube_id = $1", [youtubeId]);
  });
}

/** Days read from YouTube, replacing what was there for them. */
export async function saveAnalyticsDays(youtubeId: string, days: Array<Omit<AnalyticsDay, "channel">>): Promise<void> {
  if (!days.length) return;
  await inTransaction(async (db) => {
    for (const d of days) {
      await db.query(
        `INSERT INTO network_analytics_days (youtube_id, day, views, views_long, views_short, subs_gained, subs_lost, revenue, revenue_long, revenue_short)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (youtube_id, day) DO UPDATE SET views = $3, views_long = $4, views_short = $5, subs_gained = $6, subs_lost = $7,
           revenue = $8, revenue_long = $9, revenue_short = $10`,
        [youtubeId, d.day, d.views, d.viewsLong, d.viewsShort, d.subsGained, d.subsLost, d.revenue, d.revenueLong, d.revenueShort],
      );
    }
  });
}

/** After a read: how far it got and what it could see, or why it failed. */
export async function markAnalyticsRead(youtubeId: string, r: { through?: string | null; backfilled?: boolean; revenue?: boolean; error: string | null }): Promise<void> {
  await pool.query(
    `UPDATE network_analytics_links SET synced_at = now(), error = $2,
       synced_through = GREATEST(synced_through, $3::date), backfilled = backfilled OR $4, revenue = COALESCE($5, revenue)
     WHERE youtube_id = $1`,
    [youtubeId, r.error ? r.error.slice(0, 300) : null, r.through ?? null, r.backfilled ?? false, r.revenue ?? null],
  );
}

/** The days of these board channels from a day on, under the channel names they're linked to now. */
export async function loadAnalyticsDays(channels: string[], from: string): Promise<{ days: AnalyticsDay[]; reach: Map<string, AnalyticsReach> }> {
  const [days, links] = await Promise.all([
    pool.query(
      `SELECT y.channel, to_char(d.day, 'YYYY-MM-DD') AS day, d.views, d.views_long, d.views_short, d.subs_gained, d.subs_lost, d.revenue, d.revenue_long, d.revenue_short
         FROM network_analytics_days d JOIN youtube_channels y ON y.youtube_id = d.youtube_id
        WHERE y.channel = ANY($1) AND d.day >= $2::date - 1 ORDER BY d.day`,
      [channels, from],
    ),
    pool.query(
      `SELECT y.channel, to_char(l.synced_through, 'YYYY-MM-DD') AS through, l.revenue
         FROM network_analytics_links l JOIN youtube_channels y ON y.youtube_id = l.youtube_id WHERE y.channel = ANY($1)`,
      [channels],
    ),
  ]);
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    days: days.rows.map((r) => ({
      channel: String(r.channel), day: String(r.day), views: Number(r.views), viewsLong: n(r.views_long), viewsShort: n(r.views_short),
      subsGained: n(r.subs_gained), subsLost: n(r.subs_lost), revenue: n(r.revenue), revenueLong: n(r.revenue_long), revenueShort: n(r.revenue_short),
    })),
    reach: new Map(links.rows.map((r) => [String(r.channel), { through: (r.through as string | null) ?? null, revenue: r.revenue === true }])),
  };
}
