/**
 * Network Overview, worked out for one query: which channels are selected,
 * the period and its comparison, and every section's figures. Every section
 * reads the same selection, format and period, so a filter changes all of
 * them at once.
 */
import { ORG_TZ, dateIn, shiftDate } from "../parse/derive.js";
import {
  byDivision, compareOn, figuresOf, fullCoverage, seriesOf, subCoverage, totalsOf, viewCoverage,
  type Change, type CompareMode, type Figures, type Metric, type Series, type Split, type Totals,
  dayMetric,
} from "./compute.js";
import { eachDay, isPreset, periodOf, type Period, type PresetId, type Range } from "./period.js";
import {
  efficiencyOf, explainChange, healthOf, inFormat, milestonesOf, moversOf, trendOf,
  type Efficiency, type Health, type Milestone, type Mover, type Trend, type VideoScore,
} from "./insights.js";
import type { Dataset } from "./dataset.js";
import type { Division, FormatPick, NetChannel, NetVideo } from "./types.js";

// ── the query ───────────────────────────────────────────────────────────────

export type LeaderSort = "views" | "revenue" | "subs" | "subsNow" | "uploads" | "perUpload" | "recent" | "rpm" | "growth" | "momentum" | "outliers";
export const LEADER_SORTS: Array<{ id: LeaderSort; label: string }> = [
  { id: "views", label: "Views" }, { id: "revenue", label: "Est. revenue" }, { id: "subs", label: "Subscriber growth" }, { id: "subsNow", label: "Subscribers" },
  { id: "uploads", label: "Uploads" }, { id: "perUpload", label: "Views per upload (first week)" }, { id: "recent", label: "Median recent video" },
  { id: "rpm", label: "Est. RPM" }, { id: "growth", label: "Growth %" }, { id: "momentum", label: "Momentum (7 days)" }, { id: "outliers", label: "Outlier rate" },
];
export type VideoSort = "views" | "perday" | "multiple" | "date";
export type Contribution = "revenue" | "views" | "subs" | "uploads";
export type DivisionSort = "name" | "views" | "revenue" | "subs" | "uploads";

export interface NetQuery {
  divisions: string[];
  channels: string[];
  fmt: FormatPick;
  preset: PresetId;
  from?: string;
  to?: string;
  cmp: CompareMode;
  metric: Metric;
  split: Split;
  contrib: Contribution;
  dsort: DivisionSort;
  lsort: LeaderSort;
  /** Leaderboard: absolute figures, or relative to each channel's size. */
  lmode: "abs" | "rel";
  vsort: VideoSort;
  /** A scenario network RPM to try, never saved. */
  scenario: number | null;
}

const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);
const list = (v: unknown) => [...new Set(String(Array.isArray(v) ? v.join(",") : v ?? "").split(",").map((x) => x.trim()).filter(Boolean))].slice(0, 100);

/** A query from the address, every value checked against what it may be. */
export function readQuery(q: Record<string, unknown>, known: { divisions: string[]; channels: string[] }, fallback: PresetId = "28d"): NetQuery {
  const scenario = Number(q.scn);
  return {
    divisions: list(q.div).filter((d) => known.divisions.includes(d)),
    channels: list(q.ch).filter((c) => known.channels.includes(c)),
    fmt: pick(q.fmt, ["all", "long", "short"] as const, "all"),
    preset: isPreset(q.range) ? q.range : fallback,
    from: typeof q.from === "string" ? q.from : undefined,
    to: typeof q.to === "string" ? q.to : undefined,
    cmp: pick(q.cmp, ["lfl", "current"] as const, "lfl"),
    metric: pick(q.metric, ["views", "revenue", "subs", "uploads"] as const, "views"),
    split: pick(q.split, ["total", "division", "channel"] as const, "total"),
    contrib: pick(q.contrib, ["revenue", "views", "subs", "uploads"] as const, "revenue"),
    dsort: pick(q.dsort, ["name", "views", "revenue", "subs", "uploads"] as const, "views"),
    lsort: pick(q.lsort, LEADER_SORTS.map((s) => s.id), "views"),
    lmode: pick(q.lmode, ["abs", "rel"] as const, "abs"),
    vsort: pick(q.vsort, ["views", "perday", "multiple", "date"] as const, "views"),
    scenario: Number.isFinite(scenario) && scenario > 0 && scenario <= 100 ? Math.round(scenario * 100) / 100 : null,
  };
}

/** The query as address parameters, with some changed: every link on the page keeps the rest. */
export function queryString(q: NetQuery, change: Partial<NetQuery> = {}): string {
  const n = { ...q, ...change };
  const p = new URLSearchParams();
  if (n.divisions.length) p.set("div", n.divisions.join(","));
  if (n.channels.length) p.set("ch", n.channels.join(","));
  if (n.fmt !== "all") p.set("fmt", n.fmt);
  // Always written: the range a page opens on changes once there's history.
  p.set("range", n.preset);
  if (n.preset === "custom") { if (n.from) p.set("from", n.from); if (n.to) p.set("to", n.to); }
  if (n.cmp !== "lfl") p.set("cmp", n.cmp);
  if (n.metric !== "views") p.set("metric", n.metric);
  if (n.split !== "total") p.set("split", n.split);
  if (n.contrib !== "revenue") p.set("contrib", n.contrib);
  if (n.dsort !== "views") p.set("dsort", n.dsort);
  if (n.lsort !== "views") p.set("lsort", n.lsort);
  if (n.lmode !== "abs") p.set("lmode", n.lmode);
  if (n.vsort !== "views") p.set("vsort", n.vsort);
  if (n.scenario !== null) p.set("scn", String(n.scenario));
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** Which channels a query means: picked channels, else the picked divisions', else every active one. */
export function selectChannels(all: NetChannel[], q: Pick<NetQuery, "divisions" | "channels">): NetChannel[] {
  const active = all.filter((c) => c.active);
  if (q.channels.length) return active.filter((c) => q.channels.includes(c.id));
  if (q.divisions.length) return active.filter((c) => c.divisionId !== null && q.divisions.includes(c.divisionId));
  return active;
}

// ── the overview ────────────────────────────────────────────────────────────

export interface LeaderRow {
  f: Figures;
  prev: Figures | null;
  growth: number | null;
  momentum: number | null;
  perUpload: number | null;
  recent: number | null;
  rpm: number | null;
  outlierRate: number | null;
  /** Views per 1,000 subscribers, for the relative view. */
  viewsPerKSub: number | null;
  divisionName: string;
}

export interface Overview {
  q: NetQuery;
  period: Period;
  today: string;
  divisions: Division[];
  /** Every active channel, for the filters. */
  pool: NetChannel[];
  selected: NetChannel[];
  cur: Figures[];
  totals: Totals;
  prevTotals: Totals | null;
  changes: { views: Change | null; revenue: Change | null; subs: Change | null; uploads: Change | null };
  /** Daily totals of the period, for the tiles' small trends. */
  sparks: Record<Metric, Array<number | null>>;
  chart: { days: string[]; series: Series[] };
  divisionRows: Array<{ division: Division; totals: Totals; viewsChange: Change | null }>;
  leaders: LeaderRow[];
  movers: { gainers: Mover[]; attention: Mover[]; range: Range & { label: string }; prevLabel: string; widened: boolean };
  momentum: Momentum;
  health: Health;
  top: Array<{ video: NetVideo; channel: NetChannel; score: VideoScore | null }>;
  uploads: UploadView;
  milestones: Milestone[];
  /** The network RPM, and revenue at the scenario RPM (same views). */
  scenario: { rpm: number | null; at: number | null; revenue: number | null; scenarioRevenue: number | null };
  currency: string;
  /** In the period, the earliest first reading a channel's figures count from; null when every day has the day before. */
  startedAt: Date | null;
  /** Selected channels connected to YouTube Analytics, and the last day YouTube has for all of them. */
  analytics: { connected: number; through: string | null };
}

export interface Momentum {
  views7: Change;
  views30: Change;
  revenue30: Change;
  subs30: Change;
  uploads30: Change;
  avgDailyViews: number | null;
  avgDailyRevenue: number | null;
  trend: Trend | null;
  explain: string | null;
}

export interface UploadView {
  long: number;
  short: number;
  unknown: number;
  total: number;
  prevTotal: number | null;
  perDay: number;
  /** Per day of the period, for the activity calendar. */
  byDay: Array<{ day: string; n: number }>;
  byDivision: Array<{ division: Division; n: number }>;
  byChannel: Array<{ channel: NetChannel; n: number; perWeek: number }>;
  efficiency: Efficiency;
  prevEfficiency: Efficiency | null;
}

const sumNullable = (xs: Array<number | null>) => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) : null;
};

function windowsBefore(today: string, days: number): { cur: Range; prev: Range } {
  const to = shiftDate(today, -1);
  const from = shiftDate(to, -(days - 1));
  return { cur: { from, to }, prev: { from: shiftDate(from, -days), to: shiftDate(from, -1) } };
}

/** The first day Network Overview's "all data" starts on: the earliest reading or upload, at most three years back. */
export function firstDayOf(ds: Pick<Dataset, "ix" | "videos" | "today">): string {
  let first = ds.today;
  for (const days of ds.ix.totals.values()) for (const d of days.keys()) if (d < first) first = d;
  const earliestUpload = ds.videos.reduce((m, v) => Math.min(m, v.publishedAt.getTime()), Infinity);
  if (Number.isFinite(earliestUpload)) {
    const d = new Date(earliestUpload).toISOString().slice(0, 10);
    if (d < first) first = d;
  }
  return first < shiftDate(ds.today, -1095) ? shiftDate(ds.today, -1095) : first;
}

export function buildOverview(ds: Dataset, q: NetQuery, now: Date): Overview {
  const period = periodOf(q.preset, ds.today, { from: q.from, to: q.to, firstDay: firstDayOf(ds), firstRead: ds.firstRead });
  const pool = ds.channels.filter((c) => c.active);
  const selected = selectChannels(ds.channels, q);
  const { ix } = ds;
  const fmt = q.fmt;
  const cur = selected.map((c) => figuresOf(ix, c, period, fmt));
  const prev = period.prev ? selected.map((c) => figuresOf(ix, c, period.prev!, fmt)) : null;
  const totals = totalsOf(cur, ix, period, fmt);
  const prevTotals = prev && period.prev ? totalsOf(prev, ix, period.prev, fmt) : null;
  const cmp = (value: (f: Figures) => number | null, cov: (f: Figures) => number) => (prev ? compareOn(cur, prev, value, cov, q.cmp) : null);
  const changes = {
    views: cmp((f) => f.views, viewCoverage),
    revenue: cmp((f) => f.revenue, viewCoverage),
    subs: cmp((f) => f.subs, subCoverage),
    uploads: cmp((f) => f.uploads.total, fullCoverage),
  };
  const days = eachDay(period);
  const sparkOf = (metric: Metric) => days.map((day) => sumNullable(selected.map((c) => dayMetric(ix, c.name, day, fmt, metric))));
  const sparks = { views: sparkOf("views"), revenue: sparkOf("revenue"), subs: sparkOf("subs"), uploads: sparkOf("uploads") };
  const chart = seriesOf(ix, selected, ds.divisions, period, fmt, q.metric, q.split);

  // Divisions: each channel once, in its primary division.
  const prevByDivision = new Map((prev && period.prev ? byDivision(prev, ds.divisions, ix, period.prev, fmt) : []).map((d) => [d.division.id, d]));
  const divisionRows = byDivision(cur, ds.divisions, ix, period, fmt).map((d) => {
    const members = cur.filter((f) => f.channel.divisionId === d.division.id);
    const pm = prev?.filter((f) => f.channel.divisionId === d.division.id) ?? null;
    return { division: d.division, totals: d.totals, viewsChange: pm && prevByDivision.has(d.division.id) ? compareOn(members, pm, (f) => f.views, viewCoverage, q.cmp) : null };
  });

  // Videos: the selection's uploads of the format, each on its day in the studio's time zone.
  const names = new Set(selected.map((c) => c.name));
  const mine = ds.videos.filter((v) => names.has(v.channel) && inFormat(v, fmt));
  const dayOfVideo = new Map(mine.map((v) => [v.videoId, dateIn(ORG_TZ, v.publishedAt)]));
  const uploadsIn = (r: Range) => mine.filter((v) => { const d = dayOfVideo.get(v.videoId)!; return d >= r.from && d <= r.to; });
  const periodUploads = uploadsIn(period);

  // Leaderboard.
  const w7 = windowsBefore(ds.today, 7);
  const prevBy = new Map((prev ?? []).map((f) => [f.channel.name, f]));
  const leaders: LeaderRow[] = cur.map((f) => {
    const p = prevBy.get(f.channel.name) ?? null;
    const ok = (x: Figures | null) => x && viewCoverage(x) >= 0.8 && x.views !== null;
    const growth = ok(f) && ok(p) && p!.views! > 0 ? (f.views! - p!.views!) / p!.views! : null;
    const m7c = figuresOf(ix, f.channel, w7.cur, fmt);
    const m7p = figuresOf(ix, f.channel, w7.prev, fmt);
    const momentum = ok(m7c) && ok(m7p) && m7p.views! > 0 ? (m7c.views! - m7p.views!) / m7p.views! : null;
    const ups = periodUploads.filter((v) => v.channel === f.channel.name);
    const eff = efficiencyOf(ups, mine.filter((v) => v.channel === f.channel.name), ds.scores, ix, now);
    const scored = ups.map((v) => ds.scores.get(v.videoId)).filter((s): s is VideoScore => Boolean(s && s.multiple !== null));
    return {
      f, prev: p, growth, momentum,
      perUpload: eff.medianFirstWeek,
      recent: eff.medianRecent,
      rpm: f.revenue !== null && f.pricedViews > 0 ? (f.revenue / f.pricedViews) * 1000 : null,
      outlierRate: scored.length ? scored.filter((s) => s.outlier).length / scored.length : null,
      viewsPerKSub: f.views !== null && f.subsNow ? (f.views / f.subsNow) * 1000 : null,
      divisionName: ds.divisions.find((d) => d.id === f.channel.divisionId)?.name ?? "No division",
    };
  });
  const sortVal = (r: LeaderRow): number | null => {
    switch (q.lsort) {
      case "views": return q.lmode === "rel" ? r.viewsPerKSub : r.f.views;
      case "revenue": return r.f.revenue;
      case "subs": return q.lmode === "rel" && r.f.subs !== null && r.f.subsNow ? r.f.subs / r.f.subsNow : r.f.subs;
      case "subsNow": return r.f.subsNow;
      case "uploads": return r.f.uploads.total;
      case "perUpload": return r.perUpload;
      case "recent": return r.recent;
      case "rpm": return r.rpm;
      case "growth": return r.growth;
      case "momentum": return r.momentum;
      case "outliers": return r.outlierRate;
    }
  };
  leaders.sort((a, b) => (sortVal(b) ?? -Infinity) - (sortVal(a) ?? -Infinity) || a.f.channel.position - b.f.channel.position);

  // Gainers and needs attention: the period if it's a week or more, else the last 28 days.
  const widened = period.days < 7 || !period.prev;
  const mw = widened ? windowsBefore(ds.today, 28) : { cur: period as Range, prev: period.prev! };
  const mLabel = widened ? "the previous 28 days" : period.prev!.label;
  const mCur = widened ? selected.map((c) => figuresOf(ix, c, mw.cur, fmt)) : cur;
  const mPrev = widened ? selected.map((c) => figuresOf(ix, c, mw.prev, fmt)) : prev!;
  const mv = moversOf(mCur, mPrev, mLabel);

  // Momentum: fixed windows, whatever the period.
  const w30 = windowsBefore(ds.today, 30);
  const f7c = selected.map((c) => figuresOf(ix, c, w7.cur, fmt));
  const f7p = selected.map((c) => figuresOf(ix, c, w7.prev, fmt));
  const f30c = selected.map((c) => figuresOf(ix, c, w30.cur, fmt));
  const f30p = selected.map((c) => figuresOf(ix, c, w30.prev, fmt));
  const views7 = compareOn(f7c, f7p, (f) => f.views, viewCoverage, "lfl");
  const views30 = compareOn(f30c, f30p, (f) => f.views, viewCoverage, "lfl");
  const t30 = totalsOf(f30c, ix, w30.cur, fmt);
  // First-week views of uploads a week old: the 30 days before last week, against the 30 before that.
  const eff30 = efficiencyOf(uploadsIn({ from: shiftDate(w30.cur.from, -7), to: shiftDate(w30.cur.to, -7) }), mine, ds.scores, ix, now);
  const eff30p = efficiencyOf(uploadsIn({ from: shiftDate(w30.prev.from, -7), to: shiftDate(w30.prev.to, -7) }), mine, ds.scores, ix, now);
  const uploads30 = compareOn(f30c, f30p, (f) => f.uploads.total, fullCoverage, "lfl");
  const momentum: Momentum = {
    views7, views30,
    revenue30: compareOn(f30c, f30p, (f) => f.revenue, viewCoverage, "lfl"),
    subs30: compareOn(f30c, f30p, (f) => f.subs, subCoverage, "lfl"),
    uploads30,
    avgDailyViews: t30.views !== null && t30.viewDays ? t30.views / t30.viewDays : null,
    avgDailyRevenue: t30.revenue !== null && t30.viewDays ? t30.revenue / t30.viewDays : null,
    trend: trendOf(views7.change),
    explain: explainChange(views30.change, uploads30.cur ?? 0, uploads30.prev ?? 0, eff30.medianFirstWeek, eff30p.medianFirstWeek),
  };

  const health = healthOf(mCur, mPrev, mine, ds.scores, ds.divisions, fmt, now);

  // Top videos: uploaded in the period, best first by the chosen measure.
  const byName = new Map(selected.map((c) => [c.name, c]));
  const vKey = (v: NetVideo) => {
    const s = ds.scores.get(v.videoId);
    switch (q.vsort) {
      case "views": return v.views ?? -1;
      case "perday": return s?.perDay ?? -1;
      case "multiple": return s?.multiple ?? -1;
      case "date": return v.publishedAt.getTime();
    }
  };
  const top = [...periodUploads].sort((a, b) => vKey(b) - vKey(a)).slice(0, 25)
    .map((v) => ({ video: v, channel: byName.get(v.channel)!, score: ds.scores.get(v.videoId) ?? null }));

  // Uploads.
  const prevUploads = period.prev ? uploadsIn(period.prev) : null;
  const perDayCount = new Map<string, number>();
  for (const v of periodUploads) perDayCount.set(dayOfVideo.get(v.videoId)!, (perDayCount.get(dayOfVideo.get(v.videoId)!) ?? 0) + 1);
  const byDay = days.map((day) => ({ day, n: perDayCount.get(day) ?? 0 }));
  const uploads: UploadView = {
    long: periodUploads.filter((v) => v.format === "long").length,
    short: periodUploads.filter((v) => v.format === "short").length,
    unknown: periodUploads.filter((v) => v.format === "unknown").length,
    total: periodUploads.length,
    prevTotal: prevUploads ? prevUploads.length : null,
    perDay: periodUploads.length / Math.max(1, period.days),
    byDay,
    byDivision: ds.divisions
      .map((d) => ({ division: d, n: periodUploads.filter((v) => byName.get(v.channel)?.divisionId === d.id).length }))
      .filter((x) => x.n > 0),
    byChannel: selected
      .map((c) => { const n = periodUploads.filter((v) => v.channel === c.name).length; return { channel: c, n, perWeek: (n / Math.max(1, period.days)) * 7 }; })
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n),
    efficiency: efficiencyOf(periodUploads, mine, ds.scores, ix, now),
    prevEfficiency: prevUploads ? efficiencyOf(prevUploads, mine, ds.scores, ix, now) : null,
  };

  // Milestones: the selection as it stands.
  const latest = (pickOne: (d: { views: number | null; subscribers: number | null }) => number | null) =>
    sumNullable(selected.map((c) => {
      const t = ix.totals.get(c.name);
      if (!t) return null;
      const lastDay = [...t.keys()].sort().pop();
      return lastDay ? pickOne(t.get(lastDay)!) : null;
    }));
  const monthRange = { from: `${ds.today.slice(0, 8)}01`, to: ds.today };
  const monthRevenue = sumNullable(selected.map((c) => figuresOf(ix, c, monthRange, "all").revenue));
  const bestDay = sparks.views.reduce<number | null>((m, v) => (v !== null && (m === null || v > m) ? v : m), null);
  const milestones = milestonesOf({
    subscribers: latest((d) => d.subscribers),
    lifetimeViews: latest((d) => d.views),
    uploads: ds.videos.filter((v) => names.has(v.channel)).length,
    monthRevenue,
    bestDay,
  });

  const scenario = {
    rpm: totals.rpm,
    at: q.scenario,
    revenue: totals.revenue,
    scenarioRevenue: q.scenario !== null && totals.pricedViews > 0 ? (totals.pricedViews / 1000) * q.scenario : null,
  };

  // A channel's first day of readings in the period counts from its first reading.
  let startedAt: Date | null = null;
  for (const c of selected) {
    for (const [day, r] of ix.totals.get(c.name) ?? []) {
      if (r.first && day >= period.from && day <= period.to && !ix.analytics.get(c.name)?.has(day) && (!startedAt || r.first.at < startedAt)) startedAt = r.first.at;
    }
  }

  return {
    q, period, today: ds.today, divisions: ds.divisions, pool, selected, cur, totals, prevTotals, changes, sparks, chart, divisionRows, leaders,
    movers: { ...mv, range: { ...mw.cur, label: widened ? "Last 28 days" : period.label }, prevLabel: mLabel, widened },
    momentum, health, top, uploads, milestones, scenario, currency: ix.currency, startedAt,
    analytics: { connected: selected.filter((c) => ix.reach.has(c.name)).length, through: [...selected].map((c) => ix.reach.get(c.name)?.through ?? null).filter((d): d is string => d !== null).sort()[0] ?? null },
  };
}
