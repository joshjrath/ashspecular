/**
 * Competitor channels, read through the YouTube Data API (v3) with
 * YOUTUBE_API_KEY — the official source, no scraping:
 *
 *   channels.list      name, handle, avatar, subscribers, video count   1 unit
 *   playlistItems.list the uploads list, 50 a page, newest first         1 unit
 *   videos.list        views, likes, comments, duration, 50 at a time    1 unit
 *
 * A key gets 10,000 units a day. Adding a channel reads up to its last 500
 * uploads (about 20 units); each refresh after that reads its newest page
 * and the views of everything from the last 60 days (2–4 units).
 *
 * What the API can't give: views on a past date (only views now — so the
 * board keeps its own snapshots from the day a channel is added), hidden
 * subscriber counts, and anything about impressions, CTR or retention.
 *
 * Without a key, a channel's free feed gives its latest 15 videos with views,
 * and nothing else.
 */
import { isoDuration, parseFeed, resolveChannel } from "../jobs/youtube.js";
import { youtubeQuotaHit } from "../db/keys.js";

type Fetcher = typeof fetch;
/** YOUTUBE_API_BASE points it at a stand-in, for testing. */
const api = () => (process.env.YOUTUBE_API_BASE?.trim() || "https://www.googleapis.com/youtube/v3").replace(/\/+$/, "");
export const ytKey = () => process.env.YOUTUBE_API_KEY?.trim() || "";

export interface ChannelInfo {
  id: string;
  title: string | null;
  handle: string | null;
  avatar: string | null;
  subscribers: number | null;
  videoCount: number | null;
}

export interface VideoInfo {
  videoId: string;
  title: string;
  publishedAt: Date;
  durationS: number | null;
  /** 3 minutes or under: YouTube's limit for a Short. */
  isShort: boolean | null;
  thumbnail: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
}

/** Quota units each call cost, counted by the caller. */
export interface Spend { units: number }

async function get(path: string, params: Record<string, string>, key: string, fetcher: Fetcher, spend: Spend): Promise<Record<string, unknown>> {
  // The key in effect now: if an earlier call ran one out of quota, the next has taken over.
  let useKey = process.env.YOUTUBE_API_KEY?.trim() || key;
  for (let attempt = 0; ; attempt++) {
    const u = new URL(`${api()}/${path}`);
    u.search = new URLSearchParams({ ...params, key: useKey }).toString();
    spend.units += 1;
    const res = await fetcher(u, { signal: AbortSignal.timeout(15_000) });
    if (res.status === 403) {
      const body = await res.text().catch(() => "");
      if (/quota/i.test(body)) {
        // Out of quota: the next key in Settings takes over until midnight Pacific.
        if (attempt < 5 && youtubeQuotaHit(useKey)) {
          useKey = process.env.YOUTUBE_API_KEY!.trim();
          continue;
        }
        throw new Error("YouTube's daily API quota is used up on every key — it resets at midnight Pacific.");
      }
      throw new Error("YouTube didn't accept the API key.");
    }
    return await finish(res);
  }
}

async function finish(res: Response): Promise<Record<string, unknown>> {
  if (res.status === 404) throw new Error("YouTube has no channel there.");
  if (!res.ok) throw new Error(`YouTube's API answered ${res.status}.`);
  return (await res.json()) as Record<string, unknown>;
}

const num = (v: unknown) => (v === undefined || v === null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

/** Resolve a pasted link (or @handle) to a channel id. */
export async function findChannel(input: string, fetcher: Fetcher = fetch): Promise<{ id: string } | { error: string }> {
  const t = input.trim();
  const handle = /^@[\w.-]+$/.test(t) ? t : null;
  const key = ytKey();
  if (handle && key) {
    try {
      const data = await get("channels", { part: "id", forHandle: handle }, key, fetcher, { units: 0 });
      const id = ((data.items as Array<{ id: string }> | undefined) ?? [])[0]?.id;
      if (id) return { id };
    } catch {
      /* fall through to the page */
    }
  }
  return resolveChannel(handle ? `https://www.youtube.com/${handle}` : t, fetcher);
}

export async function channelInfo(id: string, key: string, fetcher: Fetcher, spend: Spend): Promise<ChannelInfo> {
  const data = await get("channels", { part: "snippet,statistics", id }, key, fetcher, spend);
  const it = ((data.items as Array<Record<string, any>> | undefined) ?? [])[0];
  if (!it) throw new Error("YouTube has no channel with that id.");
  const thumbs = it.snippet?.thumbnails ?? {};
  return {
    id,
    title: it.snippet?.title ?? null,
    handle: it.snippet?.customUrl ?? null,
    avatar: thumbs.medium?.url ?? thumbs.default?.url ?? null,
    subscribers: it.statistics?.hiddenSubscriberCount ? null : num(it.statistics?.subscriberCount),
    videoCount: num(it.statistics?.videoCount),
  };
}

/** The channel's uploads, newest first: up to `pages` pages of 50. */
export async function uploadIds(id: string, key: string, fetcher: Fetcher, spend: Spend, pages: number): Promise<Array<{ videoId: string; publishedAt: Date }>> {
  const out: Array<{ videoId: string; publishedAt: Date }> = [];
  let token = "";
  for (let i = 0; i < pages; i++) {
    const data = await get("playlistItems", { part: "contentDetails", playlistId: `UU${id.slice(2)}`, maxResults: "50", ...(token ? { pageToken: token } : {}) }, key, fetcher, spend);
    for (const it of (data.items as Array<Record<string, any>> | undefined) ?? []) {
      const vid = it.contentDetails?.videoId;
      const at = it.contentDetails?.videoPublishedAt;
      if (vid && at) out.push({ videoId: vid, publishedAt: new Date(at) });
    }
    token = String(data.nextPageToken ?? "");
    if (!token) break;
  }
  return out;
}

/** Full details for videos, fifty a call. */
export async function videoDetails(ids: string[], key: string, fetcher: Fetcher, spend: Spend): Promise<VideoInfo[]> {
  const out: VideoInfo[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const data = await get("videos", { part: "snippet,statistics,contentDetails", id: ids.slice(i, i + 50).join(",") }, key, fetcher, spend);
    for (const it of (data.items as Array<Record<string, any>> | undefined) ?? []) {
      const dur = it.contentDetails?.duration ? isoDuration(it.contentDetails.duration) : null;
      const th = it.snippet?.thumbnails ?? {};
      out.push({
        videoId: it.id,
        title: it.snippet?.title ?? "",
        publishedAt: new Date(it.snippet?.publishedAt ?? 0),
        durationS: dur,
        isShort: dur === null ? null : dur <= 180,
        thumbnail: th.medium?.url ?? th.high?.url ?? th.default?.url ?? `https://i.ytimg.com/vi/${it.id}/mqdefault.jpg`,
        views: num(it.statistics?.viewCount),
        likes: num(it.statistics?.likeCount),
        comments: num(it.statistics?.commentCount),
      });
    }
  }
  return out;
}

/** No key: the latest 15 from the channel's free feed, views included. */
export async function feedVideos(id: string, fetcher: Fetcher = fetch): Promise<{ title: string | null; videos: VideoInfo[] }> {
  const res = await fetcher(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`YouTube's feed answered ${res.status}.`);
  const feed = parseFeed(await res.text());
  return {
    title: feed.title,
    videos: feed.videos.map((v) => ({
      videoId: v.videoId, title: v.title, publishedAt: v.publishedAt, durationS: null, isShort: /\/shorts\//.test(v.url),
      thumbnail: `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`, views: v.views, likes: null, comments: null,
    })),
  };
}
