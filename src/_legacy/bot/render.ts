import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  type APIEmbedField,
  type MessageActionRowComponentBuilder,
} from "discord.js";
import { env } from "../env.js";
import { LANES, lane, laneColorInt } from "../lanes.js";
import type { Item } from "../db/items.js";
import { prettyTime, prettyDate } from "../time.js";

const PRIORITY_LABEL: Record<number, string> = {
  1: "P1 · drop everything",
  2: "P2 · today",
  3: "P3 · normal",
  4: "P4 · soon",
  5: "P5 · whenever",
};

export function itemUrl(item: Item): string | null {
  return env.publicUrl ? `${env.publicUrl}/#item-${item.id}` : null;
}

/** Discord renders <t:unix:f> in each viewer's own timezone. */
function stamp(d: Date): string {
  return `<t:${Math.floor(d.getTime() / 1000)}:f>`;
}

export function itemEmbed(item: Item): EmbedBuilder {
  const l = lane(item.lane);
  const fields: APIEmbedField[] = [
    { name: "Lane", value: l.label, inline: true },
    { name: "Type", value: item.kind, inline: true },
    { name: "Priority", value: PRIORITY_LABEL[item.priority] ?? `P${item.priority}`, inline: true },
  ];

  if (item.project) fields.push({ name: "Project", value: item.project, inline: true });
  if (item.due_at) fields.push({ name: "Due", value: stamp(item.due_at), inline: true });
  if (item.vo_needed) {
    fields.push({
      name: "VO",
      value: item.vo_due_at ? `needed by ${stamp(item.vo_due_at)}` : "needed — no time given",
      inline: true,
    });
  }
  if (item.links.length) {
    fields.push({
      name: "Links",
      value: item.links
        .slice(0, 6)
        .map((link) => `[${link.label || link.kind}](${link.url})`)
        .join(" · "),
    });
  }

  const embed = new EmbedBuilder()
    .setColor(laneColorInt(item.lane))
    .setTitle(item.title)
    .addFields(fields)
    .setFooter({
      text:
        `#${item.id}` +
        (item.parsed_by === "rule" ? " · unparsed, needs a lane" : "") +
        (item.confidence > 0 && item.confidence < 0.6 ? " · low confidence" : ""),
    });

  if (item.summary) embed.setDescription(item.summary);

  const url = itemUrl(item);
  if (url) embed.setURL(url);

  return embed;
}

export function itemComponents(
  item: Item,
): ActionRowBuilder<MessageActionRowComponentBuilder>[] {
  const laneSelect = new StringSelectMenuBuilder()
    .setCustomId(`lane:${item.id}`)
    .setPlaceholder(`Lane: ${lane(item.lane).label}`)
    .addOptions(
      LANES.map((l) => ({
        label: l.label,
        value: l.id,
        default: l.id === item.lane,
      })),
    );

  const buttons = [
    new ButtonBuilder()
      .setCustomId(`done:${item.id}`)
      .setLabel("Done")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`p1:${item.id}`)
      .setLabel("Make it P1")
      .setStyle(ButtonStyle.Danger),
  ];

  const url = itemUrl(item);
  if (url) {
    buttons.push(
      new ButtonBuilder().setLabel("Open board").setStyle(ButtonStyle.Link).setURL(url),
    );
  }

  return [
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(laneSelect),
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(...buttons),
  ];
}

/** One compact line per item, used by /today and the daily digest. */
export function itemLine(item: Item, index?: number): string {
  const bullet = index === undefined ? "•" : `**${index + 1}.**`;
  const bits: string[] = [];

  if (item.vo_needed) {
    bits.push(item.vo_due_at ? `VO by ${prettyTime(item.vo_due_at)}` : "VO needed");
  }
  if (item.due_at) bits.push(`due ${prettyDate(item.due_at)} ${prettyTime(item.due_at)}`);
  if (item.project) bits.push(item.project);

  const frameio = item.links.find((l) => l.kind === "frameio");
  const suffix = frameio ? ` · [review](${frameio.url})` : "";
  const meta = bits.length ? `\n　　${bits.join(" · ")}` : "";

  return `${bullet} \`P${item.priority}\` ${item.title}${suffix}${meta}`;
}
