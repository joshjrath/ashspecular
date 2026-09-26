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
import { cardRows, recordEmbed } from "./render.js";
import { config, hasDatabase } from "../config.js";
import { CHANNELS } from "../catalog.js";

type Msg = OmitPartialGroupDMChannel<Message<boolean>>;

const PENDING_DIR = join(process.cwd(), "evals", "cases", "pending");

/** Everything the bot has parsed this run, so the controls can find it again. */
const seen = new Map<
  string,
  { input: ClassifyInput; record: DerivedRecord; savedId: number | null; paused?: boolean; noScript?: boolean }
>();

export function registerIntake(): void {
  client.on(Events.MessageCreate, (message) => {
    void handle(message).catch(async (err) => {
      console.error("[intake] failed:", err);
      await message.react("⚠️").catch(() => {});
    });
  });

  client.on(Events.InteractionCreate, (interaction) => {
    if (interaction.isButton()) {
      void feedback(interaction).catch((err) => console.error("[feedback] failed:", err));
      return;
    }
    if (interaction.isStringSelectMenu()) {
      void correct(interaction).catch((err) => console.error("[correct] failed:", err));
    }
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
  seen.set(message.id, { input, record, savedId: null });

  // Storage is optional: without DATABASE_URL the bot still parses and
  // replies, it just forgets. A write failure must never lose the reply that
  // tells you what it read.
  let saved: number | null = null;
  if (hasDatabase) {
    try {
      const { saveRecord } = await import("../db/records.js");
      saved = await saveRecord(record, {
        messageId: message.id,
        channelId: message.channelId,
        guildId: message.guildId,
        author: message.author.username,
        url: message.url,
        raw: result.raw,
        parsedBy: result.parsedBy,
      });
    } catch (err) {
      console.error("[intake] could not save:", err);
    }
  }
  seen.set(message.id, { input, record, savedId: saved });

  await message.reactions.cache.get("⏳")?.users.remove(client.user!.id).catch(() => {});
  await message.react(record.category === "unknown" ? "❓" : "✅").catch(() => {});

  const ms = Date.now() - started;
  const cost = result.usage
    ? ` · ${result.usage.input}in/${result.usage.output}out${result.usage.cacheRead ? ` · ${result.usage.cacheRead} cached` : ""}`
    : "";
  // Worth showing: a post read by pattern cost nothing and can't drift.
  const how = result.parsedBy === "pattern" ? " · read by pattern, no API call" : "";

  const link = saved && config.publicUrl ? ` · <${config.publicUrl}/r/${saved}>` : "";

  await message.reply({
    embeds: [recordEmbed(record)],
    components: cardRows(message.id, record, saved !== null),
    content:
      result.parsedBy === "rule"
        ? process.env.ANTHROPIC_API_KEY?.trim()
          ? "⚠️ The parser was unreachable — filed by rules instead."
          : "Filed by rules — set the channel below if it needs one."
        : `\`${ms}ms${cost}${how}\`${link}`,
    allowedMentions: { repliedUser: false },
  });
}

/**
 * A dropdown correction: fix the record, redraw the card, and keep the
 * correction as an eval case so the parser stops making the same mistake.
 */
async function correct(
  interaction: import("discord.js").StringSelectMenuInteraction,
): Promise<void> {
  const [action, messageId] = interaction.customId.split(":");
  if (!messageId) return;

  const entry = seen.get(messageId);
  if (!entry) {
    await interaction.reply({
      content: "That was parsed before the last restart, so I no longer have it in memory.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const choice = interaction.values[0]!;
  const before = { category: entry.record.category, channel: entry.record.channel };

  if (action === "set-channel") {
    if (choice === "__none__") {
      entry.record.channel = null;
    } else {
      const channel = CHANNELS.find((c) => c.id === choice);
      if (!channel) return;
      entry.record.channel = channel.name;
      // A named channel decides the category; that rule holds here too.
      entry.record.category = channel.category;
    }
  } else if (action === "set-category") {
    entry.record.category = choice as DerivedRecord["category"];
  } else {
    return;
  }

  if (entry.savedId && hasDatabase) {
    try {
      const { updateFiling } = await import("../db/records.js");
      await updateFiling(entry.savedId, entry.record.category, entry.record.channel);
    } catch (err) {
      console.error("[correct] could not save:", err);
    }
  }

  await interaction.update({
    embeds: [recordEmbed(entry.record)],
    components: cardRows(messageId, entry.record, entry.savedId !== null, entry),
  });

  await saveCase(entry, before, "corrected by hand in Discord — the parser filed it wrong");
  console.log(
    `[correct] ${messageId}: ${before.channel ?? before.category} → ${
      entry.record.channel ?? entry.record.category
    }`,
  );
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

  if (verdict === "done") {
    if (!entry.savedId || !hasDatabase) {
      await interaction.reply({
        content: "Nothing to clear — this one was never stored.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const { setStatus } = await import("../db/records.js");
    await setStatus(entry.savedId, "done");
    await interaction.reply({ content: "Cleared.", flags: MessageFlags.Ephemeral });
    return;
  }

  // Pause / No script: the same marks as the board's buttons. The card is
  // redrawn so the button now offers the way back.
  if (verdict === "pause" || verdict === "resume" || verdict === "noscript" || verdict === "script") {
    if (!entry.savedId || !hasDatabase) {
      await interaction.reply({
        content: "Nothing to mark — this one was never stored.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const { setPaused, setNoScript } = await import("../db/records.js");
    if (verdict === "pause" || verdict === "resume") {
      entry.paused = verdict === "pause";
      await setPaused(entry.savedId, entry.paused);
    } else {
      entry.noScript = verdict === "noscript";
      await setNoScript(entry.savedId, entry.noScript);
    }
    await interaction.update({ components: cardRows(messageId, entry.record, true, entry) });
    await interaction.followUp({
      content: {
        pause: "Paused — it's off every deadline, the late list and the calendar until you resume it.",
        resume: "Resumed — its deadline is back.",
        noscript: "Marked as waiting on the script — its card turns magenta on the board until the script arrives.",
        script: "Script arrived — the no-script mark is cleared.",
      }[verdict],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const { file, json } = await saveCase(entry, null, "TODO — why the parser got this wrong");

  // Hand it back in Discord rather than leaving it in a folder to go and find.
  // Short enough pastes inline; anything longer comes back as a file to drag.
  const block = "```json\n" + json + "```";
  const inline = block.length <= 1800;

  await interaction.reply({
    content: inline
      ? `Copy this and send it to Claude — it's the message plus what I read from it.\n${block}`
      : "Too long to paste inline, so here it is as a file — send it to Claude.",
    files: inline ? [] : [{ attachment: Buffer.from(json, "utf8"), name: `${file}` }],
    flags: MessageFlags.Ephemeral,
  });
}

/**
 * Writes an eval case to evals/cases/pending/. Fill in `expect`, move it up a
 * directory, and the next `npm run eval` holds the parser to it — which is how
 * the parser stops regressing on a mistake you already caught.
 */
async function saveCase(
  entry: { input: ClassifyInput; record: DerivedRecord },
  before: { category: string; channel: string | null } | null,
  why: string,
): Promise<{ file: string; json: string }> {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const name = `${stamp}.json`;

  const draft = {
    name: "TODO — name this case",
    why,
    input: {
      author: entry.input.author,
      channelName: entry.input.channelName,
      content: entry.input.content,
      ...(entry.input.forwardedFrom ? { forwardedFrom: entry.input.forwardedFrom } : {}),
    },
    // What it read before any correction, so the mistake is visible.
    ...(before ? { got: before } : {}),
    // Delete the lines you are not asserting, then move this file up one
    // directory into evals/cases/.
    expect: {
      kind: entry.record.kind,
      category: entry.record.category,
      channel: entry.record.channel,
    },
  };

  const json = `${JSON.stringify(draft, null, 2)}\n`;
  await mkdir(PENDING_DIR, { recursive: true });
  await writeFile(join(PENDING_DIR, name), json, "utf8");
  console.log(`[feedback] wrote ${name}`);
  return { file: name, json };
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
