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
import { ORG_TZ, dateIn } from "../parse/derive.js";

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
