/**
 * Future reset: a last resort for when work has fallen far behind. The
 * pending VOs, late and upcoming, are laid out a set number a day from the
 * start day, every day filled, and each upload moves to at least six days
 * after its VO (the studio's buffer), taking the rest of its channel's
 * schedule with it, spacing kept.
 *
 * Order: late VOs first, then the rest; each by channel average long-form
 * views, highest first, in rounds — every channel's first before any
 * channel's second — so the biggest channels go first without one channel's
 * whole backlog holding the others up. A late VO can go on any day; one not late yet only
 * on or after its own day (nothing is pulled earlier), and it stays on its
 * day if there's room, else moves to the next day with room. Once every
 * late VO is placed and nothing is waiting to move, the rest stays as it is.
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
  /** Each day the reset fills: every VO on it, late, moved or staying. */
  days: Array<{ day: string; vos: Array<ResetVo & { newAir: string | null; kind: "late" | "moved" | "stays" }>; total: number }>;
  /** Uploads that move: the placed VOs' own and the rest of their channels'. */
  moves: Array<{ id: number; channel: string; label: string; from: string; to: string; shift: number }>;
  /** Each VO whose day changes, and its new day. */
  assign: Map<number, string>;
  /** The order channels were taken in. */
  channels: Array<{ channel: string; avgViews: number | null; late: number }>;
}

export function planReset(o: {
  /** The first day VOs may go to. */
  start: string;
  perDay: number;
  daysOff: Set<string>;
  /** VOs past due. */
  late: ResetVo[];
  /** VOs not late yet: they fill days too, on or after their own day. */
  upcoming: ResetVo[];
  schedule: ResetVideo[];
  avgViews: Map<string, number>;
}): ResetPlan {
  const perDay = Math.max(RESET_BOUNDS.min, Math.min(RESET_BOUNDS.max, Math.round(o.perDay)));
  const lateIds = new Set(o.late.map((v) => v.id));
  const byAir = (a: ResetVo, b: ResetVo) => (a.airDate ?? "9").localeCompare(b.airDate ?? "9") || a.voDay.localeCompare(b.voDay) || a.id - b.id;
  const byChannel = new Map<string, ResetVo[]>();
  for (const v of [...o.late, ...o.upcoming]) byChannel.set(v.channel, [...(byChannel.get(v.channel) ?? []), v]);
  for (const list of byChannel.values()) list.sort(byAir);
  const views = (ch: string) => o.avgViews.get(ch) ?? -1;
  const channels = [...byChannel.keys()].sort((a, b) => views(b) - views(a) || a.localeCompare(b));
  // Late VOs first, then the ones not late yet; each in rounds: every channel's first, then each one's second.
  const rounds = (list: ResetVo[]) => {
    const out: ResetVo[] = [];
    for (let round = 0; out.length < list.length; round++) {
      for (const ch of channels) {
        const v = byChannel.get(ch)!.filter((x) => list.includes(x))[round];
        if (v) out.push(v);
      }
    }
    return out;
  };
  const queue = [...rounds(o.late), ...rounds(o.upcoming)];

  // Pushes so far, per channel: a video moved `delta` days takes every video after it along.
  const pushes = new Map<string, Array<{ id: number; air: string; delta: number }>>();
  const shiftOf = (ch: string, air: string | null, self?: number) =>
    air ? (pushes.get(ch) ?? []).filter((p) => p.air < air || p.id === self).reduce((n, p) => n + p.delta, 0) : 0;
  /** A VO's own day as things stand: its due day, moved with its channel's pushes so far. */
  const ownDay = (v: ResetVo) => shiftDate(v.voDay, shiftOf(v.channel, v.airDate));
  const placed = new Map<number, { day: string; newAir: string | null; kind: "late" | "moved" | "stays" }>();
  const assign = new Map<number, string>();
  const place = (v: ResetVo, day: string) => {
    const own = ownDay(v);
    const cur = v.airDate ? shiftDate(v.airDate, shiftOf(v.channel, v.airDate)) : null;
    const need = shiftDate(day, VO_BUFFER_DAYS);
    const delta = cur && cur < need ? daysBetween(cur, need) : 0;
    if (v.airDate && delta > 0) pushes.set(v.channel, [...(pushes.get(v.channel) ?? []), { id: v.id, air: v.airDate, delta }]);
    const kind = lateIds.has(v.id) ? "late" : day !== own ? "moved" : "stays";
    if (kind !== "stays") assign.set(v.id, day);
    placed.set(v.id, { day, newAir: cur ? shiftDate(cur, delta) : null, kind });
  };
  // A channel's VOs go in their order: one waits for the one before it.
  const ready = (v: ResetVo) => {
    const list = byChannel.get(v.channel)!;
    const i = list.indexOf(v);
    return i === 0 || placed.has(list[i - 1]!.id);
  };
  const lateLeft = () => o.late.some((v) => !placed.has(v.id));
  const waiting = (day: string) => o.upcoming.some((v) => !placed.has(v.id) && ownDay(v) < day);

  for (let day = o.start, guard = 0; (lateLeft() || waiting(day)) && guard < MAX_DAYS; day = shiftDate(day, 1), guard++) {
    if (o.daysOff.has(day)) {
      // Nobody works a day off: only VOs already due on it stay there.
      for (const v of queue) if (!placed.has(v.id) && !lateIds.has(v.id) && ready(v) && ownDay(v) === day) place(v, day);
      continue;
    }
    let n = 0;
    for (const v of queue) {
      if (n >= perDay) break;
      if (placed.has(v.id) || !ready(v)) continue;
      if (!lateIds.has(v.id) && ownDay(v) > day) continue;
      place(v, day);
      n += 1;
    }
  }

  // Every video that moves: its channel's pushes before it, and its own.
  const moves: ResetPlan["moves"] = [];
  for (const x of o.schedule) {
    if (!pushes.has(x.channel)) continue;
    const shift = shiftOf(x.channel, x.airDate, x.id);
    if (shift > 0) moves.push({ id: x.id, channel: x.channel, label: x.label, from: x.airDate, to: shiftDate(x.airDate, shift), shift });
  }
  moves.sort((a, b) => a.channel.localeCompare(b.channel) || a.from.localeCompare(b.from) || a.id - b.id);

  const days = [...new Set([...placed.values()].map((p) => p.day))].sort().map((d) => {
    const vos = queue.filter((v) => placed.get(v.id)?.day === d).map((v) => ({ ...v, newAir: placed.get(v.id)!.newAir, kind: placed.get(v.id)!.kind }));
    return { day: d, vos, total: vos.length };
  });
  const lateBy = (ch: string) => o.late.filter((v) => v.channel === ch).length;
  return {
    days,
    moves,
    assign,
    // The channels the reset changes something on, in the order they were taken.
    channels: channels.filter((ch) => queue.some((v) => v.channel === ch && placed.get(v.id) && placed.get(v.id)!.kind !== "stays"))
      .map((ch) => ({ channel: ch, avgViews: o.avgViews.get(ch) ?? null, late: lateBy(ch) })),
  };
}
