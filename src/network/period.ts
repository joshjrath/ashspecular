/**
 * The date range every part of Network Overview reads, and the one it's
 * compared with. Ranges of whole days end yesterday (today isn't over); the
 * ones that run to today say they're partial. The comparison is the same
 * number of days just before — or, for a month or year so far, the same days
 * of the last one.
 */
import { isRealDate, shiftDate } from "../parse/derive.js";

export const PRESETS = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "7d", label: "Last 7 days" },
  { id: "28d", label: "Last 28 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "90d", label: "Last 90 days" },
  { id: "month", label: "This month" },
  { id: "lastmonth", label: "Last month" },
  { id: "year", label: "This year" },
  { id: "all", label: "All available data" },
  { id: "custom", label: "Custom range" },
] as const;
export type PresetId = (typeof PRESETS)[number]["id"];
export const isPreset = (v: unknown): v is PresetId => PRESETS.some((p) => p.id === v);

export interface Range {
  from: string;
  to: string;
}

export interface Period extends Range {
  preset: PresetId;
  label: string;
  days: number;
  /** Runs to today, which isn't over. */
  partial: boolean;
  /** What it's compared with, or null (today, all data). */
  prev: (Range & { label: string }) | null;
  /** Why there's no comparison, when there isn't one. */
  noPrevWhy: string | null;
}

export const daysIn = (r: Range) => Math.round((Date.parse(`${r.to}T12:00:00Z`) - Date.parse(`${r.from}T12:00:00Z`)) / 86_400_000) + 1;

/** Every day of a range, in order. */
export function eachDay(r: Range): string[] {
  const out: string[] = [];
  for (let d = r.from; d <= r.to && out.length < 4000; d = shiftDate(d, 1)) out.push(d);
  return out;
}

const monthStart = (d: string) => `${d.slice(0, 7)}-01`;
const lastOfMonth = (d: string) => shiftDate(`${shiftDate(monthStart(d), 32).slice(0, 7)}-01`, -1);
/** The same day of the month before, capped at that month's end (3/31 → 2/28). */
function sameDayMonthBefore(d: string): string {
  const prevStart = monthStart(shiftDate(monthStart(d), -1));
  const capped = Math.min(Number(d.slice(8)), Number(lastOfMonth(prevStart).slice(8)));
  return `${prevStart.slice(0, 8)}${String(capped).padStart(2, "0")}`;
}

/** The comparison for a range of n days: the n days just before it. */
function before(r: Range): Range & { label: string } {
  const n = daysIn(r);
  return { from: shiftDate(r.from, -n), to: shiftDate(r.from, -1), label: `previous ${n} day${n === 1 ? "" : "s"}` };
}

export function periodOf(preset: PresetId, today: string, opts: { from?: string; to?: string; firstDay?: string | null } = {}): Period {
  const yesterday = shiftDate(today, -1);
  const last = (n: number): Range => ({ from: shiftDate(today, -n), to: yesterday });
  const make = (r: Range, label: string, partial: boolean, prev: Period["prev"], noPrevWhy: string | null = null): Period => ({
    ...r, preset, label, days: daysIn(r), partial, prev, noPrevWhy,
  });
  switch (preset) {
    case "today":
      return make({ from: today, to: today }, "Today", true, null, "Today isn't over, so there's nothing fair to compare it with yet.");
    case "yesterday":
      return make({ from: yesterday, to: yesterday }, "Yesterday", false, { from: shiftDate(today, -2), to: shiftDate(today, -2), label: "the day before" });
    case "7d": case "28d": case "30d": case "90d": {
      const n = Number(preset.slice(0, -1));
      const r = last(n);
      return make(r, `Last ${n} days`, false, before(r));
    }
    case "month": {
      const r = { from: monthStart(today), to: today };
      const prevFrom = monthStart(shiftDate(r.from, -1));
      return make(r, "This month", true, { from: prevFrom, to: sameDayMonthBefore(today), label: "the same days last month" });
    }
    case "lastmonth": {
      const from = monthStart(shiftDate(monthStart(today), -1));
      const r = { from, to: lastOfMonth(from) };
      const pf = monthStart(shiftDate(from, -1));
      return make(r, "Last month", false, { from: pf, to: lastOfMonth(pf), label: "the month before" });
    }
    case "year": {
      const r = { from: `${today.slice(0, 4)}-01-01`, to: today };
      const y = String(Number(today.slice(0, 4)) - 1);
      const sameDay = isRealDate(`${y}${today.slice(4)}`) ? `${y}${today.slice(4)}` : `${y}-02-28`;
      return make(r, "This year", true, { from: `${y}-01-01`, to: sameDay, label: "the same days last year" });
    }
    case "all": {
      const from = opts.firstDay && opts.firstDay <= today ? opts.firstDay : today;
      return make({ from, to: today }, "All available data", true, null, "All the data there is has nothing before it to compare with.");
    }
    case "custom": {
      let from = isRealDate(opts.from) ? opts.from : shiftDate(today, -28);
      let to = isRealDate(opts.to) ? opts.to : yesterday;
      if (to > today) to = today;
      if (from > to) [from, to] = [to, from];
      // A custom range is capped at three years, so nothing walks forever.
      if (daysIn({ from, to }) > 1100) from = shiftDate(to, -1099);
      const r = { from, to };
      return make(r, `${from} to ${to}`, to >= today, before(r));
    }
  }
}
