/**
 * Future reset: a last resort for when work has fallen far behind. Every
 * overdue VO gets a new day, a few a day from tomorrow, and each upload moves
 * to at least six days after its VO (the studio's buffer), taking the rest of
 * its channel's schedule with it, spacing kept.
 *
 * Order: channels by their average long-form views, highest first, in
 * rounds — every channel's first late VO before any channel's second — so
 * the biggest channels go first without one channel's whole backlog holding
 * the others up. Days already carrying VOs (not late ones) take fewer.
 *
 * Pure: the route gathers the work and applies the plan (with Undo).
 */
import { VO_BUFFER_DAYS, shiftDate } from "../parse/derive.js";
import { daysBetween } from "./cadence.js";

/** VOs a day the reset spreads to: 5 is the studio's standard day. */
export const RESET_BOUNDS = { min: 1, max: 15, fallback: 5 };
/** How far ahead the reset will look for room, at most. */
const MAX_DAYS = 365;

export interface ResetVo {
  id: number;
  channel: string;
  title: string;
  /** Its upload day, if it has one. */
  airDate: string | null;
  /** The day its VO is due (ET). */
  voDay: string;
}

/** A video on a channel's schedule that moves with the channel (not uploaded, not paused, not a batch). */
export interface ResetVideo {
  id: number;
  channel: string;
  airDate: string;
  label: string;
}

export interface ResetPlan {
  /** Each day the late VOs go to, with how many VOs it carries in all. */
  days: Array<{ day: string; vos: Array<ResetVo & { newAir: string | null }>; total: number }>;
  /** Uploads that move: the late VOs' own and the rest of their channels'. */
  moves: Array<{ id: number; channel: string; label: string; from: string; to: string; shift: number }>;
  /** Each late VO's new day. */
  assign: Map<number, string>;
  /** The order channels were taken in. */
  channels: Array<{ channel: string; avgViews: number | null; late: number }>;
}

export function planReset(o: {
  /** The first day VOs may go to (the day after the one My Day is on). */
  start: string;
  perDay: number;
  daysOff: Set<string>;
  /** VOs past due. */
  late: ResetVo[];
  /** VOs not late yet: they count toward a day's load, and move with their channel. */
  upcoming: ResetVo[];
  schedule: ResetVideo[];
  avgViews: Map<string, number>;
}): ResetPlan {
  const perDay = Math.max(RESET_BOUNDS.min, Math.min(RESET_BOUNDS.max, Math.round(o.perDay)));
  const byAir = (a: ResetVo, b: ResetVo) => (a.airDate ?? "9").localeCompare(b.airDate ?? "9") || a.voDay.localeCompare(b.voDay) || a.id - b.id;
  const byChannel = new Map<string, ResetVo[]>();
  for (const v of o.late) byChannel.set(v.channel, [...(byChannel.get(v.channel) ?? []), v]);
  for (const list of byChannel.values()) list.sort(byAir);
  const views = (ch: string) => o.avgViews.get(ch) ?? -1;
  const channels = [...byChannel.keys()].sort((a, b) => views(b) - views(a) || a.localeCompare(b));
  // Rounds: each channel's first, then each one's second, and so on.
  const queue: ResetVo[] = [];
  for (let round = 0; queue.length < o.late.length; round++) {
    for (const ch of channels) {
      const v = byChannel.get(ch)![round];
      if (v) queue.push(v);
    }
  }

  // Pushes so far, per channel: a late video moved `delta` days takes every video after it along.
  const pushes = new Map<string, Array<{ id: number; air: string; delta: number }>>();
  const shiftOf = (ch: string, air: string | null, self?: number) =>
    air ? (pushes.get(ch) ?? []).filter((p) => p.air < air || p.id === self).reduce((n, p) => n + p.delta, 0) : 0;
  const assign = new Map<number, string>();
  const newAir = new Map<number, string | null>();
  const load = (day: string) =>
    [...assign.values()].filter((d) => d === day).length +
    o.upcoming.filter((u) => shiftDate(u.voDay, shiftOf(u.channel, u.airDate)) === day).length;

  let day = o.start;
  let guard = 0;
  for (const v of queue) {
    while ((o.daysOff.has(day) || load(day) >= perDay) && guard++ < MAX_DAYS) day = shiftDate(day, 1);
    assign.set(v.id, day);
    const cur = v.airDate ? shiftDate(v.airDate, shiftOf(v.channel, v.airDate)) : null;
    const need = shiftDate(day, VO_BUFFER_DAYS);
    const delta = cur && cur < need ? daysBetween(cur, need) : 0;
    if (v.airDate) pushes.set(v.channel, [...(pushes.get(v.channel) ?? []), { id: v.id, air: v.airDate, delta }]);
    newAir.set(v.id, cur ? shiftDate(cur, delta) : null);
  }

  // Every video that moves: its channel's pushes before it, and its own.
  const moves: ResetPlan["moves"] = [];
  for (const x of o.schedule) {
    if (!pushes.has(x.channel)) continue;
    const shift = shiftOf(x.channel, x.airDate, x.id);
    if (shift > 0) moves.push({ id: x.id, channel: x.channel, label: x.label, from: x.airDate, to: shiftDate(x.airDate, shift), shift });
  }
  moves.sort((a, b) => a.channel.localeCompare(b.channel) || a.from.localeCompare(b.from) || a.id - b.id);

  const days = [...new Set(assign.values())].sort().map((d) => ({
    day: d,
    vos: queue.filter((v) => assign.get(v.id) === d).map((v) => ({ ...v, newAir: newAir.get(v.id) ?? null })),
    total: load(d),
  }));
  return {
    days,
    moves,
    assign,
    channels: channels.map((ch) => ({ channel: ch, avgViews: o.avgViews.get(ch) ?? null, late: byChannel.get(ch)!.length })),
  };
}
