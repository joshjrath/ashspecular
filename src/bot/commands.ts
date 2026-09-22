import {
  EmbedBuilder,
  Events,
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { env } from "../env.js";
import { client } from "./client.js";
import { LANES, lane, laneColorInt } from "../lanes.js";
import {
  getItem,
  listItems,
  updateItem,
  type Status,
  STATUSES,
} from "../db/items.js";
import { buildDigest, postDigest } from "./digest.js";
import { itemEmbed, itemComponents, itemLine } from "./render.js";
import { parseLocalWhen, prettyDate } from "../time.js";

const laneChoices = LANES.map((l) => ({ name: l.label, value: l.id }));

export const commands = [
  new SlashCommandBuilder()
    .setName("today")
    .setDescription("Show today's top priorities without waiting for the morning digest"),

  new SlashCommandBuilder()
    .setName("board")
    .setDescription("Open items, newest first")
    .addStringOption((o) =>
      o.setName("lane").setDescription("Limit to one side of the business").addChoices(...laneChoices),
    )
    .addStringOption((o) =>
      o.setName("status").setDescription("Default: everything still open")
        .addChoices(...STATUSES.map((s) => ({ name: s, value: s }))),
    ),

  new SlashCommandBuilder()
    .setName("find")
    .setDescription("Search filed items")
    .addStringOption((o) =>
      o.setName("query").setDescription("Title, project, or anything in the original message").setRequired(true),
    ),

  new SlashCommandBuilder()
    .setName("item")
    .setDescription("Show one item with its controls")
    .addIntegerOption((o) => o.setName("id").setDescription("Item number").setRequired(true)),

  new SlashCommandBuilder()
    .setName("done")
    .setDescription("Mark an item done")
    .addIntegerOption((o) => o.setName("id").setDescription("Item number").setRequired(true)),

  new SlashCommandBuilder()
    .setName("prio")
    .setDescription("Set an item's priority")
    .addIntegerOption((o) => o.setName("id").setDescription("Item number").setRequired(true))
    .addIntegerOption((o) =>
      o.setName("level").setDescription("1 = drop everything, 5 = whenever").setRequired(true).setMinValue(1).setMaxValue(5),
    ),

  new SlashCommandBuilder()
    .setName("vo")
    .setDescription("Set when the voiceover is needed by")
    .addIntegerOption((o) => o.setName("id").setDescription("Item number").setRequired(true))
    .addStringOption((o) =>
      o.setName("when").setDescription('e.g. "3pm", "15:30", "tomorrow 9am"').setRequired(true),
    ),

  new SlashCommandBuilder()
    .setName("lane")
    .setDescription("Move an item to a different side of the business")
    .addIntegerOption((o) => o.setName("id").setDescription("Item number").setRequired(true))
    .addStringOption((o) =>
      o.setName("lane").setDescription("Where it belongs").setRequired(true).addChoices(...laneChoices),
    ),

  new SlashCommandBuilder()
    .setName("digest")
    .setDescription("Post the daily digest into the digest channel now"),
].map((c) => c.toJSON());

export function registerCommands(): void {
  client.on(Events.InteractionCreate, (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    void run(interaction).catch(async (err) => {
      console.error("[command] failed", err);
      const body = { content: "That failed — check the logs.", flags: MessageFlags.Ephemeral as const };
      if (interaction.deferred || interaction.replied) await interaction.followUp(body).catch(() => {});
      else await interaction.reply(body).catch(() => {});
    });
  });
}

/** Pushes the command list to Discord. Global commands can take a minute to appear. */
export async function publishCommands(): Promise<void> {
  const app = client.application;
  if (!app) throw new Error("client.application is not ready");
  await app.commands.set(commands);
  console.log(`[bot] published ${commands.length} slash commands`);
}

async function run(interaction: ChatInputCommandInteraction): Promise<void> {
  switch (interaction.commandName) {
    case "today":
      return today(interaction);
    case "board":
      return board(interaction);
    case "find":
      return find(interaction);
    case "item":
      return showItem(interaction);
    case "done":
      return setDone(interaction);
    case "prio":
      return setPrio(interaction);
    case "vo":
      return setVo(interaction);
    case "lane":
      return setLane(interaction);
    case "digest":
      return forceDigest(interaction);
    default:
      await interaction.reply({ content: "Unknown command.", flags: MessageFlags.Ephemeral });
  }
}

async function today(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();
  const built = await buildDigest();
  if (!built) {
    await interaction.editReply("Nothing open in Long Form right now.");
    return;
  }
  await interaction.editReply({ embeds: [built.embed] });
}

async function board(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const laneId = interaction.options.getString("lane");
  const status = interaction.options.getString("status") as Status | null;

  const items = await listItems({
    lanes: laneId ? [laneId] : undefined,
    statuses: status ? [status] : undefined,
    limit: 15,
  });

  if (items.length === 0) {
    await interaction.editReply("Nothing matches that.");
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(laneColorInt(laneId ?? "unknown"))
    .setTitle(`${laneId ? lane(laneId).label : "All lanes"} — ${items.length} open`)
    .setDescription(items.map((i) => `\`#${i.id}\` ${itemLine(i)}`).join("\n\n").slice(0, 4000));

  if (env.publicUrl) embed.setURL(env.publicUrl);
  await interaction.editReply({ embeds: [embed] });
}

async function find(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const query = interaction.options.getString("query", true);
  const items = await listItems({ search: query, statuses: STATUSES, limit: 10 });

  if (items.length === 0) {
    await interaction.editReply(`Nothing found for "${query}".`);
    return;
  }
  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setTitle(`${items.length} match${items.length === 1 ? "" : "es"} for "${query}"`)
        .setDescription(items.map((i) => `\`#${i.id}\` ${itemLine(i)}`).join("\n\n").slice(0, 4000)),
    ],
  });
}

async function showItem(interaction: ChatInputCommandInteraction): Promise<void> {
  const id = interaction.options.getInteger("id", true);
  const item = await getItem(id);
  if (!item) {
    await interaction.reply({ content: `No item #${id}.`, flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.reply({ embeds: [itemEmbed(item)], components: itemComponents(item) });
}

async function setDone(interaction: ChatInputCommandInteraction): Promise<void> {
  const id = interaction.options.getInteger("id", true);
  const item = await updateItem(id, { status: "done" }, interaction.user.username);
  await interaction.reply({
    content: item ? `Closed **#${item.id}** — ${item.title}` : `No item #${id}.`,
    flags: MessageFlags.Ephemeral,
  });
}

async function setPrio(interaction: ChatInputCommandInteraction): Promise<void> {
  const id = interaction.options.getInteger("id", true);
  const level = interaction.options.getInteger("level", true);
  const item = await updateItem(id, { priority: level }, interaction.user.username);
  await interaction.reply({
    content: item ? `**#${item.id}** is now P${level}.` : `No item #${id}.`,
    flags: MessageFlags.Ephemeral,
  });
}

async function setVo(interaction: ChatInputCommandInteraction): Promise<void> {
  const id = interaction.options.getInteger("id", true);
  const when = interaction.options.getString("when", true);
  const at = parseLocalWhen(when);

  if (!at) {
    await interaction.reply({
      content: `Couldn't read "${when}". Try \`3pm\`, \`15:30\`, or \`tomorrow 9am\`.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const item = await updateItem(
    id,
    { vo_needed: true, vo_due_at: at },
    interaction.user.username,
  );
  await interaction.reply(
    item
      ? `**#${item.id}** — VO needed by <t:${Math.floor(at.getTime() / 1000)}:f> (${prettyDate(at)})`
      : `No item #${id}.`,
  );
}

async function setLane(interaction: ChatInputCommandInteraction): Promise<void> {
  const id = interaction.options.getInteger("id", true);
  const laneId = interaction.options.getString("lane", true);
  const item = await updateItem(id, { lane: laneId }, interaction.user.username);
  await interaction.reply({
    content: item ? `**#${item.id}** moved to ${lane(laneId).label}.` : `No item #${id}.`,
    flags: MessageFlags.Ephemeral,
  });
}

async function forceDigest(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const posted = await postDigest(true);
  await interaction.editReply(
    posted ? "Posted." : "Nothing to post (or DIGEST_CHANNEL_ID is unset).",
  );
}
