import { Events } from "discord.js";
import { env } from "./env.js";
import { migrate } from "./db/migrate.js";
import { pool } from "./db/pool.js";
import { client } from "./bot/client.js";
import { registerIntake } from "./bot/intake.js";
import { registerInteractions } from "./bot/interactions.js";
import { publishCommands, registerCommands } from "./bot/commands.js";
import { scheduleDigest } from "./bot/digest.js";
import { startWeb } from "./web/server.js";

async function main(): Promise<void> {
  await migrate();

  registerIntake();
  registerInteractions();
  registerCommands();

  client.once(Events.ClientReady, (ready) => {
    console.log(`[bot] logged in as ${ready.user.tag}`);
    console.log(
      env.intakeChannelIds.length
        ? `[bot] intake channels: ${env.intakeChannelIds.join(", ")}`
        : "[bot] intake: every channel the bot can see",
    );
    void publishCommands().catch((err) => console.error("[bot] command publish failed", err));
    scheduleDigest();
  });

  // The web server comes up first so the platform health check passes even if
  // Discord is slow to hand out a gateway session.
  await startWeb();
  await client.login(env.discordToken);
}

async function shutdown(signal: string): Promise<void> {
  console.log(`[app] ${signal} — shutting down`);
  await client.destroy().catch(() => {});
  await pool.end().catch(() => {});
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

main().catch((err) => {
  console.error("[app] failed to start", err);
  process.exit(1);
});
