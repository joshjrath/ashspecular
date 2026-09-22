import {
  Client,
  GatewayIntentBits,
  Partials,
  type SendableChannels,
} from "discord.js";
import { env } from "../env.js";

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  // DMs arrive uncached, so the channel and message have to be usable as partials.
  partials: [Partials.Channel, Partials.Message],
});

/** True when the bot should treat messages in this channel as intake. */
export function isIntakeChannel(channelId: string): boolean {
  if (env.intakeChannelIds.length === 0) return true;
  return env.intakeChannelIds.includes(channelId);
}

export async function sendable(channelId: string): Promise<SendableChannels | null> {
  try {
    const channel = await client.channels.fetch(channelId);
    if (channel?.isSendable()) return channel;
    return null;
  } catch (err) {
    console.error(`[bot] cannot reach channel ${channelId}`, err);
    return null;
  }
}
