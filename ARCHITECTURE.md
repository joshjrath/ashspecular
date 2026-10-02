# Architecture

How the code fits together, for whoever changes it next — person or agent.
What each feature does for the studio is in [BOARD.md](BOARD.md) (the board),
[BOT.md](BOT.md) (the Discord bot) and [PARSER.md](PARSER.md) (reading messages).

## What it is

One Node process (TypeScript, ESM, Node 22) runs three things:

- **The bot** — a Discord client. Messages in the intake channels become
  *records* (a video, a revision, a daily batch…); messages in #tasks become
  tasks. It replies with what it read.
- **The board** — a server-rendered website (Fastify, no client framework, no
  build step for pages). Every page is one HTML document with its own CSS and
  a little inline JavaScript.
- **Background jobs** — cron and timers: opening the daily batches, the
  morning digest and overdue nudges, reading YouTube hourly, the Idea Feed,
  Competitors, and Claude's Story Lab ideas.

Postgres holds everything. `SERVICE=bot` or `SERVICE=web` splits the process
in two; the default runs both (`src/start.ts`).

## Where things live

```
src/
  start.ts            production entrypoint: checks config, prepares the DB, starts the bot, the schedule, the board
  config.ts           settings read once at start (+ checkConfig: fail fast on bad values)
  process.ts          guardProcess: a stray promise rejection is logged, not fatal
  catalog.ts          the categories and every channel — the source of truth for channels
  ai/claude.ts        the one Claude client (rebuilt when the key changes), askClaude(), modelFor(feature)
  parse/              message → record: rules, patterns, the Claude prompt, dates (derive.ts holds the date rules)
  bot/                Discord client, intake (records and tasks), the reply card
  db/                 every SQL query, one file per area; pool.ts (inTransaction), migrate.ts, prepare.ts
    migrations/       NNN_name.sql, applied in order at start, each in a transaction
  jobs/               background work: schedule (batches, digest, nudge), hourly (YouTube + posting check),
                      ideas, competitors, storyideas, youtube, avatars, breakouts, postcheck
  web/
    server.ts         buildApp(): the app, its guards and every route module; startWeb(): jobs + listen
    routes/           one module per area: registerX(app) — the HTTP handlers
    pages/            one module per page: renderX(shell, data) → HTML string
    page.ts           the frame every page shares: layout(), sidebar, bell, record rows, widgets, icons
    styles.ts         the stylesheet
    shell.ts          what every page needs before rendering: sidebar counts, the work, gaps, notices
    http.ts           request/response helpers: safe redirects, safeDate, wantsJson, originIsThisBoard
    html.ts           esc, safeUrl, safeHref, jsonForScript — the only ways outside text enters HTML
    auth.ts           the password check, session tokens, sign-in throttling
    moves.ts          moving a record with the rest of its channel's schedule, and undo
    work.ts           Ash's workload model (estimates, My Day, VO queue, forgotten work)
    finance/ bitsfeed/ competitors/   larger areas with their own routes.ts + pages.ts
    stories/          Story Lab's lore, dice, blueprints, idea scoring
  competitors/ finance/ ideas/ revisions/ tasks/ compilations/   each area's pure logic
scripts/
  test-rules.ts       the test suite (npm run test:rules) — no API key or database needed
  eval.ts             scores the parser against evals/cases/ (needs ANTHROPIC_API_KEY)
  doctor.ts           preflight checks for a new setup
```

Rule of thumb for each layer:

| Layer | Holds | Must not |
|---|---|---|
| `db/` | SQL and row ↔ object mapping | know about HTTP or HTML |
| `parse/`, `work.ts`, area folders (`finance/`, `ideas/`…) | business rules, pure where possible | import from `web/routes` or `web/pages` |
| `web/routes/` | reading the request, calling db/logic, choosing the page or redirect | build HTML by hand, hold business rules that a job also needs |
| `web/pages/`, `page.ts` | turning data into HTML | query the database |
| `jobs/` | scheduling and running background work | duplicate logic a route also runs (share a function instead) |

## How a request flows

1. `server.ts` hooks, in order: POSTs whose `Origin` names another site are
   refused (403); the cookies are put in async-local storage (`shell.ts`
   reads them); anything but `/login`, `/healthz` and `/calendar.ics` without
   a valid session cookie is redirected to `/login`.
2. The route (in `routes/<area>.ts`) validates its input (`safeDate`,
   allow-lists, range tables like `COMP_BOUNDS`), calls `db/` and logic, then
   either renders a page — `renderX(await shell("area"), data)` — or
   redirects (only ever to `localPath()`/`refererPath()`).
3. Errors thrown anywhere reach the one error handler: logged with the route,
   answered with a plain page (or JSON for `Accept: application/json` /
   `x-fetch: 1`). Unknown routes get a 404 page.

Forms are plain HTML POSTs (`application/x-www-form-urlencoded`; receipts are
`multipart/form-data`, parsed in `finance/routes.ts`). A few endpoints answer
JSON for the pages' own `fetch` calls (the bell, calendar drags, Idea Feed
card actions).

## Sign-in and permissions

- **One shared password**, no accounts. `DASHBOARD_PASSWORD`, or the one set in
  Settings (stored as a salted scrypt hash in `board_password`).
- **Session**: cookie `specular_session` = `expiry.HMAC(SESSION_SECRET, expiry|generation)`,
  30 days, `httpOnly`, `SameSite=Lax`, `Secure` over https. Changing the
  password changes the generation, which signs every other browser out.
- **Throttling**: 10 wrong passwords per address in 15 minutes, 200 across all
  addresses (X-Forwarded-For can be forged).
- **Authorization**: signed in = allowed everything; there are no roles. The
  only other door is the calendar feed, checked by its own key
  (`CALENDAR_FEED_KEY` or one derived from `SESSION_SECRET`).
- **Discord**: anyone who can see an intake channel can file records and use
  a card's buttons; the Discord server's own permissions are the gate.
- A test (`Every route is behind the sign-in`) asks every registered route as
  a stranger and fails if one answers without sending them to `/login`.

## Sources of truth

| Thing | Lives in | Notes |
|---|---|---|
| Channels and categories | `catalog.ts` + `channel_settings` (renames, additions) | Applied at start and re-read every minute (`loadChannelSettings`). **Channel names are stored as text in ~20 tables**; a rename rewrites all of them in one transaction (`NAME_COLUMNS` in `db/channelsettings.ts`). A test fails if a migration adds a channel-name column that isn't listed. |
| API keys (Claude, YouTube, Tumblr) | `app_settings` (encrypted with `SESSION_SECRET`), else the env var | `db/keys.ts` writes the effective value into `process.env`, so features read `process.env.X` *when they run* — never cache a key at import. |
| Claude model per feature | `modelFor()` in `ai/claude.ts` | `ANTHROPIC_MODEL` for all, `IDEAS_MODEL` etc. per feature. |
| Daily limits | `IDEA_BOUNDS` (`db/ideas.ts`), `COMP_BOUNDS` (`db/competitors.ts`), `LIMIT_DEFS` (`db/keys.ts`) | The ranges every form and Settings → Limits use. |
| Dates and deadlines | `parse/derive.ts` (`ORG_TZ`, VO buffer, deadline time) | Everything is stored UTC and shown in `ORG_TZ`. Dates are `YYYY-MM-DD` strings in that zone. |
| Time estimates | `work_estimates` + defaults in `web/work.ts` | |
| One running timer | `time_entries` with a unique index on the running row | Starting one stops the last in one locked transaction (`db/timers.ts`). |

## Database

- Plain SQL with `pg`; every query parameterised. Where a table or column name
  is chosen in code it comes from a fixed list, never from the request.
- `migrations/NNN_name.sql` run in order at start (`prepareDatabase()`), each in
  its own transaction, recorded in `schema_migrations`. Migrations only ever
  add: `CREATE … IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, and data fixes
  that cope with rows already there. Never edit an applied migration — add the
  next number.
- Multi-step writes that must succeed together use `inTransaction()` from
  `db/pool.ts` (renames, moves with their channel, expenses with splits,
  compilations, the month grid, undo, timers).
- No database (`DATABASE_URL` unset): the bot still parses and replies; the
  board shows a "not connected" page.

## Background work

| Job | Where | When |
|---|---|---|
| Open daily batches | `jobs/schedule.ts` → `jobs/batches.ts` | each recurring channel's `opensAt` (ORG_TZ), and at boot |
| Morning digest, overdue nudge | `jobs/schedule.ts` | `DIGEST_CRON`, `NUDGE_CRON` (needs `DIGEST_CHANNEL_ID`) |
| YouTube read → posting check → breakouts → avatars | `jobs/hourly.ts` | :07 every hour, and 20 s after boot |
| Idea Feed (Tumblr + Claude) | `jobs/ideas.ts` | every minute (paced to the daily caps) |
| Competitors | `jobs/competitors.ts` | every 10 minutes (quota-budgeted) |
| Claude's Story Lab ideas | `jobs/storyideas.ts` | every 5 minutes, ≤ `STORYLAB_AI_DAILY` calls/day |
| Keys and channel settings re-read | `db/keys.ts`, `db/channelsettings.ts` | every minute |

The schedule runs with the bot half; the rest with the board half. Jobs catch
and log their own failures; a rejection nothing catches is logged by
`guardProcess()` rather than ending the process.

## External services

| Service | Used for | Code |
|---|---|---|
| Discord (discord.js) | intake, tasks, digest, nudges, breakout and missed-post messages | `bot/`, `jobs/` |
| Anthropic (official SDK) | parsing prose, revision summaries, finance voice notes, compilation packages, Idea Feed, Competitors, Story Lab | `ai/claude.ts` (`anthropic()`, `askClaude()`) |
| YouTube | uploads and views (Data API with a key; RSS feeds and channel pages without) | `jobs/youtube.ts`, `competitors/youtube.ts`, `jobs/avatars.ts` |
| Tumblr API | the Idea Feed | `ideas/tumblr.ts` |
| Frame.io | link names (public pages), comments (API with `FRAMEIO_TOKEN`) | `parse/frameio.ts`, `revisions/comments.ts` |
| Google Docs | reading a shared script as plain text | `web/gdoc.ts` |
| The scriptwriter's board | the Scripts tab | `web/scriptcheck.ts` |

Every outbound call has a timeout. URLs from messages are only fetched when
their host is the expected one (Frame.io, docs.google.com, YouTube).

## Configuration

Every variable, with what it does, is in [.env.example](.env.example) — a test
fails if the code reads one that isn't listed there. `checkConfig()` stops the
process at start on values that would fail later (a misspelt time zone, a
number that isn't one). Required: `DATABASE_URL`, `DASHBOARD_PASSWORD` (board),
`DISCORD_TOKEN` (bot). Strongly recommended: `SESSION_SECRET`, `PUBLIC_URL`.

## Running, testing, building, deploying

```bash
npm install
cp .env.example .env        # fill in DATABASE_URL, DASHBOARD_PASSWORD (and DISCORD_TOKEN for the bot)
npm run web                 # the board on :8080 (migrates on start)
npm run bot                 # the bot
npm start                   # both, as deployed (after npm run build)

npm run typecheck           # tsc, strict, no unused locals/parameters
npm run test:rules          # the whole suite, ~860 checks, no keys or database needed
npm run build               # dist/ (tsc + migrations + the story corpus)
npm run eval                # parser accuracy against evals/cases/ (uses the API)
```

Deploys go to Railway (`railway.json`): Nixpacks builds with `npm run build`,
starts `npm start`, restarts on failure. Migrations run at start.

## Rules to keep

1. **Escape at the point of output.** Text from anywhere outside the code goes
   into HTML through `esc()`; links from outside through `safeUrl()`/`safeHref()`;
   values in inline scripts through `jsonForScript()`.
2. **Redirect only to `localPath()`/`refererPath()`**, never to a value from the
   request as it is.
3. **Every route is behind the session** unless it's added to the public list
   in `server.ts` on purpose (the test enforces it).
4. **Read keys and models when used** (`process.env.X` at call time,
   `modelFor()`), because Settings changes them while running.
5. **One source of truth per setting**: a new limit gets a range table its form,
   its route and Settings → Limits all use.
6. **A new table that stores a channel name goes in `NAME_COLUMNS`.**
7. **Writes that must happen together go in `inTransaction()`.**
8. **Migrations only add**, and cope with existing rows.
9. **Background work logs its failures** — never `.catch(() => {})` on
   something someone would want to know failed.
