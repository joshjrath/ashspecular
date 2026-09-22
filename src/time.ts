import { env } from "./env.js";

const TZ = env.timezone;

/** "2026-09-22" in the configured zone. */
export function localDate(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** "-04:00" — the UTC offset in effect in the configured zone at `d`. */
export function localOffset(d: Date = new Date()): string {
  const name = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    timeZoneName: "longOffset",
  })
    .formatToParts(d)
    .find((p) => p.type === "timeZoneName")?.value;
  const m = name?.match(/GMT([+-]\d{2}:\d{2})/);
  return m?.[1] ?? "+00:00";
}

/** Full ISO timestamp with offset, e.g. "2026-09-22T14:05:00-04:00". */
export function localIso(d: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}${localOffset(d)}`;
}

/** "Mon 22 Sep" — for digest headers. */
export function prettyDate(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(d);
}

/** "3:00 PM" in the configured zone. */
export function prettyTime(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

/** True when `d` falls on today's local date. */
export function isToday(d: Date): boolean {
  return localDate(d) === localDate();
}

/** Start and end of today, as UTC instants. */
export function todayBounds(): { start: Date; end: Date } {
  const day = localDate();
  const off = localOffset();
  return {
    start: new Date(`${day}T00:00:00${off}`),
    end: new Date(`${day}T23:59:59.999${off}`),
  };
}

/** Parse a model-supplied timestamp, rejecting anything unusable. */
export function parseTimestamp(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  // Guard against hallucinated years far outside a plausible production window.
  const year = d.getUTCFullYear();
  const now = new Date().getUTCFullYear();
  if (year < now - 1 || year > now + 5) return null;
  return d;
}

/**
 * Parses the shorthand people actually type for a deadline: "3pm", "15:00",
 * "tomorrow 9am", "fri 17:30". Resolved in the configured zone. Null if it
 * cannot be read confidently — callers should not guess.
 */
export function parseLocalWhen(input: string, now: Date = new Date()): Date | null {
  const text = input.trim().toLowerCase();
  if (!text) return null;

  let dayOffset = 0;
  let rest = text;

  const dayWord = rest.match(/^(today|tonight|tomorrow|tmr|tmrw)\b\s*/);
  if (dayWord) {
    dayOffset = /^(tomorrow|tmr|tmrw)$/.test(dayWord[1]!) ? 1 : 0;
    rest = rest.slice(dayWord[0].length);
  }

  const time =
    rest.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/) ?? rest.match(/^(\d{1,2})\s*(am|pm)$/);
  if (!time) return null;

  let hour = Number(time[1]);
  const hasMinutes = time[0].includes(":");
  const minute = hasMinutes ? Number(time[2]) : 0;
  const meridiem = hasMinutes ? time[3] : time[2];

  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;

  const base = new Date(now.getTime() + dayOffset * 86_400_000);
  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  const candidate = new Date(`${localDate(base)}T${hh}:${mm}:00${localOffset(base)}`);
  if (Number.isNaN(candidate.getTime())) return null;

  // A bare time that already passed today means the same time tomorrow.
  if (!dayWord && candidate.getTime() < now.getTime()) {
    const next = new Date(now.getTime() + 86_400_000);
    return new Date(`${localDate(next)}T${hh}:${mm}:00${localOffset(next)}`);
  }
  return candidate;
}
