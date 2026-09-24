# Specular

You forward things into a Discord channel. A bot reads each message, works out
what it is, and files it. Eventually one website shows all of it.

Both halves now run: the bot files what it reads, and the board shows it.
Still missing are the 8am digest and the automatic daily bits batches.

## Start here

| | |
|---|---|
| **[BOT.md](BOT.md)** | Set up the Discord bot and run it. Start here. |
| **[BOARD.md](BOARD.md)** | Run the website, locally and on Railway. |
| **[PARSER.md](PARSER.md)** | How the parser works, and how to improve it. |

```bash
npm install
npm run doctor      # checks Node, keys, Discord and Anthropic before you start
npm run bot         # the Discord bot
npm run web         # the board, at http://localhost:8080
```

## The four categories

| Category | Channels |
|---|---|
| **Long Form** | Specular Studios, Specular FNAF |
| **Reading** | Specular DC, Torch, Action, Balls, Nove — ~25 uploads a day between them |
| **Gaming** | Specular Gaming — Minecraft, Roblox, episodic series |
| **Bits** | Studios, FNAF, Animation, Anime, NK, Undertale, Gaming Bits — a numbered batch each, every day |

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
npm run test:rules    # 63 deterministic tests — no API key needed
npm run eval          # score the parser against evals/cases/
npm run parse -- "…"  # parse one message from the command line
```

## Layout

```
src/
  catalog.ts        the four categories and every channel
  parse/
    schema.ts       what the model must return
    classify.ts     the Claude call and its prompt
    derive.ts       the VO buffer, timezones, channel matching — the testable rules
    rules.ts        URL extraction
  bot/
    index.ts        boots the bot
    intake.ts       message → parse → reply → save, and the feedback button
    render.ts       the reply card
  web/
    index.ts        boots the board
    server.ts       routes
    page.ts         the board's HTML, server-rendered, no build step
    auth.ts         the password gate
  db/
    records.ts      save and query one record
    migrations/     schema
  _legacy/          first-pass bot and board, built on the old model. Excluded
                    from the build; kept for the plumbing.
scripts/            doctor, eval, parse, test-rules
evals/cases/        the parser's test set
```

## What comes next

1. Run it against real messages and fix what it misreads *(now)*
2. Correction dropdowns on the Discord card, instead of the feedback button
3. The 8am digest and the automatic daily bits batches
