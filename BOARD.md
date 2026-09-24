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

The bot is a worker and the board is a web service. They share one database,
so they belong in one Railway project as two services.

1. **+ New → Database → Add PostgreSQL.** Railway sets `DATABASE_URL`.
2. The existing bot service: **Variables → New Variable → Add Reference →**
   `DATABASE_URL`. Redeploy. It starts filing what it parses.
3. **+ New → GitHub Repo →** the same repo, again. This is the board.
   - **Settings → Start Command:** `npm run start:web`
   - **Settings → Networking → Generate Domain**
   - **Variables:** reference `DATABASE_URL`, then add `DASHBOARD_PASSWORD`
     and `PUBLIC_URL` (the domain Railway just gave you, with `https://`).

`PUBLIC_URL` is what makes every Discord reply carry a link straight to its
record, so it is worth setting.

Unlike the bot, the board *is* a web service: it listens on `PORT`, which
Railway sets, and `/healthz` answers if you want a healthcheck.

## The password

`DASHBOARD_PASSWORD` is required and the board refuses to start without one.
It shows the whole studio's work — deadlines, briefs, every Frame.io link —
on a public URL, so an open one is a link away from anybody.

It is a single shared password, not accounts. That is the right size for now;
say the word when other people need their own logins.
