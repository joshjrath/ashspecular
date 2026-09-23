# Making the Discord bot

Two halves. The Discord half is clicking through their portal — only you can
do that. The code half is done.

At this stage the bot has **no database**. It reads a message, parses it, and
replies with what it understood. That is deliberate: right now the job is to
find out where the parser is wrong, and storage would only get in the way of
changing the shape of a record.

---

## 1. Create the application (5 minutes)

1. Go to <https://discord.com/developers/applications> → **New Application**.
   Name it `Specular`.
2. **Bot** in the left sidebar → **Reset Token** → copy it. That is
   `DISCORD_TOKEN`. It is shown once; if you lose it, reset again.
3. Still on **Bot**, scroll to **Privileged Gateway Intents** and turn on
   **MESSAGE CONTENT INTENT**.

   This one matters. Without it Discord still connects the bot, but every
   message arrives with empty text and the bot silently does nothing. If the
   bot logs in and ignores everything, this is why.
4. **OAuth2 → URL Generator**:
   - Scopes: `bot`
   - Bot permissions: **View Channels**, **Send Messages**,
     **Read Message History**, **Add Reactions**, **Embed Links**
5. Copy the generated URL at the bottom, open it, pick your server, authorise.

## 2. Get the channel ID

In Discord: **Settings → Advanced → Developer Mode** on. Then right-click your
intake channel → **Copy Channel ID**.

Leave `INTAKE_CHANNEL_IDS` empty at first and the bot answers in every channel
it can see — easier for testing in a scratch channel. Fill it in before anyone
else is in the server.

## 3. Run it

```bash
cp .env.example .env     # then fill in DISCORD_TOKEN and ANTHROPIC_API_KEY
npm install
npm run doctor           # check everything before touching Discord
npm run bot
```

`npm run doctor` tests each thing separately — Node version, `.env`, whether
Anthropic accepts your key, whether Discord accepts your token, and one real
message through the parser. Fix anything it flags before starting the bot;
it is much easier than working out which of five things caused a silent
channel.

Expected output:

```
[bot] logged in as Specular#1234
[bot] intake: every channel it can see
[bot] model: claude-opus-5
```

Now paste a real assignment post into the channel. The bot reacts ⏳ while it
thinks, then ✅ (or ❓ if it couldn't work out a category), and replies with a
card showing every field it read, colour-coded by category, with the elapsed
time and token count underneath.

## 4. When it gets something wrong

Hit **Got it wrong** on the card. The bot replies — only visible to you —
with a block of text containing the original message and what it read from
it. Copy that, paste it to Claude, and it gets fixed.

That's the whole job. You don't need to open any files; the same thing is
also saved to `evals/cases/pending/` if you'd rather send the file, and a
long assignment post comes back as a file attachment because it won't fit
in a Discord message.

What happens on the other end: that message becomes a permanent test, so the
next change can't quietly break it again. Run `npm run eval` any time to see
the score across every case collected so far.

Off-Discord, for quick trials without posting anything:

```bash
npm run parse -- "torch is only at 3 today, need 2 more before 6"
```

---

## What it does and doesn't do yet

**Does:** reads normal messages, Discord *forwards* (message snapshots), embed
contents from integrations, and attachment names. Parses all of it. Replies
with the record. Derives the VO deadline from the air date. Flags anything it
had to guess.

**Doesn't yet:** store anything, post the morning digest, open the daily bits
batches, or serve the board. Those come once the eval score holds — they all
depend on the record shape, and the record shape is what we're still testing.

Nothing persists across a restart, including the "Got it wrong" memory. Save a
case before restarting the bot.

## When something goes wrong

| What you see | Why |
|---|---|
| Bot online, ignores everything | MESSAGE CONTENT INTENT is off (step 1.3) |
| `disallowed intents` on startup | Same — the portal toggle |
| `Missing DISCORD_TOKEN` | No `.env`, or it isn't being loaded |
| ⚠️ *Parser was unreachable* | Bad or missing `ANTHROPIC_API_KEY` — the message still gets a rule-based reply rather than being dropped |
| ⚠️ on the message itself | The handler threw; the real error is in the terminal |
| Card shows the wrong channel | Add an alias in `src/catalog.ts` |

## Hosting

Run it on your machine while tuning — you want the terminal output and the
pending eval files on disk.

Railway comes later, with the database. `railway.json` and `Procfile` are
already in the repo from the first pass, and `evals/cases/pending/` is
gitignored because a container's disk doesn't survive a redeploy.
