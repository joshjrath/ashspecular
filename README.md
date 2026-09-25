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
npm start           # both at once, the way it runs deployed
```

## The five categories

From the studio's master channel list, in its order.

| Category | Channels |
|---|---|
| **Gaming** | Specular Minecraft, Specular Roblox |
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
npm run test:rules    # 63 deterministic tests — no API key needed
npm run eval          # score the parser against evals/cases/
npm run parse -- "…"  # parse one message from the command line
npm run batches       # open today's bits batches by hand
npm run digest        # print today's digest without sending it
```

## Layout

```
src/
  catalog.ts        the five categories and every channel
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

Everything in the original plan is built. What's left is what real use turns
up — the parser's misreads, and whatever the board turns out not to show.
