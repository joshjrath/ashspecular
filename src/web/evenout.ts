/**
 * Even out uploads: the posting calendar's Future reset. Each channel with
 * an upload frequency (Settings → Channels, else its category's) gets its
 * upcoming uploads exactly that far apart, counted from its last upload, and
 * channels are staggered so the days carry about the same number of uploads.
 *
 * Rules, per channel:
 * - The first upload is at least its frequency after the last one that went
 *   up (no gap shorter than the frequency), or, if it hasn't posted, no
 *   earlier than its first planned one.
 * - Nothing goes nearer than the VO buffer from today unless it was already
 *   that near (its VO would be due before today).
 * - To even out the days, a channel's whole run may start up to its
 *   frequency − 1 days later (at most MAX_DELAY): once, then every gap is the
 *   frequency again. Each day of delay costs a little, so a channel only
 *   waits when that clearly spreads the week out.
 *
 * Uploads of channels it doesn't plan (no frequency, paused) and other fixed
 * days count towards each day's load but don't move. Daily batches aren't
 * part of it. Pure: the route gathers the schedule and applies the plan.
 */
import { shiftDate } from "../parse/derive.js";
import { daysBetween } from "./cadence.js";

/** A channel's whole run starts this many days later, at most, to even the days out. */
export const MAX_DELAY = 6;
/** What one day of delay costs, against the sum of each day's uploads squared. */
const DELAY_COST = 0.6;

export interface EvenChannel {
  channel: string;
  /** Its upload frequency in days. */
  every: number;
  /** The day of its last upload that went up (or its latest past air date), if any. */
  last: string | null;
  /** Its upcoming uploads still to go up, any order. */
  videos: Array<{ id: number; air: string; label: string }>;
}

export interface EvenPlan {
  moves: Array<{ id: number; channel: string; label: string; from: string; to: string; shift: number }>;
  /** Each channel planned: where its run now starts, and how many days it waits to even the days out. */
  channels: Array<{ channel: string; every: number; last: string | null; first: string; delay: number; videos: number; moved: number }>;
  /** Uploads a day, before and after, from today to the last one planned. */
  days: Array<{ day: string; before: number; after: number }>;
}

export function planEvenOut(o: {
  today: string;
  /** Today + the VO buffer: nothing is pulled nearer than this. */
  floor: string;
  channels: EvenChannel[];
  /** Upload days that stay put but count towards a day's load. */
  fixed: string[];
  /** false: only fix each channel's spacing, nobody waits to even the days out. */
  spread?: boolean;
}): EvenPlan {
  const load = new Map<string, number>();
  const add = (day: string, n: number) => load.set(day, (load.get(day) ?? 0) + n);
  for (const d of o.fixed) add(d, 1);

  // Each channel's run: video i on start + i × every, start = base + delay.
  const runs = o.channels
    .filter((c) => c.every > 0 && c.videos.length)
    .map((c) => {
      const videos = [...c.videos].sort((a, b) => a.air.localeCompare(b.air) || a.id - b.id);
      const base = c.last ? shiftDate(c.last, c.every) : videos[0]!.air;
      // The smallest delay that keeps every video off the days too near to record its VO.
      let low = 0;
      videos.forEach((v, i) => {
        const lowest = v.air < o.floor ? v.air : o.floor;
        low = Math.max(low, daysBetween(shiftDate(base, i * c.every), lowest));
      });
      return { c, videos, base, low, delay: low };
    });
  const daysOf = (r: (typeof runs)[number], delay: number) => r.videos.map((_, i) => shiftDate(r.base, delay + i * r.c.every));
  for (const r of runs) for (const d of daysOf(r, r.delay)) add(d, 1);

  // Settle each channel's delay in turn, the busiest first, until none changes.
  const order = [...runs].sort((a, b) => b.videos.length - a.videos.length || a.c.every - b.c.every || a.c.channel.localeCompare(b.c.channel));
  for (let pass = 0; pass < 8; pass++) {
    let changed = false;
    for (const r of order) {
      for (const d of daysOf(r, r.delay)) add(d, -1);
      const most = o.spread === false ? 0 : Math.min(r.c.every - 1, MAX_DELAY);
      let best = r.low, bestCost = Infinity;
      for (let extra = 0; extra <= most; extra++) {
        const delay = r.low + extra;
        // Adding one upload to a day with n already adds 2n + 1 to the sum of squares.
        const cost = daysOf(r, delay).reduce((sum, d) => sum + 2 * (load.get(d) ?? 0) + 1, 0) + DELAY_COST * extra;
        if (cost < bestCost - 1e-9) { best = delay; bestCost = cost; }
      }
      if (best !== r.delay) changed = true;
      r.delay = best;
      for (const d of daysOf(r, r.delay)) add(d, 1);
    }
    if (!changed) break;
  }

  const moves: EvenPlan["moves"] = [];
  const channels: EvenPlan["channels"] = [];
  for (const r of runs) {
    const to = daysOf(r, r.delay);
    let moved = 0;
    r.videos.forEach((v, i) => {
      if (to[i] === v.air) return;
      moved += 1;
      moves.push({ id: v.id, channel: r.c.channel, label: v.label, from: v.air, to: to[i]!, shift: daysBetween(v.air, to[i]!) });
    });
    channels.push({ channel: r.c.channel, every: r.c.every, last: r.c.last, first: to[0]!, delay: r.delay - r.low, videos: r.videos.length, moved });
  }
  moves.sort((a, b) => a.to.localeCompare(b.to) || a.channel.localeCompare(b.channel) || a.id - b.id);
  channels.sort((a, b) => a.first.localeCompare(b.first) || a.channel.localeCompare(b.channel));

  // Before and after, day by day, over everything planned.
  const before = new Map<string, number>();
  for (const d of [...o.fixed, ...runs.flatMap((r) => r.videos.map((v) => v.air))]) before.set(d, (before.get(d) ?? 0) + 1);
  const ends = [...before.keys(), ...load.keys()].filter((d) => d >= o.today).sort();
  const days: EvenPlan["days"] = [];
  for (let d = o.today, guard = 0; ends.length && d <= ends[ends.length - 1]! && guard < 400; d = shiftDate(d, 1), guard++) {
    days.push({ day: d, before: before.get(d) ?? 0, after: load.get(d) ?? 0 });
  }
  return { moves, channels, days };
}
