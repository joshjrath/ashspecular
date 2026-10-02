# Working on this repository

Specular's Discord intake bot and its web board. Read [ARCHITECTURE.md](ARCHITECTURE.md)
before changing anything structural; it says where everything lives and why.
Features are described for the studio in [BOARD.md](BOARD.md).

## Before you write code

- Read the code you're about to change, and search for an existing
  implementation before adding one (`grep -rn` the concept, not just the name).
  There is usually a helper already: `esc`/`safeUrl` (web/html.ts),
  `localPath`/`refererPath`/`safeDate` (web/http.ts), `inTransaction`
  (db/pool.ts), `modelFor`/`askClaude` (ai/claude.ts), `shell()` (web/shell.ts),
  `layout`/`pageHeader`/`rows` (web/page.ts), the date helpers in parse/derive.ts.
- Keep changes scoped to the task. Preserve existing behaviour and appearance
  unless the task is to change them.
- Don't add a library when the project already does the job (Fastify, pg, zod,
  node-cron, the Anthropic SDK). No client-side framework: pages are
  server-rendered template strings.

## Where things go

| Adding… | Put it in |
|---|---|
| A page | `src/web/pages/<area>.ts` (render) + `src/web/routes/<area>.ts` (`registerX(app)`, registered in `server.ts`) |
| A form action / endpoint | the area's `routes/` module; POST only for changes; redirect with `localPath()`/`refererPath()` |
| A database query | `src/db/<area>.ts`, parameterised; several writes that belong together in `inTransaction()` |
| A schema change | a new `src/db/migrations/NNN_name.sql` (next number), additive, safe on existing rows |
| A business rule | the area's logic module (`src/web/work.ts`, `src/finance/`, `src/ideas/`, `parse/derive.ts`…), not the route or the page |
| A setting with a range | one bounds table beside its getter (like `COMP_BOUNDS`), used by every form that sets it |
| An environment variable | read it in `config.ts` (or at call time if Settings can change it), and add it to `.env.example` |
| A Claude call | `askClaude()` with `modelFor("<feature>")` (add the feature to `FEATURE_MODELS`) |
| A background job | `src/jobs/`, started from `start.ts` (bot half) or `startWeb()` (board half); log failures |
| A test | `scripts/test-rules.ts` (`section(...)`, `t(label, got, want)`) |
| A shared UI piece | `src/web/page.ts`; styles in `src/web/styles.ts` under a comment naming the feature |

## Rules that keep it safe

- Everything outside the code — messages, titles, URLs, headers, query
  strings — goes into HTML through `esc()`. Links from outside go through
  `safeUrl()`/`safeHref()`. Values inside inline `<script>` go through
  `jsonForScript()`.
- Every route is behind the session cookie (the global hook in `server.ts`).
  Don't add to the public list without a reason written beside it. The test
  `Every route is behind the sign-in` must keep passing.
- Read API keys and models when they're used (`process.env.X` at call time,
  `modelFor()`), never once at import: Settings changes them while running.
- Never put a value from the request into SQL text; use `$1` parameters. A table
  or column name chosen in code must come from a fixed list.
- A new table that stores a channel's name goes in `NAME_COLUMNS` in
  `src/db/channelsettings.ts` (a test reads the migrations and checks).
- Don't swallow errors in background work or writes: log them with the area in
  brackets (`console.error("[area] what failed:", err)`). Page-render fallbacks
  that show an empty section are fine.
- Validate input at the route: `safeDate`, allow-lists, the bounds tables,
  `.slice()` on free text.

## Product conventions

- Every user-visible change gets an entry at the top of `RELEASES` in
  `src/web/changelog.ts` (What's new) and a note in BOARD.md.
- Dates shown to people are M/D/YYYY (`usDate`); times in the studio's zone
  (`ORG_TZ`, New York) with ET. The UI is dark and must work on a phone
  (16px gutters, no sideways scroll).
- Plain, short, second-person copy. Say what happened and what to do next.

## Before you commit

```bash
npm run typecheck     # strict, with noUnusedLocals/noUnusedParameters
npm run test:rules    # must stay at 0 failed
npm run build
```

For anything that changes a page, run the board (`npm run web` with a local
Postgres) and look at it, on a phone width too. Remove code your change made
dead; don't leave old versions beside new ones. Update ARCHITECTURE.md when
you change where things live.

Git: fetch and merge (never rebase) before pushing; commit in logical steps
with messages that say what changed and why.
