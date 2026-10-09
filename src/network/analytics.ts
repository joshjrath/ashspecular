/**
 * YouTube Analytics, the pure parts: the Google sign-in address, which days to
 * ask for, and turning YouTube's reports into one row per day. The calls
 * themselves are in jobs/analytics.ts.
 *
 * Each channel is connected by signing in to Google as someone who manages
 * it (Google asks which channel). Analytics gives what YouTube Studio shows:
 * views, subscribers gained and lost and estimated revenue per day, years
 * back, split into long-form and Shorts. It runs two or three days behind;
 * the days after are filled from the public counts.
 */
import { shiftDate } from "../parse/derive.js";
import type { AnalyticsDay } from "./types.js";

export const ANALYTICS_SCOPES = [
  "https://www.googleapis.com/auth/yt-analytics.readonly",
  "https://www.googleapis.com/auth/yt-analytics-monetary.readonly",
  "https://www.googleapis.com/auth/youtube.readonly",
];

/** How far back the first read goes. */
export const BACKFILL_DAYS = 1095;
/** Later reads ask for this many days again: YouTube revises recent days. */
export const REFRESH_DAYS = 10;
/** A connected channel is read again after this long. */
export const SYNC_EVERY_HOURS = 6;
/** Days per request: a report is kept to about a year. */
export const CHUNK_DAYS = 180;

/** The Google sign-in page for one channel. `prompt=consent` makes Google hand over lasting access every time. */
export function authUrl(o: { clientId: string; redirectUri: string; state: string }): string {
  const p = new URLSearchParams({
    client_id: o.clientId,
    redirect_uri: o.redirectUri,
    response_type: "code",
    scope: ANALYTICS_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent select_account",
    include_granted_scopes: "true",
    state: o.state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`;
}

/** The days to ask for: three years on the first read, the last ten after. */
export function windowOf(reach: { backfilled: boolean; through: string | null }, today: string): { from: string; to: string } {
  const from = reach.backfilled && reach.through ? shiftDate(reach.through < today ? reach.through : today, -REFRESH_DAYS) : shiftDate(today, -BACKFILL_DAYS);
  return { from, to: today };
}

/** A range in pieces of at most CHUNK_DAYS days. */
export function chunks(r: { from: string; to: string }, size = CHUNK_DAYS): Array<{ from: string; to: string }> {
  const out: Array<{ from: string; to: string }> = [];
  for (let from = r.from; from <= r.to; from = shiftDate(from, size)) {
    const to = shiftDate(from, size - 1);
    out.push({ from, to: to < r.to ? to : r.to });
  }
  return out;
}

/** A report's rows as records keyed by column name. */
export function rowsOf(report: unknown): Array<Record<string, string | number>> {
  const r = report as { columnHeaders?: Array<{ name?: string }>; rows?: unknown[][] } | null;
  const names = (r?.columnHeaders ?? []).map((h) => String(h.name ?? ""));
  return (r?.rows ?? []).filter(Array.isArray).map((row) => Object.fromEntries(names.map((n, i) => [n, row[i] as string | number])));
}

/** YouTube's content types, as the board's formats. */
export function formatOfType(t: unknown): "long" | "short" | "other" {
  const k = String(t ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (k === "shorts" || k === "short") return "short";
  if (k === "videoondemand") return "long";
  return "other";
}

const num = (v: unknown): number | null => (v === undefined || v === null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

/**
 * One row per day from the day report and, when YouTube gave one, the split by
 * content type. Days inside what YouTube answered for but missing from its
 * rows had nothing: 0, not unknown. Days after the last one it had are left
 * out (not in yet).
 */
export function mergeDays(
  channel: string,
  daily: Array<Record<string, string | number>>,
  split: Array<Record<string, string | number>> | null,
  r: { from: string },
): AnalyticsDay[] {
  const byDay = new Map(daily.map((x) => [String(x.day), x]));
  const through = [...byDay.keys()].sort().pop();
  if (!through) return [];
  const parts = new Map<string, { long: number; short: number; longRev: number | null; shortRev: number | null }>();
  for (const x of split ?? []) {
    const day = String(x.day);
    const p = parts.get(day) ?? { long: 0, short: 0, longRev: null, shortRev: null };
    const f = formatOfType(x.creatorContentType);
    const rev = num(x.estimatedRevenue);
    if (f === "long") { p.long += num(x.views) ?? 0; if (rev !== null) p.longRev = (p.longRev ?? 0) + rev; }
    if (f === "short") { p.short += num(x.views) ?? 0; if (rev !== null) p.shortRev = (p.shortRev ?? 0) + rev; }
    parts.set(day, p);
  }
  const hasRevenue = daily.some((x) => "estimatedRevenue" in x);
  const splitRevenue = (split ?? []).some((x) => "estimatedRevenue" in x);
  const out: AnalyticsDay[] = [];
  for (let day = r.from; day <= through; day = shiftDate(day, 1)) {
    const x = byDay.get(day);
    const p = parts.get(day);
    out.push({
      channel,
      day,
      views: num(x?.views) ?? 0,
      viewsLong: split ? (p?.long ?? 0) : null,
      viewsShort: split ? (p?.short ?? 0) : null,
      subsGained: x ? num(x.subscribersGained) : 0,
      subsLost: x ? num(x.subscribersLost) : 0,
      revenue: hasRevenue ? (x ? num(x.estimatedRevenue) : 0) : null,
      revenueLong: splitRevenue ? (p?.longRev ?? 0) : null,
      revenueShort: splitRevenue ? (p?.shortRev ?? 0) : null,
    });
  }
  return out;
}
