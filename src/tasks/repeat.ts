/**
 * Repeating tasks: how often, and when the next one falls. The next is
 * counted from when this one was due (or today, with no date), and always
 * lands after today — finishing a daily task three days late opens
 * tomorrow's, not three already-late ones — and never on a day off.
 */
import { shiftDate } from "../parse/derive.js";

export const REPEATS = [
  { id: "daily", label: "Every day" },
  { id: "weekdays", label: "Every weekday" },
  { id: "weekly", label: "Every week" },
  { id: "biweekly", label: "Every 2 weeks" },
  { id: "monthly", label: "Every month" },
] as const;
export type Repeat = (typeof REPEATS)[number]["id"];
export const REPEAT = new Map<string, (typeof REPEATS)[number]>(REPEATS.map((r) => [r.id, r]));


function step(d: string, r: Repeat): string {
  switch (r) {
    case "daily": return shiftDate(d, 1);
    case "weekly": return shiftDate(d, 7);
    case "biweekly": return shiftDate(d, 14);
    case "weekdays": {
      let n = shiftDate(d, 1);
      while ([0, 6].includes(new Date(`${n}T12:00:00Z`).getUTCDay())) n = shiftDate(n, 1);
      return n;
    }
    case "monthly": {
      const [y, m, day] = d.split("-").map(Number) as [number, number, number];
      const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      const x = new Date(Date.UTC(y, m, Math.min(day, last), 12));
      return x.toISOString().slice(0, 10);
    }
  }
}

/**
 * The day the next occurrence falls: after `from`, and after today. One that
 * falls on a day off is done the working day before it instead, if that's
 * still after today (a weekly report due on a Tuesday off: the Monday);
 * otherwise the first working day after it (a daily task: the day off is
 * simply skipped).
 */
export function nextOccurrence(from: string, repeat: Repeat, today: string, daysOff: Set<string> = new Set()): string {
  let next = step(from, repeat);
  for (let guard = 0; next <= today && guard < 400; guard++) next = step(next, repeat);
  if (!daysOff.has(next)) return next;
  let before = shiftDate(next, -1);
  for (let guard = 0; daysOff.has(before) && guard < 400; guard++) before = shiftDate(before, -1);
  if (before > today) return before;
  let after = shiftDate(next, 1);
  for (let guard = 0; daysOff.has(after) && guard < 400; guard++) after = shiftDate(after, 1);
  return after;
}

/** Whether a repeat counted from `from` falls on `day` (a day after it). */
export function fallsOn(from: string, repeat: Repeat, day: string): boolean {
  let d = from;
  for (let guard = 0; d < day && guard < 800; guard++) d = step(d, repeat);
  return d === day && day > from;
}
