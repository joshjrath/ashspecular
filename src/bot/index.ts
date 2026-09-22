import { Events } from "discord.js";
import { client, isIntakeChannel } from "./client.js";
import { registerIntake } from "./intake.js";

function required(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) {
    console.error(`Missing ${name}. Copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
  return v;
}

const token = required("DISCORD_TOKEN");
required("ANTHROPIC_API_KEY");

registerIntake();

client.once(Events.ClientReady, (ready) => {
  const ids = (process.env.INTAKE_CHANNEL_IDS ?? "").trim();
  console.log(`[bot] logged in as ${ready.user.tag}`);
  console.log(`[bot] intake: ${ids || "every channel it can see"}`);
  console.log(`[bot] model: ${process.env.ANTHROPIC_MODEL ?? "claude-opus-5"}`);
  if (!isIntakeChannel("probe")) console.log("[bot] (channel filter active)");
});

client.on(Events.Error, (err) => console.error("[bot] gateway error:", err));

process.on("SIGINT", () => void client.destroy().finally(() => process.exit(0)));
process.on("SIGTERM", () => void client.destroy().finally(() => process.exit(0)));

client.login(token).catch((err) => {
  console.error("[bot] login failed:", err?.message ?? err);
  console.error("If this says 'disallowed intents', turn on MESSAGE CONTENT INTENT in the developer portal.");
  process.exit(1);
});
