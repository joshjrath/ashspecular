import { Events, Message, type OmitPartialGroupDMChannel } from "discord.js";
import { client, isIntakeChannel } from "./client.js";
import { classify } from "../parse/classify.js";
import { createItem, findBySourceMessage } from "../db/items.js";
import { itemComponents, itemEmbed } from "./render.js";

type Msg = OmitPartialGroupDMChannel<Message<boolean>>;

export function registerIntake(): void {
  client.on(Events.MessageCreate, (message) => {
    void handle(message).catch((err) => {
      console.error("[intake] failed", err);
      void message.react("⚠️").catch(() => {});
    });
  });
}

async function handle(message: Msg): Promise<void> {
  // Our own replies would otherwise be filed as new items.
  if (message.author.id === client.user?.id) return;
  if (!isIntakeChannel(message.channelId)) return;

  const { content, forwarded, attachments } = flatten(message);
  if (!content && !forwarded && attachments.length === 0) return;

  // A gateway redelivery or a restart mid-handle must not create a second row.
  if (await findBySourceMessage(message.id)) return;

  await message.react("⏳").catch(() => {});

  const { extraction, parsedBy, model } = await classify({
    content,
    forwardedFrom: forwarded,
    attachments,
    author: message.author.username,
    channelName: channelName(message),
  });

  const item = await createItem(
    extraction,
    {
      guildId: message.guildId,
      channelId: message.channelId,
      messageId: message.id,
      author: message.author.username,
      url: message.url,
      raw: [content, forwarded].filter(Boolean).join("\n\n"),
    },
    { parsedBy, model },
  );

  await message.reactions.cache.get("⏳")?.users.remove(client.user!.id).catch(() => {});
  await message.react(parsedBy === "rule" ? "❓" : "✅").catch(() => {});

  await message.reply({
    embeds: [itemEmbed(item)],
    components: itemComponents(item),
    allowedMentions: { repliedUser: false },
  });
}

/**
 * Discord forwards arrive as message snapshots with the visible message empty,
 * and integrations like Frame.io put everything in embeds. Pull text out of all
 * three so the classifier sees what a human sees.
 */
function flatten(message: Msg): {
  content: string;
  forwarded: string;
  attachments: string[];
} {
  const content = [message.content, ...embedText(message)].filter(Boolean).join("\n");

  const snapshots = [...(message.messageSnapshots?.values() ?? [])];
  const forwarded = snapshots
    .map((snap) => {
      const embeds = (snap.embeds ?? [])
        .map((e) => [e.title, e.description, e.url].filter(Boolean).join(" — "))
        .filter(Boolean);
      const files = [...(snap.attachments?.values() ?? [])].map((a) => a.url);
      return [snap.content, ...embeds, ...files].filter(Boolean).join("\n");
    })
    .filter(Boolean)
    .join("\n\n");

  const attachments = [...message.attachments.values()].map(
    (a) => `${a.name ?? "file"} (${a.url})`,
  );

  return { content: content.trim(), forwarded: forwarded.trim(), attachments };
}

function embedText(message: Msg): string[] {
  return message.embeds.flatMap((embed) => {
    const parts = [embed.title, embed.description, embed.url];
    for (const field of embed.fields ?? []) parts.push(`${field.name}: ${field.value}`);
    return parts.filter((p): p is string => Boolean(p));
  });
}

function channelName(message: Msg): string {
  const channel = message.channel;
  return channel && "name" in channel && channel.name ? channel.name : "dm";
}
