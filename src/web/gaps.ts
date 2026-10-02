/**
 * "Nothing assigned": a channel with a posting target (a Stories channel,
 * every four days) that has nothing lined up. It's counted from the
 * channel's LAST video — the furthest one scheduled, or, with nothing ahead,
 * the most recent uploaded or due — so a video that was pushed back, or one
 * running late, never makes an empty day in between look unassigned. Only the
 * days past the end of what's lined up, within the next eight, are gaps
 * (eight days is the VO's six-day buffer plus two to get one assigned).
 *
 * With nothing ahead and the channel already past when its next was due,
 * the next is expected today. A channel quiet for a month with nothing ahead
 * is resting, not behind.
 */
import { daysBetween } from "./cadence.js";
import { shiftDate } from "../parse/derive.js";

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
  if (!known.length || every <= 0) return [];
  const end = shiftDate(today, horizon);
  // The end of what's lined up: the furthest video, scheduled or not.
  const last = known[known.length - 1]!;
  const ahead = last >= today;
  // Nothing ahead and nothing for a month: resting, not behind.
  if (!ahead && daysBetween(last, today) > 30) return [];
  let expected = shiftDate(last, every);
  // Nothing ahead and already past when the next was due: it's due today.
  if (expected < today) expected = today;
  const gaps: UploadGap[] = [];
  for (let guard = 0; expected <= end && guard < 100; guard++) {
    gaps.push({ channel, date: expected, inDays: daysBetween(today, expected), after: last });
    expected = shiftDate(expected, every);
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

/**
 * Which channel runs out of assigned videos first, however far ahead: each
 * channel's first expected upload with nothing on it, soonest first. The
 * first is the next video that needs assigning; add one on that channel (or
 * move its schedule) and the next soonest takes its place.
 */
export function nextToAssign(
  channels: Array<{ channel: string; every: number; days: string[] }>,
  today: string,
  skip: (g: UploadGap) => boolean = () => false,
): UploadGap[] {
  return channels
    .map((c) => channelGaps(c.channel, c.every, c.days, today, 400).find((g) => !skip(g)))
    .filter((g): g is UploadGap => Boolean(g))
    .sort((a, b) => a.date.localeCompare(b.date) || a.channel.localeCompare(b.channel));
}
