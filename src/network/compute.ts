/**
 * Network Overview's arithmetic, kept pure so it can be checked by hand.
 *
 * Views
 *   A channel's views on a day are its public total that day less the day
 *   before's (both read). A format's views are what that format's videos
 *   gained, read video by video. A day with no reading is unknown — never 0.
 *
 * Revenue (always an ESTIMATE)
 *   views ÷ 1,000 × the RPM in force that day, per channel and format:
 *   long-form views at the long-form RPM, Shorts at the Shorts RPM, and views
 *   that can't be told apart (the channel total beyond what its tracked videos
 *   gained) at the blended RPM. A format with no RPM of its own falls back to
 *   the blended one, and says so. No RPM at all: the channel is left out and
 *   counted as needing one, not added as $0.
 *
 * Network RPM is the estimated revenue ÷ the views it was worked out from ×
 * 1,000 — never an average of channel RPMs.
 */
import { ORG_TZ, dateIn, shiftDate } from "../parse/derive.js";
import { daysIn, eachDay, type Range } from "./period.js";
import type { ChannelDay, Division, FormatDay, FormatPick, NetChannel, NetVideo, RpmRow, VideoFormat } from "./types.js";

export type Metric = "views" | "revenue" | "subs" | "uploads";
export const METRICS: Array<{ id: Metric; label: string }> = [
  { id: "views", label: "Daily views" },
  { id: "revenue", label: "Daily est. revenue" },
  { id: "subs", label: "Daily subscriber growth" },
  { id: "uploads", label: "Daily uploads" },
];

/** Readings and videos indexed for quick lookups by channel and day. */
export interface Index {
  totals: Map<string, Map<string, ChannelDay>>;
  gains: Map<string, Map<string, Map<VideoFormat, number>>>;
  uploads: Map<string, Map<string, Record<VideoFormat, number>>>;
  rpm: Map<string, RpmRow[]>;
  /** The currency revenue is shown in: the one most channels use. */
  currency: string;
}

export function buildIndex(days: ChannelDay[], formats: FormatDay[], videos: NetVideo[], rpm: RpmRow[], tz = ORG_TZ): Index {
  const totals = new Map<string, Map<string, ChannelDay>>();
  for (const d of days) {
    if (!totals.has(d.channel)) totals.set(d.channel, new Map());
    totals.get(d.channel)!.set(d.day, d);
  }
  const gains = new Map<string, Map<string, Map<VideoFormat, number>>>();
  for (const f of formats) {
    if (!gains.has(f.channel)) gains.set(f.channel, new Map());
    const byDay = gains.get(f.channel)!;
    if (!byDay.has(f.day)) byDay.set(f.day, new Map());
    byDay.get(f.day)!.set(f.format, (byDay.get(f.day)!.get(f.format) ?? 0) + f.gained);
  }
  const uploads = new Map<string, Map<string, Record<VideoFormat, number>>>();
  for (const v of videos) {
    const day = dateIn(tz, v.publishedAt);
    if (!uploads.has(v.channel)) uploads.set(v.channel, new Map());
    const byDay = uploads.get(v.channel)!;
    if (!byDay.has(day)) byDay.set(day, { long: 0, short: 0, unknown: 0 });
    byDay.get(day)![v.format] += 1;
  }
  const byChannel = new Map<string, RpmRow[]>();
  for (const r of [...rpm].sort((a, b) => a.from.localeCompare(b.from))) {
    if (!byChannel.has(r.channel)) byChannel.set(r.channel, []);
    byChannel.get(r.channel)!.push(r);
  }
  // The latest assumption of each channel names its currency; the commonest wins.
  const tally = new Map<string, number>();
  for (const list of byChannel.values()) {
    const c = list[list.length - 1]!.currency;
    tally.set(c, (tally.get(c) ?? 0) + 1);
  }
  const currency = [...tally].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? "USD";
  return { totals, gains, uploads, rpm: byChannel, currency };
}

/** The RPM assumption in force on a day: the latest that starts on or before it. */
export function rpmOn(rows: RpmRow[] | undefined, day: string): RpmRow | null {
  let found: RpmRow | null = null;
  for (const r of rows ?? []) if (r.from <= day) found = r;
  return found;
}

/** A channel's views on a day, split as far as the readings allow. */
export function dayParts(ix: Index, channel: string, day: string): { total: number | null; long: number | null; short: number | null; unknown: number | null; read: boolean } {
  const t = ix.totals.get(channel);
  const today = t?.get(day);
  const before = t?.get(shiftDate(day, -1));
  const total = today?.views !== null && today?.views !== undefined && before?.views !== null && before?.views !== undefined ? today.views - before.views : null;
  // A day the channel was read on, its videos were too: no gain recorded is a real 0.
  const read = Boolean(today);
  const g = ix.gains.get(channel)?.get(day);
  const part = (f: VideoFormat) => (g?.has(f) ? g.get(f)! : read ? 0 : null);
  return { total, long: part("long"), short: part("short"), unknown: part("unknown"), read };
}

export function dayViews(ix: Index, channel: string, day: string, fmt: FormatPick): number | null {
  const p = dayParts(ix, channel, day);
  return fmt === "all" ? p.total : p[fmt];
}

export function daySubs(ix: Index, channel: string, day: string): number | null {
  const t = ix.totals.get(channel);
  const a = t?.get(day)?.subscribers;
  const b = t?.get(shiftDate(day, -1))?.subscribers;
  return a !== null && a !== undefined && b !== null && b !== undefined ? a - b : null;
}

export function dayUploads(ix: Index, channel: string, day: string, fmt: FormatPick): number {
  const u = ix.uploads.get(channel)?.get(day);
  if (!u) return 0;
  return fmt === "all" ? u.long + u.short + u.unknown : u[fmt];
}

export interface DayRevenue {
  /** Estimated revenue, or null when nothing could be priced. */
  value: number | null;
  /** Of it: priced with format-specific RPMs, and with the blended one. */
  byFormat: number;
  byBlended: number;
  /** Views there was no RPM for. */
  unpriced: number;
  /** No RPM set for the day at all (or one in another currency). */
  noRpm: boolean;
  /** Views it was worked out from. */
  priced: number;
}

export function dayRevenue(ix: Index, channel: string, day: string, fmt: FormatPick): DayRevenue {
  const none: DayRevenue = { value: null, byFormat: 0, byBlended: 0, unpriced: 0, noRpm: false, priced: 0 };
  const r = rpmOn(ix.rpm.get(channel), day);
  if (!r || r.currency !== ix.currency) return { ...none, noRpm: true };
  const p = dayParts(ix, channel, day);
  const out = { ...none };
  const price = (views: number, own: number | null) => {
    if (views === 0) return;
    if (own !== null) { out.byFormat += (views / 1000) * own; out.priced += views; }
    else if (r.blended !== null) { out.byBlended += (views / 1000) * r.blended; out.priced += views; }
    else out.unpriced += views;
  };
  const priceBlended = (views: number) => {
    if (views <= 0) return;
    if (r.blended !== null) { out.byBlended += (views / 1000) * r.blended; out.priced += views; }
    else out.unpriced += views;
  };
  if (fmt === "long" || fmt === "short") {
    const v = p[fmt];
    if (v === null) return none;
    price(v, fmt === "long" ? r.long : r.short);
  } else if (p.total !== null) {
    const l = p.long ?? 0;
    const s = p.short ?? 0;
    price(l, r.long);
    price(s, r.short);
    // Beyond what the tracked videos gained: live streams, deleted or untracked videos — format unknown.
    priceBlended(p.total - l - s);
  } else if (p.long !== null || p.short !== null) {
    // No channel total for the day: only what the videos gained can be priced.
    price(p.long ?? 0, r.long);
    price(p.short ?? 0, r.short);
  } else return none;
  out.value = out.byFormat + out.byBlended;
  return out;
}

export interface Figures {
  channel: NetChannel;
  days: number;
  views: number | null;
  /** Days with a view reading. */
  viewDays: number;
  revenue: number | null;
  revFormat: number;
  revBlended: number;
  unpriced: number;
  pricedViews: number;
  /** No RPM on any day of the range. */
  noRpm: boolean;
  subs: number | null;
  subDays: number;
  /** Latest subscriber count read in the range (null if hidden or never read). */
  subsNow: number | null;
  subsHidden: boolean;
  uploads: { long: number; short: number; unknown: number; total: number };
}

/** One channel over a range, with how much of it the readings cover. */
export function figuresOf(ix: Index, ch: NetChannel, r: Range, fmt: FormatPick): Figures {
  const f: Figures = {
    channel: ch, days: daysIn(r), views: null, viewDays: 0, revenue: null, revFormat: 0, revBlended: 0, unpriced: 0, pricedViews: 0, noRpm: true,
    subs: null, subDays: 0, subsNow: null, subsHidden: false, uploads: { long: 0, short: 0, unknown: 0, total: 0 },
  };
  for (const day of eachDay(r)) {
    const v = dayViews(ix, ch.name, day, fmt);
    if (v !== null) { f.views = (f.views ?? 0) + v; f.viewDays += 1; }
    const rev = dayRevenue(ix, ch.name, day, fmt);
    if (!rev.noRpm) f.noRpm = false;
    if (rev.value !== null) {
      f.revenue = (f.revenue ?? 0) + rev.value;
      f.revFormat += rev.byFormat;
      f.revBlended += rev.byBlended;
      f.pricedViews += rev.priced;
    }
    f.unpriced += rev.unpriced;
    const s = daySubs(ix, ch.name, day);
    if (s !== null) { f.subs = (f.subs ?? 0) + s; f.subDays += 1; }
    const reading = ix.totals.get(ch.name)?.get(day);
    if (reading) { f.subsHidden = reading.subsHidden; if (reading.subscribers !== null) f.subsNow = reading.subscribers; }
    const u = ix.uploads.get(ch.name)?.get(day);
    if (u) { f.uploads.long += u.long; f.uploads.short += u.short; f.uploads.unknown += u.unknown; }
  }
  f.uploads.total = fmt === "all" ? f.uploads.long + f.uploads.short + f.uploads.unknown : f.uploads[fmt];
  return f;
}

export interface Totals {
  days: number;
  views: number | null;
  /** Days on which at least one selected channel has a view reading. */
  viewDays: number;
  /** Channels missing some days' readings. */
  gappy: number;
  revenue: number | null;
  revFormat: number;
  revBlended: number;
  unpriced: number;
  pricedViews: number;
  /** Channels with no RPM for the range: left out of revenue. */
  needRpm: string[];
  subs: number | null;
  subsNow: number | null;
  uploads: { long: number; short: number; unknown: number; total: number };
  activeChannels: number;
  channels: number;
  /** revenue ÷ the views priced × 1,000. */
  rpm: number | null;
}

export function totalsOf(list: Figures[], ix: Index, r: Range, fmt: FormatPick): Totals {
  const days = daysIn(r);
  const anyDay = new Set<string>();
  for (const day of eachDay(r)) if (list.some((f) => dayViews(ix, f.channel.name, day, fmt) !== null)) anyDay.add(day);
  const sum = (pick: (f: Figures) => number | null) => {
    const xs = list.map(pick).filter((x): x is number => x !== null);
    return xs.length ? xs.reduce((a, b) => a + b, 0) : null;
  };
  const revenue = sum((f) => f.revenue);
  const pricedViews = list.reduce((a, f) => a + f.pricedViews, 0);
  return {
    days,
    views: sum((f) => f.views),
    viewDays: anyDay.size,
    gappy: list.filter((f) => f.viewDays > 0 && f.viewDays < days).length,
    revenue,
    revFormat: list.reduce((a, f) => a + f.revFormat, 0),
    revBlended: list.reduce((a, f) => a + f.revBlended, 0),
    unpriced: list.reduce((a, f) => a + f.unpriced, 0),
    pricedViews,
    needRpm: list.filter((f) => f.noRpm).map((f) => f.channel.name),
    subs: sum((f) => f.subs),
    subsNow: sum((f) => f.subsNow),
    uploads: {
      long: list.reduce((a, f) => a + f.uploads.long, 0),
      short: list.reduce((a, f) => a + f.uploads.short, 0),
      unknown: list.reduce((a, f) => a + f.uploads.unknown, 0),
      total: list.reduce((a, f) => a + f.uploads.total, 0),
    },
    activeChannels: list.filter((f) => f.uploads.total > 0).length,
    channels: list.length,
    rpm: revenue !== null && pricedViews > 0 ? (revenue / pricedViews) * 1000 : null,
  };
}

/** Share of a range a channel must have readings for to be compared on it. */
export const MIN_COVERAGE = 0.8;

export type CompareMode = "lfl" | "current";

export interface Change {
  /** Fraction: 0.12 is +12%. Null when it can't fairly be said. */
  change: number | null;
  cur: number | null;
  prev: number | null;
  /** Channels the comparison is made over. */
  channels: number;
  why: string | null;
}

/**
 * A metric against the previous period. Like-for-like compares only channels
 * with enough readings in both periods; Current network compares everything
 * selected that has enough in each (so channels added since count as growth).
 * Missing readings never count as zero.
 */
export function compareOn(
  cur: Figures[],
  prev: Figures[],
  value: (f: Figures) => number | null,
  coverage: (f: Figures) => number,
  mode: CompareMode,
): Change {
  const enough = (f: Figures) => coverage(f) >= MIN_COVERAGE && value(f) !== null;
  const prevBy = new Map(prev.map((f) => [f.channel.name, f]));
  const sum = (xs: Figures[]) => xs.reduce((a, f) => a + value(f)!, 0);
  let curSet: Figures[];
  let prevSet: Figures[];
  if (mode === "lfl") {
    curSet = cur.filter((f) => enough(f) && prevBy.has(f.channel.name) && enough(prevBy.get(f.channel.name)!));
    prevSet = curSet.map((f) => prevBy.get(f.channel.name)!);
  } else {
    curSet = cur.filter(enough);
    prevSet = prev.filter(enough);
  }
  if (!curSet.length || !prevSet.length) {
    return { change: null, cur: null, prev: null, channels: 0, why: "Not enough history in both periods to compare." };
  }
  const a = sum(curSet);
  const b = sum(prevSet);
  if (b <= 0) return { change: null, cur: a, prev: b, channels: curSet.length, why: "The previous period had nothing to compare with." };
  return { change: (a - b) / b, cur: a, prev: b, channels: curSet.length, why: null };
}

export const viewCoverage = (f: Figures) => (f.days ? f.viewDays / f.days : 0);
export const subCoverage = (f: Figures) => (f.days ? f.subDays / f.days : 0);
/** Upload history is complete from the backfill, so it always counts. */
export const fullCoverage = () => 1;

// ── the chart ───────────────────────────────────────────────────────────────

export type Split = "total" | "division" | "channel";

export interface Series {
  key: string;
  label: string;
  colour: string;
  values: Array<number | null>;
}

export function dayMetric(ix: Index, channel: string, day: string, fmt: FormatPick, metric: Metric): number | null {
  switch (metric) {
    case "views": return dayViews(ix, channel, day, fmt);
    case "revenue": return dayRevenue(ix, channel, day, fmt).value;
    case "subs": return daySubs(ix, channel, day);
    case "uploads": return dayUploads(ix, channel, day, fmt);
  }
}

/** Most channels shown on their own when split by channel; the rest add up as "Other channels". */
export const CHART_CHANNELS = 8;

/**
 * Day-by-day values for the chart: one series for the total, or one per
 * division or channel. A day no channel in a series has a reading for is
 * null (a gap), not zero.
 */
export function seriesOf(ix: Index, channels: NetChannel[], divisions: Division[], r: Range, fmt: FormatPick, metric: Metric, split: Split): { days: string[]; series: Series[] } {
  const days = eachDay(r);
  const groupValues = (members: NetChannel[]) =>
    days.map((day) => {
      const xs = members.map((c) => dayMetric(ix, c.name, day, fmt, metric)).filter((x): x is number => x !== null);
      return xs.length ? xs.reduce((a, b) => a + b, 0) : null;
    });
  if (split === "total") return { days, series: [{ key: "total", label: "Network", colour: "#E8C547", values: groupValues(channels) }] };
  if (split === "division") {
    const series = divisions
      .map((d) => ({ d, members: channels.filter((c) => c.divisionId === d.id) }))
      .filter((g) => g.members.length)
      .map((g) => ({ key: g.d.id, label: g.d.name, colour: g.d.colour, values: groupValues(g.members) }));
    const loose = channels.filter((c) => !c.divisionId || !divisions.some((d) => d.id === c.divisionId));
    if (loose.length) series.push({ key: "none", label: "No division", colour: "#8A8A96", values: groupValues(loose) });
    return { days, series };
  }
  const ranked = channels
    .map((c) => ({ c, total: groupValues([c]).reduce<number>((a, v) => a + Math.abs(v ?? 0), 0) }))
    .sort((a, b) => b.total - a.total);
  const top = ranked.slice(0, CHART_CHANNELS).map((x) => x.c);
  const rest = ranked.slice(CHART_CHANNELS).map((x) => x.c);
  const series = top.map((c) => ({ key: c.id, label: c.name, colour: c.colour, values: groupValues([c]) }));
  if (rest.length) series.push({ key: "rest", label: `Other channels (${rest.length})`, colour: "#6B6B78", values: groupValues(rest) });
  return { days, series };
}

/** Per division: its figures added up, each channel once (its primary division). */
export function byDivision(list: Figures[], divisions: Division[], ix: Index, r: Range, fmt: FormatPick): Array<{ division: Division; totals: Totals }> {
  return divisions
    .map((d) => ({ division: d, members: list.filter((f) => f.channel.divisionId === d.id) }))
    .filter((g) => g.members.length)
    .map((g) => ({ division: g.division, totals: totalsOf(g.members, ix, r, fmt) }));
}
