/**
 * Moving one video moves the rest of its channel's schedule with it.
 *
 * Drag a video later and every video after it on the same channel goes later
 * by the same number of days; drag it earlier and they come earlier, keeping
 * their spacing. Two things never happen:
 *
 * - Nothing dated before today moves. That's the channel's post history.
 * - Nothing is pulled back past today. A backward shift stops where the
 *   first of the rest would land on today, so the spacing still holds.
 *
 * Only the videos after the one you moved go with it. The ones before it are
 * already in place.
 */
import { shiftDate } from "../parse/derive.js";
import { daysBetween } from "./cadence.js";

/** A video on the channel's schedule, by the day the calendar shows it on. */
export interface Slot {
  id: number;
  date: string;
  label: string;
}

export interface Cascade {
  /** Days the rest moved: negative is earlier. 0 when nothing moved. */
  days: number;
  /** Days the dragged video moved. It differs from `days` only when today stopped the rest. */
  asked: number;
  moves: Array<{ id: number; from: string; to: string; label: string }>;
}

export function planCascade(moved: { id: number; from: string; to: string }, schedule: Slot[], today: string): Cascade {
  const asked = daysBetween(moved.from, moved.to);
  const rest = schedule.filter((s) => s.id !== moved.id && s.date > moved.from && s.date >= today);
  if (!asked || !rest.length) return { days: 0, asked, moves: [] };
  const first = rest.reduce((min, s) => (s.date < min ? s.date : min), rest[0]!.date);
  const days = asked > 0 ? asked : Math.max(asked, daysBetween(first, today));
  if (!days) return { days: 0, asked, moves: [] };
  return {
    days,
    asked,
    moves: rest
      .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)
      .map((s) => ({ id: s.id, from: s.date, to: shiftDate(s.date, days), label: s.label })),
  };
}

/** "Also moved 3 later Specular Studios videos 2 days later: VIDEO-013, VIDEO-020, VIDEO-031." */
export function cascadeText(channel: string, plan: Cascade): string {
  const n = plan.moves.length;
  const abs = Math.abs(plan.days);
  const names = plan.moves.slice(0, 3).map((m) => m.label).join(", ") + (n > 3 ? ` and ${n - 3} more` : "");
  const stopped = plan.days !== plan.asked ? ` (not ${Math.abs(plan.asked)}: nothing goes before today)` : "";
  return `Also moved ${n} later ${channel} video${n === 1 ? "" : "s"} ${abs} day${abs === 1 ? "" : "s"} ${
    plan.days > 0 ? "later" : "earlier"
  }${stopped}: ${names}.`;
}
