import { Client, GatewayIntentBits, Partials } from "discord.js";

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    // Without MESSAGE CONTENT enabled in the developer portal this intent is
    // accepted but every message arrives with an empty `content`.
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel, Partials.Message],
});

const INTAKE = (process.env.INTAKE_CHANNEL_IDS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/** Empty INTAKE_CHANNEL_IDS means listen everywhere the bot can see. */
export function isIntakeChannel(channelId: string): boolean {
  return INTAKE.length === 0 || INTAKE.includes(channelId);
}
