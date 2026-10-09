/**
 * Network Overview as CSV: what's on the page for the same filters and dates,
 * with a few lines first saying what it covers, when it was read, and how
 * revenue was estimated. Rows go out through toCsv (formula-safe).
 */
import { ORG_TZ, dateIn } from "../parse/derive.js";
import { dayParts, dayRevenue, daySubs, dayUploads, rpmOn, dayViews, type Index } from "./compute.js";
import { eachDay } from "./period.js";
import type { Overview } from "./overview.js";
import type { NetVideo } from "./types.js";

export const EXPORTS = ["channels", "divisions", "daily", "revenue", "uploads"] as const;
export type ExportKind = (typeof EXPORTS)[number];

export const METHOD =
  "Revenue is ESTIMATED: for channels connected to YouTube Analytics, YouTube's own estimated revenue (USD); otherwise views / 1000 x the RPM set for each channel and format, as in force each day (long-form views at the long-form RPM, Shorts at the Shorts RPM, views that can't be told apart at the blended RPM). It is not what YouTube paid. Connected channels' views and subscribers are YouTube Analytics' figures; the rest are YouTube's public counts, read hourly; a day without a reading is blank, not zero.";

const r2 = (n: number | null) => (n === null ? "" : (Math.round(n * 100) / 100).toFixed(2));
const n0 = (n: number | null) => (n === null ? "" : String(Math.round(n)));
const pct = (n: number | null) => (n === null ? "" : (Math.round(n * 1000) / 10).toFixed(1));

export function exportRows(kind: ExportKind, o: Overview, ix: Index, videos: NetVideo[], lastRead: Date | null): unknown[][] {
  const selection = o.q.channels.length ? o.selected.map((c) => c.name).join("; ") : o.q.divisions.length ? o.divisions.filter((d) => o.q.divisions.includes(d.id)).map((d) => d.name).join(" + ") : "Whole network";
  const meta: unknown[][] = [
    ["Specular Network Overview", kind],
    ["Period", `${o.period.from} to ${o.period.to}${o.period.partial ? " (partial: runs to today)" : ""}`],
    ["Compared with", o.period.prev ? `${o.period.prev.from} to ${o.period.prev.to} (${o.q.cmp === "lfl" ? "like for like" : "current network"})` : "none"],
    ["Selection", selection],
    ["Format", o.q.fmt === "all" ? "All videos" : o.q.fmt === "long" ? "Long-form" : "Shorts"],
    ["Currency", o.currency],
    ["Last refreshed", lastRead ? lastRead.toISOString() : "never"],
    ["Method", METHOD],
    [],
  ];
  const fmt = o.q.fmt;
  const days = eachDay(o.period);
  switch (kind) {
    case "channels":
      return [...meta, ["channel", "division", "views", "view_days", "days", "est_revenue", "net_subscribers", "subscribers", "uploads", "long_uploads", "shorts_uploads", "change_pct", "views_per_upload_7d", "est_rpm", "needs_rpm"],
        ...o.leaders.map((l) => [l.f.channel.name, l.divisionName, n0(l.f.views), l.f.viewDays, l.f.days, r2(l.f.revenue), n0(l.f.subs), n0(l.f.subsNow), l.f.uploads.total, l.f.uploads.long, l.f.uploads.short, pct(l.growth), n0(l.perUpload), r2(l.rpm), l.f.noRpm ? "yes" : ""])];
    case "divisions":
      return [...meta, ["division", "views", "est_revenue", "net_subscribers", "uploads", "est_rpm", "views_change_pct"],
        ...o.divisionRows.map((d) => [d.division.name, n0(d.totals.views), r2(d.totals.revenue), n0(d.totals.subs), d.totals.uploads.total, r2(d.totals.rpm), pct(d.viewsChange?.change ?? null)])];
    case "daily":
      return [...meta, ["day", "views", "est_revenue", "net_subscribers", "uploads", "channels_with_readings"],
        ...days.map((day) => {
          const sum = (f: (ch: string) => number | null) => { const xs = o.selected.map((c) => f(c.name)).filter((x): x is number => x !== null); return xs.length ? xs.reduce((a, b) => a + b, 0) : null; };
          return [day, n0(sum((ch) => dayViews(ix, ch, day, fmt))), r2(sum((ch) => dayRevenue(ix, ch, day, fmt).value)), n0(sum((ch) => daySubs(ix, ch, day))),
            o.selected.reduce((a, c) => a + dayUploads(ix, c.name, day, fmt), 0), o.selected.filter((c) => dayViews(ix, c.name, day, fmt) !== null).length];
        })];
    case "revenue":
      return [...meta, ["day", "channel", "views_total", "views_long", "views_shorts", "rpm_long", "rpm_shorts", "rpm_blended", "est_revenue", "by_format_rpm", "by_blended_rpm", "unpriced_views", "status"],
        ...days.flatMap((day) => o.selected.map((c) => {
          const p = dayParts(ix, c.name, day);
          const rev = dayRevenue(ix, c.name, day, fmt);
          const rpm = rpmOn(ix.rpm.get(c.name), day);
          const status = rev.byYouTube ? "YouTube Analytics" : rev.pending ? "not in from YouTube yet" : rev.noRpm ? "no RPM" : rev.value === null ? "no reading" : rev.byBlended > 0 && rev.byFormat === 0 ? "blended" : rev.byBlended > 0 ? "format + blended" : "format";
          return [day, c.name, n0(p.total), n0(p.long), n0(p.short), r2(rpm?.long ?? null), r2(rpm?.short ?? null), r2(rpm?.blended ?? null), r2(rev.value), r2(rev.byFormat), r2(rev.byBlended), n0(rev.unpriced), status];
        }))];
    case "uploads": {
      const names = new Set(o.selected.map((c) => c.name));
      const division = new Map(o.selected.map((c) => [c.name, o.divisions.find((d) => d.id === c.divisionId)?.name ?? ""]));
      return [...meta, ["day", "channel", "division", "format", "title", "url", "views_lifetime"],
        ...videos
          .filter((v) => names.has(v.channel) && (fmt === "all" || v.format === fmt))
          .map((v) => ({ v, day: dateIn(ORG_TZ, v.publishedAt) }))
          .filter((x) => x.day >= o.period.from && x.day <= o.period.to)
          .sort((a, b) => a.day.localeCompare(b.day))
          .map(({ v, day }) => [day, v.channel, division.get(v.channel) ?? "", v.format, v.title, v.url, n0(v.views)])];
    }
  }
}
