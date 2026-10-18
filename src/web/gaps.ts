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
  /** The video # it would get ("VIDEO-046"), when the channel's codes say. */
  code?: string;
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

/** "VIDEO-045" → prefix "VIDEO-", 45, width 3. */
function splitCode(code: string): { prefix: string; n: number; width: number } | null {
  const m = /^(.*?)(\d+)\s*$/.exec(code.trim());
  return m ? { prefix: m[1]!, n: Number(m[2]), width: m[2]!.length } : null;
}

/**
 * The video # each upload to assign would get, from the codes already used.
 * If two channels have used the same number, numbers count per channel (the
 * channel's highest + 1); otherwise they count across the studio, in the
 * order uploads come up (`all`: every upload still to assign, soonest first).
 */
export function withCodes(list: UploadGap[], used: Array<{ channel: string; code: string }>, all: UploadGap[] = list): UploadGap[] {
  const parsed = used.map((u) => ({ channel: u.channel, c: splitCode(u.code) })).filter((u): u is { channel: string; c: NonNullable<ReturnType<typeof splitCode>> } => u.c !== null);
  if (!parsed.length) return list;
  const owners = new Map<string, Set<string>>();
  for (const u of parsed) {
    const k = `${u.c.prefix}${u.c.n}`;
    owners.set(k, (owners.get(k) ?? new Set()).add(u.channel));
  }
  const perChannel = [...owners.values()].some((s) => s.size > 1);
  const top = (xs: typeof parsed) => xs.reduce((a, b) => (b.c.n > a.c.n ? b : a));
  const fmt = (c: { prefix: string; width: number }, n: number) => `${c.prefix}${String(n).padStart(c.width, "0")}`;
  if (perChannel) {
    const taken = new Map<string, number>();
    return list.map((g) => {
      const mine = parsed.filter((u) => u.channel === g.channel);
      if (!mine.length) return g;
      const t = top(mine);
      const n = (taken.get(g.channel) ?? t.c.n) + 1;
      taken.set(g.channel, n);
      return { ...g, code: fmt(t.c, n) };
    });
  }
  const t = top(parsed);
  const order = [...all].sort((a, b) => a.date.localeCompare(b.date) || a.channel.localeCompare(b.channel));
  return list.map((g) => {
    const i = order.findIndex((x) => x.channel === g.channel && x.date === g.date);
    return i < 0 ? g : { ...g, code: fmt(t.c, t.c.n + 1 + i) };
  });
}
