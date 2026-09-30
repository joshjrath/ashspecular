/**
 * Ash's own work, as time: what each piece takes, what each day holds, what to
 * do next, what to do ahead, and what's slipping through the cracks.
 *
 * The estimates are per piece of work, and set on the Settings page (Time
 * estimates) — this module holds them, so every page counts time the same way:
 *
 *   Stories VO            40 min   (defaults, until changed)
 *   Movies VO             60 min
 *   Gaming video          45 min
 *   Reading batch         10 min
 *   Bits batch            10 min
 *   Revision review       15 min
 *   Specular long-form    45 min   (the daily long-form batch)
 *   each recurring channel         its own, else its kind's (Reading, Bits, long-form)
 *   Task                  its own if set, else its category's (Pay 2, Respond 5, …)
 *
 * A day's load is the estimate of everything due that day, plus the daily
 * batches every recurring channel will open that day that aren't open yet.
 * Time tracked with a timer is the actual; what's left of a piece is its
 * estimate less what's been tracked on it.
 */
import { CATEGORIES, CHANNELS, isLongFormRecurring } from "../catalog.js";
import { ORG_TZ, dateIn, instantIn, shiftDate, shortsDay } from "../parse/derive.js";
import type { StoredRecord } from "../db/records.js";
import type { Task } from "../db/tasks.js";
import { TASK_CATEGORY } from "../tasks/parse.js";
import { addDays, daysBetween } from "./cadence.js";

export type WorkType = "vo" | "moviesvo" | "gaming" | "reading" | "bits" | "longform" | "revision" | "task";

/** The estimates before anything is changed on the Settings page. */
export const DEFAULT_ESTIMATES: Record<WorkType, number> = { vo: 40, moviesvo: 60, gaming: 45, reading: 10, bits: 10, longform: 45, revision: 15, task: 5 };

/**
 * The estimates as set on the Settings page, by key: "type:reading",
 * "channel:Specular DC", "task:payment". The server loads them before every
 * page, so a change shows everywhere at once.
 */
let overrides = new Map<string, number>();
export function setEstimates(m: Map<string, number>): void {
  overrides = new Map(m);
}
export const estimateOverrides = (): ReadonlyMap<string, number> => overrides;

/** Minutes a kind of work takes. */
export function typeEstimate(type: WorkType): number {
  return overrides.get(`type:${type}`) ?? DEFAULT_ESTIMATES[type];
}

/** Which kind of batch a recurring channel's daily batch is. */
export function batchType(ch: { category: string; recurring?: { format?: string } } | undefined): WorkType {
  if (isLongFormRecurring(ch as never)) return "longform";
  return ch?.category === "reading" ? "reading" : "bits";
}

/** Minutes a recurring channel's daily batch takes: its own, else its kind's. */
export function channelEstimate(name: string): number {
  const ch = CHANNELS.find((c) => c.name === name);
  return overrides.get(`channel:${name}`) ?? typeEstimate(batchType(ch));
}

/** Minutes a task takes when it has none of its own: its category's. */
export function taskCategoryEstimate(category: string): number {
  return overrides.get(`task:${category}`) ?? TASK_CATEGORY.get(category)?.est ?? DEFAULT_ESTIMATES.task;
}

/** A VO to record — Stories or Movies. */
export const isVo = (t: WorkType) => t === "vo" || t === "moviesvo";
/** A daily Shorts batch — Reading or Bits. */
export const isBatch = (t: WorkType) => t === "reading" || t === "bits";

const catColour = (id: string) => CATEGORIES.find((c) => c.id === id)?.color ?? "#8A8F98";

/** Each kind of work in its category's own colour; revisions in theirs. */
export const WORK_TYPES: Array<{ id: WorkType; label: string; short: string; colour: string }> = [
  { id: "vo", label: "Stories VO", short: "VO", colour: catColour("stories") },
  { id: "moviesvo", label: "Movies VO", short: "Movie VO", colour: catColour("movies") },
  { id: "gaming", label: "Gaming video", short: "Gaming", colour: catColour("gaming") },
  { id: "reading", label: "Reading batch", short: "Reading", colour: catColour("reading") },
  { id: "bits", label: "Bits batch", short: "Bits", colour: catColour("bits") },
  { id: "longform", label: "Specular long-form", short: "Long-form", colour: catColour("movies") },
  { id: "revision", label: "Revision review", short: "Revision", colour: "#7D8AF5" },
  { id: "task", label: "Task", short: "Task", colour: "#4FC4B0" },
];
export const TYPE_BY_ID = new Map(WORK_TYPES.map((t) => [t.id, t]));

/** Words a minute when reading a VO aloud, for the recording-time estimate. */
export const VO_WPM = 150;

export interface WorkItem {
  /** Null for a batch that will open on its day but hasn't yet. */
  id: number | null;
  type: WorkType;
  title: string;
  channel: string | null;
  category: string;
  code: string | null;
  /** When it's due, if it has a time. */
  due: Date | null;
  /** The day it counts toward (its due day, else its air date), YYYY-MM-DD. */
  day: string | null;
  airDate: string | null;
  est: number;
  spent: number;
  wordCount: number | null;
  projected: boolean;
  record?: StoredRecord;
  /** Set when the piece is a task from #tasks rather than a record. */
  task?: Task;
  /** Logged done with no time tracked — someone else did it. */
  untracked?: boolean;
}

/** A piece's key across records and tasks — "r12", "t5" — for the running timer. */
export const itemKey = (i: WorkItem) => (i.id === null ? null : `${i.task ? "t" : "r"}${i.id}`);

/**
 * A task as work: its own estimate, else its category's (Pay 2 min, Respond
 * 5, …). An urgent one counts toward today even without a date, so it sits
 * beside the VOs; one with a date counts toward that day.
 */
export function taskItem(t: Task, now: Date, spent = 0): WorkItem {
  const today = dateIn(ORG_TZ, now);
  const dueDay = t.due ? dateIn(ORG_TZ, t.due) : null;
  return {
    id: t.id,
    type: "task",
    title: t.title,
    channel: null,
    category: t.category,
    code: null,
    due: t.due,
    day: dueDay ?? (t.priority === "urgent" ? today : null),
    airDate: null,
    est: t.estMin ?? taskCategoryEstimate(t.category),
    spent,
    wordCount: null,
    projected: false,
    task: t,
  };
}

/** What kind of Ash's work a record is — or null when it isn't hers. */
export function typeOf(r: StoredRecord): WorkType | null {
  if (r.kind === "review") return "revision";
  if (r.batchNo) return batchType(CHANNELS.find((c) => c.name === r.channel) ?? { category: r.category });
  if (r.category === "stories") return "vo";
  if (r.category === "movies") return "moviesvo";
  if (r.category === "gaming") return "gaming";
  return null;
}

const dueOf = (r: StoredRecord) => r.voDue ?? r.deadline ?? r.scriptDue;

export function toItem(r: StoredRecord, spent = 0): WorkItem | null {
  const type = typeOf(r);
  if (!type) return null;
  const due = dueOf(r);
  return {
    id: r.id,
    type,
    title: r.batchNo && r.channel ? r.channel : r.title ?? r.code ?? "(untitled)",
    channel: r.channel,
    category: r.category,
    code: r.code,
    due,
    day: due ? dateIn(ORG_TZ, due) : r.airDate,
    airDate: r.airDate,
    est: r.batchNo && r.channel ? channelEstimate(r.channel) : typeEstimate(type),
    spent,
    wordCount: r.wordCount,
    projected: false,
    record: r,
  };
}

export const remaining = (i: WorkItem) => Math.max(0, Math.round(i.est - i.spent));

/** My Day's category switches: each covers one or more kinds of work. */
export const MYDAY_GROUPS: Array<{ id: string; label: string; types: WorkType[] }> = [
  { id: "vo", label: "VO", types: ["vo", "moviesvo"] },
  { id: "revision", label: "Revision", types: ["revision"] },
  { id: "task", label: "Task", types: ["task"] },
  { id: "batch", label: "Batch", types: ["reading", "bits"] },
  { id: "longform", label: "Long-form", types: ["longform"] },
  { id: "gaming", label: "Gaming", types: ["gaming"] },
];
/** The kinds of work left showing when these switches are off. */
export function shownTypes(hidden: string[]): Set<WorkType> {
  return new Set(MYDAY_GROUPS.filter((g) => !hidden.includes(g.id)).flatMap((g) => g.types));
}

/** How pressing a piece is when a day off spreads it: VOs first, the editors wait on them. */
const SPREAD_RANK: Record<WorkType, number> = { vo: 0, moviesvo: 0, revision: 1, gaming: 2, longform: 2, reading: 3, bits: 3, task: 4 };

/**
 * Spread a day off's work over the working days before it: each day takes
 * its even share, the lightest days (by the load they already hold) take any
 * extras — a tie going to the later day, so work isn't pulled earlier than it
 * needs to be — and the most pressing pieces take the earliest slots. Four VOs and four empty
 * days before the day off: one VO a day.
 */
export function spreadDayOff(items: WorkItem[], days: string[], load: Map<string, number> = new Map()): Map<number, string> {
  const out = new Map<number, string>();
  const pieces = items.filter((i) => i.id !== null);
  if (!days.length || !pieces.length) return out;
  // Every day takes its even share (4 over 4 days is one a day); what's left
  // over goes one each to the lightest days, by the load they already hold.
  const base = Math.floor(pieces.length / days.length);
  const avg = pieces.reduce((n, i) => n + i.est, 0) / pieces.length;
  const slots: string[] = days.flatMap((d) => Array.from({ length: base }, () => d));
  const extra = [...days]
    .reverse()
    .map((d, k) => ({ d, k, load: (load.get(d) ?? 0) + base * avg }))
    .sort((a, b) => a.load - b.load || a.k - b.k)
    .slice(0, pieces.length - slots.length)
    .map((x) => x.d);
  slots.push(...extra);
  slots.sort();
  const ordered = [...pieces].sort(
    (a, b) =>
      SPREAD_RANK[a.type] - SPREAD_RANK[b.type] ||
      (a.airDate ?? "9999").localeCompare(b.airDate ?? "9999") ||
      (a.due?.getTime() ?? 0) - (b.due?.getTime() ?? 0) ||
      a.id! - b.id!,
  );
  ordered.forEach((i, k) => out.set(i.id!, slots[k]!));
  return out;
}

/**
 * The daily batches each recurring channel will open on each of these days
 * that aren't open yet — so a week ahead shows its real load. A paused
 * channel opens none, and neither does a day off.
 */
export function projectBatches(days: string[], open: StoredRecord[], opts: { paused: Set<string>; daysOff: Set<string> }): WorkItem[] {
  const have = new Set(open.filter((r) => r.batchNo).map((r) => `${r.channel}|${r.airDate}`));
  const out: WorkItem[] = [];
  for (const day of days) {
    if (opts.daysOff.has(day)) continue;
    for (const ch of CHANNELS.filter((c) => c.recurring)) {
      if (opts.paused.has(ch.name) || have.has(`${ch.name}|${day}`)) continue;
      const type = batchType(ch);
      out.push({
        id: null, type, title: ch.name, channel: ch.name, category: ch.category, code: null, due: null, day, airDate: day,
        est: channelEstimate(ch.name), spent: 0, wordCount: null, projected: true,
      });
    }
  }
  return out;
}

export interface DayLoad {
  day: string;
  est: number;
  /** Minutes left: estimates less what's been tracked on each piece. */
  left: number;
  byType: Record<WorkType, { n: number; est: number }>;
}

/** Each day's estimated load, by type of work. Overdue work counts toward today. */
export function dayLoads(items: WorkItem[], days: string[], today: string): DayLoad[] {
  return days.map((day) => {
    const byType = Object.fromEntries(WORK_TYPES.map((t) => [t.id, { n: 0, est: 0 }])) as DayLoad["byType"];
    let est = 0;
    let left = 0;
    for (const i of items) {
      const d = i.day && i.day < today ? today : i.day;
      if (d !== day) continue;
      byType[i.type].n += 1;
      byType[i.type].est += i.est;
      est += i.est;
      left += remaining(i);
    }
    return { day, est, left, byType };
  });
}

/**
 * How pressing a piece is, higher first: overdue before due, due soon before
 * due later, and a VO a little ahead of its peers — the team is waiting on it.
 */
export function urgency(i: WorkItem, now: Date): number {
  const hours = i.due ? (i.due.getTime() - now.getTime()) / 3_600_000 : i.day ? daysBetween(dateIn(ORG_TZ, now), i.day) * 24 + 12 : 24 * 30;
  const base = hours < 0 ? 1000 + Math.min(-hours, 240) : 1000 - Math.min(hours, 999);
  const pri = i.task ? { urgent: 8, high: 2, normal: -4, low: -10 }[i.task.priority] : 0;
  return base + (isVo(i.type) ? 6 : i.type === "revision" ? 3 : 0) + pri;
}

/** Why a piece is where it is, in a few words. */
export function whyNow(i: WorkItem, now: Date): string {
  if (i.due) {
    const h = (i.due.getTime() - now.getTime()) / 3_600_000;
    const span = (x: number) => (Math.abs(x) < 1 ? "<1h" : Math.abs(x) < 24 ? `${Math.round(Math.abs(x))}h` : `${Math.round(Math.abs(x) / 24)}d`);
    if (h < 0) return `${span(h)} late`;
    return `due in ${span(h)}`;
  }
  if (i.day) {
    const d = daysBetween(dateIn(ORG_TZ, now), i.day);
    return d <= 0 ? "today" : d === 1 ? "tomorrow" : `in ${d} days`;
  }
  return "no deadline";
}

/** Required now: overdue, or due by the end of today (a batch on its day, an urgent task). */
export function isRequired(i: WorkItem, today: string): boolean {
  return i.day !== null && i.day <= today;
}

export interface FocusPick {
  items: WorkItem[];
  minutes: number;
  /** One line on why. */
  reason: string;
  /** From the Do Ahead queue: everything required is done. */
  ahead: boolean;
}

/**
 * What to do next. With no time given: the single most pressing piece. With
 * a time (15, 30, 60, 120 minutes): the most pressing pieces that fit it, in
 * order; when nothing required fits, the top one anyway (start it). When
 * everything required is done, the same from the Do Ahead queue.
 */
export function whatNext(items: WorkItem[], now: Date, budget: number | null): FocusPick | null {
  const today = dateIn(ORG_TZ, now);
  const open = items.filter((i) => i.id !== null && remaining(i) > 0);
  const required = open.filter((i) => isRequired(i, today)).sort((a, b) => urgency(b, now) - urgency(a, now));
  const pool = required.length ? required : doAhead(open, now, 50);
  if (!pool.length) return null;
  const ahead = !required.length;
  if (!budget) {
    const top = pool[0]!;
    return { items: [top], minutes: remaining(top), reason: `${ahead ? "Ahead: " : ""}${TYPE_BY_ID.get(top.type)!.label} · ${whyNow(top, now)}`, ahead };
  }
  const picked: WorkItem[] = [];
  let used = 0;
  for (const i of pool) {
    const need = remaining(i);
    if (used + need <= budget) {
      picked.push(i);
      used += need;
    }
    if (used >= budget) break;
  }
  if (!picked.length) {
    const top = pool[0]!;
    return { items: [top], minutes: Math.min(budget, remaining(top)), reason: `Nothing fits ${budget} min — start the most pressing: ${remaining(top)} min left on it`, ahead };
  }
  return {
    items: picked,
    minutes: used,
    reason: `${picked.length} piece${picked.length === 1 ? "" : "s"} that fit${picked.length === 1 ? "s" : ""} ${budget} min, most pressing first`,
    ahead,
  };
}

/**
 * The Do Ahead queue: work not due yet, best to knock out early first. A VO
 * leads — once it's recorded the editors can start — then revisions, then the
 * rest; within each, the soonest first.
 */
export function doAhead(items: WorkItem[], now: Date, limit = 12): WorkItem[] {
  const today = dateIn(ORG_TZ, now);
  // A high task is quick and someone's waiting, so it goes right after the VOs;
  // a task with no date and no hurry stays on the Tasks page.
  const rank = (i: WorkItem) => (i.task ? (i.task.priority === "high" ? 0.5 : 5) : { vo: 0, moviesvo: 0, revision: 1, gaming: 2, longform: 3, reading: 4, bits: 4, task: 5 }[i.type]);
  return items
    .filter((i) => i.id !== null && remaining(i) > 0 && !isRequired(i, today) && (i.day !== null || i.task?.priority === "high"))
    .sort((a, b) => rank(a) - rank(b) || (a.day ?? "9").localeCompare(b.day ?? "9") || (a.due?.getTime() ?? 0) - (b.due?.getTime() ?? 0))
    .slice(0, limit);
}

/** The VO queue: every open VO, Stories and Movies, most pressing first. */
export function voQueue(items: WorkItem[], now: Date): WorkItem[] {
  return items
    .filter((i) => isVo(i.type) && i.id !== null)
    .sort((a, b) => urgency(b, now) - urgency(a, now) || (a.airDate ?? "9").localeCompare(b.airDate ?? "9"));
}

/** Minutes to read a script aloud, from its word count. */
export const readMinutes = (words: number | null) => (words ? Math.max(1, Math.round(words / VO_WPM)) : null);

// ── forgotten work ─────────────────────────────────────────────────────────

export interface Forgotten {
  kind: "overdue-vo" | "overdue-revision" | "not-started" | "vo-close" | "unsorted";
  record: StoredRecord;
  why: string;
}

/**
 * What's slipping through the cracks:
 *
 *   overdue VO          a Stories VO past its time
 *   overdue revision    a revision past its review time
 *   not started         airs within 7 days with no script anywhere and no cut on Frame.io yet
 *   VO close to air     airs within 3 days and its VO is still open
 *   unsorted            filed 2+ days ago and still not in a category
 *
 * ("Nothing assigned" days come from the upload gaps, alongside.)
 */
export function forgottenWork(
  open: StoredRecord[],
  now: Date,
  has: { script: (r: StoredRecord) => boolean; revision: (r: StoredRecord) => boolean },
): Forgotten[] {
  const today = dateIn(ORG_TZ, now);
  const out: Forgotten[] = [];
  for (const r of open) {
    if (r.pausedAt || r.batchNo) continue;
    const due = dueOf(r);
    const late = due && due.getTime() < now.getTime();
    const hoursLate = due ? Math.round((now.getTime() - due.getTime()) / 3_600_000) : 0;
    const lateText = hoursLate < 24 ? `${hoursLate}h late` : `${Math.round(hoursLate / 24)}d late`;
    if (r.kind === "review") {
      if (late) out.push({ kind: "overdue-revision", record: r, why: `review ${lateText}` });
      continue;
    }
    if (r.category === "unknown") {
      if (now.getTime() - r.createdAt.getTime() > 2 * 86_400_000) {
        out.push({ kind: "unsorted", record: r, why: `filed ${Math.round((now.getTime() - r.createdAt.getTime()) / 86_400_000)} days ago, no category` });
      }
      continue;
    }
    if (r.category === "stories" && r.voDue && late) {
      out.push({ kind: "overdue-vo", record: r, why: `VO ${lateText}` });
      continue;
    }
    if (r.airDate && r.airDate >= today) {
      const days = daysBetween(today, r.airDate);
      if (days <= 7 && !has.script(r) && !has.revision(r)) {
        out.push({ kind: "not-started", record: r, why: `airs ${days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`} · no script, no cut yet` });
      } else if (days <= 3 && r.category === "stories" && r.voDue) {
        out.push({ kind: "vo-close", record: r, why: `airs ${days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`} · VO still open` });
      }
    }
  }
  return out;
}

/** The days a page covers, from today. */
export function nextDays(n: number, now = new Date()): string[] {
  const today = dateIn(ORG_TZ, now);
  return Array.from({ length: n }, (_, i) => addDays(today, i));
}

export { shortsDay };

// ── time logged, over a week, a month, a quarter or a year ────────────────

/** One stretch of tracked time, as the timer recorded it. */
export interface LoggedEntry {
  start: Date;
  end: Date;
  type: WorkType;
  title: string;
}
/** A stretch within one day: minutes from that day's midnight (local). */
export interface LoggedPiece {
  from: number;
  to: number;
  type: WorkType;
  title: string;
}
export interface LoggedDay {
  day: string;
  pieces: LoggedPiece[];
  minutes: number;
  byType: Partial<Record<WorkType, number>>;
}

export type LogRange = "week" | "month" | "quarter" | "year";
export const LOG_RANGES: Array<{ id: LogRange; label: string }> = [
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "quarter", label: "3 months" },
  { id: "year", label: "Year" },
];

/**
 * The days a range covers, oldest first. The week is this one, Monday to
 * Sunday; the rest end today and start on a Monday, so they sit in whole
 * weeks: the last 5 weeks, 13 weeks, or 53 weeks.
 */
export function logDays(range: LogRange, today: string): string[] {
  const dow = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7; // Monday 0
  const monday = shiftDate(today, -dow);
  const weeks = range === "week" ? 1 : range === "month" ? 5 : range === "quarter" ? 13 : 53;
  const first = shiftDate(monday, -7 * (weeks - 1));
  const last = range === "week" ? shiftDate(monday, 6) : today;
  const out: string[] = [];
  for (let d = first; d <= last; d = shiftDate(d, 1)) out.push(d);
  return out;
}

/**
 * Each day's tracked time, cut at midnight (a timer running past it counts
 * toward both days), from `days`' first to last.
 */
export function logByDay(entries: LoggedEntry[], days: string[], zone = ORG_TZ): LoggedDay[] {
  const out = new Map(days.map((d) => [d, { day: d, pieces: [] as LoggedPiece[], minutes: 0, byType: {} as Partial<Record<WorkType, number>> }]));
  for (const e of entries) {
    let at = e.start;
    while (at < e.end) {
      const day = dateIn(zone, at);
      const midnight = instantIn(day, "00:00", zone)!;
      const next = instantIn(shiftDate(day, 1), "00:00", zone)!;
      const until = e.end < next ? e.end : next;
      const d = out.get(day);
      if (d) {
        const from = (at.getTime() - midnight.getTime()) / 60_000;
        const to = (until.getTime() - midnight.getTime()) / 60_000;
        d.pieces.push({ from, to, type: e.type, title: e.title });
        d.minutes += to - from;
        d.byType[e.type] = (d.byType[e.type] ?? 0) + (to - from);
      }
      at = until;
    }
  }
  for (const d of out.values()) d.pieces.sort((a, b) => a.from - b.from);
  return [...out.values()];
}
