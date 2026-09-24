# The board

One page showing everything the bot has filed. Server-rendered HTML, no build
step and no client framework — it is a list of short records, and a list of
short records does not need a bundler.

![The board](docs/board.png)

## What's on it

**VO to record**, soonest first — the spine of the day. A deadline the parser
worked out rather than read is marked *air date − 6 days* in orange, so a
derived time never reads as a stated one.

**Reviews** — everything carrying a Frame.io link. This is the thing that used
to mean scrolling back through DMs.

**Everything else** — open records that aren't in either list above.

**Calendar** — a month of everything, on the day it goes out.

![The calendar](docs/calendar.png)

Two modes, switched top right: **Posting** plots the air date, **Deadlines**
plots the day the work is due. Colour is category; a cell shows three and
hides the rest behind "+N more". Click a chip for that record, a date for
that whole day, and the arrows to move a month or a day at a time.

**Channels** — every channel with its open count. Click one and you get
everything filed under it, cleared items included.

Each row is `Title · Channel · Needs VO · Deadline`, colour-coded by category
down the left edge. Click a row for the full record: every field, the story
brief, the links, a **Clear this** button, and a link back to the original
Discord message.

A row the parser wasn't sure about is flagged **needs a look**.

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
