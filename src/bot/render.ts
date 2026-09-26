import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  type APIEmbedField,
  type MessageActionRowComponentBuilder,
} from "discord.js";
import { CATEGORIES, CHANNELS } from "../catalog.js";
import { VO_BUFFER_DAYS, relativeDay, renderBothZones, usDate, type DerivedRecord } from "../parse/derive.js";

const UNSORTED = "#8b8b8b";

function colorInt(categoryId: string): number {
  const hex = CATEGORIES.find((c) => c.id === categoryId)?.color ?? UNSORTED;
  return parseInt(hex.slice(1), 16);
}

function categoryLabel(categoryId: string): string {
  return CATEGORIES.find((c) => c.id === categoryId)?.label ?? "Unsorted";
}

/** Discord renders <t:unix:f> in each viewer's own timezone. */
function stamp(d: Date): string {
  return `<t:${Math.floor(d.getTime() / 1000)}:f>`;
}

/**
 * What the bot understood, laid out so a wrong field is obvious at a glance.
 * While we're tuning the parser this card is the product — it is how you see
 * what it read without opening the board.
 */
export function recordEmbed(record: DerivedRecord): EmbedBuilder {
  const fields: APIEmbedField[] = [
    { name: "Kind", value: record.kind, inline: true },
    { name: "Category", value: categoryLabel(record.category), inline: true },
    { name: "Channel", value: record.channel ?? "— *not named*", inline: true },
  ];

  if (record.airDate) {
    fields.push({ name: "Airs", value: `${usDate(record.airDate)} · ${relativeDay(record.airDate)}`, inline: true });
  }
  if (record.stage) fields.push({ name: "Stage", value: record.stage, inline: true });
  if (record.wordCount) {
    fields.push({ name: "Words", value: record.wordCount.toLocaleString(), inline: true });
  }
  if (record.tag) fields.push({ name: "Tag", value: record.tag, inline: true });
  if (record.version) fields.push({ name: "Version", value: `v${record.version}`, inline: true });
  if (record.assignee) fields.push({ name: "Assigned", value: record.assignee, inline: true });

  if (record.scriptDue) {
    const { org, team } = renderBothZones(record.scriptDue);
    fields.push({ name: "Script due", value: `${org}\n${team}` });
  }

  if (record.voDue) {
    const { org, team } = renderBothZones(record.voDue);
    const suffix = record.voSource === "calculated" ? `  *(set ${VO_BUFFER_DAYS} days before air)*` : "";
    fields.push({ name: `VO due — ${record.voSource}`, value: `${org}\n${team}${suffix}` });
  } else if (record.kind === "assignment") {
    fields.push({ name: "VO due", value: "— *no air date to work from*" });
  }

  if (record.deadline) {
    const { org, team } = renderBothZones(record.deadline);
    fields.push({ name: "Deadline", value: `${org}\n${team}` });
  }

  if (record.links.length) {
    fields.push({
      name: "Links",
      value: record.links
        .slice(0, 6)
        .map((l) => `[${l.label || l.kind}](${l.url}) \`${l.kind}\``)
        .join(" · "),
    });
  }

  if (record.warnings.length) {
    fields.push({ name: "⚠ Warnings", value: record.warnings.map((w) => `• ${w}`).join("\n") });
  }

  const embed = new EmbedBuilder()
    .setColor(colorInt(record.category))
    .setTitle(record.title ?? record.note ?? "(no title)")
    .addFields(fields)
    .setFooter({
      text: [
        record.code ?? "no code",
        `${Math.round(record.confidence * 100)}% sure`,
        record.category === "unknown" ? "needs a category" : "",
      ]
        .filter(Boolean)
        .join("  ·  "),
    });

  if (record.brief) {
    embed.setDescription(
      record.brief.length > 300 ? `${record.brief.slice(0, 297)}…` : record.brief,
    );
  }

  return embed;
}

/**
 * Channels packed into menus of at most 25 options, whole categories at a
 * time. The first menu also carries "No channel", so it holds one fewer.
 */
export function channelGroups(): Array<{ label: string; channels: typeof CHANNELS }> {
  const groups: Array<{ label: string; channels: typeof CHANNELS }> = [];
  let current: { cats: string[]; channels: typeof CHANNELS } = { cats: [], channels: [] };

  for (const cat of CATEGORIES) {
    const inCat = CHANNELS.filter((c) => c.category === cat.id);
    const room = (groups.length === 0 ? 24 : 25) - current.channels.length;
    if (inCat.length > room && current.channels.length) {
      groups.push({ label: current.cats.join(", "), channels: current.channels });
      current = { cats: [], channels: [] };
    }
    current.cats.push(cat.label);
    current.channels = [...current.channels, ...inCat];
  }
  if (current.channels.length) groups.push({ label: current.cats.join(", "), channels: current.channels });
  return groups;
}

/**
 * The controls under a card.
 *
 * A wrong channel used to mean sending a file to Claude and waiting for a
 * prompt change. Now it is a dropdown: pick the right one and the record is
 * corrected in place, the reply redrawn, and the correction still written out
 * as an eval case so the parser learns from it. The fix and the feedback are
 * the same action.
 *
 * Discord allows five rows and 25 options per menu, which the fifteen channels
 * and four categories sit inside comfortably.
 */
export function cardRows(
  messageId: string,
  record: DerivedRecord,
  saved: boolean,
  marks: { paused?: boolean; noScript?: boolean } = {},
): Array<ActionRowBuilder<MessageActionRowComponentBuilder>> {
  const rows: Array<ActionRowBuilder<MessageActionRowComponentBuilder>> = [];

  // Discord caps a menu at 25 options, and there are more channels than that,
  // so they are split into menus by category — never splitting a category
  // across two menus, so each one reads as a sensible group.
  for (const [i, group] of channelGroups().entries()) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`set-channel:${messageId}:${i}`)
      .setPlaceholder(
        group.channels.some((c) => c.name === record.channel)
          ? `Channel — ${record.channel}`
          : `Set the channel — ${group.label}…`,
      )
      .addOptions(
        ...(i === 0
          ? [
              new StringSelectMenuOptionBuilder()
                .setLabel("No channel")
                .setValue("__none__")
                .setDescription("Leave it unassigned"),
            ]
          : []),
        ...group.channels.map((c) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(c.name)
            .setValue(c.id)
            .setDescription(categoryLabel(c.category))
            .setDefault(c.name === record.channel),
        ),
      );
    rows.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(menu));
  }

  // Only offered when no channel is set: a named channel already decides the
  // category, and two controls that can disagree is worse than one.
  if (!record.channel) {
    const categoryMenu = new StringSelectMenuBuilder()
      .setCustomId(`set-category:${messageId}`)
      .setPlaceholder(`Category — ${categoryLabel(record.category)}`)
      .addOptions(
        ...CATEGORIES.map((c) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(c.label)
            .setValue(c.id)
            .setDefault(c.id === record.category),
        ),
      );
    rows.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(categoryMenu));
  }

  const buttons = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`ok:${messageId}`)
      .setLabel("Right")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`done:${messageId}`)
      .setLabel("Clear")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!saved),
    // The board's ⏸ and no-script marks, for when it's known at intake.
    new ButtonBuilder()
      .setCustomId(`${marks.paused ? "resume" : "pause"}:${messageId}`)
      .setLabel(marks.paused ? "Resume" : "Pause")
      .setStyle(marks.paused ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(!saved),
    new ButtonBuilder()
      .setCustomId(`${marks.noScript ? "script" : "noscript"}:${messageId}`)
      .setLabel(marks.noScript ? "Script in" : "No script")
      .setStyle(marks.noScript ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(!saved),
    new ButtonBuilder()
      .setCustomId(`bad:${messageId}`)
      .setLabel("Still wrong")
      .setStyle(ButtonStyle.Danger),
  );
  rows.push(buttons);

  return rows;
}
