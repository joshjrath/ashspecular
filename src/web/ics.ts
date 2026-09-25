/**
 * The board's calendar as a feed Google Calendar (or Apple, or Outlook) can
 * subscribe to: add the link once, and the calendar app keeps pulling it, so
 * a new video, a moved air date or a changed deadline turns up there too.
 * The app decides how often it refreshes — Google takes a few hours.
 *
 * Two kinds of event, each switchable in the link:
 *   airs  an all-day event on the air date  (?airs=0 to leave out)
 *   due   the deadline at its time, 30 min  (?due=0 to leave out)
 * ?only=stories,gaming limits the categories; ?batches=1 adds the daily
 * recurring batches, which are left out by default so a dozen a day don't
 * bury the videos.
 *
 * The calendar app can't sign in, so the link carries its own key, derived
 * from the board's secret: change the password and the old link stops working.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { CATEGORIES, CHANNELS } from "../catalog.js";
import { config } from "../config.js";
import type { StoredRecord } from "../db/records.js";

export function feedKey(): string {
  const set = process.env.CALENDAR_FEED_KEY?.trim();
  if (set) return set;
  return createHmac("sha256", config.sessionSecret).update("calendar-feed-v1").digest("base64url").slice(0, 32);
}

export function checkFeedKey(given: string | undefined): boolean {
  if (!given || !config.sessionSecret) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(feedKey());
  return a.length === b.length && timingSafeEqual(a, b);
}

/** RFC 5545 text: escape \ ; , and newlines. */
function text(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Lines are folded at 75 octets, continuation lines start with a space. */
function fold(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let start = 0;
  while (start < bytes.length) {
    let end = Math.min(start + (parts.length ? 74 : 75), bytes.length);
    // Never split a multi-byte character.
    while (end < bytes.length && (bytes[end]! & 0xc0) === 0x80) end -= 1;
    parts.push(bytes.subarray(start, end).toString("utf8"));
    start = end;
  }
  return parts.join("\r\n ");
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const day = (iso: string) => iso.replace(/-/g, "");
const nextDay = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10).replace(/-/g, "");
};

export interface FeedOptions {
  airs: boolean;
  due: boolean;
  batches: boolean;
  only: string[];
}

export function parseFeedOptions(q: Record<string, string | undefined>): FeedOptions {
  const known = new Set<string>(CATEGORIES.map((c) => c.id));
  return {
    airs: q.airs !== "0",
    due: q.due !== "0",
    batches: q.batches === "1",
    only: (q.only ?? "").split(",").filter((c) => known.has(c)),
  };
}

function label(r: StoredRecord): string {
  const title = r.batchNo && r.channel ? r.channel : r.title ?? r.raw.split("\n").find((l) => l.trim())?.trim() ?? "(untitled)";
  return `${r.code ? `${r.code} ` : ""}${title}`.slice(0, 140);
}

function description(r: StoredRecord, baseUrl: string): string {
  const cat = CATEGORIES.find((c) => c.id === r.category)?.label ?? "Unsorted";
  const lines = [
    [r.channel, cat].filter(Boolean).join(" · "),
    r.status === "done" ? "Cleared on the board." : "",
    ...r.links.filter((l) => l.kind === "frameio").map((l) => `Frame.io: ${l.url}`),
    baseUrl ? `${baseUrl}/r/${r.id}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

export function buildIcs(
  airing: StoredRecord[],
  due: StoredRecord[],
  opts: FeedOptions,
  baseUrl: string,
  now = new Date(),
): string {
  const keep = (r: StoredRecord) =>
    r.status !== "removed" && (opts.batches || !r.batchNo) && (!opts.only.length || opts.only.includes(r.category));
  const out: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Specular//Board//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Specular",
    "X-WR-CALDESC:Air dates and deadlines from the Specular board",
    "X-WR-TIMEZONE:America/New_York",
    // A hint to calendar apps to check back hourly; Google sets its own pace.
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];
  const event = (uid: string, lines: string[], r: StoredRecord) => {
    out.push(
      "BEGIN:VEVENT",
      `UID:${uid}@specular-board`,
      `DTSTAMP:${stamp(now)}`,
      ...lines,
      `DESCRIPTION:${text(description(r, baseUrl))}`,
      `CATEGORIES:${text(CATEGORIES.find((c) => c.id === r.category)?.label ?? "Unsorted")}`,
      "STATUS:CONFIRMED",
      "TRANSP:TRANSPARENT",
      ...(baseUrl ? [`URL:${baseUrl}/r/${r.id}`] : []),
      "END:VEVENT",
    );
  };

  if (opts.airs) {
    for (const r of airing.filter(keep)) {
      if (!r.airDate) continue;
      const done = r.status === "done" ? "✓ " : "";
      event(`air-${r.id}`, [
        `DTSTART;VALUE=DATE:${day(r.airDate)}`,
        `DTEND;VALUE=DATE:${nextDay(r.airDate)}`,
        `SUMMARY:${text(`${done}🎬 Airs: ${label(r)}`)}`,
      ], r);
    }
  }
  if (opts.due) {
    for (const r of due.filter(keep)) {
      const at = r.voDue ?? r.deadline ?? r.scriptDue;
      if (!at) continue;
      const what = r.voDue ? "VO" : r.deadline ? "Due" : "Script";
      const done = r.status === "done" ? "✓ " : "";
      event(`due-${r.id}`, [
        `DTSTART:${stamp(new Date(at.getTime() - 30 * 60_000))}`,
        `DTEND:${stamp(at)}`,
        `SUMMARY:${text(`${done}⏰ ${what}: ${label(r)}`)}`,
        ...(r.status === "open"
          ? ["BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${text(`${what} due: ${label(r)}`)}`, "TRIGGER:-PT2H", "END:VALARM"]
          : []),
      ], r);
    }
  }
  out.push("END:VCALENDAR");
  return out.map(fold).join("\r\n") + "\r\n";
}

/** Channel names for the subscribe panel's category checkboxes. */
export const FEED_CATEGORIES = CATEGORIES.map((c) => ({ id: c.id, label: c.label, channels: CHANNELS.filter((ch) => ch.category === c.id).length }));
