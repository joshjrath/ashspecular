/**
 * Ash's own work, as time: what each piece takes, what each day holds, what to
 * do next, what to do ahead, and what's slipping through the cracks.
 *
 * The estimates are per piece of work:
 *
 *   Stories VO            40 min
 *   Bits / Reading batch  10 min
 *   Gaming video          45 min
 *   Revision review       15 min
 *   Specular long-form    45 min   (the daily long-form batch, like a Gaming video)
 *
 * A day's load is the estimate of everything due that day, plus the daily
 * batches every recurring channel will open that day that aren't open yet.
 * Time tracked with a timer is the actual; what's left of a piece is its
 * estimate less what's been tracked on it.
 */
import { CATEGORIES, CHANNELS, isLongFormRecurring } from "../catalog.js";
import { ORG_TZ, dateIn, shortsDay } from "../parse/derive.js";
import type { StoredRecord } from "../db/records.js";
import { addDays, daysBetween } from "./cadence.js";

export type WorkType = "vo" | "gaming" | "batch" | "longform" | "revision";

export const ESTIMATE_MIN: Record<WorkType, number> = { vo: 40, gaming: 45, batch: 10, longform: 45, revision: 15 };

const catColour = (id: string) => CATEGORIES.find((c) => c.id === id)?.color ?? "#8A8F98";

/** Each kind of work in its category's own colour; revisions in theirs. */
export const WORK_TYPES: Array<{ id: WorkType; label: string; short: string; colour: string }> = [
  { id: "vo", label: "Stories VO", short: "VO", colour: catColour("stories") },
  { id: "gaming", label: "Gaming video", short: "Gaming", colour: catColour("gaming") },
  { id: "batch", label: "Bits / Reading batch", short: "Batch", colour: catColour("bits") },
  { id: "longform", label: "Specular long-form", short: "Long-form", colour: catColour("movies") },
  { id: "revision", label: "Revision review", short: "Revision", colour: "#7D8AF5" },
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
}

/** What kind of Ash's work a record is — or null when it isn't hers. */
export function typeOf(r: StoredRecord): WorkType | null {
  if (r.kind === "review") return "revision";
  if (r.batchNo) {
    const ch = CHANNELS.find((c) => c.name === r.channel);
    return isLongFormRecurring(ch) ? "longform" : "batch";
  }
  if (r.category === "stories") return "vo";
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
    est: ESTIMATE_MIN[type],
    spent,
    wordCount: r.wordCount,
    projected: false,
    record: r,
  };
}

export const remaining = (i: WorkItem) => Math.max(0, Math.round(i.est - i.spent));

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
      const type: WorkType = isLongFormRecurring(ch) ? "longform" : "batch";
      out.push({
        id: null, type, title: ch.name, channel: ch.name, category: ch.category, code: null, due: null, day, airDate: day,
        est: ESTIMATE_MIN[type], spent: 0, wordCount: null, projected: true,
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
  return base + (i.type === "vo" ? 6 : i.type === "revision" ? 3 : 0);
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

/** Required now: overdue, or due by the end of today (a batch on its day). */
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
  const unlock: Record<WorkType, number> = { vo: 0, revision: 1, gaming: 2, longform: 3, batch: 4 };
  return items
    .filter((i) => i.id !== null && remaining(i) > 0 && !isRequired(i, today) && i.day !== null)
    .sort((a, b) => unlock[a.type] - unlock[b.type] || (a.day ?? "").localeCompare(b.day ?? "") || (a.due?.getTime() ?? 0) - (b.due?.getTime() ?? 0))
    .slice(0, limit);
}

/** The VO queue: every open Stories VO, most pressing first. */
export function voQueue(items: WorkItem[], now: Date): WorkItem[] {
  return items
    .filter((i) => i.type === "vo" && i.id !== null)
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
