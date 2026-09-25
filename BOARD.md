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
