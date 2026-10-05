/**
 * The hourly read (at :07, and once shortly after boot): every linked
 * channel's uploads from YouTube, then the posting check for yesterday's
 * videos, breakout alerts, and the Shorts avatars' colours.
 */
import cron from "node-cron";
import { moveWithRest } from "../web/moves.js";
import { syncUploads } from "./youtube.js";
import { announceBreakouts } from "./breakouts.js";
import { sampleAvatars } from "./avatars.js";
import { checkPosts, missedLine } from "./postcheck.js";
import { config } from "../config.js";
import { displayTitle } from "../web/page.js";
import { getRecord as getRecordById } from "../db/records.js";
import { usDate } from "../parse/derive.js";
import { forgetGaps } from "../web/shell.js";

/** Read YouTube hourly (at :07), and once twenty seconds after boot. Each step's failure is logged. */
export function startHourlyRead(): void {
  const read = (why: string) =>
    syncUploads()
      .then((r) => r.channels && console.log(`[uploads] ${why}: ${r.channels} channels, ${r.added} new, ${r.errors} failed`))
      .then(() => runPostCheck())
      .then(() => announceBreakouts())
      .then((n) => n && console.log(`[uploads] announced ${n} breakout${n === 1 ? "" : "s"}`))
      .then(() => sampleAvatars())
      .then((a) => (a.sampled || a.failed) && console.log(`[colours] ${a.sampled} avatars sampled, ${a.failed} failed`))
      .catch((err) => console.error("[uploads] read failed:", err));
  cron.schedule("7 * * * *", () => void read("hourly"));
  setTimeout(() => void read("boot"), 20_000).unref();
}

/**
 * The daily posting check, after each hourly read: yesterday's scheduled
 * videos (and any day a channel couldn't be read on, up to two weeks back)
 * against what went up. Missed ones are pushed to today, the rest of the
 * channel with them, and posted to the digest channel on Discord.
 */
async function runPostCheck(): Promise<void> {
  const r = await checkPosts(async (record, to, alone, from) => {
    const m = await moveWithRest(record, to, "posting", alone, from);
    return { ok: m.ok, moved: m.plan.moves.length };
  });
  if (r.checked.length) {
    console.log(`[posts] ${r.day}: ${r.checked.length} channels checked, ${r.posted.length} posted, ${r.missed.length} missed${r.waiting.length ? `, waiting on ${r.waiting.join(", ")}` : ""}`);
    forgetGaps();
  }
  if (!r.missed.length || !config.digestChannelId) return;
  try {
    const { client } = await import("../bot/client.js");
    if (!client.isReady()) return;
    const channel = await client.channels.fetch(config.digestChannelId);
    if (!channel?.isSendable()) return;
    const lines = await Promise.all(
      r.missed.map(async (m) => {
        const rec = await getRecordById(m.recordId);
        const link = config.publicUrl ? ` · [open](${config.publicUrl}/r/${m.recordId})` : "";
        return missedLine(m, rec ? displayTitle(rec) : `#${m.recordId}`, usDate) + link;
      }),
    );
    await channel.send({
      content: `📅 **Not posted** — ${r.missed.length === 1 ? "pushed to today" : `${r.missed.length} videos pushed to today`}\n${lines.join("\n")}\nPosted after all? Open it and press *It was posted* to put the schedule back.`,
      allowedMentions: { parse: [] },
    });
  } catch (err) {
    console.error("[posts] couldn't post to Discord:", err);
  }
}
