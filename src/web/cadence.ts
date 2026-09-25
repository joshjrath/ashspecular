/**
 * How consistently each Stories channel is posting, against the target of
 * one long-form upload every four days.
 *
 * Everything is counted in whole calendar days in the studio's zone, so a
 * video that goes up at 11 pm isn't a day late by the clock in London.
 *
 *   on pace  the last upload was fewer than four days ago
 *   due      today is the fourth day — an upload today keeps the pace
 *   behind   more than four days since the last one, by that many days
 */
import { ORG_TZ, dateIn, shortsDay } from "../parse/derive.js";

export const STORIES_EVERY_DAYS = 4;

export type PaceState = "on-pace" | "due" | "behind" | "none";

export interface Gap {
  from: string;
  to: string;
  days: number;
}

export interface ChannelCadence {
  channel: string;
  last: Date | null;
  lastDay: string | null;
  daysSince: number | null;
  nextDue: string | null;
  state: PaceState;
  behindBy: number;
  /** On-time uploads in a row, most recent first; 0 once the current wait runs over. */
  streak: number;
  uploads30: number;
  avgGap90: number | null;
  onTime90: number | null;
  longestGap90: number | null;
  gaps: Gap[];
}

export const dayOf = (d: Date) => dateIn(ORG_TZ, d);

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function cadenceFor(
  channel: string,
  uploads: Date[],
  now: Date = new Date(),
  every = STORIES_EVERY_DAYS,
): ChannelCadence {
  const today = dayOf(now);
  const days = [...new Set(uploads.map(dayOf))].sort();
  const gaps: Gap[] = [];
  for (let i = 1; i < days.length; i += 1) gaps.push({ from: days[i - 1]!, to: days[i]!, days: daysBetween(days[i - 1]!, days[i]!) });

  const lastDay = days[days.length - 1] ?? null;
  const last = uploads.length ? new Date(Math.max(...uploads.map((u) => u.getTime()))) : null;
  const daysSince = lastDay ? daysBetween(lastDay, today) : null;
  const state: PaceState = daysSince === null ? "none" : daysSince < every ? "on-pace" : daysSince === every ? "due" : "behind";

  let streak = 0;
  if (daysSince !== null && daysSince <= every) {
    streak = 1;
    for (let i = gaps.length - 1; i >= 0 && gaps[i]!.days <= every; i -= 1) streak += 1;
  }

  const since90 = addDays(today, -90);
  const recent = gaps.filter((g) => g.to > since90);
  const since30 = addDays(today, -30);

  return {
    channel,
    last,
    lastDay,
    daysSince,
    nextDue: lastDay ? addDays(lastDay, every) : null,
    state,
    behindBy: daysSince !== null && daysSince > every ? daysSince - every : 0,
    streak,
    uploads30: uploads.filter((u) => dayOf(u) > since30).length,
    avgGap90: recent.length ? recent.reduce((n, g) => n + g.days, 0) / recent.length : null,
    onTime90: recent.length ? recent.filter((g) => g.days <= every).length / recent.length : null,
    longestGap90: recent.length ? Math.max(...recent.map((g) => g.days)) : null,
    gaps,
  };
}

// ── daily categories (Bits, Reading) ──────────────────────────────────────

export interface DailyCadence {
  channel: string;
  perDay: number;
  /** Uploads per ET day. */
  counts: Map<string, number>;
  today: number;
  /** Days in a row on target: today if already met, then back from yesterday. */
  streak: number;
  /** Share of the last 30 full days on target (from the first upload, if later). */
  hit30: number | null;
  /** Uploads a day over the last 7 full days. */
  avg7: number | null;
  last: Date | null;
}

/** Counted on the Bits/Reading day, which turns over at 3 AM, not midnight. */
export function dailyFor(channel: string, uploads: Date[], perDay: number, now: Date = new Date()): DailyCadence {
  const today = shortsDay(now);
  const counts = new Map<string, number>();
  for (const u of uploads) counts.set(shortsDay(u), (counts.get(shortsDay(u)) ?? 0) + 1);
  const first = uploads.length ? shortsDay(new Date(Math.min(...uploads.map((u) => u.getTime())))) : null;
  const met = (d: string) => (counts.get(d) ?? 0) >= perDay;

  let streak = met(today) ? 1 : 0;
  for (let d = addDays(today, -1); first && d >= first && met(d); d = addDays(d, -1)) streak += 1;

  const window = (n: number) => {
    const days: string[] = [];
    for (let i = 1; i <= n; i += 1) {
      const d = addDays(today, -i);
      if (first && d >= first) days.push(d);
    }
    return days;
  };
  const last30 = window(30);
  const last7 = window(7);
  return {
    channel,
    perDay,
    counts,
    today: counts.get(today) ?? 0,
    streak,
    hit30: last30.length ? last30.filter(met).length / last30.length : null,
    avg7: last7.length ? last7.reduce((n, d) => n + (counts.get(d) ?? 0), 0) / last7.length : null,
    last: uploads.length ? new Date(Math.max(...uploads.map((u) => u.getTime()))) : null,
  };
}
