/**
 * Competitors' numbers, worked out from the data alone — no AI in here.
 *
 * Every video is scored by the board's own outlier engine (performance.ts):
 * its views against the median of the same channel's previous twenty at the
 * same age (24 hours, 7 days, or lifetime once two weeks old). Long-form and
 * Shorts are scored apart, since one channel's Shorts and long videos live
 * on different scales.
 *
 * On top of those multiples: each channel's recent numbers, the niche's top
 * videos, concept gaps (what's breaking out for competitors that my channels
 * haven't covered), what's working (what outliers share more than the niche
 * does), emerging topics (several channels, the last two weeks) and where my
 * channels stand. Each comes with the videos behind it.
 */
import { scoreAll, median, type Performance, type VideoViews } from "../web/performance.js";
import type { CompChannel, Concept, NicheVideo } from "../db/competitors.js";
import { conceptKey, conceptLabel, FORMAT_LABEL, slug } from "./concepts.js";

const DAY = 86_400_000;

export interface Row {
  video: NicheVideo;
  channel: CompChannel;
  ageDays: number;
  /** Views a day since it went up (lifetime average). */
  perDay: number | null;
  /** Against its channel's normal, and on what basis; null when there isn't enough to say. */
  multiple: number | null;
  basis: string | null;
  concept: Concept | null;
}

export type FormatPick = "long" | "short" | "all";

/** Score every video with the board's outlier engine, long-form and Shorts apart. */
export function scoreNiche(videos: NicheVideo[], now: Date): Map<string, Performance> {
  const vv: VideoViews[] = videos.map((v) => ({ videoId: v.videoId, channel: `${v.channelId}|${v.isShort ? "s" : "l"}`, publishedAt: v.publishedAt, views: v.views, snapshots: v.snapshots }));
  return scoreAll(vv, now);
}

export function rowsOf(videos: NicheVideo[], channels: CompChannel[], concepts: Map<string, Concept>, now: Date): Row[] {
  const perf = scoreNiche(videos, now);
  const byId = new Map(channels.map((c) => [c.id, c]));
  return videos
    .filter((v) => byId.has(v.channelId))
    .map((v) => {
      const ageDays = Math.max(0, (now.getTime() - v.publishedAt.getTime()) / DAY);
      const p = perf.get(v.videoId);
      return {
        video: v, channel: byId.get(v.channelId)!, ageDays,
        perDay: v.views === null ? null : v.views / Math.max(ageDays, 1),
        multiple: p?.multiple ?? null, basis: p?.basis ?? null, concept: concepts.get(v.videoId) ?? null,
      };
    });
}

/** The niche's main format: whichever most of its last 90 days' uploads are. */
export function mainFormat(rows: Row[]): "long" | "short" {
  const recent = rows.filter((r) => r.ageDays <= 90);
  const shorts = recent.filter((r) => r.video.isShort).length;
  return shorts > recent.length / 2 ? "short" : "long";
}

export const inFormat = (rows: Row[], f: FormatPick) => (f === "all" ? rows : rows.filter((r) => r.video.isShort === (f === "short")));

// ── channels ───────────────────────────────────────────────────────────────

export interface ChannelStats {
  channel: CompChannel;
  videos: number;
  /** Uploads in the last 90 days, and a week on average. */
  uploads90: number;
  perWeek: number;
  /** Views of the last 90 days' videos at least 7 days old: mean and median. */
  avgViews: number | null;
  medianViews: number | null;
  /** Median views a day of the last 30 days' videos. */
  medianPerDay: number | null;
  /** Of its scored videos in the last 90 days: how many are outliers, and how strong. */
  scored90: number;
  outliers90: number;
  outlierRate: number | null;
  outlierStrength: number | null;
  best: Row | null;
  /** Median multiple of the last 30 days' scored videos: above 1, running above its own normal. */
  momentum: number | null;
  lastUpload: Date | null;
  topConcepts: Array<{ label: string; n: number }>;
}

export function channelStats(channel: CompChannel, rows: Row[], outlier: number): ChannelStats {
  const mine = rows.filter((r) => r.channel.id === channel.id);
  const r90 = mine.filter((r) => r.ageDays <= 90);
  const settled = r90.filter((r) => r.ageDays >= 7 && r.video.views !== null).map((r) => r.video.views!);
  const scored = r90.filter((r) => r.multiple !== null);
  const outs = scored.filter((r) => r.multiple! >= outlier);
  const r30 = mine.filter((r) => r.ageDays <= 30);
  const conceptCount = new Map<string, number>();
  for (const r of outs) {
    const l = r.concept?.trend ?? (r.concept ? conceptLabel(r.concept) : "");
    if (l) conceptCount.set(l, (conceptCount.get(l) ?? 0) + 1);
  }
  return {
    channel,
    videos: mine.length,
    uploads90: r90.length,
    perWeek: (r90.length / 90) * 7,
    avgViews: settled.length ? settled.reduce((a, b) => a + b, 0) / settled.length : null,
    medianViews: median(settled),
    medianPerDay: median(r30.map((r) => r.perDay).filter((n): n is number => n !== null)),
    scored90: scored.length,
    outliers90: outs.length,
    outlierRate: scored.length >= 3 ? outs.length / scored.length : null,
    outlierStrength: median(outs.map((r) => r.multiple!)),
    best: [...scored].sort((a, b) => b.multiple! - a.multiple!)[0] ?? null,
    momentum: median(r30.map((r) => r.multiple).filter((n): n is number => n !== null)),
    lastUpload: mine.reduce<Date | null>((d, r) => (!d || r.video.publishedAt > d ? r.video.publishedAt : d), null),
    topConcepts: [...conceptCount].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([label, n]) => ({ label, n })),
  };
}

// ── top videos ─────────────────────────────────────────────────────────────

export type SortKey = "multiple" | "views" | "perday" | "date";

export function topVideos(rows: Row[], o: { sort: SortKey; days: number | null; competitorsOnly?: boolean; limit?: number }): Row[] {
  const list = rows.filter((r) => (o.days === null || r.ageDays <= o.days) && (!o.competitorsOnly || !r.channel.mine));
  const val = (r: Row) =>
    o.sort === "multiple" ? r.multiple ?? -1 : o.sort === "views" ? r.video.views ?? -1 : o.sort === "perday" ? r.perDay ?? -1 : r.video.publishedAt.getTime();
  return list.sort((a, b) => val(b) - val(a)).slice(0, o.limit ?? 60);
}

// ── concept gaps ───────────────────────────────────────────────────────────

export type Coverage = "never" | "stale" | "recent" | "planned";

export interface Gap {
  key: string;
  label: string;
  lead: string;
  other: string | null;
  trend: string | null;
  format: string | null;
  /** Competitor videos with it in the window, and the outliers among them. */
  videos: Row[];
  outliers: Row[];
  /** Different competitor channels with an outlier on it. */
  channels: number;
  maxMultiple: number;
  medianMultiple: number | null;
  medianPerDay: number | null;
  latest: Date;
  /** Recent outliers (last 14 days) against the window's: is it picking up? */
  recentOutliers: number;
  coverage: Coverage;
  /** My videos on it, newest first, and the planned one if any. */
  mine: Row[];
  lastCovered: Date | null;
  planned: { title: string; channel: string; date: string | null } | null;
  /** Competitor videos on it in the last 90 days, from how many channels: a crowded concept. */
  crowd: { videos: number; channels: number };
  saturated: boolean;
  /** Its signals in words: every number traceable to the videos. */
  why: string;
  strong: boolean;
}

export interface Planned { ref: string; title: string; channel: string; date: string | null; concept: Concept | null }

export function conceptGaps(rows: Row[], planned: Planned[], o: { days: number; outlier: number; staleMonths: number; now: Date }): Gap[] {
  const comp = rows.filter((r) => !r.channel.mine && r.concept && conceptKey(r.concept));
  const mineRows = rows.filter((r) => r.channel.mine && r.concept && conceptKey(r.concept));
  const byKey = new Map<string, Row[]>();
  for (const r of comp) {
    const k = conceptKey(r.concept!);
    byKey.set(k, [...(byKey.get(k) ?? []), r]);
  }
  const mineBy = new Map<string, Row[]>();
  for (const r of mineRows) {
    const k = conceptKey(r.concept!);
    mineBy.set(k, [...(mineBy.get(k) ?? []), r]);
  }
  const plannedBy = new Map<string, Planned>();
  for (const p of planned) if (p.concept && conceptKey(p.concept)) plannedBy.set(conceptKey(p.concept), p);
  const staleDays = o.staleMonths * 30.4;
  const out: Gap[] = [];
  for (const [key, all] of byKey) {
    const inWindow = all.filter((r) => r.ageDays <= o.days);
    const outliers = inWindow.filter((r) => (r.multiple ?? 0) >= o.outlier).sort((a, b) => b.multiple! - a.multiple!);
    if (!outliers.length) continue;
    const c = outliers[0]!.concept!;
    const mine = (mineBy.get(key) ?? []).sort((a, b) => b.video.publishedAt.getTime() - a.video.publishedAt.getTime());
    const lastCovered = mine[0]?.video.publishedAt ?? null;
    const plan = plannedBy.get(key) ?? null;
    const coverage: Coverage = plan ? "planned" : !lastCovered ? "never" : (o.now.getTime() - lastCovered.getTime()) / DAY > staleDays ? "stale" : "recent";
    const crowd90 = all.filter((r) => r.ageDays <= 90);
    const crowd = { videos: crowd90.length, channels: new Set(crowd90.map((r) => r.channel.id)).size };
    const channels = new Set(outliers.map((r) => r.channel.id)).size;
    const scored = inWindow.filter((r) => r.multiple !== null).map((r) => r.multiple!);
    const saturated = crowd.videos >= 6 && crowd.channels >= 4;
    const latest = inWindow.reduce((d, r) => (r.video.publishedAt > d ? r.video.publishedAt : d), new Date(0));
    const ago = (d: Date) => Math.max(1, Math.round((o.now.getTime() - d.getTime()) / DAY));
    const cover =
      coverage === "never" ? "None of the channels marked as yours have covered it."
      : coverage === "planned" ? `It's planned: “${plan!.title}”${plan!.date ? ` (${plan!.date})` : ""}.`
      : coverage === "stale" ? `You last covered it ${Math.round(ago(lastCovered!) / 30.4)} months ago (“${mine[0]!.video.title}”).`
      : `You covered it ${ago(lastCovered!)} days ago (“${mine[0]!.video.title}”).`;
    const why =
      `${channels === 1 ? "1 competitor" : `${channels} independent competitors`} produced ${outliers.length === 1 ? "a" : outliers.length} ${o.outlier}×+ outlier${outliers.length === 1 ? "" : "s"} on ${conceptLabel(c)} in the last ${o.days} days ` +
      `(highest ${outliers[0]!.multiple!.toFixed(1)}×, the latest ${ago(outliers.reduce((d, r) => (r.video.publishedAt > d ? r.video.publishedAt : d), new Date(0)))} days ago). ${cover}` +
      (saturated ? ` It's crowded: ${crowd.videos} competitor videos from ${crowd.channels} channels in 90 days.` : "");
    out.push({
      key, label: conceptLabel(c), lead: c.lead!, other: c.other, trend: c.trend, format: c.format,
      videos: inWindow.sort((a, b) => (b.multiple ?? 0) - (a.multiple ?? 0)), outliers, channels,
      maxMultiple: outliers[0]!.multiple!, medianMultiple: median(scored), medianPerDay: median(inWindow.map((r) => r.perDay).filter((n): n is number => n !== null)),
      latest, recentOutliers: outliers.filter((r) => r.ageDays <= 14).length,
      coverage, mine, lastCovered, planned: plan ? { title: plan.title, channel: plan.channel, date: plan.date } : null,
      crowd, saturated, why, strong: channels >= 2 && (coverage === "never" || coverage === "stale"),
    });
  }
  // Openly ordered: open concepts first, then by independent channels, outliers, strength, recency.
  const open = (g: Gap) => (g.coverage === "never" || g.coverage === "stale" ? 1 : 0);
  return out.sort((a, b) => open(b) - open(a) || b.channels - a.channels || b.outliers.length - a.outliers.length || b.maxMultiple - a.maxMultiple || b.latest.getTime() - a.latest.getTime());
}

/** Gaps sharing a lead, an other or a trend with this one. */
export function relatedGaps(g: Gap, all: Gap[]): Gap[] {
  return all.filter((x) => x.key !== g.key && (slug(x.lead) === slug(g.lead) || (g.other && slug(x.other) === slug(g.other)) || (g.trend && x.trend === g.trend))).slice(0, 6);
}

// ── what's working ─────────────────────────────────────────────────────────

export interface Pattern {
  dimension: "character" | "franchise" | "format" | "trend" | "title" | "length" | "day";
  value: string;
  /** Videos with it in the window, outliers among them, from how many channels. */
  videos: number;
  outliers: number;
  channels: number;
  /** Its outlier rate against the niche's. */
  rate: number;
  nicheRate: number;
  medianMultiple: number | null;
  examples: Row[];
  fact: string;
}

const lengthBucket = (s: number | null) => (s === null ? null : s < 60 ? "under 1 min" : s < 180 ? "1–3 min" : s < 600 ? "3–10 min" : s < 1200 ? "10–20 min" : s < 1800 ? "20–30 min" : "30 min+");
const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DIM_LABEL: Record<Pattern["dimension"], string> = { character: "", franchise: "", format: "", trend: "", title: "Titles shaped", length: "Videos running", day: "Uploads on" };

/** What outliers share more than the niche does: each value with 2+ outliers from 2+ channels, at 1.5× the niche's outlier rate or more. */
export function whatsWorking(rows: Row[], o: { days: number; outlier: number }): Pattern[] {
  const comp = rows.filter((r) => !r.channel.mine && r.ageDays <= o.days && r.multiple !== null);
  if (comp.length < 5) return [];
  const nicheOut = comp.filter((r) => r.multiple! >= o.outlier).length;
  const nicheRate = nicheOut / comp.length;
  const values = (r: Row): Array<[Pattern["dimension"], string]> => {
    const c = r.concept;
    const out: Array<[Pattern["dimension"], string]> = [];
    for (const ch of c?.characters ?? []) out.push(["character", ch]);
    for (const f of c?.franchises ?? []) out.push(["franchise", f]);
    if (c?.format) out.push(["format", FORMAT_LABEL[c.format] ?? c.format]);
    if (c?.trend) out.push(["trend", c.trend]);
    if (c?.shape && c.shape.includes("*") && c.shape !== "*") out.push(["title", c.shape.replace(/\*/g, "…")]);
    const len = lengthBucket(r.video.durationS);
    if (len) out.push(["length", len]);
    out.push(["day", WEEKDAY[r.video.publishedAt.getUTCDay()]!]);
    return out;
  };
  const groups = new Map<string, { dim: Pattern["dimension"]; value: string; rows: Row[] }>();
  for (const r of comp) {
    for (const [dim, value] of values(r)) {
      const k = `${dim}|${value.toLowerCase()}`;
      if (!groups.has(k)) groups.set(k, { dim, value, rows: [] });
      groups.get(k)!.rows.push(r);
    }
  }
  const out: Pattern[] = [];
  for (const g of groups.values()) {
    const outs = g.rows.filter((r) => r.multiple! >= o.outlier).sort((a, b) => b.multiple! - a.multiple!);
    const channels = new Set(outs.map((r) => r.channel.id)).size;
    const rate = outs.length / g.rows.length;
    if (outs.length < 2 || channels < 2 || rate < Math.max(0.01, nicheRate) * 1.5) continue;
    const name = DIM_LABEL[g.dim] ? `${DIM_LABEL[g.dim]} “${g.value}”` : g.value;
    out.push({
      dimension: g.dim, value: g.value, videos: g.rows.length, outliers: outs.length, channels, rate, nicheRate,
      medianMultiple: median(g.rows.map((r) => r.multiple!)), examples: outs.slice(0, 4),
      fact: `${name}: ${outs.length} of ${g.rows.length} videos were ${o.outlier}×+ outliers (${Math.round(rate * 100)}%, against ${Math.round(nicheRate * 100)}% across the niche), from ${channels} channels, in the last ${o.days} days.`,
    });
  }
  return out.sort((a, b) => b.outliers * (b.rate / Math.max(nicheRate, 0.01)) - a.outliers * (a.rate / Math.max(nicheRate, 0.01))).slice(0, 12);
}

// ── emerging ───────────────────────────────────────────────────────────────

export interface Emerging {
  label: string;
  kind: "concept" | "trend" | "character";
  /** Uploads on it in the last 14 days, by how many channels, and how those did so far. */
  videos: Row[];
  channels: number;
  scored: number;
  medianMultiple: number | null;
  /** Uploads on it in the 14 days before that: is it new? */
  before: number;
  fact: string;
}

/** Several channels picking something up in the last two weeks, doing above their normal where it can be told yet. */
export function emergingTopics(rows: Row[], o: { outlier: number }): Emerging[] {
  const comp = rows.filter((r) => !r.channel.mine && r.concept);
  const keysOf = (r: Row): Array<[Emerging["kind"], string]> => [
    ...(conceptKey(r.concept!) ? [["concept", conceptLabel(r.concept!)] as [Emerging["kind"], string]] : []),
    ...(r.concept!.trend ? [["trend", r.concept!.trend] as [Emerging["kind"], string]] : []),
    ...r.concept!.characters.map((c) => ["character", c] as [Emerging["kind"], string]),
  ];
  const now = new Map<string, { kind: Emerging["kind"]; label: string; rows: Row[]; before: number }>();
  for (const r of comp) {
    for (const [kind, label] of keysOf(r)) {
      const k = `${kind}|${label.toLowerCase()}`;
      if (!now.has(k)) now.set(k, { kind, label, rows: [], before: 0 });
      const g = now.get(k)!;
      if (r.ageDays <= 14) g.rows.push(r);
      else if (r.ageDays <= 28) g.before += 1;
    }
  }
  const out: Emerging[] = [];
  for (const g of now.values()) {
    const channels = new Set(g.rows.map((r) => r.channel.id)).size;
    if (channels < 2) continue;
    const scored = g.rows.filter((r) => r.multiple !== null);
    const med = median(scored.map((r) => r.multiple!));
    // Rising: more channels on it than the fortnight before, and doing above normal where it can be told — or three channels at once.
    if (!((med !== null && med >= 1.5 && g.rows.length > g.before) || channels >= 3)) continue;
    out.push({
      label: g.label, kind: g.kind, videos: g.rows.sort((a, b) => (b.multiple ?? 0) - (a.multiple ?? 0)), channels, scored: scored.length, medianMultiple: med, before: g.before,
      fact: `${channels} channels uploaded ${g.rows.length} video${g.rows.length === 1 ? "" : "s"} on ${g.label} in the last 14 days (${g.before} in the 14 before)` +
        (med !== null ? `; ${scored.length} can be judged so far, at a median ${med.toFixed(1)}× their channels' normal.` : "; too new to judge against their channels' normal yet."),
    });
  }
  return out.sort((a, b) => b.channels - a.channels || (b.medianMultiple ?? 0) - (a.medianMultiple ?? 0)).slice(0, 8);
}

// ── my position ────────────────────────────────────────────────────────────

export interface Position {
  stats: ChannelStats[];
  /** The niche's median of each, competitors only. */
  niche: { medianViews: number | null; medianPerDay: number | null; perWeek: number | null; outlierRate: number | null; outlierStrength: number | null; momentum: number | null };
}

export function myPosition(stats: ChannelStats[]): Position {
  const comp = stats.filter((s) => !s.channel.mine);
  const med = (f: (s: ChannelStats) => number | null) => median(comp.map(f).filter((n): n is number => n !== null));
  return {
    stats: [...stats].sort((a, b) => (b.medianViews ?? -1) - (a.medianViews ?? -1)),
    niche: { medianViews: med((s) => s.medianViews), medianPerDay: med((s) => s.medianPerDay), perWeek: med((s) => s.perWeek), outlierRate: med((s) => s.outlierRate), outlierStrength: med((s) => s.outlierStrength), momentum: med((s) => s.momentum) },
  };
}
