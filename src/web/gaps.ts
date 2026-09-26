/**
 * Upload slots with no video: a channel with a posting target (a Stories
 * channel, every four days) is expected to post again a set number of days
 * after its last video — uploaded or scheduled. When one of those expected
 * days is within the next eight and nothing is on it, it's a gap to fill:
 * eight days is the VO's six-day buffer plus two to get it assigned.
 *
 * The chain runs from the last video on or before today. A video within the
 * next N days moves the chain to it (posting early resets the clock); an
 * expected day with nothing on or before it is a gap, and the chain carries on
 * from that day as if it were filled, so one missing video isn't counted
 * again for every day after it. A channel already behind is expected today.
 */
import { addDays, daysBetween } from "./cadence.js";

export const GAP_HORIZON_DAYS = 8;

export interface UploadGap {
  channel: string;
  /** The day an upload is expected and nothing is on. */
  date: string;
  /** Days from today. */
  inDays: number;
  /** The channel's last video before it (uploaded or scheduled). */
  after: string;
}

/**
 * The gaps for one channel.
 * @param days every day the channel has a video on: uploaded, or with an air date
 */
export function channelGaps(channel: string, every: number, days: string[], today: string, horizon = GAP_HORIZON_DAYS): UploadGap[] {
  const known = [...new Set(days)].sort();
  const end = addDays(today, horizon);
  let anchor = [...known].reverse().find((d) => d <= today);
  // A channel with nothing in the last month and nothing ahead is resting, not behind.
  if (!anchor && !known.some((d) => d > today)) return [];
  if (!anchor) anchor = known.find((d) => d > today)!;
  if (daysBetween(anchor, today) > 30 && !known.some((d) => d > today)) return [];
  const gaps: UploadGap[] = [];
  let guard = 0;
  while (guard++ < 200) {
    const next = known.find((d) => d > anchor!);
    const expected = addDays(anchor, every);
    if (next && next <= expected) {
      anchor = next;
      continue;
    }
    if (expected > end) break;
    if (expected < today) {
      // Already behind (the Uploads page's pace says so): the next one is due today.
      anchor = addDays(today, -every) > anchor ? addDays(today, -every) : expected;
      continue;
    }
    const after = [...known].reverse().find((d) => d < expected) ?? anchor;
    gaps.push({ channel, date: expected, inDays: daysBetween(today, expected), after });
    anchor = expected;
  }
  return gaps;
}

/** Every channel's gaps, soonest first. */
export function uploadGaps(
  channels: Array<{ channel: string; every: number; days: string[] }>,
  today: string,
  horizon = GAP_HORIZON_DAYS,
): UploadGap[] {
  return channels
    .flatMap((c) => channelGaps(c.channel, c.every, c.days, today, horizon))
    .sort((a, b) => a.date.localeCompare(b.date) || a.channel.localeCompare(b.channel));
}
