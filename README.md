# Specular

You forward things into a Discord channel. A bot reads each message, works out
what it is, and files it. Eventually one website shows all of it.

**Right now only the first half exists**, on purpose. The bot parses messages
and replies with what it understood — no database, no board, no digest. The job
at this stage is finding out where the parser is wrong, and storage would fix
the shape of a record before it has settled.

## Start here

| | |
|---|---|
| **[BOT.md](BOT.md)** | Set up the Discord bot and run it. Start here. |
| **[PARSER.md](PARSER.md)** | How the parser works, and how to improve it. |

```bash
npm install
npm run doctor      # checks Node, keys, Discord and Anthropic before you start
npm run bot         # run it
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

Templated assignment posts are read by **pattern**, not by the model — free,
instant, and no API key needed. The model is only for messy forwards and
one-liners. See [PARSER.md](PARSER.md#three-passes-cheapest-first).

**The model extracts; the code derives.** Anything computable is never asked of
the model — most importantly the voiceover deadline, which is the air date
minus six days unless the message states a time. Derived values are tagged
`voSource: "calculated"` so the interface can show them as a fallback rather
than a fact. Full reasoning in [PARSER.md](PARSER.md).

## Commands

```bash
npm run doctor        # preflight: Node, .env, both API keys, one real parse
npm run bot           # run the Discord bot
npm run test:rules    # 48 deterministic tests — no API key needed
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
    intake.ts       message → parse → reply, and the feedback button
    render.ts       the reply card
  db/               migration runner, unused until storage lands
  _legacy/          first-pass bot and board, built on the old model. Excluded
                    from the build; kept for the plumbing.
scripts/            doctor, eval, parse, test-rules
evals/cases/        the parser's test set
```

## What comes next

1. Run the bot against real messages, fix what it misreads *(now)*
2. Postgres, and correction dropdowns on the card instead of the feedback button
3. The board, the 8am digest, and the daily bits batches

Steps 2 and 3 all depend on the record shape, which is what step 1 is testing.
