/**
 * What's new on the board: one entry per change that ships, newest first.
 * Each becomes a notification (its own kind in the bell, "What's new") the
 * first time a server running it starts, and every entry is kept on
 * /whats-new. Add one to the top with every change worth knowing about.
 */
import type { UpdateNotice } from "../db/records.js";

export interface Release {
  /** Never changes once shipped: it's how the board knows it's been announced. */
  id: string;
  /** The change in a few words: the notification's title. */
  title: string;
  /** For an entry written after it shipped: when it went live, so it isn't announced as just now. */
  liveSince?: string;
  /** What's different, a line each, with a link to where it is when there is one. */
  changes: Array<{ text: string; href?: string }>;
}

export const RELEASES: Release[] = [
  {
    id: "2026-09-26-revisions-calendar-scripts",
    title: "Revisions on their own, a 4-day calendar, scripts that teach Story Lab",
    changes: [
      { text: "Revisions have their own card and their own dashboard section. They're due for review 12 hours after they come in (or when their message says) and never get a VO date.", href: "/revisions" },
      { text: "The calendar's views run Day · 4 days · Week · Month, and a Channels dropdown picks exactly which channels show.", href: "/4day" },
      { text: "Any video's page takes its script, pasted in or read from its Google Doc. Stories scripts join what Story Lab learns from.", href: "/story-lab#scripts" },
      { text: "What's new: every change to the board lands here, in its own kind of notification.", href: "/whats-new" },
    ],
  },
  {
    id: "2026-09-25-pause-daysoff-dice",
    liveSince: "2026-09-26T06:25:00Z",
    title: "Pause, days off, a movable dashboard and Story Lab's dice",
    changes: [
      { text: "Every card has Pause (off every deadline until resumed) and No script (the VO is waiting on the writer)." },
      { text: "Moving a video on the calendar can move the rest of its channel by the same number of days, with Undo.", href: "/calendar" },
      { text: "Days off: anything due on one is due the working day before.", href: "/" },
      { text: "The dashboard's columns can be arranged freely, and Unsorted and Channels switched off." },
      { text: "Settings: hide anything on the sidebar, and set any channel's colour.", href: "/settings" },
      { text: "Bits and Reading channels wear their YouTube avatars' colours." },
      { text: "Uploads has a page for each channel on its own.", href: "/uploads" },
      { text: "Story Lab's dice roll a new format, hero, world, power or target to add.", href: "/story-lab#dice" },
      { text: "Bits channels run at five a day, with Pokemon Bits added; Specular is a daily long-form channel.", href: "/recurring" },
    ],
  },
];

/** The releases live in the last month, as notifications. */
export function releaseNotices(times: Map<string, Date>, now = new Date(), list: Release[] = RELEASES): UpdateNotice[] {
  return list
    .filter((r) => times.has(r.id))
    .map((release) => ({ kind: "update" as const, at: times.get(release.id)!, release }))
    .filter((n) => now.getTime() - n.at.getTime() < 30 * 86_400_000);
}
