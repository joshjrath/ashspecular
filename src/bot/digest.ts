import cron from "node-cron";
import { EmbedBuilder } from "discord.js";
import { env } from "../env.js";
import { sendable } from "./client.js";
import { laneColorInt, lane } from "../lanes.js";
import { digestExists, recordDigest, topPriorities } from "../db/items.js";
import { itemLine } from "./render.js";
import { localDate, prettyDate } from "../time.js";

const DIGEST_LANE = "longform";

/**
 * Builds the digest embed. Returns null when there is nothing open — a silent
 * morning is better than an empty post every day.
 */
export async function buildDigest(): Promise<{
  embed: EmbedBuilder;
  itemIds: string[];
} | null> {
  const items = await topPriorities(DIGEST_LANE, env.digestCount);
  if (items.length === 0) return null;

  const voToday = items.filter((i) => i.vo_needed);

  const embed = new EmbedBuilder()
    .setColor(laneColorInt(DIGEST_LANE))
    .setTitle(`${lane(DIGEST_LANE).label} — top ${items.length} for ${prettyDate()}`)
    .setDescription(items.map((item, i) => itemLine(item, i)).join("\n\n"));

  if (voToday.length) {
    embed.addFields({
      name: "Voiceover needed",
      value: voToday
        .map((i) => `• ${i.title}${i.vo_due_at ? ` — by <t:${Math.floor(i.vo_due_at.getTime() / 1000)}:t>` : " — no time set yet"}`)
        .join("\n"),
    });
  }

  if (env.publicUrl) embed.setURL(env.publicUrl);
  embed.setFooter({ text: "Reply with the times you need the VO by and I'll file them." });

  return { embed, itemIds: items.map((i) => i.id) };
}

/** Posts today's digest. `force` bypasses the once-per-day guard. */
export async function postDigest(force = false): Promise<boolean> {
  if (!env.digestChannelId) {
    console.warn("[digest] DIGEST_CHANNEL_ID is not set — skipping");
    return false;
  }

  const day = localDate();
  if (!force && (await digestExists(day))) {
    console.log(`[digest] already posted for ${day}`);
    return false;
  }

  const built = await buildDigest();
  if (!built) {
    console.log("[digest] nothing open, not posting");
    return false;
  }

  const channel = await sendable(env.digestChannelId);
  if (!channel) return false;

  const sent = await channel.send({ embeds: [built.embed] });
  await recordDigest(day, built.itemIds, sent.url);
  console.log(`[digest] posted ${built.itemIds.length} items for ${day}`);
  return true;
}

export function scheduleDigest(): void {
  if (!env.digestChannelId) {
    console.warn("[digest] DIGEST_CHANNEL_ID unset — daily digest disabled");
    return;
  }
  cron.schedule(env.digestCron, () => void postDigest().catch(console.error), {
    timezone: env.timezone,
  });
  console.log(`[digest] scheduled "${env.digestCron}" in ${env.timezone}`);
}
