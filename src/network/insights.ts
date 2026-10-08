/**
 * What Network Overview reads off the figures: which videos stand out (the
 * board's own outlier engines, not a new one), how new uploads are doing,
 * which channels are gaining or need attention and why, the network's
 * momentum, its health counts and its next milestones. Every label comes from
 * a stated rule, so the page can say why.
 */
import { BREAKOUT, median, scoreAll, viewsAtAge, type VideoViews } from "../web/performance.js";
import { scoreShorts } from "../web/shorts-perf.js";
import type { Snapshot } from "../jobs/youtube.js";
import { ORG_TZ, dateIn } from "../parse/derive.js";
import { rpmOn, type Figures, type Index, MIN_COVERAGE, viewCoverage } from "./compute.js";
import type { Division, FormatPick, NetChannel, NetVideo } from "./types.js";

const DAY = 86_400_000;

// ── videos ──────────────────────────────────────────────────────────────────

export interface VideoScore {
  /** Against the channel's usual for the same format (the board's engines). */
  multiple: number | null;
  outlier: boolean;
  basis: string | null;
  /** Views at 7 days, where the snapshots have it. */
  at7: number | null;
  /** Lifetime views ÷ days since upload. */
  perDay: number | null;
}

/**
 * Each video scored by the engine for its format: long-form against the
 * channel's last twenty at the same age (2× or more is a breakout), Shorts
 * against its last sixty Shorts (2+ spreads above is a breakout). A video of
 * unknown format isn't scored.
 */
export function scoreVideos(videos: NetVideo[], snaps: Map<string, Snapshot[]>, now: Date): Map<string, VideoScore> {
  const asViews = (v: NetVideo): VideoViews => ({ videoId: v.videoId, channel: v.channel, publishedAt: v.publishedAt, views: v.views, snapshots: snaps.get(v.videoId) ?? [] });
  const long = videos.filter((v) => v.format === "long").map(asViews);
  const short = videos.filter((v) => v.format === "short").map(asViews);
  const longScores = scoreAll(long, now);
  const shortScores = scoreShorts(short, now);
  const out = new Map<string, VideoScore>();
  for (const v of [...long, ...short]) {
    const l = longScores.get(v.videoId);
    const s = shortScores.get(v.videoId);
    const ageDays = Math.max(1, (now.getTime() - v.publishedAt.getTime()) / DAY);
    out.set(v.videoId, {
      multiple: l?.multiple ?? s?.multiple ?? null,
      outlier: l ? l.multiple >= BREAKOUT : s ? s.tier === "breakout" || s.tier === "viral" : false,
      basis: l?.basis ?? s?.basis ?? null,
      at7: viewsAtAge(v, 168),
      perDay: v.views === null ? null : v.views / ageDays,
    });
  }
  return out;
}

export const inFormat = (v: NetVideo, fmt: FormatPick) => fmt === "all" || v.format === fmt;

export interface Efficiency {
  uploads: number;
  /** Uploads at least seven days old with views at 7 days known. */
  measured: number;
  /** Median views at 7 days of those: the same window for every video. */
  medianFirstWeek: number | null;
  /** Median of each measured upload's 7-day views at its own channel's RPM (estimated). */
  revenuePerUpload: number | null;
  /** Median lifetime views of each channel's last ten uploads a week old or more. */
  medianRecent: number | null;
  /** Share of scored uploads at or above their channel's usual. */
  beatRate: number | null;
  scored: number;
}

/**
 * How the uploads made in a range are doing, measured the same way for every
 * one: views at 7 days (not all views a channel earned that week ÷ its
 * uploads, which would credit new videos with the back catalogue's views).
 */
export function efficiencyOf(uploads: NetVideo[], all: NetVideo[], scores: Map<string, VideoScore>, ix: Index, now: Date): Efficiency {
  const week = now.getTime() - 7 * DAY;
  const measured = uploads.filter((v) => v.publishedAt.getTime() <= week && scores.get(v.videoId)?.at7 != null);
  const at7 = measured.map((v) => scores.get(v.videoId)!.at7!);
  const revs: number[] = [];
  for (const v of measured) {
    const r = rpmOn(ix.rpm.get(v.channel), dateIn(ORG_TZ, v.publishedAt));
    if (!r || r.currency !== ix.currency) continue;
    const rate = (v.format === "long" ? r.long : v.format === "short" ? r.short : null) ?? r.blended;
    if (rate !== null) revs.push((scores.get(v.videoId)!.at7! / 1000) * rate);
  }
  const recent: number[] = [];
  const byChannel = new Map<string, NetVideo[]>();
  for (const v of all) {
    if (v.publishedAt.getTime() > week || v.views === null) continue;
    if (!byChannel.has(v.channel)) byChannel.set(v.channel, []);
    byChannel.get(v.channel)!.push(v);
  }
  for (const list of byChannel.values()) {
    for (const v of list.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime()).slice(0, 10)) recent.push(v.views!);
  }
  const scored = uploads.map((v) => scores.get(v.videoId)?.multiple).filter((m): m is number => m !== null && m !== undefined);
  return {
    uploads: uploads.length,
    measured: measured.length,
    medianFirstWeek: median(at7),
    revenuePerUpload: median(revs),
    medianRecent: median(recent),
    beatRate: scored.length ? scored.filter((m) => m >= 1).length / scored.length : null,
    scored: scored.length,
  };
}

// ── gainers and needs attention ────────────────────────────────────────────

/** A channel needs at least this many days in the range, and this change, to be named either way. */
export const MOVER_MIN_DAYS = 7;
export const MOVER_CHANGE = 0.15;
/** …and this many views in the previous period, so a tiny channel's swing isn't news. */
export const MOVER_MIN_VIEWS = 1000;

export interface Mover {
  channel: NetChannel;
  change: number;
  cur: number;
  prev: number;
  uploadsCur: number;
  uploadsPrev: number;
  reason: string;
}

const pctText = (x: number) => `${Math.abs(Math.round(x * 100))}%`;

/** Why a channel moved, in words: the change, and what upload frequency did meanwhile. */
export function moverReason(change: number, uploadsCur: number, uploadsPrev: number, prevLabel: string): string {
  const dir = change >= 0 ? "rose" : "fell";
  const ups =
    uploadsPrev === 0 && uploadsCur === 0
      ? "with no uploads in either period"
      : uploadsPrev > 0 && Math.abs(uploadsCur - uploadsPrev) / uploadsPrev <= 0.15
        ? `while upload frequency stayed similar (${uploadsCur} vs ${uploadsPrev})`
        : uploadsCur > uploadsPrev
          ? `with more uploads (${uploadsCur} vs ${uploadsPrev})`
          : `with fewer uploads (${uploadsCur} vs ${uploadsPrev})`;
  return `Views ${dir} ${pctText(change)} versus ${prevLabel}, ${ups}.`;
}

/**
 * Channels whose views moved meaningfully: enough readings in both periods
 * (like-for-like), a range of a week or more, a real base, and 15% either
 * way. One weak day can't put a channel here.
 */
export function moversOf(cur: Figures[], prev: Figures[], prevLabel: string): { gainers: Mover[]; attention: Mover[] } {
  const prevBy = new Map(prev.map((f) => [f.channel.name, f]));
  const list: Mover[] = [];
  for (const f of cur) {
    const p = prevBy.get(f.channel.name);
    if (!p || f.days < MOVER_MIN_DAYS || viewCoverage(f) < MIN_COVERAGE || viewCoverage(p) < MIN_COVERAGE) continue;
    if (f.views === null || p.views === null || p.views < MOVER_MIN_VIEWS) continue;
    const change = (f.views - p.views) / p.views;
    if (Math.abs(change) < MOVER_CHANGE) continue;
    list.push({ channel: f.channel, change, cur: f.views, prev: p.views, uploadsCur: f.uploads.total, uploadsPrev: p.uploads.total, reason: moverReason(change, f.uploads.total, p.uploads.total, prevLabel) });
  }
  return {
    gainers: list.filter((m) => m.change > 0).sort((a, b) => b.change - a.change),
    attention: list.filter((m) => m.change < 0).sort((a, b) => a.change - b.change),
  };
}

// ── momentum ────────────────────────────────────────────────────────────────

/** Views over the last 7 days against the 7 before: this much either way is accelerating or declining. */
export const MOMENTUM_BAND = 0.05;
export type Trend = "accelerating" | "stable" | "declining";
export const trendOf = (change: number | null): Trend | null =>
  change === null ? null : change >= MOMENTUM_BAND ? "accelerating" : change <= -MOMENTUM_BAND ? "declining" : "stable";

/**
 * Splits a change in views into what uploading more (or less) did and what
 * each new video did: upload count change, and the change in the median
 * first-week views of the uploads. Said only when both are measured.
 */
export function explainChange(viewsChange: number | null, uploadsCur: number, uploadsPrev: number, firstWeekCur: number | null, firstWeekPrev: number | null): string | null {
  if (viewsChange === null) return null;
  const parts: string[] = [];
  if (uploadsPrev > 0) {
    const u = (uploadsCur - uploadsPrev) / uploadsPrev;
    parts.push(Math.abs(u) < 0.05 ? "uploads held steady" : `uploads ${u > 0 ? "rose" : "fell"} ${pctText(u)}`);
  }
  if (firstWeekCur !== null && firstWeekPrev !== null && firstWeekPrev > 0) {
    const w = (firstWeekCur - firstWeekPrev) / firstWeekPrev;
    parts.push(Math.abs(w) < 0.05 ? "each new video's first week was about the same" : `each new video's first week ${w > 0 ? "rose" : "fell"} ${pctText(w)} (median)`);
  }
  if (!parts.length) return null;
  return `Views ${viewsChange >= 0 ? "up" : "down"} ${pctText(viewsChange)}: ${parts.join(", while ")}.`;
}

// ── health ──────────────────────────────────────────────────────────────────

export const HEALTH_CHANGE = 0.1;
export const QUIET_DAYS = 14;

export interface Health {
  growing: string[];
  declining: string[];
  /** No upload in the last QUIET_DAYS days. */
  quiet: string[];
  /** Last upload older than twice its usual gap (and three days). */
  behind: Array<{ channel: string; daysSince: number; usualGap: number }>;
  /** Outlier uploads in the last seven days. */
  outliersThisWeek: number;
  /** The division whose views grew most (like-for-like), if any did. */
  leadingDivision: { name: string; gained: number } | null;
}

/** A channel's usual gap between uploads: the median of its last ten gaps, in days. */
export function usualGapDays(publishedAt: Date[]): number | null {
  const sorted = [...publishedAt].sort((a, b) => b.getTime() - a.getTime()).slice(0, 11);
  if (sorted.length < 4) return null;
  const gaps = sorted.slice(1).map((d, i) => (sorted[i]!.getTime() - d.getTime()) / DAY);
  return median(gaps);
}

export function healthOf(cur: Figures[], prev: Figures[], videos: NetVideo[], scores: Map<string, VideoScore>, divisions: Division[], fmt: FormatPick, now: Date): Health {
  const prevBy = new Map(prev.map((f) => [f.channel.name, f]));
  const growing: string[] = [];
  const declining: string[] = [];
  const divGain = new Map<string, number>();
  for (const f of cur) {
    const p = prevBy.get(f.channel.name);
    if (!p || viewCoverage(f) < MIN_COVERAGE || viewCoverage(p) < MIN_COVERAGE || f.views === null || p.views === null || p.views <= 0) continue;
    const change = (f.views - p.views) / p.views;
    if (change >= HEALTH_CHANGE) growing.push(f.channel.name);
    if (change <= -HEALTH_CHANGE) declining.push(f.channel.name);
    if (f.channel.divisionId) divGain.set(f.channel.divisionId, (divGain.get(f.channel.divisionId) ?? 0) + (f.views - p.views));
  }
  const quiet: string[] = [];
  const behind: Health["behind"] = [];
  for (const f of cur) {
    const mine = videos.filter((v) => v.channel === f.channel.name && inFormat(v, fmt)).map((v) => v.publishedAt);
    if (!mine.length) continue;
    const last = Math.max(...mine.map((d) => d.getTime()));
    const since = (now.getTime() - last) / DAY;
    if (since >= QUIET_DAYS) quiet.push(f.channel.name);
    const gap = usualGapDays(mine);
    if (gap !== null && since > Math.max(3, gap * 2) && since < QUIET_DAYS) behind.push({ channel: f.channel.name, daysSince: Math.floor(since), usualGap: Math.round(gap * 10) / 10 });
  }
  const weekAgo = now.getTime() - 7 * DAY;
  const outliersThisWeek = videos.filter((v) => v.publishedAt.getTime() >= weekAgo && inFormat(v, fmt) && scores.get(v.videoId)?.outlier).length;
  const top = [...divGain].filter(([, g]) => g > 0).sort((a, b) => b[1] - a[1])[0];
  const leadingDivision = top ? { name: divisions.find((d) => d.id === top[0])?.name ?? top[0], gained: top[1] } : null;
  return { growing, declining, quiet, behind, outliersThisWeek, leadingDivision };
}

// ── milestones ──────────────────────────────────────────────────────────────

/** The next round number above n: 1, 2.5 and 5 of each power of ten. */
export function nextMilestone(n: number): number {
  if (n < 1) return 1;
  const p = 10 ** Math.floor(Math.log10(n));
  for (const m of [1, 2.5, 5, 10]) if (m * p > n) return m * p;
  return 10 * p;
}

export interface Milestone {
  label: string;
  current: number;
  target: number;
  money?: boolean;
}

export function milestonesOf(m: { subscribers: number | null; lifetimeViews: number | null; uploads: number; monthRevenue: number | null; bestDay: number | null }): Milestone[] {
  const out: Milestone[] = [];
  if (m.subscribers !== null && m.subscribers > 0) out.push({ label: "combined subscribers", current: m.subscribers, target: nextMilestone(m.subscribers) });
  if (m.lifetimeViews !== null && m.lifetimeViews > 0) out.push({ label: "total network views", current: m.lifetimeViews, target: nextMilestone(m.lifetimeViews) });
  if (m.uploads > 0) out.push({ label: "tracked uploads", current: m.uploads, target: nextMilestone(m.uploads) });
  if (m.monthRevenue !== null && m.monthRevenue > 0) out.push({ label: "est. revenue this month", current: m.monthRevenue, target: nextMilestone(m.monthRevenue), money: true });
  if (m.bestDay !== null && m.bestDay > 0) out.push({ label: "views in a day (best in range)", current: m.bestDay, target: nextMilestone(m.bestDay) });
  return out;
}
