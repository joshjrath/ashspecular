import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  Events,
  MessageFlags,
  type Message,
  type OmitPartialGroupDMChannel,
} from "discord.js";
import { client, isIntakeChannel } from "./client.js";
import { classify, type ClassifyInput } from "../parse/classify.js";
import { derive, type DerivedRecord } from "../parse/derive.js";
import { feedbackRow, recordEmbed } from "./render.js";

type Msg = OmitPartialGroupDMChannel<Message<boolean>>;

const PENDING_DIR = join(process.cwd(), "evals", "cases", "pending");

/** Everything the bot has parsed this run, so feedback can find it again. */
const seen = new Map<string, { input: ClassifyInput; record: DerivedRecord }>();

export function registerIntake(): void {
  client.on(Events.MessageCreate, (message) => {
    void handle(message).catch(async (err) => {
      console.error("[intake] failed:", err);
      await message.react("⚠️").catch(() => {});
    });
  });

  client.on(Events.InteractionCreate, (interaction) => {
    if (!interaction.isButton()) return;
    void feedback(interaction).catch((err) => console.error("[feedback] failed:", err));
  });
}

async function handle(message: Msg): Promise<void> {
  if (message.author.id === client.user?.id) return;
  if (!isIntakeChannel(message.channelId)) return;

  const input = flatten(message);
  if (!input.content && !input.forwardedFrom && !input.attachments?.length) return;

  await message.react("⏳").catch(() => {});
  const started = Date.now();

  const result = await classify(input);
  const record = derive(result.extraction, result.raw);
  seen.set(message.id, { input, record });

  await message.reactions.cache.get("⏳")?.users.remove(client.user!.id).catch(() => {});
  await message.react(record.category === "unknown" ? "❓" : "✅").catch(() => {});

  const ms = Date.now() - started;
  const cost = result.usage
    ? ` · ${result.usage.input}in/${result.usage.output}out${result.usage.cacheRead ? ` · ${result.usage.cacheRead} cached` : ""}`
    : "";

  await message.reply({
    embeds: [recordEmbed(record)],
    components: [feedbackRow(message.id)],
    content:
      result.parsedBy === "rule"
        ? "⚠️ Parser was unreachable — this is the rule-based fallback."
        : `\`${ms}ms${cost}\``,
    allowedMentions: { repliedUser: false },
  });
}

/**
 * "Got it wrong" writes a half-filled eval case to evals/cases/pending/.
 * Fill in `expect`, move it up a directory, and the next `npm run eval` holds
 * the parser to it — which is how the prompt stops regressing.
 */
async function feedback(interaction: import("discord.js").ButtonInteraction): Promise<void> {
  const [verdict, messageId] = interaction.customId.split(":");
  if (!messageId) return;

  const entry = seen.get(messageId);
  if (!entry) {
    await interaction.reply({
      content: "That was parsed before the last restart, so I no longer have it in memory.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (verdict === "ok") {
    await interaction.reply({ content: "Noted, thanks.", flags: MessageFlags.Ephemeral });
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = join(PENDING_DIR, `${stamp}.json`);

  const draft = {
    name: "TODO — name this case",
    why: "TODO — why the parser got this wrong",
    input: {
      author: entry.input.author,
      channelName: entry.input.channelName,
      content: entry.input.content,
      ...(entry.input.forwardedFrom ? { forwardedFrom: entry.input.forwardedFrom } : {}),
    },
    // What it actually returned, so you can see what to correct.
    got: {
      kind: entry.record.kind,
      code: entry.record.code,
      category: entry.record.category,
      channel: entry.record.channel,
      airDate: entry.record.airDate,
      voSource: entry.record.voSource,
      confidence: entry.record.confidence,
    },
    // Delete the wrong lines, correct the rest, then move this file up one
    // directory into evals/cases/.
    expect: {
      kind: entry.record.kind,
      category: entry.record.category,
      channel: entry.record.channel,
    },
  };

  await mkdir(PENDING_DIR, { recursive: true });
  const json = `${JSON.stringify(draft, null, 2)}\n`;
  await writeFile(file, json, "utf8");

  // Hand it back in Discord rather than leaving it in a folder to go and find.
  // Short enough pastes inline; anything longer comes back as a file to drag.
  const block = "```json\n" + json + "```";
  const inline = block.length <= 1800;

  await interaction.reply({
    content: inline
      ? `Copy this and send it to Claude — it's the message plus what I read from it.\n${block}`
      : "Too long to paste inline, so here it is as a file — send it to Claude.",
    files: inline ? [] : [{ attachment: Buffer.from(json, "utf8"), name: `${stamp}.json` }],
    flags: MessageFlags.Ephemeral,
  });
  console.log(`[feedback] wrote ${file}`);
}

/**
 * Discord forwards arrive as message snapshots with the visible content empty,
 * and integrations put everything in embeds. Pull text out of all three.
 */
function flatten(message: Msg): ClassifyInput {
  const content = [message.content, ...embedText(message)].filter(Boolean).join("\n");

  const forwarded = [...(message.messageSnapshots?.values() ?? [])]
    .map((snap) => {
      const embeds = (snap.embeds ?? [])
        .map((e) => [e.title, e.description, e.url].filter(Boolean).join(" — "))
        .filter(Boolean);
      const files = [...(snap.attachments?.values() ?? [])].map((a) => a.url);
      return [snap.content, ...embeds, ...files].filter(Boolean).join("\n");
    })
    .filter(Boolean)
    .join("\n\n");

  return {
    content: content.trim(),
    forwardedFrom: forwarded.trim() || undefined,
    attachments: [...message.attachments.values()].map((a) => `${a.name ?? "file"} (${a.url})`),
    author: message.author.username,
    channelName:
      message.channel && "name" in message.channel && message.channel.name
        ? message.channel.name
        : "dm",
  };
}

function embedText(message: Msg): string[] {
  return message.embeds.flatMap((embed) => {
    const parts = [embed.title, embed.description, embed.url];
    for (const field of embed.fields ?? []) parts.push(`${field.name}: ${field.value}`);
    return parts.filter((p): p is string => Boolean(p));
  });
}
