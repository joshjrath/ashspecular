import { Client, GatewayIntentBits, Partials } from "discord.js";
import { config } from "../config.js";

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

const INTAKE = config.intakeChannelIds;
const TASKS = config.tasksChannelIds;

/**
 * The to-do channel: anything posted or forwarded there becomes a task, not a
 * production record. TASKS_CHANNEL_IDS names it; unset, any channel called
 * "tasks" (or "to-do", "todo") counts.
 */
export function isTasksChannel(channelId: string, channelName?: string | null): boolean {
  if (TASKS.length) return TASKS.includes(channelId);
  // "tasks", "📋-tasks", "to-do": emoji and edge dashes don't matter.
  const name = (channelName ?? "").replace(/[^\w-]/g, "").replace(/^[-_]+|[-_]+$/g, "");
  return /^(?:tasks?|to-?dos?)$/i.test(name);
}

/** Empty INTAKE_CHANNEL_IDS means listen everywhere the bot can see — except the tasks channel. */
export function isIntakeChannel(channelId: string, channelName?: string | null): boolean {
  if (isTasksChannel(channelId, channelName)) return false;
  return INTAKE.length === 0 || INTAKE.includes(channelId);
}
