/**
 * Outliers for Shorts — Bits and Reading.
 *
 * Long form is judged against the median of a channel's last twenty. Shorts
 * go up by the dozen and live or die in hours, so they get more care:
 *
 *   checkpoints  1 h, 3 h, 6 h, 24 h, 3 days, 7 days — a Short is judged at
 *                the latest of these it has reached, against the others at
 *                that same age
 *   baseline     the channel's last sixty Shorts, and at least eight
 *   scale        views are compared on a log scale, where Shorts are spread
 *                evenly, with a robust spread (the median absolute deviation)
 *                so a handful of viral hits don't widen "normal" for everyone
 *
 * Each Short gets its multiple of the channel's median, its percentile among
 * those sixty, and a z-score — how many "typical spreads" it sits from normal:
 *
 *   z ≥ 3    viral        z ≥ 2    breakout
 *   z ≤ −2   flop         z ≤ −1   soft
 *   between  normal
 */
import { viewsAtAge, type VideoViews } from "./performance.js";

export const CHECKPOINTS: Array<{ hours: number; label: string }> = [
  { hours: 1, label: "at 1 hour" },
  { hours: 3, label: "at 3 hours" },
  { hours: 6, label: "at 6 hours" },
  { hours: 24, label: "at 24 hours" },
  { hours: 72, label: "at 3 days" },
  { hours: 168, label: "at 7 days" },
];

export type ShortTier = "viral" | "breakout" | "normal" | "soft" | "flop";

export interface ShortScore {
  videoId: string;
  channel: string;
  value: number;
  baseline: number;
  multiple: number;
  z: number;
  /** 0–100: the share of the channel's recent Shorts this one beat. */
  percentile: number;
  tier: ShortTier;
  basis: string;
  sample: number;
  /** The channel's spread on the log scale — how wide "normal" is. */
  spread: number;
}

const POOL = 60;
const MIN_POOL = 8;
const HOUR = 3_600_000;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export function tierOf(z: number): ShortTier {
  return z >= 3 ? "viral" : z >= 2 ? "breakout" : z <= -2 ? "flop" : z <= -1 ? "soft" : "normal";
}

/** Score one Short against its channel's earlier Shorts. */
/** viewsAtAge, remembered: each Short is looked up at each checkpoint once per page. */
const atAgeMemo = new WeakMap<VideoViews, Map<number, number | null>>();
function atAge(v: VideoViews, hours: number): number | null {
  let m = atAgeMemo.get(v);
  if (!m) atAgeMemo.set(v, (m = new Map()));
  if (!m.has(hours)) m.set(hours, viewsAtAge(v, hours));
  return m.get(hours)!;
}

export function scoreShort(v: VideoViews, channel: VideoViews[], now: Date = new Date()): ShortScore | null {
  const age = (now.getTime() - v.publishedAt.getTime()) / HOUR;
  const reached = CHECKPOINTS.filter((c) => c.hours <= age);
  if (!reached.length) return null;
  const prior = channel
    .filter((o) => o.videoId !== v.videoId && o.publishedAt < v.publishedAt)
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
    .slice(0, POOL);

  // The latest checkpoint with both this Short's views and enough to compare.
  for (const cp of [...reached].reverse()) {
    // Just past a checkpoint with no snapshot on it yet: its views now are
    // close enough to its views then.
    const justPast = cp === reached[reached.length - 1] && age < cp.hours * 1.25;
    const value = atAge(v, cp.hours) ?? (justPast ? v.views : null);
    if (value === null || value <= 0) continue;
    const others = prior.map((o) => atAge(o, cp.hours)).filter((n): n is number => n !== null && n > 0);
    if (others.length < MIN_POOL) continue;
    const logs = others.map(Math.log);
    const m = median(logs);
    // Robust spread; never so small that ordinary noise reads as an outlier.
    const mad = Math.max(median(logs.map((x) => Math.abs(x - m))) * 1.4826, 0.15);
    const z = (Math.log(value) - m) / mad;
    const beat = others.filter((o) => o < value).length;
    return {
      videoId: v.videoId,
      channel: v.channel,
      value,
      baseline: Math.exp(m),
      multiple: value / Math.exp(m),
      z,
      percentile: Math.round((beat / others.length) * 100),
      tier: tierOf(z),
      basis: cp.label,
      sample: others.length,
      spread: mad,
    };
  }
  return null;
}

export function scoreShorts(videos: VideoViews[], now: Date = new Date()): Map<string, ShortScore> {
  const byChannel = new Map<string, VideoViews[]>();
  for (const v of videos) {
    if (!byChannel.has(v.channel)) byChannel.set(v.channel, []);
    byChannel.get(v.channel)!.push(v);
  }
  const out = new Map<string, ShortScore>();
  for (const list of byChannel.values()) {
    // Newest first once, so each Short's sixty predecessors are a slice.
    const sorted = [...list].sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
    sorted.forEach((v, i) => {
      const s = scoreShort(v, sorted.slice(i + 1, i + 1 + POOL), now);
      if (s) out.set(v.videoId, s);
    });
  }
  return out;
}

export interface ChannelShortHealth {
  channel: string;
  /** Median multiple of this week's Shorts, and last week's. */
  thisWeek: number | null;
  lastWeek: number | null;
  /** Share of this week's Shorts at or above the channel's usual. */
  beatRate: number | null;
  counts: Record<ShortTier, number>;
  scored: number;
}

export function channelHealth(channel: string, videos: VideoViews[], scores: Map<string, ShortScore>, now: Date = new Date()): ChannelShortHealth {
  const week = 7 * 24 * HOUR;
  const mine = videos.filter((v) => v.channel === channel);
  const inWindow = (from: number, to: number) =>
    mine.filter((v) => now.getTime() - v.publishedAt.getTime() >= from && now.getTime() - v.publishedAt.getTime() < to)
      .map((v) => scores.get(v.videoId)).filter((s): s is ShortScore => Boolean(s));
  const thisWeek = inWindow(0, week);
  const lastWeek = inWindow(week, 2 * week);
  const counts: Record<ShortTier, number> = { viral: 0, breakout: 0, normal: 0, soft: 0, flop: 0 };
  for (const s of thisWeek) counts[s.tier] += 1;
  return {
    channel,
    thisWeek: thisWeek.length ? median(thisWeek.map((s) => s.multiple)) : null,
    lastWeek: lastWeek.length ? median(lastWeek.map((s) => s.multiple)) : null,
    beatRate: thisWeek.length ? thisWeek.filter((s) => s.multiple >= 1).length / thisWeek.length : null,
    counts,
    scored: thisWeek.length,
  };
}

export interface SlotStat {
  /** "6 AM–9 AM" in ET. */
  label: string;
  from: number;
  count: number;
  median: number;
}

/** How Shorts do by the three-hour slot they went up in (ET), best first. */
export function postingSlots(videos: VideoViews[], scores: Map<string, ShortScore>, zone = "America/New_York"): SlotStat[] {
  const hourOf = new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", hourCycle: "h23" });
  const slots = new Map<number, number[]>();
  for (const v of videos) {
    const s = scores.get(v.videoId);
    if (!s) continue;
    const h = Number(hourOf.format(v.publishedAt)) % 24;
    const from = Math.floor(h / 3) * 3;
    if (!slots.has(from)) slots.set(from, []);
    slots.get(from)!.push(s.multiple);
  }
  const fmt = (h: number) => `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`;
  return [...slots]
    .filter(([, xs]) => xs.length >= 5)
    .map(([from, xs]) => ({ label: `${fmt(from)}–${fmt((from + 3) % 24)}`, from, count: xs.length, median: median(xs) }))
    .sort((a, b) => b.median - a.median);
}
