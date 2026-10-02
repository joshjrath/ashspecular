/**
 * Channels added in Settings, and the catalog's own renamed there.
 *
 * A rename is a real one: every row that stored the old name — videos,
 * uploads, the YouTube link, colours, pauses, finance, the Idea Feed, Story
 * Lab's marks, time estimates — moves to the new name in one transaction, so
 * every page shows it and nothing is left behind under the old one. The id
 * never changes (batches and links are keyed by it), and the old name is kept
 * so a Discord message that still uses it finds the channel.
 *
 * The YouTube channel's own title is left alone: it can differ from what the
 * board calls the channel.
 */
import { inTransaction, pool } from "./pool.js";
import {
  CATEGORIES, CATEGORY_IDS, CHANNELS, applyChannelSettings, checkChannelName, isCatalogChannel, newChannelId, type CategoryId, type ChannelSetting,
} from "../catalog.js";

/**
 * Every table that stores a channel's name, and its column. A new table that
 * stores one must be added here (or a rename leaves its rows under the old
 * name); a test reads the migrations and fails until it is.
 */
export const NAME_COLUMNS: ReadonlyArray<[table: string, column: string, unique: boolean]> = [
  ["records", "channel", false],
  ["uploads", "channel", false],
  ["youtube_channels", "channel", true],
  ["channel_colours", "channel", true],
  ["channel_marks", "channel", true],
  ["channel_pauses", "channel", true],
  ["gap_dismissals", "channel", true],
  ["revision_reviews", "channel", false],
  ["post_checks", "channel", true],
  ["missed_posts", "channel", false],
  ["lab_idea_marks", "channel", true],
  ["fin_channel_companies", "channel", true],
  ["fin_channel_periods", "channel", true],
  ["fin_expense_splits", "channel", true],
  ["fin_recurring_splits", "channel", true],
  ["fin_income", "channel", false],
  ["idea_sources", "channel", false],
  ["ideas", "channel", false],
  ["comp_channels", "board_channel", false],
];
/** Tables that keep a list of channel names. */
export const NAME_ARRAYS: ReadonlyArray<[table: string, column: string]> = [
  ["idea_feeds", "channels"],
  ["idea_sources", "channels"],
];

const settingOf = (r: Record<string, unknown>): ChannelSetting => ({
  id: String(r.id),
  name: String(r.name),
  added: Boolean(r.added),
  category: CATEGORY_IDS.includes(r.category as CategoryId) ? (r.category as CategoryId) : null,
  colour: (r.colour as string) ?? null,
  units: r.units === null || r.units === undefined ? null : Number(r.units),
  previous: (r.previous as string[]) ?? [],
});

export async function listChannelSettings(): Promise<ChannelSetting[]> {
  const { rows } = await pool.query("SELECT * FROM channel_settings ORDER BY created_at, id");
  return rows.map(settingOf);
}

/** Something else to refresh when the channels change (colours, caches). */
const listeners: Array<() => void | Promise<void>> = [];
export function onChannelsChanged(fn: () => void | Promise<void>): void {
  listeners.push(fn);
}

let lastSig = "";
/**
 * Apply what's set in the database to the catalog in memory. Cheap enough to
 * run every minute, so a second process (the bot on its own) catches a rename
 * made on the board; the listeners only run when something changed.
 */
export async function loadChannelSettings(): Promise<boolean> {
  const settings = await listChannelSettings();
  const sig = JSON.stringify(settings);
  if (sig === lastSig) return false;
  lastSig = sig;
  applyChannelSettings(settings);
  for (const fn of listeners) await Promise.resolve(fn()).catch((err) => console.error("[channels] refresh failed:", err));
  return true;
}

let syncing = false;
/** Keep every process's channels current: once a minute, plus straight after a change made here. */
export function startChannelSync(): void {
  if (syncing) return;
  syncing = true;
  setInterval(() => {
    void loadChannelSettings()
      .then(async (changed) => {
        // A record filed under an old name in the minute after a rename (by a process that hadn't heard yet) moves too.
        if (changed) await catchUpRenames();
      })
      .catch((err) => console.error("[channels] sync failed:", err));
  }, 60_000).unref();
}

async function catchUpRenames(): Promise<void> {
  const { rows } = await pool.query("SELECT name, previous FROM channel_settings WHERE renamed_at > now() - interval '15 minutes'");
  for (const r of rows) {
    for (const old of (r.previous as string[]) ?? []) {
      await pool.query("UPDATE records SET channel = $2, updated_at = now() WHERE channel = $1", [old, r.name]);
    }
  }
}

/** Move every row from one name to another, inside a transaction. */
async function moveName(client: import("pg").PoolClient, from: string, to: string): Promise<void> {
  for (const [table, column, unique] of NAME_COLUMNS) {
    // Anything already filed under the new name is left over from before: the old name's rows take its place.
    if (unique) await client.query(`DELETE FROM ${table} WHERE ${column} = $1`, [to]);
    await client.query(`UPDATE ${table} SET ${column} = $2 WHERE ${column} = $1`, [from, to]);
  }
  for (const [table, column] of NAME_ARRAYS) {
    await client.query(`UPDATE ${table} SET ${column} = array_replace(${column}, $1, $2) WHERE $1 = ANY(${column})`, [from, to]);
  }
  // A day's batch is titled with its channel's name.
  await client.query("UPDATE records SET title = $2 WHERE channel = $2 AND title = $1", [from, to]);
  // A recurring channel's time estimate is kept under its name.
  await client.query("DELETE FROM work_estimates WHERE key = $1", [`channel:${to}`]);
  await client.query("UPDATE work_estimates SET key = $2 WHERE key = $1", [`channel:${from}`, `channel:${to}`]);
  // Pay models list the channels someone works on.
  await client.query(
    `UPDATE fin_pay_models SET params = jsonb_set(params, '{channels}',
       (SELECT jsonb_agg(CASE WHEN x = $1 THEN $2 ELSE x END) FROM jsonb_array_elements_text(params->'channels') AS x))
     WHERE jsonb_typeof(params->'channels') = 'array' AND params->'channels' ? $1`,
    [from, to],
  );
  await client.query("UPDATE fin_pay_models SET params = jsonb_set(params, '{channel}', to_jsonb($2::text)) WHERE params->>'channel' = $1", [from, to]);
}

/** Give a channel a new name, everywhere. */
export async function renameChannel(id: string, raw: string): Promise<{ ok: true; name: string; from: string } | { error: string }> {
  const channel = CHANNELS.find((c) => c.id === id);
  if (!channel) return { error: "That channel isn't on the board." };
  const checked = checkChannelName(raw, id);
  if ("error" in checked) return checked;
  const from = channel.name;
  const to = checked.name;
  if (from === to) return { ok: true, name: to, from };
  try {
    await inTransaction(async (client) => {
      await moveName(client, from, to);
      const { rows } = await client.query("SELECT previous FROM channel_settings WHERE id = $1", [id]);
      // The names it had, newest last; one it's going back to leaves the list.
      const previous = [...new Set([...((rows[0]?.previous as string[]) ?? []), from])].filter((n) => n.toLowerCase() !== to.toLowerCase());
      if (!rows.length) {
        await client.query("INSERT INTO channel_settings (id, name, added, previous, renamed_at) VALUES ($1, $2, false, $3, now())", [id, to, previous]);
      } else {
        await client.query("UPDATE channel_settings SET name = $2, previous = $3, renamed_at = now(), updated_at = now() WHERE id = $1", [id, to, previous]);
      }
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: /channel_settings_name/.test(msg) ? `There's already a channel called ${to}.` : `Couldn't rename it: ${msg}` };
  }
  await loadChannelSettings();
  return { ok: true, name: to, from };
}

/** Add a channel to a category. Bits and Reading channels open a daily batch of `units` uploads. */
export async function addChannel(input: { name: string; category: string; units: number | null; colour: string }): Promise<{ id: string; name: string } | { error: string }> {
  const category = CATEGORIES.find((c) => c.id === input.category)?.id;
  if (!category) return { error: "Pick a category for it." };
  const checked = checkChannelName(input.name, null);
  if ("error" in checked) return checked;
  const daily = category === "bits" || category === "reading";
  const units = daily && input.units !== null && Number.isFinite(input.units) ? Math.max(0, Math.min(50, Math.round(input.units))) : null;
  const colour = /^#[0-9a-f]{6}$/i.test(input.colour) ? input.colour.toUpperCase() : null;
  const id = newChannelId(checked.name);
  try {
    await pool.query("INSERT INTO channel_settings (id, name, added, category, colour, units) VALUES ($1, $2, true, $3, $4, $5)", [id, checked.name, category, colour, units || null]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: /channel_settings_name/.test(msg) ? `There's already a channel called ${checked.name}.` : `Couldn't add it: ${msg}` };
  }
  await loadChannelSettings();
  return { id, name: checked.name };
}

/** How much a channel has on the board: an added one with none of it can be taken off again. */
export async function channelUse(name: string): Promise<{ records: number; uploads: number }> {
  const { rows } = await pool.query(
    "SELECT (SELECT COUNT(*) FROM records WHERE channel = $1) AS records, (SELECT COUNT(*) FROM uploads WHERE channel = $1) AS uploads",
    [name],
  );
  return { records: Number(rows[0].records), uploads: Number(rows[0].uploads) };
}

/** Take an added channel off again — only while nothing's been filed under it. */
export async function removeChannel(id: string): Promise<{ ok: true } | { error: string }> {
  const channel = CHANNELS.find((c) => c.id === id);
  if (!channel || isCatalogChannel(id)) return { error: "Only a channel added here can be taken off." };
  const use = await channelUse(channel.name);
  if (use.records || use.uploads) return { error: `${channel.name} has ${use.records + use.uploads} videos on the board, so it stays. Rename it instead.` };
  await pool.query("DELETE FROM channel_settings WHERE id = $1", [id]);
  await pool.query("DELETE FROM youtube_channels WHERE channel = $1", [channel.name]);
  await pool.query("DELETE FROM channel_colours WHERE channel = $1", [channel.name]);
  await loadChannelSettings();
  return { ok: true };
}
