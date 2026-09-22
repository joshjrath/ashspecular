# Ash Specular

One place for everything across the four sides of the business. You forward things
into a Discord channel; a bot reads each message, works out what it is and where it
belongs, and files it. The website is the single board you actually look at.

```
you forward a message  ->  #intake (Discord)  ->  bot parses it with Claude
                                                       |
                                       Postgres <------+
                                          |
                          website board  <-+->  daily digest posted back to Discord
```

## The four lanes

| Lane | What goes in it |
|---|---|
| **Shorts** | The 5 shorts channels, ~25 shorts a day |
| **Long Form** | Long-form videos. The daily digest reports on this lane |
| **Gaming** | Roblox and Minecraft channels |
| **Bits** | The new Bits side |

Lanes live in `src/lanes.ts`. Renaming a label is safe; renaming an `id` needs a
data migration since every item stores the id.

## What the bot does with a forwarded message

It reads the message text, anything inside a Discord *forward* (message snapshots),
embed contents (so Frame.io integration posts work), and attachment names. Then it
extracts:

- **lane** and **kind** (`revision`, `vo`, `deadline`, `task`, `asset`, `note`)
- a **title** and one-line summary
- **priority** 1–5
- **due date**, and separately **when the VO is needed by**
- every **link**, classified by host (Frame.io, Drive, Docs, YouTube, Dropbox…)

It reacts ✅ and replies with a card carrying a lane picker, a Done button, a
"Make it P1" button, and a link straight to that item on the board. Getting the
classification wrong is fine — correcting it is one click.

If Claude is unreachable, the item is still filed, marked `unknown` with a ❓
reaction. Nothing you forward is ever dropped.

## Daily digest

Once a day (default 08:00 in your `TIMEZONE`) the bot posts the top 4 open
**Long Form** items into `DIGEST_CHANNEL_ID`, with the VO-by times called out
separately. Set a VO time with `/vo <id> 3pm` or by replying in the intake channel.

## Slash commands

| Command | |
|---|---|
| `/today` | Today's top priorities, on demand |
| `/board [lane] [status]` | Open items, filtered |
| `/find <query>` | Search everything filed |
| `/item <id>` | One item with its buttons |
| `/done <id>` | Close it |
| `/prio <id> <1-5>` | Re-prioritize |
| `/vo <id> <when>` | `3pm`, `15:30`, `tomorrow 9am` |
| `/lane <id> <lane>` | Move it |
| `/digest` | Post the digest now |

## Setup

### 1. The Discord bot

1. https://discord.com/developers/applications → **New Application**
2. **Bot** → Reset Token → copy it into `DISCORD_TOKEN`
3. **Bot** → Privileged Gateway Intents → turn on **Message Content Intent**
   (without this the bot sees empty messages)
4. **OAuth2** → URL Generator → scopes `bot` + `applications.commands`,
   permissions: View Channels, Send Messages, Read Message History,
   Add Reactions, Embed Links. Open the generated URL and add it to your server.
5. Turn on Developer Mode in Discord (Settings → Advanced), right-click your
   intake channel → Copy Channel ID → `INTAKE_CHANNEL_IDS`. Same for the digest
   channel → `DIGEST_CHANNEL_ID`.

### 2. Deploy to Railway

1. New Project → Deploy from GitHub repo → pick this repo
2. Add a **Postgres** service in the same project. Railway injects `DATABASE_URL`.
3. Add the rest of the variables from `.env.example` under the service's Variables tab.
4. Settings → Networking → Generate Domain. Put that URL in `PUBLIC_URL` and redeploy.

Migrations run automatically on boot. `/healthz` is the health check.

### 3. Local development

```bash
npm install
cp .env.example .env     # fill it in
npm run dev              # tsx watch, migrations run on start
```

You need a Postgres to point `DATABASE_URL` at. The dashboard is at
`http://localhost:8080`, password `DASHBOARD_PASSWORD`.

## The board

Four colour-coded columns plus an **Unsorted** column that only appears when the
bot wasn't sure. Filter by all-open / due-today / VO-needed, search as you type,
and change priority or lane inline. It re-polls every 20 seconds. Sign in with
`DASHBOARD_PASSWORD`; the session cookie lasts 30 days.

## Cost

One Claude call per forwarded message, `effort: low`, with the system prompt
cached. At a few hundred messages a day this is cents. `ANTHROPIC_MODEL` switches
models if you want to trade accuracy for cost.

## Layout

```
src/
  index.ts          boots migrations, the bot and the web server in one process
  env.ts            every environment variable, validated at startup
  lanes.ts          the four lanes
  time.ts           timezone handling and the "3pm" shorthand parser
  parse/
    schema.ts       what the classifier must return
    classify.ts     the Claude call, plus the rule-based fallback
    rules.ts        URL extraction and link classification
  db/
    migrations/     plain SQL, applied in order on boot
    items.ts        every query
  bot/
    intake.ts       forwarded message -> filed item
    render.ts       embeds, buttons, digest lines
    commands.ts     slash commands
    interactions.ts button and lane-picker handling
    digest.ts       the daily post
  web/
    server.ts       API + auth
    page.ts         the dashboard
```
