import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type APIEmbedField,
  type MessageActionRowComponentBuilder,
} from "discord.js";
import { CATEGORIES } from "../catalog.js";
import { renderBothZones, type DerivedRecord } from "../parse/derive.js";

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

  if (record.airDate) fields.push({ name: "Airs", value: record.airDate, inline: true });
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
    const suffix = record.voSource === "calculated" ? "  *(air date − 6 days)*" : "";
    fields.push({ name: `VO due — ${record.voSource}`, value: `${org}\n${team}${suffix}` });
  } else if (record.kind === "assignment") {
    fields.push({ name: "VO due", value: "— *no air date to work from*" });
  }

  if (record.deadline) fields.push({ name: "Deadline", value: stamp(record.deadline) });

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
 * Two buttons, because the fastest way to improve the parser is to catch it
 * being wrong at the moment it happens. "Got it wrong" writes an eval case.
 */
export function feedbackRow(messageId: string): ActionRowBuilder<MessageActionRowComponentBuilder> {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`ok:${messageId}`)
      .setLabel("Right")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`bad:${messageId}`)
      .setLabel("Got it wrong")
      .setStyle(ButtonStyle.Danger),
  );
}
