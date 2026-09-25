/**
 * Reading the Stories channels' uploads from YouTube.
 *
 * No key needed. Every channel has a public feed of its latest fifteen
 * uploads, and a second, lesser-known one that lists only its *long-form*
 * videos — the "UULF" playlist, the channel id with UC swapped for UULF —
 * which is exactly what Stories is measured on: no Shorts, no live streams.
 * The feed is read every hour and every video it shows is kept, so history
 * builds up from the first read and is never lost when the feed moves on.
 *
 * With YOUTUBE_API_KEY set (free, from Google Cloud), the first read of each
 * channel pulls its whole long-form history instead, and every read carries
 * view counts.
 */
import { CHANNELS } from "../catalog.js";
import { pool } from "../db/pool.js";
import { formatFor } from "../web/targets.js";

type Fetcher = typeof fetch;

export interface FeedVideo {
  videoId: string;
  title: string;
  publishedAt: Date;
  url: string;
  views: number | null;
}

/** The Stories channels: long form, measured against the posting target. */
export function storiesChannels(): string[] {
  return CHANNELS.filter((c) => c.category === "stories").map((c) => c.name);
}

/**
 * What a pasted link names: a channel id outright (UC…, or a /channel/ URL),
 * or a page to look it up on (@handle, /c/…, /user/…, a video link).
 */
export function readChannelInput(raw: string): { id: string } | { page: string } | null {
  const s = raw.trim().replace(/^["'<]+|["'>]+$/g, "");
  if (!s) return null;
  const id = s.match(/(?:^|\/channel\/)(UC[\w-]{22})(?:[/?#]|$)/)?.[1];
  if (id) return { id };
  const handle = s.match(/^@([\w.-]{2,})$/)?.[1];
  if (handle) return { page: `https://www.youtube.com/@${handle}` };
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^(www\.|m\.)/, "");
  if (host !== "youtube.com" && host !== "youtu.be") return null;
  return { page: `https://www.youtube.com${host === "youtu.be" ? `/watch?v=${url.pathname.slice(1)}` : url.pathname}` };
}

/** The channel id a YouTube page belongs to. */
export function channelIdFromPage(html: string): string | null {
  return (
    html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/)?.[1] ??
    html.match(/<meta itemprop="(?:identifier|channelId)" content="(UC[\w-]{22})"/)?.[1] ??
    html.match(/"externalId":"(UC[\w-]{22})"/)?.[1] ??
    html.match(/"channelId":"(UC[\w-]{22})"/)?.[1] ??
    null
  );
}

const PAGE_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
  // Skips the EU cookie-consent interstitial, which has no channel on it.
  Cookie: "CONSENT=YES+cb; SOCS=CAI",
};

/** Turn a pasted link into a channel id, or say why not. */
export async function resolveChannel(input: string, fetcher: Fetcher = fetch): Promise<{ id: string } | { error: string }> {
  const read = readChannelInput(input);
  if (!read) return { error: "That isn't a YouTube channel link." };
  if ("id" in read) return { id: read.id };
  try {
    const res = await fetcher(read.page, { headers: PAGE_HEADERS, signal: AbortSignal.timeout(10_000) });
    if (res.status === 404) return { error: "YouTube has no channel at that link." };
    if (!res.ok) return { error: `YouTube answered ${res.status}.` };
    const id = channelIdFromPage(await res.text());
    return id ? { id } : { error: "Couldn't find the channel on that page. Paste the channel's own link (youtube.com/@name)." };
  } catch {
    return { error: "Couldn't reach YouTube." };
  }
}

/** One Atom feed's videos. */
export function parseFeed(xml: string): { title: string | null; videos: FeedVideo[] } {
  const title = xml.match(/<author>\s*<name>([^<]*)<\/name>/)?.[1] ?? null;
  const videos: FeedVideo[] = [];
  for (const entry of xml.split("<entry>").slice(1)) {
    const videoId = entry.match(/<yt:videoId>([\w-]{11})<\/yt:videoId>/)?.[1];
    const published = entry.match(/<published>([^<]+)<\/published>/)?.[1];
    if (!videoId || !published) continue;
    const href = entry.match(/<link rel="alternate" href="([^"]+)"/)?.[1] ?? `https://www.youtube.com/watch?v=${videoId}`;
    const views = entry.match(/<media:statistics views="(\d+)"/)?.[1];
    videos.push({
      videoId,
      title: decode(entry.match(/<title>([^<]*)<\/title>/)?.[1] ?? ""),
      publishedAt: new Date(published),
      url: href,
      views: views ? Number(views) : null,
    });
  }
  return { title: title ? decode(title) : null, videos };
}

function decode(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

/** The channel's long-form uploads from its free feed. Shorts filtered out either way. */
export async function readLongFormFeed(id: string, fetcher: Fetcher = fetch): Promise<{ title: string | null; videos: FeedVideo[] }> {
  const urls = [
    `https://www.youtube.com/feeds/videos.xml?playlist_id=UULF${id.slice(2)}`,
    `https://www.youtube.com/feeds/videos.xml?channel_id=${id}`,
  ];
  let lastStatus = 0;
  for (const url of urls) {
    const res = await fetcher(url, { signal: AbortSignal.timeout(10_000) });
    lastStatus = res.status;
    if (!res.ok) continue;
    const feed = parseFeed(await res.text());
    return { title: feed.title, videos: feed.videos.filter((v) => !/\/shorts\//.test(v.url)) };
  }
  throw new Error(`YouTube's feed answered ${lastStatus}.`);
}

/**
 * The channel's Shorts only — for Bits and Reading. Its Shorts-only list
 * ("UUSH") first; failing that, the whole feed, keeping /shorts/ links.
 */
export async function readShortsFeed(id: string, fetcher: Fetcher = fetch): Promise<{ title: string | null; videos: FeedVideo[] }> {
  const list = await fetcher(`https://www.youtube.com/feeds/videos.xml?playlist_id=UUSH${id.slice(2)}`, { signal: AbortSignal.timeout(10_000) });
  if (list.ok) {
    const feed = parseFeed(await list.text());
    return { title: feed.title, videos: feed.videos.map((v) => ({ ...v, url: `https://www.youtube.com/shorts/${v.videoId}` })) };
  }
  const res = await fetcher(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`YouTube's feed answered ${res.status}.`);
  const feed = parseFeed(await res.text());
  return { title: feed.title, videos: feed.videos.filter((v) => /\/shorts\//.test(v.url)) };
}

/**
 * With a key: the channel's whole history, newest first, with views — its
 * long-form list ("UULF") or its Shorts list ("UUSH").
 */
export async function readFullHistory(
  id: string,
  key: string,
  fetcher: Fetcher = fetch,
  format: "long" | "short" = "long",
): Promise<FeedVideo[]> {
  const api = "https://www.googleapis.com/youtube/v3";
  const out: FeedVideo[] = [];
  let page = "";
  for (let i = 0; i < 40; i += 1) {
    const u = new URL(`${api}/playlistItems`);
    u.search = new URLSearchParams({
      part: "contentDetails,snippet", playlistId: `${format === "long" ? "UULF" : "UUSH"}${id.slice(2)}`, maxResults: "50", key, ...(page ? { pageToken: page } : {}),
    }).toString();
    const res = await fetcher(u, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`YouTube API answered ${res.status} — check YOUTUBE_API_KEY.`);
    const data = (await res.json()) as {
      nextPageToken?: string;
      items?: Array<{ contentDetails?: { videoId?: string; videoPublishedAt?: string }; snippet?: { title?: string; publishedAt?: string } }>;
    };
    for (const it of data.items ?? []) {
      const videoId = it.contentDetails?.videoId;
      const at = it.contentDetails?.videoPublishedAt ?? it.snippet?.publishedAt;
      if (!videoId || !at) continue;
      out.push({ videoId, title: it.snippet?.title ?? "", publishedAt: new Date(at), url: format === "short" ? `https://www.youtube.com/shorts/${videoId}` : `https://www.youtube.com/watch?v=${videoId}`, views: null });
    }
    if (!data.nextPageToken) break;
    page = data.nextPageToken;
  }
  // Views, fifty at a time.
  for (let i = 0; i < out.length; i += 50) {
    const batch = out.slice(i, i + 50);
    const u = new URL(`${api}/videos`);
    u.search = new URLSearchParams({ part: "statistics", id: batch.map((v) => v.videoId).join(","), key }).toString();
    const res = await fetcher(u, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) break;
    const data = (await res.json()) as { items?: Array<{ id: string; statistics?: { viewCount?: string } }> };
    const views = new Map((data.items ?? []).map((v) => [v.id, Number(v.statistics?.viewCount ?? NaN)]));
    for (const v of batch) {
      const n = views.get(v.videoId);
      if (n !== undefined && Number.isFinite(n)) v.views = n;
    }
  }
  return out;
}

// ── storage ───────────────────────────────────────────────────────────────

export interface ChannelLink {
  channel: string;
  input: string;
  youtubeId: string | null;
  title: string | null;
  error: string | null;
  checkedAt: Date | null;
}

export interface Upload {
  videoId: string;
  channel: string;
  title: string;
  publishedAt: Date;
  url: string;
  views: number | null;
}

export async function listChannelLinks(): Promise<ChannelLink[]> {
  const { rows } = await pool.query<{ channel: string; input: string; youtube_id: string | null; title: string | null; error: string | null; checked_at: Date | null }>(
    "SELECT channel, input, youtube_id, title, error, checked_at FROM youtube_channels",
  );
  return rows.map((r) => ({ channel: r.channel, input: r.input, youtubeId: r.youtube_id, title: r.title, error: r.error, checkedAt: r.checked_at }));
}

export async function listUploads(since: Date): Promise<Upload[]> {
  const { rows } = await pool.query<{ video_id: string; channel: string; title: string; published_at: Date; url: string; views: string | null }>(
    "SELECT video_id, channel, title, published_at, url, views FROM uploads WHERE published_at >= $1 ORDER BY published_at ASC",
    [since],
  );
  return rows.map((r) => ({ videoId: r.video_id, channel: r.channel, title: r.title, publishedAt: r.published_at, url: r.url, views: r.views === null ? null : Number(r.views) }));
}

/** The latest upload per channel, however old — for "days since" on a quiet channel. */
export async function latestUploads(): Promise<Map<string, Date>> {
  const { rows } = await pool.query<{ channel: string; at: Date }>("SELECT channel, MAX(published_at) AS at FROM uploads GROUP BY channel");
  return new Map(rows.map((r) => [r.channel, r.at]));
}

/** Save a channel's pasted link. Clearing the box removes the channel and its uploads. */
export async function setChannelLink(channel: string, input: string): Promise<void> {
  const value = input.trim();
  if (!value) {
    await pool.query("DELETE FROM youtube_channels WHERE channel = $1", [channel]);
    await pool.query("DELETE FROM uploads WHERE channel = $1", [channel]);
    return;
  }
  const { rows } = await pool.query<{ input: string }>("SELECT input FROM youtube_channels WHERE channel = $1", [channel]);
  if (rows[0]?.input === value) return;
  // A new link is a new channel: forget what the old one resolved to.
  await pool.query(
    `INSERT INTO youtube_channels (channel, input) VALUES ($1, $2)
     ON CONFLICT (channel) DO UPDATE SET input = $2, youtube_id = NULL, title = NULL, error = NULL,
       checked_at = NULL, backfilled_at = NULL, updated_at = now()`,
    [channel, value],
  );
  if (rows.length) await pool.query("DELETE FROM uploads WHERE channel = $1", [channel]);
}

async function saveVideos(channel: string, videos: FeedVideo[]): Promise<number> {
  let added = 0;
  for (const v of videos) {
    const { rows } = await pool.query<{ inserted: boolean }>(
      `INSERT INTO uploads (video_id, channel, title, published_at, url, views)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (video_id) DO UPDATE SET title = EXCLUDED.title,
         views = COALESCE(EXCLUDED.views, uploads.views), channel = EXCLUDED.channel
       RETURNING (xmax = 0) AS inserted`,
      [v.videoId, channel, v.title, v.publishedAt, v.url, v.views],
    );
    if (rows[0]?.inserted) added += 1;
    if (v.views !== null) await snapshot(v.videoId, v.views, v.publishedAt);
  }
  return added;
}

/**
 * Keep a video's views as of now, tapering with age: hourly for its first
 * two days, every six hours to ten days, then none — the comparisons only
 * need its curve to seven days, and Bits and Reading post dozens a day.
 */
async function snapshot(videoId: string, views: number, publishedAt: Date): Promise<void> {
  const ageHours = (Date.now() - publishedAt.getTime()) / 3_600_000;
  if (ageHours > 240) return;
  const gap = ageHours < 48 ? "40 minutes" : "330 minutes";
  await pool.query(
    `INSERT INTO video_views (video_id, at, views)
     SELECT $1, now(), $2
     WHERE NOT EXISTS (SELECT 1 FROM video_views WHERE video_id = $1 AND at > now() - $3::interval)`,
    [videoId, views, gap],
  );
}

/**
 * With a key, views for every upload of the last sixty days — not only the
 * fifteen the feed shows — so older videos keep their curve too.
 */
async function refreshViews(key: string, fetcher: Fetcher): Promise<void> {
  const { rows } = await pool.query<{ video_id: string; published_at: Date }>(
    "SELECT video_id, published_at FROM uploads WHERE published_at > now() - interval '60 days'",
  );
  const published = new Map(rows.map((r) => [r.video_id, r.published_at]));
  for (let i = 0; i < rows.length; i += 50) {
    const ids = rows.slice(i, i + 50).map((r) => r.video_id);
    const u = new URL("https://www.googleapis.com/youtube/v3/videos");
    u.search = new URLSearchParams({ part: "statistics", id: ids.join(","), key }).toString();
    const res = await fetcher(u, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return;
    const data = (await res.json()) as { items?: Array<{ id: string; statistics?: { viewCount?: string } }> };
    for (const item of data.items ?? []) {
      const views = Number(item.statistics?.viewCount ?? NaN);
      if (!Number.isFinite(views)) continue;
      await pool.query("UPDATE uploads SET views = $2 WHERE video_id = $1", [item.id, views]);
      await snapshot(item.id, views, published.get(item.id) ?? new Date(0));
    }
  }
}

export interface Snapshot {
  at: Date;
  views: number;
}

/** Every snapshot for these videos, oldest first. */
export async function listSnapshots(videoIds: string[]): Promise<Map<string, Snapshot[]>> {
  const out = new Map<string, Snapshot[]>();
  if (!videoIds.length) return out;
  const { rows } = await pool.query<{ video_id: string; at: Date; views: string }>(
    "SELECT video_id, at, views FROM video_views WHERE video_id = ANY($1) ORDER BY at ASC",
    [videoIds],
  );
  for (const r of rows) {
    if (!out.has(r.video_id)) out.set(r.video_id, []);
    out.get(r.video_id)!.push({ at: r.at, views: Number(r.views) });
  }
  return out;
}

/** Recent uploads not yet announced as breakouts. */
export async function unalertedSince(since: Date): Promise<Set<string>> {
  const { rows } = await pool.query<{ video_id: string }>(
    "SELECT video_id FROM uploads WHERE published_at >= $1 AND breakout_alerted_at IS NULL",
    [since],
  );
  return new Set(rows.map((r) => r.video_id));
}

export async function markAlerted(videoId: string): Promise<void> {
  await pool.query("UPDATE uploads SET breakout_alerted_at = now() WHERE video_id = $1", [videoId]);
}

/**
 * Read every linked channel once — long form or Shorts, by its category: resolve any new link, pull its
 * feed (or, with a key, its whole history the first time), keep every
 * video. One channel failing never stops the rest.
 */
export async function syncUploads(fetcher: Fetcher = fetch): Promise<{ channels: number; added: number; errors: number }> {
  const key = process.env.YOUTUBE_API_KEY?.trim() ?? "";
  const known = new Set(CHANNELS.map((c) => c.name));
  const { rows } = await pool.query<{ channel: string; input: string; youtube_id: string | null; backfilled_at: Date | null }>(
    "SELECT channel, input, youtube_id, backfilled_at FROM youtube_channels",
  );
  let added = 0;
  let errors = 0;
  for (const row of rows.filter((r) => known.has(r.channel))) {
    const category = CHANNELS.find((c) => c.name === row.channel)!.category;
    const format = formatFor(category);
    try {
      let id = row.youtube_id;
      if (!id) {
        const resolved = await resolveChannel(row.input, fetcher);
        if ("error" in resolved) throw new Error(resolved.error);
        id = resolved.id;
        await pool.query("UPDATE youtube_channels SET youtube_id = $2 WHERE channel = $1", [row.channel, id]);
      }
      const feed = format === "long" ? await readLongFormFeed(id, fetcher) : await readShortsFeed(id, fetcher);
      added += await saveVideos(row.channel, feed.videos);
      if (key && !row.backfilled_at) {
        added += await saveVideos(row.channel, await readFullHistory(id, key, fetcher, format));
        await pool.query("UPDATE youtube_channels SET backfilled_at = now() WHERE channel = $1", [row.channel]);
      }
      await pool.query(
        "UPDATE youtube_channels SET title = COALESCE($2, title), error = NULL, checked_at = now() WHERE channel = $1",
        [row.channel, feed.title],
      );
    } catch (err) {
      errors += 1;
      await pool.query("UPDATE youtube_channels SET error = $2, checked_at = now() WHERE channel = $1", [
        row.channel,
        err instanceof Error ? err.message : "Couldn't read this channel.",
      ]);
    }
  }
  if (key) await refreshViews(key, fetcher).catch(() => {});
  return { channels: rows.length, added, errors };
}
