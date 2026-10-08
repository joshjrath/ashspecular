/**
 * Network alerts: changes worth a line in the bell. Each detector is a plain
 * rule over the same figures the page shows, and each alert has a key so it
 * fires once (a decline once a week, an outlier once per video). New kinds go
 * in DETECTORS; they reach the bell through network_alerts, the same as the
 * board's other notices.
 */
import { ORG_TZ, dateIn, shiftDate } from "../parse/derive.js";
import { compareOn, figuresOf, MIN_COVERAGE, type Index, viewCoverage } from "./compute.js";
import { usualGapDays, type VideoScore } from "./insights.js";
import type { Division, NetChannel, NetVideo } from "./types.js";

export interface NetworkAlert {
  key: string;
  kind: "decline" | "outlier" | "quiet" | "network-drop" | "division-surge";
  channel: string | null;
  text: string;
  href: string | null;
}

export interface AlertInput {
  channels: NetChannel[];
  divisions: Division[];
  ix: Index;
  videos: NetVideo[];
  scores: Map<string, VideoScore>;
  today: string;
  now: Date;
}

/** A sustained fall: 14 days against the 14 before, 30% down, with readings for both. */
export const DECLINE = { days: 14, change: -0.3 };
/** A video far above its channel's usual: 5× for long-form, or a viral Short. */
export const STRONG_OUTLIER = 5;
/** The whole selection's views, 7 days against 7: this far down is news. */
export const NETWORK_DROP = -0.25;
/** A division's views, 7 days against 7: this far up is unusual. */
export const DIVISION_SURGE = 0.5;

const yesterdayOf = (today: string) => shiftDate(today, -1);
const windows = (today: string, days: number) => {
  const to = yesterdayOf(today);
  const from = shiftDate(to, -(days - 1));
  return { cur: { from, to }, prev: { from: shiftDate(from, -days), to: shiftDate(from, -1) } };
};
/** The Monday-based week a date falls in, so a weekly alert has one key per week. */
const weekKey = (day: string) => {
  const d = new Date(`${day}T12:00:00Z`);
  const monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000);
  return monday.toISOString().slice(0, 10);
};
const pct = (x: number) => `${Math.abs(Math.round(x * 100))}%`;

function declines(a: AlertInput): NetworkAlert[] {
  const w = windows(a.today, DECLINE.days);
  const out: NetworkAlert[] = [];
  for (const c of a.channels) {
    const cur = figuresOf(a.ix, c, w.cur, "all");
    const prev = figuresOf(a.ix, c, w.prev, "all");
    if (viewCoverage(cur) < MIN_COVERAGE || viewCoverage(prev) < MIN_COVERAGE || cur.views === null || prev.views === null || prev.views < 1000) continue;
    const change = (cur.views - prev.views) / prev.views;
    if (change > DECLINE.change) continue;
    out.push({
      key: `decline:${c.name}:${weekKey(a.today)}`, kind: "decline", channel: c.name,
      text: `${c.name}: views down ${pct(change)} over the last 14 days against the 14 before (${cur.uploads.total} uploads vs ${prev.uploads.total}).`,
      href: `/network?ch=${encodeURIComponent(c.id)}&range=28d`,
    });
  }
  return out;
}

function outliers(a: AlertInput): NetworkAlert[] {
  const weekAgo = a.now.getTime() - 7 * 86_400_000;
  return a.videos
    .filter((v) => v.publishedAt.getTime() >= weekAgo)
    .filter((v) => {
      const s = a.scores.get(v.videoId);
      return s?.multiple != null && (v.format === "long" ? s.multiple >= STRONG_OUTLIER : s.outlier && s.multiple >= STRONG_OUTLIER);
    })
    .map((v) => ({
      key: `outlier:${v.videoId}`, kind: "outlier" as const, channel: v.channel,
      text: `${v.channel}: "${v.title.slice(0, 80)}" is at ${a.scores.get(v.videoId)!.multiple!.toFixed(1)}× its usual ${v.format === "short" ? "Short" : "video"}.`,
      href: v.url,
    }));
}

function quiet(a: AlertInput): NetworkAlert[] {
  const out: NetworkAlert[] = [];
  for (const c of a.channels) {
    const mine = a.videos.filter((v) => v.channel === c.name).map((v) => v.publishedAt);
    const recent = mine.filter((d) => a.now.getTime() - d.getTime() <= 60 * 86_400_000);
    if (recent.length < 4) continue;
    const gap = usualGapDays(mine);
    const last = Math.max(...mine.map((d) => d.getTime()));
    const since = (a.now.getTime() - last) / 86_400_000;
    if (gap === null || since < Math.max(7, gap * 3)) continue;
    const lastDay = new Date(last).toISOString().slice(0, 10);
    out.push({
      key: `quiet:${c.name}:${lastDay}`, kind: "quiet", channel: c.name,
      text: `${c.name} hasn't uploaded for ${Math.floor(since)} days; it usually uploads every ${gap < 1.5 ? "day" : `${Math.round(gap)} days`}.`,
      href: `/network?ch=${encodeURIComponent(c.id)}&range=30d`,
    });
  }
  return out;
}

function networkDrop(a: AlertInput): NetworkAlert[] {
  const w = windows(a.today, 7);
  const ch = compareOn(a.channels.map((c) => figuresOf(a.ix, c, w.cur, "all")), a.channels.map((c) => figuresOf(a.ix, c, w.prev, "all")), (f) => f.views, viewCoverage, "lfl");
  if (ch.change === null || ch.change > NETWORK_DROP) return [];
  return [{
    key: `network-drop:${weekKey(a.today)}`, kind: "network-drop", channel: null,
    text: `Network views down ${pct(ch.change)} over the last 7 days against the 7 before (${ch.channels} channels compared like for like).`,
    href: "/network?range=7d",
  }];
}

function divisionSurge(a: AlertInput): NetworkAlert[] {
  const w = windows(a.today, 7);
  const out: NetworkAlert[] = [];
  for (const d of a.divisions) {
    const members = a.channels.filter((c) => c.divisionId === d.id);
    if (!members.length) continue;
    const ch = compareOn(members.map((c) => figuresOf(a.ix, c, w.cur, "all")), members.map((c) => figuresOf(a.ix, c, w.prev, "all")), (f) => f.views, viewCoverage, "lfl");
    if (ch.change === null || ch.change < DIVISION_SURGE) continue;
    out.push({
      key: `division-surge:${d.id}:${weekKey(a.today)}`, kind: "division-surge", channel: null,
      text: `${d.name}: views up ${pct(ch.change)} over the last 7 days against the 7 before.`,
      href: `/network?div=${encodeURIComponent(d.id)}&range=7d`,
    });
  }
  return out;
}

export const DETECTORS: Array<(a: AlertInput) => NetworkAlert[]> = [declines, outliers, quiet, networkDrop, divisionSurge];

export function detectAlerts(a: AlertInput): NetworkAlert[] {
  return DETECTORS.flatMap((d) => d(a));
}

/** Look for alerts over the whole network and keep the new ones for the bell. */
export async function findAlerts(now = new Date()): Promise<number> {
  const { loadDataset } = await import("./dataset.js");
  const { saveAlert } = await import("../db/network.js");
  // Two 14-day windows ending yesterday, and a margin.
  const ds = await loadDataset({ from: shiftDate(dateIn(ORG_TZ, now), -40), scoreSince: 14, now });
  let added = 0;
  for (const alert of detectAlerts({ channels: ds.channels.filter((c) => c.active), divisions: ds.divisions, ix: ds.ix, videos: ds.videos, scores: ds.scores, today: ds.today, now })) {
    if (await saveAlert(alert)) added += 1;
  }
  return added;
}
