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
    id: "2026-09-30-time-logged",
    title: "My Day: a timeline of the time you logged",
    changes: [
      { text: "Time logged shows this week as a timeline: each day's timer stretches where they happened, coloured by kind of work, with day totals.", href: "/my-day#logged" },
      { text: "Switch to Month for a bar a day, or 3 months and Year for a calendar of how much was logged each day. Each range has totals, the busiest day and the split by kind.", href: "/my-day?log=year#logged" },
    ],
  },
  {
    id: "2026-09-30-posting-check",
    title: "Daily posting check: missed videos push themselves a day",
    changes: [
      { text: "Every morning after 1 AM ET, each video scheduled for yesterday is checked against its channel's uploads. Ones that went up are marked uploaded and linked to the video.", href: "/calendar" },
      { text: "A video that wasn't posted moves to today, and the rest of its channel's schedule moves a day with it. You're told in the bell (Not posted) and in the digest channel on Discord.", href: "/calendar" },
      { text: "If it was posted after all, It was posted on its page puts everything back.", href: "/calendar" },
    ],
  },
  {
    id: "2026-09-28-myday-switches-spread-days-off",
    title: "My Day switches and exploded batches; days off spread their work",
    changes: [
      { text: "My Day has switches for VO, Revision, Task, Batch, Long-form and Gaming. Switch one off and it leaves the whole page, totals included.", href: "/my-day" },
      { text: "⤢ Explode batches shows every upload in today's batches as its own row. ✓ ticks one upload.", href: "/my-day" },
      { text: "No time, in Done today, clears the time tracked on something someone else did. It stays logged but doesn't count as yours.", href: "/my-day" },
      { text: "A day off now spreads its work evenly over the days before it, most pressing first. 4 VOs on a day off 5 days away become one VO a day, instead of all four on the day before.", href: "/calendar" },
    ],
  },
  {
    id: "2026-09-28-specular-compilations",
    title: "Specular compilations in Story Lab: the daily Movie and the Sleep every 4 days",
    changes: [
      { text: "Story Lab picks the next Specular Movie (4–5 videos, 60–90+ minutes, one umbrella title) and the next Specular Sleep (about 4 hours on one character or franchise). Picks come from the whole long-form catalog, and no compilation shares more than 2 videos with an earlier one.", href: "/story-lab#specular" },
      { text: "↻ Reroll for a different combination. ✓ Use puts it on the next open Specular or Specular Sleep day on the calendar.", href: "/story-lab#specular" },
      { text: "For a Movie, Claude reads the four scripts, checks the title fits, picks the order, and writes the intro and transitions in the scripts' voice. A Sleep gets its editor notes.", href: "/story-lab#specular" },
      { text: "History, permanent exclusions (the Springtrap video is already on it), hand-set runtimes, and every video's Movie and Sleep uses.", href: "/story-lab/specular" },
    ],
  },
  {
    id: "2026-09-28-tasks-notes-repeat-calendar",
    title: "Task notes and repeating tasks; Calendar opens how you left it",
    changes: [
      { text: "Tasks can have notes, shown under the task and editable with ✎.", href: "/tasks" },
      { text: "Repeating tasks (every day, weekday, week, 2 weeks or month) have their own Recurring section. Finishing one opens the next. Saying \"every Monday\" or \"monthly\" sets it.", href: "/tasks" },
      { text: "Names in new tasks get their capitals: people, channels, days, months and the services you use (\"pay divas for the anime edit\" → \"Pay Divas for the Anime edit\").", href: "/tasks" },
      { text: "Month view now shows the cards on the days from the months either side.", href: "/calendar" },
      { text: "Calendar in the sidebar reopens the view you last used: Day, 4 days, Week or Month.", href: "/calendar" },
    ],
  },
  {
    id: "2026-09-28-nothing-assigned-fix",
    title: "Nothing assigned only counts past a channel's last scheduled video",
    changes: [
      { text: "Nothing assigned now starts after the last video a channel has lined up. An empty day between scheduled videos (say, after one was pushed back) or behind a late video is no longer flagged.", href: "/calendar" },
    ],
  },
  {
    id: "2026-09-28-calendar-no-revisions",
    title: "Revisions are off the calendar",
    changes: [
      { text: "The calendar (month, week, 4 days, day) and the Google Calendar feed no longer show revisions. They're on the Revisions page and the dashboard.", href: "/calendar" },
    ],
  },
  {
    id: "2026-09-28-finance-voice",
    title: "Finance: log by voice, and pay models across several channels",
    changes: [
      { text: "Income, Expenses, Subscriptions and Contractors each have a voice box. Say what happened (\"Paid Divas 250 for the Anime edit\") and it's logged.", href: "/finance/expenses" },
      { text: "Anything it guessed shows amber, with \"check …\" on the row. Anything missing (like an amount, or a new person) is kept as a red draft with Fill in.", href: "/finance/expenses" },
      { text: "Pay models can cover several channels. Logged work goes to them, and a revenue share is of their combined revenue.", href: "/finance/contractors" },
    ],
  },
  {
    id: "2026-09-28-finance",
    title: "Finance: income, expenses, contractors, and whether each channel pays",
    changes: [
      { text: "A new Finance section with its own tabs (Overview, Income, Expenses, Subscriptions, Contractors, Channels, Reports, Settings). Each tab is a view of the same data, so nothing is entered twice.", href: "/finance" },
      { text: "Monthly entry: every channel's AdSense, and optionally its views, on one screen. Sponsorships and other income count toward the channel but never its RPM.", href: "/finance/income/entry" },
      { text: "Expenses: category and channel are separate. An expense can go to one channel, be split across several, or be network-wide, with its video, receipt and paid or unpaid status.", href: "/finance/expenses" },
      { text: "Subscriptions show their true monthly cost and post each bill automatically. Recurring, production and one-off costs are kept apart.", href: "/finance/subscriptions" },
      { text: "Contractors: each person's pay model (per video, per minute, tiered, retainer, revenue share, prepaid) with its history, and work → earned → paid → outstanding. Advances are cash, not extra cost.", href: "/finance/contractors" },
      { text: "Channel sustainability: profit, margin, RPM, per-upload figures, your hours from My Day's estimates, and profit per owner hour, over 1, 3, 6 or 12 months. Also break-even views and projection ranges.", href: "/finance/channels" },
      { text: "Alerts for Persistent Loss, Low Return on Time and more, against thresholds you set, on the main dashboard.", href: "/finance/settings#thresholds" },
    ],
  },
  {
    id: "2026-09-27-time-estimates",
    title: "Time estimates: set how long each kind of work takes you",
    changes: [
      { text: "Settings → Time estimates: Stories VO, Movies VO, Gaming video, Reading batch, Bits batch and Revision, each editable.", href: "/settings#estimates" },
      { text: "Each recurring channel's daily batch can have its own time, or it follows its kind's.", href: "/settings#estimates" },
      { text: "Task categories have editable times, and a single task can still have its own.", href: "/settings#estimates" },
      { text: "These are the one source for My Day, Focus, Do ahead, the week's load, the VO Queue and Tasks. A change recalculates everything straight away.", href: "/my-day" },
      { text: "Movies VOs now count as work, and they're in the VO Queue alongside Stories.", href: "/vo" },
    ],
  },
  {
    id: "2026-09-27-tasks",
    title: "Tasks: forward anything into #tasks and it's remembered here",
    changes: [
      { text: "Anything posted or forwarded into #tasks in Discord becomes a task. Its category, priority, person and due date are read from the message, and you can change any of them.", href: "/tasks" },
      { text: "Categories: Payment, Response, Team, Production, Channel, Business, Priority, General. Priority (URGENT / HIGH / NORMAL / LOW) is separate, so a task can be Payment + Urgent.", href: "/tasks" },
      { text: "Each task has Complete, Snooze and Open Discord, which goes to the original message for a forward. You can also add a task from the box on the page.", href: "/tasks" },
      { text: "Tasks show up on My Day with estimates (Pay ~2 min, Respond ~5 min). Urgent ones sit in Today with your VOs, and each task can be timed.", href: "/my-day" },
    ],
  },
  {
    id: "2026-09-27-my-day-vo-queue-focus",
    title: "My Day, the VO Queue, Focus Mode and a forgotten-work detector",
    changes: [
      { text: "My Day: each day's estimated workload by kind of work (VO 40m, Bits/Reading batch 10m, Gaming 45m), with timers to track actual against estimate.", href: "/my-day" },
      { text: "What should I do next? picks the most pressing piece of your work, or what fits 15 min, 30 min, 1 hr or 2 hrs.", href: "/my-day?next=1#focus" },
      { text: "Do ahead: once today's is done, the best work to knock out early, with VOs first since the team is waiting on them.", href: "/my-day#ahead" },
      { text: "VO Queue: every VO in priority order, with word counts, reading time and total time left, plus a recording mode that moves to the next when one's done.", href: "/vo" },
      { text: "Forgotten: upcoming uploads with nothing assigned, overdue VOs and revisions, and videos airing soon that haven't started.", href: "/forgotten" },
    ],
  },
  {
    id: "2026-09-26-reviewed-unassigned-pills",
    title: "Reviewed revisions kept in History, Unassigned videos, and the Recurring segments fixed",
    changes: [
      { text: "Revision History lists every revision you've ✓'d, newest first, with its score, or ★ Score it to put one on its channel's timeline. A revision reviewed without a summary no longer disappears.", href: "/revisions?view=history#reviewed" },
      { text: "Story Lab has Unassigned videos: every Stories upload with no script, and a Link a script button on each for its Google Doc or the script pasted in.", href: "/story-lab?open=unassigned#unassigned" },
      { text: "Recurring: tapping a segment marks that many done. Tapping the fifth used to save four.", href: "/recurring" },
    ],
  },
  {
    id: "2026-09-26-gaming-series-and-pace",
    title: "Gaming: its own pace, and every series read from the titles",
    changes: [
      { text: "Each Gaming channel is held to its own usual gap between uploads (the median over 90 days): late gaps turn red, the next one is due, and the rail's behind count includes it.", href: "/uploads?cat=gaming" },
      { text: "Nothing assigned covers Gaming too: an expected upload in the next 8 days with no video on it shows on the dashboard, the calendar and in the bell.", href: "/" },
      { text: "Series: every numbered series (Ep 3, Part 2, Day 5, #4) with a bar per episode against the channel's usual, whether it's growing, holding or fading, and when the next episode is due.", href: "/uploads?cat=gaming#series" },
      { text: "Each Gaming channel's page says what it could make next: the next episode of every series worth going on with, and any resting series that did well enough to bring back.", href: "/uploads/channel/minecraft" },
      { text: "The Ideas panel reads gaming titles' own shapes: series episodes, 100 Days, challenges, hardcore, speedruns, manhunts, builds and obbies.", href: "/uploads?cat=gaming" },
    ],
  },
  {
    id: "2026-09-26-revision-column-batches-never-late",
    title: "Revisions in their own column; daily batches are never late",
    changes: [
      { text: "Revisions now sit in a column between Work due by day and today's panel, every card the same shape whatever its title.", href: "/" },
      { text: "Work due by day counts revisions as their own striped layer in each pill, and today's panel has a Revisions line.", href: "/" },
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
