import {
  Events,
  MessageFlags,
  type ButtonInteraction,
  type StringSelectMenuInteraction,
} from "discord.js";
import { client } from "./client.js";
import { lane } from "../lanes.js";
import { updateItem, type Item } from "../db/items.js";
import { itemComponents, itemEmbed } from "./render.js";

/**
 * The buttons and lane picker attached to every intake confirmation. Correcting
 * the bot has to be one click, or the corrections never happen.
 */
export function registerInteractions(): void {
  client.on(Events.InteractionCreate, (interaction) => {
    if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;

    void handle(interaction).catch(async (err) => {
      console.error("[interaction] failed", err);
      if (!interaction.replied && !interaction.deferred) {
        await interaction
          .reply({ content: "That failed — check the logs.", flags: MessageFlags.Ephemeral })
          .catch(() => {});
      }
    });
  });
}

async function handle(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
): Promise<void> {
  const [action, rawId] = interaction.customId.split(":");
  if (!action || !rawId) return;

  const actor = interaction.user.username;
  let updated: Item | null = null;

  if (action === "done") {
    updated = await updateItem(rawId, { status: "done" }, actor);
  } else if (action === "p1") {
    updated = await updateItem(rawId, { priority: 1 }, actor);
  } else if (action === "lane" && interaction.isStringSelectMenu()) {
    const chosen = interaction.values[0];
    if (!chosen) return;
    updated = await updateItem(rawId, { lane: chosen }, actor);
  } else {
    return;
  }

  if (!updated) {
    await interaction.reply({ content: `Item #${rawId} is gone.`, flags: MessageFlags.Ephemeral });
    return;
  }

  // Re-render in place so the message always reflects the current row.
  await interaction.update({
    embeds: [itemEmbed(updated)],
    components: updated.status === "done" ? [] : itemComponents(updated),
    content:
      updated.status === "done"
        ? `Closed by ${actor}.`
        : action === "lane"
          ? `Moved to ${lane(updated.lane).label} by ${actor}.`
          : `Bumped to P1 by ${actor}.`,
  });
}
