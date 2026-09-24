# The parser

The bot's job is to turn a Discord message into one record. Everything else —
the board, the digest, the batches — is downstream of getting that right, so
the parser is built and tested on its own first.

## Run it

```bash
npm install

# deterministic rules — no API key, no database, ~1 second
npm run test:rules

# the full parser against the eval set (needs ANTHROPIC_API_KEY for the
# messy cases; templated assignment posts are read by pattern either way)
export ANTHROPIC_API_KEY=sk-ant-...
npm run eval
npm run eval -- --case 04        # one case
npm run eval -- --verbose        # dump the whole record

# try a message that isn't in the eval set
npm run parse -- "torch is only at 3 today, need 2 more before 6"
pbpaste | npm run parse          # paste a real Discord post straight in
```

## Three passes, cheapest first

A message goes through as little machinery as it needs:

| Pass | What it handles | Cost |
|---|---|---|
| **pattern** (`parse/structured.ts`) | the studio's own assignment post | free, instant, no API key |
| **model** (`parse/classify.ts`) | messy forwards, DMs, one-liners | one Claude call |
| **rules** (`ruleFallback`) | anything at all, when the API is unreachable | free |

The assignment post is rigidly templated — `### MM-DD-YY | CODE | Title`, a
labelled deadline, a labelled word count — so it needs no model. The pattern
pass runs first and, when it recognises the shape, the message never reaches
the API. **This is why most of the volume costs nothing.**

It refuses everything it is not sure of: no heading signature, no title, and it
returns `null` and falls through. A half-read post is worse than a parsed one.
It also never guesses a channel (the template names none) and never calculates
the VO deadline — that stays `derive()`'s job, exactly as it is for the model.

So an `ANTHROPIC_API_KEY` is **optional**. Without one, assignment posts still
parse perfectly; forwarded Frame.io links and terse one-liners drop to the rule
fallback, which keeps the links and the code but can't work out the channel.

## The split that matters

**The model extracts. The code derives.** Anything that can be computed is
computed, never asked of the model:

| The model returns | The code works out |
|---|---|
| `air_date` from the heading | `voDue` = air date − 6 days, 11:59 PM ET |
| `channel` as written | which category that channel belongs to |
| `links` it noticed | every URL in the raw text, classified by hostname |
| `code` exactly as written | — (never invented) |

The prompt says explicitly: *never calculate a voiceover deadline*. A stated
time always wins; a derived one is tagged `voSource: "calculated"` so the UI
can show it as a fallback rather than a fact.

Channel beats category. If the model says `gaming` but names `FNAF Bits`, the
record becomes `bits` and carries a warning — the named channel is harder
evidence than the model's own guess.

## Adding a channel

One entry in `src/catalog.ts`. Nothing else needs touching: the prompt builds
its channel list from the catalog, and `matchChannel` picks up the aliases.

```ts
{ id: "dc", name: "Specular DC", category: "reading", aliases: ["dc"] },
```

Aliases of three characters or more are matched inside a sentence, so `smp`
finds the gaming channel. Two-character aliases only match on their own —
`dc` appears in too much ordinary text.

## Adding an eval case

Drop a JSON file in `evals/cases/`. `expect` lists only the fields that
matter for that case:

```json
{
  "name": "bits · link for today's batch",
  "why": "Bits batches already exist, so this must not become a new project.",
  "input": { "author": "dev", "content": "couple more for fnaf bits today https://..." },
  "expect": { "kind": "bits", "category": "bits", "channel": "FNAF Bits", "code": null }
}
```

Available checks are in `scripts/eval.ts` (`CHECKS`): `kind`, `code`,
`category`, `channel`, `tag`, `airDate`, `stage`, `wordCount`, `version`,
`voSource`, `voDueLocal`, `scriptDueLocal`, `titleContains`, `briefNotEmpty`,
`hasFrameioLink`, `confidenceBelow`. Add a new one there if a case needs it.

**The loop:** run `npm run eval`, watch the percentage, change the prompt in
`src/parse/classify.ts`, run it again. Cases that fail print what they got
against what they wanted, so a regression is obvious.

The best cases are real messages that the bot got wrong. When one misfires in
Discord, paste it into a new case file before fixing the prompt.

## What is deliberately not automatic

- **A channel is never guessed.** No match means `null` and one click on the
  board, because filing something to the wrong channel is worse than filing it
  nowhere.
- **Codes are never invented.** `VIDEO-008` is copied from the post or absent.
- **Confidence is honest.** `07-noise.json` exists to check that "can we move
  the thing to next week" comes back unsure rather than confidently wrong.

## Configuration

| Variable | Default | |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | required for `eval` and `parse` |
| `ANTHROPIC_MODEL` | `claude-opus-5` | |
| `ORG_TZ` | `America/New_York` | the zone deadlines are written in |
| `TEAM_TZ` | `Asia/Kolkata` | the second zone shown alongside |
| `VO_BUFFER_DAYS` | `6` | air date minus this = VO deadline |
| `DEADLINE_TIME` | `23:59` | what time derived deadlines land on |

## Status

- `src/catalog.ts`, `src/parse/*`, `scripts/*` — current.
- `src/_legacy/` — the first-pass Discord bot and web board, written against
  the earlier model. Excluded from the build, kept for the plumbing. It gets
  rebuilt on the new record once the eval score holds up.
