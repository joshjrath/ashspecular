# The board

One page showing everything the bot has filed. Server-rendered HTML, no build
step and no client framework — it is a list of short records, and a list of
short records does not need a bundler.

![The board](docs/board.png)

## What's on it

The board is dark throughout: charcoal cards on a near-black shell, with the
salmon and yellow blocks carrying black text. Every piece of text on every
page, desktop and phone, is checked to read at 4.5:1 (3:1 for large type)
against what is actually behind it; channel names are lightened just enough
where their own colour is too dark, and finished work is muted and struck
through rather than faded.

The board uses the whole width of the window. The button beside each page's
title — or the `[` key — puts the sidebar away, and it stays away until you
bring it back.

**Pins** — point at any row and a pin appears beside its title. Pinned, the
row turns cream, carries a black *Pinned* tag, and sits at the top of its own
category — on the dashboard and on the category page, whatever the sort. Pin
as many as you like; the newest pin comes first. Press the tag to unpin.

**The bell** — top right of the dashboard. Five kinds, each with its own icon
and colour:

| | Kind | When it shows |
|---|---|---|
| ▶ blue | **Revisions** | a Frame.io revision came in |
| ⚠ red | **Overdue** | open work went past its time |
| ◷ amber | **Due soon** | open work is due within 24 hours |
| ▭ green | **Airing** | a video airs today or tomorrow |
| + purple | **New** | an assignment was filed in the last 3 days |

A filter row picks one kind at a time (remembered in your browser), with a
count on each. The red badge counts what arrived since you last opened it.
Recurring batches are left out; they fall due every evening. **Desktop alerts**
in the panel asks your browser for permission, then an open dashboard checks
every minute and pops a system notification for anything new.

**Open work** sits in columns, one per category, side by side. The
**Columns** menu top right is a checklist of the five categories with their
counts — tick three and you get three columns, tick five and you get five; it
takes effect at once and the dashboard remembers it. Gaming, Stories and Bits
until you choose. Each column shows its ten most pressing, pinned first, with
"See all" for the rest; in a narrow column each task stacks itself so nothing
is cut off. Anything with no category yet always shows, full width, below.

Recurring batches opened ahead for a later day stay on Recurring and the
calendar; they join the dashboard, the lists and every count on the morning
they're for.

**Tasks** are two tight lines each: the title, then its code, channel, air
countdown and links, with one deadline pill on the right — "VO 9/24/2026 ·
11:59 PM", red with how late it is once past, amber inside a day. Hover the
pill for the IST time. Stage and word count are on the record's own page.

**Work due by day** — a headline count, then a column per day.

![The chart](docs/chart.png)

Every day keeps its slot whether or not anything is due, so an empty week reads
as empty rather than as missing. Overdue work collects in its own pink column
at the left, behind a dashed rule; today's column is yellow, matching the tile
above it. Each bar carries its own count, so there is no y-axis to read a
number off. Where a day holds more than one category the bar is one pill with
2px gaps between them.

Each pill fills like a glass: the work is liquid poured in from the bottom,
always the pill's own rounded shape, rising into place when the page loads. A
pill that isn't full keeps a slow two-layer wave on its surface; the busiest
day is full to the brim and still. Press any pill or date to open that day's
incomplete work; press LATE for everything past its time.

**VO to record**, soonest first — the spine of the day. A deadline the parser
worked out rather than read is marked *air date − 6 days* in orange, so a
derived time never reads as a stated one.

**Revisions** — everything carrying a Frame.io link, including f.io short
links. This is the thing that used
to mean scrolling back through DMs.

**Everything else** — open records that aren't in either list above.

**Calendar** — a month of everything, on the day it goes out.

![The calendar](docs/calendar.png)

Two modes, switched top right: **Posting** plots the air date, **Deadlines**
plots the day the work is due.

- **Drag** anything to another day to move it. In Posting that moves the air
  date; in Deadlines it moves the deadline and keeps its time of day. A VO
  deadline that was worked out from the air date follows it; one someone
  stated stays put.
- **Category toggles** above the grid hide or show a category. They double as
  the legend, and the calendar remembers how you left them.
- **Complete / Incomplete** toggles sit beside the categories. Both are on
  whenever you open the calendar; switching one off follows you from month to
  week to day until you leave.
- **Month · Week · Day** switch views, each on the same stretch of time. The
  week runs Sunday to Saturday, a column a day with every item as a card you
  can drag, pin, ✓ or ×.
- A cell shows five items; the rest are a click away.
- Click a chip for that record, a date for the **day view**.

**The day view** — the clicked day in the middle, with three weeks either side
as columns you scroll through sideways (swipe on a phone, ← → keys or the
arrow buttons on a computer). The title and the address follow whichever day
is in the middle, so a reload, a ✓ or a shared link comes back to the same
day. Cards drag between days exactly as chips do on the month, and each has
its pin, ✓ and ×. The same category toggles and Posting / Deadlines switch sit
above it.

Every record's page also has an **air date box** — for a phone, where dragging
is awkward, or for a date weeks out.

Dates read M/D/YYYY everywhere, and every air date carries a live countdown:
"airs 9/28/2026 · in 3 days", turning amber inside three days.

**Colour.** Each of the five categories keeps its colour, shown as a rounded
square — on the chart, the tiles, the toggles and beside every title. Each of
the thirty channels has its own colour on top of that, shown as a circle and
on the channel's name. Square is category, circle is channel.

The Stories channels wear their YouTube avatar colours — sampled from the
avatars, the background ring clear of the character — so Studios is #D21B20,
FNAF #D2BD1B, Comics #1BC0D2. The other channels' colours were generated to sit
apart from each other. Change any of them with `color` on the channel in
`src/catalog.ts`.

Every dot shows the exact colour, with a hairline ring so a pale one stays
visible on white and a dark one on the rail. A channel's *name* is written in
its exact colour whenever that can be read, and otherwise in a darker shade of
the same colour, only as dark as it needs to be — FNAF's yellow can't be read
as text on white, so its name is a deep gold and its dot is the yellow. The
tests check every name reads at 4.5:1.

**Sort** above every list — air date, video number, deadline, channel, title,
newest. Pressing the active one reverses it. Blanks (no air date, no code)
stay at the bottom either way, video numbers count rather than spell (VIDEO-9
before VIDEO-10), and the choice is remembered across pages.

**Channels** — every channel with its open count. Click one and you get
everything filed under it, cleared items included.

Each row is `Title · Channel · Needs VO · Deadline`, colour-coded by category
down the left edge. Click a row for the full record: every field, the story
brief, the links, a **Clear this** button, and a link back to the original
Discord message.

A row the parser wasn't sure about is flagged **needs a look**.

## Uploads — every category, its own way

The switch at the top of **Uploads** picks a category, and the whole page
changes to suit it:

| Category | Counts | Target | View |
|---|---|---|---|
| **Stories** | long form only | one every 4 days per channel | timeline lanes, gaps red when over 4 days |
| **Gaming, Movies** | long form only | none yet — tracked | the same lanes, no late gaps |
| **Bits, Reading** | **Shorts only** | each channel's daily number (the Recurring page's `units`) | a heatmap: a row per channel, a square per day, shaded by how much of that day's number went up |

**Bits and Reading days run 3 AM to 3 AM Eastern.** A Short posted at
1:30 AM counts toward the day before, and until 3 AM the Uploads heatmap and
the Recurring page are still on the day being finished. Gaming, Stories and
Movies turn over at midnight. (`SHORTS_DAY_STARTS_HOUR` in
`src/parse/derive.ts`.)

Long form is read from each channel's long-form-only list, Shorts from its
Shorts-only list, so the two never mix. Change a target in
`src/web/targets.ts`. Channel links are per category, under *Channel links*
on each tab.

**Ideas.** Every tab has an Ideas panel built from that category's own
numbers. Each video counts as how it did against its channel's usual, and
titles are taken apart into a *format* (What If, Could … Survive, Ranked,
Versus, How, Why, Explained…), *subjects* (the names in it — Gojo, Deadpool,
FNAF) and the *day* it went up. The panel shows which formats, subjects,
days and title lengths run above or below the usual, and by how much;
suggests ideas — strong formats paired with strong subjects not done in 60
days, follow-ups to past breakouts, subjects worth bringing back; and has an
**idea checker**: type a title and get an estimate ("2.3× — likely above
usual") with the reasons ("What If +55%", "Gojo +57%"). Small samples are
pulled toward "no effect", so one lucky video doesn't make a rule. No AI or
key needed — it's the board's own statistics.

**Click any row for the detail.** Each format, subject, day and length
opens to its numbers per channel and the best and weakest videos behind it.
Each suggestion opens to:

- **draft titles** — real titles that did well, rewritten for the idea
  ("What If Deadpool Was In FNAF?" did 1.6×, so a Gojo idea offers "What If
  Gojo Was In FNAF?"). A name only replaces one that played the same part:
  a star for a star, a *"Joined The Avengers"* for another *"Joined The …"*,
  so drafts don't come out as nonsense. Click a draft to run it through the
  checker.
- the hit it follows up, the **best channel** and **best day** for it, and
  when it was last done
- the evidence: each stat it rests on, with its videos
- caveats — a lead resting on few videos, or ones that flopped

A **channel** picker above the panel narrows everything — stats,
suggestions and the checker — to one channel.

**Shorts outliers (Bits and Reading).** Shorts go up by the dozen and live
or die in hours, so they're judged more closely than long form:

- at **1 h, 3 h, 6 h, 24 h, 3 days and 7 days** — the latest of these a
  Short has reached, against the channel's others at that same age
- against the channel's last **sixty** Shorts (at least eight)
- until those ages have been tracked from upload for enough Shorts (about
  two days after deploying), Shorts **three days and older** are compared
  on their views now with the Shorts just before them, so the panel fills
  straight away; the same goes for each channel's *typical views*
- on a log scale with a robust spread, so a few viral hits don't widen
  "normal" for everyone. Each Short gets its multiple, its percentile and a
  score of how far it sits from normal:

| Score | |
|---|---|
| 3 or more | 🚀 viral |
| 2 or more | 🔥 breakout |
| between | normal |
| −1 or less | soft |
| −2 or less | 📉 flop |

The Shorts panel shows the counts for the last week, a **spread chart**
(every Short of the last 30 days as a dot on a 0.1×–10× scale, each channel's
normal band shaded; hover a dot for the title and numbers), the **top and
bottom** Shorts, each channel's **health** (this week's median against last
week's, share beating its usual, tiers) and **posting slots** — how Shorts
do by the three-hour Eastern window they went up in, best first.

## Scripts & structure — every Stories transcript, read against how it did

Below Ideas on the Stories tab. **Nothing to set up and no key:** each
video's transcript is read from YouTube's own captions (the ones it
uploaded, or YouTube's automatic English), a few dozen an hour, newest
first, so the whole back catalogue fills in over a few days. The coverage
bar shows how far it's got. (The YouTube API key can't do this: Google only
lets the channel owner, signed in, download captions through the API.)

If YouTube turns this server away (it sometimes blocks cloud servers), the
panel says so and it tries again the next hour. Any video's transcript can
also be added by hand on its page: in YouTube Studio → Subtitles → ⋮ →
Download, then drop the .srt/.vtt/.sbv on the video's page, or paste plain
text.

Every transcript is measured on the parts of a script a writer controls:

| Measure | |
|---|---|
| Premise said by | seconds until the title's names are both said: how fast it delivers the title's promise |
| Hook asks a question | "what if", "have you ever", "imagine" in the first 20 seconds |
| Turns a minute | "but", "suddenly", "until", "turns out", "little did"…: the story changing direction |
| Open loops per 10 min | "stick around", "you'll see", "but first"…: promises that keep people watching |
| Biggest twist lands at | where in the runtime the turns bunch up most |
| Subscribe ask at | where "subscribe" is first said |
| "You" a minute, pace, length, names in the story | |

Each measure is split into thirds across the videos, and the panel shows
which third runs above the channel's usual, strongest first. Open a row for
the numbers and the best videos. Alongside:

- **Built like your hits**: the typical top third, as a checklist
- **Where the turns fall**: the top third's turns through the runtime against
  the bottom third's
- **Names that come with hits**: characters said three or more times in a
  script, and how those videos did. *Untapped* means few or no titles name
  them yet: a story built around them is untried
- **Openings that work**: phrases in the first 45 seconds that come with hits
- **Check a script**: paste a draft and its title. It's timed at your usual
  pace, measured the same way, and you get a verdict ("built like your
  hits"), each measure against the hits with what to change, and its turns
  plotted against the hits'
- **Search the transcripts**: every place a phrase is said, with a timestamp
  that opens the video there. Handy for "have we done this before?"
- **Every video and its transcript**: each opens the video's own page, with
  its measures against the hits, its opening, its turns chart and the full
  transcript with the turns highlighted

Follow-up ideas in the Ideas panel also show *how the original opened*.

| Variable | Default | |
|---|---|---|
| `TRANSCRIPT_CATEGORIES` | `stories` | which categories get transcripts, comma-separated (e.g. `stories,gaming,movies`) |
| `TRANSCRIPTS_PER_HOUR` | `40` | how many are read each hour |

## Uploads — is Stories keeping to every four days?

**Uploads** in the rail tracks the fourteen Stories channels against their
target: one long-form upload every four days each. The rail's number is how
many are behind.

- **Tiles** — how many channels are on pace, how many are behind, uploads in
  the last 30 days against the target, and the share of gaps on time over 90.
- **The timeline** — one lane per channel over 30, 90 or 180 days. Every
  upload is a dot in the channel's colour (click it for the video). The gap
  between two uploads is grey when it kept the pace and red, with its length,
  when it ran over four days. The dashed line from the last upload to today is
  the current wait — red once it's past four days — and the yellow diamond is
  when the next one is due. Hover anything for the details.
- **By channel** — the same as a table, worst first: status (on pace, due
  today, behind by N days), last upload, next due, on-time streak, uploads in
  30 days, average gap and on-time share over 90.
- **Latest uploads**, newest first.

Counted in whole days in New York time. Shorts and live streams don't count:
the board reads each channel's long-form-only upload list.

**Setting it up.** Open *Channel links* at the bottom of the page and paste
each Stories channel's YouTube link (its page, `youtube.com/@name`, is
enough). The board finds the channel, reads it at once, and then every hour.
YouTube's free feed shows only a channel's latest fifteen uploads — about two
months at this pace — but every video the board sees is kept, so history only
grows. For each channel's full history from day one, set `YOUTUBE_API_KEY` to
a free YouTube Data API key; the next read pulls everything, with view counts.

### Views, breakouts and underperformers

Every hourly read keeps a snapshot of each video's views, so the board knows
what a video had *at a given age*. Each upload is then compared with its own
channel's normal at the same age — the median of that channel's previous
twenty videos:

- under a day old: its views so far, against the others at this many hours
- one to seven days: its views at 24 hours
- a week and older: its views at 7 days

**2× the usual or more is a breakout 🔥; half or less is underperforming 📉.**
Until the snapshots have built up (they start when this is deployed), videos
two weeks and older are compared on lifetime views, so there's something to
see from the first day. A median needs at least three earlier videos.

On the Uploads page: a **Breakouts & underperformers** panel for the last 30
days (each with its multiple and what it was compared against), gold halos
on breakout dots and dashed ones on underperformers in the timeline, badges
in *Latest uploads*, and each channel's **typical views** in the table.

**Discord alert (optional, off by default).** When a video from the last
week breaks out, the board can post once: *"🔥 Breakout on Specular FNAF — What If Gojo Was In FNAF? —
627,000 views after 30 hours, 4.0× the channel's usual at 24 hours."* It
posts to the first of these that's set:

| Variable | |
|---|---|
| `BREAKOUT_WEBHOOK_URL` | a Discord webhook — Channel settings → Integrations → Webhooks → New Webhook → Copy URL. Works whether or not the bot is running. |
| `BREAKOUT_CHANNEL_ID` | a channel the bot can post in |

With neither set, nothing is sent — breakouts only show on the Uploads page.

With a `YOUTUBE_API_KEY`, views are refreshed hourly for every upload of the
last 60 days rather than only the feed's latest fifteen.

## Google Calendar

**Calendar → Google Calendar** (top right of the calendar) gives you a private
link to this board's calendar. Paste it into Google Calendar → *Other
calendars* → *From URL*, and Google keeps it in step on its own: every air
date as an all-day event, every deadline at its time with a two-hour
reminder, cleared work kept with a ✓. Switches in the panel leave out air
dates or deadlines, or add the daily batches (off by default). Google checks
subscribed calendars every few hours, so a change here reaches it within
that. Apple Calendar can subscribe with the same link.

The link carries its own key, because a calendar app can't sign in. Anyone
with the link can read the calendar; changing the board's password (or
`SESSION_SECRET`) retires it. `CALENDAR_FEED_KEY` sets the key by hand.

## Scripts — Josh's board, inside this one

Josh's board is **scriptcheck** (`joshjrath/Scriptwritingchecker`), on the same
Railway project. It publishes everything it knows at `/report.json`, and with
its *view-only* password it hands out a read-only copy — the briefs left out.
This board reads that on the server, so the **Scripts** tab is a page of this
board: every script grouped by where it stands (overdue, due today, due soon,
no deadline, pending, delivered late, delivered), with its code, air date,
deadline, the script doc that was delivered and the Discord thread. Cached a minute.

Two variables on tJosh's board's Railway service:

| Variable | Value |
|---|---|
| `SCRIPTS_URL` | Josh's board's public address, e.g. `https://scriptcheck-production.up.railway.app` |
| `SCRIPTS_TOKEN` | Josh's board's view-only password — the value of `SCRIPTCHECK_VIEW_TOKEN` on Josh's service. If there's none yet, add one (any long random string) and redeploys. |

Without `SCRIPTS_TOKEN`, the tab falls back to showing Josh's page itself in a
frame, when Josh's site allows that, or a button to open it in its own tab.

## Frame.io links, read without the API

When a message carries a Frame.io link, the bot opens it the way a link
preview does — no API, no key — follows an f.io short link to where it goes,
and reads the asset's name from the page (its preview tags, or the file names
in it). From a name like `VIDEO-012_Walter_White_v3.mp4` it fills in whatever
the message left out: code VIDEO-012, version 3, title "Walter White", and the
channel when the name has one. The link is labelled with the file name, and
the note says what was read. A private link (login wall), an expired one or a
password-protected one is noted as such. What the message itself says always
wins over the file name.

Try a link yourself, from anywhere with internet:

```bash
npm run frameio -- https://f.io/7bu6f54B
```

`FRAMEIO_LOOKUP=off` turns the lookup off.

## Recurring — the daily batches

![Recurring](docs/recurring.png)

Every bits channel and every reading channel opens its batch by itself each
morning at 06:00 ET — twelve a day, shown as two groups. You send nothing. A
batch has no number: it is its channel and its day — "Specular FNAF Bits ·
9/25/2026" in a list, just "Specular FNAF Bits" in a calendar cell or day
column, where the date is already there.

One batch per channel, twelve a day. To change that, edit `perDay` on the
channel in [`src/catalog.ts`](src/catalog.ts) — one number, and the next
morning follows it. Removing a channel's `recurring` block stops it opening at
all.

The tick beside a channel clears its whole day in one press.

**Every channel counts uploads.** A reading channel's day is five uploads; a
bits channel's depends on the channel — Studios, Anime, FNAF and Animation
Bits five, Gaming and Undertale Bits three, Specular & Kay Bits one. Each row
is one segment per upload. Tap the third to mark three done; tap the last
filled one again to step back one. When every segment is filled the channel is
cleared and counts once toward "cleared this week"; stepping back reopens it.
Each group header totals its uploads — "7/25", "12/27". Change a number with
`units` on the channel in `src/catalog.ts`.

**Working ahead** — the Ahead panel on that page goes as far forward as you
like. Step a day at a time with the arrows, jump with the date box, or pick
from the next two weeks, each shown with how much of it is open and done.
Open the next 7, 14 or 30 days in one press, or every day through a date (up
to 90 days out). A day that is only partly open — a channel added since it
was opened — offers to open just the channels it's missing. Each morning's
run finds opened days already there and leaves them exactly as you left
them, cleared ones included — the opener keys every batch by channel, date
and index, so it can never double-open. Ticking a day ahead keeps you on it.

Run it by hand any time:

```bash
npm run batches              # today
npm run batches -- tomorrow
npm run batches -- 2026-10-01
```

## On a phone

Not a shrunken desktop. The rail becomes a scrolling strip of pills across the
top, every row drops to one column so a title gets the full width instead of
wrapping four words deep beside its deadline, and a calendar cell shows its
work as coloured dots — at 390px a two-word truncation says less than a colour
does. The chart keeps its size and scrolls sideways rather than shrinking into
a smear.

<img src="docs/phone-dashboard.png" width="300"> <img src="docs/phone-calendar.png" width="300">

## The morning digest

At 08:00 ET the bot posts one message: the four long-form videos whose
voiceover is closest, anything late, anything due today, and how the bits
stand. It picks by voiceover deadline, because that is what the day is built
around. Bits get one summary line rather than seven rows.

```
DIGEST_CHANNEL_ID=…     # the channel to post into. Empty = no digest
DIGEST_CRON=0 8 * * *   # when, in ORG_TZ
DIGEST_COUNT=4          # how many priorities it names
```

Posting is recorded per day, so a restart can't send it twice. Preview it
without sending:

```bash
npm run digest
```

## The overdue nudge

Once something passes its deadline the bot says so in the same channel — once
per item, never again. Hourly by default (`NUDGE_CRON`), and bits are left out
because their batches run past 6pm most days by design.

## Running it locally

You need Postgres. The quickest way on a Mac:

```bash
brew install postgresql@16
brew services start postgresql@16
createdb specular
```

Then in `.env`:

```
DATABASE_URL=postgres://localhost:5432/specular
DASHBOARD_PASSWORD=pick-something
```

```bash
npm run web
```

Open <http://localhost:8080>. The schema is created on first start — there is
no separate migrate step.

The bot and the board are two processes. Run both:

```bash
npm run bot     # one terminal tab
npm run web     # another
```

Without `DATABASE_URL` the bot still parses and replies, it just stores
nothing, and the board says so rather than showing an empty page.

## Running it on Railway

One service runs both halves. `npm start` boots the bot, then the board, in
the same process — so there is one deploy, one set of variables, and no way
for the two to drift apart.

In the service you already have:

1. **+ New → Database → Add PostgreSQL.** Railway creates `DATABASE_URL`.
2. **Variables → New Variable → Add Reference →** `DATABASE_URL`.
3. **Variables → New Variable →** `DASHBOARD_PASSWORD`, anything you'll
   remember.
4. **Settings → Networking → Generate Domain.** Port `8080`.
5. **Variables → New Variable →** `PUBLIC_URL`, the domain from step 4 with
   `https://` in front. This is what makes each Discord reply link straight to
   its record.

Redeploy. The log should say:

```
[bot] logged in as ashtracker#1234
[web] listening on :8080
[web] storage: connected
```

Open the domain, enter the password, and the board is there.

To split them later — a worker for the bot, a web service for the board —
set `SERVICE=bot` on one and `SERVICE=web` on the other. Nothing else
changes.

## The password

`DASHBOARD_PASSWORD` is required and the board refuses to start without one.
It shows the whole studio's work — deadlines, briefs, every Frame.io link —
on a public URL, so an open one is a link away from anybody.

It is a single shared password, not accounts. That is the right size for now;
say the word when other people need their own logins.
