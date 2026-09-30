/**
 * How often the reader calls Tumblr. A key gets 1,000 calls an hour and
 * 5,000 a day, so the pace is budgeted, not "as fast as it can":
 *
 *   per tag   its weight sets the pace (every 10 minutes at 5, every 2 hours
 *             at 1), and it drifts with what the tag turns up: a tag that
 *             fills every page is read twice as often (down to every 5
 *             minutes), one with nothing new half again as rarely (up to four
 *             times its pace, and never rarer than every 4 hours), anything
 *             in between drifts back toward its weight's pace.
 *   per day   the day's calls are spread across the day: by any hour, no
 *             more than that share of the daily cap (plus an hour's worth),
 *             so a few busy tags can't use it all by the afternoon and leave
 *             the feed dark all evening.
 */

/** How often a tag is read, by its weight: every 10 minutes at 5, every 2 hours at 1. */
export const WEIGHT_MINUTES: Record<number, number> = { 5: 10, 4: 15, 3: 30, 2: 60, 1: 120 };

/** Minutes until the next read of a tag, from what this read found. */
export function nextPollMinutes(weight: number, current: number, read: { filled: boolean; fresh: number }): number {
  const base = WEIGHT_MINUTES[weight] ?? 30;
  const now = current > 0 ? current : base;
  const next = read.filled ? Math.round(now / 2) : read.fresh === 0 ? Math.min(240, base * 4, Math.round(now * 1.5)) : Math.round((now + base) / 2);
  return Math.max(5, next);
}

/** Minutes since midnight in a time zone. */
export function minutesIntoDay(zone: string, at: Date = new Date()): number {
  const [h, m] = new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at).split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** How many of the day's calls may be spent by now: the day's share so far, plus an hour's worth. */
export function pacedAllowance(dailyCap: number, minutes: number): number {
  return Math.min(dailyCap, Math.ceil((dailyCap * (Math.max(0, minutes) + 60)) / 1440));
}
