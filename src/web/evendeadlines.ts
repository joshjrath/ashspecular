/**
 * Even out deadlines: Future reset's companion to Even out uploads. Every
 * pending VO is due VO_BUFFER_DAYS before its upload, the day it's needed
 * by, with no day carrying more than a set number:
 *
 * - A VO goes on the day it's needed by. If that day's full, it goes to the
 *   nearest earlier day with room (from the start day on); if none, it may
 *   take EVEN_WINDOW_DAYS before its upload (the least time to record and
 *   cut it); failing that it goes later, to the first day with room, and its
 *   upload moves to the buffer after it, taking the channel's later uploads
 *   along (gaps kept, closing in to the channel's frequency where they were
 *   wider).
 * - VOs already too late for their upload's buffer go first, on the soonest
 *   days, in Future reset's order: late ones first, biggest channels first,
 *   in rounds.
 * - Days off get none. A VO with no upload day keeps its own day if there's
 *   room.
 *
 * So after Even out uploads, every VO lines up six days before its upload
 * and only a crowded day spreads; on its own, any VO that can't make its
 * upload moves the upload instead. Pure: the route gathers the work and
 * applies the plan (with Undo).
 */
import { VO_BUFFER_DAYS, shiftDate } from "../parse/derive.js";
import { daysBetween } from "./cadence.js";
import { EVEN_WINDOW_DAYS } from "./evenout.js";
import { type ResetVideo, type ResetVo, channelQueues, channelsByViews, inRounds } from "./reset.js";

/** How far ahead a VO looks for a day with room, at most. */
const MAX_DAYS = 365;

export type DueKind = "late" | "earlier" | "later" | "stays";

export interface EvenDuePlan {
  /** Every VO, where it goes: its old and new day, its upload's old and new day. */
  vos: Array<ResetVo & { to: string; newAir: string | null; kind: DueKind }>;
  /** Each VO whose day changes, and its new day. */
  assign: Map<number, string>;
  /** Uploads that move later because their VO can't be ready in time. */
  moves: Array<{ id: number; channel: string; label: string; from: string; to: string; shift: number }>;
  /** VOs a day, before and after, from the start day to the last one planned (late ones aren't counted before). */
  days: Array<{ day: string; before: number; after: number }>;
}

export function planEvenDeadlines(o: {
  start: string;
  perDay: number;
  daysOff: Set<string>;
  /** VOs past due. */
  late: ResetVo[];
  upcoming: ResetVo[];
  schedule: ResetVideo[];
  avgViews: Map<string, number>;
  every?: Map<string, number>;
}): EvenDuePlan {
  const all = [...o.late, ...o.upcoming];
  const lateIds = new Set(o.late.map((v) => v.id));
  const byChannel = channelQueues(all);
  const channels = channelsByViews(byChannel, o.avgViews);
  const open = (d: string) => !o.daysOff.has(d);

  const schedOf = new Map<string, ResetVideo[]>();
  for (const x of o.schedule) schedOf.set(x.channel, [...(schedOf.get(x.channel) ?? []), x]);
  for (const list of schedOf.values()) list.sort((a, b) => a.airDate.localeCompare(b.airDate) || a.id - b.id);
  const original = new Map(o.schedule.map((x) => [x.id, x.airDate]));

  // An upload a VO can't be ready for: the day it has to move to (only ever later, kept across rounds).
  const needs = new Map<number, string>();
  /** Each channel's uploads with the needs applied: none earlier, gaps kept (closing in to the frequency where wider). */
  const airsNow = () => {
    const out = new Map<number, string>();
    for (const [ch, list] of schedOf) {
      const every = o.every?.get(ch);
      let prevOld: string | null = null, prevNew: string | null = null;
      for (const x of list) {
        let air = x.airDate;
        const need = needs.get(x.id);
        if (need && need > air) air = need;
        if (prevOld && prevNew && prevNew > prevOld) {
          const gap = daysBetween(prevOld, x.airDate);
          const after = shiftDate(prevNew, every && every > 0 ? Math.min(gap, every) : gap);
          if (after > air) air = after;
        }
        out.set(x.id, air);
        prevOld = x.airDate;
        prevNew = air;
      }
    }
    return out;
  };

  let placed = new Map<number, string>();
  let airs = airsNow();
  const airOf = (v: ResetVo) => (v.airDate ? airs.get(v.id) ?? v.airDate : null);
  // Moving one upload moves its channel's later ones, and their VOs then fit later: settle in a few rounds.
  for (let round = 0; round < 5; round++) {
    const load = new Map<string, number>();
    const room = (d: string) => open(d) && (load.get(d) ?? 0) < o.perDay;
    const put = (v: ResetVo, d: string) => { placed.set(v.id, d); load.set(d, (load.get(d) ?? 0) + 1); };
    placed = new Map();
    const ideal = (v: ResetVo) => { const a = airOf(v); return a ? shiftDate(a, -VO_BUFFER_DAYS) : v.voDay; };
    const loose = (v: ResetVo) => { const a = airOf(v); return a ? shiftDate(a, -EVEN_WINDOW_DAYS) : v.voDay; };

    // Forward from the start: the first day with room after the channel's VO before it.
    const forward = (list: ResetVo[]) => {
      const queue = [...inRounds(list.filter((v) => lateIds.has(v.id)), byChannel, channels), ...inRounds(list.filter((v) => !lateIds.has(v.id)), byChannel, channels)];
      for (const v of queue) {
        const mine = byChannel.get(v.channel)!;
        const prev = mine.slice(0, mine.indexOf(v)).map((x) => placed.get(x.id)).filter((d): d is string => Boolean(d)).sort().pop();
        let d = prev && prev > o.start ? prev : o.start;
        for (let guard = 0; !room(d) && guard < MAX_DAYS; guard++) d = shiftDate(d, 1);
        put(v, d);
      }
    };
    // First the VOs already too late for their uploads' buffer (late ones first, biggest channels first): the soonest days.
    forward(all.filter((v) => ideal(v) < o.start));
    // Then the rest on the day they're needed by, else the nearest earlier day with room; the latest needed first, so earlier days stay free for earlier VOs.
    const behind: ResetVo[] = [];
    for (const v of all.filter((x) => ideal(x) >= o.start).sort((a, b) => ideal(b).localeCompare(ideal(a)) || b.id - a.id)) {
      let day: string | null = null;
      for (let d = ideal(v), guard = 0; d >= o.start && guard < MAX_DAYS; d = shiftDate(d, -1), guard++) if (room(d)) { day = d; break; }
      if (!day && room(loose(v))) day = loose(v);
      if (day) put(v, day);
      else behind.push(v);
    }
    // And what found no room in time goes later.
    forward(behind);

    let changed = false;
    for (const v of all) {
      const d = placed.get(v.id)!;
      const a = airOf(v);
      if (!a || d <= loose(v)) continue;
      const need = shiftDate(d, VO_BUFFER_DAYS);
      if (!needs.has(v.id) || need > needs.get(v.id)!) { needs.set(v.id, need); changed = true; }
    }
    if (!changed) break;
    airs = airsNow();
  }

  const vos = all.map((v) => {
    const to = placed.get(v.id)!;
    const kind: DueKind = lateIds.has(v.id) ? "late" : to < v.voDay ? "earlier" : to > v.voDay ? "later" : "stays";
    return { ...v, to, newAir: airOf(v), kind };
  }).sort((a, b) => a.to.localeCompare(b.to) || a.channel.localeCompare(b.channel) || a.id - b.id);
  const assign = new Map(vos.filter((v) => v.to !== v.voDay).map((v) => [v.id, v.to] as const));

  const moves: EvenDuePlan["moves"] = [];
  for (const x of o.schedule) {
    const to = airs.get(x.id)!;
    if (to !== original.get(x.id)) moves.push({ id: x.id, channel: x.channel, label: x.label, from: x.airDate, to, shift: daysBetween(x.airDate, to) });
  }
  moves.sort((a, b) => a.channel.localeCompare(b.channel) || a.from.localeCompare(b.from) || a.id - b.id);

  const count = (key: "voDay" | "to") => {
    const m = new Map<string, number>();
    for (const v of vos) if (!(key === "voDay" && lateIds.has(v.id))) m.set(v[key], (m.get(v[key]) ?? 0) + 1);
    return m;
  };
  const before = count("voDay"), after = count("to");
  const end = [...before.keys(), ...after.keys()].sort().pop();
  const days: EvenDuePlan["days"] = [];
  for (let d = o.start, guard = 0; end && d <= end && guard < MAX_DAYS; d = shiftDate(d, 1), guard++) days.push({ day: d, before: before.get(d) ?? 0, after: after.get(d) ?? 0 });
  return { vos, assign, moves, days };
}
