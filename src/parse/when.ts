/**
 * Reading a date and time the way people actually write one.
 *
 *   6 am friday 25th 2026     Oct 5 at 2pm ET     10/5 11:59pm
 *   friday 6pm                tomorrow noon       25th September
 *
 * Every answer is an instant with the offset the zone was really on at that
 * moment, so a September deadline is -04:00 and a January one -05:00.
 *
 * It refuses what it cannot be sure of. "by 3" could be 3am or 3pm, so it
 * returns null rather than picking one — a wrong deadline is worse than a
 * missing one, because a missing one gets noticed.
 */
import { DEADLINE_TIME, ORG_TZ, dateIn, offsetFor } from "./derive.js";

/** Zone abbreviations the studio actually writes, to real zones. */
export const ZONES: Record<string, string> = {
  ET: "America/New_York",
  EST: "America/New_York",
  EDT: "America/New_York",
  CT: "America/Chicago",
  CST: "America/Chicago",
  CDT: "America/Chicago",
  PT: "America/Los_Angeles",
  PST: "America/Los_Angeles",
  PDT: "America/Los_Angeles",
  IST: "Asia/Kolkata",
  UTC: "UTC",
  GMT: "UTC",
};

export const MONTHS = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
];

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

const MONTH_RE = "(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?";
const WEEKDAY_RE =
  "(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tues?|wed|thu(?:rs?)?|fri|sat)";

/**
 * Attach the offset a zone was actually on at that wall-clock moment, rather
 * than assuming one. Resolved twice: the first pass can land on the wrong
 * side of a DST change.
 */
export function withOffset(iso: string, zone: string): string {
  const resolved = ZONES[zone.toUpperCase()] ?? ORG_TZ;
  const probe = new Date(`${iso}Z`);
  if (Number.isNaN(probe.getTime())) return "";
  let offset = offsetFor(resolved, probe);
  offset = offsetFor(resolved, new Date(`${iso}${offset}`));
  return `${iso}${offset}`;
}

export function toIso(year: number, month: number, day: number, hour: number, minute: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00`;
}

export function to24(hour: number, meridiem: string | undefined): number {
  if (!meridiem) return hour;
  if (/p/i.test(meridiem) && hour < 12) return hour + 12;
  if (/a/i.test(meridiem) && hour === 12) return 0;
  return hour;
}

// ── calendar arithmetic, all on UTC noon so DST can never shift a day ────────

interface Ymd { y: number; m: number; d: number }

function ymd(dateISO: string): Ymd {
  const [y, m, d] = dateISO.split("-").map(Number);
  return { y: y!, m: m!, d: d! };
}

function iso(v: Ymd): string {
  return `${v.y}-${String(v.m).padStart(2, "0")}-${String(v.d).padStart(2, "0")}`;
}

function noon(v: Ymd): Date {
  return new Date(Date.UTC(v.y, v.m - 1, v.d, 12));
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0, 12)).getUTCDate();
}

function addDays(v: Ymd, n: number): Ymd {
  const d = noon(v);
  d.setUTCDate(d.getUTCDate() + n);
  return ymd(d.toISOString().slice(0, 10));
}

function weekdayOf(v: Ymd): number {
  return noon(v).getUTCDay();
}

function daysBetween(a: Ymd, b: Ymd): number {
  return Math.round((noon(b).getTime() - noon(a).getTime()) / 86_400_000);
}

/**
 * A month-and-day with no year: this year's, unless that is well in the past,
 * in which case next year's. Writing "Jan 5" in December means next January.
 */
function nearestYear(m: number, d: number, today: Ymd): number {
  const thisYear = { y: today.y, m, d };
  return daysBetween(today, thisYear) < -60 ? today.y + 1 : today.y;
}

/**
 * A day of the month with no month — "friday 25th". Takes the soonest month
 * where that day exists (and falls on the weekday, when one is written),
 * allowing a week into the past for something just missed.
 */
function inferMonth(day: number, today: Ymd, weekday: number | null, year: number | null): Ymd | null {
  const candidates: Ymd[] = [];
  for (let k = -1; k <= 13; k += 1) {
    const total = today.y * 12 + (today.m - 1) + k;
    const y = Math.floor(total / 12);
    const m = (total % 12) + 1;
    if (year !== null && y !== year) continue;
    if (day > daysInMonth(y, m)) continue;
    const c = { y, m, d: day };
    if (weekday !== null && weekdayOf(c) !== weekday) continue;
    if (daysBetween(today, c) < -7) continue;
    candidates.push(c);
  }
  candidates.sort((a, b) => noon(a).getTime() - noon(b).getTime());
  return candidates[0] ?? null;
}

function weekdayIndex(word: string): number {
  return WEEKDAYS.indexOf(word.slice(0, 3).toLowerCase());
}

// ── the reader ──────────────────────────────────────────────────────────────

/**
 * Returns an ISO instant with offset, or null when the text holds no date or
 * holds one that cannot be read without guessing.
 *
 * `now` anchors everything relative — "friday", "tomorrow", a missing year.
 * Pass the video's air date when reading a line from an assignment post, so a
 * deadline is read in the cycle it belongs to rather than the day it's parsed.
 */
export function parseWhen(text: string, now: Date = new Date()): string | null {
  const t = ` ${text.toLowerCase().replace(/\s+/g, " ")} `;
  const today = ymd(dateIn(ORG_TZ, now));
  const zone = text.match(/\b(ET|EST|EDT|CT|CST|CDT|PT|PST|PDT|IST|UTC|GMT)\b/i)?.[1] ?? "ET";

  // An hour with nothing to say whether it is morning or afternoon.
  if (
    /\b(?:at|by|@|before)\s*(\d{1,2})\b(?!\s*(?:[:/.\-]\d|st\b|nd\b|rd\b|th\b|[ap]\.?\s*m\b|o'?clock))/.test(t) &&
    !/\b\d{1,2}\s*(?::\d{2})?\s*[ap]\.?\s*m\b/.test(t) &&
    !/\b(noon|midnight)\b/.test(t)
  ) {
    return null;
  }

  // ── the time ──
  let hour: number | null = null;
  let minute = 0;

  if (/\bnoon\b/.test(t)) {
    hour = 12;
  } else if (/\bmidnight\b/.test(t)) {
    // "By midnight friday" means the end of friday, not its first minute.
    hour = 23;
    minute = 59;
  } else {
    const mer = t.match(/\b(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m\b/);
    if (mer) {
      const h = Number(mer[1]);
      if (h < 1 || h > 12) return null;
      hour = to24(h, mer[3]);
      minute = Number(mer[2] ?? 0);
    } else {
      const clock = t.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
      if (clock) {
        hour = Number(clock[1]);
        minute = Number(clock[2]);
      }
    }
  }

  // ── the date ──
  const yearMatch = t.match(/\b(20\d{2})\b/);
  const explicitYear = yearMatch ? Number(yearMatch[1]) : null;
  const weekdayMatch = t.match(new RegExp(`\\b${WEEKDAY_RE}\\b`));
  const weekday = weekdayMatch ? weekdayIndex(weekdayMatch[1]!) : null;

  let date: Ymd | null = null;

  const monthDay = t.match(new RegExp(`\\b${MONTH_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`));
  const dayMonth = t.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_RE}`));
  const numeric = t.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  const ordinal = t.match(/\b(\d{1,2})(?:st|nd|rd|th)\b/);
  const weekdayDay = t.match(new RegExp(`\\b${WEEKDAY_RE}\\s+(\\d{1,2})\\b(?!\\s*(?::|[ap]\\.?\\s*m\\b))`));

  if (monthDay || dayMonth) {
    const m = MONTHS.indexOf((monthDay ? monthDay[1]! : dayMonth![2]!).slice(0, 3)) + 1;
    const d = Number(monthDay ? monthDay[2] : dayMonth![1]);
    const y = explicitYear ?? nearestYear(m, d, today);
    date = { y, m, d };
  } else if (numeric) {
    const m = Number(numeric[1]);
    const d = Number(numeric[2]);
    const yy = numeric[3];
    const y = yy ? (yy.length === 2 ? 2000 + Number(yy) : Number(yy)) : explicitYear ?? nearestYear(m, d, today);
    date = { y, m, d };
  } else if (ordinal || weekdayDay) {
    const d = Number(ordinal ? ordinal[1] : weekdayDay![2]);
    date = inferMonth(d, today, weekday, explicitYear);
    if (!date) return null;
  } else if (/\btomorrow\b/.test(t)) {
    date = addDays(today, 1);
  } else if (/\b(today|tonight|eod)\b/.test(t)) {
    date = today;
  } else if (weekday !== null) {
    // The next one, counting today.
    date = addDays(today, (weekday - weekdayOf(today) + 7) % 7);
  } else if (hour !== null) {
    // A time with no day is today's.
    date = today;
  } else {
    return null;
  }

  if (date.m < 1 || date.m > 12 || date.d < 1 || date.d > daysInMonth(date.y, date.m)) return null;

  // A day with no time lands on the studio's usual deadline time.
  if (hour === null) {
    const [h, mm] = DEADLINE_TIME.split(":").map(Number);
    hour = h ?? 23;
    minute = mm ?? 59;
  }

  return withOffset(toIso(date.y, date.m, date.d, hour, minute), zone) || null;
}

// ── labelled lines ──────────────────────────────────────────────────────────

const DEADLINE_LABEL =
  /^(.*?)\b(deadline|due(?:\s+date|\s+by)?|feedback\s+by|notes\s+by|needed\s+by)\s*[:\-–—]\s*(.+)$/i;
const VO_LABEL =
  /^(.*?)\b(vo(?:\s+due|\s+by)?|voice\s*-?\s*over(?:\s+due|\s+by)?)\s*[:\-–—]\s*(.+)$/i;

export interface LabelledTimes {
  /** The message's own lines with the labelled ones taken out. */
  rest: string[];
  deadline: string | null;
  voDue: string | null;
  /** A labelled deadline whose value could not be read. */
  unreadDeadline: string | null;
  /** A labelled VO time that could not be read — callers should not guess. */
  unreadVo: string | null;
}

/**
 * Pulls "Deadline: …" and "VO: …" lines out of a message, so the value becomes
 * a real time and the label stops being part of the title. Works whether the
 * label starts its own line or trails the title on the same one.
 */
export function readLabelledTimes(lines: string[], now: Date = new Date()): LabelledTimes {
  const out: LabelledTimes = { rest: [], deadline: null, voDue: null, unreadDeadline: null, unreadVo: null };

  for (const line of lines) {
    const vo = line.match(VO_LABEL);
    if (vo) {
      const at = parseWhen(vo[3]!, now);
      if (at) out.voDue = at;
      else out.unreadVo = vo[3]!.trim();
      pushPrefix(out.rest, vo[1]!);
      continue;
    }

    const dl = line.match(DEADLINE_LABEL);
    if (dl) {
      const at = parseWhen(dl[3]!, now);
      if (at) out.deadline = at;
      else out.unreadDeadline = dl[3]!.trim();
      pushPrefix(out.rest, dl[1]!);
      continue;
    }

    out.rest.push(line);
  }
  return out;
}

/** Whatever came before a label on the same line, minus its separator. */
function pushPrefix(rest: string[], prefix: string): void {
  const kept = prefix.replace(/[\s,;|·—–-]+$/, "").trim();
  if (kept) rest.push(kept);
}
