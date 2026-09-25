/**
 * How each video is doing against its own channel's normal.
 *
 * Views only mean something at a given age: 40,000 after two days and
 * 40,000 after two months are different stories. So a video is compared with
 * what the same channel's recent videos had *at the same age*, read off the
 * hourly view snapshots:
 *
 *   under a day old   its views now, against the others' at this many hours
 *   one to seven days its views at 24 hours
 *   a week and more   its views at 7 days
 *
 * The baseline is the median of the channel's previous twenty videos at that
 * age — a median, so one viral hit doesn't redefine normal — and needs at
 * least three of them. Until the snapshots have built that up (they start
 * when this ships), a video two weeks or older is compared on lifetime views
 * with the channel's other two-week-plus videos, so the page is useful from
 * the first day.
 *
 *   2× the baseline or more   breakout
 *   half or less              underperforming
 */
import type { Snapshot } from "../jobs/youtube.js";

export const BREAKOUT = 2;
export const UNDER = 0.5;
const HOUR = 3_600_000;

export interface VideoViews {
  videoId: string;
  channel: string;
  publishedAt: Date;
  /** Views as of the latest read. */
  views: number | null;
  snapshots: Snapshot[];
}

export type Verdict = "breakout" | "under" | "normal";

export interface Performance {
  videoId: string;
  /** Views at the compared age. */
  value: number;
  baseline: number;
  multiple: number;
  verdict: Verdict;
  /** What was compared: "at 7 days", "at 24 hours", "so far" or "lifetime". */
  basis: string;
}

/**
 * Views at an age in hours, from the snapshots: exact where one sits within
 * a quarter of the age, interpolated between the two either side otherwise,
 * unknown when tracking began too late or the video isn't that old yet.
 */
export function viewsAtAge(v: VideoViews, hours: number): number | null {
  const target = v.publishedAt.getTime() + hours * HOUR;
  const snaps = v.snapshots;
  if (!snaps.length) return null;
  let before: Snapshot | null = null;
  let after: Snapshot | null = null;
  for (const s of snaps) {
    if (s.at.getTime() <= target) before = s;
    else {
      after = s;
      break;
    }
  }
  const near = (s: Snapshot | null) => s && Math.abs(s.at.getTime() - target) <= hours * HOUR * 0.25;
  if (before && after) {
    const t0 = before.at.getTime(), t1 = after.at.getTime();
    return Math.round(before.views + ((after.views - before.views) * (target - t0)) / (t1 - t0));
  }
  if (near(before)) return before!.views;
  if (near(after)) return after!.views;
  return null;
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

const verdictOf = (multiple: number): Verdict => (multiple >= BREAKOUT ? "breakout" : multiple <= UNDER ? "under" : "normal");

/** Score one video against the channel's videos published before it. */
export function scoreVideo(v: VideoViews, channelVideos: VideoViews[], now: Date = new Date()): Performance | null {
  if (v.views === null) return null;
  const age = (now.getTime() - v.publishedAt.getTime()) / HOUR;
  if (age < 3) return null; // too early to say anything
  const prior = channelVideos
    .filter((o) => o.videoId !== v.videoId && o.publishedAt < v.publishedAt)
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
    .slice(0, 20);

  const tryAge = (hours: number, basis: string, value: number | null): Performance | null => {
    if (value === null) return null;
    const others = prior.map((o) => viewsAtAge(o, hours)).filter((n): n is number => n !== null);
    if (others.length < 3) return null;
    const baseline = median(others)!;
    if (baseline <= 0) return null;
    const multiple = value / baseline;
    return { videoId: v.videoId, value, baseline, multiple, verdict: verdictOf(multiple), basis };
  };

  const byAge =
    age >= 168
      ? tryAge(168, "at 7 days", viewsAtAge(v, 168))
      : age >= 24
        ? tryAge(24, "at 24 hours", viewsAtAge(v, 24)) ?? tryAge(age, "so far", v.views)
        : tryAge(age, "so far", v.views);
  if (byAge) return byAge;

  // Not enough snapshots yet: two weeks on, most of a video's views are in,
  // so lifetime views are a fair comparison between videos that old.
  if (age >= 336) {
    const others = prior
      .filter((o) => o.views !== null && now.getTime() - o.publishedAt.getTime() >= 336 * HOUR)
      .map((o) => o.views!);
    if (others.length >= 3) {
      const baseline = median(others)!;
      if (baseline > 0) {
        const multiple = v.views / baseline;
        return { videoId: v.videoId, value: v.views, baseline, multiple, verdict: verdictOf(multiple), basis: "lifetime" };
      }
    }
  }
  return null;
}

/** Score every video, channel by channel. */
export function scoreAll(videos: VideoViews[], now: Date = new Date()): Map<string, Performance> {
  const byChannel = new Map<string, VideoViews[]>();
  for (const v of videos) {
    if (!byChannel.has(v.channel)) byChannel.set(v.channel, []);
    byChannel.get(v.channel)!.push(v);
  }
  const out = new Map<string, Performance>();
  for (const list of byChannel.values()) {
    for (const v of list) {
      const p = scoreVideo(v, list, now);
      if (p) out.set(v.videoId, p);
    }
  }
  return out;
}

/** A channel's typical views: the median of its last twenty at 7 days, else lifetime. */
export function typicalViews(channelVideos: VideoViews[], now: Date = new Date()): { views: number; basis: string } | null {
  const recent = [...channelVideos].sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime()).slice(0, 20);
  const at7 = recent.map((v) => viewsAtAge(v, 168)).filter((n): n is number => n !== null);
  if (at7.length >= 3) return { views: median(at7)!, basis: "at 7 days" };
  const lifetime = recent
    .filter((v) => v.views !== null && now.getTime() - v.publishedAt.getTime() >= 336 * HOUR)
    .map((v) => v.views!);
  if (lifetime.length >= 3) return { views: median(lifetime)!, basis: "lifetime" };
  return null;
}

/** "3.4×", "0.4×" — one decimal under ten, whole numbers above. */
export function formatMultiple(m: number): string {
  return m >= 10 ? `${Math.round(m)}×` : `${m.toFixed(1)}×`;
}

/** 184203 → "184K", 1250000 → "1.3M". */
export function compactViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return String(n);
}
