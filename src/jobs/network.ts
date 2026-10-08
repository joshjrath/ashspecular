/**
 * Network Overview's readings, after each hourly YouTube read (they need the
 * YouTube key):
 *
 *   every hour   each linked channel's public totals — views, subscribers,
 *                videos — in one call per fifty channels (1 unit each). The
 *                last reading of a day stands for that day.
 *   once a day   every tracked video's views, fifty per call (1 unit each),
 *                so videos older than the sixty days the hourly read covers
 *                count towards the day's views by format too.
 *
 * Then the alerts are looked for (network/alerts.ts). A failure is logged and
 * the last good readings stay; the page says how old they are.
 */
import { pool } from "../db/pool.js";
import { recordViewReadings, saveChannelDay } from "../db/network.js";
import { youtubeQuotaHit } from "../db/keys.js";
import { ORG_TZ, dateIn } from "../parse/derive.js";

type Fetcher = typeof fetch;
const API = "https://www.googleapis.com/youtube/v3";

async function get(url: URL, key: string, fetcher: Fetcher): Promise<unknown> {
  const res = await fetcher(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) {
    if (res.status === 403 && /quota/i.test(await res.text().catch(() => ""))) {
      youtubeQuotaHit(key);
      throw new Error("YouTube's daily quota is used up on this key.");
    }
    throw new Error(`YouTube API answered ${res.status}.`);
  }
  return res.json();
}

/** Each linked channel's public totals, as today's reading. */
export async function readChannelTotals(key: string, fetcher: Fetcher = fetch, now = new Date()): Promise<number> {
  const { rows } = await pool.query<{ channel: string; youtube_id: string }>(
    "SELECT channel, youtube_id FROM youtube_channels WHERE youtube_id IS NOT NULL",
  );
  const byId = new Map(rows.map((r) => [r.youtube_id, r.channel]));
  let read = 0;
  for (let i = 0; i < rows.length; i += 50) {
    const ids = rows.slice(i, i + 50).map((r) => r.youtube_id);
    const u = new URL(`${API}/channels`);
    u.search = new URLSearchParams({ part: "statistics", id: ids.join(","), key, maxResults: "50" }).toString();
    const data = (await get(u, key, fetcher)) as {
      items?: Array<{ id: string; statistics?: { viewCount?: string; subscriberCount?: string; hiddenSubscriberCount?: boolean; videoCount?: string } }>;
    };
    for (const item of data.items ?? []) {
      const channel = byId.get(item.id);
      if (!channel) continue;
      const n = (v: string | undefined) => (v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));
      await saveChannelDay(channel, {
        views: n(item.statistics?.viewCount),
        subscribers: n(item.statistics?.subscriberCount),
        subsHidden: Boolean(item.statistics?.hiddenSubscriberCount),
        videos: n(item.statistics?.videoCount),
      }, now);
      read += 1;
    }
  }
  return read;
}

/** Once a day: every tracked video older than sixty days (the hourly read has the rest). */
export async function readAllViews(key: string, fetcher: Fetcher = fetch, now = new Date()): Promise<number | null> {
  const day = dateIn(ORG_TZ, now);
  const done = await pool.query("SELECT 1 FROM network_reads WHERE day = $1 AND error IS NULL", [day]);
  if (done.rows.length) return null;
  const { rows } = await pool.query<{ video_id: string }>(
    "SELECT video_id FROM uploads WHERE published_at <= now() - interval '60 days' ORDER BY published_at DESC",
  );
  let read = 0;
  try {
    for (let i = 0; i < rows.length; i += 50) {
      const ids = rows.slice(i, i + 50).map((r) => r.video_id);
      const u = new URL(`${API}/videos`);
      u.search = new URLSearchParams({ part: "statistics", id: ids.join(","), key }).toString();
      const data = (await get(u, key, fetcher)) as { items?: Array<{ id: string; statistics?: { viewCount?: string } }> };
      const readings = (data.items ?? [])
        .map((it) => ({ videoId: it.id, views: Number(it.statistics?.viewCount ?? NaN) }))
        .filter((r) => Number.isFinite(r.views));
      await recordViewReadings(readings, { now });
      read += readings.length;
    }
    await pool.query(
      "INSERT INTO network_reads (day, videos) VALUES ($1, $2) ON CONFLICT (day) DO UPDATE SET at = now(), videos = $2, error = NULL",
      [day, read],
    );
    return read;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await pool.query(
      "INSERT INTO network_reads (day, videos, error) VALUES ($1, $2, $3) ON CONFLICT (day) DO UPDATE SET at = now(), videos = $2, error = $3",
      [day, read, message],
    );
    throw err;
  }
}

/** The hourly step: totals every hour, every video once a day, then the alerts. Each failure is logged on its own. */
export async function runNetworkRead(fetcher: Fetcher = fetch): Promise<void> {
  const key = process.env.YOUTUBE_API_KEY?.trim() ?? "";
  if (!key) return;
  await readChannelTotals(key, fetcher).catch((err) => console.error("[network] channel totals failed:", err instanceof Error ? err.message : err));
  await readAllViews(key, fetcher)
    .then((n) => n !== null && console.log(`[network] read ${n} videos' views for the day`))
    .catch((err) => console.error("[network] daily views read failed:", err instanceof Error ? err.message : err));
  // Alerts are daily or weekly things: looked for once a day (a restart looks again, harmlessly — each fires once).
  const today = dateIn(ORG_TZ);
  if (alertsDay === today) return;
  alertsDay = today;
  const { findAlerts } = await import("../network/alerts.js");
  await findAlerts()
    .then((n) => n && console.log(`[network] ${n} new alert${n === 1 ? "" : "s"}`))
    .catch((err) => console.error("[network] alerts failed:", err));
}
let alertsDay = "";
