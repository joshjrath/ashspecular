import { Events } from "discord.js";
import { client, isIntakeChannel } from "./client.js";
import { registerIntake } from "./intake.js";
import { guardProcess } from "../process.js";
import { checkConfig, config, hasDatabase } from "../config.js";
import { modelFor } from "../ai/claude.js";

guardProcess();
checkConfig();
// Run on its own (npm run bot), the bot gets the database ready itself: the
// channels renamed and the keys set in Settings. Under start.ts it's done already.
if (hasDatabase) {
  const { prepareDatabase } = await import("../db/prepare.js");
  await prepareDatabase();
}

const token = config.discordToken;
if (!token) {
  console.error("Missing DISCORD_TOKEN. Copy .env.example to .env and fill it in.");
  process.exit(1);
}

registerIntake();

client.once(Events.ClientReady, (ready) => {
  console.log(`[bot] logged in as ${ready.user.tag}`);
  console.log(`[bot] intake: ${config.intakeChannelIds.join(",") || "every channel it can see"}`);
  console.log(
    process.env.ANTHROPIC_API_KEY?.trim()
      ? `[bot] model: ${modelFor("intake")}`
      : "[bot] no API key — assignment posts and Frame.io links parse by pattern; prose is filed by channel name only",
  );
  if (!isIntakeChannel("probe")) console.log("[bot] (channel filter active)");
});

client.on(Events.Error, (err) => console.error("[bot] gateway error:", err));

process.on("SIGINT", () => void client.destroy().finally(() => process.exit(0)));
process.on("SIGTERM", () => void client.destroy().finally(() => process.exit(0)));

client.login(token).catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);

  // discord.js reports a bad token as "No Description", which tells you
  // nothing on the day you are setting this up for the first time.
  if (/token|no description/i.test(message)) {
    console.error("[bot] Discord rejected the token.");
    console.error("      Check DISCORD_TOKEN in .env against the developer portal.");
    console.error("      The token is shown once — if you lost it, hit Reset Token and copy the new one.");
  } else if (/disallowed intents/i.test(message)) {
    console.error("[bot] Discord refused the connection: disallowed intents.");
    console.error("      Turn on MESSAGE CONTENT INTENT under Bot → Privileged Gateway Intents.");
  } else {
    console.error("[bot] login failed:", message);
  }
  process.exit(1);
});
