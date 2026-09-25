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
| **pattern** (`parse/structured.ts`) | assignment posts, forwarded Frame.io links | free, instant, no API key |
| **model** (`parse/classify.ts`) | prose: intent, fuzzy times, anything unlabelled | one Claude call |
| **rules** (`ruleFallback`) | anything at all, when there is no model | free |

Two shapes need no model at all:

**The assignment post** is rigidly templated — `### MM-DD-YY | CODE | Title`, a
labelled deadline, a labelled word count — so `parseAssignment` reads it
outright.

**A forwarded revision** isn't templated but doesn't need to be: the hostname
says it's a review, `v3` says which version, and a channel name in the sentence
says which project. `parseReview` reads all three. A bare link with no words
comes back at confidence `0.5` and says plainly that it doesn't know the
project — which is honest, because nothing in the message says.

Both refuse what they aren't sure of and return `null`, and the message falls
through to the model. The refusals that matter:

- No heading signature, or a heading with no title.
- **Any mention of the voiceover that isn't a plain date and time.** "Oct 5 at
  2pm ET" is read; "by 3 latest" and "vo whenever you get a chance" are handed
  over. The VO time drives the whole day's schedule, so the six-day default
  must never quietly overwrite a stated one.
- A paragraph with a link buried in it, rather than a forward with a note.

Neither pass ever invents what the message doesn't carry: no channel the words
don't name, and never a calculated VO deadline — that stays `derive()`'s job,
so the air-date-minus-six rule lives in exactly one place.

### So do you need an API key?

**No.** `ANTHROPIC_API_KEY` is optional, and this is a supported way to run.

Without one, assignment posts and Frame.io forwards parse exactly as they
would with a key. Everything else drops to the rule fallback, which is cruder
but not useless: it still classifies every link by hostname and still files the
message against a channel it names, at confidence `0.4` so you know to check
it. What you actually lose is prose — reading intent out of "push the deadpool
cut to friday", or a fuzzy time out of "need the vo by 3 latest". Those come
back as `other`, unsorted.

### Deadlines written in a message

A labelled line — `Deadline: 6 am friday 25th 2026`, `Due: tomorrow 5pm`,
`VO: Oct 5 2pm ET` — is read as a real time and taken out of the title. The
reader in [`src/parse/when.ts`](src/parse/when.ts) handles month names, numeric
dates, weekdays, ordinals with no month ("friday 25th" finds the month where
the 25th is a Friday), today/tomorrow, noon and midnight, and ET/IST/PT.

It refuses what it can't be sure of. "by 3" could be morning or afternoon, so
it returns nothing rather than picking one. An unreadable deadline is left
blank and the record says so; an unreadable VO time goes to the model.

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
