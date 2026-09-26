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
    id: "2026-09-26-revision-column-batches-never-late",
    title: "Revisions in their own column; daily batches are never late",
    changes: [
      { text: "Revisions now sit in a column between Work due by day and today's panel, every card the same shape whatever its title.", href: "/" },
      { text: "Daily batches can't be late any more: a day gone by leaves the open work and every late count, and the Recurring tab keeps its record.", href: "/recurring" },
    ],
  },
  {
    id: "2026-09-26-channel-pause-revision-rows",
    title: "Pause a whole channel, script marks, and tidier revision cards",
    changes: [
      { text: "Every video card shows whether its script is somewhere — attached on its page, in Story Lab, or delivered on the Scripts tab — green with a link when it is, dashed grey when not. Uploads marks the videos that have one.", href: "/queue" },
      { text: "Nothing assigned: × on a dashboard chip or a calendar slot clears it when the channel isn't posting that day after all.", href: "/" },
      { text: "Pause production on a whole channel: its work comes off every deadline, the calendar and the bell, a recurring channel opens no new batches and shows as paused on the Recurring tab, and Uploads still shows it, marked Paused. Resume brings it all back.", href: "/paused" },
      { text: "Revision cards: every tag is the same size, and the due pill and the four buttons sit on one line.", href: "/revisions" },
    ],
  },
  {
    id: "2026-09-26-gaps-writenext-revisions",
    title: "Revisions scored out of 10, Write next per channel, and nothing-assigned warnings",
    changes: [
      { text: "Every revision can be summarized: Frame.io's notes, pasted or read from Frame.io, plus your own take, into a summary and a score out of 10 that counts how many notes, how big, and what the editor was told before.", href: "/revisions" },
      { text: "Revision history: a timeline of scores for each channel. Three in a row at 5 or below suggests a 🚩 flag; three at 8 or higher, a 🏆 trophy.", href: "/revisions?view=history" },
      { text: "Anything sent with a Frame.io link is filed as a revision.", href: "/revisions" },
      { text: "Story Lab's Write next: two ideas for every channel, each scored out of 100, with ↻ reroll, 🔖 save to the channel's idea bucket, and a warning when it's too close to a video on any channel.", href: "/story-lab#writenext" },
      { text: "Rolling the dice is instant now, and whatever you add from them is brought forward in the cards and rerolls for two weeks.", href: "/story-lab#dice" },
      { text: "Nothing assigned: a channel expected to post in the next 8 days with no video on that day shows on the dashboard, beside Calendar, in the bell and as a dashed slot on the calendar.", href: "/" },
      { text: "An Uploaded button on every card: it clears the video and turns it green on the calendar.", href: "/calendar" },
      { text: "A day off has no daily batches: marking one removes that day's untouched batches, and making it a working day again brings them back.", href: "/recurring" },
    ],
  },
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
