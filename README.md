# Specular

You forward things into a Discord channel. A bot reads each message, works out
what it is, and files it. One website — the board — shows all of it: the
calendar, everyone's deadlines, uploads and how they did, Story Lab, the Idea
Feed, Competitors, finance and Ash's own day.

## Start here

| | |
|---|---|
| **[BOT.md](BOT.md)** | Set up the Discord bot and run it. Start here. |
| **[BOARD.md](BOARD.md)** | Run the website, locally and on Railway. |
| **[PARSER.md](PARSER.md)** | How the parser works, and how to improve it. |
| **[ARCHITECTURE.md](ARCHITECTURE.md)** | How the code fits together, where to put things, the rules to keep. |
| **[CLAUDE.md](CLAUDE.md)** | The working rules for anyone (or any agent) changing the code. |

```bash
npm install
npm run doctor      # checks Node, keys, Discord and Anthropic before you start
npm run bot         # the Discord bot
npm run web         # the board, at http://localhost:8080
npm start           # both at once, the way it runs deployed
```

## The five categories

From the studio's master channel list, in its order.

| Category | Channels |
|---|---|
| **Gaming** | Specular Minecraft, Specular Roblox — each held to its own usual pace, its numbered series read from the titles |
| **Stories** | Specular Studios, Anime, Comics, Animation, Law, Manga, FNAF, Force, Verse, Horror, YOU, Battles, Survives, Documentaries |
| **Reading** | Specular DC, Torch, Action, Balls, Nove — ~25 uploads a day between them |
| **Bits** | Specular Studios, Anime, FNAF, Animation, Gaming, Undertale Bits and Specular & Kay Bits — one numbered batch each, opened automatically every morning |
| **Movies** | Specular (the main channel), Specular Sleep |

An assignment post's `@ Tag` line names its channel: `@ Comics` files under
Specular Comics. The main channel, called just "Specular", is only ever matched
when a message names it on its own — the word is in nearly every message.

All of it lives in [`src/catalog.ts`](src/catalog.ts). Adding a channel is one
line; the parser's prompt builds its own channel list from that file.

## The record

Every message becomes one record with the same spine:

> **Title · Channel · Needs VO · Deadline**

plus the code (`VIDEO-008`), air date, stage, word count, assignee, review
version and links, where the message carries them.

Assignment posts and forwarded Frame.io links are read by **pattern**, not by
the model — free, instant, and no API key needed. The model is only for prose:
intent and fuzzy times. See [PARSER.md](PARSER.md#three-passes-cheapest-first).

**The model extracts; the code derives.** Anything computable is never asked of
the model — most importantly the voiceover deadline, which is the air date
minus six days unless the message states a time. Derived values are tagged
`voSource: "calculated"` so the interface can show them as a fallback rather
than a fact. Full reasoning in [PARSER.md](PARSER.md).

## Commands

```bash
npm run doctor        # preflight: Node, .env, both API keys, one real parse
npm run bot           # run the Discord bot
npm run test:rules    # ~860 deterministic checks — no API key or database needed
npm run typecheck     # strict TypeScript
npm run build         # what Railway runs
npm run eval          # score the parser against evals/cases/
npm run parse -- "…"  # parse one message from the command line
npm run batches       # open today's bits batches by hand
npm run digest        # print today's digest without sending it
```

## Layout

```
src/
  start.ts        both halves, as deployed
  catalog.ts      the five categories and every channel
  parse/          message → record (rules, patterns, the Claude prompt, dates)
  bot/            the Discord bot
  db/             every query, and migrations/
  jobs/           batches, digest, nudges, the hourly YouTube read, AI jobs
  web/            the board: server.ts, routes/ (handlers), pages/ (HTML), page.ts (shared frame)
scripts/          doctor, eval, parse, test-rules
evals/cases/      the parser's test set
```

The full map, and the rules that keep it healthy, are in [ARCHITECTURE.md](ARCHITECTURE.md).

## What comes next

Everything in the original plan is built. What's left is what real use turns
up — the parser's misreads, and whatever the board turns out not to show.
